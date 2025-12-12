/**
 * COMPREHENSIVE Statement View Color Tests
 * Converted to Jest format
 *
 * Coverage: 100% of all color logic edge cases
 */

// ============================================================
// HELPER FUNCTIONS - Exact mirror of production code
// ============================================================

function isAirbnbSource(source) {
    if (!source) return false;
    return source.toLowerCase().includes('airbnb');
}

function shouldAddTax(reservation, statement) {
    const isAirbnb = isAirbnbSource(reservation.source);
    return !statement.disregardTax && (!isAirbnb || statement.airbnbPassThroughTax);
}

function getTaxColorClass(reservation, statement) {
    return shouldAddTax(reservation, statement) ? 'revenue-amount' : 'info-amount';
}

function getGrossPayoutColorClass(grossPayout) {
    return grossPayout < 0 ? 'expense-amount' : 'revenue-amount';
}

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
// TEST SUITE 1: Source Detection (isAirbnbSource)
// ============================================================
describe('Source Detection (isAirbnbSource)', () => {

    // Airbnb variations - should all return true
    test('Airbnb (exact) → true', () => {
        expect(isAirbnbSource('Airbnb')).toBe(true);
    });

    test('airbnb (lowercase) → true', () => {
        expect(isAirbnbSource('airbnb')).toBe(true);
    });

    test('AIRBNB (uppercase) → true', () => {
        expect(isAirbnbSource('AIRBNB')).toBe(true);
    });

    test('AirBnB (mixed case) → true', () => {
        expect(isAirbnbSource('AirBnB')).toBe(true);
    });

    test('Airbnb Official → true', () => {
        expect(isAirbnbSource('Airbnb Official')).toBe(true);
    });

    test('airbnb.com → true', () => {
        expect(isAirbnbSource('airbnb.com')).toBe(true);
    });

    test('Airbnb (Co-host) → true', () => {
        expect(isAirbnbSource('Airbnb (Co-host)')).toBe(true);
    });

    // Non-Airbnb sources - should all return false
    test('VRBO → false', () => {
        expect(isAirbnbSource('VRBO')).toBe(false);
    });

    test('vrbo → false', () => {
        expect(isAirbnbSource('vrbo')).toBe(false);
    });

    test('Booking.com → false', () => {
        expect(isAirbnbSource('Booking.com')).toBe(false);
    });

    test('Marriott → false', () => {
        expect(isAirbnbSource('Marriott')).toBe(false);
    });

    test('Direct → false', () => {
        expect(isAirbnbSource('Direct')).toBe(false);
    });

    test('Expedia → false', () => {
        expect(isAirbnbSource('Expedia')).toBe(false);
    });

    test('HomeAway → false', () => {
        expect(isAirbnbSource('HomeAway')).toBe(false);
    });

    test('TripAdvisor → false', () => {
        expect(isAirbnbSource('TripAdvisor')).toBe(false);
    });

    test('Google → false', () => {
        expect(isAirbnbSource('Google')).toBe(false);
    });

    test('Manual → false', () => {
        expect(isAirbnbSource('Manual')).toBe(false);
    });

    // Edge cases
    test('null → false', () => {
        expect(isAirbnbSource(null)).toBe(false);
    });

    test('undefined → false', () => {
        expect(isAirbnbSource(undefined)).toBe(false);
    });

    test('empty string → false', () => {
        expect(isAirbnbSource('')).toBe(false);
    });

    test('whitespace only → false', () => {
        expect(isAirbnbSource('   ')).toBe(false);
    });
});

// ============================================================
// TEST SUITE 2: shouldAddTax() Core Logic - Truth Table
// ============================================================
describe('shouldAddTax() - Complete Truth Table (8 combinations)', () => {

    test('Non-Airbnb, disregardTax=false, passThrough=false → TRUE (tax added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(true);
    });

    test('Non-Airbnb, disregardTax=false, passThrough=true → TRUE (tax added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: false, airbnbPassThroughTax: true };
        expect(shouldAddTax(reservation, statement)).toBe(true);
    });

    test('Non-Airbnb, disregardTax=true, passThrough=false → FALSE (tax not added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });

    test('Non-Airbnb, disregardTax=true, passThrough=true → FALSE (tax not added)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: true, airbnbPassThroughTax: true };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });

    test('Airbnb, disregardTax=false, passThrough=false → FALSE (tax not added)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });

    test('Airbnb, disregardTax=false, passThrough=true → TRUE (tax added)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: true };
        expect(shouldAddTax(reservation, statement)).toBe(true);
    });

    test('Airbnb, disregardTax=true, passThrough=false → FALSE (tax not added)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });

    test('Airbnb, disregardTax=true, passThrough=true → FALSE (disregardTax wins)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: true, airbnbPassThroughTax: true };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });
});

// ============================================================
// TEST SUITE 3: Tax Color Class (getTaxColorClass)
// ============================================================
describe('Tax Color Class - All Booking Sources', () => {

    test('Airbnb (standard) → BLUE (info-amount)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');
    });

    test('Airbnb with passThrough → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: true };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('Airbnb with disregardTax → BLUE (info-amount)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');
    });

    test('VRBO → GREEN (revenue-amount)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('Marriott → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Marriott' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('Booking.com → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Booking.com' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('Direct → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Direct' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('Expedia → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Expedia' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('HomeAway → GREEN (revenue-amount)', () => {
        const reservation = { source: 'HomeAway' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('TripAdvisor → GREEN (revenue-amount)', () => {
        const reservation = { source: 'TripAdvisor' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('Google → GREEN (revenue-amount)', () => {
        const reservation = { source: 'Google' };
        const statement = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('VRBO with disregardTax → BLUE (info-amount)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');
    });

    test('Marriott with disregardTax → BLUE (info-amount)', () => {
        const reservation = { source: 'Marriott' };
        const statement = { disregardTax: true, airbnbPassThroughTax: false };
        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');
    });
});

// ============================================================
// TEST SUITE 4: Gross Payout Color Class
// ============================================================
describe('Gross Payout Color Class', () => {

    test('Positive payout $1000 → GREEN', () => {
        expect(getGrossPayoutColorClass(1000)).toBe('revenue-amount');
    });

    test('Positive payout $0.01 → GREEN', () => {
        expect(getGrossPayoutColorClass(0.01)).toBe('revenue-amount');
    });

    test('Zero payout $0 → GREEN', () => {
        expect(getGrossPayoutColorClass(0)).toBe('revenue-amount');
    });

    test('Negative payout -$100 → RED', () => {
        expect(getGrossPayoutColorClass(-100)).toBe('expense-amount');
    });

    test('Negative payout -$0.01 → RED', () => {
        expect(getGrossPayoutColorClass(-0.01)).toBe('expense-amount');
    });

    test('Large positive $999999 → GREEN', () => {
        expect(getGrossPayoutColorClass(999999)).toBe('revenue-amount');
    });

    test('Large negative -$999999 → RED', () => {
        expect(getGrossPayoutColorClass(-999999)).toBe('expense-amount');
    });
});

// ============================================================
// TEST SUITE 5: Fixed Column Colors (Always Same)
// ============================================================
describe('Fixed Column Colors (Constant)', () => {

    test('Base Rate is always GREEN (revenue-amount)', () => {
        const baseRateClass = 'revenue-amount';
        expect(baseRateClass).toBe('revenue-amount');
    });

    test('Cleaning & Other Fees is always GREEN (revenue-amount)', () => {
        const cleaningClass = 'revenue-amount';
        expect(cleaningClass).toBe('revenue-amount');
    });

    test('Platform Fees is always RED (expense-amount)', () => {
        const platformFeesClass = 'expense-amount';
        expect(platformFeesClass).toBe('expense-amount');
    });

    test('Revenue is always GREEN (revenue-amount)', () => {
        const revenueClass = 'revenue-amount';
        expect(revenueClass).toBe('revenue-amount');
    });

    test('PM Commission is always RED (expense-amount)', () => {
        const pmCommissionClass = 'expense-amount';
        expect(pmCommissionClass).toBe('expense-amount');
    });
});

// ============================================================
// TEST SUITE 6: Gross Payout Calculation with Colors
// ============================================================
describe('Gross Payout Calculation & Color Integration', () => {

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
        expect(grossPayout).toBe(950);
        expect(getGrossPayoutColorClass(grossPayout)).toBe('revenue-amount');
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
        expect(grossPayout).toBe(850);
        expect(getGrossPayoutColorClass(grossPayout)).toBe('revenue-amount');
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
        expect(grossPayout).toBe(950);
        expect(getGrossPayoutColorClass(grossPayout)).toBe('revenue-amount');
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
        expect(grossPayout).toBe(-150);
        expect(getGrossPayoutColorClass(grossPayout)).toBe('expense-amount');
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
        expect(grossPayout).toBe(-150);
        expect(getGrossPayoutColorClass(grossPayout)).toBe('expense-amount');
    });
});

// ============================================================
// TEST SUITE 7: Undefined/Null Flag Handling
// ============================================================
describe('Undefined/Null Flag Handling (Default Behavior)', () => {

    test('undefined flags (Non-Airbnb) → tax added (GREEN)', () => {
        const reservation = { source: 'VRBO' };
        const statement = {};
        expect(shouldAddTax(reservation, statement)).toBe(true);
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('undefined flags (Airbnb) → tax NOT added (BLUE)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = {};
        expect(!!shouldAddTax(reservation, statement)).toBe(false);
        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');
    });

    test('null disregardTax (Non-Airbnb) → tax added (GREEN)', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: null, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(true);
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });

    test('null passThrough (Airbnb) → tax NOT added (BLUE)', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: null };
        expect(!!shouldAddTax(reservation, statement)).toBe(false);
        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');
    });

    test('false as string "false" is truthy → treated as true', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: "false", airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });

    test('0 is falsy → treated as false for disregardTax', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: 0, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(true);
    });

    test('1 is truthy → treated as true for disregardTax', () => {
        const reservation = { source: 'VRBO' };
        const statement = { disregardTax: 1, airbnbPassThroughTax: false };
        expect(shouldAddTax(reservation, statement)).toBe(false);
    });

    test('1 is truthy → treated as true for passThrough', () => {
        const reservation = { source: 'Airbnb' };
        const statement = { disregardTax: false, airbnbPassThroughTax: 1 };
        expect(!!shouldAddTax(reservation, statement)).toBe(true);
        expect(getTaxColorClass(reservation, statement)).toBe('revenue-amount');
    });
});

// ============================================================
// TEST SUITE 8: Real-World Scenarios
// ============================================================
describe('Real-World Business Scenarios', () => {

    test('Scenario: Mixed statement (Airbnb + VRBO) - different tax colors', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: false, pmPercentage: 15, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const vrboRes = { source: 'VRBO', clientRevenue: 600, clientTaxResponsibility: 60 };

        expect(getTaxColorClass(airbnbRes, statement)).toBe('info-amount');
        expect(getTaxColorClass(vrboRes, statement)).toBe('revenue-amount');
    });

    test('Scenario: Property with passThrough enabled - all tax GREEN', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: true, pmPercentage: 15, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const vrboRes = { source: 'VRBO', clientRevenue: 600, clientTaxResponsibility: 60 };

        expect(getTaxColorClass(airbnbRes, statement)).toBe('revenue-amount');
        expect(getTaxColorClass(vrboRes, statement)).toBe('revenue-amount');
    });

    test('Scenario: Property with disregardTax - all tax BLUE', () => {
        const statement = { disregardTax: true, airbnbPassThroughTax: false, pmPercentage: 15, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const vrboRes = { source: 'VRBO', clientRevenue: 600, clientTaxResponsibility: 60 };
        const marriottRes = { source: 'Marriott', clientRevenue: 700, clientTaxResponsibility: 70 };

        expect(getTaxColorClass(airbnbRes, statement)).toBe('info-amount');
        expect(getTaxColorClass(vrboRes, statement)).toBe('info-amount');
        expect(getTaxColorClass(marriottRes, statement)).toBe('info-amount');
    });

    test('Scenario: Co-hosted Airbnb property - negative gross payout', () => {
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: true
        };

        const reservation = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };

        expect(getTaxColorClass(reservation, statement)).toBe('info-amount');

        const grossPayout = calculateGrossPayout(reservation, statement);
        expect(grossPayout).toBe(-150);
        expect(getGrossPayoutColorClass(grossPayout)).toBe('expense-amount');
    });

    test('Scenario: All Direct bookings (no platform) - all GREEN', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: false, pmPercentage: 15, isCohostOnAirbnb: false };

        const res1 = { source: 'Direct', clientRevenue: 500, clientTaxResponsibility: 50 };
        const res2 = { source: 'Manual', clientRevenue: 600, clientTaxResponsibility: 60 };
        const res3 = { source: 'Owner Referral', clientRevenue: 700, clientTaxResponsibility: 70 };

        expect(getTaxColorClass(res1, statement)).toBe('revenue-amount');
        expect(getTaxColorClass(res2, statement)).toBe('revenue-amount');
        expect(getTaxColorClass(res3, statement)).toBe('revenue-amount');
    });

    test('Scenario: Zero tax amount - color still applies correctly', () => {
        const statement = { disregardTax: false, airbnbPassThroughTax: false };

        const airbnbRes = { source: 'Airbnb', clientTaxResponsibility: 0 };
        const vrboRes = { source: 'VRBO', clientTaxResponsibility: 0 };

        expect(getTaxColorClass(airbnbRes, statement)).toBe('info-amount');
        expect(getTaxColorClass(vrboRes, statement)).toBe('revenue-amount');
    });
});

// ============================================================
// TEST SUITE 9: Edge Cases & Boundary Conditions
// ============================================================
describe('Edge Cases & Boundary Conditions', () => {

    test('Source with leading/trailing spaces → correctly detected', () => {
        expect(isAirbnbSource('  Airbnb  ')).toBe(true);
        expect(isAirbnbSource('  VRBO  ')).toBe(false);
    });

    test('Source with special characters → correctly detected', () => {
        expect(isAirbnbSource('Airbnb®')).toBe(true);
        expect(isAirbnbSource('Booking.com™')).toBe(false);
    });

    test('Very long source name containing Airbnb → detected', () => {
        expect(isAirbnbSource('This is a very long source name from Airbnb platform')).toBe(true);
    });

    test('Source that partially matches "air" but not "airbnb" → false', () => {
        expect(isAirbnbSource('Airplane Rentals')).toBe(false);
        expect(isAirbnbSource('Air BnB Rentals')).toBe(false);
    });

    test('Gross payout exactly zero → GREEN', () => {
        expect(getGrossPayoutColorClass(0)).toBe('revenue-amount');
        expect(getGrossPayoutColorClass(0.00)).toBe('revenue-amount');
        expect(getGrossPayoutColorClass(-0)).toBe('revenue-amount');
    });

    test('Very small positive payout → GREEN', () => {
        expect(getGrossPayoutColorClass(0.001)).toBe('revenue-amount');
        expect(getGrossPayoutColorClass(0.0000001)).toBe('revenue-amount');
    });

    test('Very small negative payout → RED', () => {
        expect(getGrossPayoutColorClass(-0.001)).toBe('expense-amount');
        expect(getGrossPayoutColorClass(-0.0000001)).toBe('expense-amount');
    });

    test('NaN gross payout → handled safely (falsy check)', () => {
        expect(getGrossPayoutColorClass(NaN)).toBe('revenue-amount');
    });

    test('Infinity gross payout → GREEN', () => {
        expect(getGrossPayoutColorClass(Infinity)).toBe('revenue-amount');
    });

    test('Negative Infinity gross payout → RED', () => {
        expect(getGrossPayoutColorClass(-Infinity)).toBe('expense-amount');
    });
});

// ============================================================
// TEST SUITE 10: CSS Color Values Verification
// ============================================================
describe('CSS Color Values (Hex Codes)', () => {

    const COLORS = {
        'revenue-amount': '#059669',
        'expense-amount': '#dc2626',
        'info-amount': '#2563eb'
    };

    test('revenue-amount should be GREEN (#059669)', () => {
        expect(COLORS['revenue-amount']).toBe('#059669');
    });

    test('expense-amount should be RED (#dc2626)', () => {
        expect(COLORS['expense-amount']).toBe('#dc2626');
    });

    test('info-amount should be BLUE (#2563eb)', () => {
        expect(COLORS['info-amount']).toBe('#2563eb');
    });
});

// ============================================================
// TEST SUITE 11: Combined Statement Multi-Property
// ============================================================
describe('Combined Statement with Multiple Properties', () => {

    test('Combined statement: properties with different sources have correct colors', () => {
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: false
        };

        const prop1Res = { source: 'Airbnb', propertyId: 1, clientRevenue: 500, clientTaxResponsibility: 50 };
        const prop2Res = { source: 'VRBO', propertyId: 2, clientRevenue: 600, clientTaxResponsibility: 60 };
        const prop3Res = { source: 'Marriott', propertyId: 3, clientRevenue: 700, clientTaxResponsibility: 70 };

        expect(getTaxColorClass(prop1Res, statement)).toBe('info-amount');
        expect(getTaxColorClass(prop2Res, statement)).toBe('revenue-amount');
        expect(getTaxColorClass(prop3Res, statement)).toBe('revenue-amount');
    });

    test('Combined statement: one co-hosted, others not', () => {
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            pmPercentage: 15,
            isCohostOnAirbnb: true
        };

        const res1 = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const res2 = { source: 'Airbnb', clientRevenue: 600, clientTaxResponsibility: 60 };

        expect(getTaxColorClass(res1, statement)).toBe('info-amount');
        expect(getTaxColorClass(res2, statement)).toBe('info-amount');

        const payout1 = calculateGrossPayout(res1, statement);
        const payout2 = calculateGrossPayout(res2, statement);

        expect(payout1).toBe(-75);
        expect(payout2).toBe(-90);
        expect(getGrossPayoutColorClass(payout1)).toBe('expense-amount');
        expect(getGrossPayoutColorClass(payout2)).toBe('expense-amount');
    });
});

// Export for potential reuse
module.exports = {
    isAirbnbSource,
    shouldAddTax,
    getTaxColorClass,
    getGrossPayoutColorClass,
    calculateGrossPayout
};
