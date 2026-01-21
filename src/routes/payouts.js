const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
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

        let { stripeAccountId } = listing;
        try {
            stripeAccountId = decryptOptional(stripeAccountId);
        } catch (e) {
            stripeAccountId = null;
        }

        if (!stripeAccountId) {
            // Create new Express account
            const account = await stripe.accounts.create({
                type: 'express',
                email: listing.ownerEmail || undefined,
                metadata: { listingId: String(listingId) }
            });
            stripeAccountId = account.id;
            await listing.update({
                stripeAccountId: encryptOptional(stripeAccountId),
                stripeOnboardingStatus: 'pending',
                payoutStatus: listing.payoutStatus === 'on_file' ? listing.payoutStatus : 'pending'
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

        res.json({
            success: true,
            url: accountLink.url,
            stripeAccountId,
            status: listing.stripeOnboardingStatus
        });
    } catch (error) {
        console.error('[Payouts] Error creating onboarding link:', error);
        res.status(500).json({ error: 'Failed to create onboarding link' });
    }
});

// Refresh onboarding/payout status from Stripe
router.get('/listings/:id/status', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const listingId = parseInt(req.params.id, 10);
        const listing = await Listing.findByPk(listingId);
        if (!listing || !listing.stripeAccountId) {
            return res.status(404).json({ error: 'Listing or Stripe account not found' });
        }

        let decryptedAccountId = null;
        try {
            decryptedAccountId = decryptOptional(listing.stripeAccountId);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid Stripe account ID stored' });
        }

        const account = await stripe.accounts.retrieve(decryptedAccountId);
        const requirements = account.requirements || {};
        const currentlyDue = requirements.currently_due || [];
        const pendingVerification = currentlyDue.length > 0 || account.details_submitted === false;
        const verified = account.charges_enabled && account.payouts_enabled && !pendingVerification;

        const newOnboardingStatus = verified ? 'verified' : (pendingVerification ? 'pending' : 'requires_action');
        const newPayoutStatus = verified ? 'on_file' : listing.payoutStatus;

        await listing.update({
            stripeOnboardingStatus: newOnboardingStatus,
            payoutStatus: newPayoutStatus
        });

        res.json({
            success: true,
            status: newOnboardingStatus,
            payoutStatus: newPayoutStatus,
            account
        });
    } catch (error) {
        console.error('[Payouts] Error refreshing status:', error);
        res.status(500).json({ error: 'Failed to refresh payout status' });
    }
});

module.exports = router;
