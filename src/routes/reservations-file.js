const express = require('express');
const router = express.Router();
const HostawayService = require('../services/HostawayService');
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

// POST /api/reservations-file/sync - Sync reservations from Hostaway to file
router.post('/sync', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        console.log(`Starting reservation sync for ${startDate} to ${endDate} (file-based)`);

        // Get ALL reservations from Hostaway with pagination
        const hostawayReservations = await HostawayService.getAllReservations(startDate, endDate);
        
        if (!hostawayReservations.result || hostawayReservations.result.length === 0) {
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

        for (const hostawayReservation of hostawayReservations.result) {
            try {
                // Transform Hostaway data
                const reservationData = HostawayService.transformReservation(hostawayReservation);
                
                // Match with our property using the listingMapId field
                const listingMapId = hostawayReservation.listingMapId;
                const propertyId = listingMap.get(listingMapId?.toString());
                
                if (!propertyId) {
                    if (skippedCount < 5) { // Only log first few skips
                        console.warn(`No matching property found for Hostaway listing ${listingMapId}`);
                    }
                    skippedCount++;
                    continue;
                }

                // Add property ID and other fields
                reservationData.propertyId = propertyId;
                reservationData.id = parseInt(hostawayReservation.id);
                reservationData.createdAt = new Date().toISOString();
                reservationData.updatedAt = new Date().toISOString();

                transformedReservations.push(reservationData);
                syncedCount++;

            } catch (error) {
                console.error(`Error processing reservation ${hostawayReservation.id}:`, error);
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
            total: hostawayReservations.result.length
        });
    } catch (error) {
        console.error('Reservation sync error:', error);
        res.status(500).json({ error: 'Failed to sync reservations' });
    }
});

module.exports = router;
