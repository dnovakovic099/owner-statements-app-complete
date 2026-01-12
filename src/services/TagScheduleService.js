const { Op } = require('sequelize');
const TagSchedule = require('../models/TagSchedule');
const TagNotification = require('../models/TagNotification');
const Listing = require('../models/Listing');

// Lazy load to avoid circular dependency
let ListingGroupService = null;
const getListingGroupService = () => {
    if (!ListingGroupService) {
        ListingGroupService = require('./ListingGroupService');
    }
    return ListingGroupService;
};

class TagScheduleService {
    constructor() {
        this.checkInterval = null;
        this.CHECK_INTERVAL_MS = 60000; // Check every minute
        this.TIMEZONE = 'America/New_York'; // Always use EST/EDT
    }

    /**
     * Get current time in EST/EDT timezone
     */
    getESTTime() {
        return new Date(new Date().toLocaleString('en-US', { timeZone: this.TIMEZONE }));
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
     * Always uses EST/EDT timezone
     */
    async checkSchedules() {
        try {
            const now = this.getESTTime(); // Always use EST

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

        // Check if today is in the skip dates list
        const skipDates = schedule.skipDates || [];
        if (skipDates.length > 0) {
            const todayStr = this.formatDateYMD(now);
            if (skipDates.includes(todayStr)) {
                console.log(`[TagScheduleService] Skipping schedule "${schedule.tagName}" - date ${todayStr} is in skip list`);
                return false;
            }
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
     * Format date as YYYY-MM-DD
     */
    formatDateYMD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Trigger a notification for a schedule and auto-generate draft statements for groups AND individual listings
     */
    async triggerNotification(schedule, now) {
        try {
            // Count listings with this tag
            const listings = await this.getListingsWithTag(schedule.tagName);
            const listingCount = listings.length;

            // Auto-generate draft statements for groups with this tag
            const groupResults = await this.autoGenerateGroupStatements(schedule.tagName, schedule);

            // Auto-generate draft statements for individual (non-grouped) listings with this tag
            const individualResults = await this.autoGenerateIndividualStatements(schedule.tagName, schedule);

            // Create notification
            const totalGenerated = groupResults.generated + individualResults.generated;
            const notification = await TagNotification.create({
                tagName: schedule.tagName,
                scheduleId: schedule.id,
                message: `Reminder: It's time to send emails for "${schedule.tagName}" (${listingCount} listings, ${groupResults.generated} group drafts, ${individualResults.generated} individual drafts auto-generated)`,
                status: 'unread',
                listingCount,
                scheduledFor: now
            });

            // Update schedule's lastNotifiedAt
            await schedule.update({
                lastNotifiedAt: now,
                nextScheduledAt: this.calculateNextScheduledTime(schedule, now)
            });

            console.log(`[TagScheduleService] Created notification for tag "${schedule.tagName}" - ${listingCount} listings, ${groupResults.generated} group drafts, ${individualResults.generated} individual drafts`);

            return notification;
        } catch (error) {
            console.error(`[TagScheduleService] Error triggering notification for ${schedule.tagName}:`, error);
            throw error;
        }
    }

    /**
     * Auto-generate draft statements for all groups with the given tag
     */
    async autoGenerateGroupStatements(tagName, schedule) {
        const results = { generated: 0, skipped: 0, errors: 0, groups: [] };

        try {
            const groupService = getListingGroupService();
            const groups = await groupService.getGroupsByTag(tagName);

            if (groups.length === 0) {
                console.log(`[TagScheduleService] No groups found with tag "${tagName}"`);
                return results;
            }

            console.log(`[TagScheduleService] Found ${groups.length} groups with tag "${tagName}", generating draft statements...`);

            // Calculate date range based on tag
            const dateRange = this.calculateDateRangeForTag(tagName);

            // Lazy load statement generation
            const StatementService = require('./StatementService');

            for (const group of groups) {
                try {
                    // Get group details with member listings
                    const groupDetails = await groupService.getGroupById(group.id);

                    if (!groupDetails.members || groupDetails.members.length === 0) {
                        console.log(`[TagScheduleService] Skipping group "${group.name}" - no member listings`);
                        continue;
                    }

                    // Generate combined draft statement for the group
                    const statement = await StatementService.generateGroupStatement({
                        groupId: group.id,
                        groupName: group.name,
                        listingIds: groupDetails.members.map(m => m.id),
                        startDate: dateRange.start,
                        endDate: dateRange.end,
                        calculationType: group.calculationType || 'checkout'
                    });

                    // Check if statement was skipped (duplicate)
                    if (statement?.skipped) {
                        results.skipped++;
                        console.log(`[TagScheduleService] Skipped group "${group.name}" - statement already exists (ID: ${statement.existingId})`);
                        continue;
                    }

                    results.generated++;
                    results.groups.push({
                        groupId: group.id,
                        groupName: group.name,
                        statementId: statement?.id
                    });

                    console.log(`[TagScheduleService] Generated draft statement for group "${group.name}" (ID: ${group.id})`);
                } catch (groupError) {
                    console.error(`[TagScheduleService] Error generating statement for group "${group.name}":`, groupError.message);
                    results.errors++;
                }
            }

            console.log(`[TagScheduleService] Auto-generation complete: ${results.generated} drafts created, ${results.errors} errors`);
        } catch (error) {
            console.error('[TagScheduleService] Error in autoGenerateGroupStatements:', error);
        }

        return results;
    }

    /**
     * Auto-generate draft statements for individual (non-grouped) listings with the given tag
     */
    async autoGenerateIndividualStatements(tagName, schedule) {
        const results = { generated: 0, skipped: 0, errors: 0, listings: [] };

        try {
            // Get all listings with this tag that are NOT in any group
            // Use case-insensitive matching with ILIKE for PostgreSQL
            const listings = await Listing.findAll({
                where: {
                    isActive: true,
                    groupId: null, // Only non-grouped listings
                    tags: {
                        [Op.or]: [
                            { [Op.iLike]: tagName },
                            { [Op.iLike]: `${tagName},%` },
                            { [Op.iLike]: `%,${tagName}` },
                            { [Op.iLike]: `%,${tagName},%` }
                        ]
                    }
                }
            });

            if (listings.length === 0) {
                console.log(`[TagScheduleService] No non-grouped listings found with tag "${tagName}"`);
                return results;
            }

            console.log(`[TagScheduleService] Found ${listings.length} non-grouped listings with tag "${tagName}", generating draft statements...`);

            // Calculate date range based on tag
            const dateRange = this.calculateDateRangeForTag(tagName);

            // Lazy load statement generation
            const StatementService = require('./StatementService');

            for (const listing of listings) {
                try {
                    // Generate individual draft statement
                    const statement = await StatementService.generateIndividualStatement({
                        listingId: listing.id,
                        startDate: dateRange.start,
                        endDate: dateRange.end,
                        calculationType: schedule.calculationType || 'checkout'
                    });

                    // Check if statement was skipped (duplicate)
                    if (statement?.skipped) {
                        results.skipped++;
                        console.log(`[TagScheduleService] Skipped listing "${listing.displayName || listing.name}" - statement already exists (ID: ${statement.existingId})`);
                        continue;
                    }

                    results.generated++;
                    results.listings.push({
                        listingId: listing.id,
                        listingName: listing.displayName || listing.name,
                        statementId: statement?.id
                    });

                    console.log(`[TagScheduleService] Generated draft statement for listing "${listing.displayName || listing.name}" (ID: ${listing.id})`);
                } catch (listingError) {
                    console.error(`[TagScheduleService] Error generating statement for listing "${listing.name}":`, listingError.message);
                    results.errors++;
                }
            }

            console.log(`[TagScheduleService] Individual auto-generation complete: ${results.generated} drafts created, ${results.errors} errors`);
        } catch (error) {
            console.error('[TagScheduleService] Error in autoGenerateIndividualStatements:', error);
        }

        return results;
    }

    /**
     * Calculate date range for a given tag (Monday to Monday for weekly, etc.)
     * Always uses EST timezone for consistency
     */
    calculateDateRangeForTag(tagName) {
        // Use EST time for consistent date calculations
        const today = this.getESTTime();
        const dayOfWeek = today.getDay(); // 0 = Sunday

        const upperTag = tagName.toUpperCase();

        // Helper to format date as YYYY-MM-DD without timezone conversion
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        if (upperTag.includes('WEEKLY') && !upperTag.includes('BI')) {
            // WEEKLY: Monday to Monday
            const lastMonday = new Date(today);
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            lastMonday.setDate(today.getDate() - daysToMonday);

            const prevMonday = new Date(lastMonday);
            prevMonday.setDate(lastMonday.getDate() - 7);

            return {
                start: formatDate(prevMonday),
                end: formatDate(lastMonday)
            };
        } else if (upperTag.includes('BI-WEEKLY') || upperTag.includes('BIWEEKLY')) {
            // BI-WEEKLY: Monday to Monday (14 days)
            const lastMonday = new Date(today);
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            lastMonday.setDate(today.getDate() - daysToMonday);

            const twoWeeksAgo = new Date(lastMonday);
            twoWeeksAgo.setDate(lastMonday.getDate() - 14);

            return {
                start: formatDate(twoWeeksAgo),
                end: formatDate(lastMonday)
            };
        } else {
            // MONTHLY: Last month (1st to last day)
            const year = today.getFullYear();
            const month = today.getMonth(); // Current month (0-indexed)

            // First day of last month
            const firstOfLastMonth = new Date(year, month - 1, 1);
            // Last day of last month (day 0 of current month)
            const lastOfLastMonth = new Date(year, month, 0);

            return {
                start: formatDate(firstOfLastMonth),
                end: formatDate(lastOfLastMonth)
            };
        }
    }

    /**
     * Get all listings with a specific tag (case-insensitive)
     */
    async getListingsWithTag(tagName) {
        const listings = await Listing.findAll({
            where: {
                isActive: true,
                tags: {
                    [Op.or]: [
                        { [Op.iLike]: tagName },
                        { [Op.iLike]: `${tagName},%` },
                        { [Op.iLike]: `%,${tagName}` },
                        { [Op.iLike]: `%,${tagName},%` }
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

    // === Period Config Methods ===

    /**
     * Get all period configs (for all tags)
     * Returns configs for tags that have period settings
     */
    async getAllPeriodConfigs() {
        const schedules = await TagSchedule.findAll({
            attributes: ['tagName', 'periodDays', 'calculationType', 'templateId']
        });

        // Convert to a map of tagName -> config
        const configs = {};
        for (const schedule of schedules) {
            configs[schedule.tagName] = {
                prefix: schedule.tagName,
                days: schedule.periodDays || this.getDefaultDaysForTag(schedule.tagName),
                calculationType: schedule.calculationType || 'checkout',
                templateId: schedule.templateId || null
            };
        }
        return configs;
    }

    /**
     * Update period config for a specific tag
     * Creates the schedule if it doesn't exist
     */
    async updatePeriodConfig(tagName, { periodDays, calculationType, templateId }) {
        let schedule = await TagSchedule.findOne({
            where: { tagName }
        });

        if (schedule) {
            // Update existing
            await schedule.update({
                periodDays: periodDays !== undefined ? periodDays : schedule.periodDays,
                calculationType: calculationType !== undefined ? calculationType : schedule.calculationType,
                templateId: templateId !== undefined ? templateId : schedule.templateId
            });
        } else {
            // Create new schedule with period config
            schedule = await TagSchedule.create({
                tagName,
                frequencyType: this.getFrequencyTypeForTag(tagName),
                isEnabled: true,
                periodDays: periodDays || this.getDefaultDaysForTag(tagName),
                calculationType: calculationType || 'checkout',
                templateId: templateId || null
            });
        }

        return {
            prefix: schedule.tagName,
            days: schedule.periodDays || this.getDefaultDaysForTag(schedule.tagName),
            calculationType: schedule.calculationType || 'checkout',
            templateId: schedule.templateId || null
        };
    }

    /**
     * Get default days for a tag based on its name
     */
    getDefaultDaysForTag(tagName) {
        const upperTag = (tagName || '').toUpperCase();
        if (upperTag.includes('WEEKLY') && !upperTag.includes('BI')) return 7;
        if (upperTag.includes('BI-WEEKLY') || upperTag.includes('BIWEEKLY')) return 14;
        if (upperTag.includes('MONTHLY')) return 30;
        return 14; // Default
    }

    /**
     * Get frequency type for a tag based on its name
     */
    getFrequencyTypeForTag(tagName) {
        const upperTag = (tagName || '').toUpperCase();
        if (upperTag.includes('WEEKLY') && !upperTag.includes('BI')) return 'weekly';
        if (upperTag.includes('BI-WEEKLY') || upperTag.includes('BIWEEKLY')) return 'biweekly';
        return 'monthly';
    }
}

// Export singleton instance
module.exports = new TagScheduleService();
