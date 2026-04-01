-- Migration 001: Entity Tables
-- Creates the five core entity tables with verification tiers,
-- source documentation, full-text search indexes, and auto-update triggers.

-- ============================================================
-- Companies
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    jurisdiction TEXT,
    registration_id TEXT,
    entity_subtype TEXT CHECK (entity_subtype IN ('exchange', 'processor', 'issuer', 'shell')),
    status TEXT,
    website TEXT,
    telegram_handle TEXT,
    description TEXT,
    verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN ('verified', 'probable', 'unverified')),
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector TSVECTOR
);

CREATE INDEX IF NOT EXISTS idx_companies_search ON companies USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_companies_verification ON companies (verification_tier);
CREATE INDEX IF NOT EXISTS idx_companies_subtype ON companies (entity_subtype);

CREATE OR REPLACE FUNCTION companies_search_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.jurisdiction, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.telegram_handle, '')), 'D');
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_companies_search
    BEFORE INSERT OR UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_search_update();

-- ============================================================
-- People
-- ============================================================
CREATE TABLE IF NOT EXISTS people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    aliases TEXT[],
    nationality TEXT,
    role_title TEXT,
    sanctions_status BOOLEAN DEFAULT FALSE,
    pep_status BOOLEAN DEFAULT FALSE,
    description TEXT,
    verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN ('verified', 'probable', 'unverified')),
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector TSVECTOR
);

CREATE INDEX IF NOT EXISTS idx_people_search ON people USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_people_verification ON people (verification_tier);
CREATE INDEX IF NOT EXISTS idx_people_sanctions ON people (sanctions_status) WHERE sanctions_status = TRUE;

CREATE OR REPLACE FUNCTION people_search_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.aliases, ' '), '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.nationality, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.role_title, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_people_search
    BEFORE INSERT OR UPDATE ON people
    FOR EACH ROW EXECUTE FUNCTION people_search_update();

-- ============================================================
-- Wallets
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT UNIQUE NOT NULL,
    blockchain TEXT NOT NULL,
    label TEXT,
    attributed_to UUID,
    cluster_id TEXT,
    first_seen TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE,
    total_volume NUMERIC,
    verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN ('verified', 'probable', 'unverified')),
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector TSVECTOR
);

-- attributed_to can reference either a company or a person
-- enforced at the application layer rather than with a single FK
COMMENT ON COLUMN wallets.attributed_to IS 'UUID of the company or person that controls this wallet. Referential integrity enforced at application layer.';

CREATE INDEX IF NOT EXISTS idx_wallets_search ON wallets USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_wallets_verification ON wallets (verification_tier);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets (address);
CREATE INDEX IF NOT EXISTS idx_wallets_blockchain ON wallets (blockchain);
CREATE INDEX IF NOT EXISTS idx_wallets_attributed ON wallets (attributed_to) WHERE attributed_to IS NOT NULL;

CREATE OR REPLACE FUNCTION wallets_search_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.address, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.label, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.blockchain, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.cluster_id, '')), 'C');
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_wallets_search
    BEFORE INSERT OR UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION wallets_search_update();

-- ============================================================
-- Banks
-- ============================================================
CREATE TABLE IF NOT EXISTS banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    swift_code TEXT,
    jurisdiction TEXT,
    sanctions_status BOOLEAN DEFAULT FALSE,
    role TEXT,
    description TEXT,
    verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN ('verified', 'probable', 'unverified')),
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector TSVECTOR
);

CREATE INDEX IF NOT EXISTS idx_banks_search ON banks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_banks_verification ON banks (verification_tier);
CREATE INDEX IF NOT EXISTS idx_banks_swift ON banks (swift_code) WHERE swift_code IS NOT NULL;

CREATE OR REPLACE FUNCTION banks_search_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.swift_code, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.jurisdiction, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_banks_search
    BEFORE INSERT OR UPDATE ON banks
    FOR EACH ROW EXECUTE FUNCTION banks_search_update();

-- ============================================================
-- Violations
-- ============================================================
CREATE TABLE IF NOT EXISTS violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_type TEXT NOT NULL
        CHECK (violation_type IN ('sanction', 'seizure', 'criminal_case', 'regulatory_action')),
    issuing_authority TEXT,
    violation_date DATE,
    description TEXT,
    targets UUID[],
    verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN ('verified', 'probable', 'unverified')),
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_violations_verification ON violations (verification_tier);
CREATE INDEX IF NOT EXISTS idx_violations_type ON violations (violation_type);
CREATE INDEX IF NOT EXISTS idx_violations_date ON violations (violation_date DESC);
CREATE INDEX IF NOT EXISTS idx_violations_targets ON violations USING GIN (targets);
