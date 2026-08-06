/**
 * Payout kill-switch middleware.
 *
 * Two guards, because the payout surface has two kinds of caller:
 *
 *   - `requirePayoutsEnabled` — JSON API (`/api/payouts/*`). Returns 403 with a
 *     machine-readable `code` so the frontend can distinguish "feature is off"
 *     from "you lack permission".
 *   - `requirePayoutsEnabledPage` — owner-facing HTML pages reached from an
 *     emailed link (payout setup, pay, receipt). Those visitors are property
 *     owners, not operators, so they get a plain "temporarily unavailable"
 *     page instead of a JSON error.
 *
 * A 403 is deliberate rather than a 404: the endpoint exists, it is switched
 * off. Pretending it is absent would make an operator debug a routing problem
 * that isn't there.
 */

const { isPayoutsEnabled } = require('../utils/featureFlags');

const DISABLED_MESSAGE = 'Payouts are currently disabled by an administrator.';

async function requirePayoutsEnabled(req, res, next) {
    if (await isPayoutsEnabled()) return next();
    return res.status(403).json({
        error: DISABLED_MESSAGE,
        code: 'PAYOUTS_DISABLED',
    });
}

async function requirePayoutsEnabledPage(req, res, next) {
    if (await isPayoutsEnabled()) return next();
    return res.status(503).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Temporarily Unavailable</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;margin:0">
  <div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:440px;width:100%;text-align:center;padding:48px 32px">
    <h2 style="color:#111827;font-size:17px;font-weight:600;margin:0 0 8px">Temporarily Unavailable</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.5;margin:0">Online payouts are paused right now. Your property manager will be in touch — no action is needed from you, and this link will work again once payouts resume.</p>
  </div>
</body></html>`);
}

module.exports = {
    requirePayoutsEnabled,
    requirePayoutsEnabledPage,
    DISABLED_MESSAGE,
};
