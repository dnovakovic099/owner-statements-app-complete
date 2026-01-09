-- Add group fields to statements table for auto-generated group statements
-- Run: psql $DATABASE_URL -f migrations/add-group-fields-to-statements.sql

ALTER TABLE statements ADD COLUMN IF NOT EXISTS group_id INTEGER;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS group_tags TEXT;

-- Create index for group_id lookups
CREATE INDEX IF NOT EXISTS idx_statements_group_id ON statements(group_id);
