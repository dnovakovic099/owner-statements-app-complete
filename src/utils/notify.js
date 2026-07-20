/**
 * Ops notifications — get operational alerts in front of a human, not just logs.
 *
 * Channel: email via EmailService (SMTP). Recipients come from OPS_ALERT_EMAIL
 * (comma-separated) and default to the addresses below. Used for payout-pipeline
 * alerts (funding stuck, payout status changes), NOT owner-facing mail.
 *
 * Design rules: never throws, never blocks the caller on SMTP latency, and is a
 * safe no-op when SMTP isn't configured (so tests / local dev stay quiet).
 */

const logger = require('./logger');

// Default recipients if OPS_ALERT_EMAIL is not set. Set OPS_ALERT_EMAIL in the
// environment (comma-separated) to change/extend without a code deploy.
const DEFAULT_OPS_RECIPIENTS = 'devendravariya73@gmail.com,ferdinand@luxurylodgingpm.com';

/** Resolve the ops recipient list (env override wins), de-duped, trimmed. */
function opsRecipients() {
    const raw = process.env.OPS_ALERT_EMAIL || DEFAULT_OPS_RECIPIENTS;
    return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

/**
 * Send an ops notification email. Fire-and-forget friendly: always resolves,
 * swallows errors into a log line, and no-ops when SMTP or recipients are absent.
 *
 * @param {{title:string, text?:string, fields?:Array<{label:string,value:string}>, level?:'info'|'success'|'warn'|'error'}} msg
 */
async function notifyOps(msg) {
    const recipients = opsRecipients();
    if (recipients.length === 0) return;
    const EmailService = require('../services/EmailService');
    if (typeof EmailService.sendOpsAlert !== 'function' || !EmailService.isConfigured) return;

    const level = (msg.level || 'info').toUpperCase();
    const bodyLines = [msg.text || '']
        .concat((msg.fields || []).map((f) => `${f.label}: ${f.value}`))
        .filter(Boolean);
    try {
        await EmailService.sendOpsAlert(recipients.join(','), `[${level}] ${msg.title}`, bodyLines.join('\n'));
    } catch (e) {
        logger.warn('[notify] ops email failed', { error: e?.message, title: msg.title });
    }
}

/** Fire-and-forget wrapper for hot paths (never awaited by the caller). */
function notifyOpsAsync(msg) {
    notifyOps(msg).catch((e) => logger.warn('[notify] notifyOpsAsync failed', { error: e?.message }));
}

module.exports = { notifyOps, notifyOpsAsync, opsRecipients };
