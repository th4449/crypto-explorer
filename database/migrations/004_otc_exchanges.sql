-- Migration 004: OTC Exchange Rating System
-- Companion module for anonymous crowdsourced OTC exchange ratings.

CREATE TABLE IF NOT EXISTS otc_exchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    average_rating NUMERIC(3,2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otc_rating ON otc_exchanges (average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_otc_company ON otc_exchanges (company_id) WHERE company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id UUID NOT NULL REFERENCES otc_exchanges(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    reviewer_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    moderation_notes TEXT,
    approvals JSONB DEFAULT '[]'::jsonb,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    moderated_at TIMESTAMP WITH TIME ZONE,
    moderated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_reviews_exchange ON reviews (exchange_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews (reviewer_hash, submitted_at);

-- Rate limiting table for anonymous review submissions
CREATE TABLE IF NOT EXISTS review_rate_limits (
    ip_hash TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_ip ON review_rate_limits (ip_hash, submitted_at);
