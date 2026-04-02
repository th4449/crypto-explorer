import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_pool, close_pool
from app.auth import AuthMiddleware
from app.rate_limit import RateLimitMiddleware
from app.security import SecurityHeadersMiddleware
from app.routers import (
    companies, people, wallets, banks, violations,
    graph, relationships, imports, audit, otc, sanctions,
    api_keys,
)

load_dotenv()

# Initialize Sentry error tracking (free tier: 5K events/month)
# Set SENTRY_DSN in environment to enable. Safe to leave unset in dev.
_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        environment=os.getenv("ENVIRONMENT", "development"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the database connection pool on startup, close it on shutdown."""
    await get_pool()
    yield
    await close_pool()


API_DESCRIPTION = """
# Crypto Explorer API

Public searchable graph database mapping Russia's cryptocurrency
sanctions-evasion ecosystem. This API provides access to five entity
types (companies, people, wallets, banks, violations) connected by
typed relationships in a property graph.

## Authentication

**GET requests** are public and do not require authentication.

**POST/PUT/DELETE requests** require a valid session token, passed either as:
- A `next-auth.session-token` cookie (set automatically by the web UI)
- An `Authorization: Bearer <session_token>` header

## Rate Limiting

All `/api/v1/` endpoints are rate-limited:

| Tier | Limit | How to get |
|------|-------|-----------|
| Anonymous (no key) | 100 requests/day | Automatic, by IP |
| Free API key | 100 requests/day | Request from admin |
| Premium API key | 10,000 requests/day | Request from admin |

Pass your API key via the `X-API-Key` header.

Rate limit headers are included in every response:
- `X-RateLimit-Limit` — your tier's daily limit
- `X-RateLimit-Remaining` — requests left today
- `X-RateLimit-Reset` — when the counter resets (ISO 8601)

## Entity Types

- **Companies** — exchanges, processors, issuers, shell companies
- **People** — executives, beneficial owners, directors, associates
- **Wallets** — blockchain addresses with attribution
- **Banks** — fiat on-ramps and off-ramps
- **Violations** — sanctions, seizures, criminal cases, regulatory actions

Each entity carries a three-tier verification system: `verified`, `probable`, `unverified`.
"""

app = FastAPI(
    title="Crypto Explorer API",
    description=API_DESCRIPTION,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Companies", "description": "CRUD for company entities"},
        {"name": "People", "description": "CRUD for person entities"},
        {"name": "Wallets", "description": "CRUD for wallet entities with blockchain enrichment"},
        {"name": "Banks", "description": "CRUD for bank entities"},
        {"name": "Violations", "description": "CRUD for violation/sanction entities"},
        {"name": "Relationships", "description": "Create and query entity relationships"},
        {"name": "Graph", "description": "Graph traversal, shortest path, neighborhood queries"},
        {"name": "Sanctions", "description": "OpenSanctions cross-referencing"},
        {"name": "OTC Exchanges", "description": "OTC exchange ratings and reviews"},
        {"name": "Import", "description": "Bulk CSV import"},
        {"name": "Audit", "description": "Audit log of all data changes"},
        {"name": "API Keys", "description": "API key management (admin)"},
    ],
)

# CORS configuration
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(companies.router)
app.include_router(people.router)
app.include_router(wallets.router)
app.include_router(banks.router)
app.include_router(violations.router)
app.include_router(graph.router)
app.include_router(relationships.router)
app.include_router(imports.router)
app.include_router(audit.router)
app.include_router(otc.router)
app.include_router(sanctions.router)
app.include_router(api_keys.router)

# Middleware stack (applied in reverse order):
# 1. RateLimitMiddleware — enforces per-key and per-IP request quotas
# 2. AuthMiddleware — validates session tokens on write operations
app.add_middleware(AuthMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint. Returns API status and version."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/v1/status", tags=["System"])
async def system_status():
    """
    Detailed system status. Returns database connection health,
    entity counts by type, and last backup timestamp.
    """
    pool = await get_pool()

    # Database connection test
    db_ok = False
    try:
        await pool.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        pass

    # Entity counts
    counts = {}
    for table in ("companies", "people", "wallets", "banks", "violations"):
        try:
            count = await pool.fetchval(
                f"SELECT COUNT(*) FROM {table} WHERE deleted_at IS NULL"
            )
            counts[table] = count
        except Exception:
            counts[table] = -1

    # Relationship count
    try:
        counts["relationships"] = await pool.fetchval(
            "SELECT COUNT(*) FROM relationships"
        )
    except Exception:
        counts["relationships"] = -1

    # Last backup timestamp (read from marker file)
    last_backup = None
    for path in ("/tmp/backups/.last_backup", "/app/backups/.last_backup"):
        try:
            with open(path, "r") as f:
                last_backup = f.read().strip()
                break
        except FileNotFoundError:
            continue

    # Graph vertex count
    graph_vertices = 0
    try:
        await pool.execute(
            "SET search_path = ag_catalog, '$user', public"
        )
        row = await pool.fetchrow(
            "SELECT * FROM cypher('crypto_graph', $$ "
            "MATCH (n:Entity) RETURN count(n) "
            "$$) as (count agtype)"
        )
        graph_vertices = int(row["count"]) if row else 0
    except Exception:
        pass

    return {
        "status": "ok" if db_ok else "degraded",
        "version": "1.0.0",
        "database": "connected" if db_ok else "disconnected",
        "entities": counts,
        "graph_vertices": graph_vertices,
        "total_entities": sum(v for v in counts.values() if v > 0 and v != counts.get("relationships")),
        "last_backup": last_backup,
    }


@app.get("/debug-sentry", tags=["System"], include_in_schema=False)
async def debug_sentry():
    """Trigger a test error to verify Sentry is working. Not shown in docs."""
    raise RuntimeError("Sentry test error — this is intentional.")
