-- Migration 002: Relationships table
-- Stores relationship metadata alongside the Apache AGE graph edges.
-- The graph edges handle traversal queries (shortest path, neighborhood).
-- This relational table handles metadata, verification, and grouped listing.

CREATE TABLE IF NOT EXISTS relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL,
    target_id UUID NOT NULL,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'OWNS', 'EMPLOYS', 'CONTROLS_WALLET', 'BANKS_WITH',
        'TRANSACTED_WITH', 'SUCCESSOR_OF', 'SANCTIONED_BY', 'SUBSIDIARY_OF'
    )),
    metadata JSONB DEFAULT '{}',
    verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN ('verified', 'probable', 'unverified')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships (source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships (target_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships (relationship_type);
CREATE INDEX IF NOT EXISTS idx_rel_pair ON relationships (source_id, target_id);
