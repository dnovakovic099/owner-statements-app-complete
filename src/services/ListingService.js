const { Listing } = require('../models');
const HostifyService = require('./HostifyService');
const { Op } = require('sequelize');

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
                    console.log(`[PM-FEE] Extracted ${percentValue}% PM fee from tags`);
                    return percentValue;
                }
            }
        }

        return null;
    }

    /**
     * Sync listings from Hostify to database
     * Preserves PM fees, updates other listing info
     */
    async syncListingsFromHostify() {
        console.log('Syncing listings from Hostify to database...');

        try {
            const response = await HostifyService.getAllProperties();

            if (!response || !response.result || !Array.isArray(response.result)) {
                console.error('No listings received from Hostify');
                return { synced: 0, errors: 0 };
            }

            const hostifyListings = response.result;
            const sequelize = Listing.sequelize;
            let synced = 0;
            let created = 0;
            let errors = 0;

            for (const hostifyListing of hostifyListings) {
                try {
                    const existingListing = await Listing.findByPk(hostifyListing.id);

                    if (existingListing) {
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
                                    console.log(`[NEW-LISTING] ${hostifyListing.nickname || hostifyListing.name}: PM fee from tags = ${pmFeePercentage}%`);
                                }
                            }
                        } catch (detailError) {
                            console.log(`[WARN] Could not fetch detailed listing ${hostifyListing.id} for PM fee: ${detailError.message}`);
                        }

                        // Fetch owner email from contract endpoint
                        try {
                            const contractResponse = await HostifyService.getListingContract(hostifyListing.id);
                            if (contractResponse.success && contractResponse.ownerEmail) {
                                ownerEmail = contractResponse.ownerEmail;
                                ownerName = contractResponse.ownerFirstName || contractResponse.ownerName;  // Use first name for greeting
                                console.log(`[NEW-LISTING] ${hostifyListing.nickname || hostifyListing.name}: Owner email = ${ownerEmail}, Greeting = ${ownerName}`);
                            }
                        } catch (contractError) {
                            console.log(`[WARN] Could not fetch contract for listing ${hostifyListing.id}: ${contractError.message}`);
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
                        console.log(`Created new listing: ${hostifyListing.nickname || hostifyListing.name} (ID: ${hostifyListing.id}) - PM Fee: ${pmFeePercentage}%${ownerEmail ? `, Owner: ${ownerEmail}` : ''}`);
                    }
                } catch (error) {
                    console.error(`Error syncing listing ${hostifyListing.id}:`, error.message);
                    errors++;
                }
            }

            console.log(`Synced ${synced} listings, created ${created} new (${errors} errors)`);
            return { synced, created, errors };

        } catch (error) {
            console.error('Error syncing listings from Hostify:', error);
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
            console.error(`Error fetching listing ${listingId}:`, error);
            return null;
        }
    }

    /**
     * Get multiple listings with PM fees
     */
    async getListingsWithPmFees(listingIds = []) {
        try {
            const where = listingIds.length > 0
                ? { id: { [Op.in]: listingIds } }
                : {};

            const listings = await Listing.findAll({ where });
            return listings.map(l => l.toJSON());
        } catch (error) {
            console.error('Error fetching listings:', error);
            return [];
        }
    }

    /**
     * Get lightweight listing names for lookups (id, name, displayName, nickname, internalNotes)
     */
    async getListingNames() {
        try {
            const listings = await Listing.findAll({
                attributes: ['id', 'name', 'displayName', 'nickname', 'internalNotes']
            });
            return listings.map(l => l.toJSON());
        } catch (error) {
            console.error('Error fetching listing names:', error);
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
            console.log(`Updated PM fee for listing ${listingId}: ${pmFeePercentage}%`);
            
            return listing.toJSON();
        } catch (error) {
            console.error(`Error updating PM fee for listing ${listingId}:`, error);
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
            console.error('Error bulk updating PM fees:', error);
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
            console.error('Error fetching listings with missing PM fees:', error);
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
            console.log(`Updated display name for listing ${listingId}: ${displayName}`);
            
            return listing.toJSON();
        } catch (error) {
            console.error(`Error updating display name for listing ${listingId}:`, error);
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
            console.log(`Updated co-host status for listing ${listingId}: ${isCohostOnAirbnb}`);
            
            return listing.toJSON();
        } catch (error) {
            console.error(`Error updating co-host status for listing ${listingId}:`, error);
            throw error;
        }
    }

    /**
     * Update listing configuration (display name, co-host status, PM fee)
     */
    async updateListingConfig(listingId, config) {
        try {
            console.log(`[UPDATE-CONFIG] Listing ${listingId} received config:`, JSON.stringify(config));

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

            await listing.update(updates);
            await listing.reload(); // Reload to get fresh data from DB
            console.log(`Updated listing ${listingId} configuration:`, JSON.stringify(updates));

            return listing.toJSON();
        } catch (error) {
            console.error(`Error updating listing ${listingId} configuration:`, error);
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
            console.error('Error fetching newly added listings:', error);
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
        console.log(`[SYNC-OWNER-EMAILS] Starting sync (onlyMissing: ${onlyMissing})...`);

        try {
            // Step 1: Get all owners from /users API (bulk, efficient)
            const { success, ownerMap } = await HostifyService.getAllOwners();
            if (!success) {
                console.warn('[SYNC-OWNER-EMAILS] Failed to fetch owners from /users API, falling back to contract endpoint');
            }

            // Step 2: Get listings to update
            const where = onlyMissing ? {
                [Op.or]: [
                    { ownerEmail: null },
                    { ownerEmail: '' }
                ]
            } : {};

            const listings = await Listing.findAll({ where });
            console.log(`[SYNC-OWNER-EMAILS] Found ${listings.length} listings to process`);

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
                        console.log(`[SYNC-OWNER-EMAILS] Updated ${listing.nickname || listing.name}: ${ownerEmail} (Greeting: ${ownerGreeting})`);
                        updated++;
                    } else {
                        console.log(`[SYNC-OWNER-EMAILS] No owner found for ${listing.nickname || listing.name}`);
                        skipped++;
                    }
                } catch (error) {
                    console.error(`[SYNC-OWNER-EMAILS] Error for listing ${listing.id}: ${error.message}`);
                    errors++;
                }
            }

            console.log(`[SYNC-OWNER-EMAILS] Done: ${updated} updated, ${skipped} skipped, ${errors} errors`);
            return { updated, skipped, errors };
        } catch (error) {
            console.error('[SYNC-OWNER-EMAILS] Error:', error);
            throw error;
        }
    }
}

module.exports = new ListingService();

