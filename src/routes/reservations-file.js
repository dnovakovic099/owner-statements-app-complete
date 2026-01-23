const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
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
        logger.logError(error, { context: 'ReservationsFile', action: 'getReservations' });
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

        logger.info('Starting reservation sync', { context: 'ReservationsFile', startDate, endDate });

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

        logger.debug('Found listings for matching', { context: 'ReservationsFile', count: listings.length });

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
                        logger.warn('No matching property found for Hostify listing', { context: 'ReservationsFile', listingId });
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
                logger.logError(error, { context: 'ReservationsFile', action: 'processReservation', reservationId: hostifyReservation.hostifyId });
                skippedCount++;
            }
        }

        // Save all reservations to file (replacing existing ones)
        await FileDataService.saveReservations(transformedReservations);

        logger.info('Reservation sync completed', { context: 'ReservationsFile', syncedCount, skippedCount });

        res.json({
            message: 'Reservation sync completed',
            synced: syncedCount,
            skipped: skippedCount,
            total: hostifyReservations.result.length
        });
    } catch (error) {
        logger.logError(error, { context: 'ReservationsFile', action: 'syncReservations' });
        res.status(500).json({ error: 'Failed to sync reservations' });
    }
});

module.exports = router;
