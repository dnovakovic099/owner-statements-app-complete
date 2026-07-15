/**
 * Cleaning-fee passthrough — "Special/Extra Cleaning" inclusion — Jest Suite
 *
 * Business rule (Ferdy): on a property with cleaning-fee passthrough enabled, a
 * SecureStay expense whose category is "Cleaning" must NOT appear on the
 * statement (the guest-paid cleaning fee already covers standard turnover
 * cleaning). But "Special Cleaning" / "Extra Cleaning" is an ADDITIONAL service
 * and MUST appear.
 *
 * These lock the token-aware isStandardCleaning gate into the shared
 * StatementCalculationService.processExpenses(). Previously the filter used
 * `category.includes('cleaning')`, which wrongly matched "Extra Cleaning" too
 * and dropped it.
 *
 * Run with: npm run test:jest
 */

const StatementCalculationService = require('../services/StatementCalculationService');
const {
    isStandardCleaning,
    isSuppliesExpense,
    isPassThroughCoveredExpense
} = require('../utils/expenseClassification');

describe('isStandardCleaning classification', () => {
    test.each([
        ['Cleaning', true],
        ['cleaning', true],
        ['Cleaning, Supplies', true],       // comma list containing a plain cleaning token
        ['Cleaning, Extra Cleaning', true],  // has a standard-cleaning token
    ])('category %p -> standard cleaning = %p', (category, expected) => {
        expect(isStandardCleaning({ category })).toBe(expected);
    });

    test.each([
        ['Special Cleaning', false],
        ['Extra Cleaning', false],
        ['Extra Cleaning, Claim', false],
        ['Deep Cleaning', false],
        ['Supplies', false],                 // supplies is NOT standard cleaning here
        ['Lawn', false],
        ['', false],
    ])('category %p -> standard cleaning = %p', (category, expected) => {
        expect(isStandardCleaning({ category })).toBe(expected);
    });

    test('falls back to type === "cleaning" when category is absent', () => {
        expect(isStandardCleaning({ type: 'cleaning' })).toBe(true);
        expect(isStandardCleaning({ type: 'extra cleaning' })).toBe(false);
    });

    test('null / undefined expense is not cleaning', () => {
        expect(isStandardCleaning(null)).toBe(false);
        expect(isStandardCleaning(undefined)).toBe(false);
    });

    test('classifies supplies without treating special cleaning as pass-through covered', () => {
        expect(isSuppliesExpense({ category: 'Supplies, Claims' })).toBe(true);
        expect(isSuppliesExpense({ description: 'Hefty trash bags and supplies' })).toBe(true);
        expect(isPassThroughCoveredExpense({ category: 'Special Cleaning' })).toBe(false);
    });
});

describe('processExpenses — passthrough drops Cleaning, keeps Special Cleaning', () => {
    const periodStart = new Date('2026-06-01');
    const periodEnd = new Date('2026-06-30');
    const propertyIds = [1];

    const makeExpense = (overrides = {}) => ({
        id: 'exp',
        propertyId: 1,
        amount: -150,
        date: '2026-06-12',
        category: 'Cleaning',
        type: 'expense',
        description: 'Turnover cleaning',
        status: 'Paid',
        llCover: 0,
        ...overrides,
    });

    const run = (expenses, cleaningFeePassThrough) =>
        StatementCalculationService.processExpenses(
            expenses,
            propertyIds,
            periodStart,
            periodEnd,
            { 1: { id: 1, cleaningFeePassThrough } },
            []
        );

    test('passthrough ON: "Cleaning" is excluded', () => {
        const { filteredExpenses } = run([makeExpense({ category: 'Cleaning' })], true);
        expect(filteredExpenses).toHaveLength(0);
    });

    test.each(['Special Cleaning', 'Extra Cleaning'])(
        'passthrough ON: %p is INCLUDED',
        (category) => {
            const { filteredExpenses } = run([makeExpense({ id: 'x', category })], true);
            expect(filteredExpenses).toHaveLength(1);
            expect(filteredExpenses[0].category).toBe(category);
        }
    );

    test('passthrough ON: Supplies still excluded (unchanged behavior)', () => {
        const { filteredExpenses } = run([makeExpense({ category: 'Supplies' })], true);
        expect(filteredExpenses).toHaveLength(0);
    });

    test('passthrough OFF: "Cleaning" is NOT excluded', () => {
        const { filteredExpenses } = run([makeExpense({ category: 'Cleaning' })], false);
        expect(filteredExpenses).toHaveLength(1);
    });

    test('mixed batch under passthrough: only standard Cleaning is dropped', () => {
        const { filteredExpenses } = run(
            [
                makeExpense({ id: 'std', category: 'Cleaning' }),
                makeExpense({ id: 'special', category: 'Special Cleaning' }),
                makeExpense({ id: 'extra', category: 'Extra Cleaning' }),
                makeExpense({ id: 'maint', category: 'Maintenance' }),
            ],
            true
        );
        const ids = filteredExpenses.map((e) => e.id).sort();
        expect(ids).toEqual(['extra', 'maint', 'special']);
    });

    test('statement #8385 regression: API-shaped LL Cover and supplies never reduce payout', () => {
        const propertyId = 300028032;
        const result = StatementCalculationService.processExpenses(
            [
                makeExpense({
                    id: 9121,
                    propertyId: null,
                    secureStayListingId: propertyId,
                    category: 'Resolutions',
                    type: 'Resolutions',
                    description: 'adjustment: double payout for 6/22 statement',
                    amount: -1061,
                }),
                makeExpense({
                    id: 9078,
                    propertyId: null,
                    secureStayListingId: propertyId,
                    category: 'Supplies, Claims',
                    type: 'Supplies, Claims',
                    description: 'Trash bags for unit 31',
                    amount: -48.64,
                    llCover: 1,
                }),
                makeExpense({
                    id: 9024,
                    propertyId: null,
                    secureStayListingId: propertyId,
                    category: 'Supplies',
                    type: 'Supplies',
                    description: 'Hefty trash bags',
                    amount: -35.30,
                }),
            ],
            [propertyId],
            periodStart,
            periodEnd,
            { [propertyId]: { id: propertyId, cleaningFeePassThrough: true } },
            []
        );

        expect(result.filteredExpenses.map(expense => expense.id)).toEqual([9121]);
        expect(result.llCoverExpenses.map(expense => expense.id)).toEqual([9078]);
        expect(result.totalExpenses).toBe(1061);
    });
});
