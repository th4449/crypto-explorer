# Security Checklist — Crypto Explorer

Last reviewed: April 2, 2026

## Secrets Management

- [x] **No hardcoded secrets** — grep for password, secret, api_key, token patterns found zero hardcoded values in source code
- [x] All secrets stored in environment variables via os.getenv() / process.env
- [x] .env files listed in .gitignore (confirmed)
- [x] Production guard in database.py raises RuntimeError if DATABASE_URL not set when ENVIRONMENT=production
- [x] SECRET_KEY and NEXTAUTH_SECRET documented as required in .env.production.example
- [x] Development fallback password (localdevpassword) only active when ENVIRONMENT != production
- [x] API keys stored as SHA-256 hashes, raw key shown only once at creation

## Authentication

- [x] Admin routes protected by NextAuth middleware (src/middleware.ts matcher: /admin/:path*)
- [x] Backend write endpoints (POST/PUT/DELETE) require valid session via AuthMiddleware
- [x] Sessions stored in database (not JWT) — server-side session management
- [x] Session cookies set as HTTP-only by NextAuth (default behavior)
- [x] Magic link tokens consumed on use (useVerificationToken does DELETE...RETURNING)
- [x] Sessions expire after 30 days (configured in authOptions)
- [x] CSRF protection handled natively by NextAuth (CSRF token in sign-in forms)
- [x] OTC review submission exempted from auth (public, rate-limited instead)

## SQL Injection Prevention

- [x] **All SQL queries use parameterized inputs ($1, $2, etc.)** — confirmed across all 12 router files and crud.py
- [x] Table name interpolation (f"SELECT * FROM {table}") uses only internal constants, never user input. Tables: companies, people, wallets, banks, violations — all hardcoded in router TABLE constants or ENTITY_TABLES dict
- [x] Cypher queries use _escape() function with backslash escaping, single-quote escaping, null byte removal, control character stripping, and 1000-char truncation

## XSS and Input Sanitization

- [x] OTC review text sanitized with bleach.clean(tags=[], attributes={}, strip=True) — all HTML stripped
- [x] Review rejected if text is under 10 characters after sanitization (prevents empty-after-strip submissions)
- [x] Pydantic models validate all API request bodies with type checking and constraints
- [x] Star ratings constrained to 1-5 via CHECK constraint and Pydantic Field(ge=1, le=5)
- [x] Entity subtypes and verification tiers enforced via PostgreSQL CHECK constraints
- [x] CSV import validates rows client-side against schema before submission

## Rate Limiting

- [x] Anonymous API access: 100 requests/day per IP (RateLimitMiddleware on all /api/v1/ endpoints)
- [x] Free API keys: 100 requests/day
- [x] Premium API keys: 10,000 requests/day
- [x] 429 response includes Retry-After header and X-RateLimit-* headers
- [x] OTC review submissions: 3/day per IP (separate rate limit in otc router)
- [x] Rate limit counters auto-reset past reset_at timestamp; daily cron as backup
- [x] IP addresses hashed with SHA-256 for rate limiting (never stored raw)

## Security Headers (Backend)

- [x] Strict-Transport-Security: max-age=31536000; includeSubDomains (SecurityHeadersMiddleware)
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] X-XSS-Protection: 1; mode=block
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] Permissions-Policy: camera=(), microphone=(), geolocation=()

## Security Headers (Frontend)

- [x] Same headers applied via next.config.js headers() function
- [x] Content-Security-Policy configured: default-src self, connect-src allows API and external data sources, no inline scripts except where Next.js requires

## CORS

- [x] CORS_ORIGINS configurable via environment variable
- [x] Default development value is http://localhost:3000
- [x] Production must be set to exact frontend domain (documented in .env.production.example)
- [x] credentials: include enabled in frontend API client for cookie-based auth

## Data Protection

- [x] Soft deletes only — deleted_at timestamp, no hard deletes from entity tables
- [x] All changes recorded in audit_log with before/after diffs
- [x] Reviewer IP addresses stored as one-way SHA-256 hashes
- [x] API keys stored as SHA-256 hashes
- [x] Graph vertices removed on soft delete (DETACH DELETE)

## Docker

- [x] Backend runs as non-root user (appuser) via USER directive
- [x] Frontend runs as non-root user (nextjs) via USER directive
- [x] Python base image: python:3.12-slim
- [x] Node base image: node:20-alpine
- [x] .dockerignore files exclude .env, node_modules, .git, __pycache__
- [x] Health checks configured on all three services in docker-compose.prod.yml

## Dependency Audit Results

### Python (pip-audit -r requirements.txt)

**Result: No known vulnerabilities found**

System-level packages (pip, setuptools, wheel) have available updates but are not part of the application runtime.

### Node.js (npm audit)

**Result: 3 advisories (2 low, 1 high)**

| Package | Severity | Issue | Status |
|---------|----------|-------|--------|
| next@14.2.35 | Low | HTTP request deserialization DoS in React Server Components | Accepted risk — fix requires Next.js 16 (breaking). App does not use insecure RSC patterns. |
| next@14.2.35 | Low | HTTP request smuggling in rewrites | Accepted risk — app does not use Next.js rewrites. |
| nodemailer | High | SMTP command injection via envelope.size | Accepted risk — magic link flow does not expose envelope.size to user input. Monitor for nodemailer 8.x compatibility with next-auth. |

No critical vulnerabilities in either stack.
