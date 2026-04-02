import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_pool, close_pool
from app.auth import AuthMiddleware
from app.routers import companies, people, wallets, banks, violations, graph, relationships, imports, audit, otc, sanctions

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the database connection pool on startup, close it on shutdown."""
    await get_pool()
    yield
    await close_pool()


app = FastAPI(
    title="Crypto Explorer API",
    description="REST API for the cryptocurrency sanctions-evasion graph database.",
    version="0.1.0",
    lifespan=lifespan,
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

# Register entity routers
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

# Auth middleware — validates session tokens on POST/PUT/DELETE requests.
# Added after routers so route matching works, but middleware runs before handlers.
app.add_middleware(AuthMiddleware)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
