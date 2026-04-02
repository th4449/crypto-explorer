"""
OpenSanctions integration service.

Checks entities against the OpenSanctions /match API endpoint.
Results are cached in the sanctions_matches table.

The project has an API key limited to 2,000 requests per month,
so checks are performed only on entity create/update and cached
indefinitely until the next check.
"""

import json
import os
from datetime import datetime, timezone
from uuid import UUID

import httpx

from app.database import get_pool

OPENSANCTIONS_API_KEY = os.getenv("OPENSANCTIONS_API_KEY", "")
OPENSANCTIONS_BASE = "https://api.opensanctions.org"


async def check_entity(
    entity_id: UUID,
    entity_type: str,
    name: str,
    schema: str = "Thing",
    properties: dict | None = None,
) -> dict:
    """
    Check a single entity against OpenSanctions.

    schema should be one of: Person, Company, Organization, LegalEntity, Thing
    properties can include extra identifiers like nationality, birthDate, etc.

    Returns a dict with match_score, opensanctions_id, and match_data.
    """
    if not OPENSANCTIONS_API_KEY:
        return {
            "match_score": 0,
            "opensanctions_id": None,
            "match_data": {},
            "error": "OPENSANCTIONS_API_KEY not configured",
        }

    if not name or not name.strip():
        return {
            "match_score": 0,
            "opensanctions_id": None,
            "match_data": {},
        }

    # Build the match request payload
    payload: dict = {
        "schema": schema,
        "properties": {
            "name": [name],
        },
    }

    # Add any extra identifiers
    if properties:
        for key, value in properties.items():
            if value:
                if isinstance(value, list):
                    payload["properties"][key] = value
                else:
                    payload["properties"][key] = [str(value)]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{OPENSANCTIONS_BASE}/match/default",
                json=payload,
                headers={
                    "Authorization": f"ApiKey {OPENSANCTIONS_API_KEY}",
                    "Content-Type": "application/json",
                },
            )

            if resp.status_code != 200:
                return {
                    "match_score": 0,
                    "opensanctions_id": None,
                    "match_data": {},
                    "error": f"API returned {resp.status_code}",
                }

            data = resp.json()
            results = data.get("responses", {}).get("entity", {}).get("results", [])

            if not results:
                # No match found — store as clean
                result = {
                    "match_score": 0,
                    "opensanctions_id": None,
                    "match_data": {"status": "no_match", "query_name": name},
                }
            else:
                # Take the highest-scoring match
                best = max(results, key=lambda r: r.get("score", 0))
                result = {
                    "match_score": round(best.get("score", 0), 3),
                    "opensanctions_id": best.get("id", ""),
                    "match_data": {
                        "caption": best.get("caption", ""),
                        "schema": best.get("schema", ""),
                        "datasets": best.get("datasets", []),
                        "properties": {
                            k: v for k, v in best.get("properties", {}).items()
                            if k in ("name", "country", "topics", "sanctions", "idNumber", "birthDate")
                        },
                        "query_name": name,
                        "total_results": len(results),
                    },
                }

    except Exception as e:
        return {
            "match_score": 0,
            "opensanctions_id": None,
            "match_data": {"error": str(e)},
        }

    # Store the result
    await store_match(entity_id, entity_type, result)
    return result


async def store_match(entity_id: UUID, entity_type: str, result: dict) -> None:
    """Upsert a sanctions match result into the cache table."""
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO sanctions_matches
                    (entity_id, entity_type, opensanctions_id, match_score, match_data, checked_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (entity_id, entity_type) DO UPDATE
                SET opensanctions_id = $3,
                    match_score = $4,
                    match_data = $5,
                    checked_at = NOW()
                """,
                entity_id,
                entity_type,
                result.get("opensanctions_id"),
                result.get("match_score", 0),
                json.dumps(result.get("match_data", {})),
            )
    except Exception:
        pass


async def get_cached_match(entity_id: UUID, entity_type: str) -> dict | None:
    """Return cached sanctions match if available."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT opensanctions_id, match_score, match_data, checked_at
        FROM sanctions_matches
        WHERE entity_id = $1 AND entity_type = $2
        """,
        entity_id,
        entity_type,
    )
    if not row:
        return None

    match_data = row["match_data"]
    if isinstance(match_data, str):
        match_data = json.loads(match_data)

    return {
        "match_score": float(row["match_score"]),
        "opensanctions_id": row["opensanctions_id"],
        "match_data": match_data,
        "checked_at": row["checked_at"].isoformat(),
    }


def entity_type_to_schema(entity_type: str) -> str:
    """Map our entity types to OpenSanctions FtM schema names."""
    mapping = {
        "companies": "Company",
        "people": "Person",
        "banks": "Company",
        "wallets": "Thing",
        "violations": "Thing",
    }
    return mapping.get(entity_type, "Thing")


def entity_to_properties(entity_type: str, entity_data: dict) -> dict:
    """Extract extra matching properties from the entity record."""
    props: dict = {}

    if entity_type == "people":
        if entity_data.get("nationality"):
            props["nationality"] = entity_data["nationality"]
        if entity_data.get("aliases"):
            props["alias"] = entity_data["aliases"]

    if entity_type in ("companies", "banks"):
        if entity_data.get("jurisdiction"):
            props["jurisdiction"] = entity_data["jurisdiction"]
        if entity_data.get("registration_id"):
            props["registrationNumber"] = entity_data["registration_id"]

    return props
