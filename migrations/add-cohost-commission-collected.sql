-- Migration: second co-host type — PM commission already collected from Airbnb.
--
-- The existing `is_cohost_on_airbnb` flag excludes Airbnb revenue from the
-- statement and bills the PM commission back to the owner (Gross Payout is the
-- negative commission). Some co-host arrangements instead route the commission
-- straight to our Airbnb account, so there is nothing to bill: the commission
-- belongs on the statement for visibility only and the reservation must not
-- reduce the owner's payout.
--
-- This flag is a modifier on `is_cohost_on_airbnb`, not a replacement — it only
-- takes effect on listings that are already co-hosted. Default false keeps every
-- existing co-host listing on the bill-the-owner behaviour.
--
-- Statements carry their own copy (like is_cohost_on_airbnb) so a rendered
-- statement stays immune to later listing changes, and so analytics can apply
-- the same formula from statement-level columns.
--
-- Run: psql $DATABASE_URL -f migrations/add-cohost-commission-collected.sql

ALTER TABLE listings   ADD COLUMN IF NOT EXISTS cohost_commission_collected BOOLEAN DEFAULT FALSE;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS cohost_commission_collected BOOLEAN DEFAULT FALSE;
