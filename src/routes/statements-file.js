const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const FileDataService = require('../services/FileDataService');
const BackgroundJobService = require('../services/BackgroundJobService');
const ListingService = require('../services/ListingService');
const { ActivityLog } = require('../models');

const isLlCoverExpense = (expense) => Boolean(expense && expense.llCover && expense.llCover !== 0);
const isHiddenItem = (item) => Boolean(item && item.hidden);

// GET /api/statements/jobs/:jobId - Get background job status
router.get('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = BackgroundJobService.getJob(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'fetchJobStatus' });
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

// GET /api/statements-file - Get all statements from files
router.get('/', async (req, res) => {
    try {
        const {
            ownerId,
            propertyId,
            propertyIds, // Support multi-select filtering
            status,
            startDate,
            endDate,
            hideZeroActivity, // Hide statements with $0 revenue AND $0 payout
            search, // Search by propertyName, groupName, or ownerName
            limit = 50,
            offset = 0
        } = req.query;

        let statements = await FileDataService.getStatements();

        // Filter out $0 revenue AND $0 payout statements when hideZeroActivity=true
        if (hideZeroActivity === 'true') {
            statements = statements.filter(s => {
                const revenue = parseFloat(s.totalRevenue) || 0;
                const payout = parseFloat(s.ownerPayout) || 0;
                // Keep if either revenue OR payout is non-zero
                return revenue !== 0 || payout !== 0;
            });
        }

        // Search filter - case-insensitive search across propertyName, groupName, ownerName
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim();
            statements = statements.filter(s => {
                const propertyName = (s.propertyName || '').toLowerCase();
                const groupName = (s.groupName || '').toLowerCase();
                const ownerName = (s.ownerName || '').toLowerCase();
                const propertyNames = (s.propertyNames || '').toLowerCase();
                return propertyName.includes(searchLower) ||
                    groupName.includes(searchLower) ||
                    ownerName.includes(searchLower) ||
                    propertyNames.includes(searchLower);
            });
        }

        // Get all listings to check cleaningFeePassThrough setting
        const allListings = await FileDataService.getListings();
        const listingMap = new Map(allListings.map(l => [parseInt(l.id), l]));

        // Apply filters
        if (ownerId) {
            statements = statements.filter(s => s.ownerId === parseInt(ownerId));
        }

        // Support both single propertyId and multiple propertyIds
        // Also include combined statements that contain the selected property in their propertyIds array
        if (propertyIds) {
            const ids = propertyIds.split(',').map(id => parseInt(id.trim()));
            statements = statements.filter(s => {
                // Check single propertyId
                if (ids.includes(s.propertyId)) return true;
                // Check combined statement propertyIds array
                if (s.propertyIds && Array.isArray(s.propertyIds)) {
                    return s.propertyIds.some(pid => ids.includes(parseInt(pid)));
                }
                return false;
            });
        } else if (propertyId) {
            const pid = parseInt(propertyId);
            statements = statements.filter(s => {
                // Check single propertyId
                if (s.propertyId === pid) return true;
                // Check combined statement propertyIds array
                if (s.propertyIds && Array.isArray(s.propertyIds)) {
                    return s.propertyIds.some(id => parseInt(id) === pid);
                }
                return false;
            });
        }

        if (status) {
            statements = statements.filter(s => s.status === status);
        }

        if (startDate && endDate) {
            statements = statements.filter(s => {
                const statementStart = new Date(s.weekStartDate);
                const statementEnd = new Date(s.weekEndDate);
                const filterStart = new Date(startDate);
                const filterEnd = new Date(endDate);

                // Check if statement period overlaps with filter period
                return statementStart <= filterEnd && statementEnd >= filterStart;
            });
        } else if (startDate) {
            statements = statements.filter(s => new Date(s.weekEndDate) >= new Date(startDate));
        } else if (endDate) {
            statements = statements.filter(s => new Date(s.weekStartDate) <= new Date(endDate));
        }

        // Sort by creation date (newest first), then by ID (newest first) for same-time statements
        statements.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.created_at || 0);
            const dateB = new Date(b.createdAt || b.created_at || 0);
            const dateDiff = dateB - dateA; // Descending order (newest first)
            if (dateDiff !== 0) return dateDiff;
            // For statements created at the same time, sort by ID descending
            return (b.id || 0) - (a.id || 0);
        });

        // Apply pagination
        const total = statements.length;
        const paginatedStatements = statements.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        // Format for frontend
        const formattedStatements = paginatedStatements.map(s => {
            // Compute cleaningMismatchWarning dynamically if not already stored
            let cleaningMismatchWarning = s.cleaningMismatchWarning || null;

            // If not stored, compute it from reservations - check if each reservation has cleaningFee
            // Note: If listing has a default cleaning fee, reservations without cleaningFee will use that
            if (!cleaningMismatchWarning && s.reservations && s.reservations.length > 0) {
                // Get property IDs for this statement
                const statementPropertyIds = s.propertyIds || (s.propertyId ? [s.propertyId] : []);

                // Check which properties have cleaningFeePassThrough enabled
                const propertiesWithPassThrough = statementPropertyIds.filter(propId => {
                    const listing = listingMap.get(parseInt(propId));
                    return listing && listing.cleaningFeePassThrough;
                });

                if (propertiesWithPassThrough.length > 0) {
                    // Get reservations for properties with passthrough
                    const passThroughReservations = s.reservations.filter(res =>
                        propertiesWithPassThrough.includes(parseInt(res.propertyId))
                    );

                    // Count reservations that have their OWN cleaning fee (not using listing default)
                    // This warns user when system is using listing's default instead of actual guest-paid fee
                    const reservationsWithOwnCleaningFee = passThroughReservations.filter(res =>
                        res.cleaningFee && res.cleaningFee > 0
                    );

                    // Count cleaning expenses in the expenses array
                    const cleaningExpenses = (s.expenses || []).filter(exp => {
                        const expPropertyId = exp.propertyId ? parseInt(exp.propertyId) : null;
                        if (!expPropertyId || !propertiesWithPassThrough.includes(expPropertyId)) return false;
                        const category = (exp.category || '').toLowerCase();
                        const type = (exp.type || '').toLowerCase();
                        const description = (exp.description || '').toLowerCase();
                        return category.includes('cleaning') || type.includes('cleaning') || description.includes('cleaning');
                    });

                    // Check for mismatches - prioritize showing the most relevant warning
                    const missingOwnCleaningFee = passThroughReservations.length - reservationsWithOwnCleaningFee.length;
                    const expenseCountMismatch = cleaningExpenses.length !== passThroughReservations.length;

                    if (missingOwnCleaningFee > 0 || expenseCountMismatch) {
                        let message = '';
                        if (missingOwnCleaningFee > 0 && expenseCountMismatch) {
                            message = `${reservationsWithOwnCleaningFee.length}/${passThroughReservations.length} have guest-paid cleaning fees, ${cleaningExpenses.length} cleaning expenses (should be ${passThroughReservations.length})`;
                        } else if (missingOwnCleaningFee > 0) {
                            message = `${reservationsWithOwnCleaningFee.length} of ${passThroughReservations.length} reservations have cleaning fees (using listing default for others)`;
                        } else {
                            message = `${cleaningExpenses.length} cleaning expenses for ${passThroughReservations.length} reservations - review recommended`;
                        }

                        cleaningMismatchWarning = {
                            type: 'cleaning_mismatch',
                            message,
                            reservationCount: passThroughReservations.length,
                            cleaningExpenseCount: cleaningExpenses.length,
                            reservationsWithOwnFee: reservationsWithOwnCleaningFee.length,
                            difference: missingOwnCleaningFee
                        };
                    }
                }
            }

            // Recalculate ownerPayout to account for listing default cleaning fees
            let recalculatedPayout = s.ownerPayout;
            if (s.reservations && s.reservations.length > 0) {
                const statementPropertyIds = s.propertyIds || (s.propertyId ? [s.propertyId] : []);

                // Check if any property has cleaningFeePassThrough enabled or waiver active
                const hasPassThrough = statementPropertyIds.some(propId => {
                    const listing = listingMap.get(parseInt(propId));
                    return listing && listing.cleaningFeePassThrough;
                });
                const hasWaiver = statementPropertyIds.some(propId => {
                    const listing = listingMap.get(parseInt(propId));
                    if (!listing?.waiveCommission) return false;
                    if (!listing?.waiveCommissionUntil) return true;
                    const waiverEnd = new Date(listing.waiveCommissionUntil + 'T23:59:59');
                    const stmtEnd = new Date(s.weekEndDate + 'T00:00:00');
                    return stmtEnd <= waiverEnd;
                });

                if (hasPassThrough || hasWaiver) {
                    // Recalculate gross payout with listing default cleaning fees
                    let grossPayoutSum = 0;
                    for (const res of s.reservations) {
                        const listing = listingMap.get(parseInt(res.propertyId));
                        const pmPercentage = listing?.pmFeePercentage ?? s.pmPercentage ?? 15;
                        const cleaningFeePassThrough = listing?.cleaningFeePassThrough || false;
                        const isCohostOnAirbnb = listing?.isCohostOnAirbnb || false;
                        const disregardTax = listing?.disregardTax || false;
                        const airbnbPassThroughTax = listing?.airbnbPassThroughTax || false;

                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        const isCohostAirbnb = isAirbnb && isCohostOnAirbnb;

                        const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                        // Use stored value for custom reservations, otherwise calculate
                        const luxuryFee = (res.isCustom && res.luxuryLodgingFee !== undefined)
                            ? res.luxuryLodgingFee
                            : clientRevenue * (pmPercentage / 100);
                        const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
                        // Reverse-engineer actual cleaning fee from guest-paid amount
                        // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
                        const guestPaidCleaningFee = res.cleaningFee ?? listing?.cleaningFee ?? 0;
                        const cleaningFeeForPassThrough = cleaningFeePassThrough && guestPaidCleaningFee > 0
                            ? Math.ceil((guestPaidCleaningFee / (1 + pmPercentage / 100)) / 5) * 5
                            : 0;

                        // Check if PM commission waiver is active
                        const waiveCommission = listing?.waiveCommission || false;
                        const waiveCommissionUntil = listing?.waiveCommissionUntil || null;
                        const isWaiverActive = (() => {
                            if (!waiveCommission) return false;
                            if (!waiveCommissionUntil) return true;
                            const waiverEnd = new Date(waiveCommissionUntil + 'T23:59:59');
                            const stmtEnd = new Date(s.weekEndDate + 'T00:00:00');
                            return stmtEnd <= waiverEnd;
                        })();
                        const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;

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

                    // Calculate expenses and upsells
                    // Filter out cleaning expenses for properties with cleaningFeePassThrough (already deducted in grossPayout)
                    const totalExpenses = (s.expenses || []).reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        if (isUpsell) return sum;

                        // Check if this is a cleaning expense for a property with pass-through enabled
                        const expPropertyId = exp.propertyId ? parseInt(exp.propertyId) : null;
                        const expListing = expPropertyId ? listingMap.get(expPropertyId) : null;
                        if (expListing?.cleaningFeePassThrough) {
                            const category = (exp.category || '').toLowerCase();
                            const type = (exp.type || '').toLowerCase();
                            const description = (exp.description || '').toLowerCase();
                            const isCleaningOrSupplies = category.includes('cleaning') || type.includes('cleaning') || description.startsWith('cleaning') || category.includes('supplies') || type.includes('supplies') || description.includes('supplies');
                            if (isCleaningOrSupplies) return sum; // Skip cleaning/supplies expenses - already deducted in grossPayout
                        }

                        return sum + Math.abs(exp.amount);
                    }, 0);
                    const totalUpsells = (s.expenses || []).reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum + exp.amount : sum;
                    }, 0);

                    recalculatedPayout = grossPayoutSum + totalUpsells - totalExpenses;
                }
            }

            // Compute needsReview marker - true if statement has ANY expenses or additional payouts
            const allExpenses = s.expenses || [];
            // Expenses are negative amounts (costs to owner)
            const expenseItems = allExpenses.filter(exp => {
                const isUpsell = exp.amount > 0 ||
                    (exp.type && exp.type.toLowerCase() === 'upsell') ||
                    (exp.category && exp.category.toLowerCase() === 'upsell');
                return !isUpsell;
            });
            // Additional payouts are positive amounts (credits to owner)
            const additionalPayouts = allExpenses.filter(exp => {
                const isUpsell = exp.amount > 0 ||
                    (exp.type && exp.type.toLowerCase() === 'upsell') ||
                    (exp.category && exp.category.toLowerCase() === 'upsell');
                return isUpsell;
            });
            const needsReview = expenseItems.length > 0 || additionalPayouts.length > 0;

            return {
                id: s.id,
                ownerId: s.ownerId,
                ownerName: s.ownerName || 'Default Owner',
                propertyId: s.propertyId,
                propertyIds: s.propertyIds || null,
                propertyName: s.propertyName || (s.propertyId ? `Property ${s.propertyId}` : 'All Properties'),
                propertyNames: s.propertyNames || null,
                isCombinedStatement: s.isCombinedStatement || false,
                weekStartDate: s.weekStartDate,
                weekEndDate: s.weekEndDate,
                calculationType: s.calculationType || 'checkout',
                totalRevenue: s.totalRevenue,
                totalExpenses: s.totalExpenses,
                pmCommission: s.pmCommission,
                pmPercentage: s.pmPercentage,
                techFees: s.techFees,
                insuranceFees: s.insuranceFees,
                adjustments: s.adjustments,
                ownerPayout: recalculatedPayout,
                status: s.status,
                sentAt: s.sentAt,
                createdAt: s.createdAt || s.created_at,
                updatedAt: s.updatedAt || s.updated_at,
                cleaningMismatchWarning,
                shouldConvertToCalendar: s.shouldConvertToCalendar || false,
                calendarConversionNotice: s.calendarConversionNotice || null,
                overlappingReservationCount: s.overlappingReservations ? s.overlappingReservations.length : 0,
                needsReview,
                reviewDetails: needsReview ? {
                    expenseCount: expenseItems.length,
                    additionalPayoutCount: additionalPayouts.length
                } : null
            };
        });

        res.json({
            statements: formattedStatements,
            total: total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'getStatements' });
        res.status(500).json({ error: 'Failed to get statements' });
    }
});

// Simple in-memory cache for cancelled counts
const cancelledCountsCache = new Map();
const CANCELLED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// POST /api/statements-file/cancelled-counts - Get cancelled reservation counts for multiple statements (batch)
router.post('/cancelled-counts', async (req, res) => {
    try {
        const { statementIds } = req.body;

        if (!statementIds || !Array.isArray(statementIds) || statementIds.length === 0) {
            return res.json({ counts: {} });
        }

        // First, try to get counts from stored statement data (fast path)
        const counts = {};
        const missingIds = [];

        const statements = await Promise.all(
            statementIds.map(id => FileDataService.getStatementById(id))
        );

        for (let i = 0; i < statementIds.length; i++) {
            const id = statementIds[i];
            const statement = statements[i];

            if (!statement) continue;

            // Check cache first
            const cacheKey = `${id}-${statement.weekStartDate}-${statement.weekEndDate}`;
            const cached = cancelledCountsCache.get(cacheKey);
            if (cached && Date.now() - cached.time < CANCELLED_CACHE_TTL) {
                counts[id] = cached.count;
                continue;
            }

            // Check if statement has cancelledReservationCount stored
            if (typeof statement.cancelledReservationCount === 'number') {
                counts[id] = statement.cancelledReservationCount;
                cancelledCountsCache.set(cacheKey, { count: statement.cancelledReservationCount, time: Date.now() });
            } else {
                missingIds.push({ id, statement, cacheKey });
            }
        }

        // If all counts found, return immediately (fast path)
        if (missingIds.length === 0) {
            return res.json({ counts });
        }

        // Fetch from Hostify per-property instead of one giant query
        const hostifyService = require('../services/HostifyService');

        // Group missing statements by their primary property ID for targeted queries
        const byProperty = new Map();
        for (const entry of missingIds) {
            const propertyIds = entry.statement.propertyIds || (entry.statement.propertyId ? [entry.statement.propertyId] : []);
            const primaryId = propertyIds[0];
            if (!primaryId) continue;
            if (!byProperty.has(primaryId)) byProperty.set(primaryId, []);
            byProperty.get(primaryId).push(entry);
        }

        // Fetch cancelled reservations per property with individual timeouts
        const PER_PROPERTY_TIMEOUT = 10000;
        await Promise.all([...byProperty.entries()].map(async ([propertyId, entries]) => {
            const minStart = entries.reduce((min, { statement }) =>
                statement.weekStartDate < min ? statement.weekStartDate : min, entries[0].statement.weekStartDate);
            const maxEnd = entries.reduce((max, { statement }) =>
                statement.weekEndDate > max ? statement.weekEndDate : max, entries[0].statement.weekEndDate);

            let cancelledReservations = [];
            try {
                const apiResponse = await Promise.race([
                    hostifyService.getAllReservations(minStart, maxEnd, propertyId, 'checkIn'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Hostify timeout')), PER_PROPERTY_TIMEOUT))
                ]);
                const allRes = apiResponse.result || [];
                cancelledReservations = allRes.filter(r => r.status === 'cancelled');
            } catch (fetchError) {
                logger.warn('Cancelled counts fetch timeout for property, skipping', { context: 'StatementsFile', propertyId });
                // Don't cache 0 on timeout — leave these statements without a count so they retry next time
                for (const { id } of entries) {
                    counts[id] = 0;
                }
                return;
            }

            for (const { id, statement, cacheKey } of entries) {
                const propertyIds = statement.propertyIds || (statement.propertyId ? [statement.propertyId] : []);
                const propertyIdSet = new Set(propertyIds.map(p => parseInt(p)));
                const stmtStart = new Date(statement.weekStartDate);
                const stmtEnd = new Date(statement.weekEndDate);

                const cancelledCount = cancelledReservations.filter(r => {
                    const resPropertyId = parseInt(r.propertyId);
                    if (!propertyIdSet.has(resPropertyId)) return false;
                    const resCheckIn = new Date(r.checkInDate);
                    const resCheckOut = new Date(r.checkOutDate);
                    return resCheckIn <= stmtEnd && resCheckOut >= stmtStart;
                }).length;

                counts[id] = cancelledCount;
                cancelledCountsCache.set(cacheKey, { count: cancelledCount, time: Date.now() });
            }
        }));

        res.json({ counts });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'getCancelledCounts' });
        res.status(500).json({ error: 'Failed to get cancelled counts' });
    }
});

// GET /api/statements-file/:id - Get specific statement
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);

        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Inject cleaning fee expenses for statements with pass-through enabled
        if (statement.cleaningFeePassThrough && statement.reservations && statement.reservations.length > 0) {
            const existingExpenses = statement.expenses || [];
            const existingItems = statement.items || [];
            // Check if cleaning expenses already exist in expenses array
            const hasCleaningExpenses = existingExpenses.some(e => e.type === 'cleaning' || (e.description && e.description.startsWith('Cleaning -')));
            // Check if cleaning expenses already exist in items array
            const hasCleaningItems = existingItems.some(i => i.type === 'expense' && i.description && i.description.startsWith('Cleaning -'));

            if (!hasCleaningExpenses || !hasCleaningItems) {
                const cleaningFeeExpenses = [];
                const cleaningFeeItems = [];
                for (const res of statement.reservations) {
                    const cleaningFee = res.cleaningFee || 0;
                    if (cleaningFee > 0) {
                        cleaningFeeExpenses.push({
                            id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                            propertyId: statement.propertyId,
                            date: res.checkOutDate,
                            description: `Cleaning - ${res.guestName || 'Guest'}`,
                            amount: -Math.abs(cleaningFee),
                            category: 'Cleaning',
                            type: 'cleaning',
                            vendor: 'Cleaning Service',
                            isAutoGenerated: true
                        });
                        // Also add to items array for Edit Statement modal
                        cleaningFeeItems.push({
                            type: 'expense',
                            description: `Cleaning - ${res.guestName || 'Guest'}`,
                            amount: -Math.abs(cleaningFee),
                            date: res.checkOutDate,
                            category: 'Cleaning',
                            isAutoGenerated: true
                        });
                    }
                }
                if (!hasCleaningExpenses) {
                    statement.expenses = [...existingExpenses, ...cleaningFeeExpenses];
                }
                if (!hasCleaningItems) {
                    statement.items = [...existingItems, ...cleaningFeeItems];
                }
            }
        }

        // Inject LL Cover expenses as hidden items for edit visibility
        if (statement.expenses && statement.expenses.length > 0) {
            const existingItems = statement.items || [];
            const hasLlCoverItems = existingItems.some(i => i.hiddenReason === 'll_cover');
            if (!hasLlCoverItems) {
                const llCoverExpenses = statement.expenses.filter(exp => isLlCoverExpense(exp));
                if (llCoverExpenses.length > 0) {
                    const llCoverItems = llCoverExpenses.map(exp => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || exp.expenseType === 'extras';
                        return {
                            type: isUpsell ? 'upsell' : 'expense',
                            description: exp.description,
                            amount: Math.abs(exp.amount),
                            date: exp.date,
                            category: exp.type || exp.category || 'expense',
                            vendor: exp.vendor,
                            listing: exp.listing,
                            hidden: true,
                            hiddenReason: 'll_cover'
                        };
                    });
                    statement.items = [...existingItems, ...llCoverItems];
                    await FileDataService.updateStatement(id, { items: statement.items });
                }
            }
        }

        // Use statement's own internalNotes if available (snapshotted at creation/finalization)
        // Only fall back to listing notes for backward compatibility with old statements
        // OPTIMIZED: Use database listings instead of Hostify API
        if (!statement.internalNotes) {
            const ListingService = require('../services/ListingService');
            const dbListings = await ListingService.getListingsWithPmFees();

            if (statement.propertyId) {
                // Single property statement
                const listing = dbListings.find(l => l.id === parseInt(statement.propertyId));
                if (listing && listing.internalNotes) {
                    statement.internalNotes = listing.internalNotes;
                }
            } else if (statement.propertyIds && Array.isArray(statement.propertyIds)) {
                // Combined statement - collect notes from all properties
                const notesArray = [];
                for (const propId of statement.propertyIds) {
                    const listing = dbListings.find(l => l.id === parseInt(propId));
                    if (listing && listing.internalNotes) {
                        const displayName = listing.displayName || listing.nickname || listing.name;
                        notesArray.push(`[${displayName}]: ${listing.internalNotes}`);
                    }
                }
                if (notesArray.length > 0) {
                    statement.internalNotes = notesArray.join('\n\n');
                }
            }
        }

        // OPTIMIZED: Don't fetch cancelled reservation count on every load
        // This was causing 90+ second delays due to Hostify API calls
        // The count is fetched separately via /api/statements/:id/cancelled endpoint when needed
        statement.cancelledReservationCount = 0;

        res.json(statement);
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'getStatement' });
        res.status(500).json({ error: 'Failed to get statement' });
    }
});

// Helper function to generate a COMBINED statement for multiple properties
// Optional 'group' parameter contains group info when generating from a listing group
async function generateCombinedStatement(req, res, propertyIds, ownerId, startDate, endDate, calculationType, group = null) {
    try {
        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        // Get data from files
        const listings = await FileDataService.getListings();
        const owners = await FileDataService.getOwners();

        // Get the owner - handle both 'default'/1 as default owner
        const owner = owners.find(o => {
            if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
                return o.id === 'default';
            }
            return o.id === ownerId || o.id === parseInt(ownerId);
        }) || owners[0];

        // Parse property IDs to integers
        const parsedPropertyIds = propertyIds.map(id => parseInt(id));

        // Find all the target listings
        const targetListings = listings.filter(l => parsedPropertyIds.includes(l.id));
        if (targetListings.length === 0) {
            return res.status(404).json({ error: 'No properties found for the given IDs' });
        }

        // OPTIMIZED: Batch fetch all data in parallel

        // Get listing info for PM fees and co-host status (batch fetch)
        const dbListings = await ListingService.getListingsWithPmFees(parsedPropertyIds);
        const listingInfoMap = {};
        dbListings.forEach(l => { listingInfoMap[l.id] = l; });

        // Merge Hostify cleaningFee from targetListings into listingInfoMap
        targetListings.forEach(l => {
            if (listingInfoMap[l.id]) {
                listingInfoMap[l.id].cleaningFee = l.cleaningFee || 0;
            }
        });

        // Fetch reservations and expenses in parallel using batch methods
        const [reservationsByProperty, expensesByProperty] = await Promise.all([
            FileDataService.getReservationsBatch(startDate, endDate, parsedPropertyIds, calculationType, listingInfoMap),
            FileDataService.getExpensesBatch(startDate, endDate, parsedPropertyIds)
        ]);

        // Combine all reservations and expenses
        let allReservations = [];
        let allExpenses = [];
        let allDuplicateWarnings = [];

        for (const propId of parsedPropertyIds) {
            const propReservations = reservationsByProperty[propId] || [];
            const propExpenseData = expensesByProperty[propId] || { expenses: [], duplicateWarnings: [] };

            allReservations.push(...propReservations);
            allExpenses.push(...propExpenseData.expenses);
            allDuplicateWarnings.push(...propExpenseData.duplicateWarnings);
        }

        // Filter reservations by date and status
        const periodReservations = allReservations.filter(res => {
            // Check property ID is in our list (use parseInt to ensure proper type comparison)
            if (!parsedPropertyIds.includes(parseInt(res.propertyId))) {
                return false;
            }

            // Check date match based on calculation type
            let dateMatch = true;
            if (calculationType === 'calendar') {
                // For calendar-based calculation, reservations are already filtered and prorated
                dateMatch = true;
            } else {
                // For checkout-based calculation, filter by checkout date
                const checkoutDate = new Date(res.checkOutDate);
                dateMatch = checkoutDate >= periodStart && checkoutDate <= periodEnd;
                if (!dateMatch) return false;
            }

            // Only include confirmed and accepted status reservations (exclude expired, cancelled, etc.)
            const allowedStatuses = ['confirmed', 'accepted'];
            return allowedStatuses.includes(res.status);
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

        // Filter expenses by date (LL Cover handled separately for hidden items)
        const periodExpensesAll = allExpenses.filter(exp => {
            // Check property ID is in our list (or is null for SecureStay)
            // Use parseInt to ensure proper type comparison
            if (exp.propertyId !== null && !parsedPropertyIds.includes(parseInt(exp.propertyId))) {
                return false;
            }
            const expenseDate = new Date(exp.date);
            return expenseDate >= periodStart && expenseDate <= periodEnd;
        });
        const llCoverExpenses = periodExpensesAll.filter(exp => isLlCoverExpense(exp));
        const periodExpenses = periodExpensesAll.filter(exp => !isLlCoverExpense(exp));

        // Identify cleaning expenses
        const cleaningExpenses = periodExpenses.filter(exp => {
            const category = (exp.category || '').toLowerCase();
            const type = (exp.type || '').toLowerCase();
            const description = (exp.description || '').toLowerCase();
            return category.includes('cleaning') || type.includes('cleaning') || description.includes('cleaning');
        });

        // Validate cleaning expenses vs reservations for properties with cleaningFeePassThrough
        let cleaningMismatchWarning = null;
        const propertiesWithPassThrough = parsedPropertyIds.filter(propId => listingInfoMap[propId]?.cleaningFeePassThrough);
        if (propertiesWithPassThrough.length > 0) {
            // Count reservations for properties with passthrough
            const passThroughReservations = periodReservations.filter(res =>
                propertiesWithPassThrough.includes(parseInt(res.propertyId))
            );
            // Count cleaning expenses for properties with passthrough
            const passThroughCleaningExpenses = cleaningExpenses.filter(exp =>
                exp.propertyId && propertiesWithPassThrough.includes(parseInt(exp.propertyId))
            );

            if (passThroughReservations.length > 0 && passThroughCleaningExpenses.length !== passThroughReservations.length) {
                cleaningMismatchWarning = {
                    type: 'cleaning_mismatch',
                    message: `Cleaning expense count (${passThroughCleaningExpenses.length}) does not match reservation count (${passThroughReservations.length})`,
                    reservationCount: passThroughReservations.length,
                    cleaningExpenseCount: passThroughCleaningExpenses.length,
                    difference: passThroughReservations.length - passThroughCleaningExpenses.length
                };
            }
        }

        // Identify supplies expenses
        const suppliesExpenses = periodExpenses.filter(exp => {
            const category = (exp.category || '').toLowerCase();
            const type = (exp.type || '').toLowerCase();
            const description = (exp.description || '').toLowerCase();
            return category.includes('supplies') || type.includes('supplies') || description.includes('supplies');
        });

        // Filter out cleaning and supplies expenses for properties with cleaningFeePassThrough enabled
        // This prevents double-charging (once via Cleaning Expense column, once via expense list)
        const filteredExpenses = periodExpenses.filter(exp => {
            const propId = exp.propertyId ? parseInt(exp.propertyId) : null;
            const hasCleaningPassThrough = propId && listingInfoMap[propId]?.cleaningFeePassThrough;

            if (hasCleaningPassThrough) {
                // Exclude cleaning and supplies expenses for this property
                return !cleaningExpenses.includes(exp) && !suppliesExpenses.includes(exp);
            }
            return true;
        });

        // Calculate totals - handle co-host properties per reservation
        let totalRevenue = 0;
        for (const res of periodReservations) {
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const isCohostForProperty = listingInfoMap[res.propertyId]?.isCohostOnAirbnb || false;

            // Exclude Airbnb revenue for co-hosted properties
            if (isAirbnb && isCohostForProperty) {
                continue;
            }

            // Use clientRevenue (prorated) for calendar-based statements, grossAmount for checkout-based
            const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            totalRevenue += revenue;
        }

        // Calculate total expenses (only actual costs, not upsells) - use filtered expenses
        const totalExpenses = filteredExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum : sum + Math.abs(exp.amount);
        }, 0);

        // Calculate total upsells (additional payouts) - use filtered expenses
        const totalUpsells = filteredExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum + exp.amount : sum;
        }, 0);

        // Calculate PM commission per-reservation based on each property's PM fee
        let pmCommission = 0;
        for (const res of periodReservations) {
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const listing = listingInfoMap[res.propertyId];
            const isCohostForProperty = listing?.isCohostOnAirbnb || false;

            // Skip PM commission for co-hosted Airbnb reservations
            if (isAirbnb && isCohostForProperty) {
                continue;
            }

            const resPmFee = listing?.pmFeePercentage ?? 15;
            // Use clientRevenue (prorated) for calendar-based statements
            const resRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            const resCommission = resRevenue * (resPmFee / 100);
            pmCommission += resCommission;
        }

        // Calculate average PM percentage for display
        const avgPmPercentage = totalRevenue > 0 ? (pmCommission / totalRevenue) * 100 : 15;

        // Calculate fees per property
        const propertyCount = targetListings.length;
        const techFees = propertyCount * 50; // $50 per property
        const insuranceFees = propertyCount * 25; // $25 per property

        // Calculate owner payout using same per-reservation logic as PDF view
        // This ensures statement list shows same values as PDF
        let grossPayoutSum = 0;
        for (const res of periodReservations) {
            const resListingInfo = listingInfoMap[res.propertyId] || {};
            const resPmPercentage = resListingInfo.pmFeePercentage ?? 15;
            const resDisregardTax = resListingInfo.disregardTax || false;
            const resAirbnbPassThroughTax = resListingInfo.airbnbPassThroughTax || false;
            const resIsCohostOnAirbnb = resListingInfo.isCohostOnAirbnb || false;
            const resCleaningFeePassThrough = resListingInfo.cleaningFeePassThrough || false;
            const resWaiveCommission = resListingInfo.waiveCommission || false;
            const resWaiveCommissionUntil = resListingInfo.waiveCommissionUntil || null;

            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const isCohostAirbnb = isAirbnb && resIsCohostOnAirbnb;

            // Check if PM commission waiver is active
            const isWaiverActive = (() => {
                if (!resWaiveCommission) return false;
                if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                const stmtEnd = new Date(endDate + 'T00:00:00');
                return stmtEnd <= waiverEnd;
            })();

            const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            const luxuryFee = clientRevenue * (resPmPercentage / 100);
            // If waiver is active, don't deduct PM fee
            const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;
            const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
            // Reverse-engineer actual cleaning fee from guest-paid amount
            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
            const guestPaidCleaningFee = res.cleaningFee ?? resListingInfo.cleaningFee ?? 0;
            const cleaningFeeForPassThrough = resCleaningFeePassThrough && guestPaidCleaningFee > 0
                ? Math.ceil((guestPaidCleaningFee / (1 + resPmPercentage / 100)) / 5) * 5
                : 0;

            const shouldAddTax = !resDisregardTax && (!isAirbnb || resAirbnbPassThroughTax);

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

        // Generate unique ID
        const existingStatements = await FileDataService.getStatements();
        const newId = FileDataService.generateId(existingStatements);

        // Create property names string for display
        const propertyNames = targetListings.map(l => l.nickname || l.displayName || l.name).join(', ');
        const shortPropertyNames = targetListings.length <= 3
            ? propertyNames
            : `${targetListings.slice(0, 2).map(l => l.nickname || l.displayName || l.name).join(', ')} +${targetListings.length - 2} more`;

        // Use group name for display if this is a group-based statement
        const displayName = group ? group.name : shortPropertyNames;

        // Create statement object
        const statement = {
            id: newId,
            ownerId: owner.id === 'default' ? 1 : parseInt(owner.id),
            ownerName: owner.name,
            propertyId: null, // Combined statement has no single property
            propertyIds: parsedPropertyIds, // Store all property IDs
            propertyName: displayName,
            propertyNames: propertyNames, // Full list for detail view
            // Store group info if this statement was generated from a group
            groupId: group ? group.id : null,
            groupName: group ? group.name : null,
            groupTags: group && group.tags ? (Array.isArray(group.tags) ? group.tags.join(',') : group.tags) : null,
            weekStartDate: startDate,
            weekEndDate: endDate,
            calculationType,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            pmCommission: Math.round(pmCommission * 100) / 100,
            pmPercentage: Math.round(avgPmPercentage * 100) / 100,
            techFees: Math.round(techFees * 100) / 100,
            insuranceFees: Math.round(insuranceFees * 100) / 100,
            adjustments: 0,
            ownerPayout: Math.round(ownerPayout * 100) / 100,
            isCombinedStatement: true,
            propertyCount: propertyCount,
            // Set cleaningFeePassThrough if ANY property in the combined statement has it enabled
            cleaningFeePassThrough: parsedPropertyIds.some(propId => listingInfoMap[propId]?.cleaningFeePassThrough),
            status: 'draft',
            sentAt: null,
            createdAt: new Date().toISOString(),
            // Snapshot internal notes from all listings at time of statement creation
            internalNotes: (() => {
                const notesArray = [];
                for (const listing of targetListings) {
                    if (listing.internalNotes) {
                        const displayName = listing.nickname || listing.displayName || listing.name;
                        notesArray.push(`[${displayName}]: ${listing.internalNotes}`);
                    }
                }
                return notesArray.length > 0 ? notesArray.join('\n\n') : null;
            })(),
            reservations: periodReservations,
            expenses: allExpenses, // Use all expenses including auto-generated cleaning fees
            duplicateWarnings: allDuplicateWarnings,
            cleaningMismatchWarning,
            items: [
                // Revenue items from reservations (grouped by property)
                ...periodReservations.map(res => {
                    // Use parseInt for proper type comparison
                    const listing = targetListings.find(l => parseInt(l.id) === parseInt(res.propertyId));
                    const propertyLabel = listing ? (listing.nickname || listing.displayName || listing.name) : `Property ${res.propertyId}`;
                    // Use clientRevenue (prorated) for calendar-based statements
                    const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                    return {
                        type: 'revenue',
                        description: `[${propertyLabel}] ${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                        amount: revenue,
                        date: res.checkOutDate,
                        category: 'booking',
                        propertyId: res.propertyId
                    };
                }),
                // Expenses and upsells - use filtered expenses to exclude cleaning when pass-through enabled
                ...filteredExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || (exp.expenseType === 'extras');
                    // Use parseInt for proper type comparison
                    const listing = exp.propertyId ? targetListings.find(l => parseInt(l.id) === parseInt(exp.propertyId)) : null;
                    const propertyLabel = listing ? (listing.nickname || listing.displayName || listing.name) : (exp.listing || 'General');

                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.propertyId ? `[${propertyLabel}] ${exp.description}` : exp.description,
                        amount: Math.abs(exp.amount),
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing,
                        propertyId: exp.propertyId
                    };
                }),
                // LL Cover expenses are stored as hidden items for review
                ...llCoverExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || (exp.expenseType === 'extras');
                    const listing = exp.propertyId ? targetListings.find(l => parseInt(l.id) === parseInt(exp.propertyId)) : null;
                    const propertyLabel = listing ? (listing.nickname || listing.displayName || listing.name) : (exp.listing || 'General');

                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.propertyId ? `[${propertyLabel}] ${exp.description}` : exp.description,
                        amount: Math.abs(exp.amount),
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing,
                        propertyId: exp.propertyId,
                        hidden: true,
                        hiddenReason: 'll_cover'
                    };
                })
            ]
        };

        // Save statement to file
        await FileDataService.saveStatement(statement);

        // Log activity with proper fallbacks
        const propertyDisplay = statement.propertyName || statement.propertyNames || `${propertyCount} properties`;
        const periodDisplay = statement.weekStartDate && statement.weekEndDate
            ? `${statement.weekStartDate} to ${statement.weekEndDate}`
            : 'Unknown period';
        await ActivityLog.log(req, 'CREATE_STATEMENT', 'statement', statement.id, {
            ownerName: statement.ownerName || 'Unknown Owner',
            propertyName: propertyDisplay,
            period: periodDisplay,
            propertyCount,
            isCombined: true,
            groupId: group ? group.id : null,
            groupName: group ? group.name : null
        });

        // Create response message based on whether this is a group statement
        const responseMessage = group
            ? `Statement generated for group "${group.name}" (${propertyCount} properties)`
            : `Combined statement generated for ${propertyCount} properties`;

        res.status(201).json({
            message: responseMessage,
            statement: {
                id: statement.id,
                ownerPayout: statement.ownerPayout,
                totalRevenue: statement.totalRevenue,
                totalExpenses: statement.totalExpenses,
                itemCount: statement.items.length,
                propertyCount: propertyCount,
                isCombinedStatement: true,
                groupId: group ? group.id : null,
                groupName: group ? group.name : null
            }
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'generateCombinedStatement' });
        res.status(500).json({ error: 'Failed to generate combined statement' });
    }
}

// POST /api/statements-file/generate - Generate statement and save to file
router.post('/generate', async (req, res) => {
    try {
        const { propertyId, propertyIds, ownerId, tag, groupId, startDate, endDate, calculationType = 'checkout', generateCombined } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        if (!propertyId && !propertyIds && !ownerId && !tag && !groupId) {
            return res.status(400).json({ error: 'Either property ID, property IDs, owner ID, tag, or group ID is required' });
        }

        // Handle group-based COMBINED statement generation
        if (groupId) {
            logger.debug('Generating combined statement for group', { context: 'StatementsFile', groupId });

            // Fetch group and its member listings
            const ListingGroupService = require('../services/ListingGroupService');
            const group = await ListingGroupService.getGroupById(parseInt(groupId));

            if (!group) {
                return res.status(404).json({ error: `Group not found: ${groupId}` });
            }

            if (!group.members || group.members.length === 0) {
                return res.status(400).json({ error: `Group "${group.name}" has no member listings` });
            }

            logger.debug('Found listings in group', { context: 'StatementsFile', groupName: group.name, count: group.members.length });

            // Generate combined statement using the existing function with group's listing IDs
            const groupPropertyIds = group.members.map(m => m.id.toString());
            return await generateCombinedStatement(req, res, groupPropertyIds, ownerId, startDate, endDate, calculationType, group);
        }

        // Handle combined multi-property statement generation
        if (propertyIds && Array.isArray(propertyIds) && propertyIds.length > 1) {
            return await generateCombinedStatement(req, res, propertyIds, ownerId, startDate, endDate, calculationType);
        }

        // Handle tag-based COMBINED statement generation
        if (tag && !propertyId && generateCombined === true) {
            logger.debug('Generating combined statement for tag', { context: 'StatementsFile', tag });

            // Get all listings with this tag
            const listings = await FileDataService.getListings();
            const tagLower = tag.toLowerCase().trim();
            const taggedListings = listings.filter(l => {
                const listingTags = l.tags || [];
                return listingTags.some(t => t.toLowerCase().trim() === tagLower);
            });

            if (taggedListings.length === 0) {
                return res.status(404).json({ error: `No properties found with tag: ${tag}` });
            }

            logger.debug('Found listings with tag', { context: 'StatementsFile', tag, count: taggedListings.length });

            // Generate combined statement using the existing function
            const taggedPropertyIds = taggedListings.map(l => l.id.toString());
            return await generateCombinedStatement(req, res, taggedPropertyIds, ownerId, startDate, endDate, calculationType);
        }

        // Handle "Generate All" option or tag-based SEPARATE statement generation - run in background
        if (ownerId === 'all' || (tag && !propertyId)) {

            const jobId = await BackgroundJobService.runInBackground(
                'bulk_statement_generation',
                async (jobId) => {
                    await generateAllOwnerStatementsBackground(jobId, startDate, endDate, calculationType, tag);
                },
                { startDate, endDate, calculationType, tag }
            );

            return res.status(202).json({
                message: tag ? `Tag-based statement generation started for "${tag}"` : 'Bulk statement generation started in background',
                jobId,
                status: 'processing',
                note: 'This may take several minutes to complete. Check back later or use the job status endpoint.',
                statusUrl: `/api/statements/jobs/${jobId}`
            });
        }

        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        if (periodStart > periodEnd) {
            return res.status(400).json({ error: 'Start date must be before end date' });
        }

        // Child listings are always fetched automatically for all properties

        // OPTIMIZED: Fetch all data in parallel
        // For checkout mode, we also need calendar-based reservations to detect overlapping stays
        const fetchPromises = [
            FileDataService.getListings(),
            FileDataService.getReservations(startDate, endDate, propertyId, calculationType),
            FileDataService.getExpenses(startDate, endDate, propertyId),
            FileDataService.getOwners()
        ];

        // If checkout mode, also fetch calendar-based reservations to find overlapping stays
        if (calculationType === 'checkout' && propertyId) {
            fetchPromises.push(FileDataService.getReservations(startDate, endDate, propertyId, 'calendar'));
        }

        const results = await Promise.all(fetchPromises);
        const [listings, reservations, expenses, owners] = results;
        const calendarReservations = calculationType === 'checkout' && propertyId ? results[4] : null;

        // Check for duplicate warnings
        const duplicateWarnings = expenses.duplicateWarnings || [];
        if (duplicateWarnings.length > 0) {
            logger.warn('Found potential duplicate expenses in statement', { context: 'StatementsFile', count: duplicateWarnings.length });
        }

        let targetListings, owner;

        if (propertyId) {
            // Generate statement for specific property
            const listing = listings.find(l => l.id === parseInt(propertyId));
            if (!listing) {
                return res.status(404).json({ error: 'Property not found' });
            }
            targetListings = [listing];
            owner = owners[0]; // Default owner
        } else if (tag) {
            // Generate statements for all properties with the specified tag
            // Use case-insensitive matching for tags
            const tagLower = tag.toLowerCase().trim();

            // Debug: Log all listings with tags for troubleshooting
            const listingsWithTags = listings.filter(l => l.tags && l.tags.length > 0);
            logger.debug('Tag filter looking for tag', { context: 'StatementsFile', tag, normalizedTag: tagLower });
            logger.debug('Tag filter listings stats', { context: 'StatementsFile', totalListings: listings.length, listingsWithTags: listingsWithTags.length });

            const taggedListings = listings.filter(l => {
                const listingTags = l.tags || [];
                const matches = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                if (listingTags.length > 0) {
                    logger.debug('Tag filter listing check', { context: 'StatementsFile', listingId: l.id, listingName: l.name, tags: listingTags, matches });
                }
                return matches;
            });

            logger.debug('Tag filter found matching listings', { context: 'StatementsFile', tag, count: taggedListings.length });

            if (taggedListings.length === 0) {
                return res.status(404).json({ error: `No properties found with tag: ${tag}` });
            }

            targetListings = taggedListings;
            owner = owners.find(o => {
                if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
                    return o.id === 'default';
                }
                return o.id === ownerId || o.id === parseInt(ownerId);
            }) || owners[0];
        } else {
            // Generate consolidated statement for all owner's properties
            // Find owner - handle both 'default'/1 as default owner, and other owner IDs
            owner = owners.find(o => {
                if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
                    return o.id === 'default';
                }
                return o.id === ownerId || o.id === parseInt(ownerId);
            });
            if (!owner) {
                // Fallback to default owner if not found
                owner = owners[0];
            }
            targetListings = listings; // All properties for now
        }

        // Filter reservations - optimized with reduced logging
        const allowedStatuses = ['confirmed', 'accepted'];
        const periodReservations = reservations.filter(res => {
            // Use parseInt on both sides to ensure proper type comparison
            if (propertyId && parseInt(res.propertyId) !== parseInt(propertyId)) {
                return false;
            }

            // Check date match based on calculation type
            if (calculationType !== 'calendar') {
                const checkoutDate = new Date(res.checkOutDate);
                if (checkoutDate < periodStart || checkoutDate > periodEnd) {
                    return false;
                }
            }

            return allowedStatuses.includes(res.status);
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

        // Find ALL overlapping reservations (regardless of calculation type) for calendar conversion detection
        // Use calendar-based reservations if available (for checkout mode), otherwise filter from current reservations
        const reservationsToCheckForOverlap = calendarReservations || reservations;
        const overlappingReservations = reservationsToCheckForOverlap.filter(res => {
            if (propertyId && parseInt(res.propertyId) !== parseInt(propertyId)) {
                return false;
            }
            const checkIn = new Date(res.checkInDate);
            const checkOut = new Date(res.checkOutDate);
            // Overlaps if: checkIn <= periodEnd AND checkOut > periodStart
            return checkIn <= periodEnd && checkOut > periodStart && allowedStatuses.includes(res.status);
        });

        // Determine if statement should be flagged for calendar conversion
        let shouldConvertToCalendar = false;
        let calendarConversionNotice = null;

        if (calculationType === 'checkout') {
            // For checkout mode: flag if there are overlapping reservations but no checkouts in period
            if (overlappingReservations.length > 0 && periodReservations.length === 0) {
                shouldConvertToCalendar = true;
                calendarConversionNotice = `This property has ${overlappingReservations.length} reservation(s) during this period but no checkouts. Revenue shows $0 because checkout-based calculation is selected. Consider converting to calendar-based calculation to see prorated revenue.`;
            }
        } else {
            // For calendar mode: flag if any reservation spans beyond the period AND is 14+ nights (long stay)
            const longStayReservations = overlappingReservations.filter(res => {
                const checkIn = new Date(res.checkInDate);
                const checkOut = new Date(res.checkOutDate);
                const nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                // Only flag as long-stay if: spans beyond period AND is 14+ nights
                return (checkIn < periodStart || checkOut > periodEnd) && nights >= 14;
            });
            if (longStayReservations.length > 0) {
                shouldConvertToCalendar = true;
                calendarConversionNotice = `This property has long-stay reservation(s) spanning beyond the statement period. Prorated calendar calculation is applied.`;
            }
        }

        // Get expenses for the date range
        // Note: SecureStay expenses are already filtered by property in FileDataService.getExpenses()
        // so we don't need to filter by propertyId here for SecureStay expenses (they have propertyId: null)
        const periodExpensesAll = expenses.filter(exp => {
            // For file-based expenses, filter by propertyId (use parseInt to ensure proper type comparison)
            if (propertyId && exp.propertyId !== null && parseInt(exp.propertyId) !== parseInt(propertyId)) {
                return false;
            }
            const expenseDate = new Date(exp.date);
            return expenseDate >= periodStart && expenseDate <= periodEnd;
        });
        const llCoverExpenses = periodExpensesAll.filter(exp => isLlCoverExpense(exp));
        const periodExpenses = periodExpensesAll.filter(exp => !isLlCoverExpense(exp));

        // Check if this is a co-host on Airbnb property (need this early for revenue calculation)
        let isCohostOnAirbnb = false;
        let airbnbPassThroughTax = false;
        let disregardTax = false;
        let cleaningFeePassThrough = false;
        let listingInfo = null;
        if (propertyId) {
            listingInfo = await ListingService.getListingWithPmFee(parseInt(propertyId));
            // Merge Hostify cleaningFee from listings
            const hostifyListing = listings.find(l => l.id === parseInt(propertyId));
            if (listingInfo && hostifyListing) {
                listingInfo.cleaningFee = hostifyListing.cleaningFee || 0;
            }
            isCohostOnAirbnb = listingInfo?.isCohostOnAirbnb || false;
            airbnbPassThroughTax = listingInfo?.airbnbPassThroughTax || false;
            disregardTax = listingInfo?.disregardTax || false;
            cleaningFeePassThrough = listingInfo?.cleaningFeePassThrough || false;
        }

        // Calculate totals - exclude Airbnb revenue if co-host is enabled
        const totalRevenue = periodReservations.reduce((sum, res) => {
            // Check if this is an Airbnb reservation
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');

            // Exclude Airbnb revenue for co-hosted properties (client gets paid directly)
            if (isAirbnb && isCohostOnAirbnb) {
                return sum;
            }

            // Use clientRevenue (prorated) for calendar-based statements, grossAmount for checkout-based
            const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            return sum + revenue;
        }, 0);

        // Calculate total cleaning fee from reservations (for pass-through feature)
        // Formula: ceil(guestPaid / (1 + PM%)) rounded to nearest $5
        let totalCleaningFeeFromReservations = 0;
        if (cleaningFeePassThrough) {
            const pmPct = listingInfo?.pmFeePercentage || 15;
            totalCleaningFeeFromReservations = periodReservations.reduce((sum, res) => {
                const guestPaidCleaningFee = res.cleaningFee || 0;
                const calculatedFee = guestPaidCleaningFee > 0
                    ? Math.ceil((guestPaidCleaningFee / (1 + pmPct / 100)) / 5) * 5
                    : 0;
                return sum + calculatedFee;
            }, 0);
        }

        // Filter expenses - if cleaningFeePassThrough is enabled, exclude "Cleaning" expenses
        const filteredExpenses = cleaningFeePassThrough
            ? periodExpenses.filter(exp => {
                const category = (exp.category || '').toLowerCase();
                const type = (exp.type || '').toLowerCase();
                const description = (exp.description || '').toLowerCase();
                // Exclude if categorized as cleaning or supplies
                return !category.includes('cleaning') && !type.includes('cleaning') && !description.startsWith('cleaning') && !category.includes('supplies') && !type.includes('supplies') && !description.includes('supplies');
            })
            : periodExpenses;

        // Generate cleaning fee expenses from reservations when pass-through is enabled
        // Formula: ceil(guestPaid / (1 + PM%)) rounded to nearest $5
        const cleaningFeeExpenses = [];
        if (cleaningFeePassThrough && periodReservations.length > 0) {
            const pmPctForExpenses = listingInfo?.pmFeePercentage || 15;
            for (const res of periodReservations) {
                const guestPaidCleaningFee = res.cleaningFee ?? listingInfo?.cleaningFee ?? 0;
                const calculatedCleaningFee = guestPaidCleaningFee > 0
                    ? Math.ceil((guestPaidCleaningFee / (1 + pmPctForExpenses / 100)) / 5) * 5
                    : 0;
                if (calculatedCleaningFee > 0) {
                    cleaningFeeExpenses.push({
                        id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                        propertyId: res.propertyId,
                        date: res.checkOutDate,
                        description: `Cleaning - ${res.guestName}`,
                        amount: -Math.abs(calculatedCleaningFee),
                        category: 'Cleaning',
                        type: 'cleaning',
                        vendor: 'Cleaning Service',
                        isAutoGenerated: true
                    });
                }
            }
        }

        // Combine all expenses with cleaning fee expenses
        const allExpenses = [...periodExpensesAll, ...cleaningFeeExpenses];

        // Separate expenses (negative/costs) from upsells (positive/revenue)
        const totalExpenses = filteredExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum : sum + Math.abs(exp.amount); // Only add actual expenses (costs)
        }, 0);

        // Calculate total upsells (additional payouts)
        const totalUpsells = filteredExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum + exp.amount : sum;
        }, 0);

        // Calculate PM commission: For multi-property statements, calculate per-reservation based on property PM fee
        // For co-hosted properties, only calculate PM commission on non-Airbnb reservations
        let pmCommission = 0;
        let pmPercentage = 15; // For display purposes

        if (propertyId) {
            // Single property - use its PM fee for revenue (excluding co-hosted Airbnb)
            if (listingInfo && listingInfo.pmFeePercentage !== null) {
                pmPercentage = listingInfo.pmFeePercentage;
            }
            pmCommission = totalRevenue * (pmPercentage / 100);
        } else {
            // Multi-property statement - calculate PM commission per reservation
            const propertyPmFees = {}; // Cache PM fees to avoid repeated DB calls
            const propertyListings = {}; // Cache listing info

            for (const res of periodReservations) {
                if (!propertyPmFees[res.propertyId]) {
                    const listing = await ListingService.getListingWithPmFee(res.propertyId);
                    propertyPmFees[res.propertyId] = listing?.pmFeePercentage ?? 15;
                    propertyListings[res.propertyId] = listing;
                }

                // Check if this is Airbnb and co-hosted
                const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                const isCohostForProperty = propertyListings[res.propertyId]?.isCohostOnAirbnb || false;

                // Skip PM commission for co-hosted Airbnb reservations
                if (isAirbnb && isCohostForProperty) {
                    continue;
                }

                const resPmFee = propertyPmFees[res.propertyId];
                // Use clientRevenue (prorated) for calendar-based statements
                const resRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                const resCommission = resRevenue * (resPmFee / 100);
                pmCommission += resCommission;
            }

            // Calculate average PM percentage for display
            pmPercentage = totalRevenue > 0 ? (pmCommission / totalRevenue) * 100 : 15;
        }

        // Calculate fees per property
        const propertyCount = targetListings.length;
        const techFees = propertyCount * 50; // $50 per property
        const insuranceFees = propertyCount * 25; // $25 per property

        // Calculate owner payout using same per-reservation logic as PDF view
        // This ensures statement list shows same values as PDF
        let grossPayoutSum = 0;
        for (const res of periodReservations) {
            const resListingInfo = propertyId ? listingInfo : await ListingService.getListingWithPmFee(res.propertyId);
            const resPmPercentage = resListingInfo?.pmFeePercentage ?? 15;
            const resDisregardTax = resListingInfo?.disregardTax || false;
            const resAirbnbPassThroughTax = resListingInfo?.airbnbPassThroughTax || false;
            const resIsCohostOnAirbnb = resListingInfo?.isCohostOnAirbnb || false;
            const resWaiveCommission = resListingInfo?.waiveCommission || false;
            const resWaiveCommissionUntil = resListingInfo?.waiveCommissionUntil || null;

            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const isCohostAirbnb = isAirbnb && resIsCohostOnAirbnb;

            // Check if PM commission waiver is active
            const isWaiverActive = (() => {
                if (!resWaiveCommission) return false;
                if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                const stmtEnd = new Date(endDate + 'T00:00:00');
                return stmtEnd <= waiverEnd;
            })();

            const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            const luxuryFee = clientRevenue * (resPmPercentage / 100);
            // If waiver is active, don't deduct PM fee
            const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;
            const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
            // Reverse-engineer actual cleaning fee from guest-paid amount
            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
            const guestPaidCleaningFee = res.cleaningFee ?? resListingInfo?.cleaningFee ?? listingInfo?.cleaningFee ?? 0;
            const cleaningFeeForPassThrough = cleaningFeePassThrough && guestPaidCleaningFee > 0
                ? Math.ceil((guestPaidCleaningFee / (1 + resPmPercentage / 100)) / 5) * 5
                : 0;

            const shouldAddTax = !resDisregardTax && (!isAirbnb || resAirbnbPassThroughTax);

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

        // Generate unique ID
        const existingStatements = await FileDataService.getStatements();
        const newId = FileDataService.generateId(existingStatements);

        // Create statement object
        const statement = {
            id: newId,
            ownerId: owner.id === 'default' ? 1 : parseInt(owner.id),
            ownerName: owner.name,
            propertyId: propertyId ? parseInt(propertyId) : null,
            propertyName: propertyId ? (targetListings[0].nickname || targetListings[0].displayName || targetListings[0].name) : 'All Properties',
            weekStartDate: startDate,
            weekEndDate: endDate,
            calculationType,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            pmCommission: Math.round(pmCommission * 100) / 100,
            pmPercentage: pmPercentage,
            techFees: Math.round(techFees * 100) / 100,
            insuranceFees: Math.round(insuranceFees * 100) / 100,
            adjustments: 0,
            ownerPayout: Math.round(ownerPayout * 100) / 100,
            isCohostOnAirbnb: isCohostOnAirbnb,
            airbnbPassThroughTax: airbnbPassThroughTax,
            disregardTax: disregardTax,
            cleaningFeePassThrough: cleaningFeePassThrough,
            totalCleaningFee: Math.round(totalCleaningFeeFromReservations * 100) / 100,
            shouldConvertToCalendar,
            calendarConversionNotice,
            overlappingReservations: shouldConvertToCalendar ? overlappingReservations.map(res => ({
                id: res.id,
                hostifyId: res.hostifyId,
                guestName: res.guestName,
                checkInDate: res.checkInDate,
                checkOutDate: res.checkOutDate,
                source: res.source,
                grossAmount: res.grossAmount || 0,
                status: res.status
            })) : null,
            status: 'draft',
            sentAt: null,
            createdAt: new Date().toISOString(),
            // Snapshot internal notes from listing at time of statement creation
            internalNotes: listingInfo?.internalNotes || null,
            reservations: periodReservations,
            expenses: allExpenses, // Use all expenses including auto-generated cleaning fees
            duplicateWarnings: duplicateWarnings,
            items: [
                // Revenue items from reservations
                ...periodReservations.map(res => {
                    // Use clientRevenue (prorated) for calendar-based statements
                    const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                    return {
                        type: 'revenue',
                        description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                        amount: revenue,
                        date: res.checkOutDate,
                        category: 'booking'
                    };
                }),
                // Expenses and upsells - categorize based on amount sign and category
                // Use filteredExpenses to exclude cleaning expenses when pass-through is enabled
                ...filteredExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || (exp.expenseType === 'extras');

                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.description,
                        amount: Math.abs(exp.amount), // Always store as positive, type determines if it's added or subtracted
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing
                    };
                }),
                // LL Cover expenses are stored as hidden items for review
                ...llCoverExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || (exp.expenseType === 'extras');

                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.description,
                        amount: Math.abs(exp.amount),
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing,
                        hidden: true,
                        hiddenReason: 'll_cover'
                    };
                })
            ]
        };

        // Save statement to file
        await FileDataService.saveStatement(statement);

        // Log activity with proper fallbacks
        const propertyDisplay = statement.propertyName || `Property ${statement.propertyId || 'Unknown'}`;
        const periodDisplay = statement.weekStartDate && statement.weekEndDate
            ? `${statement.weekStartDate} to ${statement.weekEndDate}`
            : 'Unknown period';
        await ActivityLog.log(req, 'CREATE_STATEMENT', 'statement', statement.id, {
            ownerName: statement.ownerName || 'Unknown Owner',
            propertyName: propertyDisplay,
            period: periodDisplay
        });

        res.status(201).json({
            message: 'Statement generated successfully',
            statement: {
                id: statement.id,
                ownerPayout: statement.ownerPayout,
                totalRevenue: statement.totalRevenue,
                totalExpenses: statement.totalExpenses,
                itemCount: statement.items.length,
                shouldConvertToCalendar: statement.shouldConvertToCalendar,
                calendarConversionNotice: statement.calendarConversionNotice,
                overlappingReservationCount: statement.overlappingReservations ? statement.overlappingReservations.length : 0
            }
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'generateStatement' });
        res.status(500).json({ error: 'Failed to generate statement' });
    }
});

// PUT /api/statements-file/:id/status - Update statement status
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['draft', 'final', 'sent', 'paid'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        const oldStatus = statement.status;

        // Update status
        statement.status = status;
        if (status === 'sent') {
            statement.sentAt = new Date().toISOString();
        }

        // Save updated statement
        await FileDataService.saveStatement(statement);

        // Log activity with proper fallbacks
        const propertyName = statement.propertyName || statement.propertyNames || `Statement #${id}`;
        await ActivityLog.log(req, 'STATUS_UPDATE', 'statement', id, {
            oldStatus: oldStatus || 'unknown',
            newStatus: status,
            ownerName: statement.ownerName || 'Unknown Owner',
            propertyName: propertyName
        });

        res.json({ message: 'Statement status updated successfully' });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'updateStatementStatus' });
        res.status(500).json({ error: 'Failed to update statement status' });
    }
});

// GET /api/statements-file/:id/cancelled-reservations - Get available cancelled reservations for a statement period
router.get('/:id/cancelled-reservations', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);

        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Use Hostify service for consistency with the rest of the app
        const hostifyService = require('../services/HostifyService');
        const propertyIds = statement.propertyIds || (statement.propertyId ? [statement.propertyId] : []);

        // Get all reservations for this period
        const apiResponse = await hostifyService.getAllReservations(
            statement.weekStartDate,
            statement.weekEndDate,
            null, // Get all, filter by property below
            'checkIn'
        );

        const allReservations = apiResponse.result || [];

        // Filter for ALL cancelled reservations that overlap with statement period
        const cancelledReservations = allReservations.filter(res => {
            // Only cancelled reservations
            if (res.status !== 'cancelled') return false;

            // Check if property matches
            const resPropertyId = parseInt(res.propertyId);
            if (!propertyIds.map(p => parseInt(p)).includes(resPropertyId)) return false;

            // Check date overlap - any part of reservation overlaps with statement period
            const resCheckIn = new Date(res.checkInDate);
            const resCheckOut = new Date(res.checkOutDate);
            const stmtStart = new Date(statement.weekStartDate);
            const stmtEnd = new Date(statement.weekEndDate);

            // Overlap: reservation starts before/on period end AND ends after/on period start
            const overlaps = resCheckIn <= stmtEnd && resCheckOut >= stmtStart;
            if (!overlaps) return false;

            // Check if already in statement (for informational purposes)
            const alreadyIncluded = statement.reservations?.some(existing =>
                existing.hostifyId === res.hostifyId || existing.hostawayId === res.hostifyId
            ) || false;
            res.alreadyInStatement = alreadyIncluded;

            return true;
        });

        res.json({
            cancelledReservations,
            count: cancelledReservations.length,
            statementPeriod: {
                start: statement.weekStartDate,
                end: statement.weekEndDate,
                propertyId: statement.propertyId,
                propertyIds: statement.propertyIds
            }
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'getCancelledReservations' });
        res.status(500).json({ error: 'Failed to get cancelled reservations' });
    }
});

// GET /api/statements-file/:id/available-reservations - Get all available reservations for a statement period
router.get('/:id/available-reservations', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);

        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Get all reservations for this property and period
        const reservations = await FileDataService.getReservations(
            statement.weekStartDate,
            statement.weekEndDate,
            statement.propertyId,
            statement.calculationType || 'checkout'
        );

        // Separate into included and available
        const includedReservationIds = new Set(
            (statement.reservations || []).map(r => r.hostifyId || r.id)
        );

        const availableReservations = reservations.filter(res => {
            const resId = res.hostifyId || res.id;
            return !includedReservationIds.has(resId);
        });

        res.json({
            availableReservations,
            count: availableReservations.length,
            statementPeriod: {
                start: statement.weekStartDate,
                end: statement.weekEndDate,
                propertyId: statement.propertyId,
                calculationType: statement.calculationType || 'checkout'
            }
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'getAvailableReservations' });
        res.status(500).json({ error: 'Failed to get available reservations' });
    }
});

// PUT /api/statements-file/:id/reconfigure - Reconfigure statement dates and calculation type
router.put('/:id/reconfigure', async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, calculationType = 'checkout' } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        if (periodStart > periodEnd) {
            return res.status(400).json({ error: 'Start date must be before end date' });
        }

        // Get existing statement
        const existingStatement = await FileDataService.getStatementById(id);
        if (!existingStatement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Preserve custom reservations (manually added)
        const customReservations = (existingStatement.reservations || []).filter(r => r.isCustom === true);
        const customReservationItems = (existingStatement.items || []).filter(item =>
            item.type === 'revenue' && customReservations.some(cr =>
                item.description && item.description.includes(cr.guestName)
            )
        );

        // Preserve manually removed expense descriptions (to re-remove them)
        // We can't perfectly track this, but we preserve the statement's manual edits flag

        const propertyId = existingStatement.propertyId;
        const propertyIds = existingStatement.propertyIds;
        const ownerId = existingStatement.ownerId;

        // Handle combined multi-property statements
        if (existingStatement.isCombinedStatement && propertyIds && propertyIds.length > 1) {
            // Regenerate as combined statement
            const [listings, owners] = await Promise.all([
                FileDataService.getListings(),
                FileDataService.getOwners()
            ]);

            const targetListings = listings.filter(l => propertyIds.includes(l.id) || propertyIds.includes(l.id.toString()));
            const owner = owners.find(o => o.id === ownerId || o.id === parseInt(ownerId)) || owners[0];

            // Fetch reservations and expenses for all properties
            const reservationPromises = propertyIds.map(pid =>
                FileDataService.getReservations(startDate, endDate, pid, calculationType)
            );
            const expensePromises = propertyIds.map(pid =>
                FileDataService.getExpenses(startDate, endDate, pid)
            );

            const [reservationsArrays, expensesArrays] = await Promise.all([
                Promise.all(reservationPromises),
                Promise.all(expensePromises)
            ]);

            // Flatten and dedupe
            const allReservations = reservationsArrays.flat();
            const allExpenses = expensesArrays.flat();
            const llCoverExpenses = allExpenses.filter(exp => isLlCoverExpense(exp));
            const visibleExpenses = allExpenses.filter(exp => !isLlCoverExpense(exp));

            // Build property PM fees map
            const propertyPmFees = {};
            targetListings.forEach(l => {
                propertyPmFees[l.id] = l.pmFeePercentage ?? 15;
            });

            // Calculate totals
            let totalRevenue = 0;
            let pmCommission = 0;
            let totalExpenses = 0;
            let totalUpsells = 0;

            for (const res of allReservations) {
                const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                totalRevenue += revenue;
                const resPmFee = propertyPmFees[res.propertyId] ?? 15;
                pmCommission += revenue * (resPmFee / 100);
            }

            for (const exp of visibleExpenses) {
                const isUpsell = exp.amount > 0 || (exp.type?.toLowerCase() === 'upsell') || (exp.category?.toLowerCase() === 'upsell');
                if (isUpsell) {
                    totalUpsells += Math.abs(exp.amount);
                } else {
                    totalExpenses += Math.abs(exp.amount);
                }
            }

            const techFees = targetListings.length * 50;
            const insuranceFees = targetListings.length * 25;
            const ownerPayout = totalRevenue - pmCommission + totalUpsells - totalExpenses;

            // Merge custom reservations back
            const mergedReservations = [...allReservations, ...customReservations];

            // Recalculate with custom reservations
            for (const cr of customReservations) {
                totalRevenue += cr.amount || 0;
            }
            const finalOwnerPayout = totalRevenue - pmCommission + totalUpsells - totalExpenses;

            // Update the statement
            const updatedStatement = {
                weekStartDate: startDate,
                weekEndDate: endDate,
                calculationType,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalExpenses: Math.round(totalExpenses * 100) / 100,
                pmCommission: Math.round(pmCommission * 100) / 100,
                techFees: Math.round(techFees * 100) / 100,
                insuranceFees: Math.round(insuranceFees * 100) / 100,
                ownerPayout: Math.round(finalOwnerPayout * 100) / 100,
                status: 'draft',
                updatedAt: new Date().toISOString(),
                reservations: mergedReservations,
                expenses: allExpenses,
                items: [
                    ...allReservations.map(res => ({
                        type: 'revenue',
                        description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                        amount: res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0),
                        date: res.checkOutDate,
                        category: 'booking'
                    })),
                    // Add custom reservation items back
                    ...customReservations.map(cr => ({
                        type: 'revenue',
                        description: `${cr.guestName} - ${cr.checkInDate} to ${cr.checkOutDate}`,
                        amount: cr.amount || 0,
                        date: cr.checkOutDate,
                        category: 'custom'
                    })),
                    ...visibleExpenses.map(exp => {
                        const isUpsell = exp.amount > 0 || (exp.type?.toLowerCase() === 'upsell') || (exp.category?.toLowerCase() === 'upsell');
                        return {
                            type: isUpsell ? 'upsell' : 'expense',
                            description: exp.description,
                            amount: Math.abs(exp.amount),
                            date: exp.date,
                            category: exp.type || exp.category || 'expense',
                            vendor: exp.vendor,
                            listing: exp.listing
                        };
                    }),
                    ...llCoverExpenses.map(exp => {
                        const isUpsell = exp.amount > 0 || (exp.type?.toLowerCase() === 'upsell') || (exp.category?.toLowerCase() === 'upsell');
                        return {
                            type: isUpsell ? 'upsell' : 'expense',
                            description: exp.description,
                            amount: Math.abs(exp.amount),
                            date: exp.date,
                            category: exp.type || exp.category || 'expense',
                            vendor: exp.vendor,
                            listing: exp.listing,
                            hidden: true,
                            hiddenReason: 'll_cover'
                        };
                    })
                ]
            };

            await FileDataService.updateStatement(id, updatedStatement);
            const refreshedStatement = await FileDataService.getStatementById(id);

            return res.json({
                message: 'Statement reconfigured successfully',
                statement: refreshedStatement,
                preserved: { customReservations: customReservations.length }
            });
        }

        // Single property statement
        const [listings, reservations, expenses, owners] = await Promise.all([
            FileDataService.getListings(),
            FileDataService.getReservations(startDate, endDate, propertyId, calculationType),
            FileDataService.getExpenses(startDate, endDate, propertyId),
            FileDataService.getOwners()
        ]);

        const listing = listings.find(l => l.id === parseInt(propertyId));
        if (!listing) {
            return res.status(404).json({ error: 'Property not found' });
        }

        const owner = owners.find(o => o.id === ownerId || o.id === parseInt(ownerId)) || owners[0];

        // Get listing configuration
        const pmPercentage = listing.pmFeePercentage ?? 15;
        const isCohostOnAirbnb = listing.isCohostOnAirbnb || false;
        const airbnbPassThroughTax = listing.airbnbPassThroughTax || false;
        const disregardTax = listing.disregardTax || false;
        const cleaningFeePassThrough = listing.cleaningFeePassThrough || false;
        const waiveCommission = listing.waiveCommission || false;
        const waiveCommissionUntil = listing.waiveCommissionUntil || null;

        // Filter reservations for this property
        const periodReservations = reservations.filter(res => {
            if (propertyId && res.propertyId !== parseInt(propertyId)) return false;
            const validStatuses = ['confirmed', 'modified', 'new', 'accepted'];
            return validStatuses.includes(res.status?.toLowerCase());
        });

        // Calculate totals
        let totalRevenue = 0;
        let totalCleaningFeeFromReservations = 0;

        for (const res of periodReservations) {
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            if (isAirbnb && isCohostOnAirbnb) continue;
            const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            totalRevenue += revenue;
            if (cleaningFeePassThrough) {
                // Formula: ceil(guestPaid / (1 + PM%)) rounded to nearest $5
                const guestPaidCleaningFee = res.cleaningFee ?? listing.cleaningFee ?? 0;
                const calculatedFee = guestPaidCleaningFee > 0
                    ? Math.ceil((guestPaidCleaningFee / (1 + pmPercentage / 100)) / 5) * 5
                    : 0;
                totalCleaningFeeFromReservations += calculatedFee;
            }
        }

        // Filter and calculate expenses
        const expenseCandidates = expenses.filter(exp => !isLlCoverExpense(exp));
        const llCoverExpenses = expenses.filter(exp => isLlCoverExpense(exp));
        const filteredExpenses = cleaningFeePassThrough
            ? expenseCandidates.filter(exp => {
                const cat = (exp.category || exp.type || '').toLowerCase();
                const desc = (exp.description || '').toLowerCase();
                return !cat.includes('cleaning') && !cat.includes('supplies') && !desc.includes('cleaning') && !desc.includes('supplies');
            })
            : expenseCandidates;

        let totalExpenses = 0;
        let totalUpsells = 0;

        for (const exp of filteredExpenses) {
            const isUpsell = exp.amount > 0 || (exp.type?.toLowerCase() === 'upsell') || (exp.category?.toLowerCase() === 'upsell') || exp.expenseType === 'extras';
            if (isUpsell) {
                totalUpsells += Math.abs(exp.amount);
            } else {
                totalExpenses += Math.abs(exp.amount);
            }
        }

        // Add cleaning fee expenses if pass-through enabled
        const allExpenses = [...filteredExpenses];
        if (cleaningFeePassThrough && periodReservations.length > 0) {
            for (const res of periodReservations) {
                const cleaningFee = res.cleaningFee ?? listing.cleaningFee ?? 0;
                if (cleaningFee > 0) {
                    allExpenses.push({
                        description: `Cleaning Fee - ${res.guestName}`,
                        amount: -cleaningFee,
                        date: res.checkOutDate,
                        category: 'Cleaning',
                        type: 'cleaning',
                        autoGenerated: true
                    });
                    totalExpenses += cleaningFee;
                }
            }
        }

        // Calculate PM commission
        const pmCommission = totalRevenue * (pmPercentage / 100);

        // Calculate fees
        const techFees = 50;
        const insuranceFees = 25;

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
            // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
            const guestPaidCleaningFee = res.cleaningFee ?? listing.cleaningFee ?? 0;
            const cleaningFeeForPassThrough = cleaningFeePassThrough && guestPaidCleaningFee > 0
                ? Math.ceil((guestPaidCleaningFee / (1 + pmPercentage / 100)) / 5) * 5
                : 0;
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

        // Merge custom reservations back and recalculate
        const mergedReservations = [...periodReservations, ...customReservations];
        let customRevenue = 0;
        for (const cr of customReservations) {
            customRevenue += cr.amount || 0;
        }
        const finalTotalRevenue = totalRevenue + customRevenue;
        const finalOwnerPayout = grossPayoutSum + customRevenue + totalUpsells - totalExpenses;

        // Update the statement
        const updatedStatement = {
            weekStartDate: startDate,
            weekEndDate: endDate,
            calculationType,
            totalRevenue: Math.round(finalTotalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            pmCommission: Math.round(pmCommission * 100) / 100,
            pmPercentage,
            techFees: Math.round(techFees * 100) / 100,
            insuranceFees: Math.round(insuranceFees * 100) / 100,
            ownerPayout: Math.round(finalOwnerPayout * 100) / 100,
            isCohostOnAirbnb,
            airbnbPassThroughTax,
            disregardTax,
            cleaningFeePassThrough,
            totalCleaningFee: Math.round(totalCleaningFeeFromReservations * 100) / 100,
            status: 'draft',
            updatedAt: new Date().toISOString(),
            reservations: mergedReservations,
            expenses: allExpenses,
            items: [
                ...periodReservations.map(res => ({
                    type: 'revenue',
                    description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                    amount: res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0),
                    date: res.checkOutDate,
                    category: 'booking'
                })),
                // Add custom reservation items back
                ...customReservations.map(cr => ({
                    type: 'revenue',
                    description: `${cr.guestName} - ${cr.checkInDate} to ${cr.checkOutDate}`,
                    amount: cr.amount || 0,
                    date: cr.checkOutDate,
                    category: 'custom'
                })),
                ...filteredExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type?.toLowerCase() === 'upsell') || (exp.category?.toLowerCase() === 'upsell') || exp.expenseType === 'extras';
                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.description,
                        amount: Math.abs(exp.amount),
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing
                    };
                }),
                ...llCoverExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type?.toLowerCase() === 'upsell') || (exp.category?.toLowerCase() === 'upsell') || exp.expenseType === 'extras';
                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.description,
                        amount: Math.abs(exp.amount),
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing,
                        hidden: true,
                        hiddenReason: 'll_cover'
                    };
                })
            ]
        };

        await FileDataService.updateStatement(id, updatedStatement);
        const refreshedStatement = await FileDataService.getStatementById(id);

        res.json({
            message: 'Statement reconfigured successfully',
            statement: refreshedStatement,
            preserved: { customReservations: customReservations.length }
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'reconfigureStatement' });
        res.status(500).json({ error: 'Failed to reconfigure statement' });
    }
});

// PUT /api/statements-file/:id - Edit statement (remove expenses, add cancelled reservations, etc.)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { expenseIdsToRemove, cancelledReservationIdsToAdd, reservationIdsToAdd, reservationIdsToRemove, customReservationToAdd, reservationCleaningFeeUpdates, expenseItemUpdates, upsellItemUpdates, itemVisibilityUpdates } = req.body;

        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        let modified = false;

        // Hide expenses and upsells by global index (keeps history for restore)
        if (expenseIdsToRemove && Array.isArray(expenseIdsToRemove) && expenseIdsToRemove.length > 0) {
            for (const globalIndex of expenseIdsToRemove) {
                const item = statement.items[globalIndex];
                if (!item || (item.type !== 'expense' && item.type !== 'upsell')) continue;
                if (!item.hidden) {
                    item.hidden = true;
                    if (!item.hiddenReason) {
                        item.hiddenReason = 'manual';
                    }
                    modified = true;
                }
            }
        }

        // Update item visibility (hide/show)
        if (itemVisibilityUpdates && Array.isArray(itemVisibilityUpdates) && itemVisibilityUpdates.length > 0) {
            for (const update of itemVisibilityUpdates) {
                const { globalIndex, hidden } = update || {};
                if (typeof globalIndex !== 'number' || globalIndex < 0 || globalIndex >= statement.items.length) {
                    logger.warn('Invalid globalIndex for visibility update, skipping', { context: 'StatementsFile', globalIndex });
                    continue;
                }
                const item = statement.items[globalIndex];
                if (!item || (item.type !== 'expense' && item.type !== 'upsell')) {
                    logger.warn('Item at globalIndex is not a hideable item, skipping', { context: 'StatementsFile', globalIndex });
                    continue;
                }
                if (typeof hidden === 'boolean') {
                    if (item.hidden !== hidden) {
                        item.hidden = hidden;
                        if (hidden && !item.hiddenReason) {
                            item.hiddenReason = 'manual';
                        }
                        modified = true;
                    }
                }
            }
        }

        // Update expense items (edit date, description, category, amount)
        if (expenseItemUpdates && Array.isArray(expenseItemUpdates) && expenseItemUpdates.length > 0) {
            for (const update of expenseItemUpdates) {
                const { globalIndex, date, description, category, amount } = update;

                // Validate globalIndex is within bounds
                if (typeof globalIndex !== 'number' || globalIndex < 0 || globalIndex >= statement.items.length) {
                    logger.warn('Invalid globalIndex for expense update, skipping', { context: 'StatementsFile', globalIndex });
                    continue;
                }

                const item = statement.items[globalIndex];

                // Verify the item is an expense type
                if (item.type !== 'expense') {
                    logger.warn('Item at globalIndex is not an expense, skipping', { context: 'StatementsFile', globalIndex, type: item.type });
                    continue;
                }

                // Update the fields that were provided
                if (date !== undefined) item.date = date;
                if (description !== undefined) item.description = description;
                if (category !== undefined) item.category = category;
                if (amount !== undefined) item.amount = parseFloat(amount) || 0;

                modified = true;
            }
        }

        // Update upsell items (edit date, description, category, amount)
        if (upsellItemUpdates && Array.isArray(upsellItemUpdates) && upsellItemUpdates.length > 0) {
            for (const update of upsellItemUpdates) {
                const { globalIndex, date, description, category, amount } = update;

                // Validate globalIndex is within bounds
                if (typeof globalIndex !== 'number' || globalIndex < 0 || globalIndex >= statement.items.length) {
                    logger.warn('Invalid globalIndex for upsell update, skipping', { context: 'StatementsFile', globalIndex });
                    continue;
                }

                const item = statement.items[globalIndex];

                // Verify the item is an upsell type
                if (item.type !== 'upsell') {
                    logger.warn('Item at globalIndex is not an upsell, skipping', { context: 'StatementsFile', globalIndex, type: item.type });
                    continue;
                }

                // Update the fields that were provided
                if (date !== undefined) item.date = date;
                if (description !== undefined) item.description = description;
                if (category !== undefined) item.category = category;
                if (amount !== undefined) item.amount = parseFloat(amount) || 0;

                modified = true;
            }
        }

        // Remove reservations
        if (reservationIdsToRemove && Array.isArray(reservationIdsToRemove) && reservationIdsToRemove.length > 0) {
            const originalReservationsCount = (statement.reservations || []).length;

            // First, find the reservations that will be removed (BEFORE filtering them out)
            const removedReservations = (statement.reservations || []).filter(res => {
                const resId = res.hostifyId || res.id;
                return reservationIdsToRemove.includes(resId);
            });

            // Remove reservations from the reservations array
            statement.reservations = (statement.reservations || []).filter(res => {
                const resId = res.hostifyId || res.id;
                return !reservationIdsToRemove.includes(resId);
            });

            // Also remove corresponding revenue items using the stored removed reservations
            statement.items = statement.items.filter(item => {
                if (item.type !== 'revenue') return true;

                // Check if this revenue item corresponds to a removed reservation
                // Match by guest name in the description
                for (const removedRes of removedReservations) {
                    if (removedRes && item.description && item.description.includes(removedRes.guestName)) {
                        return false;
                    }
                }
                return true;
            });

            if (statement.reservations.length < originalReservationsCount) {
                modified = true;
            }
        }

        // Add regular reservations
        if (reservationIdsToAdd && Array.isArray(reservationIdsToAdd) && reservationIdsToAdd.length > 0) {
            // Get all reservations for this statement's period to find the ones to add
            const allReservations = await FileDataService.getReservations(
                statement.weekStartDate,
                statement.weekEndDate,
                statement.propertyId,
                statement.calculationType || 'checkout'
            );

            const reservationsToAdd = allReservations.filter(res => {
                const resId = res.hostifyId || res.id;
                return reservationIdsToAdd.includes(resId);
            });

            if (reservationsToAdd.length > 0) {
                // Initialize reservations array if it doesn't exist
                if (!statement.reservations) {
                    statement.reservations = [];
                }

                // Get existing reservation IDs to prevent duplicates
                const existingResIds = new Set(
                    statement.reservations.map(r => r.hostifyId || r.id)
                );

                // Filter out reservations that are already in the statement
                const newReservationsToAdd = reservationsToAdd.filter(res => {
                    const resId = res.hostifyId || res.id;
                    return !existingResIds.has(resId);
                });

                if (newReservationsToAdd.length > 0) {
                    // Add the reservations to the statement
                    statement.reservations.push(...newReservationsToAdd);

                    // Add revenue items for these reservations
                    for (const reservation of newReservationsToAdd) {
                        const revenueItem = {
                            type: 'revenue',
                            description: `${reservation.guestName} - ${reservation.checkInDate} to ${reservation.checkOutDate}`,
                            amount: reservation.grossAmount || reservation.clientRevenue || 0,
                            date: reservation.checkOutDate,
                            category: 'booking'
                        };
                        statement.items.push(revenueItem);
                    }

                    modified = true;
                }
            }
        }

        // Add custom reservation
        if (customReservationToAdd && typeof customReservationToAdd === 'object') {
            // Validate required fields - now requires baseRate and grossPayout instead of amount
            const requiredFields = ['guestName', 'checkInDate', 'checkOutDate', 'baseRate', 'grossPayout'];
            const missingFields = requiredFields.filter(field => !customReservationToAdd[field]);

            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Missing required fields for custom reservation: ${missingFields.join(', ')}`
                });
            }

            // Check for duplicate custom reservation (same guest, dates, and grossPayout)
            const isDuplicate = (statement.reservations || []).some(res =>
                res.guestName === customReservationToAdd.guestName &&
                res.checkInDate === customReservationToAdd.checkInDate &&
                res.checkOutDate === customReservationToAdd.checkOutDate &&
                res.grossAmount === parseFloat(customReservationToAdd.grossPayout)
            );

            if (isDuplicate) {
                return res.status(400).json({
                    error: `Duplicate reservation: ${customReservationToAdd.guestName} (${customReservationToAdd.checkInDate} - ${customReservationToAdd.checkOutDate}) already exists in this statement`
                });
            }

            // Initialize reservations array if needed
            if (!statement.reservations) {
                statement.reservations = [];
            }

            // Parse all financial fields
            const baseRate = parseFloat(customReservationToAdd.baseRate) || 0;
            const guestFees = parseFloat(customReservationToAdd.guestFees) || 0;
            const platformFees = parseFloat(customReservationToAdd.platformFees) || 0;
            const tax = parseFloat(customReservationToAdd.tax) || 0;
            const pmCommission = parseFloat(customReservationToAdd.pmCommission) || 0;
            const grossPayout = parseFloat(customReservationToAdd.grossPayout) || 0;
            const resortFee = parseFloat(customReservationToAdd.guestPaidDamageCoverage) || 0; // stored as resortFee
            const platform = customReservationToAdd.platform || 'custom';

            // Create custom reservation object
            const nights = parseInt(customReservationToAdd.nights) ||
                Math.ceil((new Date(customReservationToAdd.checkOutDate) - new Date(customReservationToAdd.checkInDate)) / (1000 * 60 * 60 * 24));

            // Calculate clientRevenue (revenue before PM commission)
            const clientRevenue = grossPayout + pmCommission;

            const customReservation = {
                id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                guestName: customReservationToAdd.guestName,
                guestEmail: '',
                checkInDate: customReservationToAdd.checkInDate,
                checkOutDate: customReservationToAdd.checkOutDate,
                nights: nights,
                // Financial fields
                baseRate: baseRate,
                cleaningAndOtherFees: guestFees,
                platformFees: platformFees,
                clientTaxResponsibility: tax,
                luxuryLodgingFee: pmCommission,
                grossAmount: grossPayout,
                clientRevenue: clientRevenue,
                clientPayout: grossPayout,
                hostPayoutAmount: grossPayout,
                resortFee: resortFee, // Guest Paid Damage Coverage amount
                // Status and metadata
                status: 'confirmed',
                source: platform,
                description: customReservationToAdd.description || null,
                isCustom: true,
                isProrated: false,
                weeklyPayoutDate: null,
                hasDetailedFinance: true
            };

            statement.reservations.push(customReservation);

            // Add revenue item for this custom reservation
            const revenueItem = {
                type: 'revenue',
                description: `${customReservation.guestName}${customReservation.description ? ` - ${customReservation.description}` : ''} (${customReservation.checkInDate} to ${customReservation.checkOutDate})`,
                amount: customReservation.grossAmount,
                date: customReservation.checkOutDate,
                category: 'custom-booking'
            };
            statement.items.push(revenueItem);

            modified = true;
        }

        // Update reservation cleaning fees (for pass-through feature)
        if (reservationCleaningFeeUpdates && typeof reservationCleaningFeeUpdates === 'object' && Object.keys(reservationCleaningFeeUpdates).length > 0) {
            // reservationCleaningFeeUpdates is an object: { reservationId: newCleaningFee, ... }
            for (const [resIdStr, newCleaningFee] of Object.entries(reservationCleaningFeeUpdates)) {
                const resId = resIdStr;
                const cleaningFeeValue = parseFloat(newCleaningFee);

                if (!isNaN(cleaningFeeValue)) {
                    // Find the reservation in the statement
                    const reservation = (statement.reservations || []).find(res => {
                        const id = res.hostifyId || res.id;
                        return String(id) === String(resId);
                    });

                    if (reservation) {
                        // Update the cleaningFee for this reservation
                        reservation.cleaningFee = cleaningFeeValue;
                        modified = true;
                    }
                }
            }

            // Recalculate totalCleaningFee from all reservation cleaning fees
            if (statement.cleaningFeePassThrough) {
                statement.totalCleaningFee = (statement.reservations || []).reduce((sum, res) => {
                    return sum + (parseFloat(res.cleaningFee) || 0);
                }, 0);
            }
        }

        // Add cancelled reservations (legacy support)
        if (cancelledReservationIdsToAdd && Array.isArray(cancelledReservationIdsToAdd) && cancelledReservationIdsToAdd.length > 0) {
            // Get all reservations for this statement's period
            const allReservations = await FileDataService.getReservations(
                statement.weekStartDate,
                statement.weekEndDate,
                statement.propertyId,
                statement.calculationType || 'checkout'
            );

            const reservationsToAdd = allReservations.filter(res => {
                const resId = res.hostifyId || res.id;
                return cancelledReservationIdsToAdd.includes(resId) && res.status === 'cancelled';
            });

            if (reservationsToAdd.length > 0) {
                // Initialize reservations array if it doesn't exist
                if (!statement.reservations) {
                    statement.reservations = [];
                }

                // Add the reservations to the statement
                statement.reservations.push(...reservationsToAdd);

                // Add revenue items for these cancelled reservations (typically 0 or negative)
                for (const reservation of reservationsToAdd) {
                    // For cancelled reservations, we might add a cancellation fee or refund adjustment
                    const cancelItem = {
                        type: 'revenue',
                        description: `${reservation.guestName} - CANCELLED (${reservation.checkInDate} to ${reservation.checkOutDate})`,
                        amount: 0, // Cancelled reservations typically don't contribute revenue
                        date: reservation.checkOutDate,
                        category: 'cancellation'
                    };
                    statement.items.push(cancelItem);
                }

                modified = true;
            }
        }

        if (modified) {
            // Recalculate totals after modifications
            const expenses = statement.items.filter(item => {
                if (item.type !== 'expense') return false;
                if (isHiddenItem(item)) return false;
                // Exclude cleaning expenses when cleaningFeePassThrough is enabled
                if (statement.cleaningFeePassThrough) {
                    const category = (item.category || '').toLowerCase();
                    const description = (item.description || '').toLowerCase();
                    if (category.includes('cleaning') || description.startsWith('cleaning') || category.includes('supplies') || description.includes('supplies')) {
                        return false;
                    }
                }
                return true;
            });

            // Calculate totalRevenue from reservations array (which has correct prorated values)
            // Use clientRevenue for detailed finance, otherwise fall back to grossAmount
            statement.totalRevenue = (statement.reservations || []).reduce((sum, res) => {
                const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                return sum + revenue;
            }, 0);

            statement.totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);

            // Calculate PM Commission respecting custom reservation values
            // - Custom reservations: use user-entered luxuryLodgingFee
            // - Regular reservations: calculate from clientRevenue × pmPercentage
            const pmPercentage = parseFloat(statement.pmPercentage || 10);
            statement.pmCommission = Math.round((statement.reservations || []).reduce((sum, res) => {
                if (res.isCustom && res.luxuryLodgingFee !== undefined) {
                    // Custom reservation: use user-entered PM Commission
                    return sum + (parseFloat(res.luxuryLodgingFee) || 0);
                } else {
                    // Regular reservation: calculate from revenue × percentage
                    const revenue = res.hasDetailedFinance ? (parseFloat(res.clientRevenue) || 0) : (parseFloat(res.grossAmount) || 0);
                    return sum + (revenue * (pmPercentage / 100));
                }
            }, 0) * 100) / 100;

            // Recalculate other fee types from expense items
            statement.techFees = expenses.filter(e => e.description && e.description.includes('Technology')).reduce((sum, item) => sum + item.amount, 0);
            statement.insuranceFees = expenses.filter(e => e.description && e.description.includes('Insurance')).reduce((sum, item) => sum + item.amount, 0);

            // Calculate total upsells from items
            const totalUpsells = statement.items?.filter(item => item.type === 'upsell' && !isHiddenItem(item)).reduce((sum, item) => sum + item.amount, 0) || 0;

            // Recalculate owner payout (GROSS PAYOUT + ADDITIONAL PAYOUTS - EXPENSES)
            // Note: techFees and insuranceFees are stored but not included in payout calculation
            const adjustments = parseFloat(statement.adjustments || 0);
            statement.ownerPayout = Math.round((statement.totalRevenue - statement.pmCommission + totalUpsells - statement.totalExpenses - adjustments) * 100) / 100;

            // Keep statement as draft when edited (unless already sent/final)
            if (statement.status !== 'sent' && statement.status !== 'final') {
                statement.status = 'draft';
            }

            // Save updated statement (Sequelize will automatically update the timestamp)
            const updatedStatement = await FileDataService.saveStatement(statement);

            // Use the updated statement data from database
            statement.updatedAt = updatedStatement.updatedAt || updatedStatement.updated_at;

            res.json({
                message: 'Statement updated successfully',
                statement: {
                    id: statement.id,
                    totalRevenue: statement.totalRevenue,
                    totalExpenses: statement.totalExpenses,
                    pmCommission: statement.pmCommission,
                    techFees: statement.techFees,
                    insuranceFees: statement.insuranceFees,
                    ownerPayout: statement.ownerPayout,
                    status: statement.status,
                    itemsCount: statement.items.length,
                    reservationsCount: statement.reservations?.length || 0,
                    updatedAt: statement.updatedAt
                }
            });
        } else {
            res.json({ message: 'No changes made to statement' });
        }
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'editStatement' });
        res.status(500).json({ error: 'Failed to edit statement' });
    }
});

// DELETE /api/statements-file/:id - Delete statement
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if statement exists
        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Only allow deletion of draft statements
        if (statement.status && statement.status !== 'draft') {
            return res.status(403).json({
                error: 'Cannot delete finalized statement. Please return to draft status first.',
                status: statement.status
            });
        }

        // Delete the statement
        await FileDataService.deleteStatement(id);

        // Log activity with proper fallbacks
        const propertyDisplay = statement.propertyName || statement.propertyNames || `Statement #${id}`;
        const periodDisplay = statement.weekStartDate && statement.weekEndDate
            ? `${statement.weekStartDate} to ${statement.weekEndDate}`
            : '';
        await ActivityLog.log(req, 'DELETE', 'statement', id, {
            ownerName: statement.ownerName || 'Unknown Owner',
            propertyName: propertyDisplay,
            period: periodDisplay
        });

        res.json({
            message: 'Statement deleted successfully',
            id: parseInt(id)
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'deleteStatement' });
        res.status(500).json({ error: 'Failed to delete statement' });
    }
});
// GET /api/statements-file/:id/view - get
router.get('/:id/view/data', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);
        logger.debug('Statement data', { context: 'StatementsFile', statement });
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Fetch current listing settings for waiver info
        if (statement.propertyId) {
            const currentListing = await ListingService.getListingWithPmFee(parseInt(statement.propertyId));
            if (currentListing) {
                statement.waiveCommission = Boolean(currentListing.waiveCommission);
                statement.waiveCommissionUntil = currentListing.waiveCommissionUntil || null;
            }
        }

        // Inject cleaning fee expenses for statements with pass-through enabled
        if (statement.cleaningFeePassThrough && statement.reservations && statement.reservations.length > 0) {
            const existingExpenses = statement.expenses || [];
            const existingItems = statement.items || [];
            const hasCleaningExpenses = existingExpenses.some(e => e.type === 'cleaning' || (e.description && e.description.startsWith('Cleaning -')));
            const hasCleaningItems = existingItems.some(i => i.type === 'expense' && i.description && i.description.startsWith('Cleaning -'));

            if (!hasCleaningExpenses || !hasCleaningItems) {
                const cleaningFeeExpenses = [];
                const cleaningFeeItems = [];
                for (const res of statement.reservations) {
                    const cleaningFee = res.cleaningFee || 0;
                    if (cleaningFee > 0) {
                        cleaningFeeExpenses.push({
                            id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                            propertyId: statement.propertyId,
                            date: res.checkOutDate,
                            description: `Cleaning - ${res.guestName || 'Guest'}`,
                            amount: -Math.abs(cleaningFee),
                            category: 'Cleaning',
                            type: 'cleaning',
                            vendor: 'Cleaning Service',
                            isAutoGenerated: true
                        });
                        cleaningFeeItems.push({
                            type: 'expense',
                            description: `Cleaning - ${res.guestName || 'Guest'}`,
                            amount: -Math.abs(cleaningFee),
                            date: res.checkOutDate,
                            category: 'Cleaning',
                            isAutoGenerated: true
                        });
                    }
                }
                if (!hasCleaningExpenses) {
                    statement.expenses = [...existingExpenses, ...cleaningFeeExpenses];
                }
                if (!hasCleaningItems) {
                    statement.items = [...existingItems, ...cleaningFeeItems];
                }
            }
        }

        res.json({
            data: statement
        });
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'deleteStatement' });
        res.status(500).json({ error: 'Failed to delete statement' });
    }
});

// GET /api/statements-file/:id/view - View statement in browser
router.get('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        const isPdf = req.query.pdf === 'true'; // Hide download button for PDF generation
        const bodyClass = isPdf ? 'pdf-mode' : '';
        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Fetch CURRENT listing settings to override stored values
        // This allows changes to listing settings (like disregardTax) to affect existing statements

        // For combined statements, we need per-property settings for each reservation
        // Create a map: propertyId -> { isCohostOnAirbnb, disregardTax, airbnbPassThroughTax, pmFeePercentage }
        let listingSettingsMap = {};

        // Get listings from Hostify API (includes cleaningFee) merged with DB settings
        const allListings = await FileDataService.getListings();
        const hostifyListingMap = new Map(allListings.map(l => [parseInt(l.id), l]));

        if (statement.propertyIds && Array.isArray(statement.propertyIds) && statement.propertyIds.length > 0) {
            // COMBINED STATEMENT: Fetch settings for ALL properties
            const dbListings = await ListingService.getListingsWithPmFees(statement.propertyIds);
            dbListings.forEach(listing => {
                const hostifyListing = hostifyListingMap.get(parseInt(listing.id));
                listingSettingsMap[listing.id] = {
                    isCohostOnAirbnb: Boolean(listing.isCohostOnAirbnb),
                    disregardTax: Boolean(listing.disregardTax),
                    airbnbPassThroughTax: Boolean(listing.airbnbPassThroughTax),
                    cleaningFeePassThrough: Boolean(listing.cleaningFeePassThrough),
                    guestPaidDamageCoverage: Boolean(listing.guestPaidDamageCoverage),
                    waiveCommission: Boolean(listing.waiveCommission),
                    waiveCommissionUntil: listing.waiveCommissionUntil || null,
                    cleaningFee: hostifyListing?.cleaningFee || 0,
                    pmFeePercentage: listing.pmFeePercentage ?? 15,
                    nickname: listing.nickname || listing.displayName || listing.name || ''
                };
            });
            logger.debug('Combined statement - loaded settings for properties', { context: 'StatementsFile', properties: Object.keys(listingSettingsMap) });
        } else if (statement.propertyId) {
            // SINGLE PROPERTY STATEMENT: Fetch settings for just that property
            const currentListing = await ListingService.getListingWithPmFee(parseInt(statement.propertyId));
            const hostifyListing = hostifyListingMap.get(parseInt(statement.propertyId));
            if (currentListing) {
                // Use explicit boolean conversion to handle SQLite's 0/1 values
                statement.disregardTax = Boolean(currentListing.disregardTax);
                statement.isCohostOnAirbnb = Boolean(currentListing.isCohostOnAirbnb);
                statement.airbnbPassThroughTax = Boolean(currentListing.airbnbPassThroughTax);
                statement.cleaningFeePassThrough = Boolean(currentListing.cleaningFeePassThrough);
                statement.guestPaidDamageCoverage = Boolean(currentListing.guestPaidDamageCoverage);
                statement.pmPercentage = currentListing.pmFeePercentage ?? statement.pmPercentage ?? 15;

                // Also add to map for consistency
                listingSettingsMap[statement.propertyId] = {
                    isCohostOnAirbnb: Boolean(currentListing.isCohostOnAirbnb),
                    disregardTax: Boolean(currentListing.disregardTax),
                    airbnbPassThroughTax: Boolean(currentListing.airbnbPassThroughTax),
                    cleaningFeePassThrough: Boolean(currentListing.cleaningFeePassThrough),
                    guestPaidDamageCoverage: Boolean(currentListing.guestPaidDamageCoverage),
                    waiveCommission: Boolean(currentListing.waiveCommission),
                    waiveCommissionUntil: currentListing.waiveCommissionUntil || null,
                    cleaningFee: hostifyListing?.cleaningFee || 0,
                    pmFeePercentage: currentListing.pmFeePercentage ?? 15
                };
                // Also set on statement object for template access
                statement.waiveCommission = Boolean(currentListing.waiveCommission);
                statement.waiveCommissionUntil = currentListing.waiveCommissionUntil || null;
            }
        }

        // Ensure boolean values are properly set (fallback to false if undefined)
        // These are used as defaults when per-property settings are not available
        statement.disregardTax = Boolean(statement.disregardTax);
        statement.isCohostOnAirbnb = Boolean(statement.isCohostOnAirbnb);
        statement.airbnbPassThroughTax = Boolean(statement.airbnbPassThroughTax);
        statement.pmPercentage = statement.pmPercentage ?? 15;

        // Attach the settings map to the statement for use in HTML generation
        statement._listingSettingsMap = listingSettingsMap;

        // Inject cleaning fee expenses for statements with pass-through enabled
        if (statement.cleaningFeePassThrough && statement.reservations && statement.reservations.length > 0) {
            const existingExpenses = statement.expenses || [];
            const existingItems = statement.items || [];
            const hasCleaningExpenses = existingExpenses.some(e => e.type === 'cleaning' || (e.description && e.description.startsWith('Cleaning -')));
            const hasCleaningItems = existingItems.some(i => i.type === 'expense' && i.description && i.description.startsWith('Cleaning -'));

            if (!hasCleaningExpenses || !hasCleaningItems) {
                const cleaningFeeExpenses = [];
                const cleaningFeeItems = [];
                for (const res of statement.reservations) {
                    const cleaningFee = res.cleaningFee || 0;
                    if (cleaningFee > 0) {
                        cleaningFeeExpenses.push({
                            id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                            propertyId: statement.propertyId,
                            date: res.checkOutDate,
                            description: `Cleaning - ${res.guestName || 'Guest'}`,
                            amount: -Math.abs(cleaningFee),
                            category: 'Cleaning',
                            type: 'cleaning',
                            vendor: 'Cleaning Service',
                            isAutoGenerated: true
                        });
                        cleaningFeeItems.push({
                            type: 'expense',
                            description: `Cleaning - ${res.guestName || 'Guest'}`,
                            amount: -Math.abs(cleaningFee),
                            date: res.checkOutDate,
                            category: 'Cleaning',
                            isAutoGenerated: true
                        });
                    }
                }
                if (!hasCleaningExpenses) {
                    statement.expenses = [...existingExpenses, ...cleaningFeeExpenses];
                }
                if (!hasCleaningItems) {
                    statement.items = [...existingItems, ...cleaningFeeItems];
                }
            }
        }

        // Recalculate and sync values to database so list shows same values as PDF
        // This ensures consistency between statement list and PDF view
        let recalculatedTotalRevenue = 0;
        let recalculatedGrossPayout = 0;
        let recalculatedPmCommission = 0;

        statement.reservations?.forEach(reservation => {
            const propSettings = listingSettingsMap[reservation.propertyId] || {
                isCohostOnAirbnb: statement.isCohostOnAirbnb,
                disregardTax: statement.disregardTax,
                airbnbPassThroughTax: statement.airbnbPassThroughTax,
                cleaningFeePassThrough: statement.cleaningFeePassThrough,
                pmFeePercentage: statement.pmPercentage,
                waiveCommission: statement.waiveCommission || false,
                waiveCommissionUntil: statement.waiveCommissionUntil || null,
                cleaningFee: 0
            };

            const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
            const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

            const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
            // PM Commission: use stored value for custom reservations, otherwise calculate
            const luxuryFee = (reservation.isCustom && reservation.luxuryLodgingFee !== undefined)
                ? reservation.luxuryLodgingFee
                : clientRevenue * (propSettings.pmFeePercentage / 100);
            const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;
            // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
            const guestPaidCleaningFee = reservation.cleaningFee ?? propSettings.cleaningFee ?? 0;
            const cleaningFeeForPassThrough = propSettings.cleaningFeePassThrough && guestPaidCleaningFee > 0
                ? Math.ceil((guestPaidCleaningFee / (1 + propSettings.pmFeePercentage / 100)) / 5) * 5
                : 0;

            const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);

            // Check if PM commission waiver is active for this property
            const resWaiveCommission = propSettings.waiveCommission || false;
            const resWaiveCommissionUntil = propSettings.waiveCommissionUntil || null;
            const isWaiverActive = (() => {
                if (!resWaiveCommission) return false;
                if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                const stmtEnd = new Date(statement.weekEndDate + 'T00:00:00');
                return stmtEnd <= waiverEnd;
            })();
            const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;

            // Add to totals (skip revenue for co-host Airbnb)
            if (!isCohostAirbnb) {
                recalculatedTotalRevenue += clientRevenue;
            }
            recalculatedPmCommission += luxuryFeeToDeduct; // Show $0 when waived

            let grossPayout;
            // For custom reservations, use stored grossAmount exactly as entered
            if (reservation.isCustom) {
                grossPayout = reservation.grossAmount;
            } else if (isCohostAirbnb) {
                grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
            } else if (shouldAddTax) {
                grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
            } else {
                grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
            }
            recalculatedGrossPayout += grossPayout;
        });

        const totalUpsells = statement.items?.filter(item => item.type === 'upsell' && !isHiddenItem(item)).reduce((sum, item) => sum + item.amount, 0) || 0;
        const totalExpenses = statement.items?.filter(item => {
            if (item.type !== 'expense') return false;
            if (isHiddenItem(item)) return false;
            // Exclude cleaning expenses when cleaningFeePassThrough is enabled
            if (statement.cleaningFeePassThrough) {
                const category = (item.category || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                if (category.includes('cleaning') || description.startsWith('cleaning')) {
                    return false;
                }
            }
            return true;
        }).reduce((sum, item) => sum + item.amount, 0) || 0;
        const recalculatedNetPayout = recalculatedGrossPayout + totalUpsells - totalExpenses;

        // Update statement with recalculated values and save to database
        const valuesToUpdate = {
            totalRevenue: Math.round(recalculatedTotalRevenue * 100) / 100,
            pmCommission: Math.round(recalculatedPmCommission * 100) / 100,
            ownerPayout: Math.round(recalculatedNetPayout * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100
        };

        // Only update if values have changed (to avoid unnecessary writes)
        if (Math.abs(statement.ownerPayout - valuesToUpdate.ownerPayout) > 0.01 ||
            Math.abs(statement.totalRevenue - valuesToUpdate.totalRevenue) > 0.01) {
            try {
                await FileDataService.updateStatement(id, valuesToUpdate);
                // Update local statement object for HTML generation
                Object.assign(statement, valuesToUpdate);
                logger.debug('Updated statement with recalculated values', { context: 'StatementsFile', statementId: id, payout: valuesToUpdate.ownerPayout, revenue: valuesToUpdate.totalRevenue });
            } catch (updateError) {
                logger.warn('Failed to sync statement values', { context: 'StatementsFile', error: updateError.message });
            }
        }

        // Use statement's own internalNotes if available (snapshotted at creation)
        // Only fall back to listing notes for backward compatibility with old statements
        if (!statement.internalNotes) {
            if (statement.propertyIds && statement.propertyIds.length > 1) {
                // Combined statement - aggregate notes from all properties
                const notesArray = [];
                for (const propId of statement.propertyIds) {
                    const listing = allListings.find(l => parseInt(l.id) === parseInt(propId));
                    if (listing && listing.internalNotes) {
                        const displayName = listing.nickname || listing.displayName || listing.name || `Property ${propId}`;
                        notesArray.push(`[${displayName}]: ${listing.internalNotes}`);
                    }
                }
                if (notesArray.length > 0) {
                    statement.internalNotes = notesArray.join('\n\n');
                }
            } else {
                // Single property statement
                const propertyIdForNotes = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
                if (propertyIdForNotes) {
                    const listingForNotes = allListings.find(l => parseInt(l.id) === parseInt(propertyIdForNotes));
                    if (listingForNotes && listingForNotes.internalNotes) {
                        statement.internalNotes = listingForNotes.internalNotes;
                    }
                }
            }
        }

        // Generate HTML view of the statement
        const statementHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${statement.propertyName || `Statement ${id}`} - Luxury Lodging</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --luxury-navy: #1e3a5f;
            --luxury-gold: #d4af37;
            --luxury-light-gold: #f4e7c1;
            --luxury-cream: #faf8f3;
            --luxury-gray: #6b7280;
            --luxury-light-gray: #f8fafc;
            --luxury-green: #059669;
            --luxury-red: #dc2626;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
            max-width: 100%; 
            margin: 0; 
            padding: 0; 
            line-height: 1.4;
            color: var(--luxury-navy);
            background: white;
        }
        
        .document {
            background: white;
            overflow: hidden;
        }
        
        .header {
            background: white;
            padding: 15px 20px;
            border-bottom: 2px solid var(--luxury-navy);
        }
        
        .company-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        
        .company-info h1 {
            font-size: 20px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }
        
        .contact-info {
            font-size: 10px;
            color: var(--luxury-gray);
            font-weight: 500;
        }
        
        .logo-placeholder {
            width: 80px;
            height: 80px;
        }
        
        .logo-box {
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--luxury-gold);
            font-weight: 700;
            font-size: 12px;
        }
        
        .statement-details {
            margin-bottom: 20px;
        }
        
        .detail-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
            margin-bottom: 10px;
            padding: 10px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .detail-group {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        
        .detail-label {
            font-size: 9px;
            font-weight: 700;
            color: var(--luxury-gray);
            text-transform: uppercase;
            margin-bottom: 2px;
            letter-spacing: 0.3px;
        }
        
        .detail-value {
            font-size: 11px;
            font-weight: 600;
            color: var(--luxury-navy);
        }
        
        .owner-info {
            text-align: right;
            padding: 20px 0;
            border-top: 1px solid #e5e7eb;
        }
        
        .owner-name {
            font-size: 20px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 6px;
        }
        
        .owner-email {
            font-size: 13px;
            color: var(--luxury-gray);
            font-weight: 500;
        }
        
        .brand-title {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 2px;
            margin-bottom: 8px;
            text-transform: uppercase;
            color: var(--luxury-gold);
        }
        
        .statement-title {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 30px;
            letter-spacing: 1px;
        }
        
        .statement-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .meta-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            border-left: 3px solid var(--luxury-gold);
        }
        
        .meta-label {
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--luxury-light-gold);
            margin-bottom: 5px;
        }
        
        .meta-value {
            font-size: 16px;
            font-weight: 600;
        }
        
        .content {
            padding: 20px;
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 12px;
            padding: 8px 0;
            border-bottom: 2px solid var(--luxury-gold);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            position: relative;
        }
        
        .section-title::before {
            content: '';
            width: 6px;
            height: 100%;
            background: var(--luxury-gold);
            position: absolute;
            left: -20px;
            top: 0;
            border-radius: 3px;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .summary-item {
            background: white;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #e5e7eb;
            transition: all 0.2s ease;
        }

        .summary-item:hover {
            transform: translateY(-2px);
        }
        
        .summary-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--luxury-gray);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .summary-amount {
            font-size: 24px;
            font-weight: 700;
            color: var(--luxury-navy);
        }
        
        .payout-highlight {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            color: white;
            text-align: center;
            padding: 25px;
            border-radius: 12px;
            border: 3px solid var(--luxury-gold);
            margin: 30px 0;
        }
        
        .payout-label {
            font-size: 16px;
            font-weight: 500;
            color: var(--luxury-light-gold);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .payout-amount {
            font-size: 36px;
            font-weight: 700;
            color: var(--luxury-gold);
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid #e5e7eb;
        }
        
        .items-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 16px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .items-table td {
            padding: 14px 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
        }
        
        .items-table tr:nth-child(even) {
            background: white;
        }
        
        .items-table tr:hover {
            background: var(--luxury-light-gold);
        }
        
        .revenue {
            color: var(--luxury-navy);
            font-weight: 600;
        }
        
        .expense {
            color: var(--luxury-red);
            font-weight: 600;
        }
        
        .type-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .type-revenue {
            background: #d1fae5;
            color: var(--luxury-green);
        }
        
        .type-expense {
            background: #fee2e2;
            color: var(--luxury-red);
        }

        /* Calendar Conversion Notice Banner */
        .calendar-notice {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 2px solid #f59e0b;
            border-radius: 8px;
            padding: 16px 20px;
            margin: 0 20px 20px 20px;
        }

        .calendar-notice-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .calendar-notice-icon {
            font-size: 20px;
        }

        .calendar-notice-title {
            font-weight: 700;
            color: #92400e;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .calendar-notice-message {
            color: #78350f;
            font-size: 13px;
            line-height: 1.5;
        }

        /* Internal Notes Banner (screen only, not in PDF) */
        .internal-notes-banner {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 2px solid #d97706;
            border-radius: 8px;
            padding: 16px 20px;
            margin: 0 20px 20px 20px;
        }

        .internal-notes-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .internal-notes-icon {
            font-size: 18px;
        }

        .internal-notes-title {
            font-weight: 700;
            color: #92400e;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .internal-notes-content {
            color: #78350f;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
        }

        .overlapping-reservations {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #f59e0b;
        }

        .overlapping-reservations-title {
            font-weight: 600;
            color: #92400e;
            font-size: 12px;
            margin-bottom: 8px;
        }

        .overlapping-reservation-item {
            background: rgba(255,255,255,0.5);
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 6px;
            font-size: 12px;
            color: #78350f;
        }

        .footer {
            background: white;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer-content {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .generated-info {
            color: var(--luxury-gray);
            font-size: 14px;
            margin-bottom: 20px;
        }
        
        .print-button {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .print-button:hover {
            transform: translateY(-1px);
        }

        .action-buttons {
            display: flex;
            flex-wrap: nowrap;
            justify-content: center;
            gap: 8px;
            margin-top: 15px;
        }

        .action-btn {
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
        }

        .action-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        .action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        .action-btn.edit {
            background: #f59e0b;
            color: white;
        }

        .action-btn.regenerate {
            background: #6366f1;
            color: white;
        }

        .action-btn.download {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            color: white;
        }

        .action-btn.finalize {
            background: #10b981;
            color: white;
        }

        .action-btn.revert {
            background: #f97316;
            color: white;
        }

        .action-btn.delete {
            background: #ef4444;
            color: white;
        }

        .action-btn svg {
            width: 16px;
            height: 16px;
        }

        .action-btn.loading {
            pointer-events: none;
            opacity: 0.7;
        }

        .action-btn.loading svg.spinner {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Custom Modal Styles */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            justify-content: center;
            align-items: center;
        }

        .modal-overlay.active {
            display: flex;
        }

        .modal-box {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 420px;
            width: 90%;
            overflow: hidden;
            animation: modalSlideIn 0.2s ease-out;
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .modal-header {
            padding: 20px 24px 16px;
            border-bottom: 1px solid #e5e7eb;
        }

        .modal-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .modal-title svg {
            width: 22px;
            height: 22px;
        }

        .modal-title.warning svg { color: #f59e0b; }
        .modal-title.danger svg { color: #ef4444; }
        .modal-title.info svg { color: #3b82f6; }
        .modal-title.success svg { color: #10b981; }

        .modal-body {
            padding: 20px 24px;
        }

        .modal-message {
            font-size: 14px;
            color: #4b5563;
            line-height: 1.6;
            margin: 0;
        }

        .modal-footer {
            padding: 16px 24px 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .modal-btn {
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            border: none;
        }

        .modal-btn-cancel {
            background: #f3f4f6;
            color: #374151;
        }

        .modal-btn-cancel:hover {
            background: #e5e7eb;
        }

        .modal-btn-confirm {
            background: var(--luxury-navy);
            color: white;
        }

        .modal-btn-confirm:hover {
            background: #2d4a6b;
        }

        .modal-btn-confirm.danger {
            background: #ef4444;
        }

        .modal-btn-confirm.danger:hover {
            background: #dc2626;
        }

        .modal-btn-confirm.warning {
            background: #f59e0b;
        }

        .modal-btn-confirm.warning:hover {
            background: #d97706;
        }

        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-draft { background: #fef3c7; color: #92400e; }
        .status-generated { background: #dbeafe; color: #1e40af; }
        .status-sent { background: #d1fae5; color: #059669; }
        .status-paid { background: #e0e7ff; color: #5b21b6; }
        
        @media print {
            @page {
                size: A4 portrait;
                margin: 10mm;
            }

            body {
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .document {
                box-shadow: none;
                max-width: 100%;
                margin: 0;
                padding: 0;
            }
            .print-button { display: none; }
            .footer { display: none; }
            .calendar-notice { display: none; }
            .internal-notes-banner { display: none; }

            /* PDF-specific table styles */
            .rental-table, .expenses-table, .items-table {
                font-size: 9px !important;
                width: 100% !important;
            }

            .rental-table th, .expenses-table th, .items-table th {
                padding: 6px 3px !important;
                font-size: 8px !important;
                background-color: #1e3a5f !important;
                color: white !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .rental-table td, .expenses-table td, .items-table td {
                padding: 5px 3px !important;
                font-size: 9px !important;
            }

            .totals-row {
                background-color: #1e3a5f !important;
                color: white !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .totals-row td {
                color: white !important;
            }

            /* Ensure page breaks work properly */
            /* Allow sections to break across pages to prevent dead space */
            .section {
                page-break-inside: auto;
            }

            /* Keep individual table rows together */
            tr {
                page-break-inside: avoid;
            }

            /* Keep section title with first few rows */
            .section-title {
                page-break-after: avoid;
            }

            thead {
                display: table-header-group;
            }

            .header {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
        
        @media (max-width: 768px) {
            body { padding: 20px 10px; }
            .content { padding: 20px 15px; }
            .summary-grid { grid-template-columns: 1fr; }
            .statement-meta { grid-template-columns: 1fr; }
        }
        
        .statement-summary {
            display: flex;
            justify-content: flex-end;
            margin-top: 30px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto;
        }
        
        .summary-box {
            background: white;
            padding: 25px;
            border: 2px solid var(--luxury-navy);
            border-radius: 12px;
            width: 450px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            orphans: 5;
            widows: 5;
        }

        .summary-table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        .summary-table td {
            padding: 12px 0;
            border-bottom: 1px solid #eee;
            font-size: 14px;
        }

        .summary-table tr:last-child td {
            border-bottom: none;
        }

        .summary-label {
            font-weight: 500;
            color: var(--luxury-navy);
        }

        .summary-value {
            text-align: right;
            font-weight: 600;
            font-size: 15px;
        }

        .summary-value.revenue {
            color: #28a745;
        }

        .summary-value.expense {
            color: #dc3545;
        }

        .total-row {
            page-break-before: avoid !important;
            break-before: avoid !important;
        }

        .total-row td {
            padding-top: 20px;
            margin-top: 10px;
            border-top: none;
            border-bottom: none !important;
            font-size: 16px;
            position: relative;
        }

        .total-row td::before {
            content: '';
            position: absolute;
            top: 5px;
            left: 0;
            right: 0;
            height: 2px;
            background-color: var(--luxury-navy);
        }

        .total-amount {
            color: var(--luxury-navy);
            font-size: 18px;
        }

        .expenses-container {
            overflow-x: auto;
            margin-bottom: 30px;
            background: white;
        }

        .expenses-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            background: white;
            font-size: 11px;
        }

        .expenses-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 12px 8px;
            text-align: center;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .expenses-table th:first-child {
            border-left: 1px solid var(--luxury-navy);
        }

        .expenses-table th:last-child {
            border-right: 1px solid var(--luxury-navy);
        }

        .expenses-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: middle;
            text-align: center;
        }

        .expenses-table td:first-child {
            border-left: 1px solid #e5e7eb;
        }

        .expenses-table td:last-child {
            border-right: 1px solid #e5e7eb;
        }

        .expenses-table tr:hover {
            background: white;
        }

        .expenses-table .date-cell {
            width: 12%;
            font-weight: 500;
        }

        .expenses-table .description-cell {
            width: 30%;
            text-align: left;
        }

        .expenses-table .vendor-cell {
            width: 16%;
            color: var(--luxury-gray);
        }

        .expenses-table .listing-cell {
            width: 16%;
            color: var(--luxury-gray);
            font-size: 10px;
        }

        .expenses-table .category-cell {
            width: 12%;
            text-transform: capitalize;
            color: var(--luxury-gray);
        }

        .expenses-table .amount-cell {
            width: 14%;
            text-align: right;
            font-weight: 600;
        }

        .expenses-table .totals-row {
            background: var(--luxury-navy);
            color: white;
        }

        .expenses-table .totals-row td {
            border-bottom: none;
            padding: 12px 8px;
            font-weight: 600;
        }
        
        .rental-table-container {
            overflow-x: auto;
            margin-bottom: 30px;
            background: white;
        }

        .rental-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            background: white;
            font-size: 9px;
        }

        .rental-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 10px 4px;
            text-align: center;
            font-weight: 600;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border-right: 1px solid rgba(255,255,255,0.2);
            white-space: normal;
            word-wrap: break-word;
            line-height: 1.4;
            vertical-align: middle;
        }

        .rental-table th:first-child {
            border-left: 1px solid var(--luxury-navy);
        }

        .rental-table th:last-child {
            border-right: 1px solid var(--luxury-navy);
        }

        /* Column widths - supports 8 or 9 columns (with Cleaning Expense) */
        .rental-table th:nth-child(1) { width: 17%; }   /* Guest Details with dates */
        .rental-table th:nth-child(2) { width: 9%; }    /* Base Rate */
        .rental-table th:nth-child(3) { width: 11%; }   /* Guest Fees */
        .rental-table th:nth-child(4) { width: 9%; }    /* Platform Fees */
        .rental-table th:nth-child(5) { width: 9%; }    /* Revenue */
        .rental-table th:nth-child(6) { width: 10%; }   /* PM Commission */
        .rental-table th:nth-child(7) { width: 9%; }    /* Cleaning Expense OR Tax */
        .rental-table th:nth-child(8) { width: 9%; }    /* Tax OR Gross Payout */
        .rental-table th:nth-child(9) { width: 10%; }   /* Gross Payout (when 9 cols) */
        
        .rental-table td {
            padding: 10px 6px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 9px;
            text-align: center;
            vertical-align: middle;
            line-height: 1.5;
        }

        .rental-table td:first-child {
            border-left: 1px solid #e5e7eb;
        }

        .rental-table td:last-child {
            border-right: 1px solid #e5e7eb;
        }

        .booking-cell {
            text-align: center !important;
            padding: 12px 8px !important;
        }

        .guest-details-cell {
            text-align: left !important;
            padding: 12px 8px !important;
            vertical-align: middle;
        }

        .guest-name {
            font-weight: 700;
            color: var(--luxury-navy);
            font-size: 10px;
            margin-bottom: 4px;
            text-align: left;
        }

        .guest-info {
            font-size: 9px;
            color: var(--luxury-gray);
            line-height: 1.5;
            margin-bottom: 4px;
            text-align: left;
        }

        .booking-details {
            font-size: 8px;
            color: var(--luxury-gray);
            line-height: 1.4;
        }
        
        .listing-info {
            font-weight: 600;
            margin-bottom: 2px;
            color: #444;
        }
        
        .stay-info {
            margin-bottom: 2px;
            color: #666;
        }
        
        .date-cell {
            font-size: 9px;
            white-space: nowrap;
        }
        
        .text-center {
            text-align: center;
        }
        
        .channel-badge {
            display: inline-block;
            background: var(--luxury-light-gold);
            color: var(--luxury-navy);
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 600;
            text-transform: uppercase;
            margin-top: 4px;
        }

        .proration-info {
            font-size: 8px !important;
            color: #007bff !important;
            margin-top: 4px !important;
        }
        
        .amount-cell {
            text-align: right;
            font-weight: 600;
            font-size: 9px;
            padding-right: 4px !important;
        }
        
        .payout-cell {
            font-weight: 700;
            background: #f0f9ff !important;
        }
        
        .expense-amount {
            color: var(--luxury-red);
        }

        .revenue-amount {
            color: var(--luxury-green);
        }

        .info-amount {
            color: #2563eb;
        }
        
        .rental-table tr:nth-child(even) {
            background: white;
        }
        
        .rental-table .totals-row {
            background: var(--luxury-navy);
            color: white;
            font-weight: 700;
        }

        .rental-table .totals-row td {
            padding: 12px 6px;
            border-bottom: none;
            font-size: 10px;
        }
        
        /* Page setup for PDF - Portrait mode */
        @page {
            size: A4 portrait;
            margin: 1cm;
        }

        /* Print styles */
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }

            body {
                padding: 0;
                font-size: 9px;
                background: white !important;
                color: #333 !important;
            }

            .document {
                background: white !important;
                box-shadow: none !important;
            }

            .header {
                padding: 15px 20px;
                background: white !important;
                color: #1e3a5f !important;
                border-bottom: 2px solid #1e3a5f;
            }

            .header .company-name {
                color: #1e3a5f !important;
            }

            .header .company-contact {
                color: #666 !important;
            }

            .content {
                padding: 20px;
                background: white !important;
            }

            .statement-meta {
                background: white !important;
                border: 1px solid #e9ecef;
            }

            .rental-table {
                font-size: 8px;
                page-break-inside: auto;  /* Allow table to break across pages */
                table-layout: fixed;
                width: 100%;
            }

            .rental-table th {
                font-size: 7px;
                padding: 4px 2px;
                background: #1e3a5f !important;
                color: white !important;
            }

            .rental-table td {
                font-size: 8px;
                padding: 8px 4px;
                border-bottom: 1px solid #e9ecef;
                word-wrap: break-word;
                overflow: hidden;
                vertical-align: middle;
            }

            .rental-table .totals-row td {
                background: #1e3a5f !important;
                color: white !important;
            }

            .guest-details-cell {
                padding: 10px 6px !important;
                text-align: left !important;
                vertical-align: middle;
            }

            .guest-name {
                font-size: 9px;
                color: #333 !important;
                margin-bottom: 3px;
                text-align: left;
            }

            .guest-info, .booking-details {
                font-size: 8px;
                color: #666 !important;
                margin-bottom: 3px;
                text-align: left;
            }

            .amount-cell {
                font-size: 8px;
            }

            .channel-badge {
                font-size: 6px;
                padding: 2px 4px;
                background: #f4e7c1 !important;
                color: #1e3a5f !important;
            }

            .section-title {
                font-size: 14px;
                color: #1e3a5f !important;
            }

            .expense-amount {
                color: #dc2626 !important;
            }

            .revenue-amount {
                color: #059669 !important;
            }

            .info-amount {
                color: #2563eb !important;
            }

            .print-button {
                display: none !important;
            }
        }
        
        .rental-table .guest-info {
            text-align: left;
            max-width: 120px;
        }
        
        .rental-table .listing-info {
            text-align: left;
            max-width: 100px;
        }
        
        .rental-table .amount {
            text-align: right;
            font-weight: 600;
            min-width: 80px;
        }
        
        .rental-table .text-center {
            text-align: center;
        }
        
        .rental-table .totals-row td {
            background: var(--luxury-navy);
            color: white;
            font-weight: 700;
            border-right: 1px solid rgba(255,255,255,0.2);
        }
        
        .rental-table .payout-cell {
            background: var(--luxury-light-gold);
            font-weight: 700;
            color: var(--luxury-navy);
        }
        
        .rental-table .totals-row .payout-cell {
            background: var(--luxury-navy) !important;
            color: white !important;
        }
        /* PDF-specific styles - apply print styles when body has pdf-mode class */
        body.pdf-mode {
            padding: 0;
            font-size: 9px;
            background: white !important;
            color: #333 !important;
        }

        body.pdf-mode .document {
            background: white !important;
            box-shadow: none !important;
        }

        body.pdf-mode .header {
            padding: 15px 20px;
            background: white !important;
            color: #1e3a5f !important;
            border-bottom: 2px solid #1e3a5f;
        }

        body.pdf-mode .content {
            padding: 20px;
            background: white !important;
        }

        body.pdf-mode .rental-table {
            font-size: 8px;
            page-break-inside: auto;  /* Allow table to break across pages to prevent dead space */
            table-layout: fixed;
            width: 100%;
        }

        body.pdf-mode .rental-table th {
            font-size: 7px;
            padding: 6px 4px;
            background: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .rental-table td {
            font-size: 8px;
            padding: 8px 4px;
            border-bottom: 1px solid #e9ecef;
            vertical-align: middle;
        }

        body.pdf-mode .rental-table .totals-row td {
            background: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .guest-details-cell {
            padding: 10px 6px !important;
            text-align: left !important;
            vertical-align: middle;
        }

        body.pdf-mode .guest-name {
            font-size: 9px;
            color: #333 !important;
            margin-bottom: 3px;
            text-align: left;
        }

        body.pdf-mode .guest-info,
        body.pdf-mode .booking-details {
            font-size: 8px;
            color: #666 !important;
            margin-bottom: 3px;
            text-align: left;
        }

        body.pdf-mode .amount-cell {
            font-size: 8px;
        }

        body.pdf-mode .channel-badge {
            font-size: 6px;
            padding: 2px 4px;
            background: #f4e7c1 !important;
            color: #1e3a5f !important;
        }

        body.pdf-mode .section-title {
            font-size: 14px;
            color: #1e3a5f !important;
        }

        body.pdf-mode .expense-amount {
            color: #dc2626 !important;
        }

        body.pdf-mode .revenue-amount {
            color: #059669 !important;
        }

        body.pdf-mode .info-amount {
            color: #2563eb !important;
        }

        body.pdf-mode .print-button {
            display: none !important;
        }

        body.pdf-mode .footer {
            display: none !important;
        }

        body.pdf-mode .calendar-notice {
            display: none !important;
        }

        body.pdf-mode .internal-notes-banner {
            display: none !important;
        }

        body.pdf-mode .expenses-table {
            font-size: 10px !important;
            width: 100% !important;
        }

        body.pdf-mode .expenses-table th {
            padding: 10px 6px !important;
            font-size: 9px !important;
            background-color: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .expenses-table td {
            padding: 10px 6px !important;
            font-size: 10px !important;
            vertical-align: middle;
        }

        body.pdf-mode .totals-row {
            background-color: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .totals-row td {
            color: white !important;
        }

        body.pdf-mode .section {
            page-break-inside: auto;  /* Allow sections to break across pages to prevent dead space */
            break-inside: auto;
        }

        body.pdf-mode tr {
            page-break-inside: avoid;  /* Keep individual rows together */
            break-inside: avoid;
        }

        body.pdf-mode .section-title {
            page-break-after: avoid;  /* Keep title with content */
        }

        body.pdf-mode thead {
            display: table-header-group;  /* Repeat table header on each page */
        }

        body.pdf-mode .summary-box {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto;
        }

        body.pdf-mode .summary-table {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        body.pdf-mode .statement-summary {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto;
            background: white !important;
        }

        body.pdf-mode .section {
            background: white !important;
        }

        body.pdf-mode .total-row {
            page-break-before: avoid !important;
            break-before: avoid !important;
        }
        .action-btn.pay-owner {
            color: #059669;
            background: #ecfdf5;
            border: 1px solid #d1fae5;
        }
        .action-btn.pay-owner:hover:not(:disabled) {
            background: #d1fae5;
            color: #047857;
        }
    </style>
</head>
<body class="${bodyClass}">
    <div class="document">
    <div class="header">
            <div class="company-header">
                <div class="company-info">
                    <h1>Luxury Lodging</h1>
                    <div class="contact-info">
                        <span>support@luxurylodgingpm.com | +1 (813) 594-8882</span>
    </div>
            </div>
    </div>

            <div class="statement-details">
                <div class="detail-row">
                    <div class="detail-group">
                        <span class="detail-label">Statement period:</span>
                        <span class="detail-value">${statement.weekStartDate} - ${statement.weekEndDate}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Calculation:</span>
                        <span class="detail-value" style="color: ${statement.calculationType === 'calendar' ? '#007bff' : '#666'};">
                            ${statement.calculationType === 'calendar' ? 'Calendar-based (prorated)' : 'Check-out based'}
                        </span>
            </div>
                    <div class="detail-group">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
                    <div class="detail-group">
                        <span class="detail-label">Property/Owner:</span>
                        <span class="detail-value">${statement.propertyName}</span>
            </div>
            </div>
                
                ${statement.ownerId !== 1 && statement.ownerName !== 'Default' && statement.ownerName !== 'Default Owner' ? `
                <div class="owner-info">
                    <div class="owner-name">${statement.ownerName}</div>
                    <div class="owner-email">owner@example.com | (555) 000-0000</div>
            </div>
                ` : ''}
            </div>
        </div>

        <div class="content">
    <!-- Calendar Conversion Notice (if applicable) - Hidden in PDF mode -->
    ${(statement.shouldConvertToCalendar && !isPdf) ? `
    <div class="calendar-notice">
        <div class="calendar-notice-header">
            <span class="calendar-notice-icon">&#9888;</span>
            <span class="calendar-notice-title">Calendar Conversion Recommended</span>
        </div>
        <div class="calendar-notice-message">${statement.calendarConversionNotice || (
                    statement.calculationType === 'checkout'
                        ? 'This property has reservation(s) during this period but no checkouts. Revenue shows $0 because checkout-based calculation is selected. Consider converting to calendar-based calculation to see prorated revenue.'
                        : 'This property has long-stay reservation(s) spanning beyond the statement period. Prorated calendar calculation is applied.'
                )}</div>
        ${statement.overlappingReservations && statement.overlappingReservations.length > 0 ? `
        <div class="overlapping-reservations">
            <div class="overlapping-reservations-title">Reservations during this period:</div>
            ${statement.overlappingReservations.map(res => `
            <div class="overlapping-reservation-item">
                <strong>${res.guestName}</strong> - ${res.checkInDate} to ${res.checkOutDate} (${res.source || 'Direct'}) - $${(res.grossAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            `).join('')}
        </div>
        ` : ''}
    </div>
    ` : ''}

    <!-- Internal Notes (if any - visible on screen only, not in PDF) -->
    ${(statement.internalNotes && !isPdf) ? `
    <div class="internal-notes-banner">
        <div class="internal-notes-header">
            <span class="internal-notes-title">INTERNAL NOTES - PM ${statement.pmPercentage || listingSettingsMap[statement.propertyId]?.pmFeePercentage || 15}%</span>
        </div>
        <div class="internal-notes-content">${statement.internalNotes.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div class="section">
                <h2 class="section-title">RENTAL ACTIVITY</h2>
                ${(() => {
                // Check if ANY property has cleaningFeePassThrough enabled (for column display)
                const anyCleaningFeePassThrough = statement.cleaningFeePassThrough ||
                    (statement._listingSettingsMap && Object.values(statement._listingSettingsMap).some(s => s.cleaningFeePassThrough));
                // Check if ANY property has guestPaidDamageCoverage enabled (for column display)
                const anyGuestPaidDamageCoverage = statement.guestPaidDamageCoverage ||
                    (statement._listingSettingsMap && Object.values(statement._listingSettingsMap).some(s => s.guestPaidDamageCoverage));
                return `
                <div class="rental-table-container">
                    <table class="rental-table">
            <thead>
                <tr>
                                <th>Guest Details</th>
                                ${anyGuestPaidDamageCoverage ? '<th>Guest Paid Damage Coverage</th>' : ''}
                                <th>Base Rate</th>
                                <th>Guest Fees</th>
                                <th>Platform Fees</th>
                                <th>Revenue</th>
                                <th>PM Commission</th>
                                ${anyCleaningFeePassThrough ? '<th>Cleaning Expense</th>' : ''}
                                <th>Tax</th>
                                <th>Gross Payout</th>
                </tr>
            </thead>
            <tbody>
                            ${statement.reservations?.map(reservation => {
                    // Get per-property settings from the map, fall back to statement-level settings
                    const propSettings = statement._listingSettingsMap?.[reservation.propertyId] || {
                        isCohostOnAirbnb: statement.isCohostOnAirbnb,
                        disregardTax: statement.disregardTax,
                        airbnbPassThroughTax: statement.airbnbPassThroughTax,
                        cleaningFeePassThrough: statement.cleaningFeePassThrough,
                        pmFeePercentage: statement.pmPercentage,
                        waiveCommission: statement.waiveCommission || false,
                        waiveCommissionUntil: statement.waiveCommissionUntil || null,
                        cleaningFee: 0
                    };

                    // Check if this is an Airbnb reservation on a co-hosted property
                    const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
                    const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

                    // Use detailed financial data if available, otherwise fall back to calculated values
                    const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                    const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                    const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                    // PM Commission: use stored value for custom reservations, otherwise calculate
                    // Use per-property PM fee percentage for regular reservations
                    const luxuryFee = (reservation.isCustom && reservation.luxuryLodgingFee !== undefined)
                        ? reservation.luxuryLodgingFee
                        : clientRevenue * (propSettings.pmFeePercentage / 100);
                    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

                    // Tax calculation priority (uses per-property settings):
                    // 1. If disregardTax is true: NEVER add tax (company remits on behalf of owner)
                    // 2. For co-hosted Airbnb: Gross Payout is negative PM commission only
                    // 3. For Airbnb without pass-through: no tax added (Airbnb remits taxes)
                    // 4. For non-Airbnb OR Airbnb with pass-through: include tax responsibility
                    let grossPayout;
                    const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);

                    // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
                    // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
                    const guestPaidCleaningFee = reservation.cleaningFee ?? propSettings.cleaningFee ?? 0;
                    const cleaningFeeForPassThrough = propSettings.cleaningFeePassThrough && guestPaidCleaningFee > 0
                        ? Math.ceil((guestPaidCleaningFee / (1 + propSettings.pmFeePercentage / 100)) / 5) * 5
                        : 0;

                    // Check if PM commission waiver is active for this property
                    const resWaiveCommission = propSettings.waiveCommission || false;
                    const resWaiveCommissionUntil = propSettings.waiveCommissionUntil || null;
                    const isWaiverActive = (() => {
                        if (!resWaiveCommission) return false;
                        if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                        const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                        const stmtEnd = new Date(statement.weekEndDate + 'T00:00:00');
                        return stmtEnd <= waiverEnd;
                    })();
                    const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;

                    // For custom reservations, use stored grossAmount exactly as entered
                    if (reservation.isCustom) {
                        grossPayout = reservation.grossAmount;
                    } else if (isCohostAirbnb) {
                        grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
                    } else if (shouldAddTax) {
                        // Add tax: Non-Airbnb OR Airbnb with pass-through (and not disregardTax)
                        grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
                    } else {
                        // No tax: Airbnb without pass-through OR disregardTax is enabled
                        grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
                    }

                    // Get property nickname for combined statements
                    const propertyNickname = propSettings.nickname || '';
                    const isCombined = statement.propertyIds && statement.propertyIds.length > 1;

                    return `
                                <tr>
                                    <td class="guest-details-cell">
                                        <div class="guest-name">${reservation.guestName}</div>
                                        ${isCombined && propertyNickname ? `<div style="color: #6b7280; font-size: 11px; margin-top: 2px;">${propertyNickname}</div>` : ''}
                                        <div class="guest-info">${(() => {
                            const [yearIn, monthIn, dayIn] = reservation.checkInDate.split('-').map(Number);
                            const [yearOut, monthOut, dayOut] = reservation.checkOutDate.split('-').map(Number);
                            const checkIn = new Date(yearIn, monthIn - 1, dayIn).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                            const checkOut = new Date(yearOut, monthOut - 1, dayOut).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                            return `${checkIn} - ${checkOut} (${reservation.nights || 0}n)`;
                        })()}</div>
                                        <div class="channel-badge">${reservation.source}</div>
                                        ${reservation.prorationNote ?
                            `<div class="proration-info" style="font-size: 10px; color: #007bff; margin-top: 2px;">
                                                ${reservation.prorationNote}
                                            </div>` : ''
                        }
                                    </td>
                                    ${anyGuestPaidDamageCoverage ? `<td class="amount-cell info-amount">$${(reservation.resortFee || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>` : ''}
                                    <td class="amount-cell revenue-amount">$${baseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell revenue-amount">$${cleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell expense-amount">-$${platformFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell revenue-amount">$${clientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell expense-amount">-$${luxuryFeeToDeduct.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    ${anyCleaningFeePassThrough ? `<td class="amount-cell expense-amount">-$${cleaningFeeForPassThrough.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>` : ''}
                                    <td class="amount-cell ${shouldAddTax ? 'revenue-amount' : 'info-amount'}">$${taxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell payout-cell ${grossPayout < 0 ? 'expense-amount' : 'revenue-amount'}">${grossPayout >= 0 ? '$' : '-$'}${Math.abs(grossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                                `;
                }).join('') || `<tr><td colspan="${8 + (anyGuestPaidDamageCoverage ? 1 : 0) + (anyCleaningFeePassThrough ? 1 : 0)}" style="text-align: center; color: var(--luxury-gray); font-style: italic;">No rental activity found</td></tr>`}
                            ${(() => {
                        // Calculate totals using the same logic as individual rows
                        let totalBaseRate = 0;
                        let totalCleaningFees = 0;
                        let totalPlatformFees = 0;
                        let totalClientRevenue = 0;
                        let totalLuxuryFee = 0;
                        let totalCleaningExpense = 0; // For cleaning fee pass-through
                        let totalTaxResponsibility = 0;
                        let totalGrossPayout = 0;
                        let totalResortFee = 0; // For Guest Paid Damage Coverage

                        statement.reservations?.forEach(reservation => {
                            // Get per-property settings from the map, fall back to statement-level settings
                            const propSettings = statement._listingSettingsMap?.[reservation.propertyId] || {
                                isCohostOnAirbnb: statement.isCohostOnAirbnb,
                                disregardTax: statement.disregardTax,
                                airbnbPassThroughTax: statement.airbnbPassThroughTax,
                                cleaningFeePassThrough: statement.cleaningFeePassThrough,
                                pmFeePercentage: statement.pmPercentage,
                                waiveCommission: statement.waiveCommission || false,
                                waiveCommissionUntil: statement.waiveCommissionUntil || null,
                                cleaningFee: 0
                            };

                            const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
                            const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

                            const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                            const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                            const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                            const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                            // PM Commission: use stored value for custom reservations, otherwise calculate
                            const luxuryFee = (reservation.isCustom && reservation.luxuryLodgingFee !== undefined)
                                ? reservation.luxuryLodgingFee
                                : clientRevenue * (propSettings.pmFeePercentage / 100);
                            const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

                            const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);

                            // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
                            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
                            const guestPaidCleaningFee = reservation.cleaningFee ?? propSettings.cleaningFee ?? 0;
                            const cleaningFeeForPassThrough = propSettings.cleaningFeePassThrough && guestPaidCleaningFee > 0
                                ? Math.ceil((guestPaidCleaningFee / (1 + propSettings.pmFeePercentage / 100)) / 5) * 5
                                : 0;

                            // Check if PM commission waiver is active for this property
                            const resWaiveCommission = propSettings.waiveCommission || false;
                            const resWaiveCommissionUntil = propSettings.waiveCommissionUntil || null;
                            const isWaiverActive = (() => {
                                if (!resWaiveCommission) return false;
                                if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                                const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                                const stmtEnd = new Date(statement.weekEndDate + 'T00:00:00');
                                return stmtEnd <= waiverEnd;
                            })();
                            const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;

                            let grossPayout;
                            // For custom reservations, use stored grossAmount exactly as entered
                            if (reservation.isCustom) {
                                grossPayout = reservation.grossAmount;
                            } else if (isCohostAirbnb) {
                                grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
                            } else if (shouldAddTax) {
                                grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
                            } else {
                                grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
                            }

                            totalBaseRate += baseRate;
                            totalCleaningFees += cleaningFees;
                            totalPlatformFees += platformFees;
                            totalClientRevenue += clientRevenue;
                            totalLuxuryFee += luxuryFeeToDeduct;
                            totalCleaningExpense += cleaningFeeForPassThrough;
                            totalTaxResponsibility += taxResponsibility;
                            totalGrossPayout += grossPayout;
                            totalResortFee += (reservation.resortFee || 0);
                        });

                        return `
                            <tr class="totals-row">
                                <td><strong>TOTALS</strong></td>
                                ${anyGuestPaidDamageCoverage ? `<td class="amount-cell"><strong>$${totalResortFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>` : ''}
                                <td class="amount-cell"><strong>$${totalBaseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${totalCleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>-$${Math.abs(totalPlatformFees).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${totalClientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>-$${Math.abs(totalLuxuryFee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                ${anyCleaningFeePassThrough ? `<td class="amount-cell"><strong>-$${Math.abs(totalCleaningExpense).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>` : ''}
                                <td class="amount-cell"><strong>$${totalTaxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell payout-cell"><strong>${totalGrossPayout >= 0 ? '$' : '-$'}${Math.abs(totalGrossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                            </tr>`;
                    })()}
            </tbody>
        </table>
            </div>
            </div>`;
            })()}

    ${statement.duplicateWarnings && statement.duplicateWarnings.length > 0 ? `
    <!-- Duplicate Warnings Section -->
    <div class="section" style="margin-bottom: 20px;">
        <div class="warning-box" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 16px; display: flex; align-items: center;">
                Potential Duplicate Expenses Detected
            </h3>
            <p style="color: #856404; margin: 0 0 15px 0; font-size: 14px;">
                We found ${statement.duplicateWarnings.length} potential duplicate expense${statement.duplicateWarnings.length > 1 ? 's' : ''} between different sources. Please review:
            </p>
            <div class="duplicates-list">
                ${statement.duplicateWarnings.map((dup, index) => `
                    <div style="background: white; border: 1px solid #e9ecef; border-radius: 4px; padding: 12px; margin-bottom: 10px;">
                        <div style="font-weight: 600; color: #495057; margin-bottom: 8px;">Duplicate ${index + 1}:</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 13px;">
                            <div>
                                <div style="font-weight: 500; color: #6c757d;">Source: ${dup.expense1.source === 'securestay' ? 'SecureStay' : 'Uploaded File'}</div>
                                <div>${dup.expense1.description}</div>
                                <div style="color: #28a745; font-weight: 500;">$${dup.expense1.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                <div style="color: #6c757d; font-size: 12px;">${dup.expense1.date}</div>
                                ${dup.expense1.uploadFile ? `<div style="color: #6c757d; font-size: 11px;">File: ${dup.expense1.uploadFile}</div>` : ''}
            </div>
                            <div>
                                <div style="font-weight: 500; color: #6c757d;">Source: ${dup.expense2.source === 'securestay' ? 'SecureStay' : 'Uploaded File'}</div>
                                <div>${dup.expense2.description}</div>
                                <div style="color: #28a745; font-weight: 500;">$${dup.expense2.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                <div style="color: #6c757d; font-size: 12px;">${dup.expense2.date}</div>
                                ${dup.expense2.uploadFile ? `<div style="color: #6c757d; font-size: 11px;">File: ${dup.expense2.uploadFile}</div>` : ''}
            </div>
            </div>
            </div>
                `).join('')}
        </div>
        </div>
    </div>
    ` : ''}

    <!-- Expenses Section - only show if there are expenses (excluding cleaning when pass-through enabled) -->
    ${statement.items?.filter(item => {
                if (item.type !== 'expense') return false;
                if (isHiddenItem(item)) return false;
                // Exclude cleaning expenses when cleaningFeePassThrough is enabled
                if (statement.cleaningFeePassThrough) {
                    const category = (item.category || '').toLowerCase();
                    const description = (item.description || '').toLowerCase();
                    if (category.includes('cleaning') || description.startsWith('cleaning') || category.includes('supplies') || description.includes('supplies')) {
                        return false;
                    }
                }
                return true;
            }).length > 0 ? `
    <div class="section">
        <h2 class="section-title">EXPENSES</h2>
        <div class="expenses-container">
            <table class="expenses-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                        <th>Property</th>
                        <th>Category</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                    ${statement.items?.filter(item => {
                if (item.type !== 'expense') return false;
                if (isHiddenItem(item)) return false;
                // When cleaningFeePassThrough is enabled, hide cleaning expenses from this section
                if (statement.cleaningFeePassThrough) {
                    const category = (item.category || '').toLowerCase();
                    const description = (item.description || '').toLowerCase();
                    if (category.includes('cleaning') || description.startsWith('cleaning') || category.includes('supplies') || description.includes('supplies')) {
                        return false;
                    }
                }
                return true;
            }).map(expense => {
                // Check if this expense is part of a duplicate warning
                const isDuplicate = statement.duplicateWarnings && statement.duplicateWarnings.some(dup => {
                    const matchesExpense1 = dup.expense1.description === expense.description &&
                        Math.abs(dup.expense1.amount - expense.amount) < 0.01 &&
                        dup.expense1.date === expense.date;
                    const matchesExpense2 = dup.expense2.description === expense.description &&
                        Math.abs(dup.expense2.amount - expense.amount) < 0.01 &&
                        dup.expense2.date === expense.date;
                    return matchesExpense1 || matchesExpense2;
                });

                return `
                        <tr${isDuplicate ? ' style="background-color: #fff3cd; border-left: 4px solid #ffc107;"' : ''}>
                            <td class="date-cell">
                                ${(() => {
                        const [year, month, day] = expense.date.split('-').map(Number);
                        return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                    })()}
                                ${isDuplicate ? '<br><span style="color: #856404; font-size: 10px; font-weight: 600;">Duplicate</span>' : ''}
                            </td>
                            <td class="description-cell">${expense.description}</td>
                            <td class="listing-cell">${expense.listing || '-'}</td>
                            <td class="category-cell">${expense.category}</td>
                            <td class="amount-cell expense-amount">$${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    `;
            }).join('')}
                    <tr class="totals-row">
                        <td colspan="4"><strong>TOTAL EXPENSES</strong></td>
                        <td class="amount-cell expense-amount"><strong>$${(statement.items?.filter(item => {
                if (item.type !== 'expense') return false;
                if (isHiddenItem(item)) return false;
                // Exclude cleaning expenses when cleaningFeePassThrough is enabled
                if (statement.cleaningFeePassThrough) {
                    const category = (item.category || '').toLowerCase();
                    const description = (item.description || '').toLowerCase();
                    if (category.includes('cleaning') || description.startsWith('cleaning') || category.includes('supplies') || description.includes('supplies')) {
                        return false;
                    }
                }
                return true;
            }).reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
            </tbody>
        </table>
        </div>
    </div>
    ` : ''}

    <!-- Additional Payouts Section (Upsells) -->
    ${statement.items?.filter(item => item.type === 'upsell' && !isHiddenItem(item)).length > 0 ? `
    <div class="section">
        <h2 class="section-title">ADDITIONAL PAYOUTS</h2>
        <div class="expenses-container">
            <table class="expenses-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Property</th>
                    <th>Category</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                    ${statement.items?.filter(item => item.type === 'upsell' && !isHiddenItem(item)).map(upsell => `
                        <tr>
                            <td class="date-cell">
                                ${(() => {
                    const [year, month, day] = upsell.date.split('-').map(Number);
                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                })()}
                            </td>
                            <td class="description-cell">${upsell.description}</td>
                            <td class="listing-cell">${upsell.listing || '-'}</td>
                            <td class="category-cell">${upsell.category}</td>
                            <td class="amount-cell revenue-amount">+$${upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `).join('')}
                    <tr class="totals-row">
                        <td colspan="4" style="color: white;"><strong>TOTAL ADDITIONAL PAYOUTS</strong></td>
                        <td class="amount-cell revenue-amount" style="color: white;"><strong>+$${(statement.items?.filter(item => item.type === 'upsell' && !isHiddenItem(item)).reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
            </tbody>
        </table>
        </div>
    </div>
    ` : ''}

    <!-- Summary Section -->
    ${(() => {
                // Calculate summary values from reservations (same as TOTALS row)
                let summaryGrossPayout = 0;

                statement.reservations?.forEach(reservation => {
                    // Get per-property settings from the map, fall back to statement-level settings
                    const propSettings = statement._listingSettingsMap?.[reservation.propertyId] || {
                        isCohostOnAirbnb: statement.isCohostOnAirbnb,
                        disregardTax: statement.disregardTax,
                        airbnbPassThroughTax: statement.airbnbPassThroughTax,
                        cleaningFeePassThrough: statement.cleaningFeePassThrough,
                        pmFeePercentage: statement.pmPercentage,
                        waiveCommission: statement.waiveCommission || false,
                        waiveCommissionUntil: statement.waiveCommissionUntil || null,
                        cleaningFee: 0
                    };

                    const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
                    const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

                    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                    // PM Commission: use stored value for custom reservations, otherwise calculate
                    const luxuryFee = (reservation.isCustom && reservation.luxuryLodgingFee !== undefined)
                        ? reservation.luxuryLodgingFee
                        : clientRevenue * (propSettings.pmFeePercentage / 100);
                    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

                    // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
                    // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
                    const guestPaidCleaningFee = reservation.cleaningFee ?? propSettings.cleaningFee ?? 0;
                    const cleaningFeeForPassThrough = propSettings.cleaningFeePassThrough && guestPaidCleaningFee > 0
                        ? Math.ceil((guestPaidCleaningFee / (1 + propSettings.pmFeePercentage / 100)) / 5) * 5
                        : 0;

                    // Check if PM commission waiver is active for this property
                    const resWaiveCommission = propSettings.waiveCommission || false;
                    const resWaiveCommissionUntil = propSettings.waiveCommissionUntil || null;
                    const isWaiverActive = (() => {
                        if (!resWaiveCommission) return false;
                        if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                        const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                        const stmtEnd = new Date(statement.weekEndDate + 'T00:00:00');
                        return stmtEnd <= waiverEnd;
                    })();
                    const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;

                    const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);
                    let grossPayout;
                    // For custom reservations, use stored grossAmount exactly as entered
                    if (reservation.isCustom) {
                        grossPayout = reservation.grossAmount;
                    } else if (isCohostAirbnb) {
                        grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
                    } else if (shouldAddTax) {
                        grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
                    } else {
                        grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
                    }

                    summaryGrossPayout += grossPayout;
                });

                const totalUpsells = statement.items?.filter(item => item.type === 'upsell' && !isHiddenItem(item)).reduce((sum, item) => sum + item.amount, 0) || 0;
                const totalExpenses = statement.items?.filter(item => {
                    if (item.type !== 'expense') return false;
                    if (isHiddenItem(item)) return false;
                    // Exclude cleaning expenses when cleaningFeePassThrough is enabled
                    if (statement.cleaningFeePassThrough) {
                        const category = (item.category || '').toLowerCase();
                        const description = (item.description || '').toLowerCase();
                        if (category.includes('cleaning') || description.startsWith('cleaning')) {
                            return false;
                        }
                    }
                    return true;
                }).reduce((sum, item) => sum + item.amount, 0) || 0;
                const netPayout = summaryGrossPayout + totalUpsells - totalExpenses;

                return `
    <div class="section">
                <div class="statement-summary">
                    <div class="summary-box">
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Gross Payout</td>
                                <td class="summary-value ${summaryGrossPayout >= 0 ? 'revenue' : 'expense'}">${summaryGrossPayout >= 0 ? '$' : '-$'}${Math.abs(summaryGrossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            ${totalUpsells > 0 ? `
                            <tr>
                                <td class="summary-label">Additional Payouts</td>
                                <td class="summary-value revenue">+$${totalUpsells.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td class="summary-label">Expenses</td>
                                <td class="summary-value expense">-$${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr class="total-row">
                                <td class="summary-label"><strong>NET PAYOUT</strong></td>
                                <td class="summary-value total-amount"><strong>${netPayout >= 0 ? '$' : '-$'}${Math.abs(netPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>`;
            })()}

        ${isPdf ? '' : `<div class="footer">
            <div class="footer-content">
                <div class="generated-info">
                    Statement generated on ${new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}
                </div>
                <div class="action-buttons">
                    <button onclick="editStatement()" class="action-btn edit" ${statement.status === 'final' ? 'disabled title="Cannot edit finalized statement"' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Edit
                    </button>
                    <button onclick="regenerateStatement()" class="action-btn regenerate" id="regenerate-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        Regenerate
                    </button>
                    <button onclick="downloadStatement()" class="action-btn download">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download
                    </button>
                    ${statement.ownerPayout > 0 ? `
                        <button onclick="payOwner()" class="action-btn pay-owner" id="pay-owner-btn" 
                                ${statement.status !== 'final' ? 'disabled title="Statement must be finalized first"' :
                        (statement.payoutStatus === 'paid' ? 'disabled title="Already paid"' : '')}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                            ${statement.payoutStatus === 'paid' ? 'Paid' : 'Pay Owner'}
                        </button>
                    ` : ''}
                    <button onclick="finalizeStatement()" class="action-btn finalize" id="finalize-btn" ${statement.status === 'final' ? 'disabled title="Already finalized"' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        Finalize
                    </button>
                    <button onclick="revertToDraft()" class="action-btn revert" id="revert-btn" ${statement.status === 'draft' ? 'disabled title="Already a draft"' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        Return to Draft
                    </button>
                    <button onclick="deleteStatement()" class="action-btn delete" ${statement.status !== 'draft' ? 'disabled title="Can only delete draft statements"' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        Delete
                    </button>
                </div>
            </div>
        </div>

        <!-- Custom Modal -->
        <div id="customModal" class="modal-overlay">
            <div class="modal-box">
                <div class="modal-header">
                    <h3 id="modalTitle" class="modal-title"></h3>
                </div>
                <div class="modal-body">
                    <p id="modalMessage" class="modal-message"></p>
                </div>
                <div class="modal-footer">
                    <button id="modalCancel" class="modal-btn modal-btn-cancel">Cancel</button>
                    <button id="modalConfirm" class="modal-btn modal-btn-confirm">Confirm</button>
                </div>
            </div>
        </div>

        <!-- Edit Statement Modal -->
        <div id="editModal" class="modal-overlay" style="display: none;">
            <div class="modal-box" style="max-width: 650px; max-height: 90vh; overflow-y: auto; padding: 24px;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0;">Edit Statement</h3>
                    <button onclick="closeEditModal()" style="background: none; border: none; cursor: pointer; padding: 8px; border-radius: 6px; transition: background 0.2s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Statement Info Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 20px; background: #f9fafb; border-radius: 10px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
                    <div style="flex: 1; padding-right: 20px;">
                        <div style="font-weight: 600; font-size: 17px; color: #111827; margin-bottom: 6px;">${statement.propertyName || 'Combined Statement'}</div>
                        <div style="color: #9ca3af; font-size: 13px;">${statement.weekStartDate} to ${statement.weekEndDate}</div>
                    </div>
                    <div style="text-align: right; padding-left: 24px; margin-left: 8px; border-left: 2px solid #d1d5db;">
                        <div style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Current Payout</div>
                        <div style="font-size: 30px; font-weight: 700; color: #10b981; line-height: 1;">$${parseFloat(statement.ownerPayout || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div style="color: #9ca3af; font-size: 12px; margin-top: 6px;">Revenue: $${parseFloat(statement.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Expenses: $${parseFloat(statement.totalExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                </div>

                <!-- Statement Period & Settings -->
                <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        <span style="font-weight: 600; font-size: 15px; color: #0284c7;">Statement Period & Settings</span>
                    </div>

                    <!-- Date Inputs -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Start Date <span style="color: #ef4444;">*</span></label>
                            <input type="date" id="editStartDate" value="${statement.weekStartDate}" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">End Date <span style="color: #ef4444;">*</span></label>
                            <input type="date" id="editEndDate" value="${statement.weekEndDate}" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white;">
                        </div>
                    </div>

                    <!-- Quick Select -->
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
                        <span style="font-size: 13px; color: #6b7280; white-space: nowrap;">Quick select:</span>
                        <div style="display: flex; gap: 6px;">
                            <button onclick="setThisMonth()" style="padding: 6px 14px; background: white; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f3f4f6';this.style.borderColor='#9ca3af'" onmouseout="this.style.background='white';this.style.borderColor='#d1d5db'">This Month</button>
                            <button onclick="setLastMonth()" style="padding: 6px 14px; background: white; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f3f4f6';this.style.borderColor='#9ca3af'" onmouseout="this.style.background='white';this.style.borderColor='#d1d5db'">Last Month</button>
                            <button onclick="setThisYear()" style="padding: 6px 14px; background: white; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f3f4f6';this.style.borderColor='#9ca3af'" onmouseout="this.style.background='white';this.style.borderColor='#d1d5db'">This Year</button>
                        </div>
                    </div>

                    <!-- Calculation Method -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 10px;">Calculation Method <span style="color: #ef4444;">*</span></label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <label id="checkoutLabel" style="display: flex; align-items: flex-start; gap: 10px; padding: 14px; border: 2px solid ${statement.calculationType === 'checkout' || !statement.calculationType ? '#3b82f6' : '#e5e7eb'}; border-radius: 8px; cursor: pointer; background: ${statement.calculationType === 'checkout' || !statement.calculationType ? '#eff6ff' : 'white'}; transition: all 0.2s;">
                                <input type="radio" name="calcMethod" value="checkout" ${statement.calculationType === 'checkout' || !statement.calculationType ? 'checked' : ''} onchange="updateCalcMethod()" style="margin-top: 3px; width: 16px; height: 16px;">
                                <div>
                                    <div style="font-weight: 600; color: #111827; font-size: 14px;">Check-out Based</div>
                                    <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">Reservations that check out during period</div>
                                </div>
                            </label>
                            <label id="calendarLabel" style="display: flex; align-items: flex-start; gap: 10px; padding: 14px; border: 2px solid ${statement.calculationType === 'calendar' ? '#3b82f6' : '#e5e7eb'}; border-radius: 8px; cursor: pointer; background: ${statement.calculationType === 'calendar' ? '#eff6ff' : 'white'}; transition: all 0.2s;">
                                <input type="radio" name="calcMethod" value="calendar" ${statement.calculationType === 'calendar' ? 'checked' : ''} onchange="updateCalcMethod()" style="margin-top: 3px; width: 16px; height: 16px;">
                                <div>
                                    <div style="font-weight: 600; color: #111827; font-size: 14px;">Calendar Based</div>
                                    <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">Prorate reservations by days in period</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <button onclick="updateStatement()" id="updateStatementBtn" style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                        Update Statement
                    </button>
                </div>

                <!-- Internal Notes -->
                <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 16px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                            <span style="font-weight: 600; color: #ca8a04;">Internal Notes</span>
                        </div>
                        <button onclick="saveInternalNotes()" id="saveNotesBtn" style="padding: 6px 12px; background: #ca8a04; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#a16207'" onmouseout="this.style.background='#ca8a04'">Save Notes</button>
                    </div>
                    <p style="font-size: 12px; color: #a16207; margin-bottom: 10px;">Private notes about this listing. Visible in the app only, NOT included on PDF statements.</p>
                    <textarea id="editInternalNotes" style="width: 100%; min-height: 80px; padding: 12px; border: 1px solid #fde047; border-radius: 6px; font-size: 14px; color: #374151; resize: vertical; font-family: inherit; background: white;" placeholder="Add internal notes here...">${statement.internalNotes || ''}</textarea>
                </div>

                <!-- Footer -->
                <div style="display: flex; justify-content: flex-end; padding-top: 20px; margin-top: 20px; border-top: 1px solid #e5e7eb;">
                    <button onclick="closeEditModal()" style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">Close</button>
                </div>
            </div>
        </div>

        <script>
            const statementId = ${id};
            const statementStatus = '${statement.status}';
            const statementOwnerPayout = ${statement.ownerPayout || 0};
            const statementPayoutStatus = '${statement.payoutStatus || 'unpaid'}';
            const statementData = {
                ownerId: '${statement.ownerId}',
                propertyId: '${statement.propertyId || ''}',
                propertyIds: ${JSON.stringify(statement.propertyIds || [])},
                startDate: '${statement.weekStartDate}',
                endDate: '${statement.weekEndDate}',
                calculationType: '${statement.calculationType || 'checkout'}'
            };

            // Get auth token from localStorage (preferred) or legacy URL query parameter
            function getAuthToken() {
                try {
                    const stored = localStorage.getItem('luxury-lodging-auth');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (parsed.token) {
                            return parsed.token;
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors and fall back to legacy query param
                }
                const params = new URLSearchParams(window.location.search);
                return params.get('token') || '';
            }
            const authToken = getAuthToken();

            // Helper to get headers with auth
            function getAuthHeaders() {
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers['Authorization'] = 'Bearer ' + authToken;
                }
                return headers;
            }

            // Reload the statement view by fetching HTML with Authorization header
            async function loadStatementView(targetId) {
                try {
                    const response = await fetch('/api/statements/' + targetId + '/view', {
                        headers: getAuthHeaders()
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(errorText || 'Unable to load statement view');
                    }

                    const html = await response.text();
                    document.open();
                    document.write(html);
                    document.close();
                } catch (error) {
                    alert('Failed to load statement view. Please return to the dashboard and try again.');
                }
            }

            // Custom Modal Functions
            function showModal(options) {
                return new Promise((resolve) => {
                    const modal = document.getElementById('customModal');
                    const title = document.getElementById('modalTitle');
                    const message = document.getElementById('modalMessage');
                    const confirmBtn = document.getElementById('modalConfirm');
                    const cancelBtn = document.getElementById('modalCancel');

                    // Set icon based on type
                    const icons = {
                        warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
                        danger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
                        info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
                        success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                    };

                    title.className = 'modal-title ' + (options.type || 'info');
                    title.innerHTML = (icons[options.type] || icons.info) + ' ' + options.title;
                    message.textContent = options.message;
                    confirmBtn.textContent = options.confirmText || 'Confirm';
                    confirmBtn.className = 'modal-btn modal-btn-confirm ' + (options.type || '');

                    // Show/hide cancel for alerts
                    cancelBtn.style.display = options.isAlert ? 'none' : 'block';

                    modal.classList.add('active');

                    const cleanup = () => {
                        modal.classList.remove('active');
                        confirmBtn.removeEventListener('click', onConfirm);
                        cancelBtn.removeEventListener('click', onCancel);
                    };

                    const onConfirm = () => { cleanup(); resolve(true); };
                    const onCancel = () => { cleanup(); resolve(false); };

                    confirmBtn.addEventListener('click', onConfirm);
                    cancelBtn.addEventListener('click', onCancel);

                    // Close on overlay click
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal && !options.isAlert) onCancel();
                    }, { once: true });
                });
            }

            function showAlert(title, message, type = 'info') {
                return showModal({ title, message, type, isAlert: true, confirmText: 'OK' });
            }

            function showConfirm(title, message, type = 'warning') {
                return showModal({ title, message, type, isAlert: false });
            }

            function showLoading(btnId) {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.classList.add('loading');
                    btn.innerHTML = '<svg class="spinner" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg> Processing...';
                }
            }

            function editStatement() {
                // Open the inline edit modal
                document.getElementById('editModal').style.display = 'flex';
            }

            function closeEditModal() {
                document.getElementById('editModal').style.display = 'none';
            }

            function updateCalcMethod() {
                const checkoutLabel = document.getElementById('checkoutLabel');
                const calendarLabel = document.getElementById('calendarLabel');
                const checkoutInput = document.querySelector('input[value="checkout"]');
                const calendarInput = document.querySelector('input[value="calendar"]');

                if (checkoutInput.checked) {
                    checkoutLabel.style.borderColor = '#3b82f6';
                    checkoutLabel.style.background = '#eff6ff';
                    calendarLabel.style.borderColor = '#e5e7eb';
                    calendarLabel.style.background = 'white';
                } else {
                    calendarLabel.style.borderColor = '#3b82f6';
                    calendarLabel.style.background = '#eff6ff';
                    checkoutLabel.style.borderColor = '#e5e7eb';
                    checkoutLabel.style.background = 'white';
                }
            }

            function setThisMonth() {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                document.getElementById('editStartDate').value = formatDateForInput(start);
                document.getElementById('editEndDate').value = formatDateForInput(end);
            }

            function setLastMonth() {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                document.getElementById('editStartDate').value = formatDateForInput(start);
                document.getElementById('editEndDate').value = formatDateForInput(end);
            }

            function setThisYear() {
                const now = new Date();
                const start = new Date(now.getFullYear(), 0, 1);
                const end = new Date(now.getFullYear(), 11, 31);
                document.getElementById('editStartDate').value = formatDateForInput(start);
                document.getElementById('editEndDate').value = formatDateForInput(end);
            }

            function formatDateForInput(date) {
                return date.toISOString().split('T')[0];
            }

            async function saveInternalNotes() {
                const btn = document.getElementById('saveNotesBtn');
                const originalText = btn.textContent;
                btn.textContent = 'Saving...';
                btn.disabled = true;

                const notes = document.getElementById('editInternalNotes').value;
                const propertyId = statementData.propertyId || (statementData.propertyIds && statementData.propertyIds[0]);

                if (!propertyId) {
                    alert('Cannot save notes: No property ID found');
                    btn.textContent = originalText;
                    btn.disabled = false;
                    return;
                }

                try {
                    const response = await fetch('/api/listings/' + propertyId + '/config', {
                        method: 'PUT',
                        credentials: 'include',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ internalNotes: notes })
                    });

                    if (response.ok) {
                        btn.textContent = 'Saved!';
                        btn.style.background = '#10b981';
                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.style.background = '#ca8a04';
                            btn.disabled = false;
                        }, 2000);
                    } else {
                        throw new Error('Failed to save notes');
                    }
                } catch (error) {
                    alert('Error saving notes: ' + error.message);
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            }

            async function payOwner() {
                const confirmed = await showConfirm('Pay Owner', 'Transfer $' + parseFloat(statementOwnerPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' to owner?', 'success');
                if (!confirmed) return;

                showLoading('pay-owner-btn');
                try {
                    const response = await fetch('/api/payouts/statements/' + statementId + '/transfer', {
                        method: 'POST',
                        headers: getAuthHeaders()
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        await showAlert('Success', 'Payment sent successfully!', 'success');
                        window.location.reload();
                    } else {
                        throw new Error(data.error || 'Transfer failed');
                    }
                } catch (error) {
                    const btn = document.getElementById('pay-owner-btn');
                    if (btn) {
                        btn.classList.remove('loading');
                        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> Pay Owner';
                    }
                    showAlert('Error', error.message || 'Failed to process payment', 'danger');
                }
            }

            async function updateStatement() {
                const btn = document.getElementById('updateStatementBtn');
                const originalText = btn.textContent;
                btn.textContent = 'Updating...';
                btn.disabled = true;

                const startDate = document.getElementById('editStartDate').value;
                const endDate = document.getElementById('editEndDate').value;
                const calcMethod = document.querySelector('input[name="calcMethod"]:checked').value;

                try {
                    // Delete existing statement
                    const deleteRes = await fetch('/api/statements/' + statementId, {
                        method: 'DELETE',
                        credentials: 'include'
                    });

                    if (!deleteRes.ok) {
                        throw new Error('Failed to delete old statement');
                    }

                    // Regenerate with new settings
                    const response = await fetch('/api/statements/generate', {
                        method: 'POST',
                        credentials: 'include',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            propertyId: statementData.propertyId || null,
                            propertyIds: statementData.propertyIds.length > 0 ? statementData.propertyIds : null,
                            startDate: startDate,
                            endDate: endDate,
                            calculationType: calcMethod
                        })
                    });

                    const result = await response.json();
                    if (response.ok && result.statement) {
                        // Redirect to new statement
                        loadStatementView(result.statement.id);
                    } else {
                        throw new Error(result.error || 'Failed to regenerate statement');
                    }
                } catch (error) {
                    alert('Error updating statement: ' + error.message);
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            }

            async function regenerateStatement() {
                const confirmed = await showConfirm('Regenerate Statement', 'Are you sure you want to regenerate this statement? This will refresh all data from Hostify.', 'info');
                if (!confirmed) return;

                showLoading('regenerate-btn');
                try {
                    // Step 1: Delete the existing statement
                    const deleteResponse = await fetch('/api/statements/' + statementId, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });

                    if (!deleteResponse.ok) {
                        const error = await deleteResponse.json();
                        throw new Error(error.error || 'Failed to delete old statement');
                    }

                    // Step 2: Generate a new statement with the same parameters
                    const generatePayload = {
                        ownerId: statementData.ownerId,
                        startDate: statementData.startDate,
                        endDate: statementData.endDate,
                        calculationType: statementData.calculationType
                    };

                    // Handle combined vs single property statements
                    if (statementData.propertyIds && statementData.propertyIds.length > 0) {
                        generatePayload.propertyIds = statementData.propertyIds.map(id => String(id));
                    } else if (statementData.propertyId) {
                        generatePayload.propertyId = statementData.propertyId;
                    }

                    const generateResponse = await fetch('/api/statements/generate', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify(generatePayload)
                    });

                    if (!generateResponse.ok) {
                        const error = await generateResponse.json();
                        throw new Error(error.error || 'Failed to generate new statement');
                    }

                    const result = await generateResponse.json();

                    // Redirect to the new statement's view page
                    const newId = result.statement?.id || result.id;
                    if (newId) {
                        loadStatementView(newId);
                    } else {
                        await showAlert('Success', 'Statement regenerated successfully!', 'success');
                        window.location.href = '/';
                    }
                } catch (error) {
                    await showAlert('Error', 'Error regenerating statement: ' + error.message, 'danger');
                    window.location.href = '/';
                }
            }

            async function downloadStatement() {
                try {
                    const response = await fetch('/api/statements/' + statementId + '/download', {
                        headers: getAuthHeaders()
                    });

                    if (!response.ok) {
                        throw new Error('Download failed');
                    }

                    const blob = await response.blob();
                    const disposition = response.headers.get('Content-Disposition') || '';
                    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
                    const filename = match && match[1] ? match[1] : ('statement-' + statementId + '.pdf');

                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (error) {
                    alert('Failed to download statement. Please try again.');
                }
            }

            async function finalizeStatement() {
                const confirmed = await showConfirm('Finalize Statement', 'Are you sure you want to finalize this statement? You will not be able to edit it after finalizing.', 'warning');
                if (!confirmed) return;

                showLoading('finalize-btn');
                try {
                    const response = await fetch('/api/statements/' + statementId + '/status', {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ status: 'final' })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to finalize');
                    }

                    // Refresh the page to show updated status
                    window.location.reload();
                } catch (error) {
                    await showAlert('Error', 'Error finalizing statement: ' + error.message, 'danger');
                    window.location.reload();
                }
            }

            async function revertToDraft() {
                const confirmed = await showConfirm('Return to Draft', 'Are you sure you want to revert this statement to draft?', 'info');
                if (!confirmed) return;

                showLoading('revert-btn');
                try {
                    const response = await fetch('/api/statements/' + statementId + '/status', {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ status: 'draft' })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to revert');
                    }

                    // Refresh the page to show updated status
                    window.location.reload();
                } catch (error) {
                    await showAlert('Error', 'Error reverting statement: ' + error.message, 'danger');
                    window.location.reload();
                }
            }

            async function deleteStatement() {
                const confirmed = await showConfirm('Delete Statement', 'Are you sure you want to delete this statement? This action cannot be undone.', 'danger');
                if (!confirmed) return;

                try {
                    const response = await fetch('/api/statements/' + statementId, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to delete');
                    }

                    // Redirect to main page after delete
                    await showAlert('Deleted', 'Statement deleted successfully', 'success');
                    window.location.href = '/';
                } catch (error) {
                    await showAlert('Error', 'Error deleting statement: ' + error.message, 'danger');
                }
            }
        </script>`}
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');

        // Log view activity (skip if PDF mode - that's internal use for downloads)
        if (!isPdf) {
            const propertyDisplay = statement.propertyName || statement.propertyNames || `Statement #${id}`;
            const periodDisplay = statement.weekStartDate && statement.weekEndDate
                ? `${statement.weekStartDate} to ${statement.weekEndDate}`
                : '';
            await ActivityLog.log(req, 'VIEW_STATEMENT', 'statement', id, {
                ownerName: statement.ownerName || 'Unknown Owner',
                propertyName: propertyDisplay,
                period: periodDisplay
            });
        }

        res.send(statementHTML);
    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'viewStatement' });
        res.status(500).json({ error: 'Failed to view statement' });
    }
});

// Helper: Fetch HTML using internal HTTP with proper timeout and error handling
// Uses 127.0.0.1 instead of localhost for better compatibility with containerized environments like Railway
async function fetchStatementHTMLViaHTTP(statementId, authHeader) {
    const http = require('http');
    const viewUrl = `http://127.0.0.1:${process.env.PORT || 3003}/api/statements/${statementId}/view?pdf=true`;

    return new Promise((resolve, reject) => {
        const options = {
            headers: authHeader ? { 'Authorization': authHeader } : {},
            timeout: 30000 // 30 second timeout
        };

        const req = http.get(viewUrl, options, (response) => {
            // Check for redirect or error status
            if (response.statusCode >= 400) {
                reject(new Error(`HTTP ${response.statusCode}: Failed to fetch statement HTML`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        });

        req.on('error', (err) => {
            // If internal HTTP fails, try to generate HTML directly
            logger.warn('Internal HTTP request failed, will try direct generation', {
                context: 'StatementsFile',
                error: err.message,
                statementId
            });
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
    });
}

// POST /api/statements-file/bulk-download - Download multiple statements as ZIP
router.post('/bulk-download', async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No statement IDs provided' });
        }

        const archiver = require('archiver');
        const htmlPdf = require('html-pdf-node');

        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 5 } // Compression level
        });

        // Set response headers for ZIP download
        const timestamp = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="statements-${timestamp}.zip"`);

        // Pipe archive to response
        archive.pipe(res);

        // Use the improved HTTP helper that works with 127.0.0.1
        const authHeader = req.headers.authorization;

        // PDF options
        const pdfOptions = {
            format: 'A4',
            landscape: false,
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            },
            printBackground: true,
            preferCSSPageSize: false,
            displayHeaderFooter: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        };

        // Process each statement
        for (const id of ids) {
            try {
                const statement = await FileDataService.getStatementById(id);
                if (!statement) {
                    logger.warn('Statement not found, skipping', { context: 'StatementsFile', statementId: id });
                    continue;
                }

                // Fetch HTML using improved helper with 127.0.0.1
                const statementHTML = await fetchStatementHTMLViaHTTP(id, authHeader);
                const file = { content: statementHTML };
                const pdfBuffer = await htmlPdf.generatePdf(file, pdfOptions);

                // Generate filename
                let propertyNickname = 'Statement';
                if (statement.propertyName) {
                    propertyNickname = statement.propertyName;
                } else if (statement.propertyId) {
                    try {
                        const listing = await ListingService.getListingWithPmFee(statement.propertyId);
                        if (listing && listing.nickname) {
                            propertyNickname = listing.nickname;
                        }
                    } catch (err) {
                        logger.logError(err, { context: 'StatementsFile', action: 'fetchListingForFilename' });
                    }
                }

                const cleanPropertyName = propertyNickname
                    .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                const startDate = statement.weekStartDate?.replace(/\//g, '-') || 'unknown';
                const endDate = statement.weekEndDate?.replace(/\//g, '-') || 'unknown';
                const statementPeriod = `${startDate} to ${endDate}`;
                const filename = `${cleanPropertyName} - ${statementPeriod}.pdf`;

                // Add PDF to archive
                archive.append(pdfBuffer, { name: filename });

            } catch (err) {
                logger.logError(err, { context: 'StatementsFile', action: 'processStatement', statementId: id });
                // Continue with other statements
            }
        }

        // Finalize archive
        await archive.finalize();

    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'bulkDownload' });
        res.status(500).json({ error: 'Failed to create ZIP file' });
    }
});

// GET /api/statements-file/:id/download - Download statement
router.get('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);

        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        const htmlPdf = require('html-pdf-node');

        // Use the improved HTTP helper with 127.0.0.1 instead of localhost
        // This works more reliably in containerized environments like Railway
        const authHeader = req.headers.authorization;
        const statementHTML = await fetchStatementHTMLViaHTTP(id, authHeader);

        const options = {
            format: 'A4',
            landscape: false, // Use portrait orientation
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            },
            printBackground: true, // Ensure backgrounds are printed
            preferCSSPageSize: false,
            displayHeaderFooter: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        };

        const file = { content: statementHTML };

        // Generate PDF
        const pdfBuffer = await htmlPdf.generatePdf(file, options);

        // Get property nickname for filename (nickname only, no ID)
        let propertyNickname = 'Statement';
        if (statement.propertyName) {
            // Use stored property name (works for both single and combined statements)
            propertyNickname = statement.propertyName;
        } else if (statement.propertyId) {
            try {
                const listing = await ListingService.getListingWithPmFee(statement.propertyId);
                if (listing && listing.nickname) {
                    propertyNickname = listing.nickname;
                }
            } catch (err) {
                logger.logError(err, { context: 'StatementsFile', action: 'fetchListingForFilename' });
            }
        }

        // Clean property nickname for filename
        const cleanPropertyName = propertyNickname
            .replace(/[^a-zA-Z0-9\s\-\.]/g, '') // Remove special chars but keep spaces, hyphens, dots
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();

        // Get owner/client name for filename
        const clientName = statement.ownerName || 'Owner';
        const cleanClientName = clientName
            .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const startDate = statement.weekStartDate?.replace(/\//g, '-') || 'unknown';
        const endDate = statement.weekEndDate?.replace(/\//g, '-') || 'unknown';
        const statementPeriod = `${startDate} to ${endDate}`;

        const filename = `${cleanPropertyName} - ${statementPeriod}.pdf`;

        // Log download activity with proper details
        const propertyDisplay = statement.propertyName || statement.propertyNames || `Statement #${id}`;
        await ActivityLog.log(req, 'DOWNLOAD_STATEMENT', 'statement', id, {
            ownerName: statement.ownerName || 'Unknown Owner',
            propertyName: propertyDisplay,
            period: statementPeriod,
            filename
        });

        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        // Send PDF buffer
        res.send(pdfBuffer);

    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'downloadPDF' });
        res.status(500).json({ error: 'Failed to download statement PDF' });
    }
});

// Helper function to generate statement HTML for PDF
// Helper function to generate statements for all owners and their properties
/**
 * Background version of bulk statement generation with progress tracking
 *
 * STRATEGY:
 * 1. Single bulk fetch: Get ALL reservations for past 365 days (handles pagination)
 * 2. Build child-to-parent listing map to attribute reservations correctly
 * 3. Pool all data in memory first
 * 4. Process properties in parallel batches for speed
 * 5. Save statements sequentially to avoid ID conflicts
 */
async function generateAllOwnerStatementsBackground(jobId, startDate, endDate, calculationType, tag = null) {
    try {
        logger.info('Starting bulk generation', { context: 'StatementsFile', startDate, endDate });
        logger.info('Bulk generation parameters', { context: 'StatementsFile', calculationType, tag: tag || 'none' });

        // Mark job as processing immediately
        BackgroundJobService.updateJob(jobId, { status: 'processing' });

        // STEP 1: Bulk fetch ALL reservations (past 365 days, handles pagination & child listings)
        logger.debug('Bulk fetching all reservations', { context: 'StatementsFile', step: 1 });
        BackgroundJobService.updateProgress(jobId, 0, 'Fetching all reservations (this may take several minutes)...');

        const hostifyService = require('../services/HostifyService');
        const bulkData = await hostifyService.bulkFetchAllReservations((progress) => {
            BackgroundJobService.updateProgress(jobId, 0, progress);
        });

        const allReservations = bulkData.reservations;
        logger.debug('Bulk fetch complete', { context: 'StatementsFile', reservations: allReservations.length, listings: bulkData.listings.length });
        logger.debug('Child-to-parent mappings', { context: 'StatementsFile', count: bulkData.childToParentMap.size });

        // STEP 2: Get listings with local database info (tags, PM fees, etc.)
        logger.debug('Loading listing configurations', { context: 'StatementsFile', step: 2 });
        const listings = await FileDataService.getListings();
        logger.debug('Total listings from database', { context: 'StatementsFile', count: listings.length });

        // STEP 3: Fetch expenses
        logger.debug('Fetching expenses', { context: 'StatementsFile', step: 3 });
        const allExpenses = await FileDataService.getExpenses(startDate, endDate, null);
        logger.debug('Loaded expenses', { context: 'StatementsFile', count: allExpenses.length });

        // Include all listings (active + offboarded) - offboarded properties can still have statements generated manually
        let activeListings = listings;
        logger.debug('Properties available for generation', { context: 'StatementsFile', totalListings: listings.length, active: listings.filter(l => l.isActive).length, offboarded: listings.filter(l => !l.isActive).length });

        // Apply tag filter if specified (case-insensitive)
        // STEP 3.5: If tag is specified, first generate GROUP statements, then individual non-grouped listings
        let groupResults = { generated: 0, skipped: 0, errors: 0, groups: [] };
        let groupedListingIds = new Set(); // Track listings that belong to groups

        if (tag) {
            const tagLower = tag.toLowerCase().trim();

            // First, find groups with this tag and generate combined statements for them
            logger.debug('GROUP GENERATION START', { context: 'StatementsFile' });
            logger.debug('Checking for groups with tag', { context: 'StatementsFile', tag, normalizedTag: tagLower });
            const ListingGroupService = require('../services/ListingGroupService');
            const StatementService = require('../services/StatementService');

            try {
                const taggedGroups = await ListingGroupService.getGroupsByTag(tag);
                logger.debug('Found groups with tag', { context: 'StatementsFile', tag, count: taggedGroups.length });

                if (taggedGroups.length > 0) {
                    logger.debug('Groups to process', { context: 'StatementsFile', groups: taggedGroups.map(g => ({ id: g.id, name: g.name, tags: g.tags })) });
                    BackgroundJobService.updateProgress(jobId, 0, `Generating statements for ${taggedGroups.length} groups with tag "${tag}"...`);

                    for (let i = 0; i < taggedGroups.length; i++) {
                        const group = taggedGroups[i];
                        logger.debug('Processing group', { context: 'StatementsFile', progress: `${i + 1}/${taggedGroups.length}`, groupName: group.name, groupId: group.id });

                        try {
                            // Get group details with member listings
                            logger.debug('Fetching group details', { context: 'StatementsFile', groupId: group.id });
                            const groupDetails = await ListingGroupService.getGroupById(group.id);
                            logger.debug('Group member listings', { context: 'StatementsFile', groupName: group.name, memberCount: groupDetails.members?.length || 0 });

                            if (!groupDetails.members || groupDetails.members.length === 0) {
                                logger.debug('SKIP - Group has no member listings', { context: 'StatementsFile', groupName: group.name });
                                continue;
                            }

                            // Track listing IDs that belong to this group
                            const memberIds = groupDetails.members.map(m => m.id);
                            logger.debug('Member listing IDs', { context: 'StatementsFile', memberIds });
                            groupDetails.members.forEach(m => groupedListingIds.add(m.id));

                            // Generate combined draft statement for the group
                            logger.debug('Calling StatementService.generateGroupStatement()', { context: 'StatementsFile', groupName: group.name });
                            logger.debug('Group statement params', { context: 'StatementsFile', groupId: group.id, startDate, endDate, calculationType: group.calculationType || calculationType });

                            const statement = await StatementService.generateGroupStatement({
                                groupId: group.id,
                                groupName: group.name,
                                listingIds: memberIds,
                                startDate,
                                endDate,
                                calculationType: group.calculationType || calculationType
                            });

                            // Check if statement was skipped (duplicate)
                            if (statement?.skipped) {
                                groupResults.skipped++;
                                logger.debug('SKIPPED - Group statement already exists', { context: 'StatementsFile', groupName: group.name, existingId: statement.existingId });
                                continue;
                            }

                            groupResults.generated++;
                            groupResults.groups.push({
                                groupId: group.id,
                                groupName: group.name,
                                statementId: statement?.id,
                                memberCount: groupDetails.members.length
                            });

                            logger.debug('SUCCESS - Generated group statement', { context: 'StatementsFile', statementId: statement?.id, groupName: group.name, memberCount: groupDetails.members.length });
                        } catch (groupError) {
                            logger.logError(groupError, { context: 'StatementsFile', action: 'generateGroupStatement', groupName: group.name, groupId: group.id });
                            groupResults.errors++;
                        }
                    }

                    logger.debug('GROUP GENERATION COMPLETE', { context: 'StatementsFile' });
                    logger.debug('Group generation summary', { context: 'StatementsFile', generated: groupResults.generated, skipped: groupResults.skipped, errors: groupResults.errors });
                    logger.debug('Successfully created groups', { context: 'StatementsFile', groups: groupResults.groups.map(g => ({ name: g.groupName, statementId: g.statementId })) });
                } else {
                    logger.debug('No groups found with tag - skipping group generation', { context: 'StatementsFile', tag });
                }
            } catch (groupServiceError) {
                logger.logError(groupServiceError, { context: 'StatementsFile', action: 'fetchGroupsByTag', tag });
            }

            // Now filter listings: only include those with the tag AND not in any group
            activeListings = activeListings.filter(l => {
                const listingTags = l.tags || [];
                const hasTag = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                const isInGroup = groupedListingIds.has(l.id) || l.groupId;

                if (hasTag && isInGroup) {
                    logger.debug('Listing is in a group, skipping individual generation', { context: 'StatementsFile', listingId: l.id, listingName: l.name || l.nickname });
                }

                return hasTag && !isInGroup;
            });
            logger.debug('After tag filter (excluding grouped)', { context: 'StatementsFile', tag, count: activeListings.length });
        }

        BackgroundJobService.startJob(jobId, activeListings.length + groupResults.generated);

        const results = {
            generated: [],
            skipped: [],
            errors: [],
            groupResults // Include group generation results
        };

        let processedCount = 0;
        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        logger.debug('Generating statements in parallel', { context: 'StatementsFile', step: 4, count: activeListings.length });

        // Log all unique propertyIds in the reservation pool for debugging
        const uniquePropertyIds = [...new Set(allReservations.map(r => r.propertyId))];
        logger.debug('Unique propertyIds in reservation pool', { context: 'StatementsFile', count: uniquePropertyIds.length });

        // Pre-fetch all listing configs in parallel for speed
        logger.debug('Pre-fetching listing configurations', { context: 'StatementsFile' });
        const listingConfigs = new Map();
        // Create a map of Hostify listings for cleaningFee lookup
        const hostifyListingMap = new Map(activeListings.map(l => [l.id, l]));
        const configBatchSize = 100;
        for (let i = 0; i < activeListings.length; i += configBatchSize) {
            const batch = activeListings.slice(i, i + configBatchSize);
            const configs = await Promise.all(batch.map(async (property) => {
                const listing = await ListingService.getListingWithPmFee(property.id);
                // Merge Hostify cleaningFee into DB listing config
                const hostifyListing = hostifyListingMap.get(property.id);
                if (listing && hostifyListing) {
                    listing.cleaningFee = hostifyListing.cleaningFee || 0;
                }
                return { id: property.id, config: listing };
            }));
            configs.forEach(({ id, config }) => listingConfigs.set(id, config));
        }
        logger.debug('Pre-fetched listing configurations', { context: 'StatementsFile', count: listingConfigs.size });

        // STEP 4: Generate statements in PARALLEL batches
        const BATCH_SIZE = 100; // Process 100 properties at a time
        const allStatements = []; // Collect all statements to save

        for (let i = 0; i < activeListings.length; i += BATCH_SIZE) {
            const batch = activeListings.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(activeListings.length / BATCH_SIZE);

            BackgroundJobService.updateProgress(jobId, i, `Processing batch ${batchNum}/${totalBatches} (${i}/${activeListings.length} properties)...`);

            // Process batch in parallel
            const batchResults = await Promise.all(batch.map(async (property) => {
                try {
                    const propertyName = property.nickname || property.displayName || property.name || 'Unknown';

                    // Filter reservations for this property from the pre-fetched pool
                    // Filter reservations based on calculation type
                    const allowedStatuses = ['confirmed', 'accepted'];

                    const periodReservations = allReservations.filter(res => {
                        const propMatch = parseInt(res.propertyId) === parseInt(property.id);
                        if (!propMatch) return false;

                        let dateMatch = true;
                        if (calculationType === 'calendar') {
                            // Calendar: any reservation that overlaps with the period
                            const checkIn = new Date(res.checkInDate);
                            const checkOut = new Date(res.checkOutDate);
                            if (checkIn > periodEnd || checkOut <= periodStart) dateMatch = false;
                        } else {
                            // Checkout: only reservations that check out within the period
                            const checkoutDate = new Date(res.checkOutDate);
                            if (checkoutDate < periodStart || checkoutDate > periodEnd) dateMatch = false;
                        }

                        const statusMatch = allowedStatuses.includes(res.status);
                        return dateMatch && statusMatch;
                    }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

                    // Find ALL overlapping reservations (regardless of calculation type)
                    // This helps detect long stays that span beyond the statement period
                    let overlappingReservations = allReservations.filter(res => {
                        const propMatch = parseInt(res.propertyId) === parseInt(property.id);
                        if (!propMatch) return false;

                        const checkIn = new Date(res.checkInDate);
                        const checkOut = new Date(res.checkOutDate);
                        const statusMatch = allowedStatuses.includes(res.status);

                        // Overlaps if: checkIn <= periodEnd AND checkOut > periodStart
                        return checkIn <= periodEnd && checkOut > periodStart && statusMatch;
                    });

                    // Determine if statement should be converted to calendar mode
                    let shouldConvertToCalendar = false;

                    if (calculationType === 'checkout') {
                        // For checkout mode: flag if there are overlapping reservations but no checkouts in period
                        if (overlappingReservations.length > 0 && periodReservations.length === 0) {
                            shouldConvertToCalendar = true;
                            logger.debug('BULK-FLAG: Property has overlapping reservations but 0 checkouts - recommend calendar mode', { context: 'StatementsFile', propertyId: property.id, overlappingCount: overlappingReservations.length });
                        }
                    } else {
                        // For calendar mode: flag if any reservation spans beyond the period AND is 14+ nights (long stay)
                        const longStayReservations = overlappingReservations.filter(res => {
                            const checkIn = new Date(res.checkInDate);
                            const checkOut = new Date(res.checkOutDate);
                            const nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                            // Only flag as long-stay if: spans beyond period AND is 14+ nights
                            return (checkIn < periodStart || checkOut > periodEnd) && nights >= 14;
                        });
                        if (longStayReservations.length > 0) {
                            shouldConvertToCalendar = true;
                            logger.debug('BULK-FLAG: Property has long-stay reservations - prorated calendar calculation applied', { context: 'StatementsFile', propertyId: property.id, longStayCount: longStayReservations.length });
                        }
                    }

                    // Filter expenses for this property (LL Cover handled separately for hidden items)
                    const periodExpensesAll = allExpenses.filter(exp => {
                        const matchesPropertyId = parseInt(exp.propertyId) === parseInt(property.id);
                        const matchesSecureStayId = exp.secureStayListingId && parseInt(exp.secureStayListingId) === parseInt(property.id);
                        if (!matchesPropertyId && !matchesSecureStayId) return false;
                        const expenseDate = new Date(exp.date);
                        return expenseDate >= periodStart && expenseDate <= periodEnd;
                    });
                    const llCoverExpenses = periodExpensesAll.filter(exp => isLlCoverExpense(exp));
                    const periodExpenses = periodExpensesAll.filter(exp => !isLlCoverExpense(exp));
                    if (llCoverExpenses.length > 0) {
                        logger.debug('Marking LL Cover expenses as hidden', { context: 'StatementsFile', propertyId: property.id, count: llCoverExpenses.length });
                    }

                    // NEW LOGIC: If there's ANY overlapping reservation, create the statement
                    // This ensures long-stay guests are visible even if they don't checkout in the period
                    // Skip ONLY if no overlapping reservations AND no expenses in period
                    if (overlappingReservations.length === 0 && periodExpenses.length === 0) {
                        return {
                            success: false,
                            skipped: true,
                            property,
                            propertyName,
                            reason: 'No activity in period'
                        };
                    }

                    // Get pre-fetched listing config
                    const listing = listingConfigs.get(property.id);
                    const isCohostOnAirbnb = listing?.isCohostOnAirbnb || false;
                    const airbnbPassThroughTax = listing?.airbnbPassThroughTax || false;
                    const disregardTax = listing?.disregardTax || false;
                    const cleaningFeePassThrough = listing?.cleaningFeePassThrough || false;

                    // Count cleaning expenses for validation
                    const cleaningExpenses = periodExpenses.filter(exp => {
                        const category = (exp.category || '').toLowerCase();
                        const type = (exp.type || '').toLowerCase();
                        const description = (exp.description || '').toLowerCase();
                        return category.includes('cleaning') || type.includes('cleaning') || description.includes('cleaning');
                    });

                    // Validate cleaning expenses vs reservations count (only if cleaningFeePassThrough is enabled)
                    let cleaningMismatchWarning = null;
                    if (cleaningFeePassThrough && periodReservations.length > 0) {
                        const reservationCount = periodReservations.length;
                        const cleaningExpenseCount = cleaningExpenses.length;
                        if (cleaningExpenseCount !== reservationCount) {
                            cleaningMismatchWarning = {
                                type: 'cleaning_mismatch',
                                message: `Cleaning expense count (${cleaningExpenseCount}) does not match reservation count (${reservationCount})`,
                                reservationCount,
                                cleaningExpenseCount,
                                difference: reservationCount - cleaningExpenseCount
                            };
                        }
                    }

                    // Identify supplies expenses
                    const suppliesExpenses = periodExpenses.filter(exp => {
                        const category = (exp.category || '').toLowerCase();
                        const type = (exp.type || '').toLowerCase();
                        const description = (exp.description || '').toLowerCase();
                        return category.includes('supplies') || type.includes('supplies') || description.includes('supplies');
                    });

                    // Filter out cleaning and supplies expenses if cleaningFeePassThrough is enabled
                    const filteredExpenses = cleaningFeePassThrough
                        ? periodExpenses.filter(exp => !cleaningExpenses.includes(exp) && !suppliesExpenses.includes(exp))
                        : periodExpenses;

                    // Generate cleaning fee expenses from reservations when pass-through is enabled
                    const cleaningFeeExpenses = [];
                    if (cleaningFeePassThrough && periodReservations.length > 0) {
                        for (const res of periodReservations) {
                            const cleaningFee = res.cleaningFee ?? listing?.cleaningFee ?? 0;
                            if (cleaningFee > 0) {
                                cleaningFeeExpenses.push({
                                    id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                                    propertyId: property.id,
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
                    const combinedExpenses = [...filteredExpenses, ...cleaningFeeExpenses];

                    // Get PM percentage
                    let pmPercentage = 15;
                    if (listing && listing.pmFeePercentage !== null) {
                        pmPercentage = listing.pmFeePercentage;
                    }

                    // Calculate totals
                    let totalRevenue = 0;
                    let totalGrossPayout = 0;
                    let totalPmCommission = 0;

                    for (const res of periodReservations) {
                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        const isCohostAirbnb = isAirbnb && isCohostOnAirbnb;

                        const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                        const pmFee = clientRevenue * (pmPercentage / 100);
                        const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
                        // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
                        // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
                        const guestPaidCleaningFee = res.cleaningFee ?? listing?.cleaningFee ?? 0;
                        const cleaningFeeForPassThrough = cleaningFeePassThrough && guestPaidCleaningFee > 0
                            ? Math.ceil((guestPaidCleaningFee / (1 + pmPercentage / 100)) / 5) * 5
                            : 0;

                        const shouldAddTax = !disregardTax && (!isAirbnb || airbnbPassThroughTax);

                        if (!isCohostAirbnb) {
                            totalRevenue += clientRevenue;
                        }
                        totalPmCommission += pmFee;

                        let grossPayout;
                        if (isCohostAirbnb) {
                            grossPayout = -pmFee - cleaningFeeForPassThrough;
                        } else if (shouldAddTax) {
                            grossPayout = clientRevenue - pmFee + taxResponsibility - cleaningFeeForPassThrough;
                        } else {
                            grossPayout = clientRevenue - pmFee - cleaningFeeForPassThrough;
                        }
                        totalGrossPayout += grossPayout;
                    }

                    const totalExpenses = filteredExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum : sum + Math.abs(exp.amount);
                    }, 0);

                    const totalUpsells = filteredExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum + exp.amount : sum;
                    }, 0);

                    const techFees = 50;
                    const insuranceFees = 25;
                    const ownerPayout = totalGrossPayout + totalUpsells - totalExpenses;

                    // Return statement data (ID will be assigned later to avoid race conditions)
                    return {
                        success: true,
                        property,
                        propertyName,
                        shouldConvertToCalendar,
                        overlappingReservations,
                        statementData: {
                            ownerId: 1,
                            ownerName: 'Default Owner',
                            propertyId: property.id,
                            propertyName: property.nickname || property.displayName || property.name,
                            weekStartDate: startDate,
                            weekEndDate: endDate,
                            calculationType,
                            totalRevenue: Math.round(totalRevenue * 100) / 100,
                            totalExpenses: Math.round(totalExpenses * 100) / 100,
                            pmCommission: Math.round(totalPmCommission * 100) / 100,
                            pmPercentage,
                            techFees: Math.round(techFees * 100) / 100,
                            insuranceFees: Math.round(insuranceFees * 100) / 100,
                            adjustments: 0,
                            ownerPayout: Math.round(ownerPayout * 100) / 100,
                            isCohostOnAirbnb,
                            airbnbPassThroughTax,
                            disregardTax,
                            cleaningFeePassThrough,
                            shouldConvertToCalendar,
                            // Include overlapping reservations info when flagged for calendar conversion
                            overlappingReservations: shouldConvertToCalendar ? overlappingReservations.map(res => ({
                                id: res.id,
                                hostifyId: res.hostifyId,
                                guestName: res.guestName,
                                checkInDate: res.checkInDate,
                                checkOutDate: res.checkOutDate,
                                source: res.source,
                                grossAmount: res.grossAmount || 0,
                                status: res.status
                            })) : null,
                            calendarConversionNotice: shouldConvertToCalendar ?
                                (calculationType === 'checkout'
                                    ? `This property has ${overlappingReservations.length} reservation(s) during this period but no checkouts. Revenue shows $0 because checkout-based calculation is selected. Consider converting to calendar-based calculation to see prorated revenue.`
                                    : `This property has long-stay reservation(s) spanning beyond the statement period. Prorated calendar calculation is applied.`)
                                : null,
                            status: 'draft',
                            sentAt: null,
                            createdAt: new Date().toISOString(),
                            reservations: periodReservations,
                            expenses: combinedExpenses,
                            duplicateWarnings: [],
                            cleaningMismatchWarning,
                            items: [
                                ...periodReservations.map(res => ({
                                    type: 'revenue',
                                    description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                                    amount: res.grossAmount,
                                    date: res.checkOutDate,
                                    category: 'booking'
                                })),
                                ...combinedExpenses.map(exp => {
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
                                }),
                                ...llCoverExpenses.map(exp => {
                                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                                    return {
                                        type: isUpsell ? 'upsell' : 'expense',
                                        description: exp.description,
                                        amount: Math.abs(exp.amount),
                                        date: exp.date,
                                        category: exp.type || exp.category || 'expense',
                                        vendor: exp.vendor,
                                        listing: exp.listing,
                                        hidden: true,
                                        hiddenReason: 'll_cover'
                                    };
                                })
                            ]
                        },
                        periodReservations,
                        periodExpenses: periodExpenses
                    };
                } catch (error) {
                    return {
                        success: false,
                        property,
                        error: error.message
                    };
                }
            }));

            // Collect results from this batch
            for (const result of batchResults) {
                // Handle early skip (no activity in period)
                if (result.skipped) {
                    if (!results.skipped) results.skipped = [];
                    results.skipped.push({
                        propertyId: result.property.id,
                        propertyName: result.propertyName,
                        reason: result.reason || 'No activity in period'
                    });
                    logger.debug('SKIPPED Property', { context: 'StatementsFile', propertyId: result.property.id, propertyName: result.propertyName, reason: result.reason });
                    processedCount++;
                    continue;
                }
                if (result.success) {
                    // Skip statements with zero revenue AND zero expenses (no activity)
                    // BUT don't skip if there are overlapping reservations that suggest calendar mode
                    const hasRevenue = result.statementData.totalRevenue > 0;
                    const hasExpenses = result.periodExpenses && result.periodExpenses.length > 0;
                    const hasOverlappingReservations = result.overlappingReservations && result.overlappingReservations.length > 0;

                    if (!hasRevenue && !hasExpenses && !hasOverlappingReservations) {
                        // Skip - no activity for this property
                        if (!results.skipped) results.skipped = [];
                        results.skipped.push({
                            propertyId: result.property.id,
                            propertyName: result.property.nickname || result.property.displayName || result.property.name,
                            reason: 'No revenue and no expenses'
                        });
                        logger.debug('SKIPPED Property - No revenue and no expenses', { context: 'StatementsFile', propertyId: result.property.id, propertyName: result.propertyName });
                    } else if (result.shouldConvertToCalendar) {
                        // Property has overlapping reservations but no checkouts - generate with $0 and flag
                        logger.debug('FLAGGED Property - Should convert to calendar', { context: 'StatementsFile', propertyId: result.property.id, propertyName: result.propertyName, overlappingCount: result.overlappingReservations.length });
                        allStatements.push(result);
                    } else {
                        allStatements.push(result);
                    }
                } else {
                    results.errors.push({
                        propertyId: result.property.id,
                        propertyName: result.property.nickname || result.property.displayName || result.property.name,
                        error: result.error
                    });
                }
                processedCount++;
            }
        }

        // STEP 5: Save all statements sequentially (to avoid ID conflicts)
        logger.debug('Saving statements', { context: 'StatementsFile', step: 5, count: allStatements.length });
        BackgroundJobService.updateProgress(jobId, processedCount, `Saving ${allStatements.length} statements to database...`);

        const existingStatements = await FileDataService.getStatements();
        let nextId = FileDataService.generateId(existingStatements);

        for (const result of allStatements) {
            const statement = { ...result.statementData, id: nextId };
            await FileDataService.saveStatement(statement);

            // Add flag after property name if should convert to calendar
            const displayName = result.shouldConvertToCalendar
                ? `${result.propertyName}\t[LONG STAY - PRORATE]`
                : result.propertyName;

            results.generated.push({
                id: nextId,
                propertyId: result.property.id,
                propertyName: displayName,
                ownerPayout: statement.ownerPayout,
                totalRevenue: statement.totalRevenue,
                reservationCount: result.periodReservations.length,
                expenseCount: result.periodExpenses.length,
                shouldConvertToCalendar: result.shouldConvertToCalendar || false,
                overlappingReservationCount: result.overlappingReservations?.length || 0
            });

            const calendarFlag = result.shouldConvertToCalendar ? ' [SHOULD CONVERT TO CALENDAR]' : '';
            logger.debug('SAVED Property', { context: 'StatementsFile', propertyId: result.property.id, propertyName: result.propertyName, reservations: result.periodReservations.length, revenue: statement.totalRevenue, calendarFlag });
            nextId++;
        }

        // Count statements that should convert to calendar
        const shouldConvertCount = results.generated.filter(g => g.shouldConvertToCalendar).length;

        logger.info('BULK GENERATION FINAL SUMMARY', { context: 'StatementsFile' });
        logger.info('Total properties processed', { context: 'StatementsFile', count: processedCount });
        logger.info('Statements generated', { context: 'StatementsFile', count: results.generated.length });
        logger.info('Skipped (no activity)', { context: 'StatementsFile', count: results.skipped ? results.skipped.length : 0 });
        logger.info('Errors', { context: 'StatementsFile', count: results.errors.length });
        if (shouldConvertCount > 0) {
            logger.info('Statements needing calendar conversion', { context: 'StatementsFile', count: shouldConvertCount });
            const flaggedProperties = results.generated.filter(g => g.shouldConvertToCalendar);
            flaggedProperties.forEach(p => {
                logger.info('Property needing calendar conversion', { context: 'StatementsFile', propertyName: p.propertyName, propertyId: p.propertyId, overlappingCount: p.overlappingReservationCount });
            });
        }
        if (results.errors.length > 0) {
            logger.warn('Error properties', { context: 'StatementsFile', errors: results.errors.map(e => ({ propertyId: e.propertyId, propertyName: e.propertyName, error: e.error })) });
        }
        logger.debug('Bulk generation complete', { context: 'StatementsFile' });

        // Calculate totals including groups
        const totalGenerated = results.generated.length + (results.groupResults?.generated || 0);
        const totalSkipped = results.skipped.length + (results.groupResults?.skipped || 0);
        const totalErrors = results.errors.length + (results.groupResults?.errors || 0);

        if (results.groupResults && results.groupResults.generated > 0) {
            logger.info('Group statements generated', { context: 'StatementsFile', count: results.groupResults.generated });
            results.groupResults.groups.forEach(g => {
                logger.info('Group statement', { context: 'StatementsFile', groupName: g.groupName, memberCount: g.memberCount, statementId: g.statementId });
            });
        }

        BackgroundJobService.completeJob(jobId, {
            summary: {
                generated: totalGenerated,
                skipped: totalSkipped,
                errors: totalErrors,
                shouldConvertToCalendar: shouldConvertCount,
                groupsGenerated: results.groupResults?.generated || 0,
                individualGenerated: results.generated.length
            },
            results
        });

    } catch (error) {
        BackgroundJobService.failJob(jobId, error);
        throw error;
    }
}

/**
 * Original synchronous version (kept for backward compatibility, but not used)
 */
async function generateAllOwnerStatements(req, res, startDate, endDate, calculationType) {
    try {
        // Get all owners and all listings
        const owners = await FileDataService.getOwners();
        const listings = await FileDataService.getListings();

        const results = {
            generated: [],
            skipped: [],
            errors: []
        };

        // Loop through each owner
        for (const owner of owners) {
            // Find properties for this owner
            const ownerProperties = listings.filter(listing => {
                // Check if this listing belongs to the current owner
                const belongsToOwner = owner.listingIds && owner.listingIds.includes(listing.id);
                return belongsToOwner && listing.isActive;
            });

            if (ownerProperties.length === 0) {
                results.skipped.push({
                    ownerId: owner.id,
                    ownerName: owner.name,
                    reason: 'No properties found'
                });
                continue;
            }

            // Generate a statement for each property
            for (const property of ownerProperties) {
                try {
                    // Get reservations and expenses for this specific property
                    const reservations = await FileDataService.getReservations(
                        startDate,
                        endDate,
                        property.id,
                        calculationType
                    );

                    const expenses = await FileDataService.getExpenses(startDate, endDate, property.id);

                    // Filter reservations for this property and period
                    const periodStart = new Date(startDate);
                    const periodEnd = new Date(endDate);

                    const periodReservations = reservations.filter(res => {
                        // Use parseInt to ensure proper type comparison
                        if (parseInt(res.propertyId) !== parseInt(property.id)) return false;

                        let dateMatch = true;
                        if (calculationType === 'calendar') {
                            dateMatch = true; // Already filtered by overlap
                        } else {
                            const checkoutDate = new Date(res.checkOutDate);
                            dateMatch = checkoutDate >= periodStart && checkoutDate <= periodEnd;
                        }

                        const allowedStatuses = ['confirmed', 'accepted'];
                        const statusMatch = allowedStatuses.includes(res.status);

                        return dateMatch && statusMatch;
                    }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

                    // Filter expenses for this property (LL Cover handled separately for hidden items)
                    const periodExpensesAll = expenses.filter(exp => {
                        // Use parseInt to ensure proper type comparison
                        if (property.id && exp.propertyId !== null && parseInt(exp.propertyId) !== parseInt(property.id)) {
                            return false;
                        }
                        const expenseDate = new Date(exp.date);
                        return expenseDate >= periodStart && expenseDate <= periodEnd;
                    });
                    const llCoverExpenses = periodExpensesAll.filter(exp => isLlCoverExpense(exp));
                    const periodExpenses = periodExpensesAll.filter(exp => !isLlCoverExpense(exp));

                    // Skip if no activity
                    if (periodReservations.length === 0 && periodExpenses.length === 0) {
                        results.skipped.push({
                            ownerId: owner.id,
                            ownerName: owner.name,
                            propertyId: property.id,
                            propertyName: property.nickname || property.displayName || property.name,
                            reason: 'No activity in period'
                        });
                        continue;
                    }

                    // Get PM percentage and settings from listing database (property-specific)
                    let pmPercentage = 15; // Default fallback
                    const listing = await ListingService.getListingWithPmFee(property.id);
                    if (listing && listing.pmFeePercentage !== null) {
                        pmPercentage = listing.pmFeePercentage;
                    }
                    const cleaningFeePassThrough = listing?.cleaningFeePassThrough || false;

                    // Filter out cleaning expenses if cleaningFeePassThrough is enabled
                    // This prevents double-charging (once via Cleaning Expense column, once via expense list)
                    const filteredExpenses = cleaningFeePassThrough
                        ? periodExpenses.filter(exp => {
                            const category = (exp.category || '').toLowerCase();
                            const type = (exp.type || '').toLowerCase();
                            const description = (exp.description || '').toLowerCase();
                            const isCleaningOrSupplies = category.includes('cleaning') || type.includes('cleaning') || description.startsWith('cleaning') || category.includes('supplies') || type.includes('supplies') || description.includes('supplies');
                            return !isCleaningOrSupplies;
                        })
                        : periodExpenses;

                    // Generate cleaning fee expenses from reservations when pass-through is enabled
                    const cleaningFeeExpenses = [];
                    if (cleaningFeePassThrough && periodReservations.length > 0) {
                        for (const res of periodReservations) {
                            const cleaningFee = res.cleaningFee ?? listing?.cleaningFee ?? 0;
                            if (cleaningFee > 0) {
                                cleaningFeeExpenses.push({
                                    id: `cleaning-${res.hostifyId || res.reservationId || res.id}`,
                                    propertyId: property.id,
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
                    const combinedExpenses = [...filteredExpenses, ...cleaningFeeExpenses];

                    // Get listing settings for proper calculation
                    const isCohostOnAirbnb = listing?.isCohostOnAirbnb || false;
                    const airbnbPassThroughTax = listing?.airbnbPassThroughTax || false;
                    const disregardTax = listing?.disregardTax || false;

                    // Calculate totals - matching PDF template logic exactly
                    // This ensures statement list shows same values as PDF
                    let totalRevenue = 0;
                    let totalGrossPayout = 0;
                    let totalPmCommission = 0;

                    for (const res of periodReservations) {
                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        const isCohostAirbnb = isAirbnb && isCohostOnAirbnb;

                        const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                        const pmFee = clientRevenue * (pmPercentage / 100);
                        const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
                        // Reverse-engineer actual cleaning fee from guest-paid amount (only when pass-through enabled)
                        // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
                        const guestPaidCleaningFee = res.cleaningFee ?? property.cleaningFee ?? 0;
                        const cleaningFeeForPassThrough = cleaningFeePassThrough && guestPaidCleaningFee > 0
                            ? Math.ceil((guestPaidCleaningFee / (1 + pmPercentage / 100)) / 5) * 5
                            : 0;

                        const shouldAddTax = !disregardTax && (!isAirbnb || airbnbPassThroughTax);

                        // Add to revenue (skip for co-host Airbnb)
                        if (!isCohostAirbnb) {
                            totalRevenue += clientRevenue;
                        }
                        totalPmCommission += pmFee;

                        // Calculate gross payout per reservation (matching PDF logic exactly)
                        let grossPayout;
                        if (isCohostAirbnb) {
                            grossPayout = -pmFee - cleaningFeeForPassThrough;
                        } else if (shouldAddTax) {
                            grossPayout = clientRevenue - pmFee + taxResponsibility - cleaningFeeForPassThrough;
                        } else {
                            grossPayout = clientRevenue - pmFee - cleaningFeeForPassThrough;
                        }
                        totalGrossPayout += grossPayout;
                    }

                    // Separate expenses (negative/costs) from upsells (positive/revenue) - use filtered expenses
                    const totalExpenses = filteredExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum : sum + Math.abs(exp.amount);
                    }, 0);

                    // Calculate total upsells (additional payouts) - use filtered expenses
                    const totalUpsells = filteredExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum + exp.amount : sum;
                    }, 0);

                    const pmCommission = totalPmCommission;
                    const techFees = 50; // $50 per property
                    const insuranceFees = 25; // $25 per property
                    // Calculate owner payout using gross payout sum (matches PDF exactly)
                    const ownerPayout = totalGrossPayout + totalUpsells - totalExpenses;

                    // Generate unique ID
                    const existingStatements = await FileDataService.getStatements();
                    const newId = FileDataService.generateId(existingStatements);

                    // Create statement object
                    const statement = {
                        id: newId,
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        weekStartDate: startDate,
                        weekEndDate: endDate,
                        calculationType,
                        totalRevenue: Math.round(totalRevenue * 100) / 100,
                        totalExpenses: Math.round(totalExpenses * 100) / 100,
                        pmCommission: Math.round(pmCommission * 100) / 100,
                        pmPercentage: pmPercentage,
                        techFees: Math.round(techFees * 100) / 100,
                        insuranceFees: Math.round(insuranceFees * 100) / 100,
                        adjustments: 0,
                        ownerPayout: Math.round(ownerPayout * 100) / 100,
                        cleaningFeePassThrough: cleaningFeePassThrough,
                        status: 'draft',
                        sentAt: null,
                        createdAt: new Date().toISOString(),
                        reservations: periodReservations,
                        expenses: combinedExpenses, // Use all expenses including auto-generated cleaning fees
                        duplicateWarnings: [],
                        items: [
                            ...periodReservations.map(res => ({
                                type: 'revenue',
                                description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                                amount: res.grossAmount,
                                date: res.checkOutDate,
                                category: 'booking'
                            })),
                            // Use filtered expenses to exclude cleaning when pass-through enabled
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
                            }),
                            ...llCoverExpenses.map(exp => {
                                const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                                return {
                                    type: isUpsell ? 'upsell' : 'expense',
                                    description: exp.description,
                                    amount: Math.abs(exp.amount),
                                    date: exp.date,
                                    category: exp.type || exp.category || 'expense',
                                    vendor: exp.vendor,
                                    listing: exp.listing,
                                    hidden: true,
                                    hiddenReason: 'll_cover'
                                };
                            })
                        ]
                    };

                    // Save statement
                    await FileDataService.saveStatement(statement);

                    results.generated.push({
                        id: newId,
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        ownerPayout: statement.ownerPayout,
                        totalRevenue: statement.totalRevenue,
                        reservationCount: periodReservations.length,
                        expenseCount: periodExpenses.length
                    });

                } catch (error) {
                    results.errors.push({
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        error: error.message
                    });
                }
            }
        }

        res.status(201).json({
            message: 'Bulk statement generation completed',
            summary: {
                generated: results.generated.length,
                skipped: results.skipped.length,
                errors: results.errors.length
            },
            results: results
        });

    } catch (error) {
        logger.logError(error, { context: 'StatementsFile', action: 'bulkGenerate' });
        res.status(500).json({ error: 'Failed to generate statements for all owners' });
    }
}

module.exports = router;
