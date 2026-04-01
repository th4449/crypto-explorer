"""
Migration: Sync all existing relational entities into the Apache AGE graph.

Run this once after applying 001_entity_tables.sql if there is existing
data in the relational tables that has not yet been synced to the graph.

Usage:
    cd backend
    python -m database.migrations.backfill_graph
"""

import asyncio
import os
import sys

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://app_user:localdevpassword@localhost:5432/crypto_explorer",
)

ENTITY_TABLES = {
    "companies": {"type": "company", "name_col": "name"},
    "people": {"type": "person", "name_col": "name"},
    "wallets": {"type": "wallet", "name_col": "label"},
    "banks": {"type": "bank", "name_col": "name"},
    "violations": {"type": "violation", "name_col": "description"},
}


def _escape(value: str) -> str:
    if value is None:
        return ""
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


async def main():
    print(f"Connecting to {DATABASE_URL}")
    conn = await asyncpg.connect(DATABASE_URL)

    total = 0

    for table, meta in ENTITY_TABLES.items():
        rows = await conn.fetch(
            f"SELECT id, {meta['name_col']}, verification_tier "
            f"FROM {table} WHERE deleted_at IS NULL"
        )

        for row in rows:
            eid = _escape(str(row["id"]))
            name = _escape(row[meta["name_col"]] or f"(unnamed {meta['type']})")
            etype = _escape(meta["type"])
            etier = _escape(row["verification_tier"])

            cypher = (
                f"MERGE (n:Entity {{id: '{eid}'}}) "
                f"SET n.name = '{name}', "
                f"n.entity_type = '{etype}', "
                f"n.verification_tier = '{etier}' "
                f"RETURN n"
            )

            await conn.execute(
                "SET search_path = ag_catalog, '$user', public"
            )
            await conn.execute(
                f"SELECT * FROM cypher('crypto_graph', $$ {cypher} $$) as (v agtype)"
            )

        count = len(rows)
        total += count
        print(f"  {table}: {count} vertices synced")

    print(f"Done. {total} total vertices in the graph.")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
