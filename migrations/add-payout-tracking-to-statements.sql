-- Migration: Add payout tracking fields to statements table
-- Run: psql $DATABASE_URL -f migrations/add-payout-tracking-to-statements.sql
-- Safe to run multiple times (IF NOT EXISTS prevents errors)
-- All columns are nullable — no impact on existing rows

ALTER TABLE statements ADD COLUMN IF NOT EXISTS payout_status VARCHAR(255) DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS payout_transfer_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS payout_error TEXT DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS stripe_fee DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS total_transfer_amount DECIMAL(10,2) DEFAULT NULL;

-- Index for filtering by payout status
CREATE INDEX IF NOT EXISTS idx_statements_payout_status ON statements(payout_status);
