const { Listing } = require('../models');
const HostifyService = require('./HostifyService');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

// Lazy load ListingGroup to avoid circular dependency issues
let ListingGroup = null;
const getListingGroup = () => {
    if (!ListingGroup) {
        try {
            ListingGroup = require('../models/ListingGroup');
        } catch (e) {
            // Model may not exist yet during initial setup
            ListingGroup = null;
        }
    }
    return ListingGroup;
};

class ListingService {
    /**
     * Extract PM fee percentage from tags string
     * Looks for pattern like "20%,pm" or "15%,pm" in the tags
     * @param {string} tags - Comma-separated tags string
     * @returns {number|null} PM fee percentage or null if not found
     */
    extractPmFeeFromTags(tags) {
        if (!tags || typeof tags !== 'string') {
            return null;
        }

        // Split tags by comma and look for percentage followed by "pm"
        const tagArray = tags.split(',').map(t => t.trim().toLowerCase());

        for (let i = 0; i < tagArray.length - 1; i++) {
            const tag = tagArray[i];
            const nextTag = tagArray[i + 1];

            // Check if current tag is a percentage and next tag is "pm"
            if (tag.endsWith('%') && nextTag === 'pm') {
                const percentValue = parseFloat(tag.replace('%', ''));
                if (!isNaN(percentValue) && percentValue > 0 && percentValue <= 100) {
                    logger.debug('Extracted PM fee from tags', { pmFee: percentValue });
                    return percentValue;
                }
            }
        }

        return null;
    }

    /**
     * Sync listings from Hostify to database
     * Preserves PM fees, updates other listing info
     * OPTIMIZED: Batch fetch existing listing IDs to avoid N+1 queries
     */
    async syncListingsFromHostify() {
        logger.info('Syncing listings from Hostify to database');

        try {
            const response = await HostifyService.getAllProperties();

            if (!response || !response.result || !Array.isArray(response.result)) {
                logger.warn('No listings received from Hostify');
                return { synced: 0, errors: 0 };
            }

            const hostifyListings = response.result;
            const sequelize = Listing.sequelize;
            let synced = 0;
            let created = 0;
            let errors = 0;

            // OPTIMIZATION: Batch fetch all existing listing IDs in one query
            const existingListings = await Listing.findAll({
                attributes: ['id'],
                raw: true
            });
            const existingIds = new Set(existingListings.map(l => l.id));

            for (const hostifyListing of hostifyListings) {
                try {
                    const listingExists = existingIds.has(hostifyListing.id);

                    if (listingExists) {
                        await sequelize.query(`
                            UPDATE listings SET
                                name = :name,
                                nickname = :nickname,
                                street = :street,
                                city = :city,
                                state = :state,
                                country = :country,
                                is_active = :isActive,
                                last_synced_at = :lastSyncedAt,
                                updated_at = :updatedAt
                            WHERE id = :id
                        `, {
                            replacements: {
                                id: hostifyListing.id,
                                name: hostifyListing.name || 'Unknown',
                                nickname: hostifyListing.nickname || null,
                                street: hostifyListing.street || null,
                                city: hostifyListing.city || null,
                                state: hostifyListing.state || null,
                                country: hostifyListing.country || null,
                                isActive: hostifyListing.is_listed === 1,
                                lastSyncedAt: new Date(),
                                updatedAt: new Date()
                            },
                            type: sequelize.QueryTypes.UPDATE
                        });
                        synced++;
                    } else {
                        // Create NEW listing - fetch detailed data to get tags for PM fee and owner email
                        let pmFeePercentage = 15.00; // Default
                        let ownerEmail = null;
                        let ownerName = null;

                        try {
                            // Fetch detailed listing to get tags
                            const detailedResponse = await HostifyService.getProperty(hostifyListing.id);
                            if (detailedResponse.success && detailedResponse.listing) {
                                const tags = detailedResponse.listing.tags;
                                const extractedPmFee = this.extractPmFeeFromTags(tags);
                                if (extractedPmFee !== null) {
                                    pmFeePercentage = extractedPmFee;
                                    logger.info('New listing PM fee from tags', { listing: hostifyListing.nickname || hostifyListing.name, pmFee: pmFeePercentage });
                                }
                            }
                        } catch (detailError) {
                            logger.warn('Could not fetch detailed listing for PM fee', { listingId: hostifyListing.id, error: detailError.message });
                        }

                        // Fetch owner email from contract endpoint
                        try {
                            const contractResponse = await HostifyService.getListingContract(hostifyListing.id);
                            if (contractResponse.success && contractResponse.ownerEmail) {
                                ownerEmail = contractResponse.ownerEmail;
                                ownerName = contractResponse.ownerFirstName || contractResponse.ownerName;  // Use first name for greeting
                                logger.info('New listing owner info', { listing: hostifyListing.nickname || hostifyListing.name, ownerEmail, ownerGreeting: ownerName });
                            }
                        } catch (contractError) {
                            logger.warn('Could not fetch contract for listing', { listingId: hostifyListing.id, error: contractError.message });
                        }

                        await Listing.create({
                            id: hostifyListing.id,
                            name: hostifyListing.name || 'Unknown',
                            nickname: hostifyListing.nickname || null,
                            street: hostifyListing.street || null,
                            city: hostifyListing.city || null,
                            state: hostifyListing.state || null,
                            country: hostifyListing.country || null,
                            isActive: hostifyListing.is_listed === 1,
                            lastSyncedAt: new Date(),
                            pmFeePercentage: pmFeePercentage,
                            ownerEmail: ownerEmail,
                            ownerGreeting: ownerName
                        });
                        created++;
                        logger.info('Created new listing', { name: hostifyListing.nickname || hostifyListing.name, id: hostifyListing.id, pmFee: pmFeePercentage, ownerEmail });
                    }
                } catch (error) {
                    logger.error('Error syncing listing', { listingId: hostifyListing.id, error: error.message });
                    errors++;
                }
            }

            logger.info('Listing sync completed', { synced, created, errors });
            return { synced, created, errors };

        } catch (error) {
            logger.error('Error syncing listings from Hostify', { error: error.message, stack: error.stack });
            throw error;
        }
    }

    /**
     * Get listing with PM fee
     */
    async getListingWithPmFee(listingId) {
        try {
            const listing = await Listing.findByPk(listingId);
            return listing ? listing.toJSON() : null;
        } catch (error) {
            logger.error('Error fetching listing', { listingId, error: error.message });
            return null;
        }
    }

    /**
     * Get multiple listings with PM fees and group data
     */
    async getListingsWithPmFees(listingIds = [], filters = {}) {
        try {
            const where = {};

            if (listingIds.length > 0) {
                where.id = { [Op.in]: listingIds };
            }

            if (filters.search) {
                const term = `%${filters.search}%`;
                where[Op.or] = [
                    { name: { [Op.iLike]: term } },
                    { displayName: { [Op.iLike]: term } },
                    { nickname: { [Op.iLike]: term } },
                    { city: { [Op.iLike]: term } }
                ];
                const searchNum = parseInt(filters.search, 10);
                if (!isNaN(searchNum)) {
                    where[Op.or].push({ id: searchNum });
                }
            }

            if (filters.cities && Array.isArray(filters.cities) && filters.cities.length > 0) {
                where.city = { [Op.in]: filters.cities };
            }

            if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
                const tagConds = filters.tags.map(tag => ({
                    tags: { [Op.iLike]: `%${tag}%` }
                }));
                where[Op.or] = where[Op.or] ? [...where[Op.or], ...tagConds] : tagConds;
            }

            if (filters.noTag) {
                const noTagCond = {
                    [Op.or]: [
                        { tags: null },
                        { tags: '' }
                    ]
                };
                where[Op.and] = where[Op.and] ? [...where[Op.and], noTagCond] : [noTagCond];
            }

            const addBoolFilter = (field, value) => {
                if (value === 'enabled') where[field] = true;
                if (value === 'disabled') where[field] = false;
            };

            if (filters.cohost === 'cohost') where.isCohostOnAirbnb = true;
            if (filters.cohost === 'not-cohost') where.isCohostOnAirbnb = false;

            if (filters.ownerEmail === 'has-email') where.ownerEmail = { [Op.ne]: null };
            if (filters.ownerEmail === 'no-email') where[Op.or] = where[Op.or]
                ? [...where[Op.or], { ownerEmail: null }, { ownerEmail: '' }]
                : [{ ownerEmail: null }, { ownerEmail: '' }];

            if (filters.autoSend === 'enabled') where.autoSendStatements = true;
            if (filters.autoSend === 'disabled') where.autoSendStatements = false;

            addBoolFilter('airbnbPassThroughTax', filters.passThroughTax);
            addBoolFilter('disregardTax', filters.disregardTax);
            addBoolFilter('cleaningFeePassThrough', filters.cleaningFeePassThrough);
            addBoolFilter('guestPaidDamageCoverage', filters.guestPaidDamageCoverage);
            addBoolFilter('waiveCommission', filters.waiveCommission);

            if (filters.payoutStatus) {
                where.payoutStatus = filters.payoutStatus;
            }

            const listings = await Listing.findAll({ where });

            // Try to include group data if ListingGroup model exists
            const LG = getListingGroup();
            if (LG) {
                // Get all unique group IDs
                const groupIds = [...new Set(listings.map(l => l.groupId).filter(id => id != null))];

                if (groupIds.length > 0) {
                    // Fetch groups in one query
                    const groups = await LG.findAll({
                        where: { id: { [Op.in]: groupIds } }
                    });
                    const groupMap = new Map(groups.map(g => [g.id, g.toJSON()]));

                    // Attach group data to each listing
                    return listings.map(l => {
                        const listingJson = l.toJSON();
                        if (listingJson.groupId && groupMap.has(listingJson.groupId)) {
                            const group = groupMap.get(listingJson.groupId);
                            listingJson.group = {
                                id: group.id,
                                name: group.name,
                                tags: group.tags
                            };
                        } else {
                            listingJson.group = null;
                        }
                        return listingJson;
                    });
                }
            }

            return listings.map(l => {
                const json = { ...l.toJSON(), group: null };
                try {
                    json.stripeAccountId = decryptOptional(json.stripeAccountId);
                } catch (e) {
                    json.stripeAccountId = null;
                }
                return json;
            });
        } catch (error) {
            logger.error('Error fetching listings', { error: error.message });
            return [];
        }
    }

    /**
     * Get lightweight listing names for lookups (id, name, displayName, nickname, internalNotes, ownerEmail, tags)
     */
    async getListingNames() {
        try {
            const listings = await Listing.findAll({
                attributes: ['id', 'name', 'displayName', 'nickname', 'internalNotes', 'ownerEmail', 'tags', 'payoutStatus', 'payoutNotes', 'stripeAccountId', 'stripeOnboardingStatus']
            });
            return listings.map(l => {
                const json = l.toJSON();
                try {
                    json.stripeAccountId = decryptOptional(json.stripeAccountId);
                } catch (e) {
                    logger.warn('Failed to decrypt stripeAccountId for listing', { id: json.id });
                    json.stripeAccountId = null;
                }
                return json;
            });
        } catch (error) {
            logger.error('Error fetching listing names', { error: error.message });
            return [];
        }
    }

    /**
     * Update PM fee for a listing
     */
    async updatePmFee(listingId, pmFeePercentage) {
        try {
            const listing = await Listing.findByPk(listingId);
            
            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            await listing.update({ pmFeePercentage });
            logger.info('Updated PM fee', { listingId, pmFeePercentage });
            
            return listing.toJSON();
        } catch (error) {
            logger.error('Error updating PM fee', { listingId, error: error.message });
            throw error;
        }
    }

    /**
     * Bulk update PM fees
     */
    async bulkUpdatePmFees(pmFeeUpdates) {
        try {
            const results = [];
            
            for (const update of pmFeeUpdates) {
                try {
                    const listing = await this.updatePmFee(update.listingId, update.pmFeePercentage);
                    results.push({ success: true, listingId: update.listingId, listing });
                } catch (error) {
                    results.push({ success: false, listingId: update.listingId, error: error.message });
                }
            }

            return results;
        } catch (error) {
            logger.error('Error bulk updating PM fees', { error: error.message });
            throw error;
        }
    }

    /**
     * Get listings with missing PM fees
     */
    async getListingsWithMissingPmFees() {
        try {
            const listings = await Listing.findAll({
                where: {
                    [Op.or]: [
                        { pmFeePercentage: null },
                        { pmFeePercentage: { [Op.eq]: null } }
                    ],
                    isActive: true
                }
            });

            return listings.map(l => l.toJSON());
        } catch (error) {
            logger.error('Error fetching listings with missing PM fees', { error: error.message });
            return [];
        }
    }

    /**
     * Update listing display name
     */
    async updateDisplayName(listingId, displayName) {
        try {
            const listing = await Listing.findByPk(listingId);
            
            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            await listing.update({ displayName });
            logger.info('Updated display name', { listingId, displayName });
            
            return listing.toJSON();
        } catch (error) {
            logger.error('Error updating display name', { listingId, error: error.message });
            throw error;
        }
    }

    /**
     * Update co-host on Airbnb status
     */
    async updateCohostStatus(listingId, isCohostOnAirbnb) {
        try {
            const listing = await Listing.findByPk(listingId);
            
            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            await listing.update({ isCohostOnAirbnb });
            logger.info('Updated co-host status', { listingId, isCohostOnAirbnb });
            
            return listing.toJSON();
        } catch (error) {
            logger.error('Error updating co-host status', { listingId, error: error.message });
            throw error;
        }
    }

    /**
     * Update listing configuration (display name, co-host status, PM fee, groupId, etc.)
     */
    async updateListingConfig(listingId, config) {
        try {
            logger.debug('Listing config update received', { listingId, config });

            const listing = await Listing.findByPk(listingId);

            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            const updates = {};
            if (config.displayName !== undefined) updates.displayName = config.displayName;
            if (config.isCohostOnAirbnb !== undefined) updates.isCohostOnAirbnb = config.isCohostOnAirbnb;
            if (config.airbnbPassThroughTax !== undefined) updates.airbnbPassThroughTax = config.airbnbPassThroughTax;
            if (config.disregardTax !== undefined) updates.disregardTax = config.disregardTax;
            if (config.cleaningFeePassThrough !== undefined) updates.cleaningFeePassThrough = config.cleaningFeePassThrough;
            if (config.guestPaidDamageCoverage !== undefined) updates.guestPaidDamageCoverage = config.guestPaidDamageCoverage;
            if (config.includeChildListings !== undefined) updates.includeChildListings = config.includeChildListings;
            if (config.waiveCommission !== undefined) updates.waiveCommission = config.waiveCommission;
            if (config.waiveCommissionUntil !== undefined) updates.waiveCommissionUntil = config.waiveCommissionUntil;
            if (config.pmFeePercentage !== undefined) updates.pmFeePercentage = config.pmFeePercentage;
            if (config.defaultPetFee !== undefined) updates.defaultPetFee = config.defaultPetFee;
            if (config.tags !== undefined) updates.tags = config.tags;
            if (config.ownerEmail !== undefined) updates.ownerEmail = config.ownerEmail;
            if (config.ownerGreeting !== undefined) updates.ownerGreeting = config.ownerGreeting;
            if (config.autoSendStatements !== undefined) updates.autoSendStatements = config.autoSendStatements;
            if (config.internalNotes !== undefined) updates.internalNotes = config.internalNotes;
            if (config.payoutStatus !== undefined) updates.payoutStatus = config.payoutStatus;
            if (config.payoutNotes !== undefined) updates.payoutNotes = config.payoutNotes;
            if (config.stripeAccountId !== undefined) {
                updates.stripeAccountId = encryptOptional(config.stripeAccountId);
            }
            if (config.stripeOnboardingStatus !== undefined) updates.stripeOnboardingStatus = config.stripeOnboardingStatus;
            // Support groupId assignment (null to remove from group, number to assign to group)
            if (config.groupId !== undefined) updates.groupId = config.groupId;

            await listing.update(updates);
            await listing.reload(); // Reload to get fresh data from DB
            logger.info('Updated listing configuration', { listingId, updates });

            return listing.toJSON();
        } catch (error) {
            logger.error('Error updating listing configuration', { listingId, error: error.message });
            throw error;
        }
    }

    /**
     * Get display name for a listing (returns displayName if set, otherwise name)
     */
    getDisplayName(listing) {
        return listing.displayName || listing.nickname || listing.name;
    }

    /**
     * Get newly added listings (created within specified days)
     * @param {number} days - Number of days to look back (default 7)
     * @returns {Promise<Array>} Array of newly added listings
     */
    async getNewlyAddedListings(days = 7) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const sequelize = Listing.sequelize;

            const listings = await Listing.findAll({
                where: sequelize.where(sequelize.col('created_at'), Op.gte, cutoffDate),
                order: [[sequelize.col('created_at'), 'DESC']],
                attributes: [
                    'id',
                    'name',
                    'displayName',
                    'nickname',
                    'city',
                    'state',
                    'pmFeePercentage',
                    [sequelize.col('created_at'), 'createdAt']
                ]
            });

            return listings.map(l => ({
                ...l.toJSON(),
                displayName: l.displayName || l.nickname || l.name
            }));
        } catch (error) {
            logger.error('Error fetching newly added listings', { error: error.message });
            return [];
        }
    }

    /**
     * Sync owner emails from Hostify using bulk /users API (much faster)
     * Falls back to contract endpoint for any remaining listings
     * @param {boolean} onlyMissing - If true, only sync listings without owner email
     * @returns {Promise<{updated: number, skipped: number, errors: number}>}
     */
    async syncOwnerEmails(onlyMissing = true) {
        logger.info('Starting owner email sync', { onlyMissing });

        try {
            // Step 1: Get all owners from /users API (bulk, efficient)
            const { success, ownerMap } = await HostifyService.getAllOwners();
            if (!success) {
                logger.warn('Failed to fetch owners from /users API, falling back to contract endpoint');
            }

            // Step 2: Get listings to update
            const where = onlyMissing ? {
                [Op.or]: [
                    { ownerEmail: null },
                    { ownerEmail: '' }
                ]
            } : {};

            const listings = await Listing.findAll({ where });
            logger.info('Found listings to process for owner email sync', { count: listings.length });

            let updated = 0;
            let skipped = 0;
            let errors = 0;

            for (const listing of listings) {
                try {
                    let ownerEmail = null;
                    let ownerGreeting = null;

                    // Try bulk ownerMap first (from /users API)
                    const ownerData = ownerMap[listing.id];
                    if (ownerData && ownerData.email) {
                        ownerEmail = ownerData.email;
                        ownerGreeting = ownerData.firstName || listing.ownerGreeting;
                    } else {
                        // Fall back to contract endpoint for this listing
                        const contractResponse = await HostifyService.getListingContract(listing.id);
                        if (contractResponse.success && contractResponse.ownerEmail) {
                            ownerEmail = contractResponse.ownerEmail;
                            ownerGreeting = contractResponse.ownerFirstName || contractResponse.ownerName || listing.ownerGreeting;
                        }
                        // Small delay only for contract API calls
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    if (ownerEmail) {
                        await listing.update({
                            ownerEmail: ownerEmail,
                            ownerGreeting: ownerGreeting
                        });
                        logger.info('Updated owner email', { listing: listing.nickname || listing.name, ownerEmail, ownerGreeting });
                        updated++;
                    } else {
                        logger.debug('No owner found for listing', { listing: listing.nickname || listing.name });
                        skipped++;
                    }
                } catch (error) {
                    logger.error('Error syncing owner email for listing', { listingId: listing.id, error: error.message });
                    errors++;
                }
            }

            logger.info('Owner email sync completed', { updated, skipped, errors });
            return { updated, skipped, errors };
        } catch (error) {
            logger.error('Owner email sync failed', { error: error.message, stack: error.stack });
            throw error;
        }
    }
}

module.exports = new ListingService();
