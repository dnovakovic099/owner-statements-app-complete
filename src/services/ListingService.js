const { Listing } = require('../models');
const HostifyService = require('./HostifyService');
const { Op } = require('sequelize');

class ListingService {
    /**
     * Sync listings from Hostify to database
     * Preserves PM fees, updates other listing info
     */
    async syncListingsFromHostify() {
        console.log('🔄 Syncing listings from Hostify to database...');
        
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

                    const listingData = {
                        id: hostifyListing.id,
                        name: hostifyListing.name || 'Unknown',
                        nickname: hostifyListing.nickname || null,
                        street: hostifyListing.street || null,
                        city: hostifyListing.city || null,
                        state: hostifyListing.state || null,
                        country: hostifyListing.country || null,
                        isActive: hostifyListing.is_listed === 1,
                        lastSyncedAt: new Date()
                    };

                    if (existingListing) {
                        // Update but preserve PM fee
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

            console.log(`✅ Synced ${synced} listings from Hostify (${errors} errors)`);
            return { synced, errors };

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
     * Update PM fee for a listing
     */
    async updatePmFee(listingId, pmFeePercentage) {
        try {
            const listing = await Listing.findByPk(listingId);
            
            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            await listing.update({ pmFeePercentage });
            console.log(`✅ Updated PM fee for listing ${listingId}: ${pmFeePercentage}%`);
            
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
}

module.exports = new ListingService();

