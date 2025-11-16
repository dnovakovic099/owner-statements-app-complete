-- Add tags column to listings table
-- For PostgreSQL: psql $DATABASE_URL -f migrations/add_tags_to_listings.sql
-- For SQLite: sqlite3 database/owner_statements.db < migrations/add_tags_to_listings.sql

-- Add tags column (TEXT to store comma-separated tags)
-- SQLite doesn't support IF NOT EXISTS in ALTER TABLE, so we'll handle errors gracefully
ALTER TABLE listings ADD COLUMN tags TEXT;

-- SQLite doesn't support COMMENT ON COLUMN
-- Comment: Comma-separated tags for grouping and filtering listings

-- Create index for better search performance
CREATE INDEX IF NOT EXISTS idx_listings_tags ON listings(tags);

