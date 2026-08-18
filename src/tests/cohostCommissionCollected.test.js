/**
 * Second co-host type: PM commission already collected from Airbnb.
 *
 * Both co-host types exclude Airbnb revenue from the statement. They differ only
 * in who pays the PM commission:
 *
 *   isCohostOnAirbnb + cohostCommissionCollected = false (existing behaviour)
 *     -> we invoice the commission back, Gross Payout = -commission
 *
 *   isCohostOnAirbnb + cohostCommissionCollected = true (this feature)
 *     -> Airbnb already routed the commission to us, so nothing is billed:
 *        Gross Payout = $0. The commission is still reported for visibility.
 *
 * Guards the calculation service directly, since that is the shared source of
 * truth for manual generation, group/tag auto-generation and the PDF recalc.
 */

const StatementCalculationService = require('../services/StatementCalculationService');

const PERIOD = { startDate: '2026-03-01', endDate: '2026-03-31' };

const listing = (overrides = {}) => ({
    id: 900001,
    nickname: 'Palmetto Rd',
    pmFeePercentage: 15,
    isCohostOnAirbnb: false,
    cohostCommissionCollected: false,
    cleaningFeePassThrough: false,
    excludeCleaningFromCommission: false,
    disregardTax: false,
    airbnbPassThroughTax: false,
    waiveCommission: false,
    waiveCommissionUntil: null,
    cleaningFee: 0,
    ...overrides
});

const airbnbReservation = (overrides = {}) => ({
    id: 'res-1',
    propertyId: 900001,
    guestName: 'Test Guest',
    source: 'Airbnb',
    status: 'confirmed',
    checkInDate: '2026-03-10',
    checkOutDate: '2026-03-15',
    nights: 5,
    hasDetailedFinance: true,
    clientRevenue: 2000,
    clientTaxResponsibility: 0,
    cleaningFee: 0,
    ...overrides
});

/** Gross payout for one Airbnb reservation on a listing with the given settings. */
const grossPayoutFor = (listingOverrides, reservationOverrides = {}) =>
    StatementCalculationService.calculateGrossPayoutSum(
        [airbnbReservation(reservationOverrides)],
        { 900001: listing(listingOverrides) },
        PERIOD.endDate,
        'checkout'
    );

describe('getCohostCommissionDeduction', () => {
    test('bills the commission when it has not been collected', () => {
        expect(StatementCalculationService.getCohostCommissionDeduction(false, 300)).toBe(300);
    });

    test('bills nothing when the commission was already collected from Airbnb', () => {
        expect(StatementCalculationService.getCohostCommissionDeduction(true, 300)).toBe(0);
    });

    test('treats a missing/undefined flag as "not collected" so existing co-hosts are unaffected', () => {
        expect(StatementCalculationService.getCohostCommissionDeduction(undefined, 300)).toBe(300);
    });
});

describe('Gross Payout by co-host type', () => {
    test('default co-host still bills the commission back to the owner', () => {
        // $2,000 x 15% = $300 commission, charged to the owner
        expect(grossPayoutFor({ isCohostOnAirbnb: true })).toBeCloseTo(-300, 2);
    });

    test('commission-collected co-host contributes nothing to Gross Payout', () => {
        expect(grossPayoutFor({
            isCohostOnAirbnb: true,
            cohostCommissionCollected: true
        })).toBeCloseTo(0, 2);
    });

    test('the flag does nothing on a listing that is not a co-host', () => {
        // Not a co-host: normal formula, revenue minus commission
        expect(grossPayoutFor({
            isCohostOnAirbnb: false,
            cohostCommissionCollected: true
        })).toBeCloseTo(1700, 2);
    });

    test('the flag does not affect non-Airbnb reservations on a co-hosted listing', () => {
        expect(grossPayoutFor(
            { isCohostOnAirbnb: true, cohostCommissionCollected: true },
            { source: 'Vrbo' }
        )).toBeCloseTo(1700, 2);
    });

    test('cleaning-fee pass-through is still deducted — only the commission is dropped', () => {
        // guestPaid $345 -> CEIL(345 / 1.15 / 5) * 5 = $300 cleaning cost
        const collected = grossPayoutFor(
            { isCohostOnAirbnb: true, cohostCommissionCollected: true, cleaningFeePassThrough: true },
            { cleaningFee: 345 }
        );
        const billed = grossPayoutFor(
            { isCohostOnAirbnb: true, cleaningFeePassThrough: true },
            { cleaningFee: 345 }
        );

        expect(collected).toBeCloseTo(-300, 2);          // cleaning only
        expect(billed).toBeCloseTo(-300 - 300, 2);       // cleaning + commission
    });

    test('an active commission waiver and the collected flag agree on $0', () => {
        expect(grossPayoutFor({
            isCohostOnAirbnb: true,
            cohostCommissionCollected: true,
            waiveCommission: true
        })).toBeCloseTo(0, 2);
    });

    test('per-property: one collected co-host and one billed co-host in a combined statement', () => {
        const listingInfoMap = {
            900001: listing({ id: 900001, isCohostOnAirbnb: true, cohostCommissionCollected: true }),
            900002: listing({ id: 900002, isCohostOnAirbnb: true, cohostCommissionCollected: false })
        };
        const reservations = [
            airbnbReservation({ id: 'res-1', propertyId: 900001 }),
            airbnbReservation({ id: 'res-2', propertyId: 900002 })
        ];

        // Property 1 contributes $0, property 2 contributes -$300
        expect(StatementCalculationService.calculateGrossPayoutSum(
            reservations, listingInfoMap, PERIOD.endDate, 'checkout'
        )).toBeCloseTo(-300, 2);
    });
});

describe('Statement totals', () => {
    const financialsFor = (listingOverrides) =>
        StatementCalculationService.calculateStatementFinancials({
            reservations: [airbnbReservation()],
            expenses: [],
            listingInfoMap: { 900001: listing(listingOverrides) },
            propertyIds: [900001],
            startDate: PERIOD.startDate,
            endDate: PERIOD.endDate,
            calculationType: 'checkout'
        });

    test('Airbnb revenue stays excluded for the commission-collected type', () => {
        const result = financialsFor({ isCohostOnAirbnb: true, cohostCommissionCollected: true });
        expect(result.totalRevenue).toBe(0);
    });

    test('owner payout is $0 instead of the negative commission', () => {
        const collected = financialsFor({ isCohostOnAirbnb: true, cohostCommissionCollected: true });
        const billed = financialsFor({ isCohostOnAirbnb: true });

        expect(collected.ownerPayout).toBeCloseTo(0, 2);
        expect(billed.ownerPayout).toBeCloseTo(-300, 2);
    });

    test('non-co-host statements are untouched by the new field', () => {
        const before = financialsFor({});
        const after = financialsFor({ cohostCommissionCollected: true });
        expect(after.ownerPayout).toBeCloseTo(before.ownerPayout, 2);
        expect(after.totalRevenue).toBeCloseTo(before.totalRevenue, 2);
        expect(after.pmCommission).toBeCloseTo(before.pmCommission, 2);
    });
});
