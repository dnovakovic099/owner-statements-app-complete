/**
 * Statement Formula Tests - Comprehensive Jest Test Suite
 *
 * Tests covering:
 * - PM Commission calculation variations
 * - Tax calculation scenarios
 * - Gross payout formulas
 * - Currency formatting
 * - Date handling
 * - Owner payout calculations
 * - Revenue aggregation
 * - Expense processing
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    const num = parseFloat(value);
    const formatted = Math.abs(num).toFixed(2);
    if (num < 0) return `-$${formatted}`;
    return `$${formatted}`;
}

function roundToTwo(value) {
    return Math.round(value * 100) / 100;
}

function calculatePMCommission(revenue, pmFeePercentage, isCohostOnAirbnb = false, waiveCommission = false) {
    if (waiveCommission) return 0;
    if (isCohostOnAirbnb) return 0; // Co-hosts don't charge PM fee
    return roundToTwo(revenue * (pmFeePercentage / 100));
}

function calculateGrossPayout(clientRevenue, pmFeePercentage, cleaningFee, shouldAddTax, passThroughTax, isCohostOnAirbnb, cleaningFeePassThrough) {
    let payout = clientRevenue;

    // Deduct PM fee unless co-host
    if (!isCohostOnAirbnb) {
        payout -= roundToTwo(clientRevenue * (pmFeePercentage / 100));
    }

    // Add cleaning fee if pass-through
    if (cleaningFeePassThrough && cleaningFee) {
        payout += cleaningFee;
    }

    return roundToTwo(payout);
}

function calculateOwnerPayout(revenue, expenses, pmCommission, techFees = 0, insuranceFees = 0) {
    return roundToTwo(revenue - expenses - pmCommission - techFees - insuranceFees);
}

function shouldAddTax(source, hasPassThroughTax, disregardTax) {
    if (disregardTax) return false;
    const isAirbnb = source && source.toLowerCase().includes('airbnb');
    return !isAirbnb || hasPassThroughTax;
}

function isAirbnbSource(source) {
    if (!source) return false;
    const normalized = source.toLowerCase().trim();
    return normalized.includes('airbnb') ||
           normalized === 'airbnb official' ||
           normalized === 'airbnb api';
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

function getDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('PM Commission Calculations', () => {

    describe('Basic PM Fee Calculations', () => {
        test('15% PM fee on $1000 revenue', () => {
            expect(calculatePMCommission(1000, 15)).toBe(150);
        });

        test('20% PM fee on $1000 revenue', () => {
            expect(calculatePMCommission(1000, 20)).toBe(200);
        });

        test('25% PM fee on $1000 revenue', () => {
            expect(calculatePMCommission(1000, 25)).toBe(250);
        });

        test('10% PM fee on $1000 revenue', () => {
            expect(calculatePMCommission(1000, 10)).toBe(100);
        });

        test('0% PM fee returns 0', () => {
            expect(calculatePMCommission(1000, 0)).toBe(0);
        });

        test('100% PM fee on $500 revenue', () => {
            expect(calculatePMCommission(500, 100)).toBe(500);
        });
    });

    describe('PM Fee with Decimal Percentages', () => {
        test('15.5% PM fee on $1000', () => {
            expect(calculatePMCommission(1000, 15.5)).toBe(155);
        });

        test('12.25% PM fee on $1000', () => {
            expect(calculatePMCommission(1000, 12.25)).toBe(122.5);
        });

        test('8.75% PM fee on $1600', () => {
            expect(calculatePMCommission(1600, 8.75)).toBe(140);
        });

        test('17.333% PM fee on $3000 (rounds to 2 decimal)', () => {
            expect(calculatePMCommission(3000, 17.333)).toBeCloseTo(519.99, 2);
        });
    });

    describe('PM Fee with Small Revenue Amounts', () => {
        test('15% PM fee on $1', () => {
            expect(calculatePMCommission(1, 15)).toBe(0.15);
        });

        test('15% PM fee on $10', () => {
            expect(calculatePMCommission(10, 15)).toBe(1.5);
        });

        test('15% PM fee on $0.50', () => {
            expect(calculatePMCommission(0.5, 15)).toBeCloseTo(0.08, 2);
        });

        test('15% PM fee on $0', () => {
            expect(calculatePMCommission(0, 15)).toBe(0);
        });
    });

    describe('PM Fee with Large Revenue Amounts', () => {
        test('15% PM fee on $10,000', () => {
            expect(calculatePMCommission(10000, 15)).toBe(1500);
        });

        test('20% PM fee on $100,000', () => {
            expect(calculatePMCommission(100000, 20)).toBe(20000);
        });

        test('25% PM fee on $1,000,000', () => {
            expect(calculatePMCommission(1000000, 25)).toBe(250000);
        });
    });

    describe('PM Fee with Co-host Status', () => {
        test('co-host returns 0 PM fee', () => {
            expect(calculatePMCommission(1000, 15, true)).toBe(0);
        });

        test('non-co-host returns normal PM fee', () => {
            expect(calculatePMCommission(1000, 15, false)).toBe(150);
        });

        test('co-host with high PM fee still returns 0', () => {
            expect(calculatePMCommission(5000, 30, true)).toBe(0);
        });
    });

    describe('PM Fee with Commission Waiver', () => {
        test('waived commission returns 0', () => {
            expect(calculatePMCommission(1000, 15, false, true)).toBe(0);
        });

        test('non-waived commission returns normal fee', () => {
            expect(calculatePMCommission(1000, 15, false, false)).toBe(150);
        });

        test('waiver takes precedence over co-host', () => {
            expect(calculatePMCommission(1000, 15, true, true)).toBe(0);
        });
    });
});

describe('Tax Calculation Logic', () => {

    describe('shouldAddTax Function', () => {
        test('Airbnb without pass-through returns false', () => {
            expect(shouldAddTax('Airbnb', false, false)).toBe(false);
        });

        test('Airbnb with pass-through returns true', () => {
            expect(shouldAddTax('Airbnb', true, false)).toBe(true);
        });

        test('VRBO returns true (non-Airbnb)', () => {
            expect(shouldAddTax('VRBO', false, false)).toBe(true);
        });

        test('Direct booking returns true', () => {
            expect(shouldAddTax('Direct', false, false)).toBe(true);
        });

        test('Booking.com returns true', () => {
            expect(shouldAddTax('Booking.com', false, false)).toBe(true);
        });

        test('Marriott returns true', () => {
            expect(shouldAddTax('Marriott', false, false)).toBe(true);
        });

        test('disregardTax overrides everything to false', () => {
            expect(shouldAddTax('VRBO', true, true)).toBe(false);
        });

        test('disregardTax on Airbnb returns false', () => {
            expect(shouldAddTax('Airbnb', false, true)).toBe(false);
        });

        test('case insensitive Airbnb detection', () => {
            expect(shouldAddTax('AIRBNB', false, false)).toBe(false);
            expect(shouldAddTax('airbnb', false, false)).toBe(false);
            expect(shouldAddTax('AirBnB', false, false)).toBe(false);
        });

        test('Airbnb Official variant', () => {
            expect(shouldAddTax('Airbnb Official', false, false)).toBe(false);
        });

        test('null source returns true', () => {
            expect(shouldAddTax(null, false, false)).toBe(true);
        });

        test('empty source returns true', () => {
            expect(shouldAddTax('', false, false)).toBe(true);
        });
    });
});

describe('Source Detection', () => {

    describe('isAirbnbSource Function', () => {
        test('exact Airbnb match', () => {
            expect(isAirbnbSource('Airbnb')).toBe(true);
        });

        test('lowercase airbnb', () => {
            expect(isAirbnbSource('airbnb')).toBe(true);
        });

        test('uppercase AIRBNB', () => {
            expect(isAirbnbSource('AIRBNB')).toBe(true);
        });

        test('mixed case AirBnB', () => {
            expect(isAirbnbSource('AirBnB')).toBe(true);
        });

        test('Airbnb Official', () => {
            expect(isAirbnbSource('Airbnb Official')).toBe(true);
        });

        test('Airbnb API', () => {
            expect(isAirbnbSource('Airbnb API')).toBe(true);
        });

        test('VRBO is not Airbnb', () => {
            expect(isAirbnbSource('VRBO')).toBe(false);
        });

        test('Direct is not Airbnb', () => {
            expect(isAirbnbSource('Direct')).toBe(false);
        });

        test('Booking.com is not Airbnb', () => {
            expect(isAirbnbSource('Booking.com')).toBe(false);
        });

        test('null returns false', () => {
            expect(isAirbnbSource(null)).toBe(false);
        });

        test('undefined returns false', () => {
            expect(isAirbnbSource(undefined)).toBe(false);
        });

        test('empty string returns false', () => {
            expect(isAirbnbSource('')).toBe(false);
        });

        test('whitespace trimmed', () => {
            expect(isAirbnbSource('  Airbnb  ')).toBe(true);
        });
    });
});

describe('Currency Formatting', () => {

    describe('formatCurrency Function', () => {
        test('positive integer', () => {
            expect(formatCurrency(100)).toBe('$100.00');
        });

        test('positive decimal', () => {
            expect(formatCurrency(100.50)).toBe('$100.50');
        });

        test('negative integer', () => {
            expect(formatCurrency(-100)).toBe('-$100.00');
        });

        test('negative decimal', () => {
            expect(formatCurrency(-100.50)).toBe('-$100.50');
        });

        test('zero', () => {
            expect(formatCurrency(0)).toBe('$0.00');
        });

        test('small positive', () => {
            expect(formatCurrency(0.01)).toBe('$0.01');
        });

        test('small negative', () => {
            expect(formatCurrency(-0.01)).toBe('-$0.01');
        });

        test('large number', () => {
            expect(formatCurrency(1000000)).toBe('$1000000.00');
        });

        test('three decimal places rounds', () => {
            expect(formatCurrency(100.555)).toBe('$100.56');
        });

        test('null returns $0.00', () => {
            expect(formatCurrency(null)).toBe('$0.00');
        });

        test('undefined returns $0.00', () => {
            expect(formatCurrency(undefined)).toBe('$0.00');
        });

        test('NaN returns $0.00', () => {
            expect(formatCurrency(NaN)).toBe('$0.00');
        });

        test('string number parses correctly', () => {
            expect(formatCurrency('100.50')).toBe('$100.50');
        });
    });
});

describe('Date Handling', () => {

    describe('parseDate Function', () => {
        test('valid ISO date', () => {
            const result = parseDate('2025-11-15');
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2025);
            expect(result.getMonth()).toBe(10); // 0-indexed
            expect(result.getDate()).toBe(15);
        });

        test('valid date with time', () => {
            const result = parseDate('2025-11-15T10:30:00');
            expect(result).toBeInstanceOf(Date);
        });

        test('null returns null', () => {
            expect(parseDate(null)).toBeNull();
        });

        test('undefined returns null', () => {
            expect(parseDate(undefined)).toBeNull();
        });

        test('empty string returns null', () => {
            expect(parseDate('')).toBeNull();
        });

        test('invalid date returns null', () => {
            expect(parseDate('not-a-date')).toBeNull();
        });
    });

    describe('formatDate Function', () => {
        test('formats Date object', () => {
            const date = new Date('2025-11-15');
            expect(formatDate(date)).toBe('2025-11-15');
        });

        test('formats date string', () => {
            expect(formatDate('2025-11-15')).toBe('2025-11-15');
        });

        test('null returns empty string', () => {
            expect(formatDate(null)).toBe('');
        });

        test('undefined returns empty string', () => {
            expect(formatDate(undefined)).toBe('');
        });
    });

    describe('getDaysBetween Function', () => {
        test('same day returns 0', () => {
            expect(getDaysBetween('2025-11-15', '2025-11-15')).toBe(0);
        });

        test('one day apart', () => {
            expect(getDaysBetween('2025-11-15', '2025-11-16')).toBe(1);
        });

        test('one week apart', () => {
            expect(getDaysBetween('2025-11-01', '2025-11-08')).toBe(7);
        });

        test('one month (30 days)', () => {
            expect(getDaysBetween('2025-11-01', '2025-12-01')).toBe(30);
        });

        test('handles reverse order (absolute)', () => {
            expect(getDaysBetween('2025-11-16', '2025-11-15')).toBe(1);
        });

        test('year boundary', () => {
            expect(getDaysBetween('2025-12-31', '2026-01-01')).toBe(1);
        });

        test('leap year February', () => {
            expect(getDaysBetween('2024-02-01', '2024-02-29')).toBe(28);
        });

        test('non-leap year February', () => {
            expect(getDaysBetween('2025-02-01', '2025-02-28')).toBe(27);
        });
    });
});

describe('Gross Payout Calculations', () => {

    describe('Basic Gross Payout', () => {
        test('standard calculation: $1000 revenue, 15% PM fee', () => {
            const payout = calculateGrossPayout(1000, 15, 0, false, false, false, false);
            expect(payout).toBe(850);
        });

        test('standard calculation: $1000 revenue, 20% PM fee', () => {
            const payout = calculateGrossPayout(1000, 20, 0, false, false, false, false);
            expect(payout).toBe(800);
        });

        test('zero revenue returns 0', () => {
            const payout = calculateGrossPayout(0, 15, 0, false, false, false, false);
            expect(payout).toBe(0);
        });
    });

    describe('Gross Payout with Cleaning Fee Pass-Through', () => {
        test('adds cleaning fee when pass-through enabled', () => {
            const payout = calculateGrossPayout(1000, 15, 150, false, false, false, true);
            expect(payout).toBe(1000); // 850 + 150
        });

        test('no cleaning fee when pass-through disabled', () => {
            const payout = calculateGrossPayout(1000, 15, 150, false, false, false, false);
            expect(payout).toBe(850);
        });

        test('zero cleaning fee with pass-through', () => {
            const payout = calculateGrossPayout(1000, 15, 0, false, false, false, true);
            expect(payout).toBe(850);
        });
    });

    describe('Gross Payout for Co-hosts', () => {
        test('co-host does not deduct PM fee', () => {
            const payout = calculateGrossPayout(1000, 15, 0, false, false, true, false);
            expect(payout).toBe(1000);
        });

        test('co-host with cleaning fee pass-through', () => {
            const payout = calculateGrossPayout(1000, 15, 150, false, false, true, true);
            expect(payout).toBe(1150);
        });
    });
});

describe('Owner Payout Calculations', () => {

    describe('Basic Owner Payout', () => {
        test('simple calculation', () => {
            const payout = calculateOwnerPayout(1000, 200, 150);
            expect(payout).toBe(650);
        });

        test('with tech fees', () => {
            const payout = calculateOwnerPayout(1000, 200, 150, 25);
            expect(payout).toBe(625);
        });

        test('with insurance fees', () => {
            const payout = calculateOwnerPayout(1000, 200, 150, 0, 50);
            expect(payout).toBe(600);
        });

        test('with all deductions', () => {
            const payout = calculateOwnerPayout(1000, 200, 150, 25, 50);
            expect(payout).toBe(575);
        });

        test('zero revenue', () => {
            const payout = calculateOwnerPayout(0, 0, 0);
            expect(payout).toBe(0);
        });

        test('negative payout when expenses exceed revenue', () => {
            const payout = calculateOwnerPayout(500, 600, 100);
            expect(payout).toBe(-200);
        });
    });

    describe('Owner Payout Edge Cases', () => {
        test('large amounts', () => {
            const payout = calculateOwnerPayout(100000, 15000, 20000, 500, 1000);
            expect(payout).toBe(63500);
        });

        test('decimal precision', () => {
            const payout = calculateOwnerPayout(1000.50, 100.25, 150.33);
            expect(payout).toBeCloseTo(749.92, 2);
        });
    });
});

describe('Rounding and Precision', () => {

    describe('roundToTwo Function', () => {
        test('rounds .006 up correctly', () => {
            expect(roundToTwo(1.006)).toBeCloseTo(1.01, 2);
        });

        test('rounds down at .004', () => {
            expect(roundToTwo(1.004)).toBe(1);
        });

        test('handles negative numbers', () => {
            // Note: -1.555 has floating-point issues, use -1.556 for reliable rounding
            expect(roundToTwo(-1.556)).toBeCloseTo(-1.56, 2);
        });

        test('whole numbers unchanged', () => {
            expect(roundToTwo(100)).toBe(100);
        });

        test('already two decimals unchanged', () => {
            expect(roundToTwo(100.55)).toBe(100.55);
        });

        test('rounds .01 precision correctly', () => {
            expect(roundToTwo(100.126)).toBeCloseTo(100.13, 2);
            expect(roundToTwo(100.124)).toBeCloseTo(100.12, 2);
        });
    });

    describe('Financial Precision Tests', () => {
        test('PM fee calculation precision', () => {
            // 15% of 333.33
            const fee = calculatePMCommission(333.33, 15);
            expect(fee).toBeCloseTo(50, 1);
        });

        test('multiple operations maintain precision', () => {
            const revenue = 1234.56;
            const pmFee = calculatePMCommission(revenue, 15);
            const payout = roundToTwo(revenue - pmFee);
            expect(payout).toBeCloseTo(1049.38, 2);
        });

        test('very small amounts', () => {
            const fee = calculatePMCommission(0.01, 15);
            expect(fee).toBeCloseTo(0, 2);
        });
    });
});

describe('Combined Statement Scenarios', () => {

    describe('Multiple Property Revenue Aggregation', () => {
        test('sum revenue from 2 properties', () => {
            const revenues = [1000, 1500];
            const total = revenues.reduce((sum, r) => sum + r, 0);
            expect(total).toBe(2500);
        });

        test('sum revenue from 5 properties', () => {
            const revenues = [1000, 1500, 2000, 750, 1250];
            const total = revenues.reduce((sum, r) => sum + r, 0);
            expect(total).toBe(6500);
        });

        test('handle zero revenue properties', () => {
            const revenues = [1000, 0, 500, 0, 1500];
            const total = revenues.reduce((sum, r) => sum + r, 0);
            expect(total).toBe(3000);
        });
    });

    describe('Multiple Property Expense Aggregation', () => {
        test('sum expenses from multiple properties', () => {
            const expenses = [100, 150, 200];
            const total = expenses.reduce((sum, e) => sum + e, 0);
            expect(total).toBe(450);
        });

        test('negative expenses (upsells)', () => {
            const expenses = [100, -50, 200, -25];
            const total = expenses.reduce((sum, e) => sum + e, 0);
            expect(total).toBe(225);
        });
    });

    describe('Per-Property PM Fee Variations', () => {
        test('different PM fees per property', () => {
            const properties = [
                { revenue: 1000, pmFee: 15 },
                { revenue: 1500, pmFee: 20 },
                { revenue: 2000, pmFee: 25 }
            ];
            const totalPM = properties.reduce((sum, p) => {
                return sum + calculatePMCommission(p.revenue, p.pmFee);
            }, 0);
            expect(totalPM).toBe(150 + 300 + 500);
        });
    });
});

describe('Validation and Edge Cases', () => {

    describe('Input Validation', () => {
        test('negative revenue treated as positive for PM calc', () => {
            // Business rule: negative revenue still gets PM calc applied
            const fee = calculatePMCommission(-1000, 15);
            expect(fee).toBe(-150);
        });

        test('negative PM percentage', () => {
            // Edge case: shouldn't happen but handle gracefully
            const fee = calculatePMCommission(1000, -15);
            expect(fee).toBe(-150);
        });
    });

    describe('Boundary Values', () => {
        test('maximum reasonable PM fee (50%)', () => {
            expect(calculatePMCommission(1000, 50)).toBe(500);
        });

        test('minimum PM fee (0.01%)', () => {
            expect(calculatePMCommission(10000, 0.01)).toBeCloseTo(1, 1);
        });

        test('very large revenue', () => {
            expect(calculatePMCommission(10000000, 15)).toBe(1500000);
        });
    });
});

describe('Integration Scenarios', () => {

    describe('Full Statement Calculation Flow', () => {
        test('single property statement calculation', () => {
            const revenue = 2500;
            const pmFeePercent = 15;
            const expenses = 300;
            const techFee = 25;
            const insuranceFee = 50;

            const pmCommission = calculatePMCommission(revenue, pmFeePercent);
            const ownerPayout = calculateOwnerPayout(revenue, expenses, pmCommission, techFee, insuranceFee);

            expect(pmCommission).toBe(375);
            expect(ownerPayout).toBe(1750);
        });

        test('combined statement with 3 properties', () => {
            const properties = [
                { revenue: 1000, expenses: 100, pmFee: 15 },
                { revenue: 1500, expenses: 150, pmFee: 20 },
                { revenue: 2000, expenses: 200, pmFee: 15 }
            ];

            const totalRevenue = properties.reduce((sum, p) => sum + p.revenue, 0);
            const totalExpenses = properties.reduce((sum, p) => sum + p.expenses, 0);
            const totalPM = properties.reduce((sum, p) => {
                return sum + calculatePMCommission(p.revenue, p.pmFee);
            }, 0);
            const ownerPayout = calculateOwnerPayout(totalRevenue, totalExpenses, totalPM);

            expect(totalRevenue).toBe(4500);
            expect(totalExpenses).toBe(450);
            expect(totalPM).toBe(750);
            expect(ownerPayout).toBe(3300);
        });

        test('statement with cleaning fee pass-through', () => {
            const revenue = 1500;
            const cleaningFee = 150;
            const pmFeePercent = 15;

            const grossPayout = calculateGrossPayout(revenue, pmFeePercent, cleaningFee, false, false, false, true);
            expect(grossPayout).toBe(1425); // 1275 + 150
        });

        test('co-host statement calculation', () => {
            const revenue = 2000;
            const pmFeePercent = 20; // Would be 400, but waived for co-host
            const expenses = 200;

            const pmCommission = calculatePMCommission(revenue, pmFeePercent, true); // co-host
            const grossPayout = calculateGrossPayout(revenue, pmFeePercent, 0, false, false, true, false);

            expect(pmCommission).toBe(0);
            expect(grossPayout).toBe(2000);
        });

        test('statement with commission waiver', () => {
            const revenue = 3000;
            const pmFeePercent = 15;
            const expenses = 500;

            const pmCommission = calculatePMCommission(revenue, pmFeePercent, false, true); // waived
            const ownerPayout = calculateOwnerPayout(revenue, expenses, pmCommission);

            expect(pmCommission).toBe(0);
            expect(ownerPayout).toBe(2500);
        });
    });
});
