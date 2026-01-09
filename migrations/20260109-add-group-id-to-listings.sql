-- Migration: Add group_id column to listings table
-- Run this SQL against your database after running 20260109-create-listing-groups.sql
-- For PostgreSQL: psql $DATABASE_URL -f migrations/20260109-add-group-id-to-listings.sql
-- For SQLite: sqlite3 database.sqlite < migrations/20260109-add-group-id-to-listings.sql

-- Add group_id column (nullable foreign key to listing_groups)
-- SQLite doesn't support IF NOT EXISTS in ALTER TABLE, handle errors gracefully
ALTER TABLE listings ADD COLUMN group_id INTEGER REFERENCES listing_groups(id) ON DELETE SET NULL;

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_listings_group_id ON listings(group_id);

-- Comment: group_id references listing_groups(id), null means listing is ungrouped
-- ON DELETE SET NULL ensures that when a group is deleted, listings become ungrouped
