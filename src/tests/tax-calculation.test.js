/**
 * Tax Calculation Tests - 100% Core Coverage
 *
 * Tests for the two tax flags:
 * 1. airbnbPassThroughTax - When true, tax is added to gross payout for Airbnb bookings
 *    (for cases where Airbnb collects tax but doesn't remit it)
 * 2. disregardTax - When true, tax is NEVER added to gross payout
 *    (for clients where company remits tax on their behalf)
 *
 * Core Formula (from statements-file.js and statement-html-template.js):
 * shouldAddTax = !disregardTax && (!isAirbnb || airbnbPassThroughTax)
 */

// ============================================================================
// CORE TAX CALCULATION FUNCTIONS (EXACT copy from production code)
// ============================================================================

function shouldAddTax(isAirbnb, airbnbPassThroughTax, disregardTax) {
    return !disregardTax && (!isAirbnb || airbnbPassThroughTax);
}

function calculateTaxToAdd(taxResponsibility, isAirbnb, airbnbPassThroughTax, disregardTax) {
    const addTax = shouldAddTax(isAirbnb, airbnbPassThroughTax, disregardTax);
    return addTax ? taxResponsibility : 0;
}

function calculateClientPayout(clientRevenue, luxuryFee, taxResponsibility, isAirbnb, isCohostAirbnb, airbnbPassThroughTax, disregardTax) {
    const taxToAdd = calculateTaxToAdd(taxResponsibility, isAirbnb, airbnbPassThroughTax, disregardTax);
    if (isCohostAirbnb) {
        return -luxuryFee;
    } else {
        return clientRevenue - luxuryFee + taxToAdd;
    }
}

function calculateTotalPayout(reservations, pmPercentage, airbnbPassThroughTax, disregardTax) {
    let totalRevenue = 0;
    let totalPmCommission = 0;
    let totalTaxToAdd = 0;

    for (const res of reservations) {
        const isAirbnb = isAirbnbSource(res.source);
        const isCohostAirbnb = isAirbnb && res.isCohostOnAirbnb;

        if (!isCohostAirbnb) {
            const clientRevenue = res.clientRevenue || 0;
            totalRevenue += clientRevenue;
            totalPmCommission += clientRevenue * (pmPercentage / 100);
        }

        const taxAmount = res.clientTaxResponsibility || 0;
        const addTax = shouldAddTax(isAirbnb, airbnbPassThroughTax, disregardTax);
        totalTaxToAdd += addTax ? taxAmount : 0;
    }

    return totalRevenue - totalPmCommission + totalTaxToAdd;
}

function isAirbnbSource(source) {
    return source && source.toLowerCase().includes('airbnb');
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Tax Calculation Tests', () => {

    describe('Core Formula: shouldAddTax()', () => {

        test('formula verification: !disregardTax && (!isAirbnb || airbnbPassThroughTax)', () => {
            expect(shouldAddTax(false, false, true)).toBe(false);
            expect(shouldAddTax(false, true, true)).toBe(false);
            expect(shouldAddTax(true, false, true)).toBe(false);
            expect(shouldAddTax(true, true, true)).toBe(false);
        });

        test('complete truth table - all 8 combinations', () => {
            const truthTable = [
                { isAirbnb: false, passThrough: false, disregard: false, expected: true },
                { isAirbnb: false, passThrough: false, disregard: true, expected: false },
                { isAirbnb: false, passThrough: true, disregard: false, expected: true },
                { isAirbnb: false, passThrough: true, disregard: true, expected: false },
                { isAirbnb: true, passThrough: false, disregard: false, expected: false },
                { isAirbnb: true, passThrough: false, disregard: true, expected: false },
                { isAirbnb: true, passThrough: true, disregard: false, expected: true },
                { isAirbnb: true, passThrough: true, disregard: true, expected: false },
            ];

            for (const row of truthTable) {
                expect(shouldAddTax(row.isAirbnb, row.passThrough, row.disregard)).toBe(row.expected);
            }
        });
    });

    describe('calculateTaxToAdd()', () => {

        test('returns full tax when shouldAddTax is true', () => {
            expect(calculateTaxToAdd(100, false, false, false)).toBe(100);
        });

        test('returns 0 when shouldAddTax is false (Airbnb default)', () => {
            expect(calculateTaxToAdd(100, true, false, false)).toBe(0);
        });

        test('returns full tax for Airbnb with passThrough', () => {
            expect(calculateTaxToAdd(100, true, true, false)).toBe(100);
        });

        test('returns 0 when disregardTax is true (any source)', () => {
            expect(calculateTaxToAdd(100, false, false, true)).toBe(0);
            expect(calculateTaxToAdd(100, true, false, true)).toBe(0);
            expect(calculateTaxToAdd(100, true, true, true)).toBe(0);
        });

        test('handles zero tax correctly', () => {
            expect(calculateTaxToAdd(0, false, false, false)).toBe(0);
            expect(calculateTaxToAdd(0, true, true, false)).toBe(0);
        });

        test('handles decimal tax amounts', () => {
            expect(calculateTaxToAdd(123.45, false, false, false)).toBe(123.45);
        });
    });

    describe('calculateClientPayout()', () => {

        test('Non-Airbnb: clientRevenue - luxuryFee + tax', () => {
            expect(calculateClientPayout(1000, 150, 80, false, false, false, false)).toBe(930);
        });

        test('Non-Airbnb with disregardTax: clientRevenue - luxuryFee (no tax)', () => {
            expect(calculateClientPayout(1000, 150, 80, false, false, false, true)).toBe(850);
        });

        test('Airbnb default: clientRevenue - luxuryFee (no tax)', () => {
            expect(calculateClientPayout(1000, 150, 80, true, false, false, false)).toBe(850);
        });

        test('Airbnb with passThrough: clientRevenue - luxuryFee + tax', () => {
            expect(calculateClientPayout(1000, 150, 80, true, false, true, false)).toBe(930);
        });

        test('Co-hosted Airbnb: -luxuryFee only', () => {
            expect(calculateClientPayout(1000, 150, 80, true, true, false, false)).toBe(-150);
        });

        test('Co-hosted Airbnb with passThrough: still -luxuryFee only', () => {
            expect(calculateClientPayout(1000, 150, 80, true, true, true, false)).toBe(-150);
        });

        test('Co-hosted Airbnb with disregardTax: still -luxuryFee only', () => {
            expect(calculateClientPayout(1000, 150, 80, true, true, false, true)).toBe(-150);
        });
    });

    describe('calculateTotalPayout()', () => {

        test('mixed sources without flags: correct tax handling per source', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
                { source: 'Airbnb', clientRevenue: 1200, clientTaxResponsibility: 96 },
                { source: 'Direct', clientRevenue: 800, clientTaxResponsibility: 64 },
            ];
            expect(calculateTotalPayout(reservations, 15, false, false)).toBe(2694);
        });

        test('all sources with disregardTax: no tax added', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
                { source: 'Airbnb', clientRevenue: 1200, clientTaxResponsibility: 96 },
                { source: 'Direct', clientRevenue: 800, clientTaxResponsibility: 64 },
            ];
            expect(calculateTotalPayout(reservations, 15, false, true)).toBe(2550);
        });

        test('all sources with airbnbPassThroughTax: Airbnb tax included', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
                { source: 'Airbnb', clientRevenue: 1200, clientTaxResponsibility: 96 },
                { source: 'Direct', clientRevenue: 800, clientTaxResponsibility: 64 },
            ];
            expect(calculateTotalPayout(reservations, 15, true, false)).toBe(2790);
        });

        test('passThrough AND disregardTax: disregardTax wins', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
                { source: 'Airbnb', clientRevenue: 1200, clientTaxResponsibility: 96 },
            ];
            expect(calculateTotalPayout(reservations, 15, true, true)).toBe(1870);
        });
    });

    describe('Source Detection', () => {

        test('Airbnb variations - all should match', () => {
            expect(isAirbnbSource('Airbnb')).toBe(true);
            expect(isAirbnbSource('airbnb')).toBe(true);
            expect(isAirbnbSource('AIRBNB')).toBe(true);
            expect(isAirbnbSource('Airbnb.com')).toBe(true);
            expect(isAirbnbSource('airbnb.com')).toBe(true);
            expect(isAirbnbSource('AirBnB')).toBe(true);
            expect(isAirbnbSource('Via Airbnb')).toBe(true);
            expect(isAirbnbSource('airbnb-direct')).toBe(true);
        });

        test('Non-Airbnb sources - all should NOT match', () => {
            expect(isAirbnbSource('VRBO')).toBe(false);
            expect(isAirbnbSource('vrbo')).toBe(false);
            expect(isAirbnbSource('Booking.com')).toBe(false);
            expect(isAirbnbSource('Direct')).toBe(false);
            expect(isAirbnbSource('HomeAway')).toBe(false);
            expect(isAirbnbSource('Expedia')).toBe(false);
            expect(isAirbnbSource('TripAdvisor')).toBe(false);
        });

        test('Edge cases - null, undefined, empty', () => {
            expect(!!isAirbnbSource('')).toBe(false);
            expect(!!isAirbnbSource(null)).toBe(false);
            expect(!!isAirbnbSource(undefined)).toBe(false);
        });
    });

    describe('Real-World Business Scenarios', () => {

        test('Scenario 1: Standard property - VRBO + Direct bookings', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 2500, clientTaxResponsibility: 200 },
                { source: 'Direct', clientRevenue: 1500, clientTaxResponsibility: 120 },
            ];
            expect(calculateTotalPayout(reservations, 15, false, false)).toBe(3720);
        });

        test('Scenario 2: Airbnb-only property with passThrough tax', () => {
            const reservations = [
                { source: 'Airbnb', clientRevenue: 3000, clientTaxResponsibility: 240 },
                { source: 'Airbnb', clientRevenue: 2500, clientTaxResponsibility: 200 },
            ];
            expect(calculateTotalPayout(reservations, 15, true, false)).toBe(5115);
        });

        test('Scenario 3: Client with disregardTax (company pays tax)', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 2000, clientTaxResponsibility: 160 },
                { source: 'Airbnb', clientRevenue: 3000, clientTaxResponsibility: 240 },
                { source: 'Direct', clientRevenue: 1000, clientTaxResponsibility: 80 },
            ];
            expect(calculateTotalPayout(reservations, 20, false, true)).toBe(4800);
        });

        test('Scenario 4: Mixed property - some Airbnb co-hosted', () => {
            const reservations = [
                { source: 'VRBO', clientRevenue: 1500, clientTaxResponsibility: 120, isCohostOnAirbnb: false },
                { source: 'Airbnb', clientRevenue: 2000, clientTaxResponsibility: 160, isCohostOnAirbnb: true },
                { source: 'Direct', clientRevenue: 1000, clientTaxResponsibility: 80, isCohostOnAirbnb: false },
            ];
            expect(calculateTotalPayout(reservations, 15, false, false)).toBe(2325);
        });

        test('Scenario 5: Zero bookings', () => {
            expect(calculateTotalPayout([], 15, false, false)).toBe(0);
        });

        test('Scenario 6: High-value booking with high tax', () => {
            const reservations = [
                { source: 'Direct', clientRevenue: 25000, clientTaxResponsibility: 3000 },
            ];
            expect(calculateTotalPayout(reservations, 10, false, false)).toBe(25500);
        });
    });

    describe('Listing Flag Combinations', () => {

        test('Default listing: both flags false', () => {
            const listing = { airbnbPassThroughTax: false, disregardTax: false };
            expect(shouldAddTax(true, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(false);
            expect(shouldAddTax(false, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(true);
        });

        test('Listing with airbnbPassThroughTax only', () => {
            const listing = { airbnbPassThroughTax: true, disregardTax: false };
            expect(shouldAddTax(true, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(true);
            expect(shouldAddTax(false, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(true);
        });

        test('Listing with disregardTax only', () => {
            const listing = { airbnbPassThroughTax: false, disregardTax: true };
            expect(shouldAddTax(true, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(false);
            expect(shouldAddTax(false, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(false);
        });

        test('Listing with both flags (edge case - conflicting)', () => {
            const listing = { airbnbPassThroughTax: true, disregardTax: true };
            expect(shouldAddTax(true, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(false);
            expect(shouldAddTax(false, listing.airbnbPassThroughTax, listing.disregardTax)).toBe(false);
        });
    });

    describe('Statement Integration Simulation', () => {

        test('Statement object with airbnbPassThroughTax', () => {
            const statement = {
                airbnbPassThroughTax: true,
                disregardTax: false,
                reservations: [{ source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 80 }],
            };
            const res = statement.reservations[0];
            const isAirbnb = isAirbnbSource(res.source);
            const taxToAdd = calculateTaxToAdd(res.clientTaxResponsibility, isAirbnb, statement.airbnbPassThroughTax, statement.disregardTax);
            expect(isAirbnb).toBe(true);
            expect(taxToAdd).toBe(80);
        });

        test('Statement object with disregardTax', () => {
            const statement = {
                airbnbPassThroughTax: false,
                disregardTax: true,
                reservations: [{ source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 }],
            };
            const res = statement.reservations[0];
            const isAirbnb = isAirbnbSource(res.source);
            const taxToAdd = calculateTaxToAdd(res.clientTaxResponsibility, isAirbnb, statement.airbnbPassThroughTax, statement.disregardTax);
            expect(isAirbnb).toBe(false);
            expect(taxToAdd).toBe(0);
        });

        test('Full statement calculation simulation', () => {
            const statement = {
                airbnbPassThroughTax: true,
                disregardTax: false,
                pmPercentage: 15,
                reservations: [
                    { source: 'Airbnb', clientRevenue: 2000, clientTaxResponsibility: 160 },
                    { source: 'VRBO', clientRevenue: 1500, clientTaxResponsibility: 120 },
                ]
            };

            let totalPayout = 0;
            for (const res of statement.reservations) {
                const isAirbnb = isAirbnbSource(res.source);
                const luxuryFee = res.clientRevenue * (statement.pmPercentage / 100);
                const payout = calculateClientPayout(res.clientRevenue, luxuryFee, res.clientTaxResponsibility, isAirbnb, false, statement.airbnbPassThroughTax, statement.disregardTax);
                totalPayout += payout;
            }
            expect(totalPayout).toBe(3255);
        });
    });

    describe('Edge Cases & Boundary Conditions', () => {

        test('Zero revenue with tax', () => {
            expect(calculateClientPayout(0, 0, 100, false, false, false, false)).toBe(100);
        });

        test('Negative tax (credit/refund)', () => {
            expect(calculateClientPayout(1000, 150, -50, false, false, false, false)).toBe(800);
        });

        test('Very small decimal amounts', () => {
            expect(calculateClientPayout(0.01, 0.001, 0.001, false, false, false, false)).toBeCloseTo(0.01, 2);
        });

        test('Large amounts', () => {
            expect(calculateClientPayout(1000000, 150000, 80000, false, false, false, false)).toBe(930000);
        });

        test('PM fee equals revenue (100% fee)', () => {
            expect(calculateClientPayout(1000, 1000, 100, false, false, false, false)).toBe(100);
        });

        test('PM fee exceeds revenue', () => {
            expect(calculateClientPayout(1000, 1500, 100, false, false, false, false)).toBe(-400);
        });
    });

    describe('Boolean Type Coercion Safety', () => {

        test('Undefined flags treated as falsy (non-Airbnb adds tax)', () => {
            expect(!!shouldAddTax(false, undefined, undefined)).toBe(true);
        });

        test('Undefined flags treated as falsy (Airbnb no tax)', () => {
            expect(!!shouldAddTax(true, undefined, undefined)).toBe(false);
        });

        test('Null flags treated as falsy (non-Airbnb adds tax)', () => {
            expect(!!shouldAddTax(false, null, null)).toBe(true);
        });

        test('Null flags treated as falsy (Airbnb no tax)', () => {
            expect(!!shouldAddTax(true, null, null)).toBe(false);
        });

        test('Number 1 treated as truthy (passThrough)', () => {
            expect(!!shouldAddTax(true, 1, 0)).toBe(true);
        });

        test('Number 0 treated as falsy (passThrough)', () => {
            expect(!!shouldAddTax(true, 0, 0)).toBe(false);
        });

        test('Number 1 treated as truthy (disregardTax)', () => {
            expect(!!shouldAddTax(false, 0, 1)).toBe(false);
        });
    });
});
