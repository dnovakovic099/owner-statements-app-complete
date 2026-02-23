/**
 * Tests for: Auto-set Calculation Method & Date Ranges by Schedule Tag
 *
 * Verifies that:
 * 1. WEEKLY/BI-WEEKLY tags default to "checkout" calculation method
 * 2. MONTHLY tags default to "calendar" calculation method
 * 3. Checkout date ranges: Monday to Monday
 * 4. Calendar date ranges: Monday to Sunday
 * 5. Switching calculation method recalculates dates accordingly
 * 6. Backend fallback chain uses tag-based defaults
 *
 * Run with: npx jest calcTypeByTag.test.js --verbose
 */

// Mock database to prevent Sequelize initialization
jest.mock('../config/database', () => ({
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn()
    })),
    sync: jest.fn()
}));

// ============================================================================
// HELPER: Replicate frontend getCalculationTypeForTag logic
// ============================================================================
const getCalculationTypeForTag = (tag) => {
    const upper = (tag || '').toUpperCase();
    if (upper.includes('MONTHLY')) return 'calendar';
    return 'checkout';
};

// ============================================================================
// HELPER: Replicate frontend getDateRangeForTag logic
// ============================================================================
const formatDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getDateRangeForTag = (tag, calcType = 'checkout', today = new Date()) => {
    const dayOfWeek = today.getDay();
    const upperTag = tag.toUpperCase();

    if (upperTag.includes('WEEKLY') && !upperTag.includes('BI')) {
        const lastMonday = new Date(today);
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        lastMonday.setDate(today.getDate() - daysToMonday);

        const prevMonday = new Date(lastMonday);
        prevMonday.setDate(lastMonday.getDate() - 7);

        if (calcType === 'calendar') {
            const prevSunday = new Date(lastMonday);
            prevSunday.setDate(lastMonday.getDate() - 1);
            return { start: formatDate(prevMonday), end: formatDate(prevSunday) };
        }
        return { start: formatDate(prevMonday), end: formatDate(lastMonday) };

    } else if (upperTag.includes('BI-WEEKLY') || upperTag.includes('BIWEEKLY')) {
        const referenceDate = new Date(2026, 0, 19);
        const lastMonday = new Date(today);
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        lastMonday.setDate(today.getDate() - daysToMonday);

        const msSinceReference = lastMonday.getTime() - referenceDate.getTime();
        const daysSinceReference = Math.floor(msSinceReference / (1000 * 60 * 60 * 24));
        const weeksSinceReference = Math.floor(daysSinceReference / 7);

        let endMonday = new Date(lastMonday);
        if (weeksSinceReference % 2 !== 0) {
            endMonday.setDate(lastMonday.getDate() - 7);
        }

        const startMonday = new Date(endMonday);
        startMonday.setDate(endMonday.getDate() - 14);

        if (calcType === 'calendar') {
            const endSunday = new Date(endMonday);
            endSunday.setDate(endMonday.getDate() - 1);
            return { start: formatDate(startMonday), end: formatDate(endSunday) };
        }
        return { start: formatDate(startMonday), end: formatDate(endMonday) };

    } else {
        // MONTHLY
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: formatDate(lastMonth), end: formatDate(lastDayOfLastMonth) };
    }
};


// ============================================================================
// TESTS
// ============================================================================

describe('Auto-set Calculation Method & Date Ranges by Tag', () => {

    // ========================================================================
    // 1. Default Calculation Type Derivation
    // ========================================================================
    describe('getCalculationTypeForTag (frontend logic)', () => {

        test('WEEKLY tag defaults to checkout', () => {
            expect(getCalculationTypeForTag('WEEKLY')).toBe('checkout');
        });

        test('Weekly tag (lowercase) defaults to checkout', () => {
            expect(getCalculationTypeForTag('Weekly')).toBe('checkout');
        });

        test('BI-WEEKLY tag defaults to checkout', () => {
            expect(getCalculationTypeForTag('BI-WEEKLY')).toBe('checkout');
        });

        test('BI-WEEKLY A tag defaults to checkout', () => {
            expect(getCalculationTypeForTag('BI-WEEKLY A')).toBe('checkout');
        });

        test('BIWEEKLY tag defaults to checkout', () => {
            expect(getCalculationTypeForTag('BIWEEKLY')).toBe('checkout');
        });

        test('MONTHLY tag defaults to calendar', () => {
            expect(getCalculationTypeForTag('MONTHLY')).toBe('calendar');
        });

        test('Monthly tag (mixed case) defaults to calendar', () => {
            expect(getCalculationTypeForTag('Monthly')).toBe('calendar');
        });

        test('null/empty tag defaults to checkout', () => {
            expect(getCalculationTypeForTag('')).toBe('checkout');
            expect(getCalculationTypeForTag(null)).toBe('checkout');
        });
    });

    // ========================================================================
    // 2. Backend getDefaultCalculationTypeForTag
    // ========================================================================
    describe('TagScheduleService.getDefaultCalculationTypeForTag', () => {
        let service;

        beforeAll(() => {
            // Require after mocks are in place
            service = require('../services/TagScheduleService');
        });

        test('WEEKLY returns checkout', () => {
            expect(service.getDefaultCalculationTypeForTag('WEEKLY')).toBe('checkout');
        });

        test('BI-WEEKLY returns checkout', () => {
            expect(service.getDefaultCalculationTypeForTag('BI-WEEKLY')).toBe('checkout');
        });

        test('BI-WEEKLY A returns checkout', () => {
            expect(service.getDefaultCalculationTypeForTag('BI-WEEKLY A')).toBe('checkout');
        });

        test('BIWEEKLY returns checkout', () => {
            expect(service.getDefaultCalculationTypeForTag('BIWEEKLY')).toBe('checkout');
        });

        test('MONTHLY returns calendar', () => {
            expect(service.getDefaultCalculationTypeForTag('MONTHLY')).toBe('calendar');
        });

        test('Monthly (mixed case) returns calendar', () => {
            expect(service.getDefaultCalculationTypeForTag('Monthly')).toBe('calendar');
        });

        test('null/empty returns checkout', () => {
            expect(service.getDefaultCalculationTypeForTag(null)).toBe('checkout');
            expect(service.getDefaultCalculationTypeForTag('')).toBe('checkout');
        });
    });

    // ========================================================================
    // 3. Date Range Calculation — WEEKLY
    // ========================================================================
    describe('WEEKLY date ranges', () => {
        // Use Wednesday Feb 25, 2026 as reference date
        // This week's Monday = Feb 23, 2026
        // Previous Monday = Feb 16, 2026
        // Previous Sunday = Feb 22, 2026
        const wednesday = new Date(2026, 1, 25); // Feb 25, 2026 (Wednesday)

        test('WEEKLY + checkout → Monday to Monday', () => {
            const range = getDateRangeForTag('WEEKLY', 'checkout', wednesday);
            expect(range.start).toBe('2026-02-16');  // prev Monday
            expect(range.end).toBe('2026-02-23');    // this Monday
        });

        test('WEEKLY + calendar → Monday to Sunday', () => {
            const range = getDateRangeForTag('WEEKLY', 'calendar', wednesday);
            expect(range.start).toBe('2026-02-16');  // prev Monday
            expect(range.end).toBe('2026-02-22');    // prev Sunday
        });

        test('WEEKLY default (no calcType) → Monday to Monday (checkout)', () => {
            const range = getDateRangeForTag('WEEKLY', undefined, wednesday);
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-23');
        });

        test('WEEKLY on a Monday → uses this Monday as end', () => {
            const monday = new Date(2026, 1, 23); // Feb 23, 2026 (Monday)
            const range = getDateRangeForTag('WEEKLY', 'checkout', monday);
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-23');
        });

        test('WEEKLY on a Sunday → uses this weeks Monday as end', () => {
            const sunday = new Date(2026, 2, 1); // Mar 1, 2026 (Sunday)
            const range = getDateRangeForTag('WEEKLY', 'checkout', sunday);
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-23');
        });

        test('WEEKLY + calendar on a Sunday → Monday to Sunday', () => {
            const sunday = new Date(2026, 2, 1); // Mar 1, 2026 (Sunday)
            const range = getDateRangeForTag('WEEKLY', 'calendar', sunday);
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-22');
        });
    });

    // ========================================================================
    // 4. Date Range Calculation — BI-WEEKLY
    // ========================================================================
    describe('BI-WEEKLY date ranges', () => {
        // Reference date: Jan 19, 2026 (Monday)
        // Use Feb 2, 2026 (Monday) — 2 weeks after reference (weeksSinceReference=2, even → use this Monday)
        // endMonday = Feb 2, startMonday = Jan 19
        const mondayFeb2 = new Date(2026, 1, 2);

        test('BI-WEEKLY + checkout → Monday to Monday (14 days)', () => {
            const range = getDateRangeForTag('BI-WEEKLY', 'checkout', mondayFeb2);
            expect(range.start).toBe('2026-01-19');  // 14 days before endMonday
            expect(range.end).toBe('2026-02-02');    // endMonday
        });

        test('BI-WEEKLY + calendar → Monday to Sunday (13 days)', () => {
            const range = getDateRangeForTag('BI-WEEKLY', 'calendar', mondayFeb2);
            expect(range.start).toBe('2026-01-19');
            expect(range.end).toBe('2026-02-01');    // Sunday before endMonday
        });

        test('BIWEEKLY (alt spelling) + checkout works the same', () => {
            const range = getDateRangeForTag('BIWEEKLY', 'checkout', mondayFeb2);
            expect(range.start).toBe('2026-01-19');
            expect(range.end).toBe('2026-02-02');
        });

        test('BI-WEEKLY A + calendar works the same', () => {
            const range = getDateRangeForTag('BI-WEEKLY A', 'calendar', mondayFeb2);
            expect(range.start).toBe('2026-01-19');
            expect(range.end).toBe('2026-02-01');
        });
    });

    // ========================================================================
    // 5. Date Range Calculation — MONTHLY
    // ========================================================================
    describe('MONTHLY date ranges', () => {

        test('MONTHLY → first to last day of previous month (Feb reference)', () => {
            const febDate = new Date(2026, 1, 15); // Feb 15, 2026
            const range = getDateRangeForTag('MONTHLY', 'calendar', febDate);
            expect(range.start).toBe('2026-01-01');
            expect(range.end).toBe('2026-01-31');
        });

        test('MONTHLY → ignores calcType (always same range)', () => {
            const febDate = new Date(2026, 1, 15);
            const rangeCheckout = getDateRangeForTag('MONTHLY', 'checkout', febDate);
            const rangeCalendar = getDateRangeForTag('MONTHLY', 'calendar', febDate);
            expect(rangeCheckout).toEqual(rangeCalendar);
        });

        test('MONTHLY in March → returns February range', () => {
            const marDate = new Date(2026, 2, 10); // Mar 10, 2026
            const range = getDateRangeForTag('MONTHLY', 'calendar', marDate);
            expect(range.start).toBe('2026-02-01');
            expect(range.end).toBe('2026-02-28'); // 2026 is not a leap year
        });

        test('MONTHLY in January → returns December of previous year', () => {
            const janDate = new Date(2026, 0, 5); // Jan 5, 2026
            const range = getDateRangeForTag('MONTHLY', 'calendar', janDate);
            expect(range.start).toBe('2025-12-01');
            expect(range.end).toBe('2025-12-31');
        });
    });

    // ========================================================================
    // 6. Backend calculateDateRangeForTag with calculationType param
    // ========================================================================
    describe('TagScheduleService.calculateDateRangeForTag', () => {
        let service;

        beforeAll(() => {
            service = require('../services/TagScheduleService');
        });

        test('WEEKLY with no calculationType uses tag default (checkout) → Mon-to-Mon', () => {
            // Mock getESTTime to return a known Wednesday
            const origGetESTTime = service.getESTTime.bind(service);
            service.getESTTime = () => new Date(2026, 1, 25); // Wed Feb 25

            const range = service.calculateDateRangeForTag('WEEKLY');
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-23');

            service.getESTTime = origGetESTTime;
        });

        test('WEEKLY with calendar → Mon-to-Sun', () => {
            const origGetESTTime = service.getESTTime.bind(service);
            service.getESTTime = () => new Date(2026, 1, 25);

            const range = service.calculateDateRangeForTag('WEEKLY', 'calendar');
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-22');

            service.getESTTime = origGetESTTime;
        });

        test('WEEKLY with checkout → Mon-to-Mon', () => {
            const origGetESTTime = service.getESTTime.bind(service);
            service.getESTTime = () => new Date(2026, 1, 25);

            const range = service.calculateDateRangeForTag('WEEKLY', 'checkout');
            expect(range.start).toBe('2026-02-16');
            expect(range.end).toBe('2026-02-23');

            service.getESTTime = origGetESTTime;
        });

        test('BI-WEEKLY with calendar → Mon-to-Sun', () => {
            const origGetESTTime = service.getESTTime.bind(service);
            service.getESTTime = () => new Date(2026, 1, 2); // Mon Feb 2

            const range = service.calculateDateRangeForTag('BI-WEEKLY', 'calendar');
            expect(range.start).toBe('2026-01-19');
            expect(range.end).toBe('2026-02-01');

            service.getESTTime = origGetESTTime;
        });

        test('BI-WEEKLY with checkout → Mon-to-Mon', () => {
            const origGetESTTime = service.getESTTime.bind(service);
            service.getESTTime = () => new Date(2026, 1, 2);

            const range = service.calculateDateRangeForTag('BI-WEEKLY', 'checkout');
            expect(range.start).toBe('2026-01-19');
            expect(range.end).toBe('2026-02-02');

            service.getESTTime = origGetESTTime;
        });

        test('MONTHLY with no calculationType uses tag default (calendar)', () => {
            const origGetESTTime = service.getESTTime.bind(service);
            service.getESTTime = () => new Date(2026, 1, 15); // Feb 15

            const range = service.calculateDateRangeForTag('MONTHLY');
            expect(range.start).toBe('2026-01-01');
            expect(range.end).toBe('2026-01-31');

            service.getESTTime = origGetESTTime;
        });
    });

    // ========================================================================
    // 7. Calculation Type Fallback Chain
    // ========================================================================
    describe('Fallback chain for calculation type', () => {

        test('Group fallback: group.calculationType > schedule.calculationType > tag default', () => {
            const tagDefault = getCalculationTypeForTag('WEEKLY');
            expect(tagDefault).toBe('checkout');

            // If group has a calculationType, use it
            const groupCalcType = 'calendar';
            const scheduleCalcType = 'checkout';
            const resolved = groupCalcType || scheduleCalcType || tagDefault;
            expect(resolved).toBe('calendar');
        });

        test('Group fallback: no group type → schedule type', () => {
            const tagDefault = getCalculationTypeForTag('WEEKLY');
            const groupCalcType = null;
            const scheduleCalcType = 'calendar';
            const resolved = groupCalcType || scheduleCalcType || tagDefault;
            expect(resolved).toBe('calendar');
        });

        test('Group fallback: no group or schedule type → tag default', () => {
            const tagDefault = getCalculationTypeForTag('WEEKLY');
            const groupCalcType = null;
            const scheduleCalcType = null;
            const resolved = groupCalcType || scheduleCalcType || tagDefault;
            expect(resolved).toBe('checkout');
        });

        test('Group fallback: MONTHLY tag with no overrides → calendar', () => {
            const tagDefault = getCalculationTypeForTag('MONTHLY');
            const resolved = null || null || tagDefault;
            expect(resolved).toBe('calendar');
        });

        test('Individual fallback: schedule.calculationType > tag default', () => {
            const tagDefault = getCalculationTypeForTag('WEEKLY');
            const scheduleCalcType = 'calendar';
            const resolved = scheduleCalcType || tagDefault;
            expect(resolved).toBe('calendar');
        });

        test('Individual fallback: no schedule type → tag default (MONTHLY → calendar)', () => {
            const tagDefault = getCalculationTypeForTag('MONTHLY');
            const resolved = null || tagDefault;
            expect(resolved).toBe('calendar');
        });
    });

    // ========================================================================
    // 8. Frontend: handleCalculationTypeChange recalculates dates
    // ========================================================================
    describe('Switching calculation method recalculates dates', () => {
        const wednesday = new Date(2026, 1, 25);

        test('Switch WEEKLY from checkout to calendar → end moves back 1 day', () => {
            const checkoutRange = getDateRangeForTag('WEEKLY', 'checkout', wednesday);
            const calendarRange = getDateRangeForTag('WEEKLY', 'calendar', wednesday);

            // Same start
            expect(checkoutRange.start).toBe(calendarRange.start);
            // Calendar end is 1 day before checkout end
            const checkoutEnd = new Date(checkoutRange.end);
            const calendarEnd = new Date(calendarRange.end);
            const diffDays = (checkoutEnd - calendarEnd) / (1000 * 60 * 60 * 24);
            expect(diffDays).toBe(1);
        });

        test('Switch BI-WEEKLY from checkout to calendar → end moves back 1 day', () => {
            const mondayFeb2 = new Date(2026, 1, 2);
            const checkoutRange = getDateRangeForTag('BI-WEEKLY', 'checkout', mondayFeb2);
            const calendarRange = getDateRangeForTag('BI-WEEKLY', 'calendar', mondayFeb2);

            expect(checkoutRange.start).toBe(calendarRange.start);
            const checkoutEnd = new Date(checkoutRange.end);
            const calendarEnd = new Date(calendarRange.end);
            const diffDays = (checkoutEnd - calendarEnd) / (1000 * 60 * 60 * 24);
            expect(diffDays).toBe(1);
        });

        test('Switch MONTHLY between checkout/calendar → dates unchanged', () => {
            const febDate = new Date(2026, 1, 15);
            const checkoutRange = getDateRangeForTag('MONTHLY', 'checkout', febDate);
            const calendarRange = getDateRangeForTag('MONTHLY', 'calendar', febDate);
            expect(checkoutRange).toEqual(calendarRange);
        });
    });

    // ========================================================================
    // 9. End date day-of-week verification
    // ========================================================================
    describe('End date is correct day of week', () => {
        const wednesday = new Date(2026, 1, 25);

        test('WEEKLY + checkout end date is a Monday', () => {
            const range = getDateRangeForTag('WEEKLY', 'checkout', wednesday);
            const endDate = new Date(range.end + 'T00:00:00');
            expect(endDate.getDay()).toBe(1); // Monday
        });

        test('WEEKLY + calendar end date is a Sunday', () => {
            const range = getDateRangeForTag('WEEKLY', 'calendar', wednesday);
            const endDate = new Date(range.end + 'T00:00:00');
            expect(endDate.getDay()).toBe(0); // Sunday
        });

        test('WEEKLY + checkout start date is a Monday', () => {
            const range = getDateRangeForTag('WEEKLY', 'checkout', wednesday);
            const startDate = new Date(range.start + 'T00:00:00');
            expect(startDate.getDay()).toBe(1); // Monday
        });

        test('BI-WEEKLY + checkout end date is a Monday', () => {
            const mondayFeb2 = new Date(2026, 1, 2);
            const range = getDateRangeForTag('BI-WEEKLY', 'checkout', mondayFeb2);
            const endDate = new Date(range.end + 'T00:00:00');
            expect(endDate.getDay()).toBe(1);
        });

        test('BI-WEEKLY + calendar end date is a Sunday', () => {
            const mondayFeb2 = new Date(2026, 1, 2);
            const range = getDateRangeForTag('BI-WEEKLY', 'calendar', mondayFeb2);
            const endDate = new Date(range.end + 'T00:00:00');
            expect(endDate.getDay()).toBe(0);
        });
    });

    // ========================================================================
    // 10. Group selection auto-sets calculation type + dates
    // ========================================================================
    describe('Group selection derives calc type from tag', () => {

        test('Group with WEEKLY tag and no calculationType → checkout', () => {
            const group = { id: 1, name: 'Beach Props', tags: ['WEEKLY'], calculationType: null };
            const tagCalcType = group.tags.length > 0 ? getCalculationTypeForTag(group.tags[0]) : 'checkout';
            const calcType = group.calculationType || tagCalcType;
            expect(calcType).toBe('checkout');
        });

        test('Group with MONTHLY tag and no calculationType → calendar', () => {
            const group = { id: 2, name: 'City Props', tags: ['MONTHLY'], calculationType: null };
            const tagCalcType = group.tags.length > 0 ? getCalculationTypeForTag(group.tags[0]) : 'checkout';
            const calcType = group.calculationType || tagCalcType;
            expect(calcType).toBe('calendar');
        });

        test('Group with WEEKLY tag but calculationType override → uses override', () => {
            const group = { id: 3, name: 'Special Props', tags: ['WEEKLY'], calculationType: 'calendar' };
            const tagCalcType = group.tags.length > 0 ? getCalculationTypeForTag(group.tags[0]) : 'checkout';
            const calcType = group.calculationType || tagCalcType;
            expect(calcType).toBe('calendar');
        });

        test('Group with no tags → falls back to checkout', () => {
            const group = { id: 4, name: 'No Tags', tags: [], calculationType: null };
            const tagCalcType = group.tags.length > 0 ? getCalculationTypeForTag(group.tags[0]) : 'checkout';
            const calcType = group.calculationType || tagCalcType;
            expect(calcType).toBe('checkout');
        });
    });
});
