const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const HostifyService = require('../services/HostifyService');
const FileDataService = require('../services/FileDataService');

// GET /api/properties-file - Get all properties from Hostify with owner mapping
router.get('/', async (req, res) => {
    try {
        const [listings, owners] = await Promise.all([
            FileDataService.getListings(),
            FileDataService.getOwners()
        ]);
        
        // Create a map of listing IDs to owner IDs
        const listingToOwnerMap = new Map();
        owners.forEach(owner => {
            if (owner.listingIds && Array.isArray(owner.listingIds)) {
                owner.listingIds.forEach(listingId => {
                    listingToOwnerMap.set(listingId, owner);
                });
            }
        });

        // Transform to match the expected format with proper owner mapping
        const properties = listings.map(listing => {
            const owner = listingToOwnerMap.get(listing.id);
            
            // If we found an owner for this listing, use their data
            if (owner) {
                return {
                    id: listing.id,
                    hostawayId: listing.id.toString(),
                    name: listing.name,
                    nickname: listing.nickname,
                    address: formatAddress(listing.address),
                    ownerId: owner.id,
                    pmPercentage: null,
                    techFeeAmount: 50.00,
                    insuranceFeeAmount: 25.00,
                    isActive: listing.isActive,
                    Owner: {
                        id: owner.id,
                        name: owner.name,
                        email: owner.email,
                        defaultPmPercentage: owner.defaultPmPercentage
                    }
                };
            }
            
            // Fallback to default owner if no owner found for this listing
            const defaultOwner = owners.find(o => o.email === 'owner@example.com') || owners[0];
            return {
                id: listing.id,
                hostawayId: listing.id.toString(),
                name: listing.name,
                nickname: listing.nickname,
                address: formatAddress(listing.address),
                ownerId: defaultOwner?.id || 1,
                pmPercentage: null,
                techFeeAmount: 50.00,
                insuranceFeeAmount: 25.00,
                isActive: listing.isActive,
                Owner: {
                    id: defaultOwner?.id || 1,
                    name: defaultOwner?.name || 'Default Owner',
                    email: defaultOwner?.email || 'owner@example.com',
                    defaultPmPercentage: defaultOwner?.defaultPmPercentage || 15
                }
            };
        });

        res.json(properties);
    } catch (error) {
        logger.logError(error, { context: 'PropertiesFile', action: 'getProperties' });
        res.status(500).json({ error: 'Failed to get properties' });
    }
});

// POST /api/properties-file/sync - Sync properties from Hostify to file
router.post('/sync', async (req, res) => {
    try {
        logger.info('Starting properties sync from Hostify to file', { context: 'PropertiesFile' });

        // Get ALL properties from Hostify with pagination
        const hostifyProperties = await HostifyService.getAllProperties();
        
        if (!hostifyProperties.result || hostifyProperties.result.length === 0) {
            return res.json({ message: 'No properties found in Hostify', synced: 0 });
        }

        // Transform Hostify listings to our format
        const listings = hostifyProperties.result.map(listing => ({
            id: listing.id,
            name: listing.name || listing.nickname || `Property ${listing.id}`,
            nickname: listing.nickname || null,
            address: formatAddress(listing),
            country: listing.country || '',
            city: listing.city || '',
            personCapacity: listing.guests_included || 0,
            bedroomsNumber: listing.details?.bedroomsNumber || 0,
            bathroomsNumber: listing.details?.bathroomsNumber || 0,
            currency: listing.currency || 'USD',
            price: listing.default_daily_price || 0,
            cleaningFee: listing.cleaning_fee || 0,
            checkInTimeStart: listing.checkin_start ? parseInt(listing.checkin_start.split(':')[0]) : 15,
            checkInTimeEnd: listing.checkin_end ? parseInt(listing.checkin_end.split(':')[0]) : 22,
            checkOutTime: listing.checkout ? parseInt(listing.checkout.split(':')[0]) : 11,
            minNights: listing.min_nights || 1,
            maxNights: listing.max_nights || 365,
            isActive: listing.is_listed === 1,
            syncedAt: new Date().toISOString()
        }));

        // Save to file
        await FileDataService.saveListings(listings);

        logger.info('Properties sync completed', { context: 'PropertiesFile', count: listings.length });

        res.json({
            message: 'Properties sync completed',
            synced: listings.length,
            total: listings.length
        });
    } catch (error) {
        logger.logError(error, { context: 'PropertiesFile', action: 'syncProperties' });
        res.status(500).json({ error: 'Failed to sync properties from Hostify' });
    }
});

// Helper function to format address from Hostify listing
function formatAddress(listing) {
    if (!listing) return 'Address not available';
    
    const parts = [];
    if (listing.street) parts.push(listing.street);
    if (listing.city) parts.push(listing.city);
    if (listing.state) parts.push(listing.state);
    if (listing.country) parts.push(listing.country);
    if (listing.zipcode) parts.push(listing.zipcode);
    
    return parts.length > 0 ? parts.join(', ') : 'Address not available';
}

module.exports = router;
