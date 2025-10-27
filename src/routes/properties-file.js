const express = require('express');
const router = express.Router();
const HostifyService = require('../services/HostifyService');
const FileDataService = require('../services/FileDataService');

// GET /api/properties-file - Get all properties from file
router.get('/', async (req, res) => {
    try {
        const listings = await FileDataService.getListings();
        
        // Transform to match the expected format
        const properties = listings.map(listing => ({
            id: listing.id,
            hostawayId: listing.id.toString(),
            name: listing.name,
            address: formatAddress(listing.address),
            ownerId: 1, // Default owner
            pmPercentage: null,
            techFeeAmount: 50.00,
            insuranceFeeAmount: 25.00,
            isActive: true,
            Owner: {
                id: 1,
                name: 'Default Owner',
                email: 'owner@example.com',
                defaultPmPercentage: 15
            }
        }));

        res.json(properties);
    } catch (error) {
        console.error('Properties get error:', error);
        res.status(500).json({ error: 'Failed to get properties' });
    }
});

// POST /api/properties-file/sync - Sync properties from Hostify to file
router.post('/sync', async (req, res) => {
    try {
        console.log('Starting properties sync from Hostify to file...');

        // Get ALL properties from Hostify with pagination
        const hostifyProperties = await HostifyService.getAllProperties();
        
        if (!hostifyProperties.result || hostifyProperties.result.length === 0) {
            return res.json({ message: 'No properties found in Hostify', synced: 0 });
        }

        // Transform Hostify listings to our format
        const listings = hostifyProperties.result.map(listing => ({
            id: listing.id,
            name: listing.name || listing.nickname || `Property ${listing.id}`,
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

        console.log(`Properties sync completed: ${listings.length} properties saved to file`);

        res.json({
            message: 'Properties sync completed',
            synced: listings.length,
            total: listings.length
        });
    } catch (error) {
        console.error('Properties sync error:', error);
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
