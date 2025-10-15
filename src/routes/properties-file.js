const express = require('express');
const router = express.Router();
const HostawayService = require('../services/HostawayService');
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

// POST /api/properties-file/sync - Sync properties from Hostaway to file
router.post('/sync', async (req, res) => {
    try {
        console.log('Starting properties sync from Hostaway to file...');

        // Get ALL properties from Hostaway with pagination
        const hostawayProperties = await HostawayService.getAllProperties();
        
        if (!hostawayProperties.result || hostawayProperties.result.length === 0) {
            return res.json({ message: 'No properties found in Hostaway', synced: 0 });
        }

        // Transform Hostaway listings to our format
        const listings = hostawayProperties.result.map(listing => ({
            id: listing.id,
            name: listing.name || `Property ${listing.id}`,
            address: formatAddress(listing.address),
            country: listing.country || '',
            city: listing.city || '',
            personCapacity: listing.personCapacity || 0,
            bedroomsNumber: listing.bedroomsNumber || 0,
            bathroomsNumber: listing.bathroomsNumber || 0,
            currency: listing.currencyCode || 'USD',
            price: listing.price || 0,
            cleaningFee: listing.cleaningFee || 0,
            checkInTimeStart: listing.checkInTimeStart || 15,
            checkInTimeEnd: listing.checkInTimeEnd || 22,
            checkOutTime: listing.checkOutTime || 11,
            minNights: listing.minNights || 1,
            maxNights: listing.maxNights || 365,
            isActive: true,
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
        res.status(500).json({ error: 'Failed to sync properties from Hostaway' });
    }
});

// Helper function to format address
function formatAddress(address) {
    if (typeof address === 'string') {
        return address;
    }
    
    if (address && typeof address === 'object') {
        if (address.full) {
            return address.full;
        }
        
        const parts = [];
        if (address.street) parts.push(address.street);
        if (address.city) parts.push(address.city);
        if (address.state) parts.push(address.state);
        if (address.country) parts.push(address.country);
        if (address.zipcode) parts.push(address.zipcode);
        
        return parts.length > 0 ? parts.join(', ') : 'Address not available';
    }
    
    return 'Address not available';
}

module.exports = router;
