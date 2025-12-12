/**
 * Listing Settings Override Tests
 * Converted to Jest format
 *
 * Tests for:
 * 1. Current listing settings override stored statement values when viewing
 * 2. SQLite boolean values (0/1) properly converted to JavaScript booleans
 * 3. Fallback handling for undefined/null boolean values
 * 4. VRBO (non-Airbnb) reservations properly include tax in GROSS PAYOUT
 */

// ============================================================================
// HELPER FUNCTIONS (matching production code)
// ============================================================================

function isAirbnbSource(source) {
    return source && source.toLowerCase().includes('airbnb');
}

function shouldAddTax(isAirbnb, airbnbPassThroughTax, disregardTax) {
    return !disregardTax && (!isAirbnb || airbnbPassThroughTax);
}

function calculateGrossPayout(clientRevenue, luxuryFee, taxResponsibility, isAirbnb, isCohostAirbnb, airbnbPassThroughTax, disregardTax) {
    const addTax = shouldAddTax(isAirbnb, airbnbPassThroughTax, disregardTax);

    if (isCohostAirbnb) {
        return -luxuryFee;
    } else if (addTax) {
        return clientRevenue - luxuryFee + taxResponsibility;
    } else {
        return clientRevenue - luxuryFee;
    }
}

function convertSqliteBoolean(value) {
    return Boolean(value);
}

function applyListingSettingsOverride(statement, currentListing) {
    if (currentListing) {
        statement.disregardTax = Boolean(currentListing.disregardTax);
        statement.isCohostOnAirbnb = Boolean(currentListing.isCohostOnAirbnb);
        statement.airbnbPassThroughTax = Boolean(currentListing.airbnbPassThroughTax);
        statement.pmPercentage = currentListing.pmFeePercentage ?? statement.pmPercentage ?? 15;
    }

    statement.disregardTax = Boolean(statement.disregardTax);
    statement.isCohostOnAirbnb = Boolean(statement.isCohostOnAirbnb);
    statement.airbnbPassThroughTax = Boolean(statement.airbnbPassThroughTax);
    statement.pmPercentage = statement.pmPercentage ?? 15;

    return statement;
}

function calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings) {
    const propSettings = listingSettingsMap[reservation.propertyId] || defaultSettings;
    const isAirbnb = isAirbnbSource(reservation.source);
    const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;
    const clientRevenue = reservation.clientRevenue;
    const luxuryFee = clientRevenue * (propSettings.pmFeePercentage / 100);
    const taxResponsibility = reservation.clientTaxResponsibility || 0;
    const addTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);

    let grossPayout;
    if (isCohostAirbnb) {
        grossPayout = -luxuryFee;
    } else if (addTax) {
        grossPayout = clientRevenue - luxuryFee + taxResponsibility;
    } else {
        grossPayout = clientRevenue - luxuryFee;
    }
    return grossPayout;
}

function filterListingsByTag(listings, tag) {
    const tagLower = tag.toLowerCase().trim();
    return listings.filter(l => {
        const listingTags = l.tags || [];
        return listingTags.some(t => t.toLowerCase().trim() === tagLower);
    });
}

// ============================================================================
// TEST SUITE 1: SQLite Boolean Conversion
// ============================================================================
describe('SQLite Boolean Conversion', () => {
    test('SQLite 0 converts to false', () => {
        expect(convertSqliteBoolean(0)).toBe(false);
    });

    test('SQLite 1 converts to true', () => {
        expect(convertSqliteBoolean(1)).toBe(true);
    });

    test('JavaScript false stays false', () => {
        expect(convertSqliteBoolean(false)).toBe(false);
    });

    test('JavaScript true stays true', () => {
        expect(convertSqliteBoolean(true)).toBe(true);
    });

    test('null converts to false', () => {
        expect(convertSqliteBoolean(null)).toBe(false);
    });

    test('undefined converts to false', () => {
        expect(convertSqliteBoolean(undefined)).toBe(false);
    });

    test('Empty string converts to false', () => {
        expect(convertSqliteBoolean('')).toBe(false);
    });

    test('Non-empty string converts to true', () => {
        expect(convertSqliteBoolean('true')).toBe(true);
        expect(convertSqliteBoolean('false')).toBe(true);
    });
});

// ============================================================================
// TEST SUITE 2: Listing Settings Override
// ============================================================================
describe('Listing Settings Override', () => {
    test('Current listing settings override stored statement values', () => {
        const statement = {
            disregardTax: true,
            airbnbPassThroughTax: false,
            isCohostOnAirbnb: false,
            pmPercentage: 15
        };
        const currentListing = {
            disregardTax: 0,
            airbnbPassThroughTax: 1,
            isCohostOnAirbnb: 0,
            pmFeePercentage: 20
        };
        applyListingSettingsOverride(statement, currentListing);
        expect(statement.disregardTax).toBe(false);
        expect(statement.airbnbPassThroughTax).toBe(true);
        expect(statement.pmPercentage).toBe(20);
    });

    test('Statement keeps stored values when no listing found', () => {
        const statement = {
            disregardTax: true,
            airbnbPassThroughTax: false,
            isCohostOnAirbnb: true,
            pmPercentage: 18
        };
        applyListingSettingsOverride(statement, null);
        expect(statement.disregardTax).toBe(true);
        expect(statement.airbnbPassThroughTax).toBe(false);
        expect(statement.isCohostOnAirbnb).toBe(true);
        expect(statement.pmPercentage).toBe(18);
    });

    test('Undefined statement values fallback to false/default', () => {
        const statement = {};
        applyListingSettingsOverride(statement, null);
        expect(statement.disregardTax).toBe(false);
        expect(statement.airbnbPassThroughTax).toBe(false);
        expect(statement.isCohostOnAirbnb).toBe(false);
        expect(statement.pmPercentage).toBe(15);
    });
});

// ============================================================================
// TEST SUITE 3: VRBO Tax Calculation Fix
// ============================================================================
describe('VRBO Tax Calculation Fix', () => {
    test('VRBO reservation includes tax in GROSS PAYOUT by default', () => {
        const clientRevenue = 2573.02;
        const pmFee = 257.30;
        const taxResponsibility = 286.15;
        const grossPayout = calculateGrossPayout(
            clientRevenue, pmFee, taxResponsibility,
            false, false, false, false
        );
        expect(grossPayout).toBeCloseTo(2601.87, 2);
    });

    test('VRBO reservation excludes tax when disregardTax is enabled', () => {
        const clientRevenue = 2573.02;
        const pmFee = 257.30;
        const taxResponsibility = 286.15;
        const grossPayout = calculateGrossPayout(
            clientRevenue, pmFee, taxResponsibility,
            false, false, false, true
        );
        expect(grossPayout).toBeCloseTo(2315.72, 2);
    });

    test('Individual row and TOTALS use same calculation for VRBO', () => {
        const reservation = {
            source: 'VRBO',
            clientRevenue: 2573.02,
            clientTaxResponsibility: 286.15,
            hasDetailedFinance: true
        };
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            isCohostOnAirbnb: false,
            pmPercentage: 10
        };
        const isAirbnb = isAirbnbSource(reservation.source);
        const pmFee = reservation.clientRevenue * (statement.pmPercentage / 100);
        const rowGrossPayout = calculateGrossPayout(
            reservation.clientRevenue, pmFee, reservation.clientTaxResponsibility,
            isAirbnb, isAirbnb && statement.isCohostOnAirbnb,
            statement.airbnbPassThroughTax, statement.disregardTax
        );
        const totalsGrossPayout = calculateGrossPayout(
            reservation.clientRevenue, pmFee, reservation.clientTaxResponsibility,
            isAirbnb, isAirbnb && statement.isCohostOnAirbnb,
            statement.airbnbPassThroughTax, statement.disregardTax
        );
        expect(rowGrossPayout).toBe(totalsGrossPayout);
    });
});

// ============================================================================
// TEST SUITE 4: Mixed Source Scenarios
// ============================================================================
describe('Mixed Source Scenarios', () => {
    test('VRBO includes tax, Airbnb excludes tax (default behavior)', () => {
        const reservations = [
            { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
            { source: 'Airbnb', clientRevenue: 1500, clientTaxResponsibility: 120 }
        ];
        const statement = { disregardTax: false, airbnbPassThroughTax: false, pmPercentage: 15 };
        let totalGrossPayout = 0;
        for (const res of reservations) {
            const isAirbnb = isAirbnbSource(res.source);
            const pmFee = res.clientRevenue * (statement.pmPercentage / 100);
            const payout = calculateGrossPayout(
                res.clientRevenue, pmFee, res.clientTaxResponsibility,
                isAirbnb, false, statement.airbnbPassThroughTax, statement.disregardTax
            );
            totalGrossPayout += payout;
        }
        expect(totalGrossPayout).toBeCloseTo(2205, 2);
    });

    test('Both sources include tax when airbnbPassThroughTax is enabled', () => {
        const reservations = [
            { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
            { source: 'Airbnb', clientRevenue: 1500, clientTaxResponsibility: 120 }
        ];
        const statement = { disregardTax: false, airbnbPassThroughTax: true, pmPercentage: 15 };
        let totalGrossPayout = 0;
        for (const res of reservations) {
            const isAirbnb = isAirbnbSource(res.source);
            const pmFee = res.clientRevenue * (statement.pmPercentage / 100);
            const payout = calculateGrossPayout(
                res.clientRevenue, pmFee, res.clientTaxResponsibility,
                isAirbnb, false, statement.airbnbPassThroughTax, statement.disregardTax
            );
            totalGrossPayout += payout;
        }
        expect(totalGrossPayout).toBeCloseTo(2325, 2);
    });

    test('Neither source includes tax when disregardTax is enabled', () => {
        const reservations = [
            { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 },
            { source: 'Airbnb', clientRevenue: 1500, clientTaxResponsibility: 120 }
        ];
        const statement = { disregardTax: true, airbnbPassThroughTax: true, pmPercentage: 15 };
        let totalGrossPayout = 0;
        for (const res of reservations) {
            const isAirbnb = isAirbnbSource(res.source);
            const pmFee = res.clientRevenue * (statement.pmPercentage / 100);
            const payout = calculateGrossPayout(
                res.clientRevenue, pmFee, res.clientTaxResponsibility,
                isAirbnb, false, statement.airbnbPassThroughTax, statement.disregardTax
            );
            totalGrossPayout += payout;
        }
        expect(totalGrossPayout).toBeCloseTo(2125, 2);
    });
});

// ============================================================================
// TEST SUITE 5: William Maddox Bug Scenario
// ============================================================================
describe('William Maddox Bug Scenario', () => {
    test('Exact values from bug report - VRBO reservation with 15% PM fee', () => {
        const clientRevenue = 2573.02;
        const pmPercentage = 15;
        const pmFee = clientRevenue * (pmPercentage / 100);
        const taxResponsibility = 286.15;
        const grossPayoutWithTax = calculateGrossPayout(
            clientRevenue, pmFee, taxResponsibility,
            false, false, false, false
        );
        expect(grossPayoutWithTax).toBeCloseTo(2473.22, 2);
    });

    test('Bug scenario - individual row and TOTALS now match', () => {
        const statement = {
            disregardTax: false,
            airbnbPassThroughTax: false,
            isCohostOnAirbnb: false,
            pmPercentage: 15,
            reservations: [{
                source: 'VRBO',
                guestName: 'William Maddox',
                clientRevenue: 2573.02,
                clientTaxResponsibility: 286.15,
                hasDetailedFinance: true
            }]
        };
        const currentListing = {
            disregardTax: 0,
            airbnbPassThroughTax: 0,
            isCohostOnAirbnb: 0,
            pmFeePercentage: 15
        };
        applyListingSettingsOverride(statement, currentListing);
        const res = statement.reservations[0];
        const isAirbnb = isAirbnbSource(res.source);
        const pmFee = res.clientRevenue * (statement.pmPercentage / 100);
        const rowPayout = calculateGrossPayout(
            res.clientRevenue, pmFee, res.clientTaxResponsibility,
            isAirbnb, false, statement.airbnbPassThroughTax, statement.disregardTax
        );
        let totalGrossPayout = 0;
        for (const reservation of statement.reservations) {
            const resIsAirbnb = isAirbnbSource(reservation.source);
            const resPmFee = reservation.clientRevenue * (statement.pmPercentage / 100);
            totalGrossPayout += calculateGrossPayout(
                reservation.clientRevenue, resPmFee, reservation.clientTaxResponsibility,
                resIsAirbnb, false, statement.airbnbPassThroughTax, statement.disregardTax
            );
        }
        expect(rowPayout).toBeCloseTo(2473.22, 2);
        expect(totalGrossPayout).toBeCloseTo(2473.22, 2);
        expect(rowPayout).toBe(totalGrossPayout);
    });
});

// ============================================================================
// TEST SUITE 6: Combined Statement Per-Property Settings
// ============================================================================
describe('Combined Statement Per-Property Settings', () => {
    test('Combined statement respects per-property isCohostOnAirbnb setting', () => {
        const listingSettingsMap = {
            101: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            102: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const res1 = { propertyId: 101, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const res2 = { propertyId: 102, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout1 = calculateGrossPayoutWithPropertySettings(res1, listingSettingsMap, defaultSettings);
        const payout2 = calculateGrossPayoutWithPropertySettings(res2, listingSettingsMap, defaultSettings);
        expect(payout1).toBeCloseTo(-150, 2);
        expect(payout2).toBeCloseTo(950, 2);
    });

    test('Combined statement uses correct PM fee per property', () => {
        const listingSettingsMap = {
            201: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 10 },
            202: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 20 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const res1 = { propertyId: 201, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 };
        const res2 = { propertyId: 202, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 };
        const payout1 = calculateGrossPayoutWithPropertySettings(res1, listingSettingsMap, defaultSettings);
        const payout2 = calculateGrossPayoutWithPropertySettings(res2, listingSettingsMap, defaultSettings);
        expect(payout1).toBeCloseTo(980, 2);
        expect(payout2).toBeCloseTo(880, 2);
    });

    test('Combined statement handles mixed co-host and non-co-host Airbnb properties', () => {
        const listingSettingsMap = {
            301: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            302: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const resFloor2_1 = { propertyId: 301, source: 'Airbnb', clientRevenue: 416.90, clientTaxResponsibility: 0 };
        const resFloor2_2 = { propertyId: 301, source: 'Airbnb', clientRevenue: 273.19, clientTaxResponsibility: 0 };
        const resBasement = { propertyId: 302, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout1 = calculateGrossPayoutWithPropertySettings(resFloor2_1, listingSettingsMap, defaultSettings);
        const payout2 = calculateGrossPayoutWithPropertySettings(resFloor2_2, listingSettingsMap, defaultSettings);
        const payout3 = calculateGrossPayoutWithPropertySettings(resBasement, listingSettingsMap, defaultSettings);
        expect(payout1).toBeCloseTo(-(416.90 * 0.15), 2);
        expect(payout2).toBeCloseTo(-(273.19 * 0.15), 2);
        expect(payout3).toBeCloseTo(1000 - 150 + 100, 2);
        const totalPayout = payout1 + payout2 + payout3;
        expect(totalPayout).toBeCloseTo(846.49, 1);
    });

    test('Fallback to default settings when property not in map', () => {
        const listingSettingsMap = {
            401: { isCohostOnAirbnb: true, disregardTax: true, airbnbPassThroughTax: false, pmFeePercentage: 20 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const resUnknown = { propertyId: 999, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 80 };
        const payout = calculateGrossPayoutWithPropertySettings(resUnknown, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(930, 2);
    });
});

// ============================================================================
// TEST SUITE 7: Co-Host Airbnb Edge Cases
// ============================================================================
describe('Co-Host Airbnb Edge Cases', () => {
    test('Co-host Airbnb shows negative GROSS PAYOUT regardless of tax settings', () => {
        const grossPayout = calculateGrossPayout(500, 75, 50, true, true, true, false);
        expect(grossPayout).toBe(-75);
    });

    test('Co-host Airbnb ignores disregardTax setting', () => {
        const grossPayout = calculateGrossPayout(500, 75, 50, true, true, false, true);
        expect(grossPayout).toBe(-75);
    });

    test('Non-Airbnb on co-host property uses normal calculation', () => {
        const isAirbnb = false;
        const propertyIsCohost = true;
        const isCohostAirbnb = isAirbnb && propertyIsCohost;
        const grossPayout = calculateGrossPayout(1000, 150, 80, isAirbnb, isCohostAirbnb, false, false);
        expect(grossPayout).toBeCloseTo(930, 2);
    });

    test('Co-host calculation with zero PM fee', () => {
        const grossPayout = calculateGrossPayout(1000, 0, 100, true, true, false, false);
        expect(grossPayout).toBeCloseTo(0, 2);
    });

    test('Co-host calculation with 100% PM fee', () => {
        const grossPayout = calculateGrossPayout(1000, 1000, 100, true, true, false, false);
        expect(grossPayout).toBe(-1000);
    });
});

// ============================================================================
// TEST SUITE 8: Tax Calculation Truth Table
// ============================================================================
describe('Tax Calculation Truth Table', () => {
    test('VRBO, no passThrough, no disregard -> ADD TAX', () => {
        expect(shouldAddTax(false, false, false)).toBe(true);
    });

    test('VRBO, passThrough, no disregard -> ADD TAX', () => {
        expect(shouldAddTax(false, true, false)).toBe(true);
    });

    test('VRBO, no passThrough, disregard -> NO TAX', () => {
        expect(shouldAddTax(false, false, true)).toBe(false);
    });

    test('VRBO, passThrough, disregard -> NO TAX', () => {
        expect(shouldAddTax(false, true, true)).toBe(false);
    });

    test('Airbnb, no passThrough, no disregard -> NO TAX', () => {
        expect(shouldAddTax(true, false, false)).toBe(false);
    });

    test('Airbnb, passThrough, no disregard -> ADD TAX', () => {
        expect(shouldAddTax(true, true, false)).toBe(true);
    });

    test('Airbnb, no passThrough, disregard -> NO TAX', () => {
        expect(shouldAddTax(true, false, true)).toBe(false);
    });

    test('Airbnb, passThrough, disregard -> NO TAX (disregard wins)', () => {
        expect(shouldAddTax(true, true, true)).toBe(false);
    });
});

// ============================================================================
// TEST SUITE 9: Source Detection Edge Cases
// ============================================================================
describe('Source Detection Edge Cases', () => {
    test('Airbnb (lowercase) detected as Airbnb', () => {
        expect(isAirbnbSource('airbnb')).toBe(true);
    });

    test('AIRBNB (uppercase) detected as Airbnb', () => {
        expect(isAirbnbSource('AIRBNB')).toBe(true);
    });

    test('Airbnb.com detected as Airbnb', () => {
        expect(isAirbnbSource('Airbnb.com')).toBe(true);
    });

    test('airbnb-api detected as Airbnb', () => {
        expect(isAirbnbSource('airbnb-api')).toBe(true);
    });

    test('VRBO not detected as Airbnb', () => {
        expect(isAirbnbSource('VRBO')).toBe(false);
    });

    test('Booking.com not detected as Airbnb', () => {
        expect(isAirbnbSource('Booking.com')).toBe(false);
    });

    test('Direct not detected as Airbnb', () => {
        expect(isAirbnbSource('Direct')).toBe(false);
    });

    test('null source not detected as Airbnb', () => {
        expect(!!isAirbnbSource(null)).toBe(false);
    });

    test('undefined source not detected as Airbnb', () => {
        expect(!!isAirbnbSource(undefined)).toBe(false);
    });

    test('empty string not detected as Airbnb', () => {
        expect(!!isAirbnbSource('')).toBe(false);
    });
});

// ============================================================================
// TEST SUITE 10: Bowers St Scenario (Real Bug)
// ============================================================================
describe('Bowers St Scenario (Real Bug)', () => {
    test('Bowers Floor 2 - Co-hosted Airbnb individual statement', () => {
        const listingSettingsMap = {
            1001: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1001, source: 'Airbnb', clientRevenue: 416.90, clientTaxResponsibility: 0 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(-62.535, 1);
    });

    test('Bowers Basement - Booking.com individual statement', () => {
        const listingSettingsMap = {
            1002: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1002, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(950, 2);
    });

    test('Combined Bowers statement - BEFORE fix (bug behavior)', () => {
        const statementSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmPercentage: 15 };
        const reservations = [
            { propertyId: 1001, source: 'Airbnb', clientRevenue: 416.90, clientTaxResponsibility: 0 },
            { propertyId: 1002, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        let totalPayout = 0;
        for (const res of reservations) {
            const isAirbnb = isAirbnbSource(res.source);
            const isCohostAirbnb = isAirbnb && statementSettings.isCohostOnAirbnb;
            const pmFee = res.clientRevenue * (statementSettings.pmPercentage / 100);
            const addTax = shouldAddTax(isAirbnb, statementSettings.airbnbPassThroughTax, statementSettings.disregardTax);
            let payout;
            if (isCohostAirbnb) {
                payout = -pmFee;
            } else if (addTax) {
                payout = res.clientRevenue - pmFee + res.clientTaxResponsibility;
            } else {
                payout = res.clientRevenue - pmFee;
            }
            totalPayout += payout;
        }
        expect(totalPayout).toBeCloseTo(1304.36, 1);
    });

    test('Combined Bowers statement - AFTER fix (correct behavior)', () => {
        const listingSettingsMap = {
            1001: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            1002: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 1001, source: 'Airbnb', clientRevenue: 416.90, clientTaxResponsibility: 0 },
            { propertyId: 1002, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        let totalPayout = 0;
        for (const res of reservations) {
            totalPayout += calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings);
        }
        expect(totalPayout).toBeCloseTo(887.47, 1);
    });

    test('Combined statement difference between bug and fix', () => {
        const bugTotal = 1304.36;
        const fixTotal = 887.47;
        const difference = bugTotal - fixTotal;
        expect(difference).toBeCloseTo(416.90, 0);
    });
});

// ============================================================================
// TEST SUITE 11: Numeric Edge Cases
// ============================================================================
describe('Numeric Edge Cases', () => {
    test('Zero revenue, zero tax, zero PM', () => {
        const payout = calculateGrossPayout(0, 0, 0, false, false, false, false);
        expect(payout).toBe(0);
    });

    test('Negative revenue (refund scenario)', () => {
        const payout = calculateGrossPayout(-500, -75, -50, false, false, false, false);
        expect(payout).toBeCloseTo(-475, 2);
    });

    test('Very large numbers', () => {
        const payout = calculateGrossPayout(1000000, 150000, 100000, false, false, false, false);
        expect(payout).toBeCloseTo(950000, 2);
    });

    test('Decimal precision (cents)', () => {
        const payout = calculateGrossPayout(123.45, 18.52, 12.34, false, false, false, false);
        expect(payout).toBeCloseTo(117.27, 2);
    });

    test('Very small numbers', () => {
        const payout = calculateGrossPayout(0.01, 0.00, 0.00, false, false, false, false);
        expect(payout).toBeCloseTo(0.01, 3);
    });
});

// ============================================================================
// TEST SUITE 12: Multiple Properties Different Settings
// ============================================================================
describe('Multiple Properties Different Settings', () => {
    test('3 properties: co-host, disregardTax, normal', () => {
        const listingSettingsMap = {
            501: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            502: { isCohostOnAirbnb: false, disregardTax: true, airbnbPassThroughTax: false, pmFeePercentage: 20 },
            503: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 10 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 501, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 502, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 503, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        const payouts = reservations.map(res =>
            calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings)
        );
        expect(payouts[0]).toBeCloseTo(-150, 2);
        expect(payouts[1]).toBeCloseTo(800, 2);
        expect(payouts[2]).toBeCloseTo(1000, 2);
        expect(payouts[0] + payouts[1] + payouts[2]).toBeCloseTo(1650, 2);
    });

    test('5 properties with varying PM fees (5%, 10%, 15%, 20%, 25%)', () => {
        const listingSettingsMap = {
            601: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 5 },
            602: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 10 },
            603: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            604: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 20 },
            605: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 25 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 601, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 602, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 603, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 604, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 605, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        const payouts = reservations.map(res =>
            calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings)
        );
        expect(payouts[0]).toBeCloseTo(1050, 2);
        expect(payouts[1]).toBeCloseTo(1000, 2);
        expect(payouts[2]).toBeCloseTo(950, 2);
        expect(payouts[3]).toBeCloseTo(900, 2);
        expect(payouts[4]).toBeCloseTo(850, 2);
    });
});

// ============================================================================
// TEST SUITE 13: Tag-Based Filtering
// ============================================================================
describe('Tag-Based Filtering', () => {
    test('Tag matching is case-insensitive (Leon vs leon)', () => {
        const listings = [
            { id: 1, name: 'Property 1', tags: ['Leon', 'Downtown'] },
            { id: 2, name: 'Property 2', tags: ['Gainesville'] }
        ];
        const result = filterListingsByTag(listings, 'leon');
        expect(result.length).toBe(1);
        expect(result[0].id).toBe(1);
    });

    test('Tag matching handles whitespace', () => {
        const listings = [
            { id: 1, name: 'Property 1', tags: ['  Leon  ', 'Downtown'] }
        ];
        const result = filterListingsByTag(listings, 'Leon');
        expect(result.length).toBe(1);
    });

    test('Tag matching handles empty tags array', () => {
        const listings = [
            { id: 1, name: 'Property 1', tags: [] },
            { id: 2, name: 'Property 2', tags: null },
            { id: 3, name: 'Property 3' }
        ];
        const result = filterListingsByTag(listings, 'Leon');
        expect(result.length).toBe(0);
    });

    test('Tag matching finds multiple properties', () => {
        const listings = [
            { id: 1, name: 'Property 1', tags: ['Leon', 'Downtown'] },
            { id: 2, name: 'Property 2', tags: ['LEON', 'Uptown'] },
            { id: 3, name: 'Property 3', tags: ['Gainesville'] }
        ];
        const result = filterListingsByTag(listings, 'leon');
        expect(result.length).toBe(2);
    });
});

// ============================================================================
// TEST SUITE 14: Combined Statement All Co-Host
// ============================================================================
describe('Combined Statement All Co-Host', () => {
    test('Combined statement with ALL co-hosted Airbnb properties', () => {
        const listingSettingsMap = {
            701: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            702: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 20 },
            703: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 10 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 701, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 702, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 703, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        let totalPayout = 0;
        for (const res of reservations) {
            totalPayout += calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings);
        }
        expect(totalPayout).toBeCloseTo(-450, 2);
    });

    test('Combined statement co-host properties with VRBO reservations', () => {
        const listingSettingsMap = {
            801: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 801, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(950, 2);
    });

    test('Combined statement co-host with mixed Airbnb and non-Airbnb', () => {
        const listingSettingsMap = {
            901: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 901, source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 },
            { propertyId: 901, source: 'Booking.com', clientRevenue: 500, clientTaxResponsibility: 50 }
        ];
        let totalPayout = 0;
        for (const res of reservations) {
            totalPayout += calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings);
        }
        expect(totalPayout).toBeCloseTo(400, 2);
    });
});

// ============================================================================
// TEST SUITE 15: Combined Statement Per-Property DisregardTax
// ============================================================================
describe('Combined Statement Per-Property DisregardTax', () => {
    test('Combined statement with one disregardTax property', () => {
        const listingSettingsMap = {
            1101: { isCohostOnAirbnb: false, disregardTax: true, airbnbPassThroughTax: false, pmFeePercentage: 15 },
            1102: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 1101, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 1102, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        const payouts = reservations.map(res =>
            calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings)
        );
        expect(payouts[0]).toBeCloseTo(850, 2);
        expect(payouts[1]).toBeCloseTo(950, 2);
    });

    test('Combined statement ALL properties disregardTax', () => {
        const listingSettingsMap = {
            1201: { isCohostOnAirbnb: false, disregardTax: true, airbnbPassThroughTax: false, pmFeePercentage: 10 },
            1202: { isCohostOnAirbnb: false, disregardTax: true, airbnbPassThroughTax: false, pmFeePercentage: 20 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 1201, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 1202, source: 'Booking.com', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        let totalPayout = 0;
        for (const res of reservations) {
            totalPayout += calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings);
        }
        expect(totalPayout).toBeCloseTo(1700, 2);
    });

    test('DisregardTax overrides airbnbPassThroughTax', () => {
        const listingSettingsMap = {
            1301: { isCohostOnAirbnb: false, disregardTax: true, airbnbPassThroughTax: true, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1301, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(850, 2);
    });
});

// ============================================================================
// TEST SUITE 16: Combined Statement Per-Property AirbnbPassThroughTax
// ============================================================================
describe('Combined Statement Per-Property AirbnbPassThroughTax', () => {
    test('Combined statement with one airbnbPassThroughTax property', () => {
        const listingSettingsMap = {
            1401: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: true, pmFeePercentage: 15 },
            1402: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservations = [
            { propertyId: 1401, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 },
            { propertyId: 1402, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 }
        ];
        const payouts = reservations.map(res =>
            calculateGrossPayoutWithPropertySettings(res, listingSettingsMap, defaultSettings)
        );
        expect(payouts[0]).toBeCloseTo(950, 2);
        expect(payouts[1]).toBeCloseTo(850, 2);
    });

    test('AirbnbPassThroughTax does not affect non-Airbnb sources', () => {
        const listingSettingsMap = {
            1501: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1501, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(950, 2);
    });
});

// ============================================================================
// TEST SUITE 17: Property ID Edge Cases
// ============================================================================
describe('Property ID Edge Cases', () => {
    test('PropertyId as string vs number lookup', () => {
        const listingSettingsMap = {
            '1601': { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1601, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(typeof payout).toBe('number');
    });

    test('PropertyId 0 (falsy but valid)', () => {
        const listingSettingsMap = {
            0: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 0, source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(-150, 2);
    });

    test('PropertyId null uses defaults', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: true, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 20 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: null, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(950, 2);
    });

    test('PropertyId undefined uses defaults', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: true, disregardTax: true, airbnbPassThroughTax: true, pmFeePercentage: 25 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(950, 2);
    });
});

// ============================================================================
// TEST SUITE 18: Empty and Null Scenarios
// ============================================================================
describe('Empty and Null Scenarios', () => {
    test('Empty listingSettingsMap uses defaults for all', () => {
        const listingSettingsMap = {};
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 123, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(950, 2);
    });

    test('Zero tax responsibility', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 0 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(850, 2);
    });

    test('Null tax responsibility treated as zero', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: null };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(850, 2);
    });

    test('Undefined tax responsibility treated as zero', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(850, 2);
    });
});

// ============================================================================
// TEST SUITE 19: PM Fee Edge Cases
// ============================================================================
describe('PM Fee Edge Cases', () => {
    test('PM Fee 0% - owner gets full revenue plus tax', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 0 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(1100, 2);
    });

    test('PM Fee 50%', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 50 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(600, 2);
    });

    test('PM Fee 100% - owner gets only tax', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 100 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(100, 2);
    });

    test('PM Fee > 100% - owner owes money', () => {
        const listingSettingsMap = {
            1: { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 150 }
        };
        const defaultSettings = { isCohostOnAirbnb: false, disregardTax: false, airbnbPassThroughTax: false, pmFeePercentage: 15 };
        const reservation = { propertyId: 1, source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const payout = calculateGrossPayoutWithPropertySettings(reservation, listingSettingsMap, defaultSettings);
        expect(payout).toBeCloseTo(-400, 2);
    });
});

// Export helpers
module.exports = {
    isAirbnbSource,
    shouldAddTax,
    calculateGrossPayout,
    convertSqliteBoolean,
    applyListingSettingsOverride,
    calculateGrossPayoutWithPropertySettings,
    filterListingsByTag
};
