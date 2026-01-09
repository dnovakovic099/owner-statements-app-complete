-- ============================================
-- Listing Groups Feature - Database Migration
-- ============================================
-- Run this file to add the listing groups feature
--
-- For SQLite:  sqlite3 database/database.sqlite < migrations/listing-groups-migration.sql
-- For PostgreSQL: psql $DATABASE_URL -f migrations/listing-groups-migration.sql
-- ============================================

-- Step 1: Create the listing_groups table
CREATE TABLE IF NOT EXISTS listing_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_listing_groups_name ON listing_groups(name);

-- Step 2: Add group_id column to listings table
ALTER TABLE listings ADD COLUMN group_id INTEGER REFERENCES listing_groups(id) ON DELETE SET NULL;

-- Index for join performance
CREATE INDEX IF NOT EXISTS idx_listings_group_id ON listings(group_id);

-- ============================================
-- DONE! The listing groups feature is now ready.
--
-- Table: listing_groups
--   - id: Primary key
--   - name: Unique group name (e.g., "Smith Properties")
--   - tags: Comma-separated schedule tags (e.g., "WEEKLY" or "WEEKLY,MONTHLY")
--   - created_at, updated_at: Timestamps
--
-- Column added to listings:
--   - group_id: Foreign key to listing_groups (null = ungrouped)
--   - ON DELETE SET NULL: Deleting a group ungroups its listings
-- ============================================
