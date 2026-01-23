const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const logger = require('../utils/logger');
const ListingService = require('../services/ListingService');
const { Listing } = require('../models');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
// Use default API version from account; explicit version here caused invalid version errors.
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const getBaseReturnUrl = () => {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
};

const ensureStripe = (res) => {
    if (!stripe) {
        res.status(500).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
        return false;
    }
    return true;
};

// Create or reuse a Connect account and generate onboarding link for a listing/owner
router.post('/listings/:id/onboarding-link', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const listingId = parseInt(req.params.id, 10);
        const listing = await Listing.findByPk(listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        let stripeAccountId = listing.stripeAccountId;
        try {
            stripeAccountId = decryptOptional(stripeAccountId);
        } catch (e) {
            stripeAccountId = null;
        }

        // Require pre-created Stripe account ID (client must enter it manually)
        if (!stripeAccountId) {
            return res.status(400).json({
                error: 'No Stripe account configured. Enter the Stripe Account ID first in the listing settings.'
            });
        }

        const baseUrl = getBaseReturnUrl();
        const refreshUrl = process.env.STRIPE_ONBOARDING_REFRESH_URL || `${baseUrl}/payout-onboarding/refresh`;
        const returnUrl = process.env.STRIPE_ONBOARDING_RETURN_URL || `${baseUrl}/payout-onboarding/complete`;

        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding'
        });

        // Update status to pending when onboarding link is generated
        if (listing.stripeOnboardingStatus === 'missing') {
            await listing.update({ stripeOnboardingStatus: 'pending' });
        }

        res.json({
            success: true,
            url: accountLink.url,
            stripeAccountId,
            status: listing.stripeOnboardingStatus === 'missing' ? 'pending' : listing.stripeOnboardingStatus
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'createOnboardingLink', listingId: req.params.id });
        res.status(500).json({ error: 'Failed to create onboarding link' });
    }
});

// Get current onboarding/payout status (stored values only - no Stripe API call)
// Status must be updated manually via listing settings since we don't have Stripe read permissions
router.get('/listings/:id/status', async (req, res) => {
    try {
        const listingId = parseInt(req.params.id, 10);
        const listing = await Listing.findByPk(listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        res.json({
            success: true,
            status: listing.stripeOnboardingStatus || 'missing',
            payoutStatus: listing.payoutStatus || 'missing',
            stripeAccountId: listing.stripeAccountId ? '[configured]' : null
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'getStatus', listingId: req.params.id });
        res.status(500).json({ error: 'Failed to get payout status' });
    }
});

// Transfer statement payout to listing's connected Stripe account
router.post('/statements/:id/transfer', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const statementId = parseInt(req.params.id, 10);
        const { Statement, Listing } = require('../models');

        const statement = await Statement.findByPk(statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Validate payout amount
        const payoutAmount = parseFloat(statement.ownerPayout);
        if (payoutAmount <= 0) {
            return res.status(400).json({ error: 'Cannot transfer: payout amount must be positive' });
        }

        // Already paid?
        if (statement.payoutStatus === 'paid') {
            return res.status(400).json({
                error: 'Statement already paid',
                transferId: statement.payoutTransferId,
                paidAt: statement.paidAt
            });
        }

        // Get the listing to find the connected Stripe account
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        if (!listingId) {
            return res.status(400).json({ error: 'Statement has no associated listing' });
        }

        const listing = await Listing.findByPk(listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        let stripeAccountId = listing.stripeAccountId;
        try {
            stripeAccountId = decryptOptional(stripeAccountId);
        } catch (e) {
            stripeAccountId = null;
        }

        if (!stripeAccountId) {
            return res.status(400).json({ error: 'Listing has no connected Stripe account' });
        }

        // Mark as pending before attempting transfer
        await statement.update({ payoutStatus: 'pending', payoutError: null });

        // Create Stripe transfer
        // Amount is in cents for Stripe
        const amountInCents = Math.round(payoutAmount * 100);

        const transfer = await stripe.transfers.create({
            amount: amountInCents,
            currency: 'usd',
            destination: stripeAccountId,
            description: `Payout for statement #${statementId} - ${statement.propertyName || 'Property ' + listingId}`,
            metadata: {
                statementId: statementId.toString(),
                listingId: listingId.toString(),
                ownerName: statement.ownerName,
                periodStart: statement.weekStartDate,
                periodEnd: statement.weekEndDate
            }
        });

        // Update statement with success
        await statement.update({
            payoutStatus: 'paid',
            payoutTransferId: transfer.id,
            paidAt: new Date(),
            payoutError: null
        });

        logger.info('Payout transfer successful', {
            statementId,
            transferId: transfer.id,
            amount: payoutAmount,
            destination: stripeAccountId
        });

        res.json({
            success: true,
            message: 'Payout transfer completed',
            transferId: transfer.id,
            amount: payoutAmount,
            paidAt: new Date()
        });

    } catch (error) {
        // Update statement with failure
        try {
            const { Statement } = require('../models');
            const statement = await Statement.findByPk(parseInt(req.params.id, 10));
            if (statement) {
                await statement.update({
                    payoutStatus: 'failed',
                    payoutError: error.message
                });
            }
        } catch (updateError) {
            logger.error('Failed to update statement after transfer error', { error: updateError.message });
        }

        logger.logError(error, { context: 'Payouts', action: 'transferToOwner', statementId: req.params.id });
        res.status(500).json({ error: error.message || 'Failed to transfer payout' });
    }
});

module.exports = router;
