const { Op } = require('sequelize');
const TagSchedule = require('../models/TagSchedule');
const TagNotification = require('../models/TagNotification');
const Listing = require('../models/Listing');
const logger = require('../utils/logger');

// Lazy load to avoid circular dependency
let ListingGroupService = null;
const getListingGroupService = () => {
    if (!ListingGroupService) {
        ListingGroupService = require('./ListingGroupService');
    }
    return ListingGroupService;
};

// Lazy load Statement model
let Statement = null;
const getStatementModel = () => {
    if (!Statement) {
        Statement = require('../models/Statement');
    }
    return Statement;
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
        logger.info('[TagScheduleService] Starting schedule checker...');
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
            logger.info('[TagScheduleService] Schedule checker stopped');
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
            logger.error('[TagScheduleService] Error checking schedules:', error);
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
                logger.info(`[TagScheduleService] Skipping schedule "${schedule.tagName}" - date ${todayStr} is in skip list`);
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
                // Bi-weekly runs every 2 weeks from the reference start date (Jan 19, 2026)
                // This replaces the old A/B week system
                const biweeklyStartDate = schedule.biweeklyStartDate
                    ? new Date(schedule.biweeklyStartDate)
                    : new Date('2026-01-19'); // Default reference: Jan 19, 2026
                const daysSinceStart = Math.floor((now - biweeklyStartDate) / (1000 * 60 * 60 * 24));
                const weeksSinceStart = Math.floor(daysSinceStart / 7);
                // Run on weeks 0, 2, 4, 6... (every 2 weeks)
                return weeksSinceStart >= 0 && weeksSinceStart % 2 === 0;

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
        let listingCount = 0;
        let groupResults = { generated: 0, skipped: 0, errors: 0 };
        let individualResults = { generated: 0, skipped: 0, errors: 0 };
        let hasErrors = false;
        let errorMessage = '';

        try {
            // Count listings with this tag
            const listings = await this.getListingsWithTag(schedule.tagName);
            listingCount = listings.length;
        } catch (error) {
            logger.error(`[TagScheduleService] Error getting listings for ${schedule.tagName}:`, error.message);
            hasErrors = true;
            errorMessage = 'Failed to get listings. ';
        }

        try {
            // Auto-generate draft statements for groups with this tag
            groupResults = await this.autoGenerateGroupStatements(schedule.tagName, schedule);
        } catch (error) {
            logger.error(`[TagScheduleService] Error generating group statements for ${schedule.tagName}:`, error.message);
            hasErrors = true;
            errorMessage += 'Group generation failed. ';
        }

        try {
            // Auto-generate draft statements for individual (non-grouped) listings with this tag
            individualResults = await this.autoGenerateIndividualStatements(schedule.tagName, schedule);
        } catch (error) {
            logger.error(`[TagScheduleService] Error generating individual statements for ${schedule.tagName}:`, error.message);
            hasErrors = true;
            errorMessage += 'Individual generation failed. ';
        }

        // Always create notification (even with partial failures)
        let message = `Reminder: It's time to send emails for "${schedule.tagName}" (${listingCount} listings, ${groupResults.generated} group drafts, ${individualResults.generated} individual drafts auto-generated)`;
        if (hasErrors) {
            message += ` [Warnings: ${errorMessage.trim()}]`;
        }
        if (groupResults.errors > 0 || individualResults.errors > 0) {
            message += ` [${groupResults.errors + individualResults.errors} generation errors]`;
        }

        try {
            const notification = await TagNotification.create({
                tagName: schedule.tagName,
                scheduleId: schedule.id,
                message,
                status: 'unread',
                listingCount,
                scheduledFor: now
            });

            // Always update lastNotifiedAt to prevent infinite retries
            await schedule.update({
                lastNotifiedAt: now,
                nextScheduledAt: this.calculateNextScheduledTime(schedule, now)
            });

            logger.info(`[TagScheduleService] Created notification for tag "${schedule.tagName}" - ${listingCount} listings, ${groupResults.generated} group drafts, ${individualResults.generated} individual drafts${hasErrors ? ' (with errors)' : ''}`);

            return notification;
        } catch (error) {
            logger.error(`[TagScheduleService] Error creating notification for ${schedule.tagName}:`, error);
            // Still try to update lastNotifiedAt to prevent infinite retries
            try {
                await schedule.update({
                    lastNotifiedAt: now,
                    nextScheduledAt: this.calculateNextScheduledTime(schedule, now)
                });
            } catch (updateError) {
                logger.error(`[TagScheduleService] Failed to update lastNotifiedAt:`, updateError.message);
            }
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
                logger.info(`[TagScheduleService] No groups found with tag "${tagName}"`);
                return results;
            }

            logger.info(`[TagScheduleService] Found ${groups.length} groups with tag "${tagName}", generating draft statements...`);

            // Calculate date range based on tag
            const dateRange = this.calculateDateRangeForTag(tagName);

            // Lazy load statement generation
            const StatementService = require('./StatementService');

            for (const group of groups) {
                try {
                    // Get group details with member listings
                    const groupDetails = await groupService.getGroupById(group.id);

                    // Filter out inactive/offboarded listings from group members
                    const activeMembers = (groupDetails.members || []).filter(m => m.isActive);
                    if (activeMembers.length === 0) {
                        logger.info(`[TagScheduleService] Skipping group "${group.name}" - no active member listings`);
                        continue;
                    }

                    // Get calculation type from the last statement for this group
                    // Falls back to group default, then to 'checkout'
                    const calculationType = await this.getLastCalculationTypeForGroup(
                        group.id,
                        group.calculationType || schedule.calculationType || 'checkout'
                    );

                    // Generate combined draft statement for the group (active members only)
                    const statement = await StatementService.generateGroupStatement({
                        groupId: group.id,
                        groupName: group.name,
                        listingIds: activeMembers.map(m => m.id),
                        startDate: dateRange.start,
                        endDate: dateRange.end,
                        calculationType
                    });

                    // Check if statement was skipped (duplicate)
                    if (statement?.skipped) {
                        results.skipped++;
                        logger.info(`[TagScheduleService] Skipped group "${group.name}" - statement already exists (ID: ${statement.existingId})`);
                        continue;
                    }

                    results.generated++;
                    results.groups.push({
                        groupId: group.id,
                        groupName: group.name,
                        statementId: statement?.id
                    });

                    logger.info(`[TagScheduleService] Generated draft statement for group "${group.name}" (ID: ${group.id})`);
                } catch (groupError) {
                    logger.error(`[TagScheduleService] Error generating statement for group "${group.name}":`, groupError.message);
                    results.errors++;
                }
            }

            logger.info(`[TagScheduleService] Auto-generation complete: ${results.generated} drafts created, ${results.errors} errors`);
        } catch (error) {
            logger.error('[TagScheduleService] Error in autoGenerateGroupStatements:', error);
        }

        return results;
    }

    /**
     * Auto-generate draft statements for individual (non-grouped) listings with the given tag.
     * Includes listings that are in groups whose group-level tags don't match the schedule tag,
     * so they aren't silently skipped by both the group and individual generation paths.
     */
    async autoGenerateIndividualStatements(tagName, schedule) {
        const results = { generated: 0, skipped: 0, errors: 0, listings: [] };

        try {
            // Get all active listings with this tag (including grouped ones)
            // We'll filter out listings whose groups already handle this tag
            const pattern = this.buildTagMatchPattern(tagName);
            const upperTag = (tagName || '').toUpperCase();

            let listings;
            if (pattern) {
                // Use pattern matching
                listings = await Listing.findAll({
                    where: {
                        isActive: true,
                        tags: { [Op.iLike]: pattern }
                    }
                });

                // For WEEKLY, filter out BI-WEEKLY matches
                if (upperTag === 'WEEKLY') {
                    listings = listings.filter(l => {
                        // l.tags is an array from Sequelize getter, join to string for comparison
                        const tagsArray = l.tags || [];
                        const tags = (Array.isArray(tagsArray) ? tagsArray.join(',') : tagsArray).toUpperCase();
                        return tags.includes('WEEKLY') && !tags.includes('BI-WEEKLY') && !tags.includes('BIWEEKLY');
                    });
                }
            } else {
                // Exact match for other tags
                listings = await Listing.findAll({
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
            }

            // Filter out listings whose groups already have this tag
            // (those are handled by autoGenerateGroupStatements)
            if (listings.some(l => l.groupId)) {
                const groupService = getListingGroupService();
                const matchedGroups = await groupService.getGroupsByTag(tagName);
                const matchedGroupIds = new Set(matchedGroups.map(g => g.id));

                listings = listings.filter(l => {
                    if (!l.groupId) return true; // Non-grouped listings always included
                    if (matchedGroupIds.has(l.groupId)) {
                        // This listing's group already handles this tag via group generation
                        logger.info(`[TagScheduleService] Skipping listing "${l.displayName || l.name}" - its group (ID: ${l.groupId}) already handles tag "${tagName}"`);
                        return false;
                    }
                    // Listing is in a group that does NOT have this tag - include for individual generation
                    logger.info(`[TagScheduleService] Including grouped listing "${l.displayName || l.name}" (group ID: ${l.groupId}) - group does not have tag "${tagName}"`);
                    return true;
                });
            }

            if (listings.length === 0) {
                logger.info(`[TagScheduleService] No eligible listings found with tag "${tagName}"`);
                return results;
            }

            logger.info(`[TagScheduleService] Found ${listings.length} eligible listings with tag "${tagName}", generating draft statements...`);

            // Calculate date range based on tag
            const dateRange = this.calculateDateRangeForTag(tagName);

            // Lazy load statement generation
            const StatementService = require('./StatementService');

            for (const listing of listings) {
                try {
                    // Get calculation type from the last statement for this listing
                    // Falls back to schedule default, then to 'checkout'
                    const calculationType = await this.getLastCalculationTypeForListing(
                        listing.id,
                        schedule.calculationType || 'checkout'
                    );

                    // Generate individual draft statement
                    const statement = await StatementService.generateIndividualStatement({
                        listingId: listing.id,
                        startDate: dateRange.start,
                        endDate: dateRange.end,
                        calculationType
                    });

                    // Check if statement was skipped (duplicate)
                    if (statement?.skipped) {
                        results.skipped++;
                        logger.info(`[TagScheduleService] Skipped listing "${listing.displayName || listing.name}" - statement already exists (ID: ${statement.existingId})`);
                        continue;
                    }

                    results.generated++;
                    results.listings.push({
                        listingId: listing.id,
                        listingName: listing.displayName || listing.name,
                        statementId: statement?.id
                    });

                    logger.info(`[TagScheduleService] Generated draft statement for listing "${listing.displayName || listing.name}" (ID: ${listing.id})`);
                } catch (listingError) {
                    logger.error(`[TagScheduleService] Error generating statement for listing "${listing.name}":`, listingError.message);
                    results.errors++;
                }
            }

            logger.info(`[TagScheduleService] Individual auto-generation complete: ${results.generated} drafts created, ${results.errors} errors`);
        } catch (error) {
            logger.error('[TagScheduleService] Error in autoGenerateIndividualStatements:', error);
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
     * Build tag matching pattern for SQL ILIKE queries
     * Uses pattern matching: WEEKLY matches any tag containing "WEEKLY" (but not BI-WEEKLY)
     * BI-WEEKLY matches any tag containing "BI-WEEKLY" (like BI-WEEKLY A, BI-WEEKLY B)
     */
    buildTagMatchPattern(tagName) {
        const upperTag = (tagName || '').toUpperCase();

        // For BI-WEEKLY, match any tag containing "BI-WEEKLY"
        if (upperTag.includes('BI-WEEKLY') || upperTag.includes('BIWEEKLY')) {
            return '%BI-WEEKLY%';
        }

        // For WEEKLY (not BI-WEEKLY), we need to match WEEKLY but exclude BI-WEEKLY
        // This is tricky with ILIKE, so we'll handle it in code after fetching
        if (upperTag === 'WEEKLY') {
            return '%WEEKLY%';
        }

        // For MONTHLY, match any tag containing "MONTHLY"
        if (upperTag.includes('MONTHLY')) {
            return '%MONTHLY%';
        }

        // Default: exact match patterns
        return null;
    }

    /**
     * Get all listings with a specific tag (case-insensitive, pattern matching)
     */
    async getListingsWithTag(tagName) {
        const pattern = this.buildTagMatchPattern(tagName);
        const upperTag = (tagName || '').toUpperCase();

        let listings;
        if (pattern) {
            // Use pattern matching
            listings = await Listing.findAll({
                where: {
                    isActive: true,
                    tags: { [Op.iLike]: pattern }
                }
            });

            // For WEEKLY, filter out BI-WEEKLY matches
            if (upperTag === 'WEEKLY') {
                listings = listings.filter(l => {
                    // l.tags is an array from Sequelize getter, join to string for comparison
                    const tagsArray = l.tags || [];
                    const tags = (Array.isArray(tagsArray) ? tagsArray.join(',') : tagsArray).toUpperCase();
                    return tags.includes('WEEKLY') && !tags.includes('BI-WEEKLY') && !tags.includes('BIWEEKLY');
                });
            }
        } else {
            // Exact match for other tags
            listings = await Listing.findAll({
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
        }
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
                // Find next occurrence using biweeklyStartDate (runs every 2 weeks from that date)
                const biweeklyStart = schedule.biweeklyStartDate
                    ? new Date(schedule.biweeklyStartDate)
                    : new Date('2026-01-19'); // Default reference date

                next.setDate(next.getDate() + 1); // Start from tomorrow
                let safetyCounter = 0;
                const maxIterations = 365; // Prevent infinite loop

                while (safetyCounter < maxIterations) {
                    safetyCounter++;
                    if (next.getDay() === schedule.dayOfWeek) {
                        // Check if this is on the bi-weekly pattern from the start date
                        const daysSinceStart = Math.floor((next - biweeklyStart) / (1000 * 60 * 60 * 24));
                        const weeksSinceStart = Math.floor(daysSinceStart / 7);
                        // Run on weeks 0, 2, 4, 6... (every 2 weeks)
                        if (weeksSinceStart >= 0 && weeksSinceStart % 2 === 0) {
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

    /**
     * Get the calculation type from the most recent statement for a group
     * Falls back to schedule default if no previous statement exists
     */
    async getLastCalculationTypeForGroup(groupId, fallback = 'checkout') {
        try {
            const StatementModel = getStatementModel();
            const lastStatement = await StatementModel.findOne({
                where: { groupId },
                order: [['created_at', 'DESC']],
                attributes: ['calculationType']
            });

            if (lastStatement && lastStatement.calculationType) {
                logger.info(`[TagScheduleService] Using last calculation type "${lastStatement.calculationType}" for group ${groupId}`);
                return lastStatement.calculationType;
            }
        } catch (error) {
            logger.error(`[TagScheduleService] Error getting last calculation type for group ${groupId}:`, error.message);
        }
        return fallback;
    }

    /**
     * Get the calculation type from the most recent statement for a listing
     * Falls back to schedule default if no previous statement exists
     */
    async getLastCalculationTypeForListing(listingId, fallback = 'checkout') {
        try {
            const StatementModel = getStatementModel();
            const lastStatement = await StatementModel.findOne({
                where: { propertyId: listingId },
                order: [['created_at', 'DESC']],
                attributes: ['calculationType']
            });

            if (lastStatement && lastStatement.calculationType) {
                logger.info(`[TagScheduleService] Using last calculation type "${lastStatement.calculationType}" for listing ${listingId}`);
                return lastStatement.calculationType;
            }
        } catch (error) {
            logger.error(`[TagScheduleService] Error getting last calculation type for listing ${listingId}:`, error.message);
        }
        return fallback;
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
