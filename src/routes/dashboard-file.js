const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const FileDataService = require('../services/FileDataService');

// GET /api/dashboard-file - Get dashboard data from files
router.get('/', async (req, res) => {
    try {
        const basicData = await FileDataService.getDashboardData();
        const statements = await FileDataService.getStatements();
        
        // Format to match React frontend expectations
        const dashboardData = {
            summary: {
                totalProperties: basicData.totalProperties,
                totalOwners: basicData.totalOwners,
                pendingStatements: basicData.pendingStatements,
                thisWeekRevenue: basicData.totalRevenue,
                lastWeekRevenue: basicData.totalRevenue * 0.5, // Placeholder
                revenueChange: basicData.revenueChange
            },
            currentWeek: {
                start: '2025-09-23',
                end: '2025-09-29'
            },
            previousWeek: {
                start: '2025-09-16', 
                end: '2025-09-22'
            },
            recentStatements: statements.slice(0, 5) // Recent 5 statements
        };
        
        res.json(dashboardData);
    } catch (error) {
        logger.logError(error, { context: 'DashboardFile', action: 'getDashboardData' });
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

// GET /api/dashboard-file/properties - Get properties from Hostify with owner mapping
router.get('/properties', async (req, res) => {
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

        // Transform to match expected format with proper owner mapping
        const properties = listings.map(listing => {
            const owner = listingToOwnerMap.get(listing.id);
            
            // If we found an owner for this listing, use their data
            if (owner) {
                return {
                    id: listing.id,
                    hostawayId: listing.id.toString(),
                    name: listing.name,
                    nickname: listing.nickname,
                    displayName: listing.displayName,
                    address: listing.address,
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
                displayName: listing.displayName,
                address: listing.address,
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
        logger.logError(error, { context: 'DashboardFile', action: 'getProperties' });
        res.status(500).json({ error: 'Failed to load properties' });
    }
});

// GET /api/dashboard-file/owners - Get owners from file
router.get('/owners', async (req, res) => {
    try {
        const owners = await FileDataService.getOwners();
        res.json(owners);
    } catch (error) {
        logger.logError(error, { context: 'DashboardFile', action: 'getOwners' });
        res.status(500).json({ error: 'Failed to load owners' });
    }
});

module.exports = router;
