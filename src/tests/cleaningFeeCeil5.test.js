/**
 * Cleaning Fee Pass-Through — CEIL to nearest $5
 *
 * The reverse-engineered cleaning fee shown as "Cleaning Expense" on statements
 * must match Column J ("Amount in Statement") of the Cleaning Fee Calculator
 * spreadsheet. That column always rounds UP to the next $5:
 *
 *   CleaningExpense = CEIL( guestPaidCleaningFee / (1 + PM%), $5 )
 *
 * These test cases are taken directly from Ferdy's calculator spreadsheet.
 */

const StatementCalculationService = require('../services/StatementCalculationService');

const makeListing = (overrides = {}) => ({
    id: 1,
    pmFeePercentage: 20,
    isCohostOnAirbnb: false,
    disregardTax: false,
    airbnbPassThroughTax: false,
    cleaningFeePassThrough: true,
    excludeCleaningFromCommission: false,
    ...overrides
});

const makeRes = (overrides = {}) => ({
    propertyId: 1,
    status: 'confirmed',
    source: 'vrbo',
    checkInDate: '2026-04-01',
    checkOutDate: '2026-04-05',
    grossAmount: 1000,
    cleaningFee: 0,
    hasDetailedFinance: true,
    clientRevenue: 1000,
    clientTaxResponsibility: 0,
    ...overrides
});

/**
 * Drive the real gross-payout calc and recover the cleaning fee that was
 * subtracted. Shape: grossPayout = clientRevenue - pmFee - cleaningFee.
 */
function extractCleaningFeeDeducted(listing, res) {
    const pm = parseFloat(listing.pmFeePercentage);
    const expectedPmFee = res.clientRevenue * (pm / 100);
    const gross = StatementCalculationService.calculateGrossPayoutSum(
        [res],
        { 1: listing },
        '2026-04-30',
        'checkout'
    );
    // gross = clientRevenue - pmFee - cleaningFee  (no tax in these fixtures)
    return Math.round((res.clientRevenue - expectedPmFee - gross) * 100) / 100;
}

describe('Pass-through cleaning fee — CEIL to nearest $5', () => {
    // Rows taken from Cleaning Fee and Upsell Calculator spreadsheet, Column J
    const spreadsheet = [
        { name: 'Sovichet',    rounded: 315, pm: 20,   expected: 265 },
        { name: 'Cinnamon',    rounded: 375, pm: 25,   expected: 300 },
        { name: 'Virjilio',    rounded: 260, pm: 18,   expected: 225 },
        { name: '7th Ave N',   rounded: 355, pm: 12.5, expected: 320 },
        { name: 'Waldrep',     rounded: 245, pm: 15,   expected: 215 },
        { name: 'Nigel',       rounded: 250, pm: 20,   expected: 210 },
        { name: 'Collins',     rounded: 345, pm: 20,   expected: 290 },
        { name: 'Declan',      rounded: 290, pm: 20,   expected: 245 },
        { name: 'Tatiana',     rounded: 220, pm: 20,   expected: 185 },
        { name: 'Hudson',      rounded: 240, pm: 20,   expected: 200 },
        { name: 'Francis',     rounded: 365, pm: 25,   expected: 295 },
        { name: 'S Perry',     rounded: 420, pm: 15,   expected: 370 },
        { name: 'Burr Oak',    rounded: 290, pm: 20,   expected: 245 },
    ];

    test.each(spreadsheet)(
        '$name: guestPaid=$$$rounded at $pm% PM -> Cleaning Expense = $$$expected',
        ({ rounded, pm, expected }) => {
            const listing = makeListing({ pmFeePercentage: pm });
            const res = makeRes({ cleaningFee: rounded, clientRevenue: 2000 });
            const deducted = extractCleaningFeeDeducted(listing, res);
            expect(deducted).toBe(expected);
        }
    );

    test('zero cleaning fee: no deduction', () => {
        const listing = makeListing({ pmFeePercentage: 20 });
        const res = makeRes({ cleaningFee: 0 });
        const deducted = extractCleaningFeeDeducted(listing, res);
        expect(deducted).toBe(0);
    });

    test('flag off: no cleaning deduction regardless of amount', () => {
        const listing = makeListing({ pmFeePercentage: 20, cleaningFeePassThrough: false });
        const res = makeRes({ cleaningFee: 290, clientRevenue: 2000 });
        const deducted = extractCleaningFeeDeducted(listing, res);
        expect(deducted).toBe(0);
    });

    test('amount already a multiple of $5: no extra rounding up', () => {
        // 240 / 1.20 = 200 exactly; must not round to 205
        const listing = makeListing({ pmFeePercentage: 20 });
        const res = makeRes({ cleaningFee: 240, clientRevenue: 2000 });
        const deducted = extractCleaningFeeDeducted(listing, res);
        expect(deducted).toBe(200);
    });
});
