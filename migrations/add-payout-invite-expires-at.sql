-- Add payout_invite_expires_at column to listings and listing_groups
-- Invite tokens expire after 7 days to prevent stale links

ALTER TABLE listings ADD COLUMN IF NOT EXISTS payout_invite_expires_at TIMESTAMPTZ;
ALTER TABLE listing_groups ADD COLUMN IF NOT EXISTS payout_invite_expires_at TIMESTAMPTZ;
