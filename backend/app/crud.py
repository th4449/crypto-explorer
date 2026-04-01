"""
Shared CRUD operations for all entity types.

Each entity router calls these functions with its table name,
column list, and Pydantic models. This avoids duplicating the
same SQL patterns across five router files.
"""

import json
import math
from uuid import UUID

import asyncpg

from app.database import get_pool
from app.services.graph import upsert_vertex, remove_vertex, ENTITY_TABLES


async def create_entity(table: str, columns: list[str], data: dict) -> dict:
    """Insert a new row and return it."""
    pool = await get_pool()

    # Convert sources list to JSON string for storage
    if "sources" in data and data["sources"] is not None:
        data["sources"] = json.dumps(
            [s.model_dump() if hasattr(s, "model_dump") else s for s in data["sources"]]
        )

    # Convert lists of UUIDs to a PostgreSQL array literal
    if "targets" in data and data["targets"] is not None:
        data["targets"] = data["targets"]
    if "aliases" in data and data["aliases"] is not None:
        data["aliases"] = data["aliases"]

    # Build the INSERT statement dynamically from the provided columns
    cols = [c for c in columns if c in data and data[c] is not None]
    placeholders = [f"${i+1}" for i in range(len(cols))]
    values = [data[c] for c in cols]

    query = f"""
        INSERT INTO {table} ({', '.join(cols)})
        VALUES ({', '.join(placeholders)})
        RETURNING *
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *values)

        # Sync the new entity into the graph as a vertex
        result = dict(row)
        meta = ENTITY_TABLES.get(table)
        if meta:
            name = result.get(meta["name_col"]) or f"(unnamed {meta['type']})"
            await upsert_vertex(
                conn,
                entity_id=str(result["id"]),
                name=name,
                entity_type=meta["type"],
                verification_tier=result["verification_tier"],
            )

    return result


async def get_entity(table: str, entity_id: UUID) -> dict | None:
    """Fetch a single non-deleted entity by ID."""
    pool = await get_pool()
    query = f"SELECT * FROM {table} WHERE id = $1 AND deleted_at IS NULL"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, entity_id)
    return dict(row) if row else None


async def list_entities(
    table: str,
    page: int = 1,
    per_page: int = 20,
    verification_tier: str | None = None,
    search: str | None = None,
) -> dict:
    """
    List entities with pagination, optional verification tier filter,
    and optional full-text search. Returns a dict with items, total,
    page, per_page, and pages.
    """
    pool = await get_pool()

    conditions = ["deleted_at IS NULL"]
    params: list = []
    param_idx = 1

    if verification_tier:
        conditions.append(f"verification_tier = ${param_idx}")
        params.append(verification_tier)
        param_idx += 1

    if search:
        # Use plainto_tsquery for safe parsing of user input
        conditions.append(f"search_vector @@ plainto_tsquery('english', ${param_idx})")
        params.append(search)
        param_idx += 1

    where = " AND ".join(conditions)

    # Get total count for pagination
    count_query = f"SELECT COUNT(*) FROM {table} WHERE {where}"

    # Build the data query with ordering and pagination
    if search:
        # Rank by search relevance when a search term is provided
        order = f"ts_rank(search_vector, plainto_tsquery('english', ${param_idx})) DESC"
        params.append(search)
        param_idx += 1
    else:
        order = "created_at DESC"

    offset = (page - 1) * per_page
    data_query = f"""
        SELECT * FROM {table}
        WHERE {where}
        ORDER BY {order}
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """
    params.extend([per_page, offset])

    async with pool.acquire() as conn:
        # Run count with only the filter params (not limit/offset/extra search)
        count_params = params[: (2 if verification_tier and search else 1 if (verification_tier or search) else 0)]
        total = await conn.fetchval(count_query, *count_params)
        rows = await conn.fetch(data_query, *params)

    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if per_page > 0 else 0,
    }


async def update_entity(table: str, columns: list[str], entity_id: UUID, data: dict) -> dict | None:
    """Update non-None fields on an existing entity."""
    pool = await get_pool()

    if "sources" in data and data["sources"] is not None:
        data["sources"] = json.dumps(
            [s.model_dump() if hasattr(s, "model_dump") else s for s in data["sources"]]
        )

    # Only update fields that were explicitly provided (not None)
    update_cols = [c for c in columns if c in data and data[c] is not None]
    if not update_cols:
        return await get_entity(table, entity_id)

    set_clauses = [f"{col} = ${i+1}" for i, col in enumerate(update_cols)]
    values = [data[col] for col in update_cols]
    values.append(entity_id)

    query = f"""
        UPDATE {table}
        SET {', '.join(set_clauses)}
        WHERE id = ${len(values)} AND deleted_at IS NULL
        RETURNING *
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *values)

    if not row:
        return None

    # Sync updated properties to the graph vertex
    result = dict(row)
    meta = ENTITY_TABLES.get(table)
    if meta:
        async with pool.acquire() as conn:
            name = result.get(meta["name_col"]) or f"(unnamed {meta['type']})"
            await upsert_vertex(
                conn,
                entity_id=str(result["id"]),
                name=name,
                entity_type=meta["type"],
                verification_tier=result["verification_tier"],
            )

    return result


async def soft_delete_entity(table: str, entity_id: UUID) -> bool:
    """Set deleted_at timestamp and remove the vertex from the graph."""
    pool = await get_pool()
    query = f"""
        UPDATE {table}
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, entity_id)
        if row:
            await remove_vertex(conn, str(entity_id))
    return row is not None
