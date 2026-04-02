-- Migration 005: Wallet enrichment cache
-- Stores cached blockchain data with a 24-hour TTL.

CREATE TABLE IF NOT EXISTS wallet_enrichment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrichment_wallet ON wallet_enrichment (wallet_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_fetched ON wallet_enrichment (fetched_at);
