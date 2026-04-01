import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.crud import create_entity, get_entity, update_entity, soft_delete_entity
from app.models.violations import ViolationCreate, ViolationUpdate, ViolationResponse
from app.models.base import VerificationTier
from app.database import get_pool

import math

router = APIRouter(prefix="/api/v1/violations", tags=["Violations"])

TABLE = "violations"
COLUMNS = [
    "violation_type", "issuing_authority", "violation_date",
    "description", "targets", "verification_tier", "sources",
]


def _parse_row(row: dict) -> dict:
    if isinstance(row.get("sources"), str):
        row["sources"] = json.loads(row["sources"])
    row.pop("deleted_at", None)
    return row


@router.post("/", response_model=ViolationResponse, status_code=201)
async def create_violation(body: ViolationCreate):
    data = body.model_dump()
    row = await create_entity(TABLE, COLUMNS, data)
    return _parse_row(row)


@router.get("/")
async def list_violations(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    verification_tier: VerificationTier | None = None,
    search: str | None = None,
):
    """
    Violations do not have a tsvector column, so search uses
    ILIKE against the description field instead.
    """
    pool = await get_pool()

    conditions = ["deleted_at IS NULL"]
    params: list = []
    idx = 1

    if verification_tier:
        conditions.append(f"verification_tier = ${idx}")
        params.append(verification_tier)
        idx += 1

    if search:
        conditions.append(f"description ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    where = " AND ".join(conditions)

    count_params = list(params)
    total = await pool.fetchval(f"SELECT COUNT(*) FROM {TABLE} WHERE {where}", *count_params)

    offset = (page - 1) * per_page
    params.extend([per_page, offset])
    rows = await pool.fetch(
        f"SELECT * FROM {TABLE} WHERE {where} ORDER BY violation_date DESC NULLS LAST LIMIT ${idx} OFFSET ${idx+1}",
        *params,
    )

    return {
        "items": [_parse_row(dict(r)) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if per_page > 0 else 0,
    }


@router.get("/{entity_id}", response_model=ViolationResponse)
async def get_violation(entity_id: UUID):
    row = await get_entity(TABLE, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Violation not found")
    return _parse_row(row)


@router.put("/{entity_id}", response_model=ViolationResponse)
async def update_violation(entity_id: UUID, body: ViolationUpdate):
    data = body.model_dump(exclude_unset=True)
    row = await update_entity(TABLE, COLUMNS, entity_id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Violation not found")
    return _parse_row(row)


@router.delete("/{entity_id}", status_code=204)
async def delete_violation(entity_id: UUID):
    deleted = await soft_delete_entity(TABLE, entity_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Violation not found")
