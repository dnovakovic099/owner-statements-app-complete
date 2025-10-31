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

// GET /api/listings/:id - Get single listing with PM fee
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

// GET /api/listings/missing-pm-fees - Get listings without PM fees set
router.get('/status/missing-pm-fees', async (req, res) => {
    try {
        const listings = await ListingService.getListingsWithMissingPmFees();
        res.json({ success: true, count: listings.length, listings });
    } catch (error) {
        console.error('Error fetching listings with missing PM fees:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
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

// POST /api/listings/bulk-update-pm-fees - Bulk update PM fees
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

// POST /api/listings/sync - Sync listings from Hostify
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

module.exports = router;

