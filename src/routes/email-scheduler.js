/**
 * Email Scheduler Routes
 *
 * Endpoints for managing automated email scheduling:
 * - View scheduler status
 * - Manual trigger for testing
 * - View listings by frequency tag
 * - Update owner email/greeting for listings
 */

const express = require('express');
const router = express.Router();
const EmailSchedulerService = require('../services/EmailSchedulerService');
const ListingService = require('../services/ListingService');
const EmailService = require('../services/EmailService');
const { Listing, Statement } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/email-scheduler/status
 * Get current scheduler status
 */
router.get('/status', async (req, res) => {
    try {
        const status = EmailSchedulerService.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        console.error('Error getting scheduler status:', error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

/**
 * POST /api/email-scheduler/start
 * Start the email scheduler
 */
router.post('/start', async (req, res) => {
    try {
        EmailSchedulerService.start();
        res.json({
            success: true,
            message: 'Email scheduler started',
            status: EmailSchedulerService.getStatus()
        });
    } catch (error) {
        console.error('Error starting scheduler:', error);
        res.status(500).json({ error: 'Failed to start scheduler' });
    }
});

/**
 * POST /api/email-scheduler/stop
 * Stop the email scheduler
 */
router.post('/stop', async (req, res) => {
    try {
        EmailSchedulerService.stop();
        res.json({
            success: true,
            message: 'Email scheduler stopped'
        });
    } catch (error) {
        console.error('Error stopping scheduler:', error);
        res.status(500).json({ error: 'Failed to stop scheduler' });
    }
});

/**
 * POST /api/email-scheduler/trigger/:tag
 * Manually trigger email send for a specific tag (for testing)
 * Query params:
 *   - limit: number of emails to send (default: all)
 */
router.post('/trigger/:tag', async (req, res) => {
    try {
        const { tag } = req.params;
        const { limit, offset } = req.query;
        const validTags = ['WEEKLY', 'BI-WEEKLY A', 'BI-WEEKLY B', 'MONTHLY'];

        if (!validTags.includes(tag.toUpperCase())) {
            return res.status(400).json({
                error: `Invalid tag. Must be one of: ${validTags.join(', ')}`
            });
        }

        const emailLimit = limit ? parseInt(limit) : null;
        const emailOffset = offset ? parseInt(offset) : 0;
        console.log(`[EmailScheduler] Manual trigger requested for ${tag}${emailLimit ? ` (limit: ${emailLimit})` : ''}${emailOffset ? ` (offset: ${emailOffset})` : ''}`);
        const result = await EmailSchedulerService.triggerManual(tag.toUpperCase(), emailLimit, emailOffset);

        res.json({
            success: true,
            message: `Manual trigger completed for ${tag}`,
            result
        });
    } catch (error) {
        console.error('Error triggering manual send:', error);
        res.status(500).json({ error: 'Failed to trigger manual send' });
    }
});

/**
 * GET /api/email-scheduler/listings
 * Get listings summary by frequency tag
 */
router.get('/listings', async (req, res) => {
    try {
        const summary = await EmailSchedulerService.getListingsSummary();
        res.json({
            success: true,
            summary
        });
    } catch (error) {
        console.error('Error getting listings summary:', error);
        res.status(500).json({ error: 'Failed to get listings summary' });
    }
});

/**
 * PUT /api/email-scheduler/listings/:listingId/email
 * Update owner email and greeting for a listing
 */
router.put('/listings/:listingId/email', async (req, res) => {
    try {
        const { listingId } = req.params;
        const { ownerEmail, ownerGreeting } = req.body;

        const listing = await Listing.findByPk(listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        await listing.update({
            ownerEmail: ownerEmail || null,
            ownerGreeting: ownerGreeting || null
        });

        res.json({
            success: true,
            message: 'Listing email settings updated',
            listing: {
                id: listing.id,
                name: listing.nickname || listing.name,
                ownerEmail: listing.ownerEmail,
                ownerGreeting: listing.ownerGreeting,
                tags: listing.tags
            }
        });
    } catch (error) {
        console.error('Error updating listing email:', error);
        res.status(500).json({ error: 'Failed to update listing email' });
    }
});

/**
 * POST /api/email-scheduler/listings/bulk-update
 * Bulk update owner emails and greetings for multiple listings
 */
router.post('/listings/bulk-update', async (req, res) => {
    try {
        const { listings } = req.body;

        if (!listings || !Array.isArray(listings)) {
            return res.status(400).json({ error: 'listings array is required' });
        }

        const results = {
            updated: [],
            failed: []
        };

        for (const item of listings) {
            try {
                const listing = await Listing.findByPk(item.listingId);
                if (!listing) {
                    results.failed.push({
                        listingId: item.listingId,
                        error: 'Listing not found'
                    });
                    continue;
                }

                await listing.update({
                    ownerEmail: item.ownerEmail || null,
                    ownerGreeting: item.ownerGreeting || null
                });

                results.updated.push({
                    listingId: listing.id,
                    name: listing.nickname || listing.name,
                    ownerEmail: listing.ownerEmail,
                    ownerGreeting: listing.ownerGreeting
                });
            } catch (error) {
                results.failed.push({
                    listingId: item.listingId,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Updated ${results.updated.length} listings`,
            results
        });
    } catch (error) {
        console.error('Error bulk updating listings:', error);
        res.status(500).json({ error: 'Failed to bulk update listings' });
    }
});

/**
 * GET /api/email-scheduler/next-runs
 * Get next scheduled run times
 */
router.get('/next-runs', async (req, res) => {
    try {
        const nextRuns = EmailSchedulerService.getNextRuns();
        res.json({
            success: true,
            nextRuns
        });
    } catch (error) {
        console.error('Error getting next runs:', error);
        res.status(500).json({ error: 'Failed to get next runs' });
    }
});

/**
 * GET /api/email-scheduler/history
 * Get last run results for each tag
 */
router.get('/history', async (req, res) => {
    try {
        const status = EmailSchedulerService.getStatus();
        res.json({
            success: true,
            lastRun: status.lastRun
        });
    } catch (error) {
        console.error('Error getting history:', error);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

/**
 * POST /api/email-scheduler/sync-owner-emails
 * Sync owner emails from Hostify for all listings
 * Query params:
 *   - onlyMissing: true (default) to only sync listings without owner email
 */
router.post('/sync-owner-emails', async (req, res) => {
    try {
        const onlyMissing = req.query.onlyMissing !== 'false';
        console.log(`[API] Syncing owner emails (onlyMissing: ${onlyMissing})`);

        const result = await ListingService.syncOwnerEmails(onlyMissing);

        res.json({
            success: true,
            message: `Synced owner emails: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`,
            ...result
        });
    } catch (error) {
        console.error('Error syncing owner emails:', error);
        res.status(500).json({ error: 'Failed to sync owner emails' });
    }
});

/**
 * POST /api/email-scheduler/test-email
 * Send a test email to verify owner email configuration
 * Body:
 *   - testEmail: Email address to send test to (required)
 *   - listingId: Specific listing to test (optional, picks random if not provided)
 */
router.post('/test-email', async (req, res) => {
    try {
        const { testEmail, listingId } = req.body;

        if (!testEmail) {
            return res.status(400).json({ error: 'testEmail is required' });
        }

        // Find a listing with owner email configured
        let listing;
        if (listingId) {
            listing = await Listing.findByPk(listingId);
        } else {
            // Find any listing with owner email
            listing = await Listing.findOne({
                where: {
                    ownerEmail: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
                }
            });
        }

        if (!listing) {
            return res.status(404).json({ error: 'No listing with owner email found' });
        }

        // Find the most recent statement for this listing
        const statement = await Statement.findOne({
            where: { propertyId: listing.id },
            order: [['createdAt', 'DESC']]
        });

        if (!statement) {
            return res.status(404).json({
                error: 'No statement found for this listing',
                listing: {
                    id: listing.id,
                    name: listing.nickname || listing.name,
                    ownerEmail: listing.ownerEmail,
                    ownerGreeting: listing.ownerGreeting
                }
            });
        }

        // Send test email with note about actual owner
        const testNote = `
============================================================
TEST EMAIL - DO NOT FORWARD TO OWNER
============================================================
This is a TEST email to verify owner email configuration.

INTENDED RECIPIENT:
  Email: ${listing.ownerEmail}
  Name: ${listing.ownerGreeting || 'Not set'}
  Property: ${listing.nickname || listing.name} (ID: ${listing.id})

If the above info is correct, the automation is working!
============================================================

`;

        // Prepare statement data with test note prepended to greeting
        const statementData = {
            ...statement.toJSON(),
            propertyName: listing.nickname || listing.name,
            ownerGreeting: listing.ownerGreeting
        };

        // Send email
        const result = await EmailService.sendStatementEmail({
            to: testEmail,
            statement: statementData,
            frequencyTag: 'TEST',
            testNote: testNote  // Will be handled in email template
        });

        res.json({
            success: result.success,
            message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
            sentTo: testEmail,
            intendedFor: {
                email: listing.ownerEmail,
                greeting: listing.ownerGreeting,
                property: listing.nickname || listing.name,
                propertyId: listing.id
            },
            statementId: statement.id,
            error: result.error || null
        });
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ error: 'Failed to send test email: ' + error.message });
    }
});

module.exports = router;
