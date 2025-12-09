const { Listing } = require('../models');
const HostifyService = require('./HostifyService');
const { Op } = require('sequelize');

class ListingService {
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
            let synced = 0;
            let errors = 0;

            for (const hostifyListing of hostifyListings) {
                try {
                    const existingListing = await Listing.findByPk(hostifyListing.id);

                    // Extract owner info from users array
                    const ownerInfo = this.extractOwnerFromUsers(hostifyListing.users);

                    const listingData = {
                        id: hostifyListing.id,
                        name: hostifyListing.name || 'Unknown',
                        nickname: hostifyListing.nickname || null,
                        street: hostifyListing.street || null,
                        city: hostifyListing.city || null,
                        state: hostifyListing.state || null,
                        country: hostifyListing.country || null,
                        cleaningFee: hostifyListing.cleaning_fee || null, // Default cleaning fee from Hostify
                        isActive: hostifyListing.is_listed === 1,
                        lastSyncedAt: new Date()
                    };

                    // Add owner info if found (only update if not already set by user)
                    if (ownerInfo) {
                        if (existingListing) {
                            // Only update owner info if not manually set
                            if (!existingListing.ownerEmail) {
                                listingData.ownerEmail = ownerInfo.email;
                            }
                            if (!existingListing.ownerGreeting) {
                                listingData.ownerGreeting = ownerInfo.greeting;
                            }
                        } else {
                            // New listing - set owner info
                            listingData.ownerEmail = ownerInfo.email;
                            listingData.ownerGreeting = ownerInfo.greeting;
                        }
                    }

                    if (existingListing) {
                        // Update but preserve PM fee and manually set owner info
                        delete listingData.pmFeePercentage; // Don't overwrite
                        await existingListing.update(listingData);
                    } else {
                        // Create new with default PM fee
                        listingData.pmFeePercentage = 15.00;
                        await Listing.create(listingData);
                    }

                    synced++;
                } catch (error) {
                    console.error(`Error syncing listing ${hostifyListing.id}:`, error.message);
                    errors++;
                }
            }

            console.log(`Synced ${synced} listings from Hostify (${errors} errors)`);
            return { synced, errors };

        } catch (error) {
            console.error('Error syncing listings from Hostify:', error);
            throw error;
        }
    }

    /**
     * Extract owner email and name from Hostify users array
     * Looks for user with role "Standard Listing Owner"
     */
    extractOwnerFromUsers(users) {
        if (!users || !Array.isArray(users)) {
            return null;
        }

        // Find user with "Standard Listing Owner" role
        const owner = users.find(user =>
            user.roles && user.roles.toLowerCase().includes('listing owner')
        );

        if (!owner) {
            return null;
        }

        // Username is the email in Hostify
        const email = owner.username || null;

        // Build greeting from first name
        let greeting = null;
        if (owner.first_name) {
            greeting = owner.first_name;
        } else if (owner.last_name) {
            greeting = owner.last_name;
        }

        return email || greeting ? { email, greeting } : null;
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
     * Get lightweight listing names for lookups (id, name, displayName, nickname only)
     */
    async getListingNames() {
        try {
            const listings = await Listing.findAll({
                attributes: ['id', 'name', 'displayName', 'nickname']
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

            await listing.update(updates);
            console.log(`Updated listing ${listingId} configuration`);
            
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
}

module.exports = new ListingService();

