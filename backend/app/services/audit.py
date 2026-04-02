"""
Audit log service.

Records every create, update, delete, and import action to the
audit_log table with the user email, entity type, entity id,
and a JSON diff of what changed (before/after values).
"""

import json
from uuid import UUID

import asyncpg

from app.database import get_pool


def build_diff(before: dict | None, after: dict | None, fields: list[str] | None = None) -> dict:
    """
    Build a before/after diff dict for the audit log.

    For creates: returns {"after": {field: value, ...}}
    For updates: returns {"before": {...}, "after": {...}} with only changed fields
    For deletes: returns {"before": {field: value, ...}}
    """
    # Skip internal/binary fields
    skip = {"search_vector", "deleted_at", "created_at", "updated_at"}

    def clean(d: dict | None) -> dict:
        if not d:
            return {}
        return {
            k: str(v) if v is not None else None
            for k, v in d.items()
            if k not in skip
        }

    if before is None and after is not None:
        # Create
        return {"after": clean(after)}

    if before is not None and after is None:
        # Delete
        return {"before": clean(before)}

    if before is not None and after is not None:
        # Update — only include fields that actually changed
        b = clean(before)
        a = clean(after)
        changed_before = {}
        changed_after = {}
        check_keys = fields if fields else list(set(list(b.keys()) + list(a.keys())))
        for k in check_keys:
            if k in skip:
                continue
            old_val = b.get(k)
            new_val = a.get(k)
            if str(old_val) != str(new_val):
                changed_before[k] = old_val
                changed_after[k] = new_val
        if changed_before or changed_after:
            return {"before": changed_before, "after": changed_after}
        return {}

    return {}


async def log_action(
    user_email: str | None,
    action: str,
    entity_type: str,
    entity_id: UUID | str | None = None,
    changes: dict | None = None,
) -> None:
    """Write an audit log entry. Fails silently to avoid blocking requests."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO audit_log (user_email, action, entity_type, entity_id, changes)
                VALUES ($1, $2, $3, $4, $5)
                """,
                user_email,
                action,
                entity_type,
                UUID(str(entity_id)) if entity_id else None,
                json.dumps(changes or {}),
            )
    except Exception:
        # Audit logging should never break the main request
        pass
