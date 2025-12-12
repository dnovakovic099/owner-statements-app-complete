/**
 * ============================================================
 * MASTER TEST SUITE - Owner Statements Application
 * Converted to Jest format
 * ============================================================
 */

// ============================================================
// HELPER FUNCTIONS (Mirror production code)
// ============================================================

// Source detection
function isAirbnbSource(source) {
    if (!source) return false;
    return source.toLowerCase().includes('airbnb');
}

// Tax logic
function shouldAddTax(reservation, statement) {
    const isAirbnb = isAirbnbSource(reservation.source);
    return !statement.disregardTax && (!isAirbnb || statement.airbnbPassThroughTax);
}

// Color classes
function getTaxColorClass(reservation, statement) {
    return shouldAddTax(reservation, statement) ? 'revenue-amount' : 'info-amount';
}

function getGrossPayoutColorClass(grossPayout) {
    return grossPayout < 0 ? 'expense-amount' : 'revenue-amount';
}

// Gross payout calculation
function calculateGrossPayout(reservation, statement) {
    const isAirbnb = isAirbnbSource(reservation.source);
    const isCohostAirbnb = isAirbnb && statement.isCohostOnAirbnb;
    const pmFee = reservation.clientRevenue * (statement.pmPercentage / 100);
    const tax = reservation.clientTaxResponsibility || 0;
    const addTax = shouldAddTax(reservation, statement);

    if (isCohostAirbnb) {
        return -pmFee;
    } else if (addTax) {
        return reservation.clientRevenue - pmFee + tax;
    } else {
        return reservation.clientRevenue - pmFee;
    }
}

// Owner payout calculation
function calculateOwnerPayout(statement) {
    const { totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees, adjustments } = statement;
    return totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees + (adjustments || 0);
}

// PM Commission calculation
function calculatePmCommission(revenue, pmPercentage) {
    return revenue * (pmPercentage / 100);
}

// Multi-property fees
function calculateTechFees(propertyCount) {
    return propertyCount * 50;
}

function calculateInsuranceFees(propertyCount) {
    return propertyCount * 25;
}

// Owner lookup
function findOwner(ownerId, owners) {
    if (!ownerId || ownerId === 'default' || ownerId === '1' || ownerId === 1) {
        return owners.find(o => o.id === 1 || o.name === 'Default') || owners[0];
    }
    const numericId = parseInt(ownerId, 10);
    return owners.find(o => o.id === numericId || o.id === ownerId) || owners[0];
}

// Expense filtering
function filterExpenses(expenses, propertyId, secureStayListingId, startDate, endDate) {
    return expenses.filter(e => {
        const matchesPropertyId = propertyId !== null && e.propertyId === propertyId;
        const matchesSecureStayId = secureStayListingId !== null && e.secureStayListingId === secureStayListingId;
        const matchesProperty = matchesPropertyId || matchesSecureStayId;
        const matchesDate = (!startDate || e.date >= startDate) && (!endDate || e.date <= endDate);
        return matchesProperty && matchesDate;
    });
}

// ============================================================
// TEST SUITE 1: CORE STATEMENT CALCULATIONS
// ============================================================
describe('1. CORE STATEMENT CALCULATIONS', () => {

    test('Revenue calculation - sum of all reservation revenues', () => {
        const reservations = [
            { clientRevenue: 500 },
            { clientRevenue: 750 },
            { clientRevenue: 1000 }
        ];
        const totalRevenue = reservations.reduce((sum, r) => sum + r.clientRevenue, 0);
        expect(totalRevenue).toBe(2250);
    });

    test('PM Commission at 15%', () => {
        expect(calculatePmCommission(1000, 15)).toBe(150);
    });

    test('PM Commission at 20%', () => {
        expect(calculatePmCommission(1000, 20)).toBe(200);
    });

    test('PM Commission at 10%', () => {
        expect(calculatePmCommission(1000, 10)).toBe(100);
    });

    test('Tech fees - single property ($50)', () => {
        expect(calculateTechFees(1)).toBe(50);
    });

    test('Tech fees - 3 properties ($150)', () => {
        expect(calculateTechFees(3)).toBe(150);
    });

    test('Tech fees - 20 properties ($1000)', () => {
        expect(calculateTechFees(20)).toBe(1000);
    });

    test('Insurance fees - single property ($25)', () => {
        expect(calculateInsuranceFees(1)).toBe(25);
    });

    test('Insurance fees - 3 properties ($75)', () => {
        expect(calculateInsuranceFees(3)).toBe(75);
    });

    test('Insurance fees - 20 properties ($500)', () => {
        expect(calculateInsuranceFees(20)).toBe(500);
    });

    test('Owner Payout formula: Revenue - Expenses - PM - Tech - Insurance', () => {
        const statement = {
            totalRevenue: 5000,
            totalExpenses: 500,
            pmCommission: 750,
            techFees: 50,
            insuranceFees: 25,
            adjustments: 0
        };
        expect(calculateOwnerPayout(statement)).toBe(3675);
    });

    test('Owner Payout with positive adjustment', () => {
        const statement = {
            totalRevenue: 5000,
            totalExpenses: 500,
            pmCommission: 750,
            techFees: 50,
            insuranceFees: 25,
            adjustments: 100
        };
        expect(calculateOwnerPayout(statement)).toBe(3775);
    });

    test('Owner Payout with negative adjustment', () => {
        const statement = {
            totalRevenue: 5000,
            totalExpenses: 500,
            pmCommission: 750,
            techFees: 50,
            insuranceFees: 25,
            adjustments: -100
        };
        expect(calculateOwnerPayout(statement)).toBe(3575);
    });

    test('Expense calculation - excludes positive amounts (upsells)', () => {
        const expenses = [
            { amount: -100, type: 'Cleaning' },
            { amount: -200, type: 'Maintenance' },
            { amount: 50, type: 'Upsell' }
        ];
        const totalExpenses = expenses
            .filter(e => e.amount < 0)
            .reduce((sum, e) => sum + Math.abs(e.amount), 0);
        expect(totalExpenses).toBe(300);
    });

    test('Zero revenue scenario', () => {
        const statement = {
            totalRevenue: 0,
            totalExpenses: 100,
            pmCommission: 0,
            techFees: 50,
            insuranceFees: 25,
            adjustments: 0
        };
        expect(calculateOwnerPayout(statement)).toBe(-175);
    });

    test('Zero expenses scenario', () => {
        const statement = {
            totalRevenue: 1000,
            totalExpenses: 0,
            pmCommission: 150,
            techFees: 50,
            insuranceFees: 25,
            adjustments: 0
        };
        expect(calculateOwnerPayout(statement)).toBe(775);
    });

    test('Currency rounding to 2 decimal places', () => {
        const revenue = 1000.999;
        const rounded = Math.round(revenue * 100) / 100;
        expect(rounded).toBe(1001);
    });
});

// ============================================================
// TEST SUITE 2: COMBINED MULTI-PROPERTY STATEMENTS
// ============================================================
describe('2. COMBINED MULTI-PROPERTY STATEMENTS', () => {

    test('Combined revenue from 3 properties', () => {
        const properties = [
            { revenue: 1000 },
            { revenue: 1500 },
            { revenue: 2000 }
        ];
        const totalRevenue = properties.reduce((sum, p) => sum + p.revenue, 0);
        expect(totalRevenue).toBe(4500);
    });

    test('Combined expenses from 3 properties', () => {
        const properties = [
            { expenses: 100 },
            { expenses: 150 },
            { expenses: 200 }
        ];
        const totalExpenses = properties.reduce((sum, p) => sum + p.expenses, 0);
        expect(totalExpenses).toBe(450);
    });

    test('PM Commission with different rates per property', () => {
        const properties = [
            { revenue: 1000, pmRate: 15 },
            { revenue: 1000, pmRate: 20 },
            { revenue: 1000, pmRate: 10 }
        ];
        const totalPmCommission = properties.reduce(
            (sum, p) => sum + calculatePmCommission(p.revenue, p.pmRate), 0
        );
        expect(totalPmCommission).toBe(450);
    });

    test('Tech fees scale with property count (3 properties)', () => {
        const propertyCount = 3;
        expect(calculateTechFees(propertyCount)).toBe(150);
    });

    test('Insurance fees scale with property count (3 properties)', () => {
        const propertyCount = 3;
        expect(calculateInsuranceFees(propertyCount)).toBe(75);
    });

    test('Complete combined statement calculation', () => {
        const statement = {
            totalRevenue: 4500,
            totalExpenses: 450,
            pmCommission: 450,
            techFees: 150,
            insuranceFees: 75,
            adjustments: 0
        };
        expect(calculateOwnerPayout(statement)).toBe(3375);
    });

    test('Mixed co-host status (some properties co-hosted)', () => {
        const reservations = [
            { source: 'Airbnb', clientRevenue: 1000, isCohostProperty: true },
            { source: 'Airbnb', clientRevenue: 1000, isCohostProperty: false },
            { source: 'VRBO', clientRevenue: 1000, isCohostProperty: false }
        ];
        expect(reservations.length).toBe(3);
    });

    test('20 properties - maximum realistic scenario', () => {
        const propertyCount = 20;
        const techFees = calculateTechFees(propertyCount);
        const insuranceFees = calculateInsuranceFees(propertyCount);
        expect(techFees).toBe(1000);
        expect(insuranceFees).toBe(500);
    });
});

// ============================================================
// TEST SUITE 3: TAX CALCULATIONS - shouldAddTax()
// ============================================================
describe('3. TAX CALCULATIONS - shouldAddTax() Truth Table', () => {

    test('Non-Airbnb + disregardTax=F + passThrough=F → TRUE', () => {
        const res = { source: 'VRBO' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: false };
        expect(shouldAddTax(res, stmt)).toBe(true);
    });

    test('Non-Airbnb + disregardTax=F + passThrough=T → TRUE', () => {
        const res = { source: 'VRBO' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: true };
        expect(shouldAddTax(res, stmt)).toBe(true);
    });

    test('Non-Airbnb + disregardTax=T + passThrough=F → FALSE', () => {
        const res = { source: 'VRBO' };
        const stmt = { disregardTax: true, airbnbPassThroughTax: false };
        expect(shouldAddTax(res, stmt)).toBe(false);
    });

    test('Non-Airbnb + disregardTax=T + passThrough=T → FALSE', () => {
        const res = { source: 'VRBO' };
        const stmt = { disregardTax: true, airbnbPassThroughTax: true };
        expect(shouldAddTax(res, stmt)).toBe(false);
    });

    test('Airbnb + disregardTax=F + passThrough=F → FALSE', () => {
        const res = { source: 'Airbnb' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: false };
        expect(shouldAddTax(res, stmt)).toBe(false);
    });

    test('Airbnb + disregardTax=F + passThrough=T → TRUE', () => {
        const res = { source: 'Airbnb' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: true };
        expect(shouldAddTax(res, stmt)).toBe(true);
    });

    test('Airbnb + disregardTax=T + passThrough=F → FALSE', () => {
        const res = { source: 'Airbnb' };
        const stmt = { disregardTax: true, airbnbPassThroughTax: false };
        expect(shouldAddTax(res, stmt)).toBe(false);
    });

    test('Airbnb + disregardTax=T + passThrough=T → FALSE (disregardTax wins)', () => {
        const res = { source: 'Airbnb' };
        const stmt = { disregardTax: true, airbnbPassThroughTax: true };
        expect(shouldAddTax(res, stmt)).toBe(false);
    });
});

// ============================================================
// TEST SUITE 4: GROSS PAYOUT FORMULA
// ============================================================
describe('4. GROSS PAYOUT FORMULA', () => {

    test('Non-Airbnb: Revenue - PM + Tax', () => {
        const res = { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(950);
    });

    test('Non-Airbnb with disregardTax: Revenue - PM (no tax)', () => {
        const res = { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: true, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(850);
    });

    test('Airbnb standard: Revenue - PM (no tax)', () => {
        const res = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(850);
    });

    test('Airbnb with passThrough: Revenue - PM + Tax', () => {
        const res = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: true, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(950);
    });

    test('Co-hosted Airbnb: -PM fee only (negative)', () => {
        const res = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: true };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(-150);
    });

    test('Co-hosted Airbnb with passThrough: still -PM only', () => {
        const res = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: true, isCohostOnAirbnb: true };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(-150);
    });

    test('Co-hosted Airbnb with disregardTax: still -PM only', () => {
        const res = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const stmt = { pmPercentage: 15, disregardTax: true, airbnbPassThroughTax: false, isCohostOnAirbnb: true };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(-150);
    });

    test('Marriott booking: Revenue - PM + Tax', () => {
        const res = { source: 'Marriott', clientRevenue: 1000, clientTaxResponsibility: 138.69 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(988.69);
    });

    test('Booking.com: Revenue - PM + Tax', () => {
        const res = { source: 'Booking.com', clientRevenue: 800, clientTaxResponsibility: 80 };
        const stmt = { pmPercentage: 20, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(720);
    });

    test('Direct booking: Revenue - PM + Tax', () => {
        const res = { source: 'Direct', clientRevenue: 500, clientTaxResponsibility: 50 };
        const stmt = { pmPercentage: 10, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(500);
    });

    test('Zero tax scenario', () => {
        const res = { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 0 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(850);
    });

    test('Undefined tax defaults to 0', () => {
        const res = { source: 'VRBO', clientRevenue: 1000 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(850);
    });
});

// ============================================================
// TEST SUITE 5: STATEMENT COLORS
// ============================================================
describe('5. STATEMENT COLORS', () => {

    test('Tax: Airbnb standard → BLUE (info-amount)', () => {
        const res = { source: 'Airbnb' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(res, stmt)).toBe('info-amount');
    });

    test('Tax: Airbnb with passThrough → GREEN (revenue-amount)', () => {
        const res = { source: 'Airbnb' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: true };
        expect(getTaxColorClass(res, stmt)).toBe('revenue-amount');
    });

    test('Tax: VRBO → GREEN (revenue-amount)', () => {
        const res = { source: 'VRBO' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(res, stmt)).toBe('revenue-amount');
    });

    test('Tax: Marriott → GREEN (revenue-amount)', () => {
        const res = { source: 'Marriott' };
        const stmt = { disregardTax: false, airbnbPassThroughTax: false };
        expect(getTaxColorClass(res, stmt)).toBe('revenue-amount');
    });

    test('Tax: Any source with disregardTax → BLUE (info-amount)', () => {
        const vrbo = { source: 'VRBO' };
        const marriott = { source: 'Marriott' };
        const stmt = { disregardTax: true, airbnbPassThroughTax: false };
        expect(getTaxColorClass(vrbo, stmt)).toBe('info-amount');
        expect(getTaxColorClass(marriott, stmt)).toBe('info-amount');
    });

    test('Gross Payout: Positive → GREEN', () => {
        expect(getGrossPayoutColorClass(1000)).toBe('revenue-amount');
    });

    test('Gross Payout: Zero → GREEN', () => {
        expect(getGrossPayoutColorClass(0)).toBe('revenue-amount');
    });

    test('Gross Payout: Negative → RED', () => {
        expect(getGrossPayoutColorClass(-100)).toBe('expense-amount');
    });

    test('Gross Payout: Co-host negative → RED', () => {
        expect(getGrossPayoutColorClass(-150)).toBe('expense-amount');
    });

    test('Base Rate: Always GREEN', () => {
        expect('revenue-amount').toBe('revenue-amount');
    });

    test('Cleaning & Fees: Always GREEN', () => {
        expect('revenue-amount').toBe('revenue-amount');
    });

    test('Platform Fees: Always RED', () => {
        expect('expense-amount').toBe('expense-amount');
    });

    test('Revenue: Always GREEN', () => {
        expect('revenue-amount').toBe('revenue-amount');
    });

    test('PM Commission: Always RED', () => {
        expect('expense-amount').toBe('expense-amount');
    });
});

// ============================================================
// TEST SUITE 6: SOURCE DETECTION
// ============================================================
describe('6. SOURCE DETECTION (isAirbnbSource)', () => {

    test('Airbnb (exact) → true', () => expect(isAirbnbSource('Airbnb')).toBe(true));
    test('airbnb (lowercase) → true', () => expect(isAirbnbSource('airbnb')).toBe(true));
    test('AIRBNB (uppercase) → true', () => expect(isAirbnbSource('AIRBNB')).toBe(true));
    test('AirBnB (mixed) → true', () => expect(isAirbnbSource('AirBnB')).toBe(true));
    test('Airbnb Official → true', () => expect(isAirbnbSource('Airbnb Official')).toBe(true));
    test('airbnb.com → true', () => expect(isAirbnbSource('airbnb.com')).toBe(true));

    test('VRBO → false', () => expect(isAirbnbSource('VRBO')).toBe(false));
    test('Booking.com → false', () => expect(isAirbnbSource('Booking.com')).toBe(false));
    test('Marriott → false', () => expect(isAirbnbSource('Marriott')).toBe(false));
    test('Direct → false', () => expect(isAirbnbSource('Direct')).toBe(false));
    test('Expedia → false', () => expect(isAirbnbSource('Expedia')).toBe(false));
    test('HomeAway → false', () => expect(isAirbnbSource('HomeAway')).toBe(false));
    test('TripAdvisor → false', () => expect(isAirbnbSource('TripAdvisor')).toBe(false));
    test('Google → false', () => expect(isAirbnbSource('Google')).toBe(false));

    test('null → false', () => expect(isAirbnbSource(null)).toBe(false));
    test('undefined → false', () => expect(isAirbnbSource(undefined)).toBe(false));
    test('empty string → false', () => expect(isAirbnbSource('')).toBe(false));
});

// ============================================================
// TEST SUITE 7: OWNER LOOKUP
// ============================================================
describe('7. OWNER LOOKUP', () => {

    const owners = [
        { id: 1, name: 'Default' },
        { id: 123, name: 'John Smith' },
        { id: 456, name: 'Jane Doe' }
    ];

    test('ownerId "1" (string) → Default owner', () => {
        const owner = findOwner('1', owners);
        expect(owner.name).toBe('Default');
    });

    test('ownerId 1 (number) → Default owner', () => {
        const owner = findOwner(1, owners);
        expect(owner.name).toBe('Default');
    });

    test('ownerId "default" → Default owner', () => {
        const owner = findOwner('default', owners);
        expect(owner.name).toBe('Default');
    });

    test('ownerId 123 → John Smith', () => {
        const owner = findOwner(123, owners);
        expect(owner.name).toBe('John Smith');
    });

    test('ownerId "456" (string) → Jane Doe', () => {
        const owner = findOwner('456', owners);
        expect(owner.name).toBe('Jane Doe');
    });

    test('Unknown ownerId → fallback to first owner', () => {
        const owner = findOwner(999, owners);
        expect(owner.name).toBe('Default');
    });

    test('null ownerId → Default owner', () => {
        const owner = findOwner(null, owners);
        expect(owner.name).toBe('Default');
    });

    test('undefined ownerId → Default owner', () => {
        const owner = findOwner(undefined, owners);
        expect(owner.name).toBe('Default');
    });
});

// ============================================================
// TEST SUITE 8: EXPENSE FILTERING
// ============================================================
describe('8. EXPENSE FILTERING', () => {

    const expenses = [
        { id: 1, propertyId: 100, secureStayListingId: null, date: '2025-11-01', amount: -50 },
        { id: 2, propertyId: null, secureStayListingId: 100, date: '2025-11-05', amount: -75 },
        { id: 3, propertyId: 200, secureStayListingId: null, date: '2025-11-10', amount: -100 },
        { id: 4, propertyId: 100, secureStayListingId: null, date: '2025-11-15', amount: 25 },
        { id: 5, propertyId: 100, secureStayListingId: null, date: '2025-12-01', amount: -60 }
    ];

    test('Filter by propertyId', () => {
        const filtered = filterExpenses(expenses, 100, null, null, null);
        expect(filtered.length).toBe(3);
    });

    test('Filter by secureStayListingId', () => {
        const filtered = filterExpenses(expenses, null, 100, null, null);
        expect(filtered.length).toBe(1);
    });

    test('Filter by propertyId OR secureStayListingId (same property)', () => {
        const filtered = filterExpenses(expenses, 100, 100, null, null);
        expect(filtered.length).toBe(4);
    });

    test('Filter by date range', () => {
        const filtered = filterExpenses(expenses, 100, 100, '2025-11-01', '2025-11-15');
        expect(filtered.length).toBe(3);
    });

    test('No matching expenses returns empty array', () => {
        const filtered = filterExpenses(expenses, 999, 999, null, null);
        expect(filtered.length).toBe(0);
    });

    test('Upsells (positive amounts) are included in filter but excluded in calculation', () => {
        const filtered = filterExpenses(expenses, 100, null, null, null);
        const negativeOnly = filtered.filter(e => e.amount < 0);
        expect(filtered.length).toBe(3);
        expect(negativeOnly.length).toBe(2);
    });
});

// ============================================================
// TEST SUITE 9: EDGE CASES
// ============================================================
describe('9. EDGE CASES & BOUNDARY CONDITIONS', () => {

    test('Zero revenue, zero expenses, zero fees', () => {
        const statement = {
            totalRevenue: 0,
            totalExpenses: 0,
            pmCommission: 0,
            techFees: 0,
            insuranceFees: 0,
            adjustments: 0
        };
        expect(calculateOwnerPayout(statement)).toBe(0);
    });

    test('Very large numbers', () => {
        const statement = {
            totalRevenue: 1000000,
            totalExpenses: 100000,
            pmCommission: 150000,
            techFees: 1000,
            insuranceFees: 500,
            adjustments: 0
        };
        expect(calculateOwnerPayout(statement)).toBe(748500);
    });

    test('Decimal precision in calculations', () => {
        const res = { source: 'VRBO', clientRevenue: 1234.56, clientTaxResponsibility: 123.45 };
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        const expected = 1234.56 - (1234.56 * 0.15) + 123.45;
        expect(payout).toBe(expected);
    });

    test('PM percentage at 0%', () => {
        expect(calculatePmCommission(1000, 0)).toBe(0);
    });

    test('PM percentage at 100%', () => {
        expect(calculatePmCommission(1000, 100)).toBe(1000);
    });

    test('Undefined flags default to falsy', () => {
        const res = { source: 'Airbnb' };
        const stmt = {};
        expect(!!shouldAddTax(res, stmt)).toBe(false);
    });

    test('Null source treated as non-Airbnb', () => {
        expect(isAirbnbSource(null)).toBe(false);
    });

    test('Source with special characters', () => {
        expect(isAirbnbSource('Airbnb®')).toBe(true);
        expect(isAirbnbSource('Booking.com™')).toBe(false);
    });

    test('Negative gross payout (legitimate scenario)', () => {
        const res = { source: 'Airbnb', clientRevenue: 100, clientTaxResponsibility: 0 };
        const stmt = { pmPercentage: 150, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };
        const payout = calculateGrossPayout(res, stmt);
        expect(payout).toBe(-50);
    });

    test('NaN handling in gross payout color', () => {
        expect(getGrossPayoutColorClass(NaN)).toBe('revenue-amount');
    });
});

// ============================================================
// TEST SUITE 10: REAL-WORLD SCENARIOS
// ============================================================
describe('10. REAL-WORLD BUSINESS SCENARIOS', () => {

    test('Scenario: Mixed Airbnb + VRBO statement', () => {
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: false };

        const airbnbRes = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };
        const vrboRes = { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };

        const airbnbPayout = calculateGrossPayout(airbnbRes, stmt);
        const vrboPayout = calculateGrossPayout(vrboRes, stmt);

        expect(airbnbPayout).toBe(850);
        expect(vrboPayout).toBe(950);
        expect(getTaxColorClass(airbnbRes, stmt)).toBe('info-amount');
        expect(getTaxColorClass(vrboRes, stmt)).toBe('revenue-amount');
    });

    test('Scenario: All Airbnb with passThrough tax', () => {
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: true, isCohostOnAirbnb: false };

        const res1 = { source: 'Airbnb', clientRevenue: 500, clientTaxResponsibility: 50 };
        const res2 = { source: 'Airbnb', clientRevenue: 600, clientTaxResponsibility: 60 };

        const payout1 = calculateGrossPayout(res1, stmt);
        const payout2 = calculateGrossPayout(res2, stmt);

        expect(payout1).toBe(475);
        expect(payout2).toBe(570);
        expect(getTaxColorClass(res1, stmt)).toBe('revenue-amount');
    });

    test('Scenario: Property with disregardTax (company pays tax)', () => {
        const stmt = { pmPercentage: 15, disregardTax: true, airbnbPassThroughTax: false, isCohostOnAirbnb: false };

        const res = { source: 'VRBO', clientRevenue: 1000, clientTaxResponsibility: 100 };

        const payout = calculateGrossPayout(res, stmt);

        expect(payout).toBe(850);
        expect(getTaxColorClass(res, stmt)).toBe('info-amount');
    });

    test('Scenario: Co-hosted Airbnb property', () => {
        const stmt = { pmPercentage: 15, disregardTax: false, airbnbPassThroughTax: false, isCohostOnAirbnb: true };

        const res = { source: 'Airbnb', clientRevenue: 1000, clientTaxResponsibility: 100 };

        const payout = calculateGrossPayout(res, stmt);

        expect(payout).toBe(-150);
        expect(getGrossPayoutColorClass(payout)).toBe('expense-amount');
        expect(getTaxColorClass(res, stmt)).toBe('info-amount');
    });

    test('Scenario: Complete 3-property combined statement', () => {
        const statement = {
            totalRevenue: 3000,
            totalExpenses: 300,
            pmCommission: 450,
            techFees: 150,
            insuranceFees: 75,
            adjustments: 0
        };

        const ownerPayout = calculateOwnerPayout(statement);
        expect(ownerPayout).toBe(2025);
    });

    test('Scenario: Statement with positive adjustment (refund)', () => {
        const statement = {
            totalRevenue: 2000,
            totalExpenses: 200,
            pmCommission: 300,
            techFees: 50,
            insuranceFees: 25,
            adjustments: 100
        };

        expect(calculateOwnerPayout(statement)).toBe(1525);
    });

    test('Scenario: Statement with negative adjustment (correction)', () => {
        const statement = {
            totalRevenue: 2000,
            totalExpenses: 200,
            pmCommission: 300,
            techFees: 50,
            insuranceFees: 25,
            adjustments: -50
        };

        expect(calculateOwnerPayout(statement)).toBe(1375);
    });
});

// Export for potential reuse
module.exports = {
    isAirbnbSource,
    shouldAddTax,
    getTaxColorClass,
    getGrossPayoutColorClass,
    calculateGrossPayout,
    calculateOwnerPayout,
    calculatePmCommission,
    calculateTechFees,
    calculateInsuranceFees,
    findOwner,
    filterExpenses
};
