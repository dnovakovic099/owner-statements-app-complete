/**
 * PM fee transition schedule — Jest Suite
 *
 * Verifies _getEffectivePmFee picks the correct PM % for a reservation based on
 * its created_at date, across a multi-entry pmFeeSchedule as well as the legacy
 * single newPmFee* fields. Run: npm run test:jest
 *
 * Real-world scenario (W Cliff): base 15%, up to 20% on 2026-02-01, back to 15%
 * on 2026-07-20 — applied to new bookings by created date.
 */

const calc = require('../services/StatementCalculationService');

const base = { pmFeePercentage: 15 };
const fee = (listing, createdAt) => calc.getEffectivePmFee(listing, createdAt);

describe('_getEffectivePmFee with multi-entry pmFeeSchedule', () => {
    const wCliff = {
        pmFeePercentage: 15,
        pmFeeSchedule: [
            { percentage: 20, startDate: '2026-02-01' },
            { percentage: 15, startDate: '2026-07-20' },
        ],
    };

    test('booking created before the first transition uses the base fee', () => {
        expect(fee(wCliff, '2026-01-15T10:00:00Z')).toBe(15);
    });

    test('booking on the first start date uses the first transition (inclusive)', () => {
        expect(fee(wCliff, '2026-02-01T00:00:00Z')).toBe(20);
    });

    test('booking between the two transitions uses 20%', () => {
        expect(fee(wCliff, '2026-05-10T12:00:00Z')).toBe(20);
    });

    test('booking on/after the second start date reverts to 15%', () => {
        expect(fee(wCliff, '2026-07-20T00:00:00Z')).toBe(15);
        expect(fee(wCliff, '2026-08-01T09:00:00Z')).toBe(15);
    });

    test('unsorted schedule input is handled (sorted internally)', () => {
        const unsorted = {
            pmFeePercentage: 15,
            pmFeeSchedule: [
                { percentage: 15, startDate: '2026-07-20' },
                { percentage: 20, startDate: '2026-02-01' },
            ],
        };
        expect(fee(unsorted, '2026-03-01T00:00:00Z')).toBe(20);
        expect(fee(unsorted, '2026-08-01T00:00:00Z')).toBe(15);
    });

    test('missing created date falls back to the base fee', () => {
        expect(fee(wCliff, null)).toBe(15);
    });

    test('invalid entries in the schedule are ignored', () => {
        const withJunk = {
            pmFeePercentage: 15,
            pmFeeSchedule: [
                { percentage: 20, startDate: '2026-02-01' },
                { percentage: NaN, startDate: '2026-03-01' },
                { percentage: 25, startDate: 'not-a-date' },
            ],
        };
        expect(fee(withJunk, '2026-03-15T00:00:00Z')).toBe(20);
    });
});

describe('_getEffectivePmFee backward compatibility', () => {
    test('legacy single newPmFee* fields still apply when no schedule present', () => {
        const legacy = {
            pmFeePercentage: 15,
            newPmFeeEnabled: true,
            newPmFeePercentage: 20,
            newPmFeeStartDate: '2026-02-01',
        };
        expect(fee(legacy, '2026-01-01T00:00:00Z')).toBe(15);
        expect(fee(legacy, '2026-03-01T00:00:00Z')).toBe(20);
    });

    test('pmFeeSchedule takes precedence over legacy fields when both present', () => {
        const both = {
            pmFeePercentage: 15,
            newPmFeeEnabled: true,
            newPmFeePercentage: 99,
            newPmFeeStartDate: '2026-02-01',
            pmFeeSchedule: [{ percentage: 20, startDate: '2026-02-01' }],
        };
        expect(fee(both, '2026-03-01T00:00:00Z')).toBe(20);
    });

    test('no transition config at all returns the base fee', () => {
        expect(fee(base, '2026-03-01T00:00:00Z')).toBe(15);
    });

    test('empty schedule array falls through to base fee', () => {
        expect(fee({ pmFeePercentage: 18, pmFeeSchedule: [] }, '2026-03-01T00:00:00Z')).toBe(18);
    });

    test('base fee defaults to 15 when pmFeePercentage is unset', () => {
        expect(fee({}, '2026-03-01T00:00:00Z')).toBe(15);
    });
});
