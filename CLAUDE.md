# CLAUDE.md - Crypto Explorer

## Project Overview

Public searchable graph database mapping Russia's cryptocurrency sanctions-evasion ecosystem. Five entity types (companies, people, wallets, banks, violations) connected by typed relationships in a property graph. Companion OTC exchange rating application with moderated reviews.

## Tech Stack

- Database: PostgreSQL 16 + Apache AGE (graph queries via Cypher)
- Backend: Python FastAPI with asyncpg
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Graph Visualization: D3.js v7 (canvas rendering)
- Authentication: NextAuth.js (email magic links)
- Search: PostgreSQL tsvector full-text search

## Directory Structure

```
crypto-explorer/
├── frontend/src/app/       # Next.js pages and layouts
├── backend/main.py         # FastAPI entry point
├── backend/app/routers/    # API endpoint modules (one per entity type)
├── backend/app/models/     # Pydantic request/response models
├── backend/app/services/   # Business logic, external API integrations
├── database/init.sql       # Initial schema and AGE setup
├── database/migrations/    # Numbered SQL migration files
```

## Coding Conventions

- TypeScript strict mode in frontend
- Pydantic v2 models for all API request/response validation
- Async database access via asyncpg connection pool
- All SQL queries use parameterized inputs, never string concatenation
- Tailwind CSS for all styling, no separate CSS files
- Entity verification tiers: verified, probable, unverified
- Soft deletes only (deleted_at timestamp), never hard delete
- All data changes logged to audit_log table

## Common Commands

```bash
# Start database
docker-compose up -d

# Run backend
cd backend && uvicorn main:app --reload

# Run frontend
cd frontend && npm run dev

# Run database migration
psql $DATABASE_URL -f database/migrations/NNN_description.sql
```

## Environment Variables

- DATABASE_URL: PostgreSQL connection string
- SECRET_KEY: Session signing key
- CORS_ORIGINS: Comma-separated allowed frontend origins

## Known Pitfalls

- Apache AGE Cypher queries must use the ag_catalog schema and SET search_path before execution
- AGE query results come back as agtype and need explicit casting
- The graph and relational tables live in the same PostgreSQL instance but are queried differently
- OpenSanctions API is limited to 2,000 requests per month
- Always verify line count and closing tags before pushing frontend builds
- Free-tier hosting limits apply; design for efficiency
