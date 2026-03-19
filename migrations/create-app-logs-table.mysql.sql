-- MySQL migration: Create app_logs table for persistent error/warn logging
-- Run this on MySQL databases instead of the PostgreSQL version

CREATE TABLE IF NOT EXISTS app_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    context VARCHAR(100),
    metadata JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_logs_level ON app_logs (level);
CREATE INDEX idx_app_logs_timestamp ON app_logs (timestamp);
CREATE INDEX idx_app_logs_context ON app_logs (context);
