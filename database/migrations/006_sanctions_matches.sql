-- Migration 006: Sanctions matches cache
-- Stores OpenSanctions match results per entity.

CREATE TABLE IF NOT EXISTS sanctions_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    opensanctions_id TEXT,
    match_score NUMERIC(4,3) DEFAULT 0,
    match_data JSONB DEFAULT '{}',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(entity_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_sanctions_entity ON sanctions_matches (entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_sanctions_score ON sanctions_matches (match_score DESC);
