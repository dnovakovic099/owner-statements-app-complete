/**
 * Test cases for Waived PM Commission Feature
 *
 * Feature: When waiveCommission is enabled for a property, the PM Commission
 * should be DISPLAYED but NOT DEDUCTED from the owner's payout.
 *
 * The waiver is time-limited based on waiveCommissionUntil date.
 */

// Using Jest's built-in expect

// Helper function to calculate gross payout (mirrors the actual logic)
function calculateGrossPayout({
    clientRevenue,
    pmFeePercentage,
    taxResponsibility,
    cleaningFeeForPassThrough,
    isCohostAirbnb,
    shouldAddTax,
    waiveCommission,
    waiveCommissionUntil,
    statementEndDate
}) {
    const luxuryFee = clientRevenue * (pmFeePercentage / 100);

    // Waiver logic
    const isWaiverActive = (() => {
        if (!waiveCommission) return false;
        if (!waiveCommissionUntil) return true; // Indefinite waiver
        const waiverEnd = new Date(waiveCommissionUntil + 'T23:59:59');
        const stmtEnd = new Date(statementEndDate + 'T00:00:00');
        return stmtEnd <= waiverEnd;
    })();

    const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;

    let grossPayout;
    if (isCohostAirbnb) {
        grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
    } else if (shouldAddTax) {
        grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
    } else {
        grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
    }

    return {
        grossPayout,
        luxuryFee,
        luxuryFeeToDeduct,
        isWaiverActive
    };
}

describe('Waived PM Commission Feature', () => {

    describe('Waiver Active Check', () => {

        it('should return false when waiveCommission is false', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: false,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            expect(result.isWaiverActive).toBe(false);
            expect(result.luxuryFeeToDeduct).toBe(100); // 10% of 1000
        });

        it('should return true when waiveCommission is true and waiveCommissionUntil is null (indefinite)', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            expect(result.isWaiverActive).toBe(true);
            expect(result.luxuryFeeToDeduct).toBe(0);
        });

        it('should return true when statement end date is before waiver expiry', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-14',
                statementEndDate: '2025-12-08'
            });

            expect(result.isWaiverActive).toBe(true);
            expect(result.luxuryFeeToDeduct).toBe(0);
        });

        it('should return true when statement end date equals waiver expiry', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-14',
                statementEndDate: '2025-12-14'
            });

            expect(result.isWaiverActive).toBe(true);
            expect(result.luxuryFeeToDeduct).toBe(0);
        });

        it('should return false when statement end date is after waiver expiry', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-14',
                statementEndDate: '2025-12-15'
            });

            expect(result.isWaiverActive).toBe(false);
            expect(result.luxuryFeeToDeduct).toBe(100); // 10% of 1000
        });
    });

    describe('Gross Payout Calculation - Standard Property (Not Co-host)', () => {

        it('should deduct PM fee when waiver is NOT active', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 15,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: false,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            // grossPayout = 1000 - 150 - 0 = 850
            expect(result.grossPayout).toBe(850);
            expect(result.luxuryFee).toBe(150); // Still calculated for display
        });

        it('should NOT deduct PM fee when waiver IS active', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 15,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-14',
                statementEndDate: '2025-12-08'
            });

            // grossPayout = 1000 - 0 - 0 = 1000
            expect(result.grossPayout).toBe(1000);
            expect(result.luxuryFee).toBe(150); // Still calculated for display
        });

        it('should include tax when shouldAddTax is true and waiver is active', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 50,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: true,
                waiveCommission: true,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            // grossPayout = 1000 - 0 + 50 - 0 = 1050
            expect(result.grossPayout).toBe(1050);
        });

        it('should deduct cleaning fee pass-through when waiver is active', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 100,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            // grossPayout = 1000 - 0 - 100 = 900
            expect(result.grossPayout).toBe(900);
        });
    });

    describe('Gross Payout Calculation - Co-host on Airbnb Property', () => {

        it('should have negative gross payout (PM fee only) when waiver is NOT active', () => {
            // Co-host Airbnb: Revenue = $0, but PM fee is still charged
            const result = calculateGrossPayout({
                clientRevenue: 830.50, // Raw revenue used for PM calculation
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: true,
                shouldAddTax: false,
                waiveCommission: false,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            // grossPayout = -83.05 - 0 = -83.05
            expect(result.grossPayout).toBeCloseTo(-83.05, 1);
            expect(result.luxuryFee).toBeCloseTo(83.05, 1);
        });

        it('should have zero gross payout when waiver IS active (PM fee waived)', () => {
            // This is the "Marker Ave - Grace" scenario
            const result = calculateGrossPayout({
                clientRevenue: 830.50,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: true,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-14',
                statementEndDate: '2025-12-08'
            });

            // grossPayout = -0 - 0 = 0 (use toBeCloseTo to handle -0 vs 0)
            expect(result.grossPayout).toBeCloseTo(0, 2);
            expect(result.luxuryFee).toBeCloseTo(83.05, 1); // Still calculated for display
            expect(result.isWaiverActive).toBe(true);
        });

        it('should have negative gross payout (cleaning only) when waiver is active but cleaning pass-through exists', () => {
            const result = calculateGrossPayout({
                clientRevenue: 830.50,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 150,
                isCohostAirbnb: true,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            // grossPayout = -0 - 150 = -150
            expect(result.grossPayout).toBe(-150);
        });
    });

    describe('Net Payout Calculation with Upsells', () => {

        it('should calculate correct net payout with waiver and upsells', () => {
            // Simulating the "Marker Ave - Grace" scenario
            const result = calculateGrossPayout({
                clientRevenue: 830.50,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: true,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-14',
                statementEndDate: '2025-12-08'
            });

            const totalUpsells = 450; // From statement items
            const totalExpenses = 0;
            const netPayout = result.grossPayout + totalUpsells - totalExpenses;

            // netPayout = 0 + 450 - 0 = 450
            expect(netPayout).toBe(450);
        });

        it('should calculate correct net payout WITHOUT waiver (for comparison)', () => {
            const result = calculateGrossPayout({
                clientRevenue: 830.50,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: true,
                shouldAddTax: false,
                waiveCommission: false,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            const totalUpsells = 450;
            const totalExpenses = 0;
            const netPayout = result.grossPayout + totalUpsells - totalExpenses;

            // netPayout = -83.05 + 450 - 0 = 366.95
            expect(netPayout).toBeCloseTo(366.95, 1);
        });
    });

    describe('Edge Cases', () => {

        it('should handle zero client revenue', () => {
            const result = calculateGrossPayout({
                clientRevenue: 0,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            expect(result.grossPayout).toBe(0);
            expect(result.luxuryFee).toBe(0);
        });

        it('should handle 0% PM fee percentage', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 0,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: false,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            expect(result.grossPayout).toBe(1000);
            expect(result.luxuryFee).toBe(0);
        });

        it('should handle waiveCommission as truthy string "true"', () => {
            // This tests database boolean handling
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: 'true', // String from some databases
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            // Truthy string should activate waiver
            expect(result.isWaiverActive).toBe(true);
        });

        it('should handle waiveCommission as 1 (SQLite boolean)', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: 1, // SQLite stores booleans as 0/1
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            expect(result.isWaiverActive).toBe(true);
        });

        it('should handle waiveCommission as 0 (SQLite boolean)', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: 0,
                waiveCommissionUntil: null,
                statementEndDate: '2025-12-08'
            });

            expect(result.isWaiverActive).toBe(false);
        });
    });

    describe('Date Edge Cases', () => {

        it('should handle year boundary correctly', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2025-12-31',
                statementEndDate: '2026-01-01'
            });

            expect(result.isWaiverActive).toBe(false);
        });

        it('should handle leap year dates', () => {
            const result = calculateGrossPayout({
                clientRevenue: 1000,
                pmFeePercentage: 10,
                taxResponsibility: 0,
                cleaningFeeForPassThrough: 0,
                isCohostAirbnb: false,
                shouldAddTax: false,
                waiveCommission: true,
                waiveCommissionUntil: '2024-02-29',
                statementEndDate: '2024-02-28'
            });

            expect(result.isWaiverActive).toBe(true);
        });
    });
});

describe('Integration: Statement Generation with Waiver', () => {
    // These would be integration tests that hit the actual API

    it.skip('should generate statement with correct payout when waiver is active', async () => {
        // This would test the /api/statements/generate endpoint
        // Requires database setup
    });

    it.skip('should display correct values in HTML view when waiver is active', async () => {
        // This would test the /api/statements/:id/view endpoint
        // Requires database setup
    });
});
