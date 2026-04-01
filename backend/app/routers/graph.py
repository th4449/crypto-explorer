from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import get_pool
from app.services.graph import sync_all_entities, find_shortest_path, find_neighborhood

router = APIRouter(prefix="/api/v1/graph", tags=["Graph"])


@router.get("/stats")
async def graph_stats():
    """Return the total number of vertices and edges in the graph."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "SET search_path = ag_catalog, '$user', public"
        )
        v_row = await conn.fetchrow(
            "SELECT * FROM cypher('crypto_graph', $$ "
            "MATCH (n:Entity) RETURN count(n) "
            "$$) as (count agtype)"
        )
        e_row = await conn.fetchrow(
            "SELECT * FROM cypher('crypto_graph', $$ "
            "MATCH ()-[r]->() RETURN count(r) "
            "$$) as (count agtype)"
        )
    vertices = int(v_row["count"]) if v_row else 0
    edges = int(e_row["count"]) if e_row else 0
    return {"vertices": vertices, "edges": edges}


@router.post("/sync")
async def sync_graph():
    """Backfill the graph with all existing relational entities."""
    pool = await get_pool()
    counts = await sync_all_entities(pool)
    return {"synced": counts}


@router.get("/shortest-path")
async def shortest_path(
    from_id: UUID = Query(..., alias="from"),
    to_id: UUID = Query(..., alias="to"),
):
    """
    Find the shortest path between two entities in the graph.
    Returns the full path with all intermediate nodes and edges.
    """
    if from_id == to_id:
        raise HTTPException(status_code=400, detail="Source and target must be different entities")

    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await find_shortest_path(conn, str(from_id), str(to_id))

    if not result["found"]:
        raise HTTPException(status_code=404, detail="No path found between these entities")

    return result


@router.get("/neighborhood/{entity_id}")
async def neighborhood(
    entity_id: UUID,
    depth: int = Query(2, ge=1, le=5),
):
    """
    Return all entities within N hops of a given entity,
    along with the connecting edges. Depth is clamped to 1-5.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await find_neighborhood(conn, str(entity_id), depth)

    if not result["nodes"]:
        raise HTTPException(status_code=404, detail="Entity not found in graph")

    return result
