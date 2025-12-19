-- Migration: Add scheduled_emails table
-- Run this SQL against your database to create the scheduled_emails table

CREATE TABLE IF NOT EXISTS scheduled_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER NOT NULL,
    property_id INTEGER,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    property_name VARCHAR(255),
    frequency_tag VARCHAR(50),
    scheduled_for DATETIME NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at DATETIME,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_statement_id ON scheduled_emails(statement_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_for ON scheduled_emails(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_created_at ON scheduled_emails(created_at);
