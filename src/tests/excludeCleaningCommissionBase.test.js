/**
 * Exclude Cleaning Fee from PM Commission — render-layer regression
 *
 * Background: c345d4e added the listing flag and wired the math through
 * the calc service, but the HTML render and dashboard pmCommission summary
 * still multiplied the full revenue by the PM percentage. The fix in
 * e431e74 patched the four downstream sites; the follow-up consolidates
 * all of them onto StatementCalculationService.getCommissionBase so they
 * cannot drift apart again.
 *
 * Spec from Louis (2026-04-22 thread):
 *   Base Rate + Guest Fees - Platform Fees = Revenue            (unchanged)
 *   (Revenue - Cleaning Fee) x PM Commission % = PM Commission   (when flag on)
 *   Then Revenue - PM Commission ± Tax = Gross Payout            (unchanged)
 *
 * Examples Louis explicitly called out as broken:
 *   - Nicholas Villanueva: Rev $1,293.60, cleaning $600, PM 10% → $69.36
 *   - Alejandra Montano:   Rev $1,551.42, cleaning $600, PM 10% → $95.14
 *     (Louis's text used $1,554.42 → $95.44 because he was working from
 *      Base Rate $939; the data has $936. The formula is identical; only
 *      the input differs by $3.)
 */

const StatementCalculationService = require('../services/StatementCalculationService');

const round2 = (n) => Math.round(n * 100) / 100;

describe('StatementCalculationService.getCommissionBase', () => {
    describe("Louis's spec — flag ON", () => {
        const flagOn = { excludeCleaningFromCommission: true, pmFeePercentage: 10 };

        test('Nicholas Villanueva: $1,293.60 - $600 = $693.60 → $69.36 commission', () => {
            const res = { cleaningFee: 600 };
            const base = StatementCalculationService.getCommissionBase(res, flagOn, 1293.60);
            expect(round2(base)).toBe(693.60);
            expect(round2(base * 0.10)).toBe(69.36);
        });

        test('Alejandra Montano: $1,551.42 - $600 = $951.42 → $95.14 commission', () => {
            const res = { cleaningFee: 600 };
            const base = StatementCalculationService.getCommissionBase(res, flagOn, 1551.42);
            expect(round2(base)).toBe(951.42);
            expect(round2(base * 0.10)).toBe(95.14);
        });

        test('Briana Desaulniers: $1,824.89 - $400 = $1,424.89 → $142.49 commission', () => {
            const res = { cleaningFee: 400 };
            const base = StatementCalculationService.getCommissionBase(res, flagOn, 1824.89);
            expect(round2(base)).toBe(1424.89);
            expect(round2(base * 0.10)).toBe(142.49);
        });

        test("Louis's literal text example using Base $939: $1,554.42 → $95.44", () => {
            // Reproduces Louis's exact arithmetic so future readers can match
            // his message verbatim if needed.
            const res = { cleaningFee: 600 };
            const base = StatementCalculationService.getCommissionBase(res, flagOn, 1554.42);
            expect(round2(base)).toBe(954.42);
            expect(round2(base * 0.10)).toBe(95.44);
        });
    });

    describe('flag OFF — base equals full revenue', () => {
        test('flag absent → revenue passes through', () => {
            const res = { cleaningFee: 600 };
            const listing = {};
            expect(StatementCalculationService.getCommissionBase(res, listing, 1293.60)).toBe(1293.60);
        });

        test('flag explicitly false → revenue passes through', () => {
            const res = { cleaningFee: 600 };
            const listing = { excludeCleaningFromCommission: false };
            expect(StatementCalculationService.getCommissionBase(res, listing, 1293.60)).toBe(1293.60);
        });

        test('listing missing entirely (defensive) → revenue passes through', () => {
            const res = { cleaningFee: 600 };
            expect(StatementCalculationService.getCommissionBase(res, null, 1293.60)).toBe(1293.60);
            expect(StatementCalculationService.getCommissionBase(res, undefined, 1293.60)).toBe(1293.60);
        });
    });

    describe('edge cases', () => {
        const flagOn = { excludeCleaningFromCommission: true };

        test('zero cleaning fee → revenue passes through (no subtraction)', () => {
            expect(StatementCalculationService.getCommissionBase({ cleaningFee: 0 }, flagOn, 500)).toBe(500);
        });

        test('missing cleaningFee field → revenue passes through', () => {
            expect(StatementCalculationService.getCommissionBase({}, flagOn, 500)).toBe(500);
        });

        test('cleaning fee given as a numeric string → still subtracted', () => {
            const base = StatementCalculationService.getCommissionBase({ cleaningFee: '600' }, flagOn, 1293.60);
            expect(round2(base)).toBe(693.60);
        });

        test('cleaning fee larger than revenue → base clamped at 0, never negative', () => {
            const base = StatementCalculationService.getCommissionBase({ cleaningFee: 800 }, flagOn, 500);
            expect(base).toBe(0);
        });

        test('cleaning fee equal to revenue → base is exactly 0', () => {
            const base = StatementCalculationService.getCommissionBase({ cleaningFee: 500 }, flagOn, 500);
            expect(base).toBe(0);
        });

        test('garbage cleaningFee (NaN-producing) → revenue passes through', () => {
            const base = StatementCalculationService.getCommissionBase({ cleaningFee: 'not a number' }, flagOn, 500);
            expect(base).toBe(500);
        });
    });

    describe('parity with calculateRevenueAndCommission (calc service end-to-end)', () => {
        test('flag ON drops pmCommission by exactly Σ(cleaning × pm%); revenue identical', () => {
            const reservations = [
                { propertyId: 1, hasDetailedFinance: true, clientRevenue: 1293.60, cleaningFee: 600, source: 'vrbo' },
                { propertyId: 1, hasDetailedFinance: true, clientRevenue: 1551.42, cleaningFee: 600, source: 'airbnb' },
                { propertyId: 1, hasDetailedFinance: true, clientRevenue: 1824.89, cleaningFee: 400, source: 'airbnb' }
            ];
            const baseListing = { id: 1, pmFeePercentage: 10 };
            const flagOff = { 1: { ...baseListing, excludeCleaningFromCommission: false } };
            const flagOn = { 1: { ...baseListing, excludeCleaningFromCommission: true } };

            const off = StatementCalculationService.calculateRevenueAndCommission(reservations, flagOff);
            const on = StatementCalculationService.calculateRevenueAndCommission(reservations, flagOn);

            expect(round2(off.totalRevenue)).toBe(round2(on.totalRevenue));

            const expectedDrop = round2((600 + 600 + 400) * 0.10);
            expect(round2(off.pmCommission - on.pmCommission)).toBe(expectedDrop);

            // Per-reservation expected commission with flag on
            const expectedCommissionOn = round2(
                (1293.60 - 600) * 0.10 +
                (1551.42 - 600) * 0.10 +
                (1824.89 - 400) * 0.10
            );
            expect(round2(on.pmCommission)).toBe(expectedCommissionOn);
        });

        test('mixed listings: only the flagged one subtracts cleaning', () => {
            const reservations = [
                { propertyId: 1, hasDetailedFinance: true, clientRevenue: 1000, cleaningFee: 200, source: 'vrbo' },
                { propertyId: 2, hasDetailedFinance: true, clientRevenue: 1000, cleaningFee: 200, source: 'vrbo' }
            ];
            const listingInfoMap = {
                1: { id: 1, pmFeePercentage: 10, excludeCleaningFromCommission: true },
                2: { id: 2, pmFeePercentage: 10, excludeCleaningFromCommission: false }
            };
            const result = StatementCalculationService.calculateRevenueAndCommission(reservations, listingInfoMap);
            // Listing 1: (1000 - 200) * 0.10 = 80
            // Listing 2: 1000 * 0.10 = 100
            expect(round2(result.pmCommission)).toBe(180);
        });
    });

    describe('parity with calculateGrossPayoutSum', () => {
        test('VRBO with flag on: gross payout reflects the reduced commission', () => {
            const res = {
                propertyId: 1, hasDetailedFinance: true, clientRevenue: 1293.60, cleaningFee: 600,
                clientTaxResponsibility: 100, source: 'vrbo'
            };
            const listingInfoMap = {
                1: { id: 1, pmFeePercentage: 10, excludeCleaningFromCommission: true, disregardTax: false }
            };
            const sum = StatementCalculationService.calculateGrossPayoutSum([res], listingInfoMap, '2026-04-30', 'checkout');
            // commission = (1293.60 - 600) * 0.10 = 69.36
            // gross = 1293.60 - 69.36 + 100 = 1324.24
            expect(round2(sum)).toBe(1324.24);
        });

        test('Airbnb (tax remitted) with flag on: tax not added, just lower commission', () => {
            const res = {
                propertyId: 1, hasDetailedFinance: true, clientRevenue: 1551.42, cleaningFee: 600,
                clientTaxResponsibility: 100, source: 'airbnb'
            };
            const listingInfoMap = {
                1: { id: 1, pmFeePercentage: 10, excludeCleaningFromCommission: true,
                     disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false }
            };
            const sum = StatementCalculationService.calculateGrossPayoutSum([res], listingInfoMap, '2026-04-30', 'checkout');
            // commission = (1551.42 - 600) * 0.10 = 95.142
            // gross = 1551.42 - 95.142 = 1456.278
            expect(round2(sum)).toBe(1456.28);
        });
    });
});
