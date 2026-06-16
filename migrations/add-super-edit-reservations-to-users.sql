-- Per-user permission to inline-edit reservation financial numbers in the Edit Statement
-- modal (recomputes statement totals without regenerating). Dangerous, so off by default;
-- enabled per user in Settings > Users. System users (is_system_user) get it implicitly.
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_super_edit_reservations BOOLEAN NOT NULL DEFAULT false;
