-- Migration: Rename Stripe columns to Wise columns
-- Run this against your PostgreSQL database

-- Listings table
ALTER TABLE listings RENAME COLUMN stripe_account_id TO wise_recipient_id;
ALTER TABLE listings RENAME COLUMN stripe_onboarding_status TO wise_status;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS payout_invite_token VARCHAR(255);

-- Listing groups table
ALTER TABLE listing_groups RENAME COLUMN stripe_account_id TO wise_recipient_id;
ALTER TABLE listing_groups RENAME COLUMN stripe_onboarding_status TO wise_status;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS payout_invite_token VARCHAR(255);

-- Clear old Stripe account IDs (not valid as Wise recipient IDs)
UPDATE listings SET wise_recipient_id = NULL, wise_status = 'missing' WHERE wise_recipient_id IS NOT NULL;
UPDATE listing_groups SET wise_recipient_id = NULL, wise_status = 'missing' WHERE wise_recipient_id IS NOT NULL;

-- Statements table
ALTER TABLE statements RENAME COLUMN stripe_fee TO wise_fee;
