-- Migration: Add email_templates table
-- Run this SQL in your PostgreSQL database to create the email templates table

CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    frequency_type VARCHAR(20) NOT NULL DEFAULT 'custom' CHECK (frequency_type IN ('weekly', 'bi-weekly', 'monthly', 'custom')),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    subject VARCHAR(500) NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_frequency ON email_templates(frequency_type, is_default);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

-- Clear existing templates if re-running
DELETE FROM email_templates WHERE name IN ('Calendar Statement', 'Check-Out Statement', 'Weekly Statement', 'Bi-Weekly Statement', 'Monthly Statement');

-- Insert default templates (CALENDAR and CHECK-OUT)
INSERT INTO email_templates (name, frequency_type, is_default, subject, html_body, text_body, description) VALUES
(
    'Calendar Statement',
    'monthly',
    TRUE,
    'Owner Statement - {{periodDisplay}}',
    '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 12px 0;">Hi {{ownerName}},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of {{periodDisplay}}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 16px 0; font-size: 24px; font-weight: bold;">{{ownerPayout}}{{balanceSuffix}}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>NOTE: CALENDAR</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">This statement is calculated on a calendar (prorated) basis. For reservations that span different statement periods, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email.</p>
</body>
</html>',
    'Hi {{ownerName}},

Attached is your statement for the period of {{periodDisplay}}.

STATEMENT TOTAL
{{ownerPayout}}{{balanceSuffix}}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: CALENDAR
This statement is calculated on a calendar (prorated) basis. For reservations that span different statement periods, amounts are automatically prorated based on the number of nights within the current statement period.

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.',
    'Calendar-based statement template with prorated calculations'
),
(
    'Check-Out Statement',
    'bi-weekly',
    TRUE,
    'Owner Statement - {{periodDisplay}}',
    '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 12px 0;">Hi {{ownerName}},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of {{periodDisplay}}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 16px 0; font-size: 24px; font-weight: bold;">{{ownerPayout}}{{balanceSuffix}}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 11px; color: #333;"><strong>NOTE: CHECK-OUT</strong></p>
<p style="margin: 0 0 16px 0; font-size: 11px; color: #333;">This statement is calculated on a check-out basis. Reservations are included in full on the statement period where the guest checks out.</p>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email.</p>
</body>
</html>',
    'Hi {{ownerName}},

Attached is your statement for the period of {{periodDisplay}}.

STATEMENT TOTAL
{{ownerPayout}}{{balanceSuffix}}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: CHECK-OUT
This statement is calculated on a check-out basis. Reservations are included in full on the statement period where the guest checks out.

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.',
    'Check-out based statement template - full reservation on checkout date'
);

-- Comment to help track migration
COMMENT ON TABLE email_templates IS 'Dynamic email templates with variable placeholders';
