-- =====================================================
-- Email Dashboard Tables Migration
-- Run this script on production database to create
-- all tables needed for the email dashboard feature
-- =====================================================

-- Create ENUM types if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_email_templates_frequency_type') THEN
        CREATE TYPE enum_email_templates_frequency_type AS ENUM ('weekly', 'bi-weekly', 'monthly', 'custom');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_email_templates_calculation_type') THEN
        CREATE TYPE enum_email_templates_calculation_type AS ENUM ('checkout', 'calendar');
    END IF;
END$$;

-- =====================================================
-- 1. EMAIL TEMPLATES TABLE
-- Stores customizable email templates
-- =====================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    frequency_type enum_email_templates_frequency_type NOT NULL DEFAULT 'custom',
    calculation_type enum_email_templates_calculation_type,
    is_default BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    subject VARCHAR(500) NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for email_templates
CREATE INDEX IF NOT EXISTS idx_email_templates_frequency_default ON email_templates(frequency_type, is_default);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_calculation_type ON email_templates(calculation_type);

-- =====================================================
-- 2. EMAIL LOGS TABLE
-- Stores email sending history and status
-- =====================================================
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    statement_id INTEGER NOT NULL,
    property_id INTEGER,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    property_name VARCHAR(255),
    frequency_tag VARCHAR(100),
    subject VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    message_id VARCHAR(255),
    error_message TEXT,
    error_code VARCHAR(100),
    attempted_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for email_logs
CREATE INDEX IF NOT EXISTS idx_email_logs_statement_id ON email_logs(statement_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_email ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);

-- =====================================================
-- 3. INSERT DEFAULT TEMPLATES
-- Two default templates: Check-Out and Calendar
-- =====================================================

-- Check-Out Statement Template (for WEEKLY, BI-WEEKLY)
INSERT INTO email_templates (name, frequency_type, calculation_type, is_default, is_system, tags, is_active, subject, html_body, text_body, description)
SELECT
    'Check-Out Statement',
    'bi-weekly',
    'checkout',
    TRUE,
    TRUE,
    ARRAY['WEEKLY', 'BI-WEEKLY A', 'BI-WEEKLY B'],
    TRUE,
    'Owner Statement - {{periodDisplay}}',
    '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi {{ownerName}},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of {{periodDisplay}}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">{{ownerPayout}}{{balanceSuffix}}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: CHECK-OUT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This statement is calculated on a check-out basis. For reservations with check-outs that fall beyond the current statement period, they will be paid out in the next statement.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
<tr><td style="border-top: 1px solid #ccc; padding-top: 15px;">
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
</p>
</td></tr>
</table>
</body>
</html>',
    'Hi {{ownerName}},

Attached is your statement for the period of {{periodDisplay}}.

STATEMENT TOTAL: {{ownerPayout}}{{balanceSuffix}}

Payment will be sent shortly to your provided account.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.',
    'Check-out based statement template - full reservation on checkout date'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'Check-Out Statement');

-- Calendar Statement Template (for MONTHLY)
INSERT INTO email_templates (name, frequency_type, calculation_type, is_default, is_system, tags, is_active, subject, html_body, text_body, description)
SELECT
    'Calendar Statement',
    'monthly',
    'calendar',
    TRUE,
    TRUE,
    ARRAY['MONTHLY'],
    TRUE,
    'Owner Statement - {{periodDisplay}}',
    '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi {{ownerName}},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of {{periodDisplay}}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">{{ownerPayout}}{{balanceSuffix}}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: CALENDAR-BASED</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This statement is calculated on a calendar basis with prorated amounts for reservations that span multiple periods.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
<tr><td style="border-top: 1px solid #ccc; padding-top: 15px;">
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
</p>
</td></tr>
</table>
</body>
</html>',
    'Hi {{ownerName}},

Attached is your statement for the period of {{periodDisplay}}.

STATEMENT TOTAL: {{ownerPayout}}{{balanceSuffix}}

Payment will be sent shortly to your provided account.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.',
    'Calendar-based statement template with prorated calculations'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'Calendar Statement');

-- =====================================================
-- VERIFICATION QUERIES
-- Run these to verify tables were created correctly
-- =====================================================
-- SELECT * FROM email_templates;
-- SELECT * FROM email_logs LIMIT 10;
-- SELECT COUNT(*) FROM email_templates;
-- SELECT COUNT(*) FROM email_logs;
