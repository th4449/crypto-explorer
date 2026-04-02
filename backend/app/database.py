import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

# In production, DATABASE_URL must be explicitly set.
# The fallback is only for local development.
_env = os.getenv("ENVIRONMENT", "development")
_default_url = (
    "postgresql://app_user:localdevpassword@localhost:5432/crypto_explorer"
    if _env != "production"
    else None
)
DATABASE_URL = os.getenv("DATABASE_URL", _default_url)

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required in production. "
        "Set ENVIRONMENT=development to use the local default."
    )

pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return pool


async def close_pool():
    global pool
    if pool is not None:
        await pool.close()
        pool = None
