/**
 * PM Commission Waiver (Ghost Fee) Test Cases
 *
 * Tests the feature where PM commission is displayed on statements
 * but NOT deducted from the owner payout during promotional periods.
 */

const assert = require('assert');

// Mock the isCommissionWaiverActive function for unit testing
function isCommissionWaiverActive(settings, statementEndDate) {
    if (!settings?.waiveCommission) return false;
    if (!settings.waiveCommissionUntil) return true; // Indefinite waiver

    const waiverEnd = new Date(settings.waiveCommissionUntil + 'T23:59:59');
    const stmtEnd = new Date(statementEndDate + 'T00:00:00');
    return stmtEnd <= waiverEnd;
}

// Calculate gross payout with waiver logic
function calculateGrossPayout(clientRevenue, pmFeePercentage, taxResponsibility, cleaningFeePassThrough, settings, endDate) {
    const pmFee = clientRevenue * (pmFeePercentage / 100);
    const waiverActive = isCommissionWaiverActive(settings, endDate);
    const effectivePmFee = waiverActive ? 0 : pmFee;

    return {
        pmFeeDisplayed: pmFee,
        pmFeeDeducted: effectivePmFee,
        grossPayout: clientRevenue - effectivePmFee + taxResponsibility - cleaningFeePassThrough,
        waiverActive
    };
}

describe('PM Commission Waiver (Ghost Fee) Tests', function() {

    describe('isCommissionWaiverActive Function', function() {

        it('should return false when waiveCommission is not set', function() {
            const settings = {};
            const result = isCommissionWaiverActive(settings, '2025-03-01');
            assert.strictEqual(result, false);
        });

        it('should return false when waiveCommission is false', function() {
            const settings = { waiveCommission: false };
            const result = isCommissionWaiverActive(settings, '2025-03-01');
            assert.strictEqual(result, false);
        });

        it('should return true when waiveCommission is true with no end date (indefinite)', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: null };
            const result = isCommissionWaiverActive(settings, '2025-12-31');
            assert.strictEqual(result, true);
        });

        it('should return true when statement end date is BEFORE waiver end date', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2025-06-30' };
            const result = isCommissionWaiverActive(settings, '2025-03-15');
            assert.strictEqual(result, true);
        });

        it('should return true when statement end date EQUALS waiver end date', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2025-06-30' };
            const result = isCommissionWaiverActive(settings, '2025-06-30');
            assert.strictEqual(result, true);
        });

        it('should return false when statement end date is AFTER waiver end date', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2025-06-30' };
            const result = isCommissionWaiverActive(settings, '2025-07-01');
            assert.strictEqual(result, false);
        });

        it('should handle null settings gracefully', function() {
            const result = isCommissionWaiverActive(null, '2025-03-01');
            assert.strictEqual(result, false);
        });

        it('should handle undefined settings gracefully', function() {
            const result = isCommissionWaiverActive(undefined, '2025-03-01');
            assert.strictEqual(result, false);
        });
    });

    describe('Gross Payout Calculation with Waiver', function() {

        const baseSettings = {
            waiveCommission: true,
            waiveCommissionUntil: '2025-06-30'
        };

        it('should NOT deduct PM fee when waiver is active', function() {
            const result = calculateGrossPayout(
                1000,    // clientRevenue
                15,      // pmFeePercentage
                50,      // taxResponsibility
                100,     // cleaningFeePassThrough
                baseSettings,
                '2025-03-15'  // within waiver period
            );

            assert.strictEqual(result.waiverActive, true);
            assert.strictEqual(result.pmFeeDisplayed, 150);  // 15% of 1000
            assert.strictEqual(result.pmFeeDeducted, 0);     // NOT deducted
            assert.strictEqual(result.grossPayout, 950);     // 1000 - 0 + 50 - 100
        });

        it('should deduct PM fee when waiver is NOT active', function() {
            const result = calculateGrossPayout(
                1000,    // clientRevenue
                15,      // pmFeePercentage
                50,      // taxResponsibility
                100,     // cleaningFeePassThrough
                baseSettings,
                '2025-08-15'  // AFTER waiver period
            );

            assert.strictEqual(result.waiverActive, false);
            assert.strictEqual(result.pmFeeDisplayed, 150);  // 15% of 1000
            assert.strictEqual(result.pmFeeDeducted, 150);   // IS deducted
            assert.strictEqual(result.grossPayout, 800);     // 1000 - 150 + 50 - 100
        });

        it('should show difference of PM amount between waiver active and inactive', function() {
            const clientRevenue = 5000;
            const pmPercentage = 15;
            const expectedPmFee = clientRevenue * (pmPercentage / 100); // 750

            const withWaiver = calculateGrossPayout(
                clientRevenue, pmPercentage, 100, 200,
                { waiveCommission: true, waiveCommissionUntil: '2025-12-31' },
                '2025-06-15'
            );

            const withoutWaiver = calculateGrossPayout(
                clientRevenue, pmPercentage, 100, 200,
                { waiveCommission: false },
                '2025-06-15'
            );

            // Both should display the same PM fee
            assert.strictEqual(withWaiver.pmFeeDisplayed, expectedPmFee);
            assert.strictEqual(withoutWaiver.pmFeeDisplayed, expectedPmFee);

            // But gross payout should differ by the PM fee amount
            const payoutDifference = withWaiver.grossPayout - withoutWaiver.grossPayout;
            assert.strictEqual(payoutDifference, expectedPmFee);
        });

        it('should handle zero revenue correctly', function() {
            const result = calculateGrossPayout(
                0, 15, 0, 0,
                { waiveCommission: true },
                '2025-03-15'
            );

            assert.strictEqual(result.pmFeeDisplayed, 0);
            assert.strictEqual(result.grossPayout, 0);
        });

        it('should handle high PM percentage correctly', function() {
            const result = calculateGrossPayout(
                1000, 25, 50, 100,
                { waiveCommission: true },
                '2025-03-15'
            );

            assert.strictEqual(result.pmFeeDisplayed, 250);
            assert.strictEqual(result.pmFeeDeducted, 0);  // Waiver active
            assert.strictEqual(result.grossPayout, 950); // 1000 + 50 - 100
        });
    });

    describe('Multiple Reservations with Waiver', function() {

        it('should correctly sum totals when waiver is active', function() {
            const reservations = [
                { clientRevenue: 1000, tax: 50, cleaning: 100 },
                { clientRevenue: 2000, tax: 100, cleaning: 150 },
                { clientRevenue: 1500, tax: 75, cleaning: 100 }
            ];

            const settings = { waiveCommission: true, waiveCommissionUntil: '2025-12-31' };
            const pmPercentage = 15;

            let totalRevenue = 0;
            let totalPmDisplayed = 0;
            let totalGrossPayout = 0;

            for (const res of reservations) {
                const result = calculateGrossPayout(
                    res.clientRevenue, pmPercentage, res.tax, res.cleaning,
                    settings, '2025-06-15'
                );
                totalRevenue += res.clientRevenue;
                totalPmDisplayed += result.pmFeeDisplayed;
                totalGrossPayout += result.grossPayout;
            }

            assert.strictEqual(totalRevenue, 4500);
            assert.strictEqual(totalPmDisplayed, 675);  // 15% of 4500

            // Gross payout without PM deduction
            // (1000+50-100) + (2000+100-150) + (1500+75-100) = 950 + 1950 + 1475 = 4375
            assert.strictEqual(totalGrossPayout, 4375);
        });

        it('should correctly sum totals when waiver is NOT active', function() {
            const reservations = [
                { clientRevenue: 1000, tax: 50, cleaning: 100 },
                { clientRevenue: 2000, tax: 100, cleaning: 150 },
                { clientRevenue: 1500, tax: 75, cleaning: 100 }
            ];

            const settings = { waiveCommission: false };
            const pmPercentage = 15;

            let totalRevenue = 0;
            let totalPmDisplayed = 0;
            let totalGrossPayout = 0;

            for (const res of reservations) {
                const result = calculateGrossPayout(
                    res.clientRevenue, pmPercentage, res.tax, res.cleaning,
                    settings, '2025-06-15'
                );
                totalRevenue += res.clientRevenue;
                totalPmDisplayed += result.pmFeeDisplayed;
                totalGrossPayout += result.grossPayout;
            }

            assert.strictEqual(totalRevenue, 4500);
            assert.strictEqual(totalPmDisplayed, 675);  // 15% of 4500

            // Gross payout WITH PM deduction
            // (1000-150+50-100) + (2000-300+100-150) + (1500-225+75-100) = 800 + 1650 + 1250 = 3700
            assert.strictEqual(totalGrossPayout, 3700);
        });
    });

    describe('Edge Cases', function() {

        it('should handle waiver ending on exact boundary date', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2025-03-31' };

            // Statement ending on March 31 - waiver should be ACTIVE
            const marchResult = isCommissionWaiverActive(settings, '2025-03-31');
            assert.strictEqual(marchResult, true);

            // Statement ending on April 1 - waiver should be INACTIVE
            const aprilResult = isCommissionWaiverActive(settings, '2025-04-01');
            assert.strictEqual(aprilResult, false);
        });

        it('should handle year boundary correctly', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2025-12-31' };

            const dec31 = isCommissionWaiverActive(settings, '2025-12-31');
            assert.strictEqual(dec31, true);

            const jan1 = isCommissionWaiverActive(settings, '2026-01-01');
            assert.strictEqual(jan1, false);
        });

        it('should handle leap year date correctly', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2024-02-29' };

            const feb29 = isCommissionWaiverActive(settings, '2024-02-29');
            assert.strictEqual(feb29, true);

            const mar1 = isCommissionWaiverActive(settings, '2024-03-01');
            assert.strictEqual(mar1, false);
        });

        it('should handle very old waiver end date', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2020-01-01' };

            const result = isCommissionWaiverActive(settings, '2025-03-15');
            assert.strictEqual(result, false);
        });

        it('should handle far future waiver end date', function() {
            const settings = { waiveCommission: true, waiveCommissionUntil: '2030-12-31' };

            const result = isCommissionWaiverActive(settings, '2025-03-15');
            assert.strictEqual(result, true);
        });
    });

    describe('Per-Property Waiver Settings', function() {

        it('should apply different waiver settings per property', function() {
            const property1Settings = { waiveCommission: true, waiveCommissionUntil: '2025-06-30' };
            const property2Settings = { waiveCommission: false };
            const property3Settings = { waiveCommission: true, waiveCommissionUntil: null }; // Indefinite

            const endDate = '2025-05-15';

            const prop1Active = isCommissionWaiverActive(property1Settings, endDate);
            const prop2Active = isCommissionWaiverActive(property2Settings, endDate);
            const prop3Active = isCommissionWaiverActive(property3Settings, endDate);

            assert.strictEqual(prop1Active, true);   // Within waiver period
            assert.strictEqual(prop2Active, false);  // Waiver disabled
            assert.strictEqual(prop3Active, true);   // Indefinite waiver
        });

        it('should handle combined statement with mixed waiver settings', function() {
            const properties = [
                { id: 1, settings: { waiveCommission: true, waiveCommissionUntil: '2025-12-31' }, revenue: 1000 },
                { id: 2, settings: { waiveCommission: false }, revenue: 2000 },
                { id: 3, settings: { waiveCommission: true }, revenue: 1500 }
            ];

            const pmPercentage = 15;
            const endDate = '2025-06-15';

            let totalGrossPayout = 0;
            let totalPmDisplayed = 0;
            let totalPmDeducted = 0;

            for (const prop of properties) {
                const result = calculateGrossPayout(
                    prop.revenue, pmPercentage, 0, 0,
                    prop.settings, endDate
                );
                totalGrossPayout += result.grossPayout;
                totalPmDisplayed += result.pmFeeDisplayed;
                totalPmDeducted += result.pmFeeDeducted;
            }

            // Property 1: 1000 revenue, waiver active, PM not deducted
            // Property 2: 2000 revenue, no waiver, PM deducted (300)
            // Property 3: 1500 revenue, indefinite waiver, PM not deducted

            assert.strictEqual(totalPmDisplayed, 675);  // 15% of 4500
            assert.strictEqual(totalPmDeducted, 300);   // Only property 2's PM deducted
            assert.strictEqual(totalGrossPayout, 4200); // 4500 - 300
        });
    });
});

// Run tests
if (require.main === module) {
    const Mocha = require('mocha');
    const mocha = new Mocha();

    mocha.suite.emit('pre-require', global, '', mocha);

    eval(require('fs').readFileSync(__filename, 'utf8'));

    mocha.run(failures => {
        // process.exitCode removed for Jest compatibility
    });
}
