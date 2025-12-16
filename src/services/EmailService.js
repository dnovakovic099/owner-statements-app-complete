/**
 * Email Service for Owner Statement Delivery
 *
 * Features:
 * - SMTP configuration via environment variables
 * - Three email templates: Weekly, Bi-Weekly, Monthly
 * - Negative balance guardrail (prevents sending if ownerPayout < 0)
 * - PDF attachment support
 * - Email queue and logging
 */

const nodemailer = require('nodemailer');
const path = require('path');
const http = require('http');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.initializeTransporter();
    }

    /**
     * Initialize the SMTP transporter
     */
    initializeTransporter() {
        const smtpConfig = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true' // true for 465, false for other ports
        };

        // Add auth only if credentials are provided (supports no-auth SMTP servers)
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            smtpConfig.auth = {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            };
        }

        // Check if SMTP host is configured
        if (!smtpConfig.host) {
            console.warn('[EmailService] SMTP not configured. Email sending disabled.');
            console.warn('[EmailService] Required env var: SMTP_HOST');
            this.isConfigured = false;
            return;
        }

        try {
            this.transporter = nodemailer.createTransport(smtpConfig);
            this.isConfigured = true;
            console.log('[EmailService] SMTP transporter initialized');
            console.log(`[EmailService] Host: ${smtpConfig.host}:${smtpConfig.port}`);
        } catch (error) {
            console.error('[EmailService] Failed to initialize SMTP:', error.message);
            this.isConfigured = false;
        }
    }

    /**
     * Verify SMTP connection
     */
    async verifyConnection() {
        if (!this.isConfigured) {
            return { success: false, error: 'SMTP not configured' };
        }

        try {
            await this.transporter.verify();
            return { success: true, message: 'SMTP connection verified' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get email template based on frequency tag
     * @param {string} frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {Object} data - Template data (ownerName, propertyName, period, etc.)
     */
    getEmailTemplate(frequencyTag, data, calculationType = 'checkout') {
        // Normalize the frequency tag (handle WEEKLY, BI-WEEKLY A, BI-WEEKLY B, MONTHLY)
        const normalizedTag = (frequencyTag || '').toUpperCase().trim();

        let templateKey = 'Monthly'; // Default
        if (normalizedTag === 'WEEKLY') {
            templateKey = 'Weekly';
        } else if (normalizedTag.startsWith('BI-WEEKLY')) {
            templateKey = 'Bi-Weekly';
        } else if (normalizedTag === 'MONTHLY') {
            templateKey = 'Monthly';
        }

        const templates = {
            'Weekly': this.getWeeklyTemplate(data),
            'Bi-Weekly': this.getBiWeeklyTemplate(data),
            'Monthly': this.getMonthlyTemplate(data, calculationType)
        };

        return templates[templateKey];
    }

    /**
     * Weekly Statement Email Template
     */
    getWeeklyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "Nov 24-Dec 1, 2025" style for weekly
        const formatWeeklyPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
                const startDay = startDate.getDate();
                const endDay = endDate.getDate();
                const year = endDate.getFullYear();

                if (startMonth === endMonth) {
                    return `${startMonth} ${startDay}-${endDay}, ${year}`;
                }
                return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        // Format for subject line: "11.24-12.1.2025"
        const formatSubjectPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`;
                const endStr = `${endDate.getMonth() + 1}.${endDate.getDate()}.${endDate.getFullYear()}`;
                return `${startStr}-${endStr}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        const periodDisplay = formatWeeklyPeriod(periodStart, periodEnd);
        const subjectPeriod = formatSubjectPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${subjectPeriod}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 12px 0;">Payment will be sent shortly to your provided account.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: WEEKLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period ${periodDisplay}.

STATEMENT TOTAL
$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

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

NOTE: WEEKLY PAYOUTS
If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.
            `
        };
    }

    /**
     * Bi-Weekly Statement Email Template
     */
    getBiWeeklyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "Nov 17-Dec 1, 2025" style for bi-weekly
        const formatBiWeeklyPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
                const startDay = startDate.getDate();
                const endDay = endDate.getDate();
                const year = endDate.getFullYear();

                if (startMonth === endMonth) {
                    return `${startMonth} ${startDay}-${endDay}, ${year}`;
                }
                return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        // Format for subject line: "11.17-12.1.2025"
        const formatSubjectPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`;
                const endStr = `${endDate.getMonth() + 1}.${endDate.getDate()}.${endDate.getFullYear()}`;
                return `${startStr}-${endStr}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        const periodDisplay = formatBiWeeklyPeriod(periodStart, periodEnd);
        const subjectPeriod = formatSubjectPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${subjectPeriod}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 12px 0;">Payment will be sent shortly to your provided account.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: BI-WEEKLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period ${periodDisplay}.

STATEMENT TOTAL
$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

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

NOTE: BI-WEEKLY PAYOUTS
If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.
            `
        };
    }

    /**
     * Monthly Statement Email Template - Calendar (Prorated) basis
     * Standard calendar-based template without transition notice
     */
    getMonthlyCalendarTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "November 2025" style - use the actual statement period month
        // Monthly statements are for a complete month, so use the month from the statement dates
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                // Use the month from the statement dates (which should be the full month period)
                return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } catch {
                return `${start} to ${end}`;
            }
        };
        const periodDisplay = formatPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${periodDisplay}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 12px 0;">Payment will be sent shortly to your provided account.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: MONTHLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period of ${periodDisplay}.

STATEMENT TOTAL
$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

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

NOTE: MONTHLY PAYOUTS
This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.
            `
        };
    }

    /**
     * Monthly Statement Email Template - Calendar to Checkout Transition
     * Used for November 2025 to notify owners of upcoming change
     */
    getMonthlyCalendarToCheckoutTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "November 2025" style
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } catch {
                return `${start} to ${end}`;
            }
        };
        const periodDisplay = formatPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${periodDisplay}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 12px 0;">Payment will be sent shortly to your provided account.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: MONTHLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<p style="margin: 0 0 12px 0;">Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.</p>
<p style="margin: 0 0 12px 0;">This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period of ${periodDisplay}.

STATEMENT TOTAL
$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

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

NOTE: MONTHLY PAYOUTS
This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.

Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.

This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.
            `
        };
    }

    /**
     * Co-Host Negative Balance Email Template
     * Used when isCohostOnAirbnb is true and statement has negative balance
     * Includes Stripe invoice link placeholder
     */
    getCohostNegativeBalanceTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName, stripeInvoiceUrl } = data;

        // Format period as "Nov 17-Dec 1, 2025" style
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
                const startDay = startDate.getDate();
                const endDay = endDate.getDate();
                const year = endDate.getFullYear();

                if (startMonth === endMonth) {
                    return `${startMonth} ${startDay}-${endDay}, ${year}`;
                }
                return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        // Format for subject line: "11.17-12.1.2025"
        const formatSubjectPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`;
                const endStr = `${endDate.getMonth() + 1}.${endDate.getDate()}.${endDate.getFullYear()}`;
                return `${startStr}-${endStr}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        const periodDisplay = formatPeriod(periodStart, periodEnd);
        const subjectPeriod = formatSubjectPeriod(periodStart, periodEnd);
        const balanceAmount = Math.abs(ownerPayout).toFixed(2);

        // Stripe invoice link - use provided URL or placeholder
        const invoiceLink = stripeInvoiceUrl || '[Stripe Invoice Link]';
        const invoiceLinkHtml = stripeInvoiceUrl
            ? `<a href="${stripeInvoiceUrl}" style="color: #2563eb;">this secure Stripe invoice link</a>`
            : '<strong>[Stripe Invoice Link]</strong>';

        return {
            subject: `Owner Statement - ${subjectPeriod}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">- $${balanceAmount}</p>
<p style="margin: 0 0 12px 0;">Since we're on a co-host setup on Airbnb, payouts for Airbnb reservations go directly to your account. This means this statement reflects a negative balance as we need to collect our management commission and any expenses we've covered on your behalf during the period.</p>
<p style="margin: 0 0 12px 0;">You can pay the balance using ${invoiceLinkHtml}.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: CO-HOST ON AIRBNB</strong></p>
<p style="margin: 0 0 12px 0;">Airbnb sends the reservation payouts directly to you. Our management commission and any other covered expenses are then invoiced and reflected as a balance due.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: RESERVATION CALCULATION</strong></p>
<p style="margin: 0 0 12px 0;">This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<p style="margin: 0 0 12px 0;">Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.</p>
<p style="margin: 0 0 12px 0;">This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period ${periodDisplay}.

STATEMENT TOTAL
- $${balanceAmount}

Since we're on a co-host setup on Airbnb, payouts for Airbnb reservations go directly to your account. This means this statement reflects a negative balance as we need to collect our management commission and any expenses we've covered on your behalf during the period.

You can pay the balance using ${invoiceLink}.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: CO-HOST ON AIRBNB
Airbnb sends the reservation payouts directly to you. Our management commission and any other covered expenses are then invoiced and reflected as a balance due.

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: RESERVATION CALCULATION
This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.

Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.

This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.
            `
        };
    }

    /**
     * Monthly Statement Email Template - Checkout basis
     * Used for December 2025 onwards
     */
    getMonthlyCheckoutTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "November 2025" style
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } catch {
                return `${start} to ${end}`;
            }
        };
        const periodDisplay = formatPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${periodDisplay}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 12px 0;">Payment will be sent shortly to your provided account.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 8px 0;"><strong>NOTE: MONTHLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0;">If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.</p>
<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0;">Thank you again for your trust and partnership.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period of ${periodDisplay}.

STATEMENT TOTAL
$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

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

NOTE: MONTHLY PAYOUTS
If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.
            `
        };
    }

    /**
     * Get Monthly template based on calculation type
     * @param {Object} data - Template data
     * @param {string} calculationType - 'calendar' or 'checkout'
     */
    getMonthlyTemplate(data, calculationType = 'calendar') {
        if (calculationType === 'checkout') {
            return this.getMonthlyCheckoutTemplate(data);
        }
        return this.getMonthlyCalendarTemplate(data);
    }

    /**
     * Check if statement can be sent (Negative Balance Guardrail)
     * @param {Object} statement - Statement object
     * @returns {Object} { canSend: boolean, reason: string }
     */
    checkNegativeBalanceGuardrail(statement) {
        const ownerPayout = parseFloat(statement.ownerPayout) || 0;

        if (ownerPayout < 0) {
            return {
                canSend: false,
                reason: 'NEGATIVE_BALANCE',
                message: `Statement has negative balance ($${ownerPayout.toFixed(2)}). Flagged for manual review.`,
                ownerPayout
            };
        }

        return {
            canSend: true,
            reason: 'POSITIVE_BALANCE',
            message: 'Statement has positive balance. OK to send.',
            ownerPayout
        };
    }

    /**
     * Send statement email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {Object} options.statement - Statement object
     * @param {string} options.frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {Buffer|string} options.pdfAttachment - PDF file buffer or path
     * @param {string} options.pdfFilename - Filename for the attachment
     */
    async sendStatementEmail(options) {
        const { to, statement, frequencyTag, pdfAttachment, pdfFilename, testNote } = options;

        // Check SMTP configuration
        if (!this.isConfigured) {
            return {
                success: false,
                error: 'SMTP_NOT_CONFIGURED',
                message: 'Email service is not configured. Please set SMTP environment variables.'
            };
        }

        // Negative Balance Guardrail Check
        const guardrailCheck = this.checkNegativeBalanceGuardrail(statement);
        if (!guardrailCheck.canSend) {
            console.log(`[EmailService] BLOCKED: Statement ${statement.id} - ${guardrailCheck.message}`);
            return {
                success: false,
                error: 'NEGATIVE_BALANCE_BLOCKED',
                message: guardrailCheck.message,
                flaggedForReview: true,
                ownerPayout: guardrailCheck.ownerPayout
            };
        }

        // Get email template
        const templateData = {
            ownerName: statement.ownerName,
            propertyName: statement.propertyName || 'Multiple Properties',
            periodStart: statement.weekStartDate,
            periodEnd: statement.weekEndDate,
            ownerPayout: parseFloat(statement.ownerPayout) || 0,
            companyName: process.env.COMPANY_NAME || 'Luxury Lodging PM'
        };

        const template = this.getEmailTemplate(frequencyTag, templateData);

        // If testNote is provided, prepend it to the email body
        let emailHtml = template.html;
        let emailText = template.text;
        let emailSubject = template.subject;

        if (testNote) {
            const testNoteHtml = `
                <div style="background-color: #fff3cd; border: 2px solid #ffc107; padding: 20px; margin-bottom: 20px; border-radius: 8px; font-family: monospace;">
                    <h2 style="color: #856404; margin-top: 0;">TEST EMAIL - DO NOT FORWARD TO OWNER</h2>
                    <pre style="white-space: pre-wrap; color: #856404;">${testNote}</pre>
                </div>
            `;
            emailHtml = emailHtml.replace('<body>', '<body>' + testNoteHtml);
            emailText = testNote + '\n\n' + emailText;
            emailSubject = '[TEST] ' + emailSubject;
        }

        // Prepare email
        const mailOptions = {
            from: process.env.FROM_EMAIL || 'statements@luxurylodgingpm.com',
            to: to,
            subject: emailSubject,
            html: emailHtml,
            text: emailText,
            attachments: []
        };

        // Add PDF attachment if provided
        if (pdfAttachment) {
            console.log(`[EmailService] PDF attachment type: ${typeof pdfAttachment}, isBuffer: ${Buffer.isBuffer(pdfAttachment)}, size: ${pdfAttachment.length || 'N/A'}`);
            if (Buffer.isBuffer(pdfAttachment)) {
                mailOptions.attachments.push({
                    filename: pdfFilename || `statement-${statement.id}.pdf`,
                    content: pdfAttachment,
                    contentType: 'application/pdf'
                });
                console.log(`[EmailService] Attached PDF: ${pdfFilename}, size: ${pdfAttachment.length} bytes`);
            } else if (typeof pdfAttachment === 'string') {
                mailOptions.attachments.push({
                    filename: pdfFilename || path.basename(pdfAttachment),
                    path: pdfAttachment,
                    contentType: 'application/pdf'
                });
            }
        } else {
            console.log(`[EmailService] No PDF attachment provided`);
        }

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`[EmailService] Email sent successfully to ${to} for statement ${statement.id}`);

            return {
                success: true,
                messageId: result.messageId,
                recipient: to,
                statementId: statement.id,
                frequencyTag,
                sentAt: new Date().toISOString()
            };
        } catch (error) {
            console.error(`[EmailService] Failed to send email to ${to}:`, error.message);
            return {
                success: false,
                error: 'SEND_FAILED',
                message: error.message,
                recipient: to,
                statementId: statement.id
            };
        }
    }

    /**
     * Get frequency tag from listing tags
     * @param {Array|string} tags - Listing tags
     * @returns {string} Frequency tag ('Weekly', 'Bi-Weekly', 'Monthly')
     */
    getFrequencyFromTags(tags) {
        const tagArray = Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim());

        for (const tag of tagArray) {
            const normalizedTag = tag.trim().toUpperCase();

            if (normalizedTag === 'WEEKLY') {
                return 'Weekly';
            }
            if (normalizedTag.startsWith('BI-WEEKLY') || normalizedTag === 'BIWEEKLY') {
                return 'Bi-Weekly';
            }
            if (normalizedTag === 'MONTHLY') {
                return 'Monthly';
            }
        }

        return 'Monthly'; // Default frequency
    }

    /**
     * Send bulk statements with guardrail checking
     * @param {Array} statements - Array of statement objects
     * @param {Object} ownerEmails - Map of ownerId to email address
     * @param {Object} listingTags - Map of listingId to tags
     * @returns {Object} Results summary
     */
    async sendBulkStatements(statements, ownerEmails, listingTags = {}) {
        const results = {
            sent: [],
            blocked: [],
            failed: [],
            summary: {
                total: statements.length,
                sentCount: 0,
                blockedCount: 0,
                failedCount: 0
            }
        };

        for (const statement of statements) {
            const ownerEmail = ownerEmails[statement.ownerId];

            if (!ownerEmail) {
                results.failed.push({
                    statementId: statement.id,
                    reason: 'NO_EMAIL',
                    message: `No email address for owner ${statement.ownerId}`
                });
                results.summary.failedCount++;
                continue;
            }

            // Get frequency tag from listing
            const tags = listingTags[statement.propertyId] || [];
            const frequencyTag = this.getFrequencyFromTags(tags);

            const sendResult = await this.sendStatementEmail({
                to: ownerEmail,
                statement,
                frequencyTag
                // Note: PDF attachment would need to be generated separately
            });

            if (sendResult.success) {
                results.sent.push({
                    statementId: statement.id,
                    recipient: ownerEmail,
                    frequencyTag,
                    messageId: sendResult.messageId
                });
                results.summary.sentCount++;
            } else if (sendResult.error === 'NEGATIVE_BALANCE_BLOCKED') {
                results.blocked.push({
                    statementId: statement.id,
                    ownerId: statement.ownerId,
                    ownerName: statement.ownerName,
                    propertyName: statement.propertyName,
                    ownerPayout: sendResult.ownerPayout,
                    reason: 'NEGATIVE_BALANCE'
                });
                results.summary.blockedCount++;
            } else {
                results.failed.push({
                    statementId: statement.id,
                    reason: sendResult.error,
                    message: sendResult.message
                });
                results.summary.failedCount++;
            }
        }

        return results;
    }

    /**
     * Generate PDF buffer for a statement by calling the existing download endpoint
     * This uses the same HTML template as the "Download PDF" button in the UI
     * @param {string} statementId - Statement ID
     * @param {Object} statement - Statement object (for filename)
     * @param {string} authHeader - Authorization header for internal API call
     * @returns {Object} { pdfBuffer, filename }
     */
    async generateStatementPdf(statementId, statement, authHeader = null) {
        try {
            const port = process.env.PORT || 3003;
            const downloadUrl = `http://localhost:${port}/api/statements/${statementId}/download`;

            // Use provided auth header or fall back to internal basic auth
            const internalAuth = authHeader || 'Basic ' + Buffer.from(`${process.env.BASIC_AUTH_USER || 'LL'}:${process.env.BASIC_AUTH_PASS || 'bnb547!'}`).toString('base64');

            // Call the existing download endpoint to get the PDF
            const pdfBuffer = await new Promise((resolve, reject) => {
                // Use provided auth header or fall back to internal basic auth
                const internalAuth = authHeader || 'Basic ' + Buffer.from(`${process.env.BASIC_AUTH_USER || 'LL'}:${process.env.BASIC_AUTH_PASS || 'bnb547!'}`).toString('base64');

                const options = {
                    headers: { 'Authorization': internalAuth },
                    timeout: 120000 // 2 minute timeout for PDF generation
                };

                const req = http.get(downloadUrl, options, (response) => {
                    // Check if response is successful
                    if (response.statusCode !== 200) {
                        reject(new Error(`Download failed with status ${response.statusCode}`));
                        return;
                    }

                    // Collect binary data
                    const chunks = [];
                    response.on('data', chunk => chunks.push(chunk));
                    response.on('end', () => resolve(Buffer.concat(chunks)));
                    response.on('error', reject);
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('PDF download timeout'));
                });
            });

            // Generate filename using property nickname
            let propertyNickname = statement.propertyName || 'Statement';
            const cleanPropertyName = propertyNickname
                .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const startDate = (statement.weekStartDate || '').replace(/\//g, '-');
            const endDate = (statement.weekEndDate || '').replace(/\//g, '-');
            const statementPeriod = `${startDate} to ${endDate}`;
            const filename = `${cleanPropertyName} - ${statementPeriod}.pdf`;

            console.log(`[EmailService] Generated PDF for statement ${statementId}: ${filename}`);

            return {
                success: true,
                pdfBuffer,
                filename
            };
        } catch (error) {
            console.error(`[EmailService] Failed to generate PDF for statement ${statementId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send statement email with PDF attachment
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {Object} options.statement - Statement object
     * @param {string} options.frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {boolean} options.attachPdf - Whether to attach PDF (default: true)
     * @param {string} options.authHeader - Authorization header for PDF generation
     * @param {Function} options.refetchStatement - Function to refetch statement after PDF generation
     */
    async sendStatementEmailWithPdf(options) {
        const { to, statement, frequencyTag, attachPdf = true, authHeader, refetchStatement } = options;

        let pdfAttachment = null;
        let pdfFilename = null;
        let updatedStatement = statement;

        // Generate PDF if requested (this may trigger recalculation)
        if (attachPdf && statement.id) {
            const pdfResult = await this.generateStatementPdf(statement.id, statement, authHeader);
            if (pdfResult.success) {
                pdfAttachment = pdfResult.pdfBuffer;
                pdfFilename = pdfResult.filename;

                // Re-fetch statement to get updated values after PDF generation
                // (PDF view route may have recalculated and updated the statement)
                if (refetchStatement) {
                    try {
                        const refreshed = await refetchStatement(statement.id);
                        if (refreshed) {
                            updatedStatement = refreshed;
                            console.log(`[EmailService] Refreshed statement ${statement.id}: payout ${updatedStatement.ownerPayout}`);
                        }
                    } catch (err) {
                        console.warn(`[EmailService] Failed to refresh statement, using original values`);
                    }
                }
            } else {
                console.warn(`[EmailService] PDF generation failed, sending email without attachment`);
            }
        }

        // Call the existing send method with updated statement
        return this.sendStatementEmail({
            to,
            statement: updatedStatement,
            frequencyTag,
            pdfAttachment,
            pdfFilename
        });
    }
}

module.exports = new EmailService();
