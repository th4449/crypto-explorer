import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.crud import create_entity, get_entity, list_entities, update_entity, soft_delete_entity
from app.models.companies import CompanyCreate, CompanyUpdate, CompanyResponse
from app.models.base import VerificationTier

router = APIRouter(prefix="/api/v1/companies", tags=["Companies"])

TABLE = "companies"
COLUMNS = [
    "name", "jurisdiction", "registration_id", "entity_subtype",
    "status", "website", "telegram_handle", "description",
    "verification_tier", "sources",
]


def _parse_row(row: dict) -> dict:
    """Ensure sources comes back as a parsed list, not a raw string."""
    if isinstance(row.get("sources"), str):
        row["sources"] = json.loads(row["sources"])
    # Drop internal fields the response model does not expect
    row.pop("search_vector", None)
    row.pop("deleted_at", None)
    return row


@router.post("/", response_model=CompanyResponse, status_code=201)
async def create_company(body: CompanyCreate):
    data = body.model_dump()
    row = await create_entity(TABLE, COLUMNS, data)
    return _parse_row(row)


@router.get("/")
async def list_companies(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    verification_tier: VerificationTier | None = None,
    search: str | None = None,
):
    result = await list_entities(TABLE, page, per_page, verification_tier, search)
    result["items"] = [_parse_row(r) for r in result["items"]]
    return result


@router.get("/{entity_id}", response_model=CompanyResponse)
async def get_company(entity_id: UUID):
    row = await get_entity(TABLE, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    return _parse_row(row)


@router.put("/{entity_id}", response_model=CompanyResponse)
async def update_company(entity_id: UUID, body: CompanyUpdate):
    data = body.model_dump(exclude_unset=True)
    row = await update_entity(TABLE, COLUMNS, entity_id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    return _parse_row(row)


@router.delete("/{entity_id}", status_code=204)
async def delete_company(entity_id: UUID):
    deleted = await soft_delete_entity(TABLE, entity_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Company not found")
