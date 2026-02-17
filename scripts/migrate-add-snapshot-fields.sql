-- Migration: Add listing settings snapshot fields to statements table
-- Safe to run multiple times (IF NOT EXISTS prevents errors)
-- All columns are nullable with NULL default — no impact on existing rows

ALTER TABLE statements ADD COLUMN IF NOT EXISTS waive_commission BOOLEAN DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS waive_commission_until DATE DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS disregard_tax BOOLEAN DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS airbnb_pass_through_tax BOOLEAN DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS guest_paid_damage_coverage BOOLEAN DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS listing_settings_snapshot JSONB DEFAULT NULL;
