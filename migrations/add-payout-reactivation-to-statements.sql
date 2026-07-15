-- Migration: Add payout reactivation fields to statements table
-- Run: psql $DATABASE_URL -f migrations/add-payout-reactivation-to-statements.sql
-- Safe to run multiple times (IF NOT EXISTS prevents errors)
-- All columns are nullable — no impact on existing rows
--
-- Feature: a statement's "Send payout via Increase" button auto-disables once the
-- statement is 7+ days old (measured from created_at, or from payout_reactivated_at
-- once set). Only system users can reactivate an aged statement, which stamps these
-- columns and starts a fresh 7-day window.

ALTER TABLE statements ADD COLUMN IF NOT EXISTS payout_reactivated_at TIMESTAMP DEFAULT NULL;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS payout_reactivated_by VARCHAR(255) DEFAULT NULL;
