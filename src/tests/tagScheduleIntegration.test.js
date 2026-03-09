/**
 * Integration tests for TagScheduleService catch-up logic.
 *
 * Creates REAL schedules in the database (SQLite), simulates missed runs,
 * and verifies the scheduler triggers correctly for ALL schedule types:
 * WEEKLY, BI-WEEKLY, MONTHLY, and custom.
 */

const TagSchedule = require('../models/TagSchedule');
const TagNotification = require('../models/TagNotification');
const sequelize = require('../config/database');
const TagScheduleService = require('../services/TagScheduleService');

// Override getESTTime and auto-generation to control test behavior
let mockNow = null;
const originalGetESTTime = TagScheduleService.getESTTime.bind(TagScheduleService);
const originalAutoGenerateGroup = TagScheduleService.autoGenerateGroupStatements.bind(TagScheduleService);
const originalAutoGenerateIndividual = TagScheduleService.autoGenerateIndividualStatements.bind(TagScheduleService);
const originalGetListingsWithTag = TagScheduleService.getListingsWithTag.bind(TagScheduleService);

beforeAll(async () => {
    // Sync DB (creates tables in SQLite)
    await sequelize.sync({ force: true });

    // Mock getESTTime to return controlled time
    TagScheduleService.getESTTime = () => {
        if (mockNow) return new Date(mockNow);
        return originalGetESTTime();
    };

    // Mock auto-generation to avoid needing real listings/Hostify
    TagScheduleService.autoGenerateGroupStatements = async (tagName) => {
        return { generated: 0, skipped: 0, errors: 0, groups: [] };
    };
    TagScheduleService.autoGenerateIndividualStatements = async (tagName) => {
        return { generated: 0, skipped: 0, errors: 0, listings: [] };
    };
    TagScheduleService.getListingsWithTag = async (tagName) => {
        return []; // No real listings needed
    };
});

afterAll(async () => {
    // Restore originals
    TagScheduleService.getESTTime = originalGetESTTime;
    TagScheduleService.autoGenerateGroupStatements = originalAutoGenerateGroup;
    TagScheduleService.autoGenerateIndividualStatements = originalAutoGenerateIndividual;
    TagScheduleService.getListingsWithTag = originalGetListingsWithTag;
    await sequelize.close();
});

beforeEach(async () => {
    // Clean tables before each test
    await TagNotification.destroy({ where: {} });
    await TagSchedule.destroy({ where: {} });
    mockNow = null;
});

// Helper: create a Date for EST values
function est(year, month, day, hour = 0, minute = 0) {
    return new Date(year, month - 1, day, hour, minute, 0);
}

describe('WEEKLY schedule - full DB integration', () => {

    test('creates schedule, misses run, catches up on next check', async () => {
        // 1. Create a WEEKLY schedule (every Monday at 5:00 AM)
        const schedule = await TagSchedule.create({
            tagName: 'TEST-WEEKLY',
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '05:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 23, 5, 0), // Last ran Feb 23 (Monday)
            nextScheduledAt: est(2026, 3, 2, 5, 0),  // Was supposed to run Mar 2
        });

        // 2. Simulate: it's now March 4 (Wednesday) — the Mar 2 run was MISSED
        mockNow = est(2026, 3, 4, 10, 0);

        // 3. Run the full checkSchedules
        await TagScheduleService.checkSchedules();

        // 4. Verify: a notification was created (catch-up fired)
        const notifications = await TagNotification.findAll({ where: { tagName: 'TEST-WEEKLY' } });
        expect(notifications.length).toBe(1);
        expect(notifications[0].tagName).toBe('TEST-WEEKLY');

        // 5. Verify: lastNotifiedAt was updated
        const updated = await TagSchedule.findByPk(schedule.id);
        expect(updated.lastNotifiedAt).not.toBeNull();

        // 6. Verify: nextScheduledAt was recalculated to the future
        expect(new Date(updated.nextScheduledAt).getTime()).toBeGreaterThan(mockNow.getTime());
    });

    test('does NOT double-fire on second check after catch-up', async () => {
        // Create schedule with missed run
        await TagSchedule.create({
            tagName: 'TEST-WEEKLY-2',
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 23, 5, 0),
            nextScheduledAt: est(2026, 3, 2, 5, 0),
        });

        // First check — catches up
        mockNow = est(2026, 3, 4, 10, 0);
        await TagScheduleService.checkSchedules();

        const notifs1 = await TagNotification.findAll({ where: { tagName: 'TEST-WEEKLY-2' } });
        expect(notifs1.length).toBe(1);

        // Second check — same day, should NOT fire again
        mockNow = est(2026, 3, 4, 10, 5);
        await TagScheduleService.checkSchedules();

        const notifs2 = await TagNotification.findAll({ where: { tagName: 'TEST-WEEKLY-2' } });
        expect(notifs2.length).toBe(1); // Still 1, not 2
    });

    test('fires normally on correct day when not missed', async () => {
        await TagSchedule.create({
            tagName: 'TEST-WEEKLY-NORMAL',
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '05:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 3, 2, 5, 0),  // Ran last Monday
            nextScheduledAt: est(2026, 3, 9, 5, 0),  // Next is this Monday
        });

        // It's Monday March 9 at 5:15 AM — should fire normally
        mockNow = est(2026, 3, 9, 5, 15);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-WEEKLY-NORMAL' } });
        expect(notifs.length).toBe(1);
    });
});

describe('BI-WEEKLY schedule - full DB integration', () => {

    test('creates biweekly schedule, misses run, catches up', async () => {
        // BI-WEEKLY: every other Monday starting from Jan 19
        // Jan 19 (wk 0), Feb 2 (wk 2), Feb 16 (wk 4), Mar 2 (wk 6), Mar 16 (wk 8)
        await TagSchedule.create({
            tagName: 'TEST-BIWEEKLY',
            frequencyType: 'biweekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            isEnabled: true,
            biweeklyStartDate: '2026-01-19',
            lastNotifiedAt: est(2026, 2, 16, 5, 0),  // Last ran Feb 16
            nextScheduledAt: est(2026, 3, 2, 5, 0),   // Mar 2 was scheduled
        });

        // It's March 5 (Thursday) — missed Mar 2
        mockNow = est(2026, 3, 5, 10, 0);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-BIWEEKLY' } });
        expect(notifs.length).toBe(1);

        // Verify next run is recalculated
        const updated = await TagSchedule.findOne({ where: { tagName: 'TEST-BIWEEKLY' } });
        const nextRun = new Date(updated.nextScheduledAt);
        expect(nextRun.getTime()).toBeGreaterThan(mockNow.getTime());
    });

    test('biweekly does NOT fire on off-week', async () => {
        await TagSchedule.create({
            tagName: 'TEST-BIWEEKLY-OFF',
            frequencyType: 'biweekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            isEnabled: true,
            biweeklyStartDate: '2026-01-19',
            lastNotifiedAt: est(2026, 3, 2, 5, 0),   // Last ran Mar 2 (on-week)
            nextScheduledAt: est(2026, 3, 16, 5, 0),  // Next is Mar 16 (on-week)
        });

        // Mar 9 is an off-week Monday, and nextScheduledAt is still in the future
        mockNow = est(2026, 3, 9, 5, 30);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-BIWEEKLY-OFF' } });
        expect(notifs.length).toBe(0); // Should NOT fire
    });
});

describe('MONTHLY schedule - full DB integration', () => {

    test('creates monthly schedule, misses the 1st, catches up on the 3rd', async () => {
        await TagSchedule.create({
            tagName: 'TEST-MONTHLY',
            frequencyType: 'monthly',
            dayOfMonth: 1,
            timeOfDay: '09:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 1, 9, 0),   // Last ran Feb 1
            nextScheduledAt: est(2026, 3, 1, 9, 0),   // Mar 1 was scheduled
        });

        // It's March 3 — missed March 1
        mockNow = est(2026, 3, 3, 10, 0);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-MONTHLY' } });
        expect(notifs.length).toBe(1);

        // Verify next run is April 1
        const updated = await TagSchedule.findOne({ where: { tagName: 'TEST-MONTHLY' } });
        const nextRun = new Date(updated.nextScheduledAt);
        expect(nextRun.getMonth()).toBe(3); // April (0-indexed)
        expect(nextRun.getDate()).toBe(1);
    });

    test('monthly fires on correct day', async () => {
        await TagSchedule.create({
            tagName: 'TEST-MONTHLY-ONTIME',
            frequencyType: 'monthly',
            dayOfMonth: 9,
            timeOfDay: '08:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 9, 8, 0),   // Last ran Feb 9
            nextScheduledAt: est(2026, 3, 9, 8, 0),   // Today
        });

        // It's March 9 at 8:30 AM
        mockNow = est(2026, 3, 9, 8, 30);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-MONTHLY-ONTIME' } });
        expect(notifs.length).toBe(1);
    });

    test('monthly does NOT fire on wrong day (no missed run)', async () => {
        await TagSchedule.create({
            tagName: 'TEST-MONTHLY-WRONG',
            frequencyType: 'monthly',
            dayOfMonth: 15,
            timeOfDay: '08:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 15, 8, 0),
            nextScheduledAt: est(2026, 3, 15, 8, 0), // Still in the future
        });

        // March 9 — not the 15th, and nextScheduledAt is in the future
        mockNow = est(2026, 3, 9, 10, 0);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-MONTHLY-WRONG' } });
        expect(notifs.length).toBe(0);
    });
});

describe('Custom "OK" schedule - full DB integration', () => {

    test('custom weekly schedule catches up after being missed', async () => {
        // The "OK" schedule from the screenshot: Every Monday at 8:00 AM
        await TagSchedule.create({
            tagName: 'OK',
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '08:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 17, 8, 0),  // Last ran Feb 17
            nextScheduledAt: est(2026, 2, 23, 9, 54), // Next was Feb 23 (from screenshot)
        });

        // Today is March 9 — missed Feb 23, Mar 2, Mar 9 all passed
        mockNow = est(2026, 3, 9, 10, 0);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'OK' } });
        expect(notifs.length).toBe(1); // Should catch up

        // Verify it updated
        const updated = await TagSchedule.findOne({ where: { tagName: 'OK' } });
        expect(updated.lastNotifiedAt).not.toBeNull();
        expect(new Date(updated.nextScheduledAt).getTime()).toBeGreaterThan(mockNow.getTime());
    });
});

describe('ALL schedules from screenshot - simultaneous catch-up', () => {

    test('all 4 stale schedules catch up in a single checkSchedules call', async () => {
        // Recreate exact state from screenshot (today is March 9, 2026)

        // BI-WEEKLY: Next run was Feb 17 (missed!)
        await TagSchedule.create({
            tagName: 'BI-WEEKLY-SIM',
            frequencyType: 'biweekly',
            dayOfWeek: 3, // Wednesday
            timeOfDay: '13:00',
            isEnabled: true,
            biweeklyStartDate: '2026-01-19',
            lastNotifiedAt: est(2026, 2, 3, 13, 0),
            nextScheduledAt: est(2026, 2, 17, 2, 30), // Feb 17 — missed
        });

        // MONTHLY: Next run was Mar 1 (missed!)
        await TagSchedule.create({
            tagName: 'MONTHLY-SIM',
            frequencyType: 'monthly',
            dayOfMonth: 1,
            timeOfDay: '09:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 1, 9, 0),
            nextScheduledAt: est(2026, 3, 1, 3, 30), // Mar 1 — missed
        });

        // OK: Next run was Feb 23 (missed!)
        await TagSchedule.create({
            tagName: 'OK-SIM',
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '08:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 17, 8, 0),
            nextScheduledAt: est(2026, 2, 23, 9, 54), // Feb 23 — missed
        });

        // WEEKLY: Next run was Feb 11 (missed!)
        await TagSchedule.create({
            tagName: 'WEEKLY-SIM',
            frequencyType: 'weekly',
            dayOfWeek: 3, // Wednesday
            timeOfDay: '12:49',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 4, 12, 49),
            nextScheduledAt: est(2026, 2, 11, 6, 53), // Feb 11 — missed
        });

        // Simulate: March 9 at 12:00 PM
        mockNow = est(2026, 3, 9, 12, 0);
        await TagScheduleService.checkSchedules();

        // ALL 4 should have caught up
        const biweeklyNotifs = await TagNotification.findAll({ where: { tagName: 'BI-WEEKLY-SIM' } });
        const monthlyNotifs = await TagNotification.findAll({ where: { tagName: 'MONTHLY-SIM' } });
        const okNotifs = await TagNotification.findAll({ where: { tagName: 'OK-SIM' } });
        const weeklyNotifs = await TagNotification.findAll({ where: { tagName: 'WEEKLY-SIM' } });

        expect(biweeklyNotifs.length).toBe(1);
        expect(monthlyNotifs.length).toBe(1);
        expect(okNotifs.length).toBe(1);
        expect(weeklyNotifs.length).toBe(1);

        // Verify ALL have future nextScheduledAt
        const allSchedules = await TagSchedule.findAll();
        for (const sched of allSchedules) {
            const nextRun = new Date(sched.nextScheduledAt);
            expect(nextRun.getTime()).toBeGreaterThan(mockNow.getTime());
        }
    });

    test('second check after full catch-up does NOT re-fire any', async () => {
        // Same setup as above
        await TagSchedule.create({
            tagName: 'NO-DOUBLE-1',
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 23, 5, 0),
            nextScheduledAt: est(2026, 3, 2, 5, 0),
        });

        await TagSchedule.create({
            tagName: 'NO-DOUBLE-2',
            frequencyType: 'monthly',
            dayOfMonth: 1,
            timeOfDay: '09:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 2, 1, 9, 0),
            nextScheduledAt: est(2026, 3, 1, 9, 0),
        });

        // First check — both catch up
        mockNow = est(2026, 3, 9, 12, 0);
        await TagScheduleService.checkSchedules();

        let notifs1 = await TagNotification.count({ where: { tagName: 'NO-DOUBLE-1' } });
        let notifs2 = await TagNotification.count({ where: { tagName: 'NO-DOUBLE-2' } });
        expect(notifs1).toBe(1);
        expect(notifs2).toBe(1);

        // Second check — 5 minutes later, same day
        mockNow = est(2026, 3, 9, 12, 5);
        await TagScheduleService.checkSchedules();

        notifs1 = await TagNotification.count({ where: { tagName: 'NO-DOUBLE-1' } });
        notifs2 = await TagNotification.count({ where: { tagName: 'NO-DOUBLE-2' } });
        expect(notifs1).toBe(1); // Still 1
        expect(notifs2).toBe(1); // Still 1
    });
});

describe('Disabled schedule', () => {

    test('disabled schedule does NOT fire even if overdue', async () => {
        await TagSchedule.create({
            tagName: 'TEST-DISABLED',
            frequencyType: 'weekly',
            dayOfWeek: 1,
            timeOfDay: '05:00',
            isEnabled: false, // DISABLED
            lastNotifiedAt: est(2026, 2, 23, 5, 0),
            nextScheduledAt: est(2026, 3, 2, 5, 0),
        });

        mockNow = est(2026, 3, 9, 12, 0);
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-DISABLED' } });
        expect(notifs.length).toBe(0);
    });
});

describe('Skip dates', () => {

    test('schedule with skip date for today does NOT fire', async () => {
        await TagSchedule.create({
            tagName: 'TEST-SKIP',
            frequencyType: 'weekly',
            dayOfWeek: 1, // Monday
            timeOfDay: '05:00',
            isEnabled: true,
            lastNotifiedAt: est(2026, 3, 2, 5, 0),
            nextScheduledAt: est(2026, 3, 9, 5, 0),
            skipDates: ['2026-03-09'], // Skip today
        });

        mockNow = est(2026, 3, 9, 5, 30); // Monday Mar 9
        await TagScheduleService.checkSchedules();

        const notifs = await TagNotification.findAll({ where: { tagName: 'TEST-SKIP' } });
        expect(notifs.length).toBe(0);
    });
});
