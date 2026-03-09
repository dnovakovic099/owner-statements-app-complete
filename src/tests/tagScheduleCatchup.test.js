/**
 * Tests for TagScheduleService catch-up logic.
 *
 * Verifies that missed schedule runs (due to server downtime, overlapping checks, etc.)
 * are caught up on the next check cycle, rather than being silently skipped.
 */

const TagScheduleService = require('../services/TagScheduleService');

// Helper to create a mock schedule object
function mockSchedule(overrides = {}) {
    return {
        id: 1,
        tagName: 'WEEKLY',
        frequencyType: 'weekly',
        dayOfWeek: 1, // Monday
        dayOfMonth: null,
        timeOfDay: '05:00',
        isEnabled: true,
        lastNotifiedAt: null,
        nextScheduledAt: null,
        skipDates: [],
        biweeklyStartDate: null,
        ...overrides,
    };
}

// Helper to create a Date with specific EST values
function estDate(year, month, day, hour = 0, minute = 0) {
    // month is 1-indexed for readability
    return new Date(year, month - 1, day, hour, minute, 0);
}

describe('TagScheduleService - isScheduleDue (catch-up logic)', () => {

    // ==========================================
    // Basic scheduling (no catch-up needed)
    // ==========================================

    test('triggers WEEKLY schedule when today matches day and time has passed', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '05:00',
            lastNotifiedAt: null,
        });
        // Monday March 9 2026 at 5:30 AM EST
        const now = estDate(2026, 3, 9, 5, 30);
        expect(now.getDay()).toBe(1); // Confirm it's Monday

        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });

    test('does NOT trigger when time is before scheduled time (no missed run)', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            lastNotifiedAt: estDate(2026, 3, 2, 5, 0),  // Last ran last Monday
            nextScheduledAt: estDate(2026, 3, 9, 5, 0),  // Next is today at 5:00 AM
        });
        // Monday at 4:59 AM — too early, and nextScheduledAt hasn't passed yet
        const now = estDate(2026, 3, 9, 4, 59);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    test('does NOT trigger on wrong day of week', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '05:00',
        });
        // Tuesday March 10 at 5:30 AM
        const now = estDate(2026, 3, 10, 5, 30);
        expect(now.getDay()).toBe(2); // Tuesday

        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    test('does NOT trigger if already ran today', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            lastNotifiedAt: estDate(2026, 3, 9, 5, 0), // Ran today at 5:00 AM
        });
        // Same Monday at 5:30 AM
        const now = estDate(2026, 3, 9, 5, 30);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    // ==========================================
    // Catch-up scenarios (the main fix)
    // ==========================================

    test('CATCH-UP: triggers WEEKLY when nextScheduledAt has passed (missed run)', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '05:00',
            lastNotifiedAt: estDate(2026, 2, 23, 5, 0), // Last ran Feb 23
            nextScheduledAt: estDate(2026, 3, 2, 5, 0),  // Should have run Mar 2
        });
        // Wednesday March 4 (missed Monday) — catch-up should trigger
        const now = estDate(2026, 3, 4, 10, 0);
        expect(now.getDay()).toBe(3); // Wednesday

        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });

    test('CATCH-UP: triggers when server was down during scheduled time', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            lastNotifiedAt: estDate(2026, 2, 23, 5, 0), // Last ran Feb 23
            nextScheduledAt: estDate(2026, 3, 2, 5, 0),  // Mar 2 was scheduled
        });
        // Monday March 9, 8:00 AM — both Mar 2 AND Mar 9 were missed/are due
        const now = estDate(2026, 3, 9, 8, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        // Today IS Monday and time has passed, so it triggers via normal path
        expect(result).toBe(true);
    });

    test('CATCH-UP: does NOT trigger if nextScheduledAt is in the future', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            lastNotifiedAt: estDate(2026, 3, 2, 5, 0),  // Last ran Mar 2
            nextScheduledAt: estDate(2026, 3, 9, 5, 0),  // Next is Mar 9
        });
        // Thursday March 5 — next run is in the future
        const now = estDate(2026, 3, 5, 10, 0);
        expect(now.getDay()).toBe(4); // Thursday

        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    test('CATCH-UP: does NOT double-trigger after catch-up already ran', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            // Catch-up already happened on Mar 4 (Wed) for the missed Mar 2 run
            lastNotifiedAt: estDate(2026, 3, 4, 10, 0),
            nextScheduledAt: estDate(2026, 3, 9, 5, 0), // Next scheduled is Mar 9
        });
        // Still Wednesday March 4 — should not run again
        const now = estDate(2026, 3, 4, 11, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    // ==========================================
    // MONTHLY catch-up
    // ==========================================

    test('CATCH-UP: triggers MONTHLY when missed the 1st of month', async () => {
        const schedule = mockSchedule({
            frequencyType: 'monthly',
            dayOfWeek: null,
            dayOfMonth: 1,
            timeOfDay: '08:00',
            lastNotifiedAt: estDate(2026, 2, 1, 8, 0),  // Feb 1
            nextScheduledAt: estDate(2026, 3, 1, 8, 0),  // Mar 1 was scheduled
        });
        // March 3 — missed March 1, catch-up should trigger
        const now = estDate(2026, 3, 3, 10, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });

    test('MONTHLY: triggers on correct day of month', async () => {
        const schedule = mockSchedule({
            frequencyType: 'monthly',
            dayOfMonth: 15,
            timeOfDay: '08:00',
        });
        // March 15 at 9:00 AM
        const now = estDate(2026, 3, 15, 9, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });

    test('MONTHLY: does NOT trigger on wrong day of month', async () => {
        const schedule = mockSchedule({
            frequencyType: 'monthly',
            dayOfMonth: 15,
            timeOfDay: '08:00',
        });
        // March 14
        const now = estDate(2026, 3, 14, 9, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    // ==========================================
    // BI-WEEKLY catch-up
    // ==========================================

    test('CATCH-UP: triggers BI-WEEKLY when missed run', async () => {
        const schedule = mockSchedule({
            tagName: 'BI-WEEKLY',
            frequencyType: 'biweekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            biweeklyStartDate: '2026-01-19',
            lastNotifiedAt: estDate(2026, 2, 16, 5, 0),  // Feb 16
            nextScheduledAt: estDate(2026, 3, 2, 5, 0),   // Mar 2 scheduled
        });
        // March 5 (Thursday) — missed Mar 2, catch-up should trigger
        const now = estDate(2026, 3, 5, 10, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });

    // ==========================================
    // Skip dates
    // ==========================================

    test('does NOT trigger if today is in skip dates', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            skipDates: ['2026-03-09'],
        });
        // Monday March 9 — should be skipped
        const now = estDate(2026, 3, 9, 5, 30);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(false);
    });

    // ==========================================
    // Time flexibility (not exact minute match)
    // ==========================================

    test('triggers at ANY time after scheduled time (not just exact minute)', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
        });
        // Monday at 11:30 PM — should still trigger (time >= 5:00 AM)
        const now = estDate(2026, 3, 9, 23, 30);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });

    test('triggers at exact scheduled minute', async () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
        });
        // Monday at exactly 5:00 AM
        const now = estDate(2026, 3, 9, 5, 0);
        const result = await TagScheduleService.isScheduleDue(schedule, now);
        expect(result).toBe(true);
    });
});

describe('TagScheduleService - _todayMatchesPattern', () => {

    test('WEEKLY matches correct day', () => {
        const schedule = mockSchedule({ frequencyType: 'weekly', dayOfWeek: 1 });
        const now = estDate(2026, 3, 9); // Monday
        expect(TagScheduleService._todayMatchesPattern(schedule, now, 1, 9)).toBe(true);
    });

    test('WEEKLY does not match wrong day', () => {
        const schedule = mockSchedule({ frequencyType: 'weekly', dayOfWeek: 1 });
        expect(TagScheduleService._todayMatchesPattern(schedule, estDate(2026, 3, 10), 2, 10)).toBe(false);
    });

    test('MONTHLY matches correct date', () => {
        const schedule = mockSchedule({ frequencyType: 'monthly', dayOfMonth: 15 });
        expect(TagScheduleService._todayMatchesPattern(schedule, estDate(2026, 3, 15), 0, 15)).toBe(true);
    });

    test('MONTHLY does not match wrong date', () => {
        const schedule = mockSchedule({ frequencyType: 'monthly', dayOfMonth: 15 });
        expect(TagScheduleService._todayMatchesPattern(schedule, estDate(2026, 3, 14), 6, 14)).toBe(false);
    });

    test('BIWEEKLY matches on-week', () => {
        const schedule = mockSchedule({
            frequencyType: 'biweekly',
            dayOfWeek: 1,
            biweeklyStartDate: '2026-01-19', // Jan 19 is a Monday
        });
        // Jan 19 is week 0 (on-week). Feb 2 is week 2 (on-week). Feb 16 is week 4.
        // Mar 2 is week 6 (on-week). Mar 16 is week 8 (on-week).
        const mar2 = estDate(2026, 3, 2);
        expect(mar2.getDay()).toBe(1); // Monday
        expect(TagScheduleService._todayMatchesPattern(schedule, mar2, 1, 2)).toBe(true);
    });

    test('BIWEEKLY does not match off-week', () => {
        const schedule = mockSchedule({
            frequencyType: 'biweekly',
            dayOfWeek: 1,
            biweeklyStartDate: '2026-01-19',
        });
        // Jan 26 is week 1 (off-week). Feb 9 is week 3 (off-week).
        // Mar 9 is week 7 (off-week).
        const mar9 = estDate(2026, 3, 9);
        expect(mar9.getDay()).toBe(1); // Monday
        expect(TagScheduleService._todayMatchesPattern(schedule, mar9, 1, 9)).toBe(false);
    });
});

describe('TagScheduleService - _hasMissedRun', () => {

    test('returns true when nextScheduledAt has passed and lastNotified is before it', () => {
        const schedule = mockSchedule({
            lastNotifiedAt: estDate(2026, 2, 23, 5, 0),
            nextScheduledAt: estDate(2026, 3, 2, 5, 0),
        });
        const now = estDate(2026, 3, 4, 10, 0);
        expect(TagScheduleService._hasMissedRun(schedule, now)).toBe(true);
    });

    test('returns false when nextScheduledAt is in the future', () => {
        const schedule = mockSchedule({
            lastNotifiedAt: estDate(2026, 3, 2, 5, 0),
            nextScheduledAt: estDate(2026, 3, 9, 5, 0),
        });
        const now = estDate(2026, 3, 5, 10, 0);
        expect(TagScheduleService._hasMissedRun(schedule, now)).toBe(false);
    });

    test('returns false when lastNotified is after nextScheduledAt (already caught up)', () => {
        const schedule = mockSchedule({
            lastNotifiedAt: estDate(2026, 3, 4, 10, 0),  // Catch-up ran Mar 4
            nextScheduledAt: estDate(2026, 3, 2, 5, 0),   // Was scheduled Mar 2
        });
        const now = estDate(2026, 3, 5, 10, 0);
        expect(TagScheduleService._hasMissedRun(schedule, now)).toBe(false);
    });

    test('returns false when never notified and no nextScheduledAt', () => {
        const schedule = mockSchedule({
            lastNotifiedAt: null,
            nextScheduledAt: null,
        });
        const now = estDate(2026, 3, 5, 10, 0);
        expect(TagScheduleService._hasMissedRun(schedule, now)).toBe(false);
    });

    test('returns true when never notified but nextScheduledAt has passed', () => {
        const schedule = mockSchedule({
            lastNotifiedAt: null,
            nextScheduledAt: estDate(2026, 3, 2, 5, 0),
        });
        const now = estDate(2026, 3, 5, 10, 0);
        expect(TagScheduleService._hasMissedRun(schedule, now)).toBe(true);
    });
});

describe('TagScheduleService - calculateNextScheduledTime', () => {

    test('WEEKLY: next Monday from current Monday', () => {
        const schedule = mockSchedule({
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
        });
        const fromDate = estDate(2026, 3, 9, 5, 0); // Monday Mar 9
        const next = TagScheduleService.calculateNextScheduledTime(schedule, fromDate);
        expect(next.getDay()).toBe(1); // Monday
        expect(next.getDate()).toBe(16); // Mar 16
        expect(next.getHours()).toBe(5);
    });

    test('MONTHLY: next month same day', () => {
        const schedule = mockSchedule({
            frequencyType: 'monthly',
            dayOfMonth: 1,
            timeOfDay: '08:00',
        });
        const fromDate = estDate(2026, 3, 1, 8, 0); // Mar 1
        const next = TagScheduleService.calculateNextScheduledTime(schedule, fromDate);
        expect(next.getMonth()).toBe(3); // April (0-indexed)
        expect(next.getDate()).toBe(1);
    });

    test('BIWEEKLY: next bi-weekly Monday', () => {
        const schedule = mockSchedule({
            frequencyType: 'biweekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            biweeklyStartDate: '2026-01-19',
        });
        // From Mar 2 (on-week), next should be Mar 16 (skip Mar 9 off-week)
        const fromDate = estDate(2026, 3, 2, 5, 0);
        const next = TagScheduleService.calculateNextScheduledTime(schedule, fromDate);
        expect(next.getDay()).toBe(1); // Monday
        expect(next.getDate()).toBe(16); // Mar 16
    });
});
