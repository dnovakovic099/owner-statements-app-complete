-- Add Stripe Connect fields to listing_groups table for group-level payout support
-- Group Stripe account ID overrides individual listing Stripe IDs for combined statements

ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS stripe_onboarding_status VARCHAR(30) DEFAULT 'missing';
