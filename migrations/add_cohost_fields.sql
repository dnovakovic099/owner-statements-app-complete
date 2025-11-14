-- Migration: Add display_name and is_cohost_on_airbnb fields to listings table
-- Run this on Railway database after deployment

ALTER TABLE listings ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_cohost_on_airbnb BOOLEAN DEFAULT 0;

