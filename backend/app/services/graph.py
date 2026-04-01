"""
Graph synchronization service for Apache AGE.

Keeps the crypto_graph property graph in sync with the relational
entity tables. Every entity gets a vertex with id, name, entity_type,
and verification_tier properties.

AGE Cypher queries are wrapped in SQL and executed through asyncpg.
Parameters are escaped and interpolated into the Cypher string because
AGE does not support PostgreSQL $1/$2 placeholders inside the Cypher
query body.
"""

import asyncpg


def _escape(value: str) -> str:
    """Escape single quotes for safe interpolation into a Cypher string."""
    if value is None:
        return ""
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


async def _exec_cypher(conn: asyncpg.Connection, cypher: str) -> None:
    """
    Run a Cypher query inside the AGE SQL wrapper.
    Sets the search_path first so ag_catalog functions resolve correctly.
    """
    await conn.execute("SET search_path = ag_catalog, '$user', public")
    # The wrapper returns rows typed as agtype; we discard the result.
    await conn.execute(
        f"SELECT * FROM cypher('crypto_graph', $$ {cypher} $$) as (v agtype)"
    )


async def upsert_vertex(
    conn: asyncpg.Connection,
    entity_id: str,
    name: str,
    entity_type: str,
    verification_tier: str,
) -> None:
    """
    Create or update a vertex in the graph for the given entity.

    Uses MERGE to match on the entity id. If the vertex exists its
    properties are updated; if not a new vertex is created.
    """
    eid = _escape(str(entity_id))
    ename = _escape(name)
    etype = _escape(entity_type)
    etier = _escape(verification_tier)

    cypher = (
        f"MERGE (n:Entity {{id: '{eid}'}}) "
        f"SET n.name = '{ename}', "
        f"n.entity_type = '{etype}', "
        f"n.verification_tier = '{etier}' "
        f"RETURN n"
    )
    await _exec_cypher(conn, cypher)


async def remove_vertex(conn: asyncpg.Connection, entity_id: str) -> None:
    """
    Remove a vertex and all its edges from the graph.
    Called on soft-delete so the graph stays consistent.
    """
    eid = _escape(str(entity_id))
    cypher = f"MATCH (n:Entity {{id: '{eid}'}}) DETACH DELETE n RETURN n"

    # DETACH DELETE may return zero rows if the vertex was already gone.
    # Wrap in try/except so a missing vertex does not raise an error.
    try:
        await _exec_cypher(conn, cypher)
    except Exception:
        pass


# ------------------------------------------------------------------ #
# Entity-type mapping used by the bulk sync migration and by the
# CRUD hooks to determine the display name for graph vertices.
# ------------------------------------------------------------------ #

ENTITY_TABLES = {
    "companies": {"type": "company", "name_col": "name"},
    "people": {"type": "person", "name_col": "name"},
    "wallets": {"type": "wallet", "name_col": "label"},
    "banks": {"type": "bank", "name_col": "name"},
    "violations": {"type": "violation", "name_col": "description"},
}


async def sync_all_entities(pool: asyncpg.Pool) -> dict:
    """
    Backfill the graph with vertices for every non-deleted entity
    across all five tables. Returns a count per table.
    """
    counts: dict[str, int] = {}

    async with pool.acquire() as conn:
        for table, meta in ENTITY_TABLES.items():
            rows = await conn.fetch(
                f"SELECT id, {meta['name_col']}, verification_tier "
                f"FROM {table} WHERE deleted_at IS NULL"
            )
            for row in rows:
                name = row[meta["name_col"]] or f"(unnamed {meta['type']})"
                await upsert_vertex(
                    conn,
                    entity_id=str(row["id"]),
                    name=name,
                    entity_type=meta["type"],
                    verification_tier=row["verification_tier"],
                )
            counts[table] = len(rows)

    return counts
