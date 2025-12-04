const express = require('express');
const router = express.Router();
const ListingService = require('../services/ListingService');

// GET /api/listings - Get all listings with PM fees
router.get('/', async (req, res) => {
    try {
        const { ids } = req.query;
        const listingIds = ids ? ids.split(',').map(id => parseInt(id)) : [];
        
        const listings = await ListingService.getListingsWithPmFees(listingIds);
        res.json({ success: true, listings });
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// GET /api/listings/missing-pm-fees - Get listings without PM fees set
// NOTE: This must come BEFORE /:id route to avoid being caught by it
router.get('/status/missing-pm-fees', async (req, res) => {
    try {
        const listings = await ListingService.getListingsWithMissingPmFees();
        res.json({ success: true, count: listings.length, listings });
    } catch (error) {
        console.error('Error fetching listings with missing PM fees:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// POST /api/listings/bulk-update-pm-fees - Bulk update PM fees
// NOTE: This must come BEFORE /:id routes
router.post('/bulk-update-pm-fees', async (req, res) => {
    try {
        const { updates } = req.body;
        
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: 'updates must be an array' });
        }
        
        // Validate format
        for (const update of updates) {
            if (!update.listingId || update.pmFeePercentage === undefined) {
                return res.status(400).json({ 
                    error: 'Each update must have listingId and pmFeePercentage' 
                });
            }
        }
        
        const results = await ListingService.bulkUpdatePmFees(updates);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        res.json({ 
            success: true, 
            message: `Updated ${successful} listings (${failed} failed)`,
            results 
        });
    } catch (error) {
        console.error('Error bulk updating PM fees:', error);
        res.status(500).json({ error: 'Failed to bulk update PM fees' });
    }
});

// GET /api/listings/names - Get lightweight listing names for lookups (id, name, displayName, nickname only)
// NOTE: This must come BEFORE /:id routes
router.get('/names', async (req, res) => {
    try {
        const listings = await ListingService.getListingNames();
        res.json({ success: true, listings });
    } catch (error) {
        console.error('Error fetching listing names:', error);
        res.status(500).json({ error: 'Failed to fetch listing names' });
    }
});

// POST /api/listings/sync - Sync listings from Hostify
// NOTE: This must come BEFORE /:id routes
router.post('/sync', async (req, res) => {
    try {
        const result = await ListingService.syncListingsFromHostify();
        res.json({ 
            success: true, 
            message: 'Listings synced from Hostify',
            synced: result.synced,
            errors: result.errors
        });
    } catch (error) {
        console.error('Error syncing listings:', error);
        res.status(500).json({ error: 'Failed to sync listings' });
    }
});

// GET /api/listings/:id - Get single listing with PM fee
// NOTE: This must come AFTER all specific routes (sync, bulk-update, etc)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const listing = await ListingService.getListingWithPmFee(parseInt(id));
        
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }
        
        res.json({ success: true, listing });
    } catch (error) {
        console.error('Error fetching listing:', error);
        res.status(500).json({ error: 'Failed to fetch listing' });
    }
});

// PUT /api/listings/:id/pm-fee - Update PM fee for a listing
router.put('/:id/pm-fee', async (req, res) => {
    try {
        const { id } = req.params;
        const { pmFeePercentage } = req.body;
        
        if (pmFeePercentage === undefined || pmFeePercentage === null) {
            return res.status(400).json({ error: 'pmFeePercentage is required' });
        }
        
        const pmFee = parseFloat(pmFeePercentage);
        if (isNaN(pmFee) || pmFee < 0 || pmFee > 100) {
            return res.status(400).json({ error: 'pmFeePercentage must be between 0 and 100' });
        }
        
        const listing = await ListingService.updatePmFee(parseInt(id), pmFee);
        res.json({ success: true, message: 'PM fee updated', listing });
    } catch (error) {
        console.error('Error updating PM fee:', error);
        res.status(500).json({ error: error.message || 'Failed to update PM fee' });
    }
});

// PUT /api/listings/:id/display-name - Update display name
router.put('/:id/display-name', async (req, res) => {
    try {
        const { id } = req.params;
        const { displayName } = req.body;
        
        if (displayName === undefined) {
            return res.status(400).json({ error: 'displayName is required' });
        }
        
        const listing = await ListingService.updateDisplayName(parseInt(id), displayName);
        res.json({ success: true, message: 'Display name updated', listing });
    } catch (error) {
        console.error('Error updating display name:', error);
        res.status(500).json({ error: error.message || 'Failed to update display name' });
    }
});

// PUT /api/listings/:id/cohost-status - Update co-host status
router.put('/:id/cohost-status', async (req, res) => {
    try {
        const { id } = req.params;
        const { isCohostOnAirbnb } = req.body;
        
        if (isCohostOnAirbnb === undefined) {
            return res.status(400).json({ error: 'isCohostOnAirbnb is required' });
        }
        
        const listing = await ListingService.updateCohostStatus(parseInt(id), isCohostOnAirbnb);
        res.json({ success: true, message: 'Co-host status updated', listing });
    } catch (error) {
        console.error('Error updating co-host status:', error);
        res.status(500).json({ error: error.message || 'Failed to update co-host status' });
    }
});

// PUT /api/listings/:id/config - Update listing configuration (display name, co-host, PM fee, tags, pass-through tax, cleaning fee, pet fee, commission waiver)
router.put('/:id/config', async (req, res) => {
    try {
        const { id } = req.params;
        const { displayName, isCohostOnAirbnb, airbnbPassThroughTax, disregardTax, cleaningFeePassThrough, pmFeePercentage, defaultPetFee, tags, waiveCommission, waiveCommissionUntil } = req.body;

        const config = {};
        if (displayName !== undefined) config.displayName = displayName;
        if (isCohostOnAirbnb !== undefined) config.isCohostOnAirbnb = isCohostOnAirbnb;
        if (airbnbPassThroughTax !== undefined) config.airbnbPassThroughTax = airbnbPassThroughTax;
        if (disregardTax !== undefined) config.disregardTax = disregardTax;
        if (cleaningFeePassThrough !== undefined) config.cleaningFeePassThrough = cleaningFeePassThrough;
        if (waiveCommission !== undefined) config.waiveCommission = waiveCommission;
        if (waiveCommissionUntil !== undefined) config.waiveCommissionUntil = waiveCommissionUntil || null;
        if (tags !== undefined) config.tags = tags;
        if (pmFeePercentage !== undefined) {
            const pmFee = parseFloat(pmFeePercentage);
            if (isNaN(pmFee) || pmFee < 0 || pmFee > 100) {
                return res.status(400).json({ error: 'pmFeePercentage must be between 0 and 100' });
            }
            config.pmFeePercentage = pmFee;
        }
        if (defaultPetFee !== undefined) {
            if (defaultPetFee === null || defaultPetFee === '') {
                config.defaultPetFee = null;
            } else {
                const petFee = parseFloat(defaultPetFee);
                if (isNaN(petFee) || petFee < 0) {
                    return res.status(400).json({ error: 'defaultPetFee must be a positive number or null' });
                }
                config.defaultPetFee = petFee;
            }
        }
        
        if (Object.keys(config).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        const listing = await ListingService.updateListingConfig(parseInt(id), config);
        res.json({ success: true, message: 'Listing configuration updated', listing });
    } catch (error) {
        console.error('Error updating listing configuration:', error);
        res.status(500).json({ error: error.message || 'Failed to update listing configuration' });
    }
});

module.exports = router;

