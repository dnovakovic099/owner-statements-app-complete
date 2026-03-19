-- Create app_logs table for persistent log storage
-- Stores error and warn level logs so they survive Railway redeploys

CREATE TABLE IF NOT EXISTS app_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    context VARCHAR(100),
    metadata JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON app_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_app_logs_context ON app_logs (context);
