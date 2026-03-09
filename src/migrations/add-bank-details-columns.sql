-- Add encrypted bank detail columns to listings and listing_groups
-- Bank details are stored encrypted (AES-256-GCM) for reference/re-use
-- Raw details are also sent to Wise API for recipient creation

-- Listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_email TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_routing_number TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(20);

-- Listing groups table
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS bank_email TEXT;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS bank_routing_number TEXT;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(20);
