-- Migration: Add new PM fee transition fields to listings
-- These fields allow a per-listing PM fee % transition based on reservation created_at date

ALTER TABLE listings ADD COLUMN IF NOT EXISTS new_pm_fee_enabled BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS new_pm_fee_percentage DECIMAL(5,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS new_pm_fee_start_date DATE;
