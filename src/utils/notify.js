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

// ─── Batched payout status-change alerts ───────────────────────────────────
// A batch of payouts changing status (e.g. 13 clearing at once) should produce
// ONE combined email, not one per statement. We buffer changes and flush them
// together after a short quiet window.
const STATUS_BATCH_MS = parseInt(process.env.OPS_STATUS_BATCH_MS) || 60000; // 60s
let statusBuffer = [];
let flushTimer = null;
const money = (v) => (Math.round((parseFloat(v) || 0) * 100) / 100).toFixed(2);

/**
 * Queue a single payout status change; the combined email is sent ~STATUS_BATCH_MS
 * after the first queued change (later changes join the same email). Synchronous
 * and never throws — safe to call from a DB hook.
 * @param {{id:number|string, prev?:string, next:string, amount?:number, property?:string, owner?:string, error?:string}} change
 */
function queuePayoutStatusChange(change) {
    try {
        statusBuffer.push(change);
        if (!flushTimer) {
            flushTimer = setTimeout(() => { flushStatusChanges().catch(() => {}); }, STATUS_BATCH_MS);
            if (flushTimer.unref) flushTimer.unref(); // don't keep the process alive
        }
    } catch (_) { /* never break a caller */ }
}

/** Flush the buffered status changes as one combined email. Always resolves. */
async function flushStatusChanges() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    const batch = statusBuffer;
    statusBuffer = [];
    if (batch.length === 0) return;

    const byStatus = {};
    for (const c of batch) (byStatus[c.next] = byStatus[c.next] || []).push(c);

    const lines = [];
    let grandTotal = 0;
    for (const status of Object.keys(byStatus)) {
        const items = byStatus[status];
        const sum = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        grandTotal += sum;
        lines.push(`${status.toUpperCase()} — ${items.length} payout(s), $${money(sum)}`);
        for (const i of items) {
            lines.push(`  #${i.id} ${i.property || ''} — $${money(i.amount)} (${i.prev || '(none)'} → ${i.next})${i.error ? ` [${i.error}]` : ''}`);
        }
    }
    const anyFailure = batch.some((c) => c.next === 'failed' || c.next === 'topup_failed');
    await notifyOps({
        title: `${batch.length} payout status change${batch.length > 1 ? 's' : ''} — $${money(grandTotal)}`,
        text: lines.join('\n'),
        level: anyFailure ? 'error' : 'info',
    });
}

module.exports = { notifyOps, notifyOpsAsync, opsRecipients, queuePayoutStatusChange, flushStatusChanges };
