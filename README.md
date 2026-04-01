# Crypto Explorer

A public searchable graph database mapping Russia's cryptocurrency sanctions-evasion ecosystem. The platform stores structured records for companies, people, wallets, banks, and regulatory violations, renders an interactive network graph showing relationships between entities, and provides full-text search with entity filtering.

Built by the Informed Democracy Project / Dekleptocracy Alliance, a Texas-based 501(c)(4) nonprofit.

## Project Structure

```
crypto-explorer/
├── frontend/          # Next.js 14 application (TypeScript + Tailwind CSS)
│   └── src/
│       └── app/       # App Router pages and layouts
├── backend/           # Python FastAPI application
│   └── app/
│       ├── routers/   # API endpoint modules
│       ├── models/    # Pydantic data models
│       └── services/  # Business logic and external integrations
├── database/
│   └── migrations/    # SQL migration files
└── docker-compose.yml # Local development environment
```

## Technology Stack

- Graph Database: PostgreSQL 16 + Apache AGE
- Backend API: FastAPI (Python)
- Frontend: Next.js 14 + React + Tailwind CSS
- Graph Visualization: D3.js v7
- Authentication: NextAuth.js
- Full-Text Search: PostgreSQL tsvector
- Hosting: Railway or Render

## Entity Types

The database tracks five entity types connected by typed relationships

- Companies (exchanges, processors, issuers, shell companies)
- People (executives, beneficial owners, directors, associates)
- Wallets (blockchain addresses with attribution)
- Banks (fiat on-ramps and off-ramps)
- Violations (sanctions, seizures, criminal cases, regulatory actions)

Each entity carries a three-tier verification system (Verified, Probable, Unverified) with source documentation.

## Getting Started

See the build plan document for detailed setup instructions covering each phase of development.

## License

This project is open source. See LICENSE for details.
