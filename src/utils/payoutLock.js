/**
 * Payout age lock — shared by the payout send endpoints (routes/payouts.js) and
 * the statement list (routes/statements-file.js) so the server-side gate and the
 * client-facing `isPayoutLocked` flag always agree.
 *
 * Rule: an Increase payout is disabled once the statement is 7+ days old. Age is
 * measured from `payoutReactivatedAt` when a system user has reactivated the
 * statement (which starts a fresh window), otherwise from `createdAt`. Only
 * system users can reactivate an aged statement — see
 * POST /api/payouts/statements/:id/reactivate-payout.
 */

const PAYOUT_LOCK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Timestamp the payout-lock age is measured from: the last reactivation if set,
 * else the statement's creation time. Accepts camelCase or snake_case (the DB
 * row `toJSON()` yields camelCase; be defensive either way). Returns null if
 * neither is present.
 */
function payoutLockAnchor(statement) {
    if (!statement) return null;
    const anchor =
        statement.payoutReactivatedAt ||
        statement.payout_reactivated_at ||
        statement.createdAt ||
        statement.created_at;
    return anchor ? new Date(anchor) : null;
}

/**
 * True when a statement's Increase payout is locked by age (>= 7 days since the
 * lock anchor). A statement with no resolvable anchor is treated as not locked.
 */
function isPayoutLocked(statement, now = Date.now()) {
    const anchor = payoutLockAnchor(statement);
    if (!anchor || Number.isNaN(anchor.getTime())) return false;
    return now - anchor.getTime() >= PAYOUT_LOCK_AGE_MS;
}

module.exports = { PAYOUT_LOCK_AGE_MS, payoutLockAnchor, isPayoutLocked };
