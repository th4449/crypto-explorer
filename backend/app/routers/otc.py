"""
OTC Exchange Rating API.

Public endpoints for listing exchanges and submitting reviews.
Admin endpoints for moderation with two-approval requirement.
Review submissions are rate-limited by IP (3 per day, no auth required).
"""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from app.database import get_pool
from app.models.otc import (
    OTCExchangeCreate,
    OTCExchangeResponse,
    ReviewSubmit,
    ReviewResponse,
    ModerationAction,
)

router = APIRouter(tags=["OTC Exchanges"])


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def _hash_ip(ip: str) -> str:
    """One-way hash of the IP address for rate limiting and reviewer identity."""
    return hashlib.sha256(f"otc-salt-{ip}".encode()).hexdigest()[:16]


async def _recalculate_rating(pool, exchange_id: UUID) -> None:
    """Recalculate average_rating and total_reviews from approved reviews."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COALESCE(AVG(rating), 0) as avg_rating,
                COUNT(*) as total
            FROM reviews
            WHERE exchange_id = $1 AND status = 'approved'
            """,
            exchange_id,
        )
        await conn.execute(
            """
            UPDATE otc_exchanges
            SET average_rating = $2, total_reviews = $3, updated_at = NOW()
            WHERE id = $1
            """,
            exchange_id,
            float(row["avg_rating"]),
            int(row["total"]),
        )


def _parse_row(row) -> dict:
    r = dict(row)
    if isinstance(r.get("approvals"), str):
        r["approvals"] = json.loads(r["approvals"])
    if r.get("average_rating") is not None:
        r["average_rating"] = float(r["average_rating"])
    return r


# ------------------------------------------------------------------ #
# Public endpoints
# ------------------------------------------------------------------ #

@router.get("/api/v1/otc-exchanges", response_model=list[OTCExchangeResponse])
async def list_exchanges():
    """List all active OTC exchanges sorted by rating (highest first)."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT * FROM otc_exchanges
        WHERE is_active = TRUE
        ORDER BY average_rating DESC, total_reviews DESC
        """
    )
    return [_parse_row(r) for r in rows]


@router.get("/api/v1/otc-exchanges/{exchange_id}")
async def get_exchange(exchange_id: UUID):
    """Get a single exchange with its approved reviews."""
    pool = await get_pool()

    exchange = await pool.fetchrow(
        "SELECT * FROM otc_exchanges WHERE id = $1", exchange_id
    )
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    reviews = await pool.fetch(
        """
        SELECT rating, review_text, submitted_at
        FROM reviews
        WHERE exchange_id = $1 AND status = 'approved'
        ORDER BY submitted_at DESC
        """,
        exchange_id,
    )

    result = _parse_row(exchange)
    result["reviews"] = [dict(r) for r in reviews]
    return result


@router.post("/api/v1/otc-exchanges/{exchange_id}/reviews", response_model=ReviewResponse, status_code=201)
async def submit_review(exchange_id: UUID, body: ReviewSubmit, request: Request):
    """
    Submit an anonymous review. No authentication required.
    Rate-limited to 3 reviews per IP per day.
    """
    pool = await get_pool()

    # Verify exchange exists
    exchange = await pool.fetchrow(
        "SELECT id FROM otc_exchanges WHERE id = $1 AND is_active = TRUE",
        exchange_id,
    )
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    # Rate limit by IP
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = _hash_ip(client_ip)
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM review_rate_limits
            WHERE ip_hash = $1 AND submitted_at > $2
            """,
            ip_hash,
            cutoff,
        )

        if count >= 3:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Maximum 3 reviews per day.",
            )

        # Record the submission for rate limiting
        await conn.execute(
            "INSERT INTO review_rate_limits (ip_hash) VALUES ($1)",
            ip_hash,
        )

        # Create the review
        row = await conn.fetchrow(
            """
            INSERT INTO reviews (exchange_id, rating, review_text, reviewer_hash, status)
            VALUES ($1, $2, $3, $4, 'pending')
            RETURNING *
            """,
            exchange_id,
            body.rating,
            body.review_text,
            ip_hash,
        )

    return _parse_row(row)


# ------------------------------------------------------------------ #
# Admin endpoints
# ------------------------------------------------------------------ #

@router.post("/api/v1/otc-exchanges", response_model=OTCExchangeResponse, status_code=201)
async def create_exchange(body: OTCExchangeCreate):
    """Create a new OTC exchange (admin only via auth middleware)."""
    pool = await get_pool()

    # Verify company exists if provided
    if body.company_id:
        company = await pool.fetchrow(
            "SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL",
            body.company_id,
        )
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

    row = await pool.fetchrow(
        """
        INSERT INTO otc_exchanges (company_id, name, is_active)
        VALUES ($1, $2, $3)
        RETURNING *
        """,
        body.company_id,
        body.name,
        body.is_active,
    )
    return _parse_row(row)


@router.get("/api/v1/admin/moderation-queue")
async def moderation_queue(
    status: str = Query("pending", pattern="^(pending|approved|rejected)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List reviews in the moderation queue (admin only)."""
    pool = await get_pool()

    offset = (page - 1) * per_page

    total = await pool.fetchval(
        "SELECT COUNT(*) FROM reviews WHERE status = $1", status
    )

    rows = await pool.fetch(
        """
        SELECT r.*, e.name as exchange_name
        FROM reviews r
        JOIN otc_exchanges e ON e.id = r.exchange_id
        WHERE r.status = $1
        ORDER BY r.submitted_at DESC
        LIMIT $2 OFFSET $3
        """,
        status,
        per_page,
        offset,
    )

    import math
    return {
        "items": [_parse_row(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if per_page > 0 else 0,
    }


@router.post("/api/v1/admin/reviews/{review_id}/moderate")
async def moderate_review(review_id: UUID, body: ModerationAction, request: Request):
    """
    Approve or reject a review. A review needs two different admin
    approvals before it is published. Rejecting requires only one admin.
    """
    pool = await get_pool()

    # Get the current user from auth middleware
    user_id = getattr(request.state, "user_id", None)
    user_email = getattr(request.state, "user_email", None)

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    async with pool.acquire() as conn:
        review = await conn.fetchrow(
            "SELECT * FROM reviews WHERE id = $1", review_id
        )
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        review = _parse_row(review)

        if review["status"] == "approved":
            raise HTTPException(status_code=400, detail="Review is already approved")
        if review["status"] == "rejected":
            raise HTTPException(status_code=400, detail="Review was already rejected")

        if body.action == "reject":
            # Rejection is immediate with one admin
            await conn.execute(
                """
                UPDATE reviews
                SET status = 'rejected',
                    moderation_notes = $2,
                    moderated_at = NOW(),
                    moderated_by = $3
                WHERE id = $1
                """,
                review_id,
                body.moderation_notes or "",
                UUID(user_id),
            )
            return {"status": "rejected", "review_id": str(review_id)}

        # Approval flow — needs two different admins
        approvals: list = review.get("approvals", []) or []

        # Check if this admin already approved
        if user_id in approvals:
            raise HTTPException(
                status_code=400,
                detail="You have already approved this review. A second admin must approve it.",
            )

        approvals.append(user_id)

        if len(approvals) >= 2:
            # Two approvals reached — publish the review
            await conn.execute(
                """
                UPDATE reviews
                SET status = 'approved',
                    approvals = $2,
                    moderation_notes = $3,
                    moderated_at = NOW(),
                    moderated_by = $4
                WHERE id = $1
                """,
                review_id,
                json.dumps(approvals),
                body.moderation_notes or "",
                UUID(user_id),
            )

            # Recalculate exchange rating
            await _recalculate_rating(pool, review["exchange_id"])

            return {
                "status": "approved",
                "review_id": str(review_id),
                "message": "Review approved and published (2/2 approvals).",
            }
        else:
            # First approval — still pending
            await conn.execute(
                """
                UPDATE reviews
                SET approvals = $2,
                    moderation_notes = $3
                WHERE id = $1
                """,
                review_id,
                json.dumps(approvals),
                body.moderation_notes or "",
            )

            return {
                "status": "pending",
                "review_id": str(review_id),
                "approvals": len(approvals),
                "message": f"Approval recorded ({len(approvals)}/2). One more admin approval needed.",
            }
