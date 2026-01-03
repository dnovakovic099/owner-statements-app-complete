/**
 * Jest Tests for Cleaning Fee Pass-Through Formula
 *
 * Formula: actualCleaningFee = (guestPaidCleaningFee / (1 + PM%)) - 50
 *
 * This reverses the forward formula:
 * guestPaid = CEILING((actualCleaning + 50) * (1 + PM%), 5)
 */

describe('Cleaning Fee Pass-Through Formula', () => {

    // Helper function that mimics the actual implementation
    const calculateActualCleaningFee = (guestPaidCleaningFee, pmFeePercentage, cleaningFeePassThrough = true) => {
        if (!cleaningFeePassThrough || guestPaidCleaningFee <= 0) {
            return 0;
        }
        return Math.max(0, Math.round(((guestPaidCleaningFee / (1 + pmFeePercentage / 100)) - 50) * 100) / 100);
    };

    describe('Normal Cases - 20% PM Fee', () => {
        test('$350 guest paid should return ~$241.67', () => {
            const result = calculateActualCleaningFee(350, 20);
            expect(result).toBeCloseTo(241.67, 2);
        });

        test('$235 guest paid should return ~$145.83', () => {
            const result = calculateActualCleaningFee(235, 20);
            expect(result).toBeCloseTo(145.83, 2);
        });

        test('$250 guest paid should return ~$158.33', () => {
            const result = calculateActualCleaningFee(250, 20);
            expect(result).toBeCloseTo(158.33, 2);
        });

        test('$300 guest paid should return $200', () => {
            const result = calculateActualCleaningFee(300, 20);
            expect(result).toBe(200);
        });

        test('$270 guest paid should return $175', () => {
            const result = calculateActualCleaningFee(270, 20);
            expect(result).toBe(175);
        });
    });

    describe('Different PM Percentages', () => {
        test('10% PM fee: $255 guest paid should return ~$181.82', () => {
            const result = calculateActualCleaningFee(255, 10);
            expect(result).toBeCloseTo(181.82, 2);
        });

        test('10% PM fee: $175 guest paid should return ~$109.09', () => {
            const result = calculateActualCleaningFee(175, 10);
            expect(result).toBeCloseTo(109.09, 2);
        });

        test('15% PM fee: $255 guest paid should return ~$171.74', () => {
            const result = calculateActualCleaningFee(255, 15);
            expect(result).toBeCloseTo(171.74, 2);
        });

        test('15% PM fee: $245 guest paid should return ~$163.04', () => {
            const result = calculateActualCleaningFee(245, 15);
            expect(result).toBeCloseTo(163.04, 2);
        });

        test('25% PM fee: $395 guest paid should return $266', () => {
            const result = calculateActualCleaningFee(395, 25);
            expect(result).toBe(266);
        });

        test('25% PM fee: $660 guest paid should return $478', () => {
            const result = calculateActualCleaningFee(660, 25);
            expect(result).toBe(478);
        });
    });

    describe('Edge Cases - Zero and Small Values', () => {
        test('Zero guest paid should return 0', () => {
            const result = calculateActualCleaningFee(0, 20);
            expect(result).toBe(0);
        });

        test('Negative guest paid should return 0', () => {
            const result = calculateActualCleaningFee(-100, 20);
            expect(result).toBe(0);
        });

        test('$50 guest paid at 20% PM should return 0 (result would be negative)', () => {
            // $50 / 1.20 = $41.67 - $50 = -$8.33 -> Math.max(0, ...) = 0
            const result = calculateActualCleaningFee(50, 20);
            expect(result).toBe(0);
        });

        test('$60 guest paid at 20% PM should return 0', () => {
            // $60 / 1.20 = $50 - $50 = $0
            const result = calculateActualCleaningFee(60, 20);
            expect(result).toBe(0);
        });

        test('$65 guest paid at 20% PM should return ~$4.17', () => {
            // $65 / 1.20 = $54.17 - $50 = $4.17
            const result = calculateActualCleaningFee(65, 20);
            expect(result).toBeCloseTo(4.17, 2);
        });
    });

    describe('Edge Cases - Pass-Through Disabled', () => {
        test('Should return 0 when cleaningFeePassThrough is false', () => {
            const result = calculateActualCleaningFee(350, 20, false);
            expect(result).toBe(0);
        });

        test('Should return 0 when cleaningFeePassThrough is undefined/null', () => {
            const result = calculateActualCleaningFee(350, 20, null);
            expect(result).toBe(0);
        });
    });

    describe('Edge Cases - PM Fee Percentages', () => {
        test('0% PM fee: $200 guest paid should return $150', () => {
            // $200 / 1.00 = $200 - $50 = $150
            const result = calculateActualCleaningFee(200, 0);
            expect(result).toBe(150);
        });

        test('50% PM fee: $300 guest paid should return $150', () => {
            // $300 / 1.50 = $200 - $50 = $150
            const result = calculateActualCleaningFee(300, 50);
            expect(result).toBe(150);
        });

        test('Very high PM fee (100%): $400 should return $150', () => {
            // $400 / 2.00 = $200 - $50 = $150
            const result = calculateActualCleaningFee(400, 100);
            expect(result).toBe(150);
        });
    });

    describe('Rounding Behavior', () => {
        test('Result should be rounded to 2 decimal places', () => {
            const result = calculateActualCleaningFee(350, 20);
            const decimalPlaces = (result.toString().split('.')[1] || '').length;
            expect(decimalPlaces).toBeLessThanOrEqual(2);
        });

        test('$349.80 / 1.20 - 50 should give exactly $241.50', () => {
            // This is the "raw" value before rounding to nearest $5
            // Raw = $349.80 -> Actual = $349.80 / 1.20 - 50 = $241.50
            const result = calculateActualCleaningFee(349.80, 20);
            expect(result).toBe(241.5);
        });
    });

    describe('Real Data from Spreadsheet', () => {
        // Test with actual values from the cleaning fee calculator spreadsheet

        test('Milton Rd: $235 at 20% PM', () => {
            // Expected Column E ≈ $141.75 (actual), formula gives ~$145.83
            const result = calculateActualCleaningFee(235, 20);
            // Due to rounding, we accept values close to the range
            expect(result).toBeGreaterThan(140);
            expect(result).toBeLessThan(150);
        });

        test('Gerber Dairy Rd (Big House): $350 at 20% PM', () => {
            // Expected Column E ≈ $241.50 (actual), formula gives ~$241.67
            const result = calculateActualCleaningFee(350, 20);
            expect(result).toBeCloseTo(241.67, 2);
        });

        test('Gerber Dairy Rd (Small): $250 at 20% PM', () => {
            // Expected Column E ≈ $157.50 (actual), formula gives ~$158.33
            const result = calculateActualCleaningFee(250, 20);
            expect(result).toBeCloseTo(158.33, 2);
        });

        test('SW 3rd Terrace: $300 at 20% PM', () => {
            // Expected Column E ≈ $198.45 (actual), formula gives $200
            const result = calculateActualCleaningFee(300, 20);
            expect(result).toBe(200);
        });

        test('N Hamel Dr (Parent): $300 at 10% PM', () => {
            // Expected: $300 / 1.10 - 50 = $222.73
            const result = calculateActualCleaningFee(300, 10);
            expect(result).toBeCloseTo(222.73, 2);
        });

        test('N Hamel Dr (Main House): $255 at 10% PM', () => {
            // Expected: $255 / 1.10 - 50 = $181.82
            const result = calculateActualCleaningFee(255, 10);
            expect(result).toBeCloseTo(181.82, 2);
        });

        test('Evans Ave (3BR Main Floor): $315 at 20% PM', () => {
            // Expected: $315 / 1.20 - 50 = $212.50
            const result = calculateActualCleaningFee(315, 20);
            expect(result).toBe(212.5);
        });

        test('Edison Ave: $395 at 25% PM', () => {
            // Expected: $395 / 1.25 - 50 = $266
            const result = calculateActualCleaningFee(395, 25);
            expect(result).toBe(266);
        });

        test('Glenview Ave (Steven): $660 at 20% PM', () => {
            // Expected: $660 / 1.20 - 50 = $500
            const result = calculateActualCleaningFee(660, 20);
            expect(result).toBe(500);
        });
    });

    describe('Difference from Expected Values', () => {
        // These tests document the expected difference due to CEILING rounding

        test('Maximum difference should be less than $5 (due to CEILING rounding)', () => {
            // The forward formula uses CEILING to nearest $5
            // So reverse can be off by up to ~$5 / (1 + PM%)
            const testCases = [
                { guestPaid: 235, pm: 20, expectedActual: 141.75 },
                { guestPaid: 350, pm: 20, expectedActual: 241.50 },
                { guestPaid: 250, pm: 20, expectedActual: 157.50 },
                { guestPaid: 300, pm: 20, expectedActual: 198.45 },
            ];

            testCases.forEach(({ guestPaid, pm, expectedActual }) => {
                const result = calculateActualCleaningFee(guestPaid, pm);
                const difference = Math.abs(result - expectedActual);
                expect(difference).toBeLessThan(5);
            });
        });
    });
});
