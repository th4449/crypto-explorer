"""
API rate limiting middleware.

Enforces request limits on all /api/v1/ endpoints:
- No API key: 100 requests/day per IP (anonymous free tier)
- Free API key: 100 requests/day
- Premium API key: 10,000 requests/day

Rate limit headers are added to every response.
Returns 429 Too Many Requests with Retry-After when exceeded.
"""

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import get_pool

TIER_LIMITS = {
    "anonymous": 100,
    "free": 100,
    "premium": 10_000,
}

# Paths exempt from rate limiting
EXEMPT_PATHS = {
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(f"rate-{ip}".encode()).hexdigest()[:20]


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only rate-limit /api/v1/ endpoints
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        # Skip exempt paths
        if path in EXEMPT_PATHS:
            return await call_next(request)

        pool = await get_pool()
        now = datetime.now(timezone.utc)

        api_key_header = request.headers.get("X-API-Key", "").strip()

        if api_key_header:
            # Key-based rate limiting
            key_hash = hashlib.sha256(api_key_header.encode()).hexdigest()

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT id, tier, requests_today, requests_reset_at, is_active "
                    "FROM api_keys WHERE key_hash = $1",
                    key_hash,
                )

                if not row or not row["is_active"]:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Invalid or inactive API key."},
                    )

                tier = row["tier"]
                limit = TIER_LIMITS.get(tier, 100)
                reset_at = row["requests_reset_at"]

                # Reset counter if past the reset time
                if reset_at and now >= reset_at.replace(tzinfo=timezone.utc):
                    await conn.execute(
                        "UPDATE api_keys SET requests_today = 0, "
                        "requests_reset_at = $2 WHERE id = $1",
                        row["id"],
                        now + timedelta(days=1),
                    )
                    requests_used = 0
                    reset_at = now + timedelta(days=1)
                else:
                    requests_used = row["requests_today"]

                remaining = max(0, limit - requests_used)

                if requests_used >= limit:
                    retry_after = int((reset_at.replace(tzinfo=timezone.utc) - now).total_seconds())
                    return JSONResponse(
                        status_code=429,
                        content={"detail": f"Rate limit exceeded. {tier.title()} tier allows {limit} requests/day."},
                        headers={
                            "Retry-After": str(max(1, retry_after)),
                            "X-RateLimit-Limit": str(limit),
                            "X-RateLimit-Remaining": "0",
                            "X-RateLimit-Reset": reset_at.isoformat() if reset_at else "",
                        },
                    )

                # Increment counter
                await conn.execute(
                    "UPDATE api_keys SET requests_today = requests_today + 1 WHERE id = $1",
                    row["id"],
                )

            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining - 1)
            response.headers["X-RateLimit-Reset"] = reset_at.isoformat() if reset_at else ""
            return response

        else:
            # IP-based anonymous rate limiting
            client_ip = request.client.host if request.client else "unknown"
            ip_hash = _hash_ip(client_ip)
            limit = TIER_LIMITS["anonymous"]

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT requests_today, reset_at FROM ip_rate_limits WHERE ip_hash = $1",
                    ip_hash,
                )

                if row:
                    reset_at = row["reset_at"]
                    if reset_at and now >= reset_at.replace(tzinfo=timezone.utc):
                        # Reset
                        await conn.execute(
                            "UPDATE ip_rate_limits SET requests_today = 1, reset_at = $2 WHERE ip_hash = $1",
                            ip_hash,
                            now + timedelta(days=1),
                        )
                        requests_used = 0
                        reset_at = now + timedelta(days=1)
                    else:
                        requests_used = row["requests_today"]

                        if requests_used >= limit:
                            retry_after = int((reset_at.replace(tzinfo=timezone.utc) - now).total_seconds())
                            return JSONResponse(
                                status_code=429,
                                content={"detail": f"Rate limit exceeded. Anonymous access allows {limit} requests/day. Get an API key for higher limits."},
                                headers={
                                    "Retry-After": str(max(1, retry_after)),
                                    "X-RateLimit-Limit": str(limit),
                                    "X-RateLimit-Remaining": "0",
                                    "X-RateLimit-Reset": reset_at.isoformat() if reset_at else "",
                                },
                            )

                        await conn.execute(
                            "UPDATE ip_rate_limits SET requests_today = requests_today + 1 WHERE ip_hash = $1",
                            ip_hash,
                        )
                else:
                    # First request from this IP
                    reset_at = now + timedelta(days=1)
                    await conn.execute(
                        "INSERT INTO ip_rate_limits (ip_hash, requests_today, reset_at) VALUES ($1, 1, $2) "
                        "ON CONFLICT (ip_hash) DO UPDATE SET requests_today = ip_rate_limits.requests_today + 1",
                        ip_hash,
                        reset_at,
                    )
                    requests_used = 0

                remaining = max(0, limit - requests_used - 1)

            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = reset_at.isoformat() if reset_at else ""
            return response
