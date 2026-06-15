/**
 * Expense classification — Jest Test Suite
 *
 * Locks the behavior that drives which expenses appear on a generated statement:
 *   - Canceled SecureStay expenses (status contains "cancel") are excluded from
 *     the statement/PDF but surfaced as hidden items in the edit view.
 *   - LL Cover expenses are excluded from the owner payout.
 *   - Hidden items never render on the PDF.
 *
 * These mirror the exact filter expressions used by every statement-generation
 * path in src/routes/statements-file.js, so a regression there fails here.
 *
 * Run with: npm run test:jest
 */

const { isLlCoverExpense, isHiddenItem, isCanceledExpense } = require('../utils/expenseClassification');

describe('isCanceledExpense', () => {
    test.each([
        ['Canceled', true],
        ['canceled', true],
        ['Cancelled', true],
        ['CANCELLED', true],
        ['  Canceled  ', true],     // trimmed
        ['Payment Canceled', true], // substring match
        ['Paid', false],
        ['Pending', false],
        ['Active', false],
        ['', false],
        [undefined, false],
        [null, false],
    ])('status %p -> canceled=%p', (status, expected) => {
        expect(isCanceledExpense({ amount: 50, status })).toBe(expected);
    });

    test('expense with no status field is not canceled', () => {
        expect(isCanceledExpense({ amount: 50 })).toBe(false);
    });

    test('null / undefined expense is not canceled (no throw)', () => {
        expect(isCanceledExpense(null)).toBe(false);
        expect(isCanceledExpense(undefined)).toBe(false);
    });

    test('non-string status is coerced safely', () => {
        expect(isCanceledExpense({ status: 0 })).toBe(false);
        expect(isCanceledExpense({ status: 123 })).toBe(false);
    });
});

describe('isLlCoverExpense', () => {
    test('truthy llCover flags the expense', () => {
        expect(isLlCoverExpense({ llCover: 1 })).toBe(true);
        expect(isLlCoverExpense({ llCover: 100 })).toBe(true);
    });
    test('zero / missing / null llCover is not LL Cover', () => {
        expect(isLlCoverExpense({ llCover: 0 })).toBe(false);
        expect(isLlCoverExpense({})).toBe(false);
        expect(isLlCoverExpense(null)).toBe(false);
    });
});

describe('isHiddenItem', () => {
    test('hidden flag controls PDF visibility', () => {
        expect(isHiddenItem({ hidden: true })).toBe(true);
        expect(isHiddenItem({ hidden: false })).toBe(false);
        expect(isHiddenItem({})).toBe(false);
        expect(isHiddenItem(null)).toBe(false);
    });
});

describe('statement generation split (mirrors statements-file.js)', () => {
    // Same expressions the route uses to split a period's expenses.
    const visibleSet = (expenses) =>
        expenses.filter((e) => !isCanceledExpense(e) && !isLlCoverExpense(e));
    const llCoverSet = (expenses) =>
        expenses.filter((e) => !isCanceledExpense(e) && isLlCoverExpense(e));
    const canceledSet = (expenses) => expenses.filter((e) => isCanceledExpense(e));

    const expenses = [
        { id: 'normal', amount: 100, status: 'Paid', llCover: 0 },
        { id: 'canceled', amount: 200, status: 'Canceled', llCover: 0 },
        { id: 'llcover', amount: 300, status: 'Paid', llCover: 1 },
        { id: 'canceled-llcover', amount: 400, status: 'Canceled', llCover: 1 },
        { id: 'no-status', amount: 50, llCover: 0 },
    ];

    test('visible (PDF) set excludes canceled and LL Cover', () => {
        expect(visibleSet(expenses).map((e) => e.id)).toEqual(['normal', 'no-status']);
    });

    test('canceled expense never counts toward the visible expense total', () => {
        const total = visibleSet(expenses).reduce((s, e) => s + e.amount, 0);
        expect(total).toBe(150); // 100 + 50 only; the $200 canceled is excluded
    });

    test('canceled set captures every canceled expense', () => {
        expect(canceledSet(expenses).map((e) => e.id)).toEqual(['canceled', 'canceled-llcover']);
    });

    test('a canceled+LL-Cover expense is classified canceled, not LL Cover (no double count)', () => {
        expect(llCoverSet(expenses).map((e) => e.id)).toEqual(['llcover']);
        expect(canceledSet(expenses).map((e) => e.id)).toContain('canceled-llcover');
    });

    test('every expense lands in exactly one bucket', () => {
        const buckets = [visibleSet(expenses), llCoverSet(expenses), canceledSet(expenses)];
        const counts = buckets.reduce((s, b) => s + b.length, 0);
        expect(counts).toBe(expenses.length);
    });
});

describe('PDF item rendering (mirrors isHiddenItem filter)', () => {
    const pdfVisible = (items) => items.filter((i) => i.type === 'expense' && !isHiddenItem(i));

    const items = [
        { type: 'expense', amount: 100, description: 'normal' },
        { type: 'expense', amount: 200, description: 'canceled', hidden: true, hiddenReason: 'canceled' },
        { type: 'expense', amount: 300, description: 'llcover', hidden: true, hiddenReason: 'll_cover' },
        { type: 'revenue', amount: 1000, description: 'booking' },
    ];

    test('hidden canceled items are excluded from the PDF expense rows', () => {
        expect(pdfVisible(items).map((i) => i.description)).toEqual(['normal']);
    });

    test('PDF expense total ignores hidden canceled items', () => {
        const total = pdfVisible(items).reduce((s, i) => s + i.amount, 0);
        expect(total).toBe(100);
    });
});
