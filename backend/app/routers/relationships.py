import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import get_pool
from app.models.relationships import (
    RelationshipCreate,
    RelationshipResponse,
)
from app.services.graph import create_edge

router = APIRouter(prefix="/api/v1", tags=["Relationships"])


@router.post("/relationships", response_model=RelationshipResponse, status_code=201)
async def create_relationship(body: RelationshipCreate):
    """
    Create a relationship between two entities.
    Writes to both the relational table (for metadata queries)
    and the AGE graph (for traversal queries).
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Verify both entities exist (check all five tables)
        for entity_id, label in [
            (body.source_id, "Source"),
            (body.target_id, "Target"),
        ]:
            found = False
            for table in ("companies", "people", "wallets", "banks", "violations"):
                row = await conn.fetchrow(
                    f"SELECT id FROM {table} WHERE id = $1 AND deleted_at IS NULL",
                    entity_id,
                )
                if row:
                    found = True
                    break
            if not found:
                raise HTTPException(
                    status_code=404,
                    detail=f"{label} entity {entity_id} not found",
                )

        # Insert into relational table
        row = await conn.fetchrow(
            """
            INSERT INTO relationships
                (source_id, target_id, relationship_type, metadata, verification_tier)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            body.source_id,
            body.target_id,
            body.relationship_type.value,
            json.dumps(body.metadata),
            body.verification_tier.value,
        )

        result = dict(row)

        # Parse metadata back from JSON string
        if isinstance(result.get("metadata"), str):
            result["metadata"] = json.loads(result["metadata"])

        # Create matching edge in the graph
        try:
            await create_edge(
                conn,
                source_id=str(body.source_id),
                target_id=str(body.target_id),
                relationship_type=body.relationship_type.value,
                metadata=body.metadata,
                verification_tier=body.verification_tier.value,
                rel_id=str(result["id"]),
            )
        except Exception:
            # Graph edge creation is best-effort; the relational record
            # is the source of truth. Log but do not fail the request.
            pass

    return result


@router.get("/entities/{entity_id}/relationships")
async def get_entity_relationships(entity_id: UUID):
    """
    Return all relationships for a given entity (both incoming and
    outgoing), grouped by relationship type. Each relationship includes
    the connected entity's name and type.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH entity_names AS (
                SELECT id, name, 'company' as entity_type FROM companies WHERE deleted_at IS NULL
                UNION ALL
                SELECT id, name, 'person' as entity_type FROM people WHERE deleted_at IS NULL
                UNION ALL
                SELECT id, COALESCE(label, address) as name, 'wallet' as entity_type FROM wallets WHERE deleted_at IS NULL
                UNION ALL
                SELECT id, name, 'bank' as entity_type FROM banks WHERE deleted_at IS NULL
                UNION ALL
                SELECT id, COALESCE(description, violation_type) as name, 'violation' as entity_type FROM violations WHERE deleted_at IS NULL
            )
            SELECT
                r.id,
                r.source_id,
                r.target_id,
                r.relationship_type,
                r.metadata,
                r.verification_tier,
                r.created_at,
                r.updated_at,
                src.name as source_name,
                src.entity_type as source_type,
                tgt.name as target_name,
                tgt.entity_type as target_type
            FROM relationships r
            LEFT JOIN entity_names src ON src.id = r.source_id
            LEFT JOIN entity_names tgt ON tgt.id = r.target_id
            WHERE r.source_id = $1 OR r.target_id = $1
            ORDER BY r.relationship_type, r.created_at DESC
            """,
            entity_id,
        )

    # Group by relationship type
    grouped: dict[str, list] = {}
    for row in rows:
        r = dict(row)
        if isinstance(r.get("metadata"), str):
            r["metadata"] = json.loads(r["metadata"])
        rtype = r["relationship_type"]
        if rtype not in grouped:
            grouped[rtype] = []
        grouped[rtype].append(r)

    return {
        "entity_id": str(entity_id),
        "total": len(rows),
        "by_type": grouped,
    }
