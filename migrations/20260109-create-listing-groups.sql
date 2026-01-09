-- Migration: Create listing_groups table
-- Run this SQL against your database to create the listing_groups table
-- For PostgreSQL: psql $DATABASE_URL -f migrations/20260109-create-listing-groups.sql
-- For SQLite: sqlite3 database.sqlite < migrations/20260109-create-listing-groups.sql

CREATE TABLE IF NOT EXISTS listing_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Note for PostgreSQL: Use SERIAL instead of AUTOINCREMENT
-- CREATE TABLE IF NOT EXISTS listing_groups (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL UNIQUE,
--     tags TEXT,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- Create index for better name lookup performance
CREATE INDEX IF NOT EXISTS idx_listing_groups_name ON listing_groups(name);

-- Comment: tags field stores comma-separated schedule tags (e.g., "WEEKLY" or "WEEKLY,MONTHLY")
