from fastapi import APIRouter

from app.database import get_pool
from app.services.graph import sync_all_entities

router = APIRouter(prefix="/api/v1/graph", tags=["Graph"])


@router.get("/stats")
async def graph_stats():
    """Return the total number of vertices in the graph."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "SET search_path = ag_catalog, '$user', public"
        )
        row = await conn.fetchrow(
            "SELECT * FROM cypher('crypto_graph', $$ "
            "MATCH (n:Entity) RETURN count(n) "
            "$$) as (count agtype)"
        )
    count = int(row["count"]) if row else 0
    return {"vertices": count}


@router.post("/sync")
async def sync_graph():
    """Backfill the graph with all existing relational entities."""
    pool = await get_pool()
    counts = await sync_all_entities(pool)
    return {"synced": counts}
