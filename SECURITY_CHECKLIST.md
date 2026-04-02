# Security Checklist — Crypto Explorer

## Secrets Management
- [ ] No API keys, database credentials, or secrets hardcoded in source code
- [ ] All secrets stored in environment variables
- [ ] .env files listed in .gitignore
- [ ] SECRET_KEY and NEXTAUTH_SECRET are unique, random, and at least 32 characters
- [ ] DB_PASSWORD is strong (20+ characters, mixed case, digits, symbols)
- [ ] OPENSANCTIONS_API_KEY and ETHERSCAN_API_KEY set only in env, never in code

## Authentication
- [ ] Admin routes protected by NextAuth middleware (src/middleware.ts)
- [ ] Backend write endpoints (POST/PUT/DELETE) require valid session token
- [ ] Session tokens stored in HTTP-only cookies (set by NextAuth)
- [ ] Magic link tokens expire after use (useVerificationToken deletes on consumption)
- [ ] Sessions expire after 30 days

## Input Validation
- [ ] All SQL queries use parameterized inputs ($1, $2, etc.), never string concatenation
- [ ] Pydantic models validate all API request bodies with type checking
- [ ] OTC review text limited to 5,000 characters
- [ ] Star ratings constrained to 1-5 via CHECK constraint and Pydantic validation
- [ ] Entity subtypes and verification tiers enforced via CHECK constraints
- [ ] CSV import validates rows client-side before submission

## Rate Limiting
- [ ] Anonymous API access limited to 100 requests/day per IP
- [ ] Free API keys limited to 100 requests/day
- [ ] Premium API keys limited to 10,000 requests/day
- [ ] OTC review submissions limited to 3/day per IP
- [ ] Rate limit counters reset daily via cron job

## Security Headers
- [ ] Strict-Transport-Security (HSTS) enabled with max-age=31536000
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Content-Security-Policy configured on frontend
- [ ] Permissions-Policy restricts camera, microphone, geolocation

## CORS
- [ ] CORS_ORIGINS set to only the production frontend domain
- [ ] Credentials allowed only from trusted origins

## Data Protection
- [ ] Soft deletes only — no data is ever hard-deleted from entity tables
- [ ] All changes recorded in audit_log with before/after diffs
- [ ] Reviewer IP addresses stored as one-way SHA-256 hashes, never raw
- [ ] API keys stored as SHA-256 hashes, raw key shown only once at creation

## Docker
- [ ] Backend runs as non-root user (appuser)
- [ ] Frontend runs as non-root user (nextjs)
- [ ] Python base image is slim variant (minimal attack surface)
- [ ] Node base image is alpine variant (minimal attack surface)
- [ ] Health checks configured on all services

## Dependencies
- [ ] Run pip audit on Python dependencies before deployment
- [ ] Run npm audit on Node.js dependencies before deployment
- [ ] Address any critical or high severity findings
