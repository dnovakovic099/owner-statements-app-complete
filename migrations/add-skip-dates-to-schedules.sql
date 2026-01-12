-- Migration: Add skip_dates column to tag_schedules table
-- This allows skipping auto-generation on specific dates

ALTER TABLE tag_schedules
ADD COLUMN IF NOT EXISTS skip_dates TEXT DEFAULT NULL;

COMMENT ON COLUMN tag_schedules.skip_dates IS 'JSON array of dates (YYYY-MM-DD) to skip auto-generation';
