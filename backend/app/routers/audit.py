import json
import math

from fastapi import APIRouter, Query

from app.database import get_pool

router = APIRouter(prefix="/api/v1/admin/audit", tags=["Audit"])


@router.get("/")
async def list_audit_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    entity_type: str | None = None,
    action: str | None = None,
    search: str | None = None,
):
    """
    Paginated audit log with optional filters.
    Search matches against user_email or entity_type.
    """
    pool = await get_pool()

    conditions = []
    params: list = []
    idx = 1

    if entity_type:
        conditions.append(f"entity_type = ${idx}")
        params.append(entity_type)
        idx += 1

    if action:
        conditions.append(f"action = ${idx}")
        params.append(action)
        idx += 1

    if search:
        conditions.append(f"(user_email ILIKE ${idx} OR entity_type ILIKE ${idx})")
        params.append(f"%{search}%")
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"
    count_params = list(params)

    total = await pool.fetchval(
        f"SELECT COUNT(*) FROM audit_log WHERE {where}", *count_params
    )

    offset = (page - 1) * per_page
    params.extend([per_page, offset])

    rows = await pool.fetch(
        f"""
        SELECT * FROM audit_log
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
    )

    items = []
    for row in rows:
        r = dict(row)
        if isinstance(r.get("changes"), str):
            r["changes"] = json.loads(r["changes"])
        r["id"] = str(r["id"])
        if r.get("entity_id"):
            r["entity_id"] = str(r["entity_id"])
        r["created_at"] = r["created_at"].isoformat()
        items.append(r)

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if per_page > 0 else 0,
    }
