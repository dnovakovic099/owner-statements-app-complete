/**
 * Seed script for default email templates
 * Creates the CHECK-OUT and CALENDAR system templates
 */

const { EmailTemplate } = require('../models');

const CHECKOUT_TEMPLATE = {
    name: 'Check-Out Statement',
    calculationType: 'checkout',
    frequencyType: 'monthly',
    isDefault: true,
    isSystem: true,
    isActive: true,
    subject: 'Owner Statement - {{periodDisplay}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi{{ownerName}},</p>
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
</body>
</html>`,
    textBody: `Hi{{ownerName}},

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
This statement is calculated on a check-out basis. For reservations with check-outs that fall beyond the current statement period, they will be paid out in the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.`,
    description: 'Default template for check-out based statement calculations'
};

const CALENDAR_TEMPLATE = {
    name: 'Calendar Statement',
    calculationType: 'calendar',
    frequencyType: 'monthly',
    isDefault: true,
    isSystem: true,
    isActive: true,
    subject: 'Owner Statement - {{periodDisplay}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi{{ownerName}},</p>
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
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: CALENDAR</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This statement is calculated on a calendar (prorated) basis. For reservations that span different statement periods, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
    textBody: `Hi{{ownerName}},

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

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.`,
    description: 'Default template for calendar (prorated) based statement calculations'
};

async function seedEmailTemplates() {
    console.log('Seeding email templates...');

    try {
        // Check if templates already exist
        const existingCheckout = await EmailTemplate.findOne({
            where: { name: 'Check-Out Statement', isSystem: true }
        });

        const existingCalendar = await EmailTemplate.findOne({
            where: { name: 'Calendar Statement', isSystem: true }
        });

        // Create or update Check-Out template
        if (existingCheckout) {
            await existingCheckout.update(CHECKOUT_TEMPLATE);
            console.log('Updated existing Check-Out Statement template');
        } else {
            await EmailTemplate.create(CHECKOUT_TEMPLATE);
            console.log('Created Check-Out Statement template');
        }

        // Create or update Calendar template
        if (existingCalendar) {
            await existingCalendar.update(CALENDAR_TEMPLATE);
            console.log('Updated existing Calendar Statement template');
        } else {
            await EmailTemplate.create(CALENDAR_TEMPLATE);
            console.log('Created Calendar Statement template');
        }

        console.log('Email templates seeded successfully!');
        return { success: true };
    } catch (error) {
        console.error('Error seeding email templates:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { seedEmailTemplates, CHECKOUT_TEMPLATE, CALENDAR_TEMPLATE };

// Run if called directly
if (require.main === module) {
    require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

    seedEmailTemplates()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
