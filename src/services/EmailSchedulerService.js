/**
 * Email Scheduler Service
 *
 * Handles automated scheduled emails based on listing tags:
 * - WEEKLY: Every Monday at 9:00 AM ET
 * - BI-WEEKLY A: Monday at 9:00 AM ET (odd weeks)
 * - BI-WEEKLY B: Monday at 9:00 AM ET (even weeks)
 * - MONTHLY: 1st of each month at 9:00 AM ET
 */

const cron = require('node-cron');
const { Listing, Statement } = require('../models');
const EmailService = require('./EmailService');
const { Op } = require('sequelize');

class EmailSchedulerService {
    constructor() {
        this.jobs = {};
        this.isRunning = false;
        this.lastRun = {};
        // TEST MODE: Only send to this email address
        this.testModeEmail = 'devendravariya73@gmail.com';
        this.testModeEnabled = true; // Set to false for production
    }

    /**
     * Start all scheduled cron jobs
     */
    start() {
        // Check if scheduler is enabled via environment variable (default: disabled)
        // Set ENABLE_EMAIL_SCHEDULER=true to enable
        const isEnabled = process.env.ENABLE_EMAIL_SCHEDULER === 'true';
        if (!isEnabled) {
            console.log('[EmailScheduler] Email scheduler DISABLED (set ENABLE_EMAIL_SCHEDULER=true to enable)');
            return;
        }

        if (this.isRunning) {
            console.log('[EmailScheduler] Already running');
            return;
        }

        console.log('[EmailScheduler] Starting email scheduler...');

        // WEEKLY: Every Monday at 9:00 AM
        this.jobs.weekly = cron.schedule('0 9 * * 1', async () => {
            console.log('[EmailScheduler] Running WEEKLY email job');
            await this.sendScheduledEmails('WEEKLY');
        }, {
            scheduled: true,
            timezone: 'America/New_York'
        });

        // BI-WEEKLY A: Every Monday at 9:00 AM on ODD weeks
        this.jobs.biweeklyA = cron.schedule('0 9 * * 1', async () => {
            if (this.isBiWeeklyAWeek()) {
                console.log('[EmailScheduler] Running BI-WEEKLY A email job (odd week)');
                await this.sendScheduledEmails('BI-WEEKLY A');
            }
        }, {
            scheduled: true,
            timezone: 'America/New_York'
        });

        // BI-WEEKLY B: Every Monday at 9:00 AM on EVEN weeks
        this.jobs.biweeklyB = cron.schedule('0 9 * * 1', async () => {
            if (!this.isBiWeeklyAWeek()) {
                console.log('[EmailScheduler] Running BI-WEEKLY B email job (even week)');
                await this.sendScheduledEmails('BI-WEEKLY B');
            }
        }, {
            scheduled: true,
            timezone: 'America/New_York'
        });

        // MONTHLY: 1st of each month at 9:00 AM
        this.jobs.monthly = cron.schedule('0 9 1 * *', async () => {
            console.log('[EmailScheduler] Running MONTHLY email job');
            await this.sendScheduledEmails('MONTHLY');
        }, {
            scheduled: true,
            timezone: 'America/New_York'
        });

        this.isRunning = true;
        console.log('[EmailScheduler] Email scheduler started successfully');
        if (this.testModeEnabled) {
            console.log(`[EmailScheduler] *** TEST MODE ENABLED - All emails will be sent to: ${this.testModeEmail} ***`);
        }
        console.log('[EmailScheduler] Schedule:');
        console.log('  - WEEKLY: Every Monday at 9:00 AM ET');
        console.log('  - BI-WEEKLY A: Monday at 9:00 AM ET (odd weeks)');
        console.log('  - BI-WEEKLY B: Monday at 9:00 AM ET (even weeks)');
        console.log('  - MONTHLY: 1st of each month at 9:00 AM ET');
    }

    /**
     * Stop all scheduled cron jobs
     */
    stop() {
        console.log('[EmailScheduler] Stopping email scheduler...');
        Object.values(this.jobs).forEach(job => job.stop());
        this.jobs = {};
        this.isRunning = false;
        console.log('[EmailScheduler] Email scheduler stopped');
    }

    /**
     * Check if current week is a BI-WEEKLY A week
     * Uses ISO week number - odd weeks are A weeks
     */
    isBiWeeklyAWeek() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
        return weekNumber % 2 === 1; // Odd weeks are A weeks
    }

    /**
     * Get date range for statement period based on frequency tag
     */
    getStatementPeriod(frequencyTag) {
        const now = new Date();
        let startDate, endDate;

        switch (frequencyTag) {
            case 'WEEKLY':
                // Previous week (Monday to Sunday)
                endDate = new Date(now);
                endDate.setDate(now.getDate() - now.getDay()); // Last Sunday
                startDate = new Date(endDate);
                startDate.setDate(endDate.getDate() - 6); // Monday before
                break;

            case 'BI-WEEKLY A':
            case 'BI-WEEKLY B':
                // Previous 2 weeks
                endDate = new Date(now);
                endDate.setDate(now.getDate() - now.getDay()); // Last Sunday
                startDate = new Date(endDate);
                startDate.setDate(endDate.getDate() - 13); // 2 Mondays ago
                break;

            case 'MONTHLY':
                // Previous month
                endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prev month
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First of prev month
                break;

            default:
                // Default to previous month
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        }

        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };
    }

    /**
     * Send scheduled emails for a specific frequency tag
     */
    async sendScheduledEmails(frequencyTag) {
        const results = {
            tag: frequencyTag,
            timestamp: new Date().toISOString(),
            sent: [],
            failed: [],
            skipped: []
        };

        try {
            // Get listings with this frequency tag that have owner email configured
            const listings = await Listing.findAll({
                where: {
                    isActive: true,
                    ownerEmail: {
                        [Op.and]: [
                            { [Op.ne]: null },
                            { [Op.ne]: '' }
                        ]
                    }
                }
            });

            // Filter listings by tag
            const matchingListings = listings.filter(listing => {
                const tags = listing.tags || [];
                return tags.some(tag => tag.toUpperCase() === frequencyTag.toUpperCase());
            });

            console.log(`[EmailScheduler] Found ${matchingListings.length} listings with tag ${frequencyTag}`);

            if (matchingListings.length === 0) {
                results.skipped.push({ reason: 'No listings with this tag and configured email' });
                this.lastRun[frequencyTag] = results;
                return results;
            }

            // Get statement period
            const { startDate, endDate } = this.getStatementPeriod(frequencyTag);
            console.log(`[EmailScheduler] Statement period: ${startDate} to ${endDate}`);

            // Process each listing
            for (const listing of matchingListings) {
                try {
                    // Find statement for this listing and period
                    const statement = await Statement.findOne({
                        where: {
                            propertyId: listing.id,
                            weekStartDate: startDate,
                            weekEndDate: endDate,
                            status: { [Op.in]: ['draft', 'pending', 'generated'] }
                        }
                    });

                    if (!statement) {
                        results.skipped.push({
                            listingId: listing.id,
                            listingName: listing.nickname || listing.name,
                            reason: 'No statement found for period'
                        });
                        continue;
                    }

                    // Check for negative balance
                    const ownerPayout = parseFloat(statement.ownerPayout) || 0;
                    if (ownerPayout < 0) {
                        results.skipped.push({
                            listingId: listing.id,
                            listingName: listing.nickname || listing.name,
                            statementId: statement.id,
                            reason: 'Negative balance',
                            ownerPayout
                        });

                        // Flag the statement
                        await statement.update({ status: 'flagged_negative_balance' });
                        continue;
                    }

                    // Prepare statement data with greeting name
                    const statementData = statement.toJSON();
                    if (listing.ownerGreeting) {
                        statementData.ownerName = listing.ownerGreeting;
                    } else if (listing.nickname) {
                        statementData.ownerName = listing.nickname;
                    }
                    statementData.propertyName = listing.nickname || listing.name;

                    // Determine recipient email (TEST MODE: always use test email)
                    let recipientEmail = listing.ownerEmail;
                    if (this.testModeEnabled) {
                        console.log(`[EmailScheduler] TEST MODE: Redirecting email from ${listing.ownerEmail} to ${this.testModeEmail}`);
                        recipientEmail = this.testModeEmail;
                    }

                    // Send email with PDF
                    const emailResult = await EmailService.sendStatementEmailWithPdf({
                        to: recipientEmail,
                        statement: statementData,
                        frequencyTag: frequencyTag,
                        attachPdf: true,
                        refetchStatement: async (id) => {
                            const refreshed = await Statement.findByPk(id);
                            if (refreshed) {
                                const data = refreshed.toJSON();
                                if (listing.ownerGreeting) {
                                    data.ownerName = listing.ownerGreeting;
                                } else if (listing.nickname) {
                                    data.ownerName = listing.nickname;
                                }
                                data.propertyName = listing.nickname || listing.name;
                                return data;
                            }
                            return null;
                        }
                    });

                    if (emailResult.success) {
                        results.sent.push({
                            listingId: listing.id,
                            listingName: listing.nickname || listing.name,
                            statementId: statement.id,
                            recipientEmail: listing.ownerEmail,
                            ownerPayout
                        });

                        // Update statement status
                        await statement.update({
                            status: 'sent',
                            sentAt: new Date()
                        });
                    } else {
                        results.failed.push({
                            listingId: listing.id,
                            listingName: listing.nickname || listing.name,
                            statementId: statement.id,
                            error: emailResult.error || emailResult.message
                        });
                    }
                } catch (error) {
                    console.error(`[EmailScheduler] Error processing listing ${listing.id}:`, error);
                    results.failed.push({
                        listingId: listing.id,
                        listingName: listing.nickname || listing.name,
                        error: error.message
                    });
                }
            }

            console.log(`[EmailScheduler] ${frequencyTag} job completed: ${results.sent.length} sent, ${results.failed.length} failed, ${results.skipped.length} skipped`);

        } catch (error) {
            console.error(`[EmailScheduler] Error in ${frequencyTag} job:`, error);
            results.error = error.message;
        }

        this.lastRun[frequencyTag] = results;
        return results;
    }

    /**
     * Manually trigger email send for a specific tag (for testing)
     */
    async triggerManual(frequencyTag) {
        console.log(`[EmailScheduler] Manual trigger for ${frequencyTag}`);
        return await this.sendScheduledEmails(frequencyTag);
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            testMode: {
                enabled: this.testModeEnabled,
                testEmail: this.testModeEmail
            },
            jobs: Object.keys(this.jobs),
            lastRun: this.lastRun,
            nextRuns: this.getNextRuns()
        };
    }

    /**
     * Get next scheduled run times
     */
    getNextRuns() {
        const now = new Date();
        const nextRuns = {};

        // Calculate next Monday 9 AM
        const nextMonday = new Date(now);
        nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
        nextMonday.setHours(9, 0, 0, 0);
        if (nextMonday <= now) nextMonday.setDate(nextMonday.getDate() + 7);
        nextRuns.weekly = nextMonday.toISOString();

        // BI-WEEKLY A (Monday on odd weeks)
        const biweeklyA = new Date(nextMonday);
        while (!this.isBiWeeklyAWeekForDate(biweeklyA)) {
            biweeklyA.setDate(biweeklyA.getDate() + 7);
        }
        nextRuns['bi-weekly-a'] = biweeklyA.toISOString();

        // BI-WEEKLY B (Monday on even weeks)
        const biweeklyB = new Date(nextMonday);
        while (this.isBiWeeklyAWeekForDate(biweeklyB)) {
            biweeklyB.setDate(biweeklyB.getDate() + 7);
        }
        nextRuns['bi-weekly-b'] = biweeklyB.toISOString();

        // Monthly (1st of next month)
        const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);
        nextRuns.monthly = nextFirst.toISOString();

        return nextRuns;
    }

    /**
     * Check if a specific date is in a BI-WEEKLY A week
     */
    isBiWeeklyAWeekForDate(date) {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
        return weekNumber % 2 === 1;
    }

    /**
     * Get listings summary by frequency tag
     */
    async getListingsSummary() {
        const listings = await Listing.findAll({
            where: { isActive: true }
        });

        const summary = {
            WEEKLY: { count: 0, withEmail: 0, listings: [] },
            'BI-WEEKLY A': { count: 0, withEmail: 0, listings: [] },
            'BI-WEEKLY B': { count: 0, withEmail: 0, listings: [] },
            MONTHLY: { count: 0, withEmail: 0, listings: [] },
            untagged: { count: 0, withEmail: 0, listings: [] }
        };

        for (const listing of listings) {
            const tags = listing.tags || [];
            const hasEmail = listing.ownerEmail && listing.ownerEmail.trim() !== '';
            let matched = false;

            for (const tag of tags) {
                const upperTag = tag.toUpperCase();
                if (summary[upperTag]) {
                    summary[upperTag].count++;
                    if (hasEmail) summary[upperTag].withEmail++;
                    summary[upperTag].listings.push({
                        id: listing.id,
                        name: listing.nickname || listing.name,
                        ownerEmail: listing.ownerEmail || null,
                        ownerGreeting: listing.ownerGreeting || null
                    });
                    matched = true;
                }
            }

            if (!matched) {
                summary.untagged.count++;
                if (hasEmail) summary.untagged.withEmail++;
                summary.untagged.listings.push({
                    id: listing.id,
                    name: listing.nickname || listing.name,
                    ownerEmail: listing.ownerEmail || null,
                    ownerGreeting: listing.ownerGreeting || null
                });
            }
        }

        return summary;
    }
}

// Export singleton instance
module.exports = new EmailSchedulerService();
