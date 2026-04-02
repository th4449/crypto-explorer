import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_pool, close_pool
from app.auth import AuthMiddleware
from app.rate_limit import RateLimitMiddleware
from app.routers import (
    companies, people, wallets, banks, violations,
    graph, relationships, imports, audit, otc, sanctions,
    api_keys,
)

load_dotenv()


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


@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint. Returns API status and version."""
    return {"status": "ok", "version": "1.0.0"}
