-- Add statement_display_name column to listings and listing_groups.
-- The existing display_name / nickname fields drive dropdowns and admin UI;
-- statement_display_name is the label that appears in the rendered statement
-- header. Nullable — when unset, the renderer falls back to listing.name
-- (or group.name for group statements).
--
-- Run: psql $DATABASE_URL -f migrations/add-statement-display-name.sql

ALTER TABLE listings ADD COLUMN IF NOT EXISTS statement_display_name VARCHAR(255);
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS statement_display_name VARCHAR(255);
