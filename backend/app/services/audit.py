"""
Audit log service.

Records every create, update, delete, and import action to the
audit_log table with the user email, entity type, entity id,
and a JSON diff of what changed.
"""

import json
from uuid import UUID

import asyncpg

from app.database import get_pool


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
