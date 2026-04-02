-- Migration 007: IP rate limiting for anonymous API requests

CREATE TABLE IF NOT EXISTS ip_rate_limits (
    ip_hash TEXT NOT NULL,
    requests_today INTEGER DEFAULT 0,
    reset_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 day'),
    UNIQUE(ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_hash ON ip_rate_limits (ip_hash);
