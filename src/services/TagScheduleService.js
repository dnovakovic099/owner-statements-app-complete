const { Op } = require('sequelize');
const TagSchedule = require('../models/TagSchedule');
const TagNotification = require('../models/TagNotification');
const Listing = require('../models/Listing');

class TagScheduleService {
    constructor() {
        this.checkInterval = null;
        this.CHECK_INTERVAL_MS = 60000; // Check every minute
    }

    /**
     * Start the schedule checker
     */
    start() {
        console.log('[TagScheduleService] Starting schedule checker...');
        // Run immediately on start
        this.checkSchedules();
        // Then run every minute
        this.checkInterval = setInterval(() => {
            this.checkSchedules();
        }, this.CHECK_INTERVAL_MS);
    }

    /**
     * Stop the schedule checker
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('[TagScheduleService] Schedule checker stopped');
        }
    }

    /**
     * Check all schedules and create notifications for due ones
     */
    async checkSchedules() {
        try {
            const now = new Date();

            // Get all enabled schedules
            const schedules = await TagSchedule.findAll({
                where: { isEnabled: true }
            });

            for (const schedule of schedules) {
                const isDue = await this.isScheduleDue(schedule, now);

                if (isDue) {
                    await this.triggerNotification(schedule, now);
                }
            }
        } catch (error) {
            console.error('[TagScheduleService] Error checking schedules:', error);
        }
    }

    /**
     * Check if a schedule is due to trigger
     */
    async isScheduleDue(schedule, now) {
        // If never notified, check if current time matches
        // If previously notified, check if enough time has passed

        const lastNotified = schedule.lastNotifiedAt;
        const [scheduleHour, scheduleMinute] = schedule.timeOfDay.split(':').map(Number);

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDay = now.getDay(); // 0 = Sunday
        const currentDate = now.getDate();
        const currentWeek = this.getWeekNumber(now);

        // Check if time matches (within the same minute)
        if (currentHour !== scheduleHour || currentMinute !== scheduleMinute) {
            return false;
        }

        // Check if already notified today for this time slot
        if (lastNotified) {
            const lastNotifiedDate = new Date(lastNotified);
            const sameDay = lastNotifiedDate.toDateString() === now.toDateString();
            const sameHour = lastNotifiedDate.getHours() === currentHour;
            const sameMinute = lastNotifiedDate.getMinutes() === currentMinute;

            if (sameDay && sameHour && sameMinute) {
                return false; // Already notified for this time slot
            }
        }

        // Check frequency type
        switch (schedule.frequencyType) {
            case 'weekly':
                return currentDay === schedule.dayOfWeek;

            case 'biweekly':
                if (currentDay !== schedule.dayOfWeek) return false;
                // A = odd weeks, B = even weeks
                const isOddWeek = currentWeek % 2 === 1;
                if (schedule.biweeklyWeek === 'A') return isOddWeek;
                if (schedule.biweeklyWeek === 'B') return !isOddWeek;
                return false;

            case 'monthly':
                return currentDate === schedule.dayOfMonth;

            default:
                return false;
        }
    }

    /**
     * Get ISO week number
     */
    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Trigger a notification for a schedule
     */
    async triggerNotification(schedule, now) {
        try {
            // Count listings with this tag
            const listings = await this.getListingsWithTag(schedule.tagName);
            const listingCount = listings.length;

            // Create notification
            const notification = await TagNotification.create({
                tagName: schedule.tagName,
                scheduleId: schedule.id,
                message: `Reminder: It's time to send emails for "${schedule.tagName}" (${listingCount} listings)`,
                status: 'unread',
                listingCount,
                scheduledFor: now
            });

            // Update schedule's lastNotifiedAt
            await schedule.update({
                lastNotifiedAt: now,
                nextScheduledAt: this.calculateNextScheduledTime(schedule, now)
            });

            console.log(`[TagScheduleService] Created notification for tag "${schedule.tagName}" - ${listingCount} listings`);

            return notification;
        } catch (error) {
            console.error(`[TagScheduleService] Error triggering notification for ${schedule.tagName}:`, error);
            throw error;
        }
    }

    /**
     * Get all listings with a specific tag
     */
    async getListingsWithTag(tagName) {
        const listings = await Listing.findAll({
            where: {
                isActive: true,
                tags: {
                    [Op.or]: [
                        { [Op.like]: tagName },
                        { [Op.like]: `${tagName},%` },
                        { [Op.like]: `%,${tagName}` },
                        { [Op.like]: `%,${tagName},%` }
                    ]
                }
            }
        });
        return listings;
    }

    /**
     * Calculate the next scheduled time for a schedule
     */
    calculateNextScheduledTime(schedule, fromDate) {
        const [hour, minute] = schedule.timeOfDay.split(':').map(Number);
        let next = new Date(fromDate);
        next.setHours(hour, minute, 0, 0);

        switch (schedule.frequencyType) {
            case 'weekly':
                // Find next occurrence of the day
                next.setDate(next.getDate() + 1); // Start from tomorrow
                while (next.getDay() !== schedule.dayOfWeek) {
                    next.setDate(next.getDate() + 1);
                }
                break;

            case 'biweekly':
                // Find next occurrence considering bi-weekly pattern
                next.setDate(next.getDate() + 1);
                while (true) {
                    if (next.getDay() === schedule.dayOfWeek) {
                        const weekNum = this.getWeekNumber(next);
                        const isOddWeek = weekNum % 2 === 1;
                        if ((schedule.biweeklyWeek === 'A' && isOddWeek) ||
                            (schedule.biweeklyWeek === 'B' && !isOddWeek)) {
                            break;
                        }
                    }
                    next.setDate(next.getDate() + 1);
                }
                break;

            case 'monthly':
                // Find next occurrence of the day of month
                next.setMonth(next.getMonth() + 1);
                next.setDate(schedule.dayOfMonth);
                // Handle months with fewer days
                if (next.getDate() !== schedule.dayOfMonth) {
                    next.setDate(0); // Last day of previous month
                }
                break;
        }

        return next;
    }

    // === API Methods ===

    /**
     * Get all schedules
     */
    async getAllSchedules() {
        return TagSchedule.findAll({
            order: [['tagName', 'ASC']]
        });
    }

    /**
     * Get schedule by tag name
     */
    async getScheduleByTag(tagName) {
        return TagSchedule.findOne({
            where: { tagName }
        });
    }

    /**
     * Create or update a schedule for a tag
     */
    async upsertSchedule(tagName, scheduleData) {
        const existing = await this.getScheduleByTag(tagName);

        if (existing) {
            await existing.update({
                ...scheduleData,
                nextScheduledAt: this.calculateNextScheduledTime({ ...existing.toJSON(), ...scheduleData }, new Date())
            });
            return existing.reload();
        } else {
            const schedule = await TagSchedule.create({
                tagName,
                ...scheduleData,
                nextScheduledAt: this.calculateNextScheduledTime({ tagName, ...scheduleData }, new Date())
            });
            return schedule;
        }
    }

    /**
     * Delete a schedule
     */
    async deleteSchedule(tagName) {
        const schedule = await this.getScheduleByTag(tagName);
        if (schedule) {
            await schedule.destroy();
            return true;
        }
        return false;
    }

    /**
     * Get all unread notifications
     */
    async getUnreadNotifications() {
        return TagNotification.findAll({
            where: { status: 'unread' },
            order: [['scheduledFor', 'DESC']]
        });
    }

    /**
     * Get all notifications (with optional status filter)
     */
    async getNotifications(status = null, limit = 50) {
        const where = status ? { status } : {};
        return TagNotification.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit
        });
    }

    /**
     * Mark notification as read
     */
    async markNotificationRead(notificationId) {
        const notification = await TagNotification.findByPk(notificationId);
        if (notification) {
            await notification.update({
                status: 'read',
                readAt: new Date()
            });
        }
        return notification;
    }

    /**
     * Mark notification as actioned (user clicked through)
     */
    async markNotificationActioned(notificationId) {
        const notification = await TagNotification.findByPk(notificationId);
        if (notification) {
            await notification.update({
                status: 'actioned',
                actionedAt: new Date()
            });
        }
        return notification;
    }

    /**
     * Dismiss a notification
     */
    async dismissNotification(notificationId) {
        const notification = await TagNotification.findByPk(notificationId);
        if (notification) {
            await notification.update({ status: 'dismissed' });
        }
        return notification;
    }

    /**
     * Get notification count
     */
    async getNotificationCount() {
        return TagNotification.count({
            where: { status: 'unread' }
        });
    }
}

// Export singleton instance
module.exports = new TagScheduleService();
