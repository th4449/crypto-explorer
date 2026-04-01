import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.crud import create_entity, get_entity, list_entities, update_entity, soft_delete_entity
from app.models.banks import BankCreate, BankUpdate, BankResponse
from app.models.base import VerificationTier

router = APIRouter(prefix="/api/v1/banks", tags=["Banks"])

TABLE = "banks"
COLUMNS = [
    "name", "swift_code", "jurisdiction", "sanctions_status",
    "role", "description", "verification_tier", "sources",
]


def _parse_row(row: dict) -> dict:
    if isinstance(row.get("sources"), str):
        row["sources"] = json.loads(row["sources"])
    row.pop("search_vector", None)
    row.pop("deleted_at", None)
    return row


@router.post("/", response_model=BankResponse, status_code=201)
async def create_bank(body: BankCreate):
    data = body.model_dump()
    row = await create_entity(TABLE, COLUMNS, data)
    return _parse_row(row)


@router.get("/")
async def list_banks(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    verification_tier: VerificationTier | None = None,
    search: str | None = None,
):
    result = await list_entities(TABLE, page, per_page, verification_tier, search)
    result["items"] = [_parse_row(r) for r in result["items"]]
    return result


@router.get("/{entity_id}", response_model=BankResponse)
async def get_bank(entity_id: UUID):
    row = await get_entity(TABLE, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bank not found")
    return _parse_row(row)


@router.put("/{entity_id}", response_model=BankResponse)
async def update_bank(entity_id: UUID, body: BankUpdate):
    data = body.model_dump(exclude_unset=True)
    row = await update_entity(TABLE, COLUMNS, entity_id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Bank not found")
    return _parse_row(row)


@router.delete("/{entity_id}", status_code=204)
async def delete_bank(entity_id: UUID):
    deleted = await soft_delete_entity(TABLE, entity_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Bank not found")
