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

const fs = require('fs');
const path = require('path');
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
 * @param {{title:string, text?:string, html?:string, subject?:string, fields?:Array<{label:string,value:string}>, level?:'info'|'success'|'warn'|'error'}} msg
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
    // A pre-built subject wins; otherwise prefix with the level for scannability.
    const subject = msg.subject || `[${level}] ${msg.title}`;
    try {
        await EmailService.sendOpsAlert(recipients.join(','), subject, bodyLines.join('\n'), msg.html || null);
    } catch (e) {
        logger.warn('[notify] ops email failed', { error: e?.message, title: msg.title });
    }
}

/** Fire-and-forget wrapper for hot paths (never awaited by the caller). */
function notifyOpsAsync(msg) {
    notifyOps(msg).catch((e) => logger.warn('[notify] notifyOpsAsync failed', { error: e?.message }));
}

// ─── Daily payout status-change digest ─────────────────────────────────────
// Payout status changes are accumulated all day and sent as ONE end-of-day
// digest email (see the daily scheduler in server.js), instead of a burst of
// small emails. The buffer is persisted to disk so a process restart / redeploy
// mid-day does not lose the day's accumulated changes.
const DIGEST_BUFFER_FILE = process.env.PAYOUT_DIGEST_BUFFER_FILE || path.join(__dirname, '../../data/payout-digest-buffer.json');
let statusBuffer = loadBuffer();

const round2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
const usd = (v) => round2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Best-effort load of the persisted buffer (survives restarts). Never throws. */
function loadBuffer() {
    try {
        if (fs.existsSync(DIGEST_BUFFER_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(DIGEST_BUFFER_FILE, 'utf8'));
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        logger.warn('[notify] failed to load payout digest buffer', { error: e?.message });
    }
    return [];
}

/** Best-effort persist of the current buffer. Never throws. */
function persistBuffer() {
    try {
        fs.mkdirSync(path.dirname(DIGEST_BUFFER_FILE), { recursive: true });
        fs.writeFileSync(DIGEST_BUFFER_FILE, JSON.stringify(statusBuffer), 'utf8');
    } catch (e) {
        logger.warn('[notify] failed to persist payout digest buffer', { error: e?.message });
    }
}

/**
 * Record a single payout status change for the end-of-day digest. Synchronous
 * and never throws — safe to call from a DB hook. The change is persisted so it
 * survives a restart before the digest is sent.
 * @param {{id:number|string, prev?:string, next:string, amount?:number, property?:string, owner?:string, error?:string}} change
 */
function queuePayoutStatusChange(change) {
    try {
        statusBuffer.push({ ...change, at: new Date().toISOString() });
        persistBuffer();
    } catch (_) { /* never break a caller */ }
}

/** How many changes are waiting in the digest buffer. */
function pendingDigestCount() {
    return statusBuffer.length;
}

// Order statuses so the most actionable appear first in the digest.
const STATUS_ORDER = ['failed', 'topup_failed', 'awaiting_funding', 'collected', 'invoice_sent', 'paid', 'cancelled'];
const STATUS_STYLE = {
    paid: { label: 'Paid', color: '#0f7a3d', bg: '#e6f4ea' },
    failed: { label: 'Failed', color: '#b42318', bg: '#fee4e2' },
    topup_failed: { label: 'Top-up failed', color: '#b42318', bg: '#fee4e2' },
    awaiting_funding: { label: 'Awaiting funding', color: '#b54708', bg: '#fef0c7' },
    collected: { label: 'Collected', color: '#175cd3', bg: '#d1e9ff' },
    invoice_sent: { label: 'Invoice sent', color: '#175cd3', bg: '#d1e9ff' },
    cancelled: { label: 'Cancelled', color: '#475467', bg: '#eaecf0' },
};
const prettyStatus = (s) => (STATUS_STYLE[s] ? STATUS_STYLE[s].label : String(s || '').replace(/_/g, ' '));

/** Build the HTML body of the daily digest from grouped changes. */
function renderDigestHtml(byStatus, statuses, grandTotal, dateLabel, total) {
    const chips = statuses.map((st) => {
        const s = STATUS_STYLE[st] || { label: prettyStatus(st), color: '#475467', bg: '#eaecf0' };
        return `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:999px;background:${s.bg};color:${s.color};font-size:12px;font-weight:600;">${esc(s.label)} · ${byStatus[st].length}</span>`;
    }).join('');

    const sections = statuses.map((st) => {
        const s = STATUS_STYLE[st] || { label: prettyStatus(st), color: '#475467', bg: '#eaecf0' };
        const items = byStatus[st];
        const sum = items.reduce((a, i) => a + (parseFloat(i.amount) || 0), 0);
        const rows = items.map((i) => `
            <tr>
                <td style="padding:8px 10px;border-top:1px solid #eaecf0;font-size:13px;color:#101828;white-space:nowrap;font-weight:600;">#${esc(i.id)}</td>
                <td style="padding:8px 10px;border-top:1px solid #eaecf0;font-size:13px;color:#344054;">${esc(i.property || '—')}${i.owner ? `<div style="color:#667085;font-size:12px;">${esc(i.owner)}</div>` : ''}</td>
                <td style="padding:8px 10px;border-top:1px solid #eaecf0;font-size:13px;color:#344054;white-space:nowrap;">${esc(prettyStatus(i.prev) || '—')} &rarr; ${esc(prettyStatus(i.next))}</td>
                <td style="padding:8px 10px;border-top:1px solid #eaecf0;font-size:13px;color:#101828;text-align:right;white-space:nowrap;font-weight:600;">$${usd(i.amount)}</td>
            </tr>${i.error ? `<tr><td colspan="4" style="padding:0 10px 8px 10px;font-size:12px;color:#b42318;">⚠ ${esc(i.error)}</td></tr>` : ''}`).join('');
        return `
        <div style="margin:22px 0 0 0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${s.bg};color:${s.color};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">${esc(s.label)}</span>
                <span style="color:#667085;font-size:12px;">${items.length} · $${usd(sum)}</span>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;border:1px solid #eaecf0;border-radius:8px;overflow:hidden;">
                ${rows}
            </table>
        </div>`;
    }).join('');

    return `<!doctype html><html><body style="margin:0;background:#f2f4f7;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.1);">
        <tr><td style="background:#0f5132;padding:22px 28px;">
            <div style="color:#a7f3c9;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;">Luxury Lodging · Payouts</div>
            <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">Daily payout digest</div>
            <div style="color:#c8e6d3;font-size:13px;margin-top:2px;">${esc(dateLabel)}</div>
        </td></tr>
        <tr><td style="padding:24px 28px 8px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:13px;color:#667085;">${total} status change${total > 1 ? 's' : ''} today</td>
                <td style="text-align:right;font-size:22px;font-weight:700;color:#101828;">$${usd(grandTotal)}</td>
            </tr></table>
            <div style="margin-top:12px;">${chips}</div>
        </td></tr>
        <tr><td style="padding:0 28px 28px 28px;">${sections}</td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #eaecf0;color:#98a2b3;font-size:11px;">
            Automated end-of-day summary of payout status changes. You are receiving this as a member of the LL payouts ops team.
        </td></tr>
    </table>
    </td></tr></table>
    </body></html>`;
}

/**
 * Flush the accumulated status changes as ONE digest email and clear the buffer.
 * Called by the end-of-day scheduler (and by tests). Always resolves; no-op when
 * the buffer is empty.
 */
async function flushStatusChanges() {
    const batch = statusBuffer;
    statusBuffer = [];
    persistBuffer();
    if (batch.length === 0) return;

    const byStatus = {};
    for (const c of batch) (byStatus[c.next] = byStatus[c.next] || []).push(c);
    const statuses = Object.keys(byStatus).sort((a, b) => {
        const ia = STATUS_ORDER.indexOf(a), ib = STATUS_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    let grandTotal = 0;
    const lines = [];
    for (const status of statuses) {
        const items = byStatus[status];
        const sum = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        grandTotal += sum;
        lines.push(`${prettyStatus(status).toUpperCase()} — ${items.length} payout(s), $${usd(sum)}`);
        for (const i of items) {
            lines.push(`  #${i.id} ${i.property || ''} — $${usd(i.amount)} (${prettyStatus(i.prev) || '(none)'} → ${prettyStatus(i.next)})${i.error ? ` [${i.error}]` : ''}`);
        }
    }

    const dateLabel = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const anyFailure = batch.some((c) => c.next === 'failed' || c.next === 'topup_failed');
    const shortDate = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    const subject = `${anyFailure ? '[ACTION NEEDED] ' : ''}Payout digest · ${shortDate} · ${batch.length} update${batch.length > 1 ? 's' : ''} · $${usd(grandTotal)}`;

    await notifyOps({
        subject,
        title: `${batch.length} payout status change${batch.length > 1 ? 's' : ''} — $${usd(grandTotal)}`,
        text: lines.join('\n'),
        html: renderDigestHtml(byStatus, statuses, grandTotal, dateLabel, batch.length),
        level: anyFailure ? 'error' : 'info',
    });
}

module.exports = { notifyOps, notifyOpsAsync, opsRecipients, queuePayoutStatusChange, flushStatusChanges, pendingDigestCount };
