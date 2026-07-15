/**
 * Payout age lock — Jest Test Suite
 *
 * Business rule (Ferdy): once a statement is 7+ days old, its "Send payout via
 * Increase" button is disabled. Only system users can reactivate it, which starts
 * a fresh 7-day window (can re-lock). Age is measured from payout_reactivated_at
 * when set, otherwise from created_at.
 *
 * Locks the shared helper in utils/payoutLock.js used by both the payout send
 * gate (routes/payouts.js) and the statement list flag (routes/statements-file.js).
 *
 * Run with: npm run test:jest
 */

const { isPayoutLocked, payoutLockAnchor, PAYOUT_LOCK_AGE_MS } = require('../utils/payoutLock');

const DAY = 24 * 60 * 60 * 1000;
// Fixed "now" so the suite is deterministic.
const NOW = new Date('2026-07-12T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * DAY);

describe('payoutLock — PAYOUT_LOCK_AGE_MS', () => {
    test('lock window is exactly 7 days', () => {
        expect(PAYOUT_LOCK_AGE_MS).toBe(7 * DAY);
    });
});

describe('isPayoutLocked — age from createdAt', () => {
    test.each([
        ['created just now', 0, false],
        ['created 6 days ago', 6, false],
        ['created 6.99 days ago', 6.99, false],
        ['created exactly 7 days ago', 7, true],
        ['created 14 days ago', 14, true],
    ])('%s -> locked=%p', (_label, ageDays, expected) => {
        expect(isPayoutLocked({ createdAt: daysAgo(ageDays) }, NOW)).toBe(expected);
    });

    test('accepts snake_case created_at', () => {
        expect(isPayoutLocked({ created_at: daysAgo(9) }, NOW)).toBe(true);
        expect(isPayoutLocked({ created_at: daysAgo(2) }, NOW)).toBe(false);
    });
});

describe('isPayoutLocked — reactivation starts a fresh window (can re-lock)', () => {
    test('reactivated 1 day ago unlocks a 30-day-old statement', () => {
        expect(isPayoutLocked({ createdAt: daysAgo(30), payoutReactivatedAt: daysAgo(1) }, NOW)).toBe(false);
    });

    test('reactivated exactly 7 days ago re-locks', () => {
        expect(isPayoutLocked({ createdAt: daysAgo(30), payoutReactivatedAt: daysAgo(7) }, NOW)).toBe(true);
    });

    test('reactivation takes precedence over createdAt even if createdAt is fresh', () => {
        // Odd data (reactivated older than created); anchor is the reactivation.
        expect(isPayoutLocked({ createdAt: daysAgo(1), payoutReactivatedAt: daysAgo(10) }, NOW)).toBe(true);
    });
});

describe('isPayoutLocked — edge cases', () => {
    test('no anchor -> not locked', () => {
        expect(isPayoutLocked({}, NOW)).toBe(false);
        expect(isPayoutLocked(null, NOW)).toBe(false);
        expect(isPayoutLocked(undefined, NOW)).toBe(false);
    });

    test('invalid date -> not locked', () => {
        expect(isPayoutLocked({ createdAt: 'not-a-date' }, NOW)).toBe(false);
    });
});

describe('payoutLockAnchor', () => {
    test('prefers reactivation timestamp over creation', () => {
        const anchor = payoutLockAnchor({ createdAt: daysAgo(30), payoutReactivatedAt: daysAgo(2) });
        expect(anchor.getTime()).toBe(daysAgo(2).getTime());
    });

    test('falls back to creation timestamp', () => {
        const anchor = payoutLockAnchor({ createdAt: daysAgo(5) });
        expect(anchor.getTime()).toBe(daysAgo(5).getTime());
    });

    test('returns null with no timestamps', () => {
        expect(payoutLockAnchor({})).toBeNull();
    });
});
