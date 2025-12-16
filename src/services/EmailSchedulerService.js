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
const FileDataService = require('./FileDataService');
const DatabaseService = require('./DatabaseService');
const BusinessRulesService = require('./BusinessRulesService');
const ListingService = require('./ListingService');
const { Op } = require('sequelize');

class EmailSchedulerService {
    constructor() {
        this.jobs = {};
        this.isRunning = false;
        this.lastRun = {};
        // TEST MODE: Only send to this email address
        this.testModeEmail = 'ferdinand@luxurylodgingpm.com';
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

        // Format dates without timezone conversion
        const formatDate = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        return {
            startDate: formatDate(startDate),
            endDate: formatDate(endDate)
        };
    }

    /**
     * Send scheduled emails for a specific frequency tag
     * @param {string} frequencyTag - The frequency tag
     * @param {number|null} limit - Max number of emails to send (null = all)
     * @param {number} offset - Number of listings to skip (default: 0)
     */
    async sendScheduledEmails(frequencyTag, limit = null, offset = 0) {
        const results = {
            tag: frequencyTag,
            timestamp: new Date().toISOString(),
            sent: [],
            failed: [],
            skipped: [],
            limit: limit,
            offset: offset
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
            let matchingListings = listings.filter(listing => {
                const tags = listing.tags || [];
                return tags.some(tag => tag.toUpperCase() === frequencyTag.toUpperCase());
            });

            console.log(`[EmailScheduler] Found ${matchingListings.length} listings with tag ${frequencyTag}`);

            if (matchingListings.length === 0) {
                results.skipped.push({ reason: 'No listings with this tag and configured email' });
                this.lastRun[frequencyTag] = results;
                return results;
            }

            // Apply offset and limit if specified
            if (offset && offset > 0) {
                matchingListings = matchingListings.slice(offset);
                console.log(`[EmailScheduler] Skipping first ${offset} listing(s), ${matchingListings.length} remaining`);
            }
            if (limit && limit > 0) {
                matchingListings = matchingListings.slice(0, limit);
                console.log(`[EmailScheduler] Limiting to ${limit} listing(s)`);
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

                    // If no statement exists, generate one
                    let statementToUse = statement;
                    if (!statementToUse) {
                        console.log(`[EmailScheduler] No statement found for ${listing.nickname || listing.name}, generating...`);
                        try {
                            statementToUse = await this.generateStatementForListing(listing.id, startDate, endDate, frequencyTag);
                            if (!statementToUse) {
                                results.skipped.push({
                                    listingId: listing.id,
                                    listingName: listing.nickname || listing.name,
                                    reason: 'Failed to generate statement'
                                });
                                continue;
                            }
                            console.log(`[EmailScheduler] Generated statement ${statementToUse.id} for ${listing.nickname || listing.name}`);
                        } catch (genError) {
                            console.error(`[EmailScheduler] Error generating statement for ${listing.id}:`, genError.message);
                            results.skipped.push({
                                listingId: listing.id,
                                listingName: listing.nickname || listing.name,
                                reason: `Generation error: ${genError.message}`
                            });
                            continue;
                        }
                    }

                    // Check for negative balance
                    const ownerPayout = parseFloat(statementToUse.ownerPayout) || 0;
                    if (ownerPayout < 0) {
                        results.skipped.push({
                            listingId: listing.id,
                            listingName: listing.nickname || listing.name,
                            statementId: statementToUse.id,
                            reason: 'Negative balance',
                            ownerPayout
                        });
                        // Statement stays as draft, just skip sending
                        continue;
                    }

                    // Prepare statement data with greeting name
                    const statementData = statementToUse.toJSON();
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
                            statementId: statementToUse.id,
                            recipientEmail: listing.ownerEmail,
                            ownerPayout
                        });

                        // Update statement status
                        await statementToUse.update({
                            status: 'sent',
                            sentAt: new Date()
                        });
                    } else {
                        results.failed.push({
                            listingId: listing.id,
                            listingName: listing.nickname || listing.name,
                            statementId: statementToUse.id,
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
     * @param {string} frequencyTag - The tag to trigger
     * @param {number|null} limit - Max number of emails to send (null = all)
     * @param {number} offset - Number of listings to skip (default: 0)
     */
    async triggerManual(frequencyTag, limit = null, offset = 0) {
        console.log(`[EmailScheduler] Manual trigger for ${frequencyTag}${limit ? ` (limit: ${limit})` : ''}${offset ? ` (offset: ${offset})` : ''}`);
        return await this.sendScheduledEmails(frequencyTag, limit, offset);
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

    /**
     * Generate a statement for a single listing
     * @param {number} listingId - The listing ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {string} frequencyTag - The frequency tag (for calculation type selection)
     * @returns {object|null} The generated statement or null if failed
     */
    async generateStatementForListing(listingId, startDate, endDate, frequencyTag) {
        try {
            console.log(`[EmailScheduler] Generating statement for listing ${listingId} (${startDate} to ${endDate})`);

            // Get listing info
            const listingInfo = await ListingService.getListingWithPmFee(listingId);
            if (!listingInfo) {
                console.error(`[EmailScheduler] Listing ${listingId} not found`);
                return null;
            }

            // Default to calendar calculation type for scheduled emails
            const calculationType = 'calendar';

            // Get property settings
            const isCohostOnAirbnb = listingInfo.isCohostOnAirbnb || false;
            const airbnbPassThroughTax = listingInfo.airbnbPassThroughTax || false;
            const disregardTax = listingInfo.disregardTax || false;
            const cleaningFeePassThrough = listingInfo.cleaningFeePassThrough || false;
            const pmPercentage = listingInfo.pmFeePercentage ?? 15;
            const waiveCommission = listingInfo.waiveCommission || false;
            const waiveCommissionUntil = listingInfo.waiveCommissionUntil || null;

            // Fetch reservations and expenses
            const [reservations, expenses] = await Promise.all([
                FileDataService.getReservations(startDate, endDate, listingId, calculationType),
                FileDataService.getExpenses(startDate, endDate, listingId)
            ]);

            const periodStart = new Date(startDate);
            const periodEnd = new Date(endDate);

            // Filter reservations
            const allowedStatuses = ['confirmed', 'modified', 'new', 'accepted'];
            const periodReservations = reservations.filter(res => {
                if (parseInt(res.propertyId) !== parseInt(listingId)) return false;
                return allowedStatuses.includes(res.status);
            }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

            // Filter expenses
            const periodExpenses = expenses.filter(exp => {
                if (exp.propertyId !== null && parseInt(exp.propertyId) !== parseInt(listingId)) return false;
                const expenseDate = new Date(exp.date);
                return expenseDate >= periodStart && expenseDate <= periodEnd;
            });

            // Filter expenses - if cleaningFeePassThrough is enabled, exclude "Cleaning" expenses
            const filteredExpenses = cleaningFeePassThrough
                ? periodExpenses.filter(exp => {
                    const category = (exp.category || '').toLowerCase();
                    const type = (exp.type || '').toLowerCase();
                    const description = (exp.description || '').toLowerCase();
                    return !category.includes('cleaning') && !type.includes('cleaning') && !description.startsWith('cleaning');
                  })
                : periodExpenses;

            // Generate cleaning fee expenses from reservations when pass-through is enabled
            const cleaningFeeExpenses = [];
            if (cleaningFeePassThrough && periodReservations.length > 0) {
                for (const res of periodReservations) {
                    const cleaningFee = res.cleaningFee || listingInfo.cleaningFee || 0;
                    if (cleaningFee > 0) {
                        cleaningFeeExpenses.push({
                            id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                            propertyId: res.propertyId,
                            date: res.checkOutDate,
                            description: `Cleaning - ${res.guestName}`,
                            amount: -Math.abs(cleaningFee),
                            category: 'Cleaning',
                            type: 'cleaning',
                            vendor: 'Cleaning Service',
                            isAutoGenerated: true
                        });
                    }
                }
            }

            // Combine filtered expenses with cleaning fee expenses
            const allExpenses = [...filteredExpenses, ...cleaningFeeExpenses];

            // Calculate total revenue
            const totalRevenue = periodReservations.reduce((sum, res) => {
                const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                if (isAirbnb && isCohostOnAirbnb) return sum;
                const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                return sum + revenue;
            }, 0);

            // Calculate total cleaning fee from reservations (for pass-through feature)
            let totalCleaningFeeFromReservations = 0;
            if (cleaningFeePassThrough) {
                totalCleaningFeeFromReservations = periodReservations.reduce((sum, res) => {
                    return sum + (res.cleaningFee || 0);
                }, 0);
            }

            // Calculate total expenses
            const totalExpenses = filteredExpenses.reduce((sum, exp) => {
                const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                return isUpsell ? sum : sum + Math.abs(exp.amount);
            }, 0);

            // Calculate total upsells (additional payouts)
            const totalUpsells = filteredExpenses.reduce((sum, exp) => {
                const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                return isUpsell ? sum + exp.amount : sum;
            }, 0);

            // Calculate PM commission
            const pmCommission = totalRevenue * (pmPercentage / 100);

            // Check if PM commission waiver is active
            const isWaiverActive = (() => {
                if (!waiveCommission) return false;
                if (!waiveCommissionUntil) return true;
                const waiverEnd = new Date(waiveCommissionUntil + 'T23:59:59');
                const stmtEnd = new Date(endDate + 'T00:00:00');
                return stmtEnd <= waiverEnd;
            })();

            // Calculate owner payout
            let grossPayoutSum = 0;
            for (const res of periodReservations) {
                const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                const isCohostAirbnb = isAirbnb && isCohostOnAirbnb;

                const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                const luxuryFee = clientRevenue * (pmPercentage / 100);
                const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;
                const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
                const cleaningFeeForPassThrough = cleaningFeePassThrough ? (res.cleaningFee || listingInfo.cleaningFee || 0) : 0;

                const shouldAddTax = !disregardTax && (!isAirbnb || airbnbPassThroughTax);

                let grossPayout;
                if (isCohostAirbnb) {
                    grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
                } else if (shouldAddTax) {
                    grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
                } else {
                    grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
                }
                grossPayoutSum += grossPayout;
            }

            const ownerPayout = grossPayoutSum + totalUpsells - totalExpenses;

            // Create statement object
            const statementData = {
                ownerId: 1, // Default owner
                ownerName: 'Default', // Use Default owner for auto-generated statements
                propertyId: listingId,
                propertyName: listingInfo.nickname || listingInfo.displayName || listingInfo.name,
                weekStartDate: startDate,
                weekEndDate: endDate,
                calculationType,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalExpenses: Math.round(totalExpenses * 100) / 100,
                pmCommission: Math.round(pmCommission * 100) / 100,
                pmPercentage: pmPercentage,
                techFees: 0,
                insuranceFees: 0,
                adjustments: 0,
                ownerPayout: Math.round(ownerPayout * 100) / 100,
                isCohostOnAirbnb: isCohostOnAirbnb,
                airbnbPassThroughTax: airbnbPassThroughTax,
                disregardTax: disregardTax,
                cleaningFeePassThrough: cleaningFeePassThrough,
                totalCleaningFee: Math.round(totalCleaningFeeFromReservations * 100) / 100,
                status: 'draft',
                sentAt: null,
                reservations: periodReservations,
                expenses: allExpenses,
                items: [
                    ...periodReservations.map(res => {
                        const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                        return {
                            type: 'revenue',
                            description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                            amount: revenue,
                            date: res.checkOutDate,
                            category: 'booking'
                        };
                    }),
                    ...filteredExpenses.map(exp => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return {
                            type: isUpsell ? 'upsell' : 'expense',
                            description: exp.description,
                            amount: Math.abs(exp.amount),
                            date: exp.date,
                            category: exp.type || exp.category || 'expense',
                            vendor: exp.vendor,
                            listing: exp.listing
                        };
                    })
                ]
            };

            // Save to database
            const savedStatement = await DatabaseService.saveStatement(statementData);
            console.log(`[EmailScheduler] Generated statement ID ${savedStatement.id} for listing ${listingId}`);

            // Return as Statement model instance for compatibility
            return await Statement.findByPk(savedStatement.id);

        } catch (error) {
            console.error(`[EmailScheduler] Error generating statement for listing ${listingId}:`, error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new EmailSchedulerService();
