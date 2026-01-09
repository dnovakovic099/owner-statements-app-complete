-- Add calculation_type column to listing_groups table
-- Run: psql $DATABASE_URL -f migrations/add-calculation-type-to-groups.sql

ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS calculation_type VARCHAR(20) DEFAULT 'checkout';
