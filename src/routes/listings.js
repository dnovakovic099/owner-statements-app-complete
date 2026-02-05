const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ListingService = require('../services/ListingService');
const FileDataService = require('../services/FileDataService');
const { ActivityLog } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

// GET /api/listings - Get all listings with PM fees (supports filters)
router.get('/', asyncHandler(async (req, res) => {
    const {
        ids,
        search,
        cities,
        tags,
        freqTags,
        includeNoTag,
        cohost,
        ownerEmail,
        autoSend,
        passThroughTax,
        disregardTax,
        cleaningFeePassThrough,
        guestPaidDamageCoverage,
        waiveCommission,
        payoutStatus
    } = req.query;

    const listingIds = ids ? ids.split(',').map(id => parseInt(id)) : [];
    const parsedCities = cities ? cities.split(',').map(c => c.trim()).filter(Boolean) : [];
    const allTags = [];
    if (tags) allTags.push(...tags.split(',').map(t => t.trim()).filter(Boolean));
    if (freqTags) allTags.push(...freqTags.split(',').map(t => t.trim()).filter(Boolean));
    const filters = {
        search: search || '',
        cities: parsedCities,
        tags: allTags,
        noTag: includeNoTag === 'true',
        cohost,
        ownerEmail,
        autoSend,
        passThroughTax,
        disregardTax,
        cleaningFeePassThrough,
        guestPaidDamageCoverage,
        waiveCommission,
        payoutStatus
    };

    const listings = await ListingService.getListingsWithPmFees(listingIds, filters);

    // Mark offboarded: DB listings NOT in Hostify active PMS set
    try {
        const HostifyService = require('../services/HostifyService');
        const hostifyResponse = await HostifyService.getAllProperties();
        const activeHostifyIds = new Set((hostifyResponse.result || []).map(l => l.id));
        listings.forEach(l => {
            l.isOffboarded = !activeHostifyIds.has(parseInt(l.id));
        });
    } catch (err) {
        // If Hostify check fails, fall back to no offboarded flag
        listings.forEach(l => { l.isOffboarded = false; });
    }

    res.json({ success: true, listings });
}));

// GET /api/listings/missing-pm-fees - Get listings without PM fees set
// NOTE: This must come BEFORE /:id route to avoid being caught by it
router.get('/status/missing-pm-fees', asyncHandler(async (req, res) => {
    const listings = await ListingService.getListingsWithMissingPmFees();
    res.json({ success: true, count: listings.length, listings });
}));

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
        logger.logError(error, { context: 'Listings', action: 'bulkUpdatePmFees' });
        res.status(500).json({ error: 'Failed to bulk update PM fees' });
    }
});

// GET /api/listings/names - Get lightweight listing names for lookups (id, name, displayName, nickname only)
// NOTE: This must come BEFORE /:id routes
router.get('/names', asyncHandler(async (req, res) => {
    // Cache listing names for 10 minutes - rarely changes
    res.set('Cache-Control', 'private, max-age=600');
    const listings = await ListingService.getListingNames();
    res.json({ success: true, listings });
}));

// GET /api/listings/newly-added - Get newly added listings (for notifications)
// NOTE: This must come BEFORE /:id routes
router.get('/newly-added', asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;
    const listings = await ListingService.getNewlyAddedListings(parseInt(days));
    res.json({
        success: true,
        count: listings.length,
        listings
    });
}));

// POST /api/listings/sync - Sync listings from Hostify
// NOTE: This must come BEFORE /:id routes
router.post('/sync', asyncHandler(async (req, res) => {
    const result = await ListingService.syncListingsFromHostify();
    res.json({
        success: true,
        message: 'Listings synced from Hostify',
        synced: result.synced,
        errors: result.errors
    });
}));

// GET /api/listings/:id - Get single listing with PM fee
// NOTE: This must come AFTER all specific routes (sync, bulk-update, etc)
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
        const listing = await ListingService.getListingWithPmFee(parseInt(id));

        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        try {
            listing.stripeAccountId = decryptOptional(listing.stripeAccountId);
        } catch (e) {
            listing.stripeAccountId = null;
        }

        res.json({ success: true, listing });
}));

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
        logger.logError(error, { context: 'Listings', action: 'updatePmFee' });
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
        logger.logError(error, { context: 'Listings', action: 'updateDisplayName' });
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
        logger.logError(error, { context: 'Listings', action: 'updateCohostStatus' });
        res.status(500).json({ error: error.message || 'Failed to update co-host status' });
    }
});

// PUT /api/listings/:id/config - Update listing configuration (display name, co-host, PM fee, tags, pass-through tax, cleaning fee, pet fee, commission waiver, damage coverage, owner email, auto-send, groupId)
router.put('/:id/config', async (req, res) => {
    try {
        const { id } = req.params;
        logger.debug('PUT /listings/:id/config request', { context: 'Listings', body: req.body });
        const { displayName, isCohostOnAirbnb, airbnbPassThroughTax, disregardTax, cleaningFeePassThrough, guestPaidDamageCoverage, includeChildListings, pmFeePercentage, defaultPetFee, tags, waiveCommission, waiveCommissionUntil, internalNotes, ownerEmail, ownerGreeting, autoSendStatements, groupId, payoutStatus, payoutNotes, stripeAccountId, stripeOnboardingStatus } = req.body;

        const config = {};
        if (displayName !== undefined) config.displayName = displayName;
        if (isCohostOnAirbnb !== undefined) config.isCohostOnAirbnb = isCohostOnAirbnb;
        if (airbnbPassThroughTax !== undefined) config.airbnbPassThroughTax = airbnbPassThroughTax;
        if (disregardTax !== undefined) config.disregardTax = disregardTax;
        if (cleaningFeePassThrough !== undefined) config.cleaningFeePassThrough = cleaningFeePassThrough;
        if (guestPaidDamageCoverage !== undefined) config.guestPaidDamageCoverage = guestPaidDamageCoverage;
        if (includeChildListings !== undefined) config.includeChildListings = includeChildListings;
        if (waiveCommission !== undefined) config.waiveCommission = waiveCommission;
        if (waiveCommissionUntil !== undefined) config.waiveCommissionUntil = waiveCommissionUntil || null;
        if (tags !== undefined) config.tags = tags;
        if (internalNotes !== undefined) config.internalNotes = internalNotes;
        if (ownerEmail !== undefined) config.ownerEmail = ownerEmail;
        if (ownerGreeting !== undefined) config.ownerGreeting = ownerGreeting;
        if (autoSendStatements !== undefined) config.autoSendStatements = autoSendStatements;
        if (payoutStatus !== undefined) {
            const allowedStatuses = ['missing', 'pending', 'on_file'];
            if (!allowedStatuses.includes(payoutStatus)) {
                return res.status(400).json({ error: 'payoutStatus must be missing, pending, or on_file' });
            }
            config.payoutStatus = payoutStatus;
        }
        if (payoutNotes !== undefined) config.payoutNotes = payoutNotes;
        if (stripeAccountId !== undefined) config.stripeAccountId = stripeAccountId || null;
        if (stripeOnboardingStatus !== undefined) {
            const allowedStripeStatuses = ['missing', 'pending', 'verified', 'requires_action'];
            if (!allowedStripeStatuses.includes(stripeOnboardingStatus)) {
                return res.status(400).json({ error: 'stripeOnboardingStatus must be missing, pending, verified, or requires_action' });
            }
            config.stripeOnboardingStatus = stripeOnboardingStatus;
        }
        // Handle groupId: can be number (assign to group), null (remove from group), or undefined (no change)
        if (groupId !== undefined) {
            config.groupId = groupId === null || groupId === '' ? null : parseInt(groupId);
        }
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
        
        logger.debug('Config to update', { context: 'Listings', config });

        if (Object.keys(config).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const listing = await ListingService.updateListingConfig(parseInt(id), config);
        logger.debug('Updated listing', { context: 'Listings', ownerEmail: listing.ownerEmail, ownerGreeting: listing.ownerGreeting });

        // Clear the listings cache so changes are reflected immediately
        FileDataService.clearListingsCache();

        // Log activity with detailed changes
        // Format changes for readability (e.g., "pmFeePercentage" -> "PM Fee %")
        const fieldLabels = {
            pmFeePercentage: 'PM Fee %',
            isCohostOnAirbnb: 'Cohost on Airbnb',
            airbnbPassThroughTax: 'Pass-through Tax',
            disregardTax: 'Disregard Tax',
            cleaningFeePassThrough: 'Cleaning Fee Pass-through',
            guestPaidDamageCoverage: 'Guest Damage Coverage',
            includeChildListings: 'Include Child Listings',
            waiveCommission: 'Waive Commission',
            waiveCommissionUntil: 'Waive Until',
            tags: 'Tags',
            internalNotes: 'Internal Notes',
            ownerEmail: 'Owner Email',
            ownerGreeting: 'Owner Greeting',
            autoSendStatements: 'Auto Send',
            defaultPetFee: 'Pet Fee',
            groupId: 'Group'
        };
        const changesDetailed = Object.keys(config).map(key => {
            const label = fieldLabels[key] || key;
            const value = config[key];
            if (typeof value === 'boolean') return `${label}: ${value ? 'Yes' : 'No'}`;
            if (value === null) return `${label}: cleared`;
            if (key === 'pmFeePercentage') return `${label}: ${value}%`;
            return `${label}: ${value}`;
        });
        await ActivityLog.log(req, 'UPDATE_LISTING', 'listing', id, {
            listingName: listing.nickname || listing.displayName || listing.name || `Listing #${id}`,
            changes: Object.keys(config),
            changesDetailed: changesDetailed
        });

        res.json({ success: true, message: 'Listing configuration updated', listing });
    } catch (error) {
        logger.logError(error, { context: 'Listings', action: 'updateListingConfig' });
        res.status(500).json({ error: error.message || 'Failed to update listing configuration' });
    }
});

module.exports = router;
