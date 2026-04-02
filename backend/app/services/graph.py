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
    """
    Escape a value for safe interpolation into a Cypher string literal.
    Handles single quotes, backslashes, null bytes, and control characters.
    Truncates to 1000 chars to prevent oversized queries.
    """
    if value is None:
        return ""
    s = str(value)
    # Remove null bytes and control characters
    s = "".join(ch for ch in s if ord(ch) >= 32 or ch in ("\n", "\t"))
    # Escape backslashes first, then single quotes
    s = s.replace("\\", "\\\\").replace("'", "\\'")
    # Truncate to prevent oversized Cypher literals
    return s[:1000]


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


# ------------------------------------------------------------------ #
# Edge (relationship) operations
# ------------------------------------------------------------------ #

async def create_edge(
    conn: asyncpg.Connection,
    source_id: str,
    target_id: str,
    relationship_type: str,
    metadata: dict,
    verification_tier: str,
    rel_id: str,
) -> None:
    """
    Create a directed edge between two vertices in the graph.
    The edge carries the relationship type as its label and stores
    metadata, verification_tier, and the relational table id as properties.
    """
    sid = _escape(source_id)
    tid = _escape(target_id)
    rtype = _escape(relationship_type)
    tier = _escape(verification_tier)
    rid = _escape(rel_id)
    meta_str = _escape(str(metadata).replace("'", "\\'") if metadata else "{}")

    cypher = (
        f"MATCH (a:Entity {{id: '{sid}'}}), (b:Entity {{id: '{tid}'}}) "
        f"CREATE (a)-[r:{rtype} {{"
        f"rel_id: '{rid}', "
        f"verification_tier: '{tier}', "
        f"metadata: '{meta_str}'"
        f"}}]->(b) "
        f"RETURN r"
    )
    await _exec_cypher(conn, cypher)


async def find_shortest_path(
    conn: asyncpg.Connection,
    from_id: str,
    to_id: str,
) -> dict:
    """
    Find the shortest undirected path between two entities.
    Returns nodes and edges along the path.
    """
    fid = _escape(from_id)
    tid = _escape(to_id)

    await conn.execute("SET search_path = ag_catalog, '$user', public")

    # shortestPath only works with a variable-length relationship pattern
    query = (
        "SELECT * FROM cypher('crypto_graph', $$ "
        f"MATCH p = shortestPath((a:Entity {{id: '{fid}'}})-[*]-(b:Entity {{id: '{tid}'}})) "
        "RETURN p "
        "$$) as (p agtype)"
    )

    try:
        row = await conn.fetchrow(query)
    except Exception:
        return {"found": False, "length": 0, "nodes": [], "edges": []}

    if not row or row["p"] is None:
        return {"found": False, "length": 0, "nodes": [], "edges": []}

    # Parse the AGE path result
    return _parse_path(str(row["p"]))


async def find_neighborhood(
    conn: asyncpg.Connection,
    entity_id: str,
    depth: int = 2,
) -> dict:
    """
    Return all entities within N hops of a given entity,
    along with the connecting edges.
    """
    eid = _escape(entity_id)
    # Clamp depth to prevent runaway queries
    depth = min(max(depth, 1), 5)

    await conn.execute("SET search_path = ag_catalog, '$user', public")

    node_query = (
        "SELECT * FROM cypher('crypto_graph', $$ "
        f"MATCH (start:Entity {{id: '{eid}'}})-[*1..{depth}]-(neighbor:Entity) "
        "RETURN DISTINCT neighbor "
        "$$) as (n agtype)"
    )

    edge_query = (
        "SELECT * FROM cypher('crypto_graph', $$ "
        f"MATCH (start:Entity {{id: '{eid}'}})-[r*1..{depth}]-(neighbor:Entity) "
        "UNWIND r as edge "
        "RETURN DISTINCT edge "
        "$$) as (e agtype)"
    )

    nodes = []
    edges = []

    try:
        # Get the center node itself
        center_row = await conn.fetchrow(
            "SELECT * FROM cypher('crypto_graph', $$ "
            f"MATCH (n:Entity {{id: '{eid}'}}) RETURN n "
            "$$) as (n agtype)"
        )
        if center_row:
            nodes.append(_parse_vertex(str(center_row["n"])))

        # Get neighboring nodes
        neighbor_rows = await conn.fetch(node_query)
        for r in neighbor_rows:
            parsed = _parse_vertex(str(r["n"]))
            if parsed and parsed["id"] not in [n["id"] for n in nodes]:
                nodes.append(parsed)

        # Get edges
        edge_rows = await conn.fetch(edge_query)
        for r in edge_rows:
            parsed = _parse_edge(str(r["e"]))
            if parsed:
                edges.append(parsed)

    except Exception:
        # Return whatever we have so far
        pass

    return {
        "center_id": entity_id,
        "depth": depth,
        "nodes": nodes,
        "edges": edges,
    }


# ------------------------------------------------------------------ #
# AGE result parsers
# ------------------------------------------------------------------ #

def _parse_vertex(agtype_str: str) -> dict | None:
    """
    Parse an AGE vertex string like:
    {"id": 844424930131969, "label": "Entity", "properties": {"id": "abc", ...}}::vertex
    """
    import json
    try:
        clean = agtype_str.strip()
        if clean.endswith("::vertex"):
            clean = clean[:-8]
        data = json.loads(clean)
        props = data.get("properties", {})
        return {
            "id": props.get("id", ""),
            "name": props.get("name", ""),
            "entity_type": props.get("entity_type", ""),
            "verification_tier": props.get("verification_tier", ""),
        }
    except Exception:
        return None


def _parse_edge(agtype_str: str) -> dict | None:
    """
    Parse an AGE edge string like:
    {"id": ..., "label": "OWNS", "end_id": ..., "start_id": ..., "properties": {...}}::edge
    """
    import json
    try:
        clean = agtype_str.strip()
        if clean.endswith("::edge"):
            clean = clean[:-6]
        data = json.loads(clean)
        props = data.get("properties", {})
        return {
            "relationship_type": data.get("label", ""),
            "metadata": props.get("metadata", "{}"),
            "verification_tier": props.get("verification_tier", ""),
            "rel_id": props.get("rel_id", ""),
        }
    except Exception:
        return None


def _parse_path(agtype_str: str) -> dict:
    """
    Parse an AGE path result. Paths alternate between vertices and edges:
    [vertex, edge, vertex, edge, vertex, ...]
    """
    import json
    nodes = []
    edges = []

    try:
        clean = agtype_str.strip()
        if clean.endswith("::path"):
            clean = clean[:-6]
        elements = json.loads(clean)

        for item in elements:
            if isinstance(item, dict):
                if "label" in item and item.get("label") == "Entity":
                    parsed = _parse_vertex(json.dumps(item) + "::vertex")
                    if parsed:
                        nodes.append(parsed)
                elif "start_id" in item:
                    parsed = _parse_edge(json.dumps(item) + "::edge")
                    if parsed:
                        edges.append(parsed)

    except Exception:
        return {"found": False, "length": 0, "nodes": [], "edges": []}

    return {
        "found": len(nodes) > 0,
        "length": len(edges),
        "nodes": nodes,
        "edges": edges,
    }
