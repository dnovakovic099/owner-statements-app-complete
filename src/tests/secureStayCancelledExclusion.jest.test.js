/**
 * SecureStay "Cancelled" exclusion — Jest Test Suite
 *
 * Business rule (Ferdy): when adding SecureStay expenses to a statement, an
 * expense whose Status is "Cancelled" must NOT be added. Every other status
 * (Pending, Approved, Paid, blank, ...) IS added.
 *
 * The manual route (statements-file.js) already enforced this via
 * isCanceledExpense; these tests lock the same behavior into the shared
 * StatementCalculationService.processExpenses(), which drives the
 * auto-generation path and previously had no status gate.
 *
 * Run with: npm run test:jest
 */

const StatementCalculationService = require('../services/StatementCalculationService');

describe('StatementCalculationService.processExpenses — Cancelled exclusion', () => {
    // Period covering all fixture dates below.
    const periodStart = new Date('2026-06-01');
    const periodEnd = new Date('2026-06-30');
    // SecureStay expenses carry propertyId=null (they map by listing name), so
    // the property filter must let them through regardless of propertyIds.
    const propertyIds = [1];
    const listingInfoMap = { 1: { id: 1, cleaningFeePassThrough: false } };

    // Minimal SecureStay-shaped expense. Expenses are negative amounts.
    const makeExpense = (overrides = {}) => ({
        id: 'exp',
        propertyId: null,
        amount: -120,
        date: '2026-06-12',
        category: 'Maintenance',
        type: 'expense',
        description: 'Service call fee',
        status: 'Pending',
        llCover: 0,
        ...overrides,
    });

    const run = (expenses) =>
        StatementCalculationService.processExpenses(
            expenses, propertyIds, periodStart, periodEnd, listingInfoMap, []
        );

    test('a Cancelled expense is excluded from filtered expenses and totals', () => {
        const { filteredExpenses, totalExpenses } = run([
            makeExpense({ id: 'cancelled', status: 'Cancelled', amount: -200 }),
        ]);
        expect(filteredExpenses).toHaveLength(0);
        expect(totalExpenses).toBe(0);
    });

    test.each([
        'Cancelled',
        'Canceled',
        'CANCELLED',
        '  cancelled  ',
        'Payment Cancelled',
    ])('status %p is treated as cancelled and excluded', (status) => {
        const { filteredExpenses } = run([makeExpense({ status })]);
        expect(filteredExpenses).toHaveLength(0);
    });

    test.each([
        'Pending',
        'Approved',
        'Paid',
        'Active',
        '',
        undefined,
    ])('non-cancelled status %p is included', (status) => {
        const { filteredExpenses, totalExpenses } = run([
            makeExpense({ status, amount: -120 }),
        ]);
        expect(filteredExpenses).toHaveLength(1);
        expect(totalExpenses).toBe(120);
    });

    test('only the Cancelled expense is dropped from a mixed batch', () => {
        const { filteredExpenses, totalExpenses } = run([
            makeExpense({ id: 'pending', status: 'Pending', amount: -100 }),
            makeExpense({ id: 'cancelled', status: 'Cancelled', amount: -200 }),
            makeExpense({ id: 'approved', status: 'Approved', amount: -50 }),
            makeExpense({ id: 'no-status', status: undefined, amount: -25 }),
        ]);
        expect(filteredExpenses.map((e) => e.id)).toEqual(['pending', 'approved', 'no-status']);
        expect(totalExpenses).toBe(175); // 100 + 50 + 25; the $200 cancelled is excluded
    });

    test('a Cancelled + LL-Cover expense is excluded entirely (not counted as LL Cover)', () => {
        const { filteredExpenses, llCoverExpenses } = run([
            makeExpense({ id: 'cancelled-llcover', status: 'Cancelled', llCover: 1, amount: -300 }),
        ]);
        expect(filteredExpenses).toHaveLength(0);
        expect(llCoverExpenses).toHaveLength(0);
    });

    test('a live LL-Cover expense is still routed to llCoverExpenses, not filtered expenses', () => {
        const { filteredExpenses, llCoverExpenses } = run([
            makeExpense({ id: 'llcover', status: 'Paid', llCover: 1, amount: -300 }),
        ]);
        expect(filteredExpenses).toHaveLength(0);
        expect(llCoverExpenses.map((e) => e.id)).toEqual(['llcover']);
    });
});
