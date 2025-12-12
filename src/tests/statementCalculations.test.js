/**
 * Statement Calculation Tests
 *
 * These tests verify that the core calculation logic is correct for:
 * 1. Single property statements
 * 2. Combined multi-property statements
 *
 * Core Formula:
 * ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees
 *
 * Where:
 * - techFees = propertyCount * $50
 * - insuranceFees = propertyCount * $25
 * - pmCommission = totalRevenue * (pmPercentage / 100)
 */

// ============================================================================
// CORE CALCULATION FUNCTIONS (extracted from statements-file.js for testing)
// ============================================================================

/**
 * Calculate total revenue from reservations
 * Excludes Airbnb revenue for co-hosted properties
 */
function calculateTotalRevenue(reservations, listingInfoMap = {}) {
    let totalRevenue = 0;
    for (const res of reservations) {
        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
        const isCohostForProperty = listingInfoMap[res.propertyId]?.isCohostOnAirbnb || false;

        // Exclude Airbnb revenue for co-hosted properties
        if (isAirbnb && isCohostForProperty) {
            continue;
        }

        totalRevenue += (res.grossAmount || 0);
    }
    return totalRevenue;
}

/**
 * Calculate total expenses (only actual costs, not upsells)
 */
function calculateTotalExpenses(expenses) {
    return expenses.reduce((sum, exp) => {
        const isUpsell = exp.amount > 0 ||
            (exp.type && exp.type.toLowerCase() === 'upsell') ||
            (exp.category && exp.category.toLowerCase() === 'upsell');
        return isUpsell ? sum : sum + Math.abs(exp.amount);
    }, 0);
}

/**
 * Calculate PM commission based on reservations and property PM fees
 */
function calculatePmCommission(reservations, listingInfoMap = {}, defaultPmFee = 15) {
    let pmCommission = 0;
    for (const res of reservations) {
        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
        const listing = listingInfoMap[res.propertyId];
        const isCohostForProperty = listing?.isCohostOnAirbnb || false;

        // Skip PM commission for co-hosted Airbnb reservations
        if (isAirbnb && isCohostForProperty) {
            continue;
        }

        const resPmFee = listing?.pmFeePercentage ?? defaultPmFee;
        const resCommission = (res.grossAmount || 0) * (resPmFee / 100);
        pmCommission += resCommission;
    }
    return pmCommission;
}

/**
 * Calculate tech fees ($50 per property)
 */
function calculateTechFees(propertyCount) {
    return propertyCount * 50;
}

/**
 * Calculate insurance fees ($25 per property)
 */
function calculateInsuranceFees(propertyCount) {
    return propertyCount * 25;
}

/**
 * Calculate owner payout - THE CORE FORMULA
 */
function calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees) {
    return totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees;
}

/**
 * Round to 2 decimal places (for currency)
 */
function roundCurrency(amount) {
    return Math.round(amount * 100) / 100;
}

// ============================================================================
// TEST SUITE 1: Single Property Statement
// ============================================================================

describe('Statement Calculations', () => {

    describe('Single Property Statement', () => {

        test('Basic revenue calculation', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'vrbo' },
                { propertyId: 1, grossAmount: 1500, source: 'booking.com' },
                { propertyId: 1, grossAmount: 800, source: 'direct' }
            ];
            const totalRevenue = calculateTotalRevenue(reservations, {});
            expect(totalRevenue).toBe(3300);
        });

        test('Expense calculation (excludes upsells)', () => {
            const expenses = [
                { amount: -100, type: 'cleaning' },      // expense: $100
                { amount: -50, type: 'maintenance' },    // expense: $50
                { amount: 25, type: 'upsell' },          // upsell: excluded
                { amount: -30, category: 'supplies' }    // expense: $30
            ];
            const totalExpenses = calculateTotalExpenses(expenses);
            expect(totalExpenses).toBe(180); // 100 + 50 + 30
        });

        test('PM commission at 15%', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'vrbo' }
            ];
            const listingInfoMap = { 1: { pmFeePercentage: 15 } };
            const pmCommission = calculatePmCommission(reservations, listingInfoMap);
            expect(pmCommission).toBe(150); // 1000 * 0.15
        });

        test('PM commission at 20%', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 2000, source: 'vrbo' }
            ];
            const listingInfoMap = { 1: { pmFeePercentage: 20 } };
            const pmCommission = calculatePmCommission(reservations, listingInfoMap);
            expect(pmCommission).toBe(400); // 2000 * 0.20
        });

        test('Tech fees ($50 per property)', () => {
            expect(calculateTechFees(1)).toBe(50);
        });

        test('Insurance fees ($25 per property)', () => {
            expect(calculateInsuranceFees(1)).toBe(25);
        });

        test('Complete payout calculation', () => {
            // Scenario:
            // - Revenue: $3000
            // - Expenses: $200
            // - PM Fee: 15% = $450
            // - Tech Fee: $50 (1 property)
            // - Insurance Fee: $25 (1 property)
            // - Expected Payout: 3000 - 200 - 450 - 50 - 25 = $2275

            const totalRevenue = 3000;
            const totalExpenses = 200;
            const pmCommission = 450;
            const techFees = 50;
            const insuranceFees = 25;

            const ownerPayout = calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees);
            expect(ownerPayout).toBe(2275);
        });

        test('Airbnb co-host excludes Airbnb revenue', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'airbnb' },  // excluded
                { propertyId: 1, grossAmount: 500, source: 'vrbo' }      // included
            ];
            const listingInfoMap = { 1: { isCohostOnAirbnb: true, pmFeePercentage: 15 } };

            const totalRevenue = calculateTotalRevenue(reservations, listingInfoMap);
            expect(totalRevenue).toBe(500); // Only VRBO

            const pmCommission = calculatePmCommission(reservations, listingInfoMap);
            expect(pmCommission).toBe(75); // Only on VRBO: 500 * 0.15
        });
    });

    // ============================================================================
    // TEST SUITE 2: Combined Multi-Property Statement
    // ============================================================================

    describe('Combined Multi-Property Statement', () => {

        test('Revenue from multiple properties', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'vrbo' },
                { propertyId: 2, grossAmount: 1500, source: 'booking.com' },
                { propertyId: 3, grossAmount: 2000, source: 'direct' }
            ];
            const totalRevenue = calculateTotalRevenue(reservations, {});
            expect(totalRevenue).toBe(4500);
        });

        test('Expenses from multiple properties', () => {
            const expenses = [
                { propertyId: 1, amount: -100, type: 'cleaning' },
                { propertyId: 2, amount: -150, type: 'maintenance' },
                { propertyId: 3, amount: -75, type: 'supplies' }
            ];
            const totalExpenses = calculateTotalExpenses(expenses);
            expect(totalExpenses).toBe(325);
        });

        test('PM commission with different rates per property', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'vrbo' },  // 15%
                { propertyId: 2, grossAmount: 1000, source: 'vrbo' },  // 20%
                { propertyId: 3, grossAmount: 1000, source: 'vrbo' }   // 10%
            ];
            const listingInfoMap = {
                1: { pmFeePercentage: 15 },
                2: { pmFeePercentage: 20 },
                3: { pmFeePercentage: 10 }
            };

            const pmCommission = calculatePmCommission(reservations, listingInfoMap);
            // 1000*0.15 + 1000*0.20 + 1000*0.10 = 150 + 200 + 100 = 450
            expect(pmCommission).toBe(450);
        });

        test('Tech fees for 3 properties', () => {
            expect(calculateTechFees(3)).toBe(150); // 3 * $50
        });

        test('Insurance fees for 3 properties', () => {
            expect(calculateInsuranceFees(3)).toBe(75); // 3 * $25
        });

        test('Tech fees for 20 properties (max scenario)', () => {
            expect(calculateTechFees(20)).toBe(1000); // 20 * $50
        });

        test('Insurance fees for 20 properties', () => {
            expect(calculateInsuranceFees(20)).toBe(500); // 20 * $25
        });

        test('Complete payout calculation for 3 properties', () => {
            // Scenario: 3 properties
            // - Property 1: Revenue $2000, PM 15%
            // - Property 2: Revenue $3000, PM 20%
            // - Property 3: Revenue $1500, PM 10%
            // - Total Revenue: $6500
            // - Expenses: $400
            // - PM Commission: 2000*0.15 + 3000*0.20 + 1500*0.10 = 300 + 600 + 150 = $1050
            // - Tech Fee: 3 * $50 = $150
            // - Insurance Fee: 3 * $25 = $75
            // - Expected Payout: 6500 - 400 - 1050 - 150 - 75 = $4825

            const totalRevenue = 6500;
            const totalExpenses = 400;
            const pmCommission = 1050;
            const techFees = 150;
            const insuranceFees = 75;

            const ownerPayout = calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees);
            expect(ownerPayout).toBe(4825);
        });

        test('Mixed co-host status (some properties co-hosted)', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'airbnb' },  // co-host: excluded
                { propertyId: 1, grossAmount: 500, source: 'vrbo' },     // included
                { propertyId: 2, grossAmount: 2000, source: 'airbnb' },  // NOT co-host: included
                { propertyId: 2, grossAmount: 800, source: 'vrbo' }      // included
            ];
            const listingInfoMap = {
                1: { isCohostOnAirbnb: true, pmFeePercentage: 15 },   // Co-host
                2: { isCohostOnAirbnb: false, pmFeePercentage: 20 }   // NOT co-host
            };

            const totalRevenue = calculateTotalRevenue(reservations, listingInfoMap);
            // Property 1: Only VRBO ($500), Airbnb excluded
            // Property 2: Both Airbnb ($2000) and VRBO ($800)
            expect(totalRevenue).toBe(3300); // 500 + 2000 + 800

            const pmCommission = calculatePmCommission(reservations, listingInfoMap);
            // Property 1: 500 * 0.15 = $75 (Airbnb skipped)
            // Property 2: (2000 + 800) * 0.20 = $560
            expect(pmCommission).toBe(635);
        });
    });

    // ============================================================================
    // TEST SUITE 3: Edge Cases
    // ============================================================================

    describe('Edge Cases', () => {

        test('Zero revenue', () => {
            const ownerPayout = calculateOwnerPayout(0, 100, 0, 50, 25);
            expect(ownerPayout).toBe(-175); // Negative payout when no revenue
        });

        test('No expenses', () => {
            const ownerPayout = calculateOwnerPayout(1000, 0, 150, 50, 25);
            expect(ownerPayout).toBe(775);
        });

        test('Default PM fee when not specified', () => {
            const reservations = [
                { propertyId: 1, grossAmount: 1000, source: 'vrbo' }
            ];
            const listingInfoMap = { 1: {} }; // No PM fee specified
            const pmCommission = calculatePmCommission(reservations, listingInfoMap, 15);
            expect(pmCommission).toBe(150); // Uses default 15%
        });

        test('Rounding currency values', () => {
            // Test that we round to 2 decimal places
            expect(roundCurrency(123.456)).toBe(123.46);
            expect(roundCurrency(123.454)).toBe(123.45);
            expect(roundCurrency(100.005)).toBe(100.01);
        });

        test('Large number of properties (20)', () => {
            const propertyCount = 20;
            const techFees = calculateTechFees(propertyCount);
            const insuranceFees = calculateInsuranceFees(propertyCount);

            expect(techFees).toBe(1000);      // 20 * $50
            expect(insuranceFees).toBe(500);  // 20 * $25

            // Total fixed fees for 20 properties
            expect(techFees + insuranceFees).toBe(1500);
        });
    });

    // ============================================================================
    // TEST SUITE 4: Formula Verification
    // ============================================================================

    describe('Formula Verification', () => {

        test('ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees', () => {
            // Multiple test cases to verify the formula
            const testCases = [
                { revenue: 5000, expenses: 300, pm: 750, tech: 50, insurance: 25, expected: 3875 },
                { revenue: 10000, expenses: 500, pm: 1500, tech: 100, insurance: 50, expected: 7850 },
                { revenue: 2500, expenses: 150, pm: 375, tech: 150, insurance: 75, expected: 1750 },
                { revenue: 0, expenses: 100, pm: 0, tech: 50, insurance: 25, expected: -175 },
            ];

            for (const tc of testCases) {
                const result = calculateOwnerPayout(tc.revenue, tc.expenses, tc.pm, tc.tech, tc.insurance);
                expect(result).toBe(tc.expected);
            }
        });

        test('Combined statement uses same formula as single property', () => {
            // Single property scenario
            const singleRevenue = 3000;
            const singleExpenses = 200;
            const singlePm = 450; // 15%
            const singleTech = 50;
            const singleInsurance = 25;
            const singlePayout = calculateOwnerPayout(singleRevenue, singleExpenses, singlePm, singleTech, singleInsurance);

            // Combined 3-property scenario (same total amounts)
            const combinedRevenue = 3000; // Same total
            const combinedExpenses = 200; // Same total
            const combinedPm = 450; // Same total PM
            const combinedTech = 150; // 3 properties * $50
            const combinedInsurance = 75; // 3 properties * $25
            const combinedPayout = calculateOwnerPayout(combinedRevenue, combinedExpenses, combinedPm, combinedTech, combinedInsurance);

            // Verify both use the same formula: ownerPayout = revenue - expenses - pm - tech - insurance
            // Single: 3000 - 200 - 450 - 50 - 25 = 2275
            expect(singlePayout).toBe(2275);
            // Combined: 3000 - 200 - 450 - 150 - 75 = 2125
            expect(combinedPayout).toBe(2125); // Lower due to more tech/insurance fees

            // The difference should be exactly the additional fees (100 tech + 50 insurance = 150)
            const feeDifference = (combinedTech - singleTech) + (combinedInsurance - singleInsurance);
            expect(feeDifference).toBe(150);
            expect(singlePayout - combinedPayout).toBe(feeDifference);
        });
    });
});
