-- Migration: Add exclude_cleaning_from_commission to listings and statements.
-- Idempotent: safe to run multiple times (IF NOT EXISTS).
-- Postgres only.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/migrate-add-exclude-cleaning-from-commission.sql
-- or:
--   PGPASSWORD=... psql -h HOST -U USER -p PORT -d DB \
--     -f scripts/migrate-add-exclude-cleaning-from-commission.sql

BEGIN;

ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS exclude_cleaning_from_commission BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE statements
    ADD COLUMN IF NOT EXISTS exclude_cleaning_from_commission BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- Verify:
SELECT table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE column_name = 'exclude_cleaning_from_commission'
  AND table_name IN ('listings', 'statements')
ORDER BY table_name;
