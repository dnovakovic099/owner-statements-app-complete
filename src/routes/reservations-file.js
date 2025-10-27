const express = require('express');
const router = express.Router();
const HostifyService = require('../services/HostifyService');
const FileDataService = require('../services/FileDataService');

// GET /api/reservations-file - Get reservations from file
router.get('/', async (req, res) => {
    try {
        const { 
            startDate, 
            endDate, 
            propertyId, 
            limit = 100, 
            offset = 0 
        } = req.query;

        let reservations = await FileDataService.getReservations();

        // Filter by date range
        if (startDate && endDate) {
            reservations = reservations.filter(res => {
                const checkoutDate = new Date(res.checkOutDate);
                const start = new Date(startDate);
                const end = new Date(endDate);
                return checkoutDate >= start && checkoutDate <= end;
            });
        }

        // Filter by property
        if (propertyId) {
            reservations = reservations.filter(res => res.propertyId === parseInt(propertyId));
        }

        // Apply pagination
        const total = reservations.length;
        const paginatedReservations = reservations.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({
            reservations: paginatedReservations,
            total: total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Reservations get error:', error);
        res.status(500).json({ error: 'Failed to get reservations' });
    }
});

// POST /api/reservations-file/sync - Sync reservations from Hostify to file
router.post('/sync', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        console.log(`Starting reservation sync for ${startDate} to ${endDate} (file-based)`);

        // Get ALL reservations from Hostify with pagination
        const hostifyReservations = await HostifyService.getAllReservations(startDate, endDate);
        
        if (!hostifyReservations.result || hostifyReservations.result.length === 0) {
            return res.json({ message: 'No reservations found for the specified period', synced: 0 });
        }

        // Get existing listings to match property IDs
        const listings = await FileDataService.getListings();
        const listingMap = new Map();
        listings.forEach(listing => {
            listingMap.set(listing.id.toString(), listing.id);
        });

        console.log(`Found ${listings.length} listings for matching`);

        let syncedCount = 0;
        let skippedCount = 0;
        const transformedReservations = [];

        for (const hostifyReservation of hostifyReservations.result) {
            try {
                // Transform Hostify data (already transformed by HostifyService)
                const reservationData = hostifyReservation;
                
                // Match with our property using the listing_id field
                const listingId = reservationData.propertyId;
                const propertyId = listingMap.get(listingId?.toString());
                
                if (!propertyId) {
                    if (skippedCount < 5) { // Only log first few skips
                        console.warn(`No matching property found for Hostify listing ${listingId}`);
                    }
                    skippedCount++;
                    continue;
                }

                // Add/update fields
                reservationData.propertyId = propertyId;
                reservationData.id = parseInt(reservationData.hostifyId);
                reservationData.createdAt = new Date().toISOString();
                reservationData.updatedAt = new Date().toISOString();

                transformedReservations.push(reservationData);
                syncedCount++;

            } catch (error) {
                console.error(`Error processing reservation ${hostifyReservation.hostifyId}:`, error);
                skippedCount++;
            }
        }

        // Save all reservations to file (replacing existing ones)
        await FileDataService.saveReservations(transformedReservations);

        console.log(`Reservation sync completed: ${syncedCount} synced, ${skippedCount} skipped`);

        res.json({
            message: 'Reservation sync completed',
            synced: syncedCount,
            skipped: skippedCount,
            total: hostifyReservations.result.length
        });
    } catch (error) {
        console.error('Reservation sync error:', error);
        res.status(500).json({ error: 'Failed to sync reservations' });
    }
});

module.exports = router;
