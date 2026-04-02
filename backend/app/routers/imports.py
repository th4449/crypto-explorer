import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_pool
from app.services.graph import upsert_vertex, ENTITY_TABLES

router = APIRouter(prefix="/api/v1/import", tags=["Import"])


class ImportRequest(BaseModel):
    items: list[dict]


class ImportResult(BaseModel):
    imported: int
    failed: int
    errors: list[dict]


# Column definitions per entity type (mirrors the migration schema)
ENTITY_COLUMNS: dict[str, list[str]] = {
    "companies": [
        "name", "jurisdiction", "registration_id", "entity_subtype",
        "status", "website", "telegram_handle", "description",
        "verification_tier", "sources",
    ],
    "people": [
        "name", "aliases", "nationality", "role_title",
        "sanctions_status", "pep_status", "description",
        "verification_tier", "sources",
    ],
    "wallets": [
        "address", "blockchain", "label", "cluster_id",
        "first_seen", "last_seen", "total_volume",
        "verification_tier", "sources",
    ],
    "banks": [
        "name", "swift_code", "jurisdiction", "sanctions_status",
        "role", "description", "verification_tier", "sources",
    ],
    "violations": [
        "violation_type", "issuing_authority", "violation_date",
        "description", "targets", "verification_tier", "sources",
    ],
}


@router.post("/{entity_type}", response_model=ImportResult)
async def batch_import(entity_type: str, body: ImportRequest):
    """
    Import an array of entities in a single transaction.
    Returns counts of successful imports and a list of row-level errors.
    """
    if entity_type not in ENTITY_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")

    columns = ENTITY_COLUMNS[entity_type]
    meta = ENTITY_TABLES.get(entity_type)
    pool = await get_pool()

    imported = 0
    failed = 0
    errors: list[dict] = []

    async with pool.acquire() as conn:
        # Run the entire import inside a transaction
        async with conn.transaction():
            for idx, row_data in enumerate(body.items):
                try:
                    # Normalize boolean strings from CSV
                    for key in ("sanctions_status", "pep_status"):
                        if key in row_data and isinstance(row_data[key], str):
                            row_data[key] = row_data[key].lower() in ("true", "yes", "1")

                    # Normalize aliases from comma-separated string
                    if "aliases" in row_data and isinstance(row_data["aliases"], str):
                        row_data["aliases"] = [
                            a.strip() for a in row_data["aliases"].split(",") if a.strip()
                        ]

                    # Convert sources string to JSON
                    if "sources" in row_data:
                        if isinstance(row_data["sources"], str):
                            try:
                                row_data["sources"] = json.dumps(json.loads(row_data["sources"]))
                            except json.JSONDecodeError:
                                row_data["sources"] = "[]"
                        elif isinstance(row_data["sources"], list):
                            row_data["sources"] = json.dumps(row_data["sources"])

                    # Default verification tier
                    if not row_data.get("verification_tier"):
                        row_data["verification_tier"] = "unverified"

                    # Build parameterized INSERT
                    cols = [c for c in columns if c in row_data and row_data[c] not in (None, "")]
                    placeholders = [f"${i+1}" for i in range(len(cols))]
                    values = [row_data[c] for c in cols]

                    query = (
                        f"INSERT INTO {entity_type} ({', '.join(cols)}) "
                        f"VALUES ({', '.join(placeholders)}) "
                        f"RETURNING *"
                    )
                    result = await conn.fetchrow(query, *values)
                    result_dict = dict(result)

                    # Sync to graph
                    if meta:
                        name = result_dict.get(meta["name_col"]) or f"(unnamed {meta['type']})"
                        await upsert_vertex(
                            conn,
                            entity_id=str(result_dict["id"]),
                            name=name,
                            entity_type=meta["type"],
                            verification_tier=result_dict["verification_tier"],
                        )

                    imported += 1

                except Exception as e:
                    failed += 1
                    errors.append({"row": idx, "error": str(e)})

    return ImportResult(imported=imported, failed=failed, errors=errors)
