"""
API key management endpoints (admin only).

Keys are stored as SHA-256 hashes — the raw key is shown only once
at creation time. This follows the same pattern as GitHub PATs.
"""

import hashlib
import secrets
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.database import get_pool

router = APIRouter(prefix="/api/v1/admin/api-keys", tags=["API Keys"])


class KeyCreateRequest(BaseModel):
    owner_email: str
    tier: str = "free"


class KeyCreateResponse(BaseModel):
    id: str
    raw_key: str
    owner_email: str
    tier: str
    message: str


@router.post("/", response_model=KeyCreateResponse, status_code=201)
async def issue_api_key(body: KeyCreateRequest):
    """
    Generate a new API key. The raw key is returned only once.
    Store it securely — it cannot be retrieved again.
    """
    if body.tier not in ("free", "premium"):
        raise HTTPException(status_code=400, detail="Tier must be 'free' or 'premium'")

    # Generate a random key with a recognizable prefix
    raw_key = f"ce_{secrets.token_hex(24)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO api_keys (key_hash, owner_email, tier)
        VALUES ($1, $2, $3)
        RETURNING id
        """,
        key_hash,
        body.owner_email,
        body.tier,
    )

    return KeyCreateResponse(
        id=str(row["id"]),
        raw_key=raw_key,
        owner_email=body.owner_email,
        tier=body.tier,
        message="Store this key securely. It will not be shown again.",
    )


@router.get("/")
async def list_api_keys(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List all API keys (hashes only, not raw keys)."""
    pool = await get_pool()
    import math

    total = await pool.fetchval("SELECT COUNT(*) FROM api_keys")
    offset = (page - 1) * per_page

    rows = await pool.fetch(
        """
        SELECT id, key_hash, owner_email, tier, requests_today,
               requests_reset_at, created_at, is_active
        FROM api_keys
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        """,
        per_page,
        offset,
    )

    items = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        # Show only the first/last 4 chars of the hash for identification
        d["key_hash"] = f"{d['key_hash'][:4]}...{d['key_hash'][-4:]}"
        d["created_at"] = d["created_at"].isoformat()
        if d.get("requests_reset_at"):
            d["requests_reset_at"] = d["requests_reset_at"].isoformat()
        items.append(d)

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if per_page > 0 else 0,
    }


@router.delete("/{key_id}")
async def revoke_api_key(key_id: UUID):
    """Deactivate an API key. It will immediately stop working."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE api_keys SET is_active = FALSE WHERE id = $1 RETURNING id",
        key_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "revoked", "key_id": str(key_id)}


@router.post("/{key_id}/reactivate")
async def reactivate_api_key(key_id: UUID):
    """Reactivate a previously revoked API key."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE api_keys SET is_active = TRUE WHERE id = $1 RETURNING id",
        key_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "active", "key_id": str(key_id)}
