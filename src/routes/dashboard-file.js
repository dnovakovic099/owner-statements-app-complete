const express = require('express');
const router = express.Router();
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
        console.error('Dashboard data error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

// GET /api/dashboard-file/properties - Get properties from file
router.get('/properties', async (req, res) => {
    try {
        const listings = await FileDataService.getListings();
        
        // Transform to match expected format
        const properties = listings.map(listing => ({
            id: listing.id,
            hostawayId: listing.id.toString(),
            name: listing.name,
            address: listing.address,
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
        res.status(500).json({ error: 'Failed to load properties' });
    }
});

// GET /api/dashboard-file/owners - Get owners from file
router.get('/owners', async (req, res) => {
    try {
        const owners = await FileDataService.getOwners();
        res.json(owners);
    } catch (error) {
        console.error('Owners get error:', error);
        res.status(500).json({ error: 'Failed to load owners' });
    }
});

module.exports = router;
