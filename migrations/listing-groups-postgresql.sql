-- ============================================
-- Listing Groups Feature - PostgreSQL Migration
-- ============================================
-- Run: PGPASSWORD=xxx psql -h host -U postgres -p port -d database -f migrations/listing-groups-postgresql.sql
-- ============================================

-- Step 1: Create the listing_groups table
CREATE TABLE IF NOT EXISTS listing_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    tags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_listing_groups_name ON listing_groups(name);

-- Step 2: Add group_id column to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES listing_groups(id) ON DELETE SET NULL;

-- Index for join performance
CREATE INDEX IF NOT EXISTS idx_listings_group_id ON listings(group_id);

-- ============================================
-- DONE!
-- ============================================
