-- Add tags column to listings table
-- Run this migration with: psql $DATABASE_URL -f migrations/add_tags_to_listings.sql

-- Add tags column (TEXT to store comma-separated tags)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tags TEXT;

-- Add comment
COMMENT ON COLUMN listings.tags IS 'Comma-separated tags for grouping and filtering listings';

-- Create index for better search performance
CREATE INDEX IF NOT EXISTS idx_listings_tags ON listings(tags);

