-- Migration: Add multi-entry PM fee schedule to listings
-- Stores an array of PM fee transitions [{ "percentage": 20, "startDate": "2026-02-01" }, ...]
-- applied by reservation created_at. Supersedes the single new_pm_fee_* columns when present;
-- those columns are kept for backward compatibility with previously-saved listings/statements.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS pm_fee_schedule JSONB;
