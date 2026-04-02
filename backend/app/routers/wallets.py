import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.crud import create_entity, get_entity, list_entities, update_entity, soft_delete_entity
from app.database import get_pool
from app.models.wallets import WalletCreate, WalletUpdate, WalletResponse
from app.models.base import VerificationTier

router = APIRouter(prefix="/api/v1/wallets", tags=["Wallets"])

TABLE = "wallets"
COLUMNS = [
    "address", "blockchain", "label", "attributed_to",
    "cluster_id", "first_seen", "last_seen", "total_volume",
    "verification_tier", "sources",
]


def _parse_row(row: dict) -> dict:
    if isinstance(row.get("sources"), str):
        row["sources"] = json.loads(row["sources"])
    # Convert Decimal to float for JSON serialization
    if row.get("total_volume") is not None:
        row["total_volume"] = float(row["total_volume"])
    row.pop("search_vector", None)
    row.pop("deleted_at", None)
    return row


@router.post("/", response_model=WalletResponse, status_code=201)
async def create_wallet(body: WalletCreate):
    data = body.model_dump()
    row = await create_entity(TABLE, COLUMNS, data)
    return _parse_row(row)


@router.get("/")
async def list_wallets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    verification_tier: VerificationTier | None = None,
    search: str | None = None,
):
    result = await list_entities(TABLE, page, per_page, verification_tier, search)
    result["items"] = [_parse_row(r) for r in result["items"]]
    return result


@router.get("/{entity_id}", response_model=WalletResponse)
async def get_wallet(entity_id: UUID):
    row = await get_entity(TABLE, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return _parse_row(row)


@router.put("/{entity_id}", response_model=WalletResponse)
async def update_wallet(entity_id: UUID, body: WalletUpdate):
    data = body.model_dump(exclude_unset=True)
    row = await update_entity(TABLE, COLUMNS, entity_id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return _parse_row(row)


@router.delete("/{entity_id}", status_code=204)
async def delete_wallet(entity_id: UUID):
    deleted = await soft_delete_entity(TABLE, entity_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Wallet not found")


@router.get("/{entity_id}/enrichment")
async def get_wallet_enrichment(entity_id: UUID):
    """
    Fetch blockchain activity for a wallet. Returns cached data if
    fresh (within 24 hours), otherwise fetches live from Blockscout/Etherscan.
    """
    from app.services.blockchain import enrich_wallet

    row = await get_entity(TABLE, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Wallet not found")

    data = await enrich_wallet(
        wallet_id=entity_id,
        address=row["address"],
        blockchain=row.get("blockchain", "ethereum"),
    )
    return data


@router.post("/refresh-verified")
async def refresh_verified():
    """Admin endpoint: refresh blockchain data for all verified wallets."""
    from app.services.blockchain import refresh_verified_wallets
    result = await refresh_verified_wallets()
    return result


@router.delete("/{entity_id}/enrichment-cache", status_code=204)
async def expire_cache(entity_id: UUID):
    """Admin endpoint: manually expire the cache for a wallet."""
    pool = await get_pool()
    await pool.execute(
        "DELETE FROM wallet_enrichment WHERE wallet_id = $1", entity_id
    )

