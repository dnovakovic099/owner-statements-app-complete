/**
 * Exclude Cleaning Fee from PM Commission - Test Cases
 *
 * Feature: When a listing has excludeCleaningFromCommission = true, the PM commission
 * is computed on (Revenue - guest-paid Cleaning Fee) instead of the full Revenue.
 *
 * Formula:
 *   Base Rate + Guest Fees - Platform Fees = Revenue            (unchanged)
 *   pmCommission = (Revenue - Cleaning Fee) * PM%               (new)
 *   Gross Payout = Revenue - pmCommission ± Tax                 (same shape)
 *
 * Tax sign depends on platform: Airbnb = tax is remitted by platform (no add),
 * VRBO/Direct = tax is added; disregardTax / airbnbPassThroughTax flags override.
 */

const StatementCalculationService = require('../services/StatementCalculationService');

describe('Exclude Cleaning Fee from PM Commission', () => {

    // Helper to build a minimal reservation
    const makeRes = (overrides = {}) => ({
        propertyId: 1,
        status: 'confirmed',
        source: 'direct',
        checkInDate: '2026-04-01',
        checkOutDate: '2026-04-05',
        grossAmount: 1000,
        cleaningFee: 200,
        hasDetailedFinance: false,
        ...overrides
    });

    const makeListing = (overrides = {}) => ({
        id: 1,
        pmFeePercentage: 20,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false,
        cleaningFeePassThrough: false,
        excludeCleaningFromCommission: false,
        waiveCommission: false,
        ...overrides
    });

    describe('calculateRevenueAndCommission', () => {
        test('baseline: no flag — commission = revenue * pm%', () => {
            const listing = makeListing({ excludeCleaningFromCommission: false });
            const res = makeRes({ grossAmount: 1000, cleaningFee: 200 });
            const { totalRevenue, pmCommission } = StatementCalculationService.calculateRevenueAndCommission(
                [res], { 1: listing }
            );
            expect(totalRevenue).toBe(1000);
            expect(pmCommission).toBeCloseTo(200, 2); // 1000 * 20%
        });

        test('flag on: commission = (revenue - cleaningFee) * pm%, revenue unchanged', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true });
            const res = makeRes({ grossAmount: 1000, cleaningFee: 200 });
            const { totalRevenue, pmCommission } = StatementCalculationService.calculateRevenueAndCommission(
                [res], { 1: listing }
            );
            expect(totalRevenue).toBe(1000);
            expect(pmCommission).toBeCloseTo(160, 2); // (1000 - 200) * 20%
        });

        test('flag on with zero cleaning fee: behaves like baseline', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true });
            const res = makeRes({ grossAmount: 1000, cleaningFee: 0 });
            const { pmCommission } = StatementCalculationService.calculateRevenueAndCommission(
                [res], { 1: listing }
            );
            expect(pmCommission).toBeCloseTo(200, 2);
        });

        test('flag on with cleaning fee larger than revenue: base clamped at 0', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true });
            const res = makeRes({ grossAmount: 100, cleaningFee: 300 });
            const { pmCommission } = StatementCalculationService.calculateRevenueAndCommission(
                [res], { 1: listing }
            );
            expect(pmCommission).toBe(0);
        });

        test('Airbnb co-host listing: revenue skipped regardless of flag', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true, isCohostOnAirbnb: true });
            const res = makeRes({ source: 'airbnb', grossAmount: 1000, cleaningFee: 200 });
            const { totalRevenue, pmCommission } = StatementCalculationService.calculateRevenueAndCommission(
                [res], { 1: listing }
            );
            expect(totalRevenue).toBe(0);
            expect(pmCommission).toBe(0);
        });

        test('multiple reservations mix of sources', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true });
            const reservations = [
                makeRes({ grossAmount: 1000, cleaningFee: 200 }),  // commissionBase 800
                makeRes({ grossAmount: 500,  cleaningFee: 100 }),  // commissionBase 400
            ];
            const { totalRevenue, pmCommission } = StatementCalculationService.calculateRevenueAndCommission(
                reservations, { 1: listing }
            );
            expect(totalRevenue).toBe(1500);
            expect(pmCommission).toBeCloseTo(240, 2); // (800 + 400) * 20%
        });
    });

    describe('calculateGrossPayoutSum', () => {
        test('Airbnb (tax remitted) with flag on: grossPayout = revenue - reducedCommission', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true });
            const res = makeRes({
                source: 'airbnb',
                grossAmount: 1000,
                cleaningFee: 200,
                hasDetailedFinance: true,
                clientRevenue: 1000,
                clientTaxResponsibility: 50
            });
            const gross = StatementCalculationService.calculateGrossPayoutSum(
                [res], { 1: listing }, '2026-04-30', 'checkout'
            );
            // Airbnb without pass-through: tax not added. Commission = (1000-200)*20% = 160
            expect(gross).toBeCloseTo(1000 - 160, 2);
        });

        test('VRBO / direct (tax added) with flag on: grossPayout = revenue - reducedCommission + tax', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true });
            const res = makeRes({
                source: 'vrbo',
                grossAmount: 1000,
                cleaningFee: 200,
                hasDetailedFinance: true,
                clientRevenue: 1000,
                clientTaxResponsibility: 50
            });
            const gross = StatementCalculationService.calculateGrossPayoutSum(
                [res], { 1: listing }, '2026-04-30', 'checkout'
            );
            expect(gross).toBeCloseTo(1000 - 160 + 50, 2);
        });

        test('disregardTax listing: tax ignored even when VRBO', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true, disregardTax: true });
            const res = makeRes({
                source: 'vrbo',
                grossAmount: 1000,
                cleaningFee: 200,
                hasDetailedFinance: true,
                clientRevenue: 1000,
                clientTaxResponsibility: 50
            });
            const gross = StatementCalculationService.calculateGrossPayoutSum(
                [res], { 1: listing }, '2026-04-30', 'checkout'
            );
            expect(gross).toBeCloseTo(1000 - 160, 2);
        });

        test('airbnbPassThroughTax: Airbnb treated like tax-added platform', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true, airbnbPassThroughTax: true });
            const res = makeRes({
                source: 'airbnb',
                grossAmount: 1000,
                cleaningFee: 200,
                hasDetailedFinance: true,
                clientRevenue: 1000,
                clientTaxResponsibility: 50
            });
            const gross = StatementCalculationService.calculateGrossPayoutSum(
                [res], { 1: listing }, '2026-04-30', 'checkout'
            );
            expect(gross).toBeCloseTo(1000 - 160 + 50, 2);
        });

        test('waiveCommission overrides: pmFee deducted is 0 regardless of flag', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true, waiveCommission: true });
            const res = makeRes({
                source: 'vrbo',
                grossAmount: 1000,
                cleaningFee: 200,
                hasDetailedFinance: true,
                clientRevenue: 1000,
                clientTaxResponsibility: 0
            });
            const gross = StatementCalculationService.calculateGrossPayoutSum(
                [res], { 1: listing }, '2026-04-30', 'checkout'
            );
            expect(gross).toBeCloseTo(1000, 2);
        });

        test('Airbnb co-host with flag on: payout = -reducedCommission', () => {
            const listing = makeListing({ excludeCleaningFromCommission: true, isCohostOnAirbnb: true });
            const res = makeRes({
                source: 'airbnb',
                grossAmount: 1000,
                cleaningFee: 200,
                hasDetailedFinance: true,
                clientRevenue: 1000,
                clientTaxResponsibility: 0
            });
            const gross = StatementCalculationService.calculateGrossPayoutSum(
                [res], { 1: listing }, '2026-04-30', 'checkout'
            );
            // co-host: -luxuryFee where luxury = (1000-200)*20% = 160
            expect(gross).toBeCloseTo(-160, 2);
        });
    });

    describe('End-to-end via calculateStatementFinancials', () => {
        test('flag off vs on: pmCommission differs by cleaningFee*pm%, revenue identical', () => {
            const listingOff = makeListing({ excludeCleaningFromCommission: false });
            const listingOn = makeListing({ excludeCleaningFromCommission: true });
            const reservations = [
                makeRes({
                    grossAmount: 1000,
                    cleaningFee: 200,
                    hasDetailedFinance: true,
                    clientRevenue: 1000,
                    clientTaxResponsibility: 0
                })
            ];
            const common = {
                reservations,
                expenses: [],
                propertyIds: [1],
                startDate: '2026-04-01',
                endDate: '2026-04-30',
                calculationType: 'checkout'
            };
            const resultOff = StatementCalculationService.calculateStatementFinancials({
                ...common, listingInfoMap: { 1: listingOff }
            });
            const resultOn = StatementCalculationService.calculateStatementFinancials({
                ...common, listingInfoMap: { 1: listingOn }
            });
            expect(resultOff.totalRevenue).toBe(resultOn.totalRevenue);
            // Commission should drop by 200 * 20% = 40 when flag is on
            expect(resultOff.pmCommission - resultOn.pmCommission).toBeCloseTo(40, 2);
            // Owner payout should grow by the same amount (commission was smaller)
            expect(resultOn.ownerPayout - resultOff.ownerPayout).toBeCloseTo(40, 2);
        });
    });
});
