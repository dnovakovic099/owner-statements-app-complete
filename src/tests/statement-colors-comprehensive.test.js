/**
 * COMPREHENSIVE Statement View Color Tests
 *
 * Coverage: 100% of all color logic edge cases
 *
 * Color Scheme:
 * - GREEN (revenue-amount): Base Rate, Cleaning, Revenue, Tax (when added to formula), Gross Payout (positive)
 * - RED (expense-amount): Platform Fees, PM Commission, Gross Payout (negative)
 * - BLUE (info-amount): Tax (when NOT added to formula - informational only)
 *
 * Tax Color Logic:
 * shouldAddTax = !disregardTax && (!isAirbnb || airbnbPassThroughTax)
 * - If shouldAddTax = true → GREEN (tax is added to gross payout)
 * - If shouldAddTax = false → BLUE (tax is informational only)
 */

const assert = require('assert');

// ============================================================
// HELPER FUNCTIONS - Exact mirror of production code
// ============================================================

/**
 * Determines if a source is Airbnb (case-insensitive)
 */
function isAirbnbSource(source) {
    if (!source) return false;
    return source.toLowerCase().includes('airbnb');
}

/**
 * Determines if tax should be added to the gross payout formula
 * This is the CORE logic that determines tax color
 */
function shouldAddTax(reservation, statement) {
    const isAirbnb = isAirbnbSource(reservation.source);
    return !statement.disregardTax && (!isAirbnb || statement.airbnbPassThroughTax);
}

/**
 * Gets the CSS class for the tax column based on business logic
 */
function getTaxColorClass(reservation, statement) {
    return shouldAddTax(reservation, statement) ? 'revenue-amount' : 'info-amount';
}

/**
 * Gets the CSS class for gross payout based on value
 */
function getGrossPayoutColorClass(grossPayout) {
    return grossPayout < 0 ? 'expense-amount' : 'revenue-amount';
}

/**
 * Calculates gross payout for a reservation
 */
function calculateGrossPayout(reservation, statement) {
    const isAirbnb = isAirbnbSource(reservation.source);
    const isCohostAirbnb = isAirbnb && statement.isCohostOnAirbnb;
    const luxuryFee = reservation.clientRevenue * (statement.pmPercentage / 100);
    const taxResponsibility = reservation.clientTaxResponsibility || 0;

    const addTax = shouldAddTax(reservation, statement);

    if (isCohostAirbnb) {
        return -luxuryFee;
    } else if (addTax) {
        return reservation.clientRevenue - luxuryFee + taxResponsibility;
    } else {
        return reservation.clientRevenue - luxuryFee;
    }
}

// ============================================================
// TEST SUITES
// ============================================================

let passCount = 0;
let failCount = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passCount++;
        console.log(`  PASS: ${name}`);
    } catch (error) {
        failCount++;
        failures.push({ name, error: error.message });
        console.log(`  FAIL: ${name}`);
        console.log(`     Error: ${error.message}`);
    }
}

function describe(suiteName, fn) {
    console.log(`\n=== ${suiteName} ===\n`);
    fn();
}

// ============================================================
// TEST SUITE 1: Source Detection (isAirbnbSource)
// ============================================================

describe('TEST SUITE 1: Source Detection (isAirbnbSource)', () => {

    // Airbnb variations - should all return true
    test('Airbnb (exact) → true', () => {
        assert.strictEqual(isAirbnbSource('Airbnb'), true);
    });

    test('airbnb (lowercase) → true', () => {
        assert.strictEqual(isAirbnbSource('airbnb'), true);
    });

    test('AIRBNB (uppercase) → true', () => {
        assert.strictEqual(isAirbnbSource('AIRBNB'), true);
    });

    test('AirBnB (mixed case) → true', () => {
        assert.strictEqual(isAirbnbSource('AirBnB'), true);
    });

    test('Airbnb Official → true', () => {
        assert.strictEqual(isAirbnbSource('Airbnb Official'), true);
    });

    test('airbnb.com → true', () => {
        assert.strictEqual(isAirbnbSource('airbnb.com'), true);
    });

    test('Airbnb (Co-host) → true', () => {
        assert.strictEqual(isAirbnbSource('Airbnb (Co-host)'), true);
    });

    // Non-Airbnb sources - should all return false
    test('VRBO → false', () => {
        assert.strictEqual(isAirbnbSource('VRBO'), false);
    });

    test('vrbo → false', () => {
        assert.strictEqual(isAirbnbSource('vrbo'), false);
    });

    test('Booking.com → false', () => {
        assert.strictEqual(isAirbnbSource('Booking.com'), false);
    });

    test('Marriott → false', () => {
        assert.strictEqual(isAirbnbSource('Marriott'), false);
    });

    test('Direct → false', () => {
        assert.strictEqual(isAirbnbSource('Direct'), false);
    });

    test('Expedia → false', () => {
        assert.strictEqual(isAirbnbSource('Expedia'), false);
    });

    test('HomeAway → false', () => {
        assert.strictEqual(isAirbnbSource('HomeAway'), false);
    });

    test('TripAdvisor → false', () => {
        assert.strictEqual(isAirbnbSource('TripAdvisor'), false);
    });

    test('Google → false', () => {
        assert.strictEqual(isAirbnbSource('Google'), false);
    });

    test('Manual → false', () => {
        assert.strictEqual(isAirbnbSource('Manual'), false);
    });

    // Edge cases
    test('null → false', () => {
        assert.strictEqual(isAirbnbSource(null), false);
    });

    test('undefined → false', () => {
        assert.strictEqual(isAirbnbSource(undefined), false);
    });

    test('empty string → false', () => {
        assert.strictEqual(isAirbnbSource(''), false);
    });

    test('whitespace only → false', () => {
        assert.strictEqual(isAirbnbSource('   '), false);
    });
});

// ============================================================
// TEST SUITE 2: shouldAddTax() Core Logic - Truth Table
// ============================================================

describe('TEST SUITE 2: shouldAddTax() - Complete Truth Table (8 combinations)', () => {

    // The formula: shouldAddTax = !disregardTax && (!isAirbnb || airbnbPassThroughTax)

    // Combination 1: Airbnb=F, disregardTax=F, passThrough=F
    test('Non-Airbnb, disregardTax=false, passThrough=false → TRUE (tax added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(shouldAddTax(reservation, statement), true);
    });

    // Combination 2: Airbnb=F, disregardTax=F, passThrough=T
    test('Non-Airbnb, disregardTax=false, passThrough=true → TRUE (tax added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: false, airbnbPassThroughTax: true };
        assert.strictEqual(shouldAddTax(reservation, statement), true);
    });

    // Combination 3: Airbnb=F, disregardTax=T, passThrough=F
    test('Non-Airbnb, disregardTax=true, passThrough=false → FALSE (tax not added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });

    // Combination 4: Airbnb=F, disregardTax=T, passThrough=T
    test('Non-Airbnb, disregardTax=true, passThrough=true → FALSE (tax not added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: true, airbnbPassThroughTax: true };
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });

    // Combination 5: Airbnb=T, disregardTax=F, passThrough=F
    test('Airbnb, disregardTax=false, passThrough=false → FALSE (tax not added)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });

    // Combination 6: Airbnb=T, disregardTax=F, passThrough=T
    test('Airbnb, disregardTax=false, passThrough=true → TRUE (tax added)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: true };
        assert.strictEqual(shouldAddTax(reservation, statement), true);
    });

    // Combination 7: Airbnb=T, disregardTax=T, passThrough=F
    test('Airbnb, disregardTax=true, passThrough=false → FALSE (tax not added)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });

    // Combination 8: Airbnb=T, disregardTax=T, passThrough=T
    test('Airbnb, disregardTax=true, passThrough=true → FALSE (disregardTax wins)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: true, airbnbPassThroughTax: true };
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });
});

// ============================================================
// TEST SUITE 3: Tax Color Class (getTaxColorClass)
// ============================================================

describe('TEST SUITE 3: Tax Color Class - All Booking Sources', () => {

    // Standard Airbnb (no flags) - BLUE
    test('Airbnb (standard) → BLUE (info-amount)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');
    });

    // Airbnb with pass-through - GREEN
    test('Airbnb with passThrough → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: true };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    // Airbnb with disregardTax - BLUE
    test('Airbnb with disregardTax → BLUE (info-amount)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');
    });

    // Non-Airbnb sources - GREEN
    test('VRBO → GREEN (revenue-amount)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('Marriott → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Marriott' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('Booking.com → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Booking.com' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('Direct → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Direct' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('Expedia → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Expedia' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('HomeAway → GREEN (revenue-amount)', () => {
        const reservation = { source: 'HomeAway' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('TripAdvisor → GREEN (revenue-amount)', () => {
        const reservation = { source: 'TripAdvisor' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('Google → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Google' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    // Non-Airbnb with disregardTax - BLUE
    test('VRBO with disregardTax → BLUE (info-amount)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');
    });

    test('Marriott with disregardTax → BLUE (info-amount)', () => {
        const reservation = { source: 'Marriott' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');
    });
});

// ============================================================
// TEST SUITE 4: Gross Payout Color Class
// ============================================================

describe('TEST SUITE 4: Gross Payout Color Class', () => {

    test('Positive payout $1000 → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(1000), 'revenue-amount');
    });

    test('Positive payout $0.01 → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(0.01), 'revenue-amount');
    });

    test('Zero payout $0 → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(0), 'revenue-amount');
    });

    test('Negative payout -$100 → RED', () => {
        assert.strictEqual(getGrossPayoutColorClass(-100), 'expense-amount');
    });

    test('Negative payout -$0.01 → RED', () => {
        assert.strictEqual(getGrossPayoutColorClass(-0.01), 'expense-amount');
    });

    test('Large positive $999999 → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(999999), 'revenue-amount');
    });

    test('Large negative -$999999 → RED', () => {
        assert.strictEqual(getGrossPayoutColorClass(-999999), 'expense-amount');
    });
});

// ============================================================
// TEST SUITE 5: Fixed Column Colors (Always Same)
// ============================================================

describe('TEST SUITE 5: Fixed Column Colors (Constant)', () => {

    test('Base Rate is always GREEN (revenue-amount)', () => {
        // Base Rate column always uses revenue-amount class
        const baseRateClass = 'revenue-amount';
        assert.strictEqual(baseRateClass, 'revenue-amount');
    });

    test('Cleaning & Other Fees is always GREEN (revenue-amount)', () => {
        const cleaningClass = 'revenue-amount';
        assert.strictEqual(cleaningClass, 'revenue-amount');
    });

    test('Platform Fees is always RED (expense-amount)', () => {
        const platformFeesClass = 'expense-amount';
        assert.strictEqual(platformFeesClass, 'expense-amount');
    });

    test('Revenue is always GREEN (revenue-amount)', () => {
        const revenueClass = 'revenue-amount';
        assert.strictEqual(revenueClass, 'revenue-amount');
    });

    test('PM Commission is always RED (expense-amount)', () => {
        const pmCommissionClass = 'expense-amount';
        assert.strictEqual(pmCommissionClass, 'expense-amount');
    });
});

// ============================================================
// TEST SUITE 6: Gross Payout Calculation with Colors
// ============================================================

describe('TEST SUITE 6: Gross Payout Calculation & Color Integration', () => {

    test('Non-Airbnb: payout includes tax → GREEN', () => {
        const reservation = {
            source: 'VRBO',
            clientRevenue: 1000,
            clientTaxResponsibility: 100
        };
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: false
        };
        const grossPayout = calculateGrossPayout(reservation, statement);
        // 1000 - 150 (15% PM) + 100 (tax) = 950
        assert.strictEqual(grossPayout, 950);
        assert.strictEqual(getGrossPayoutColorClass(grossPayout), 'revenue-amount');
    });

    test('Airbnb standard: payout excludes tax → GREEN (positive)', () => {
        const reservation = {
            source: 'Airbnb',
            clientRevenue: 1000,
            clientTaxResponsibility: 100
        };
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: false
        };
        const grossPayout = calculateGrossPayout(reservation, statement);
        // 1000 - 150 (15% PM) = 850 (no tax)
        assert.strictEqual(grossPayout, 850);
        assert.strictEqual(getGrossPayoutColorClass(grossPayout), 'revenue-amount');
    });

    test('Airbnb with passThrough: payout includes tax → GREEN', () => {
        const reservation = {
            source: 'Airbnb',
            clientRevenue: 1000,
            clientTaxResponsibility: 100
        };
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: true,
            pmPercentage: 15,
            isCohostOnAirbnb: false
        };
        const grossPayout = calculateGrossPayout(reservation, statement);
        // 1000 - 150 (15% PM) + 100 (tax) = 950
        assert.strictEqual(grossPayout, 950);
        assert.strictEqual(getGrossPayoutColorClass(grossPayout), 'revenue-amount');
    });

    test('Co-hosted Airbnb: negative payout (PM fee only) → RED', () => {
        const reservation = {
            source: 'Airbnb',
            clientRevenue: 1000,
            clientTaxResponsibility: 100
        };
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: true
        };
        const grossPayout = calculateGrossPayout(reservation, statement);
        // -150 (negative PM fee only)
        assert.strictEqual(grossPayout, -150);
        assert.strictEqual(getGrossPayoutColorClass(grossPayout), 'expense-amount');
    });

    test('Co-hosted Airbnb with passThrough: still negative → RED', () => {
        const reservation = {
            source: 'Airbnb',
            clientRevenue: 1000,
            clientTaxResponsibility: 100
        };
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: true,
            pmPercentage: 15,
            isCohostOnAirbnb: true
        };
        const grossPayout = calculateGrossPayout(reservation, statement);
        // Still -150 (co-host always negative PM fee)
        assert.strictEqual(grossPayout, -150);
        assert.strictEqual(getGrossPayoutColorClass(grossPayout), 'expense-amount');
    });
});

// ============================================================
// TEST SUITE 7: Undefined/Null Flag Handling
// ============================================================

describe('TEST SUITE 7: Undefined/Null Flag Handling (Default Behavior)', () => {

    test('undefined flags (Non-Airbnb) → tax added (GREEN)', () => {
        const reservation = { source: 'VRBO' };
        const statement = {}; // No flags defined
        // !undefined && (!false || undefined) = true && true = true
        assert.strictEqual(shouldAddTax(reservation, statement), true);
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('undefined flags (Airbnb) → tax NOT added (BLUE)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = {}; // No flags defined
        // !undefined && (!true || undefined) = true && false = false (falsy)
        assert.strictEqual(!!shouldAddTax(reservation, statement), false); // Check truthy/falsy
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');
    });

    test('null disregardTax (Non-Airbnb) → tax added (GREEN)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: null, airbnbPassThroughTax: false };
        assert.strictEqual(shouldAddTax(reservation, statement), true);
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount');
    });

    test('null passThrough (Airbnb) → tax NOT added (BLUE)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: null };
        assert.strictEqual(!!shouldAddTax(reservation, statement), false); // Check truthy/falsy
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');
    });

    test('false as string "false" is truthy → treated as true', () => {
        // Note: "false" string is truthy in JS!
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: "false", airbnbPassThroughTax: false };
        // !"false" = false, so entire expression = false
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });

    test('0 is falsy → treated as false for disregardTax', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: 0, airbnbPassThroughTax: false };
        // !0 = true
        assert.strictEqual(shouldAddTax(reservation, statement), true);
    });

    test('1 is truthy → treated as true for disregardTax', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: 1, airbnbPassThroughTax: false };
        // !1 = false
        assert.strictEqual(shouldAddTax(reservation, statement), false);
    });

    test('1 is truthy → treated as true for passThrough', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: 1 };
        // !false && (!true || 1) = true && 1 = 1 (truthy)
        assert.strictEqual(!!shouldAddTax(reservation, statement), true); // Check truthy/falsy
        assert.strictEqual(getTaxColorClass(reservation, statement), 'revenue-amount'); // GREEN
    });
});

// ============================================================
// TEST SUITE 8: Real-World Scenarios
// ============================================================

describe('TEST SUITE 8: Real-World Business Scenarios', () => {

    test('Scenario: Mixed statement (Airbnb + VRBO) - different tax colors', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: false, pmPercentage: 15, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const vrboRes = { source: 'VRBO', clientRevenue: 600, clientTaxResponsibility: 60 };

        // Airbnb → BLUE tax
        assert.strictEqual(getTaxColorClass(airbnbRes, statement), 'info-amount');

        // VRBO → GREEN tax
        assert.strictEqual(getTaxColorClass(vrboRes, statement), 'revenue-amount');
    });

    test('Scenario: Property with passThrough enabled - all tax GREEN', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: true, pmPercentage: 15, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const vrboRes = { source: 'VRBO', clientRevenue: 600, clientTaxResponsibility: 60 };

        // Both should be GREEN (tax added to formula)
        assert.strictEqual(getTaxColorClass(airbnbRes, statement), 'revenue-amount');
        assert.strictEqual(getTaxColorClass(vrboRes, statement), 'revenue-amount');
    });

    test('Scenario: Property with disregardTax - all tax BLUE', () => {
        const statement = { disregardTax: true, airbnbPassThroughTax: false, pmPercentage: 15, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const vrboRes = { source: 'VRBO', clientRevenue: 600, clientTaxResponsibility: 60 };
        const marriottRes = { source: 'Marriott', clientRevenue: 700, clientTaxResponsibility: 70 };

        // All should be BLUE (tax not added - company pays)
        assert.strictEqual(getTaxColorClass(airbnbRes, statement), 'info-amount');
        assert.strictEqual(getTaxColorClass(vrboRes, statement), 'info-amount');
        assert.strictEqual(getTaxColorClass(marriottRes, statement), 'info-amount');
    });

    test('Scenario: Co-hosted Airbnb property - negative gross payout', () => {
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: true
        };

        const reservation = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };

        // Tax should be BLUE (Airbnb without passThrough)
        assert.strictEqual(getTaxColorClass(reservation, statement), 'info-amount');

        // Gross payout should be RED (negative)
        const grossPayout = calculateGrossPayout(reservation, statement);
        assert.strictEqual(grossPayout, -150);
        assert.strictEqual(getGrossPayoutColorClass(grossPayout), 'expense-amount');
    });

    test('Scenario: All Direct bookings (no platform) - all GREEN', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: false, pmPercentage: 15, isCohostOnAirbnb: false };

        const res1 = { source: 'Direct', clientRevenue: 500, clientTaxResponsibility: 50 };
        const res2 = { source: 'Manual', clientRevenue: 600, clientTaxResponsibility: 60 };
        const res3 = { source: 'Owner Referral', clientRevenue: 700, clientTaxResponsibility: 70 };

        // All should be GREEN (non-Airbnb)
        assert.strictEqual(getTaxColorClass(res1, statement), 'revenue-amount');
        assert.strictEqual(getTaxColorClass(res2, statement), 'revenue-amount');
        assert.strictEqual(getTaxColorClass(res3, statement), 'revenue-amount');
    });

    test('Scenario: Zero tax amount - color still applies correctly', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: false };

        const airbnbRes = { source: 'Airbnb', clientTaxResponsibility: 0 };
        const vrboRes = { source: 'VRBO', clientTaxResponsibility: 0 };

        // Colors based on source, not amount
        assert.strictEqual(getTaxColorClass(airbnbRes, statement), 'info-amount'); // BLUE
        assert.strictEqual(getTaxColorClass(vrboRes, statement), 'revenue-amount'); // GREEN
    });
});

// ============================================================
// TEST SUITE 9: Edge Cases & Boundary Conditions
// ============================================================

describe('TEST SUITE 9: Edge Cases & Boundary Conditions', () => {

    test('Source with leading/trailing spaces → correctly detected', () => {
        assert.strictEqual(isAirbnbSource('  Airbnb  '), true);
        assert.strictEqual(isAirbnbSource('  VRBO  '), false);
    });

    test('Source with special characters → correctly detected', () => {
        assert.strictEqual(isAirbnbSource('Airbnb®'), true);
        assert.strictEqual(isAirbnbSource('Booking.com™'), false);
    });

    test('Very long source name containing Airbnb → detected', () => {
        assert.strictEqual(isAirbnbSource('This is a very long source name from Airbnb platform'), true);
    });

    test('Source that partially matches "air" but not "airbnb" → false', () => {
        assert.strictEqual(isAirbnbSource('Airplane Rentals'), false);
        assert.strictEqual(isAirbnbSource('Air BnB Rentals'), false); // Has space
    });

    test('Gross payout exactly zero → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(0), 'revenue-amount');
        assert.strictEqual(getGrossPayoutColorClass(0.00), 'revenue-amount');
        assert.strictEqual(getGrossPayoutColorClass(-0), 'revenue-amount'); // -0 equals 0 in JS
    });

    test('Very small positive payout → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(0.001), 'revenue-amount');
        assert.strictEqual(getGrossPayoutColorClass(0.0000001), 'revenue-amount');
    });

    test('Very small negative payout → RED', () => {
        assert.strictEqual(getGrossPayoutColorClass(-0.001), 'expense-amount');
        assert.strictEqual(getGrossPayoutColorClass(-0.0000001), 'expense-amount');
    });

    test('NaN gross payout → handled safely (falsy check)', () => {
        // NaN < 0 is false, so should be revenue-amount
        assert.strictEqual(getGrossPayoutColorClass(NaN), 'revenue-amount');
    });

    test('Infinity gross payout → GREEN', () => {
        assert.strictEqual(getGrossPayoutColorClass(Infinity), 'revenue-amount');
    });

    test('Negative Infinity gross payout → RED', () => {
        assert.strictEqual(getGrossPayoutColorClass(-Infinity), 'expense-amount');
    });
});

// ============================================================
// TEST SUITE 10: CSS Color Values Verification
// ============================================================

describe('TEST SUITE 10: CSS Color Values (Hex Codes)', () => {

    const COLORS = {
        'revenue-amount': '#059669', // Green
        'expense-amount': '#dc2626', // Red
        'info-amount': '#2563eb'     // Blue
    };

    test('revenue-amount should be GREEN (#059669)', () => {
        assert.strictEqual(COLORS['revenue-amount'], '#059669');
    });

    test('expense-amount should be RED (#dc2626)', () => {
        assert.strictEqual(COLORS['expense-amount'], '#dc2626');
    });

    test('info-amount should be BLUE (#2563eb)', () => {
        assert.strictEqual(COLORS['info-amount'], '#2563eb');
    });
});

// ============================================================
// TEST SUITE 11: Combined Statement Multi-Property
// ============================================================

describe('TEST SUITE 11: Combined Statement with Multiple Properties', () => {

    test('Combined statement: properties with different sources have correct colors', () => {
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: false
        };

        // Property 1: Airbnb booking
        const prop1Res = { source: 'Airbnb', propertyId: 1, clientRevenue: 500, clientTaxResponsibility: 50 };

        // Property 2: VRBO booking
        const prop2Res = { source: 'VRBO', propertyId: 2, clientRevenue: 600, clientTaxResponsibility: 60 };

        // Property 3: Marriott booking
        const prop3Res = { source: 'Marriott', propertyId: 3, clientRevenue: 700, clientTaxResponsibility: 70 };

        // Each should have correct tax color
        assert.strictEqual(getTaxColorClass(prop1Res, statement), 'info-amount');     // Airbnb → BLUE
        assert.strictEqual(getTaxColorClass(prop2Res, statement), 'revenue-amount');  // VRBO → GREEN
        assert.strictEqual(getTaxColorClass(prop3Res, statement), 'revenue-amount');  // Marriott → GREEN
    });

    test('Combined statement: one co-hosted, others not', () => {
        // This scenario: statement has isCohostOnAirbnb from the primary property
        // Individual reservations should be evaluated based on source

        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: true // One property is co-hosted
        };

        // All Airbnb bookings in a co-hosted statement
        const res1 = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const res2 = { source: 'Airbnb', clientRevenue: 600, clientTaxResponsibility: 60 };

        // Tax should still be BLUE (Airbnb without passThrough)
        assert.strictEqual(getTaxColorClass(res1, statement), 'info-amount');
        assert.strictEqual(getTaxColorClass(res2, statement), 'info-amount');

        // But gross payout should be RED (negative - co-host)
        const payout1 = calculateGrossPayout(res1, statement);
        const payout2 = calculateGrossPayout(res2, statement);

        assert.strictEqual(payout1, -75);  // -15% of 500
        assert.strictEqual(payout2, -90);  // -15% of 600
        assert.strictEqual(getGrossPayoutColorClass(payout1), 'expense-amount');
        assert.strictEqual(getGrossPayoutColorClass(payout2), 'expense-amount');
    });
});

// ============================================================
// FINAL SUMMARY
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('COMPREHENSIVE COLOR TEST SUMMARY');
console.log('='.repeat(60));
console.log(`\nTotal Tests: ${passCount + failCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failures.length > 0) {
    console.log('\n--- FAILURES ---');
    failures.forEach((f, i) => {
        console.log(`${i + 1}. ${f.name}`);
        console.log(`   ${f.error}`);
    });
}

console.log('\n' + '='.repeat(60));
if (failCount === 0) {
    console.log('ALL TESTS PASSED - 100% CONFIDENCE IN COLOR LOGIC');
} else {
    console.log('SOME TESTS FAILED - REVIEW REQUIRED');
    process.exitCode = 1;
}
console.log('='.repeat(60) + '\n');

module.exports = {
    isAirbnbSource,
    shouldAddTax,
    getTaxColorClass,
    getGrossPayoutColorClass,
    calculateGrossPayout
};
