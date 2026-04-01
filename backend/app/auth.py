"""
Authentication middleware for the FastAPI backend.

Validates NextAuth session tokens on POST, PUT, and DELETE requests.
GET requests remain public.

The middleware reads the session token from either:
- The next-auth.session-token cookie (set by NextAuth in the browser)
- The Authorization: Bearer <token> header (for programmatic access)

It then looks up the token in the sessions table to verify it is valid
and not expired.
"""

from datetime import datetime, timezone
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import get_pool


# Endpoints that are always public regardless of method
PUBLIC_PATHS = {
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}

# Methods that require authentication
WRITE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        # Allow all GET/HEAD/OPTIONS requests through
        if method not in WRITE_METHODS:
            return await call_next(request)

        # Allow public paths
        if path in PUBLIC_PATHS:
            return await call_next(request)

        # Allow the NextAuth API routes (they handle their own auth)
        if "/api/auth/" in path:
            return await call_next(request)

        # Allow the OTC review submission (public, rate-limited separately)
        if "/otc-exchanges/" in path and path.endswith("/reviews"):
            return await call_next(request)

        # Extract session token
        token = None

        # Check Authorization header first
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

        # Fall back to the NextAuth session cookie
        if not token:
            # NextAuth uses different cookie names in dev vs production
            token = (
                request.cookies.get("next-auth.session-token")
                or request.cookies.get("__Secure-next-auth.session-token")
            )

        if not token:
            raise HTTPException(
                status_code=401,
                detail="Authentication required. Sign in at /login.",
            )

        # Validate the session token against the database
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT s.user_id, s.expires, u.email, u.role
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.session_token = $1
                """,
                token,
            )

        if not row:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired session.",
            )

        # Check expiry
        if row["expires"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please sign in again.",
            )

        # Attach user info to request state for use in endpoints
        request.state.user_id = str(row["user_id"])
        request.state.user_email = row["email"]
        request.state.user_role = row["role"]

        return await call_next(request)
