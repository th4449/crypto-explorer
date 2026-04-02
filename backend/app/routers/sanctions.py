from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.database import get_pool
from app.services.sanctions import (
    check_entity,
    get_cached_match,
    entity_type_to_schema,
    entity_to_properties,
)

router = APIRouter(prefix="/api/v1/sanctions", tags=["Sanctions"])

# Map entity_type slugs to table names
ENTITY_TABLES = {
    "companies": "companies",
    "people": "people",
    "wallets": "wallets",
    "banks": "banks",
    "violations": "violations",
}

NAME_COLUMNS = {
    "companies": "name",
    "people": "name",
    "wallets": "label",
    "banks": "name",
    "violations": "description",
}


@router.get("/check/{entity_type}/{entity_id}")
async def get_sanctions_status(entity_type: str, entity_id: UUID):
    """
    Return the cached sanctions match for an entity.
    If no cached result exists, trigger a live check.
    """
    if entity_type not in ENTITY_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")

    # Check cache first
    cached = await get_cached_match(entity_id, entity_type)
    if cached:
        return cached

    # No cache — fetch the entity and run a live check
    pool = await get_pool()
    table = ENTITY_TABLES[entity_type]
    name_col = NAME_COLUMNS[entity_type]

    row = await pool.fetchrow(
        f"SELECT * FROM {table} WHERE id = $1 AND deleted_at IS NULL",
        entity_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    entity_data = dict(row)
    name = entity_data.get(name_col, "") or ""

    result = await check_entity(
        entity_id=entity_id,
        entity_type=entity_type,
        name=name,
        schema=entity_type_to_schema(entity_type),
        properties=entity_to_properties(entity_type, entity_data),
    )

    return result


@router.post("/recheck/{entity_type}/{entity_id}")
async def recheck_sanctions(entity_type: str, entity_id: UUID):
    """Force a fresh sanctions check, bypassing the cache."""
    if entity_type not in ENTITY_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")

    pool = await get_pool()
    table = ENTITY_TABLES[entity_type]
    name_col = NAME_COLUMNS[entity_type]

    row = await pool.fetchrow(
        f"SELECT * FROM {table} WHERE id = $1 AND deleted_at IS NULL",
        entity_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    entity_data = dict(row)
    name = entity_data.get(name_col, "") or ""

    result = await check_entity(
        entity_id=entity_id,
        entity_type=entity_type,
        name=name,
        schema=entity_type_to_schema(entity_type),
        properties=entity_to_properties(entity_type, entity_data),
    )

    return result
