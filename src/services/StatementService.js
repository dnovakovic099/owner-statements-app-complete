/**
 * Statement Service
 * Handles statement generation for scheduled tasks
 * Uses same calculation logic as manual generation for consistency
 */

const { Op, UniqueConstraintError } = require('sequelize');
const Statement = require('../models/Statement');
const Listing = require('../models/Listing');
const ActivityLog = require('../models/ActivityLog');
const FileDataService = require('./FileDataService');
const ListingService = require('./ListingService');
const StatementCalculationService = require('./StatementCalculationService');
const logger = require('../utils/logger');

class StatementService {
    /**
     * Check if a statement already exists for the given criteria
     * Prevents duplicate auto-generation
     */
    async checkExistingStatement(options) {
        const { groupId, listingId, startDate, endDate } = options;

        // Check in database
        const dbWhere = {
            weekStartDate: startDate,
            weekEndDate: endDate
        };

        if (groupId) {
            dbWhere.groupId = groupId;
        } else if (listingId) {
            dbWhere.propertyId = listingId;
            dbWhere.groupId = null;
        }

        const dbExisting = await Statement.findOne({ where: dbWhere });
        if (dbExisting) {
            return dbExisting;
        }

        // Also check in file-based statements
        try {
            const fileStatements = await FileDataService.getStatements();
            const fileExisting = fileStatements.find(s => {
                if (s.weekStartDate !== startDate || s.weekEndDate !== endDate) {
                    return false;
                }
                if (groupId) {
                    return s.groupId === groupId;
                } else if (listingId) {
                    return s.propertyId === listingId && !s.groupId;
                }
                return false;
            });
            if (fileExisting) {
                return fileExisting;
            }
        } catch (err) {
            // File service might not be available
        }

        return null;
    }

    /**
     * Generate a combined statement for a group
     * Uses same logic as manual generation
     */
    async generateGroupStatement(options) {
        const { groupId, groupName, listingIds, startDate, endDate, calculationType = 'checkout' } = options;

        logger.info(`Generating statement for group "${groupName}" (${listingIds.length} listings)`, { context: 'StatementService', action: 'generateGroupStatement', groupName, listingCount: listingIds.length });
        logger.info(`Period: ${startDate} to ${endDate}, Type: ${calculationType}`, { context: 'StatementService', startDate, endDate, calculationType });

        try {
            // Check for existing statement to prevent duplicates
            const existingStatement = await this.checkExistingStatement({ groupId, startDate, endDate });
            if (existingStatement) {
                logger.info(`Statement already exists for group "${groupName}" (ID: ${existingStatement.id}), skipping`, { context: 'StatementService', action: 'skipDuplicate', groupName, existingId: existingStatement.id });
                return { skipped: true, existingId: existingStatement.id, reason: 'duplicate' };
            }

            const parsedPropertyIds = listingIds.map(id => parseInt(id));

            // Fetch listings from file data (same as manual generation)
            const allListings = await FileDataService.getListings();
            const targetListings = allListings.filter(l => parsedPropertyIds.includes(l.id));

            if (targetListings.length === 0) {
                throw new Error('No listings found for the group');
            }

            // Get listing info with PM fees from database
            const dbListings = await ListingService.getListingsWithPmFees(parsedPropertyIds);
            const listingInfoMap = {};
            dbListings.forEach(l => { listingInfoMap[l.id] = l; });

            // Merge file data into listing info
            targetListings.forEach(l => {
                if (listingInfoMap[l.id]) {
                    listingInfoMap[l.id].cleaningFee = l.cleaningFee || 0;
                    listingInfoMap[l.id].internalNotes = l.internalNotes;
                } else {
                    listingInfoMap[l.id] = l;
                }
            });

            // Fetch reservations and expenses using batch methods (same as manual generation)
            const [reservationsByProperty, expensesByProperty] = await Promise.all([
                FileDataService.getReservationsBatch(startDate, endDate, parsedPropertyIds, calculationType, listingInfoMap),
                FileDataService.getExpensesBatch(startDate, endDate, parsedPropertyIds)
            ]);

            // Combine all reservations and expenses
            let allReservations = [];
            let allExpenses = [];

            for (const propId of parsedPropertyIds) {
                const propReservations = reservationsByProperty[propId] || [];
                const propExpenseData = expensesByProperty[propId] || { expenses: [], duplicateWarnings: [] };

                allReservations.push(...propReservations);
                allExpenses.push(...propExpenseData.expenses);
            }

            // Add duplicate warnings
            allExpenses.duplicateWarnings = [];
            for (const propId of parsedPropertyIds) {
                const propExpenseData = expensesByProperty[propId] || { duplicateWarnings: [] };
                allExpenses.duplicateWarnings.push(...(propExpenseData.duplicateWarnings || []));
            }

            // Calculate financials using shared service
            const financials = StatementCalculationService.calculateStatementFinancials({
                reservations: allReservations,
                expenses: allExpenses,
                listingInfoMap,
                propertyIds: parsedPropertyIds,
                startDate,
                endDate,
                calculationType
            });

            // Build internal notes
            const internalNotes = StatementCalculationService.buildInternalNotes(targetListings);

            // Create property names string
            const propertyNames = targetListings.map(l => l.nickname || l.displayName || l.name).join(', ');

            // Get owners for owner info
            const owners = await FileDataService.getOwners();
            const owner = owners[0] || { id: 1, name: groupName };

            // Create statement object (matching manual generation structure)
            // ID will be assigned by database
            const statementData = {
                ownerId: owner.id === 'default' ? 1 : parseInt(owner.id),
                ownerName: owner.name,
                propertyId: null,
                propertyIds: parsedPropertyIds,
                propertyName: groupName,
                propertyNames: propertyNames,
                groupId,
                groupName,
                groupTags: null,
                weekStartDate: startDate,
                weekEndDate: endDate,
                calculationType,
                totalRevenue: financials.totalRevenue,
                totalExpenses: financials.totalExpenses,
                pmCommission: financials.pmCommission,
                pmPercentage: financials.pmPercentage,
                techFees: financials.techFees,
                insuranceFees: financials.insuranceFees,
                adjustments: 0,
                ownerPayout: financials.ownerPayout,
                isCombinedStatement: true,
                propertyCount: financials.propertyCount,
                totalCleaningFee: financials.totalCleaningFee,
                cleaningFeePassThrough: targetListings.some(l => listingInfoMap[l.id]?.cleaningFeePassThrough),
                // Snapshot per-property listing settings at generation time
                listingSettingsSnapshot: (() => {
                    const snapshot = {};
                    for (const propId of parsedPropertyIds) {
                        const info = listingInfoMap[propId] || {};
                        snapshot[propId] = {
                            isCohostOnAirbnb: Boolean(info.isCohostOnAirbnb),
                            disregardTax: Boolean(info.disregardTax),
                            airbnbPassThroughTax: Boolean(info.airbnbPassThroughTax),
                            cleaningFeePassThrough: Boolean(info.cleaningFeePassThrough),
                            guestPaidDamageCoverage: Boolean(info.guestPaidDamageCoverage),
                            waiveCommission: Boolean(info.waiveCommission),
                            waiveCommissionUntil: info.waiveCommissionUntil || null,
                            cleaningFee: info.cleaningFee || 0,
                            pmFeePercentage: info.pmFeePercentage ?? 15,
                            newPmFeeEnabled: Boolean(info.newPmFeeEnabled),
                            newPmFeePercentage: info.newPmFeePercentage ?? null,
                            newPmFeeStartDate: info.newPmFeeStartDate || null,
                            nickname: info.nickname || info.displayName || info.name || ''
                        };
                    }
                    return snapshot;
                })(),
                status: 'draft',
                sentAt: null,
                createdAt: new Date().toISOString(),
                internalNotes,
                reservations: financials.periodReservations,
                expenses: allExpenses,
                duplicateWarnings: financials.duplicateWarnings,
                cleaningMismatchWarning: financials.cleaningMismatchWarning,
                items: []
            };

            // Save to database (same storage as manual generation)
            logger.info(`Saving statement for group "${groupName}"`, { context: 'StatementService', action: 'saveGroupStatement', groupId, groupName });
            logger.debug(`Statement data`, { context: 'StatementService', totalRevenue: financials.totalRevenue, ownerPayout: financials.ownerPayout, listingCount: parsedPropertyIds.length });

            const savedStatement = await FileDataService.saveStatement(statementData);
            statementData.id = savedStatement.id;

            logger.info(`SUCCESS - Created draft statement ID: ${statementData.id} for group "${groupName}"`, { context: 'StatementService', action: 'createGroupStatement', statementId: statementData.id, groupName });

            // Log to activity log
            await ActivityLog.logSystem('AUTO_GENERATE', 'statement', statementData.id, {
                type: 'group',
                groupId,
                groupName,
                listingCount: listingIds.length,
                startDate,
                endDate,
                calculationType,
                totalRevenue: financials.totalRevenue,
                ownerPayout: financials.ownerPayout
            });

            return statementData;
        } catch (error) {
            // Handle race condition: another process created the statement between our check and save
            if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
                logger.info(`Statement already exists for group "${groupName}" (caught by unique constraint), skipping`, { context: 'StatementService', action: 'skipDuplicate', groupName });
                const existing = await this.checkExistingStatement({ groupId, startDate, endDate });
                return { skipped: true, existingId: existing?.id, reason: 'duplicate' };
            }
            logger.error(`FAILED - Error generating group statement for "${groupName}"`, { context: 'StatementService', action: 'generateGroupStatement', groupId, groupName, error: error.message, stack: error.stack });
            throw error;
        }
    }

    /**
     * Generate an individual statement for a single listing
     * Uses same logic as manual generation
     */
    async generateIndividualStatement(options) {
        const { listingId, startDate, endDate, calculationType = 'checkout' } = options;

        logger.info(`Generating individual statement for listing ${listingId}`, { context: 'StatementService', action: 'generateIndividualStatement', listingId });
        logger.info(`Period: ${startDate} to ${endDate}, Type: ${calculationType}`, { context: 'StatementService', startDate, endDate, calculationType });

        try {
            // Check for existing statement to prevent duplicates
            const existingStatement = await this.checkExistingStatement({ listingId, startDate, endDate });
            if (existingStatement) {
                logger.info(`Statement already exists for listing ${listingId} (ID: ${existingStatement.id}), skipping`, { context: 'StatementService', action: 'skipDuplicate', listingId, existingId: existingStatement.id });
                return { skipped: true, existingId: existingStatement.id, reason: 'duplicate' };
            }

            const parsedPropertyId = parseInt(listingId);

            // Fetch listing from file data
            const allListings = await FileDataService.getListings();
            const targetListing = allListings.find(l => l.id === parsedPropertyId);

            if (!targetListing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            const listingName = targetListing.nickname || targetListing.displayName || targetListing.name;

            // Get listing info with PM fees from database
            const dbListings = await ListingService.getListingsWithPmFees([parsedPropertyId]);
            const listingInfoMap = {};
            dbListings.forEach(l => { listingInfoMap[l.id] = l; });

            // Merge file data
            if (listingInfoMap[parsedPropertyId]) {
                listingInfoMap[parsedPropertyId].cleaningFee = targetListing.cleaningFee || 0;
                listingInfoMap[parsedPropertyId].internalNotes = targetListing.internalNotes;
            } else {
                listingInfoMap[parsedPropertyId] = targetListing;
            }

            // Fetch reservations and expenses
            const [reservations, expenseData] = await Promise.all([
                FileDataService.getReservations(startDate, endDate, parsedPropertyId, calculationType),
                FileDataService.getExpenses(startDate, endDate, parsedPropertyId)
            ]);

            const expenses = expenseData.expenses || expenseData;
            expenses.duplicateWarnings = expenseData.duplicateWarnings || [];

            // Calculate financials using shared service
            const financials = StatementCalculationService.calculateStatementFinancials({
                reservations,
                expenses,
                listingInfoMap,
                propertyIds: [parsedPropertyId],
                startDate,
                endDate,
                calculationType
            });

            // Get owners for owner info
            const owners = await FileDataService.getOwners();
            const owner = owners[0] || { id: 1, name: listingName };

            // Create statement object (ID will be assigned by database)
            const statementData = {
                ownerId: owner.id === 'default' ? 1 : parseInt(owner.id),
                ownerName: owner.name,
                propertyId: parsedPropertyId,
                propertyIds: [parsedPropertyId],
                propertyName: listingName,
                propertyNames: listingName,
                groupId: null,
                groupName: null,
                groupTags: null,
                weekStartDate: startDate,
                weekEndDate: endDate,
                calculationType,
                totalRevenue: financials.totalRevenue,
                totalExpenses: financials.totalExpenses,
                pmCommission: financials.pmCommission,
                pmPercentage: financials.pmPercentage,
                techFees: financials.techFees,
                insuranceFees: financials.insuranceFees,
                adjustments: 0,
                ownerPayout: financials.ownerPayout,
                isCombinedStatement: false,
                propertyCount: 1,
                totalCleaningFee: financials.totalCleaningFee,
                cleaningFeePassThrough: listingInfoMap[parsedPropertyId]?.cleaningFeePassThrough || false,
                isCohostOnAirbnb: listingInfoMap[parsedPropertyId]?.isCohostOnAirbnb || false,
                // Snapshot listing settings at generation time
                waiveCommission: Boolean(listingInfoMap[parsedPropertyId]?.waiveCommission),
                waiveCommissionUntil: listingInfoMap[parsedPropertyId]?.waiveCommissionUntil || null,
                disregardTax: Boolean(listingInfoMap[parsedPropertyId]?.disregardTax),
                airbnbPassThroughTax: Boolean(listingInfoMap[parsedPropertyId]?.airbnbPassThroughTax),
                guestPaidDamageCoverage: Boolean(listingInfoMap[parsedPropertyId]?.guestPaidDamageCoverage),
                listingSettingsSnapshot: listingInfoMap[parsedPropertyId] ? {
                    [parsedPropertyId]: {
                        isCohostOnAirbnb: Boolean(listingInfoMap[parsedPropertyId].isCohostOnAirbnb),
                        disregardTax: Boolean(listingInfoMap[parsedPropertyId].disregardTax),
                        airbnbPassThroughTax: Boolean(listingInfoMap[parsedPropertyId].airbnbPassThroughTax),
                        cleaningFeePassThrough: Boolean(listingInfoMap[parsedPropertyId].cleaningFeePassThrough),
                        guestPaidDamageCoverage: Boolean(listingInfoMap[parsedPropertyId].guestPaidDamageCoverage),
                        waiveCommission: Boolean(listingInfoMap[parsedPropertyId].waiveCommission),
                        waiveCommissionUntil: listingInfoMap[parsedPropertyId].waiveCommissionUntil || null,
                        cleaningFee: listingInfoMap[parsedPropertyId].cleaningFee || 0,
                        pmFeePercentage: listingInfoMap[parsedPropertyId].pmFeePercentage ?? 15,
                        newPmFeeEnabled: Boolean(listingInfoMap[parsedPropertyId].newPmFeeEnabled),
                        newPmFeePercentage: listingInfoMap[parsedPropertyId].newPmFeePercentage ?? null,
                        newPmFeeStartDate: listingInfoMap[parsedPropertyId].newPmFeeStartDate || null
                    }
                } : null,
                status: 'draft',
                sentAt: null,
                createdAt: new Date().toISOString(),
                internalNotes: targetListing.internalNotes || null,
                reservations: financials.periodReservations,
                expenses: expenses,
                duplicateWarnings: financials.duplicateWarnings,
                cleaningMismatchWarning: financials.cleaningMismatchWarning,
                items: []
            };

            // Save to database (same as group statements)
            logger.info(`Saving individual statement for "${listingName}"`, { context: 'StatementService', action: 'saveIndividualStatement', listingId, listingName });
            const savedStatement = await FileDataService.saveStatement(statementData);
            statementData.id = savedStatement.id;

            logger.info(`SUCCESS - Created draft statement ID: ${statementData.id} for listing "${listingName}"`, { context: 'StatementService', action: 'createIndividualStatement', statementId: statementData.id, listingName });

            // Log to activity log
            await ActivityLog.logSystem('AUTO_GENERATE', 'statement', statementData.id, {
                type: 'individual',
                listingId,
                listingName,
                startDate,
                endDate,
                calculationType,
                totalRevenue: financials.totalRevenue,
                ownerPayout: financials.ownerPayout
            });

            return statementData;
        } catch (error) {
            // Handle race condition: another process created the statement between our check and save
            if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
                logger.info(`Statement already exists for listing ${listingId} (caught by unique constraint), skipping`, { context: 'StatementService', action: 'skipDuplicate', listingId });
                const existing = await this.checkExistingStatement({ listingId, startDate, endDate });
                return { skipped: true, existingId: existing?.id, reason: 'duplicate' };
            }
            logger.error(`Error generating individual statement`, { context: 'StatementService', action: 'generateIndividualStatement', error: error.message, stack: error.stack });
            throw error;
        }
    }
}

module.exports = new StatementService();
