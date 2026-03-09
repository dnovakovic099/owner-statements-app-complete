const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const ListingService = require('../services/ListingService');
const WiseService = require('../services/WiseService');
const { Listing } = require('../models');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

const ListingGroup = require('../models/ListingGroup');
const { Statement } = require('../models');

/**
 * Resolve the Wise recipient ID for a statement.
 * Priority: group recipient > individual listing recipient
 */
async function resolveWiseRecipientId(statement) {
    // Check group-level Wise recipient first
    if (statement.groupId) {
        try {
            const group = await ListingGroup.findByPk(statement.groupId);
            if (group && group.wiseRecipientId) {
                return { wiseRecipientId: group.wiseRecipientId, source: 'group' };
            }
        } catch (e) {
            logger.warn('Failed to check group Wise recipient', { groupId: statement.groupId, error: e.message });
        }
    }

    // Fall back to individual listing
    const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
    if (!listingId) {
        return { wiseRecipientId: null, source: null, error: 'Statement has no associated listing' };
    }

    const listing = await Listing.findByPk(listingId);
    if (!listing) {
        return { wiseRecipientId: null, source: null, error: 'Listing not found' };
    }

    // Model getter auto-decrypts wiseRecipientId
    const recipientId = listing.wiseRecipientId;

    if (!recipientId) {
        return { wiseRecipientId: null, source: null, error: 'No Wise recipient configured for this listing' };
    }

    return { wiseRecipientId: recipientId, source: 'listing' };
}

// ─── GET /config ─────────────────────────────────────────────
router.get('/config', async (req, res) => {
    res.json({
        wiseConfigured: WiseService.isConfigured(),
    });
});

// ─── POST /generate-invite ──────────────────────────────────
// Generate an invite link for an owner to add their bank details
router.post('/generate-invite', async (req, res) => {
    try {
        const { entityType, entityId, email } = req.body;

        if (!['listing', 'group'].includes(entityType) || !entityId) {
            return res.status(400).json({ error: 'entityType (listing|group) and entityId are required' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`;

        if (entityType === 'group') {
            const group = await ListingGroup.findByPk(parseInt(entityId));
            if (!group) return res.status(404).json({ error: 'Group not found' });
            await group.update({ payoutInviteToken: token, wiseStatus: 'pending' });
        } else {
            const listing = await Listing.findByPk(parseInt(entityId));
            if (!listing) return res.status(404).json({ error: 'Listing not found' });
            await listing.update({ payoutInviteToken: token, wiseStatus: 'pending' });
        }

        const inviteUrl = `${appUrl}/payout-setup/${token}`;

        logger.info('Payout invite generated', { entityType, entityId, inviteUrl });

        res.json({
            success: true,
            inviteUrl,
            token,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'generateInvite' });
        res.status(500).json({ error: 'Failed to generate invite link' });
    }
});

// ─── POST /refresh-status ───────────────────────────────────
// Check Wise recipient status
router.post('/refresh-status', async (req, res) => {
    try {
        const { wiseRecipientId, listingId, groupId } = req.body;

        if (!wiseRecipientId) {
            return res.status(400).json({ error: 'wiseRecipientId is required' });
        }

        if (!WiseService.isConfigured()) {
            return res.status(500).json({ error: 'Wise is not configured' });
        }

        const recipient = await WiseService.getRecipient(wiseRecipientId);
        const isActive = recipient.active !== false;
        const newStatus = isActive ? 'verified' : 'requires_action';

        // Update entity
        if (groupId) {
            const group = await ListingGroup.findByPk(parseInt(groupId));
            if (group) await group.update({ wiseStatus: newStatus });
        }
        if (listingId) {
            const listing = await Listing.findByPk(parseInt(listingId));
            if (listing) {
                await listing.update({ wiseStatus: newStatus });
            }
        }

        res.json({
            success: true,
            status: newStatus,
            recipientActive: isActive,
            recipientName: recipient.accountHolderName,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'refreshStatus' });
        res.status(500).json({ error: 'Failed to refresh Wise status' });
    }
});

// ─── GET /listings/:id/status ───────────────────────────────
router.get('/listings/:id/status', async (req, res) => {
    try {
        const listing = await Listing.findByPk(parseInt(req.params.id));
        if (!listing) return res.status(404).json({ error: 'Listing not found' });

        let recipientId = listing.wiseRecipientId;
        try { recipientId = decryptOptional(recipientId); } catch (e) { /* already plain */ }

        res.json({
            success: true,
            wiseRecipientId: recipientId,
            wiseStatus: listing.wiseStatus,
            payoutStatus: listing.payoutStatus,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'listingStatus' });
        res.status(500).json({ error: 'Failed to fetch listing status' });
    }
});

// ─── POST /statements/:id/mark-paid ─────────────────────────
// Manually mark a statement as paid (admin use — for transfers done outside the app)
router.post('/statements/:id/mark-paid', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const { transferId, wiseFee } = req.body;
        const statement = await Statement.findByPk(statementId);
        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        const fee = parseFloat(wiseFee) || 0;

        await statement.update({
            payoutStatus: 'paid',
            payoutTransferId: transferId ? String(transferId) : null,
            paidAt: new Date(),
            wiseFee: fee,
            totalTransferAmount: payoutAmount + fee,
            payoutError: null,
        });

        logger.info('Statement manually marked as paid', { statementId, transferId, wiseFee: fee });
        res.json({ success: true, message: `Statement ${statementId} marked as paid` });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'markPaid' });
        res.status(500).json({ error: 'Failed to mark statement as paid' });
    }
});

// ─── POST /statements/:id/transfer ─────────────────────────
// Pay owner via Wise for a single statement
router.post('/statements/:id/transfer', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const statement = await Statement.findByPk(statementId);

        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        if (payoutAmount <= 0) {
            return res.status(400).json({ error: 'Statement has no positive payout amount' });
        }

        if (statement.payoutStatus === 'paid') {
            return res.status(400).json({ error: 'Statement already paid' });
        }

        if (!WiseService.isConfigured()) {
            return res.status(500).json({ error: 'Wise is not configured' });
        }

        // Resolve recipient
        const { wiseRecipientId, error: resolveError } = await resolveWiseRecipientId(statement);
        if (!wiseRecipientId) {
            return res.status(400).json({ error: resolveError || 'No Wise recipient found' });
        }

        // Mark as pending
        await statement.update({ payoutStatus: 'pending', payoutError: null });

        // Check balance and auto-top-up if needed
        let balance;
        try {
            balance = await WiseService.getBalance();
        } catch (e) {
            logger.warn('Failed to check Wise balance', { error: e.message });
            balance = null;
        }

        if (balance !== null && balance < payoutAmount) {
            // Insufficient balance — auto top-up
            const shortfall = payoutAmount - balance;
            const topupAmount = Math.ceil(shortfall * 1.05 * 100) / 100; // 5% buffer

            try {
                const topup = await WiseService.topUpBalance(topupAmount);
                logger.info('Auto top-up completed for single payout', {
                    statementId, topupAmount, balance, needed: payoutAmount,
                    transferId: topup.transfer.id, fundingMethod: topup.fundingMethod,
                    estimatedArrival: topup.estimatedArrival,
                });

                // If funded via debit card (instant), wait briefly then continue with payout
                if (topup.fundingMethod === 'DEBIT' || topup.estimatedArrival === 'instant') {
                    logger.info('Instant top-up detected, proceeding with payout immediately');
                    // Balance should be available instantly, fall through to payout below
                } else {
                    // Non-instant top-up — queue for later processing
                    await statement.update({ payoutStatus: 'queued', payoutError: null });
                    return res.json({
                        success: true,
                        queued: true,
                        message: `Insufficient balance ($${balance.toFixed(2)}). Top-up of $${topupAmount.toFixed(2)} initiated via ${topup.fundingMethod}. Payout will process automatically when funds arrive.`,
                        topupAmount,
                        topupTransferId: topup.transfer.id,
                        estimatedArrival: topup.estimatedArrival,
                        fundingMethod: topup.fundingMethod,
                    });
                }
            } catch (topupErr) {
                logger.error('Auto top-up failed', { error: topupErr.message, statementId });
                await statement.update({ payoutStatus: 'failed', payoutError: `Insufficient balance and top-up failed: ${topupErr.message}` });
                return res.status(400).json({
                    error: `Insufficient Wise balance ($${balance.toFixed(2)}, need $${payoutAmount.toFixed(2)}). Auto top-up failed: ${topupErr.message}`,
                    balance,
                    needed: payoutAmount,
                });
            }
        }

        // Execute payout
        const ownerName = statement.ownerName || 'Owner';
        const reference = `Payout - ${ownerName} - Stmt #${statementId}`;

        const { transfer, wiseFee } = await WiseService.sendPayout({
            recipientId: parseInt(wiseRecipientId),
            amount: payoutAmount,
            reference,
            statementId,
        });

        const totalTransferAmount = payoutAmount + wiseFee;

        await statement.update({
            payoutStatus: 'paid',
            payoutTransferId: String(transfer.id),
            paidAt: new Date(),
            wiseFee: wiseFee,
            totalTransferAmount: totalTransferAmount,
            payoutError: null,
        });

        logger.info('Wise payout completed', { statementId, transferId: transfer.id, amount: payoutAmount, wiseFee });

        res.json({
            success: true,
            queued: false,
            message: 'Payout sent via Wise',
            transferId: String(transfer.id),
            ownerPayout: payoutAmount,
            wiseFee,
            totalTransferAmount,
            paidAt: new Date().toISOString(),
        });
    } catch (error) {
        // Update statement with error
        try {
            const statement = await Statement.findByPk(parseInt(req.params.id));
            if (statement && statement.payoutStatus === 'pending') {
                await statement.update({
                    payoutStatus: 'failed',
                    payoutError: error.response?.data?.message || error.message || 'Wise transfer failed',
                });
            }
        } catch (e) { /* ignore */ }

        logger.logError(error, {
            context: 'Payouts', action: 'transfer', statementId: req.params.id,
            wiseResponse: error.response?.data,
            wiseStatus: error.response?.status,
        });
        const msg = error.response?.data?.errors?.[0]?.message || error.response?.data?.message || error.message || 'Transfer failed';
        res.status(500).json({ error: msg });
    }
});

// ─── POST /statements/:id/collect ───────────────────────────
// For negative balance — generate payment page + send invoice with Wise bank details
router.post('/statements/:id/collect', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const statement = await Statement.findByPk(statementId);

        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        if (payoutAmount >= 0) {
            return res.status(400).json({ error: 'Statement does not have a negative balance' });
        }

        if (statement.payoutStatus === 'collected' || statement.payoutStatus === 'paid') {
            return res.status(400).json({ error: 'Already settled' });
        }

        const collectAmount = Math.abs(payoutAmount);

        // Generate a payment token for the collection page
        const paymentToken = crypto.randomBytes(32).toString('hex');
        await statement.update({ payoutError: `payment_token:${paymentToken}` }); // Store token temporarily

        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`;
        const paymentPageUrl = `${appUrl}/pay/${paymentToken}`;

        // Look up owner email
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        let recipientEmail = null;
        if (listingId) {
            const listing = await Listing.findByPk(listingId);
            recipientEmail = listing?.ownerEmail || null;
        }

        // Get Wise bank details for the payment page
        let bankDetails = null;
        try {
            bankDetails = await WiseService.getAccountBankDetails();
        } catch (e) {
            logger.warn('Could not fetch Wise bank details', { error: e.message });
        }

        // Send invoice email with payment link and Wise bank details
        let invoiceSent = false;
        if (recipientEmail && process.env.SENDGRID_API_KEY) {
            try {
                const sgMail = require('@sendgrid/mail');
                sgMail.setApiKey(process.env.SENDGRID_API_KEY);

                const bankDetailsHtml = bankDetails && bankDetails.length > 0
                    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
                        <p style="font-weight:600;margin:0 0 8px">Wire Transfer Details:</p>
                        <p style="margin:4px 0;font-family:monospace">Bank: ${bankDetails[0].bankName || 'N/A'}</p>
                        <p style="margin:4px 0;font-family:monospace">Routing: ${bankDetails[0].routingNumber || 'N/A'}</p>
                        <p style="margin:4px 0;font-family:monospace">Account: ${bankDetails[0].accountNumber || 'N/A'}</p>
                        <p style="margin:4px 0;font-size:12px;color:#6b7280">Reference: Statement #${statementId} - ${statement.ownerName}</p>
                    </div>`
                    : '';

                await sgMail.send({
                    to: recipientEmail,
                    from: process.env.SENDGRID_FROM_EMAIL || 'statements@luxurylodgingpm.com',
                    subject: `Balance Due: $${collectAmount.toFixed(2)} - ${statement.ownerName}`,
                    html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
                        <p>Dear ${statement.ownerName},</p>
                        <p>Your statement for ${statement.weekStartDate} to ${statement.weekEndDate} shows a balance due of <strong style="color:#dc2626">$${collectAmount.toFixed(2)}</strong>.</p>
                        <p>Please send payment using one of the following methods:</p>
                        <div style="text-align:center;margin:20px 0">
                            <a href="${paymentPageUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Payment Details</a>
                        </div>
                        ${bankDetailsHtml}
                        <p style="color:#6b7280;font-size:14px">When making a wire transfer, please include "Statement #${statementId}" as the reference so we can match your payment.</p>
                        <p>Thank you,<br/>Luxury Lodging PM</p>
                    </div>`,
                });
                invoiceSent = true;
            } catch (emailErr) {
                logger.warn('Failed to send collection email', { error: emailErr.message });
            }
        }

        await statement.update({
            payoutStatus: invoiceSent ? 'invoice_sent' : 'collected',
            paidAt: new Date(),
            payoutError: `payment_token:${paymentToken}`,
        });

        res.json({
            success: true,
            message: invoiceSent ? 'Invoice sent to owner with payment details' : 'Marked as collected',
            collectAmount,
            invoiceSent,
            recipientEmail,
            paymentPageUrl,
            paidAt: new Date().toISOString(),
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'collect', statementId: req.params.id });
        res.status(500).json({ error: error.message || 'Collection failed' });
    }
});

// ─── GET /bank-details ──────────────────────────────────────
// Get Wise bank details for receiving payments
router.get('/bank-details', async (req, res) => {
    try {
        if (!WiseService.isConfigured()) {
            return res.status(500).json({ error: 'Wise is not configured' });
        }
        const details = await WiseService.getAccountBankDetails();
        res.json({ success: true, bankDetails: details });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'bankDetails' });
        res.status(500).json({ error: 'Failed to get bank details' });
    }
});

// ─── GET /inbound-transactions ──────────────────────────────
// Check for inbound payments (for reconciliation)
router.get('/inbound-transactions', async (req, res) => {
    try {
        if (!WiseService.isConfigured()) {
            return res.status(500).json({ error: 'Wise is not configured' });
        }

        const days = parseInt(req.query.days) || 30;
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

        const statementData = await WiseService.getBalanceStatement(start, end);

        // Filter for inbound (CREDIT) transactions
        const inbound = (statementData.transactions || []).filter(t => t.type === 'CREDIT');

        res.json({
            success: true,
            transactions: inbound,
            period: { start: start.toISOString(), end: end.toISOString() },
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'inboundTransactions' });
        res.status(500).json({ error: 'Failed to fetch inbound transactions' });
    }
});

// ─── POST /fund-and-queue ───────────────────────────────────
// Bulk pay multiple statements via Wise
router.post('/fund-and-queue', async (req, res) => {
    try {
        const { statementIds } = req.body;
        if (!statementIds || !Array.isArray(statementIds) || statementIds.length === 0) {
            return res.status(400).json({ error: 'statementIds array is required' });
        }

        if (!WiseService.isConfigured()) {
            return res.status(500).json({ error: 'Wise is not configured' });
        }

        const statements = await Statement.findAll({
            where: { id: statementIds }
        });

        // Filter valid payouts
        const valid = [];
        const skipped = [];

        for (const stmt of statements) {
            const amount = parseFloat(stmt.ownerPayout) || 0;
            if (amount <= 0) {
                skipped.push({ id: stmt.id, reason: 'Non-positive payout' });
                continue;
            }
            if (stmt.payoutStatus === 'paid' || stmt.payoutStatus === 'queued') {
                skipped.push({ id: stmt.id, reason: 'Already paid/queued' });
                continue;
            }

            const { wiseRecipientId, error: resolveError } = await resolveWiseRecipientId(stmt);
            if (!wiseRecipientId) {
                skipped.push({ id: stmt.id, reason: resolveError || 'No Wise recipient' });
                continue;
            }

            valid.push({ statement: stmt, wiseRecipientId });
        }

        if (valid.length === 0) {
            return res.json({
                success: true,
                mode: 'none',
                processed: 0,
                failed: 0,
                skipped,
                message: 'No valid statements to process',
            });
        }

        // Check balance
        const totalAmount = valid.reduce((sum, v) => sum + parseFloat(v.statement.ownerPayout), 0);
        let balance;
        try {
            balance = await WiseService.getBalance();
        } catch (e) {
            logger.warn('Failed to check Wise balance', { error: e.message });
            balance = null;
        }

        if (balance !== null && balance < totalAmount) {
            // Insufficient balance — auto top-up
            const shortfall = totalAmount - balance;
            const topupAmount = Math.ceil(shortfall * 1.05 * 100) / 100; // 5% buffer

            try {
                const topup = await WiseService.topUpBalance(topupAmount);

                logger.info('Fund & Queue: top-up completed', {
                    topupAmount, balance, totalAmount,
                    topupTransferId: topup.transfer.id,
                    fundingMethod: topup.fundingMethod,
                    estimatedArrival: topup.estimatedArrival,
                });

                // If instant (debit card), fall through to process immediately
                if (topup.fundingMethod === 'DEBIT' || topup.estimatedArrival === 'instant') {
                    logger.info('Instant top-up detected, processing all payouts immediately');
                    // Fall through to the immediate processing block below
                } else {
                    // Non-instant — queue for later
                    for (const { statement } of valid) {
                        await statement.update({ payoutStatus: 'queued', payoutError: null });
                    }

                    return res.json({
                        success: true,
                        mode: 'queued',
                        topupTransferId: topup.transfer.id,
                        topupAmount,
                        estimatedArrival: topup.estimatedArrival,
                        fundingMethod: topup.fundingMethod,
                        queuedCount: valid.length,
                        totalPayout: totalAmount,
                        skipped,
                        message: `Insufficient balance ($${balance.toFixed(2)}). Top-up of $${topupAmount.toFixed(2)} initiated via ${topup.fundingMethod}. ${valid.length} payouts will process automatically when funds arrive.`,
                    });
                }
            } catch (topupErr) {
                logger.error('Fund & Queue: top-up failed', { error: topupErr.message });
                return res.status(400).json({
                    error: `Insufficient Wise balance ($${balance.toFixed(2)}, need $${totalAmount.toFixed(2)}). Auto top-up failed: ${topupErr.message}`,
                    balance,
                    needed: totalAmount,
                });
            }
        }

        // Sufficient balance — process all transfers
        let processed = 0;
        let failed = 0;
        const results = [];

        // Use batch payments for 3+ payouts, individual for fewer
        const USE_BATCH_THRESHOLD = 3;

        if (valid.length >= USE_BATCH_THRESHOLD) {
            // ── BATCH PAYMENT MODE ──
            try {
                // Mark all as pending
                for (const { statement } of valid) {
                    await statement.update({ payoutStatus: 'pending', payoutError: null });
                }

                const batchPayouts = valid.map(({ statement, wiseRecipientId }) => ({
                    recipientId: parseInt(wiseRecipientId),
                    amount: parseFloat(statement.ownerPayout),
                    reference: `Payout - ${statement.ownerName} - Stmt #${statement.id}`,
                    statementId: statement.id,
                }));

                const { transfers } = await WiseService.sendBatchPayouts(batchPayouts);

                // Update each statement with its transfer result
                for (const t of transfers) {
                    const match = valid.find(v => v.statement.id === t.statementId);
                    if (match) {
                        await match.statement.update({
                            payoutStatus: 'paid',
                            payoutTransferId: String(t.transfer.id),
                            paidAt: new Date(),
                            wiseFee: t.wiseFee,
                            totalTransferAmount: parseFloat(match.statement.ownerPayout) + t.wiseFee,
                            payoutError: null,
                        });
                        processed++;
                        results.push({ id: match.statement.id, success: true, transferId: t.transfer.id });
                    }
                }

                logger.info('Batch payout completed', { batchSize: valid.length, processed });
            } catch (batchErr) {
                // Batch failed — fall back to individual transfers
                logger.warn('Batch payment failed, falling back to individual transfers', { error: batchErr.message });

                for (const { statement, wiseRecipientId } of valid) {
                    if (statement.payoutStatus === 'paid') continue; // Already processed
                    try {
                        await statement.update({ payoutStatus: 'pending', payoutError: null });
                        const amount = parseFloat(statement.ownerPayout);
                        const reference = `Payout - ${statement.ownerName} - Stmt #${statement.id}`;

                        const { transfer, wiseFee } = await WiseService.sendPayout({
                            recipientId: parseInt(wiseRecipientId),
                            amount,
                            reference,
                            statementId: statement.id,
                        });

                        await statement.update({
                            payoutStatus: 'paid',
                            payoutTransferId: String(transfer.id),
                            paidAt: new Date(),
                            wiseFee,
                            totalTransferAmount: amount + wiseFee,
                            payoutError: null,
                        });
                        processed++;
                        results.push({ id: statement.id, success: true, transferId: transfer.id });
                    } catch (err) {
                        failed++;
                        const errorMsg = err.response?.data?.message || err.message || 'Transfer failed';
                        await statement.update({ payoutStatus: 'failed', payoutError: errorMsg });
                        results.push({ id: statement.id, success: false, error: errorMsg });
                    }
                }
            }
        } else {
            // ── INDIVIDUAL TRANSFER MODE (1-2 payouts) ──
            for (const { statement, wiseRecipientId } of valid) {
                try {
                    await statement.update({ payoutStatus: 'pending', payoutError: null });

                    const amount = parseFloat(statement.ownerPayout);
                    const reference = `Payout - ${statement.ownerName} - Stmt #${statement.id}`;

                    const { transfer, wiseFee } = await WiseService.sendPayout({
                        recipientId: parseInt(wiseRecipientId),
                        amount,
                        reference,
                        statementId: statement.id,
                    });

                    await statement.update({
                        payoutStatus: 'paid',
                        payoutTransferId: String(transfer.id),
                        paidAt: new Date(),
                        wiseFee,
                        totalTransferAmount: amount + wiseFee,
                        payoutError: null,
                    });

                    processed++;
                    results.push({ id: statement.id, success: true, transferId: transfer.id });
                } catch (err) {
                    failed++;
                    const errorMsg = err.response?.data?.message || err.message || 'Transfer failed';
                    await statement.update({ payoutStatus: 'failed', payoutError: errorMsg });
                    results.push({ id: statement.id, success: false, error: errorMsg });
                    logger.error('Bulk payout failed for statement', { statementId: statement.id, error: errorMsg });
                }
            }
        }

        res.json({
            success: true,
            mode: 'immediate',
            processed,
            failed,
            totalPayout: totalAmount,
            skipped,
            results,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'fundAndQueue' });
        res.status(500).json({ error: error.message || 'Bulk payout failed' });
    }
});

// ─── POST /process-queued ─────────────────────────────────
// Process all queued payouts (called manually or by scheduler)
router.post('/process-queued', async (req, res) => {
    try {
        const result = await processQueuedPayouts();
        res.json(result);
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'processQueued' });
        res.status(500).json({ error: error.message || 'Failed to process queued payouts' });
    }
});

// ─── GET /balance ──────────────────────────────────────────
router.get('/balance', async (req, res) => {
    try {
        if (!WiseService.isConfigured()) {
            return res.status(500).json({ error: 'Wise is not configured' });
        }
        const balance = await WiseService.getBalance();
        const { Op } = require('sequelize');
        const queuedCount = await Statement.count({ where: { payoutStatus: 'queued' } });
        const queuedTotal = queuedCount > 0
            ? (await Statement.sum('ownerPayout', { where: { payoutStatus: 'queued' } })) || 0
            : 0;

        res.json({
            success: true,
            balance,
            queuedCount,
            queuedTotal,
            canProcessQueued: balance >= queuedTotal && queuedCount > 0,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'getBalance' });
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

/**
 * Process all queued payout transfers.
 * Checks balance, and if sufficient, processes all queued statements.
 */
async function processQueuedPayouts() {
    if (!WiseService.isConfigured()) {
        logger.warn('Wise not configured, cannot process queued payouts');
        return { success: false, error: 'Wise not configured' };
    }

    const { Op } = require('sequelize');
    const queued = await Statement.findAll({
        where: { payoutStatus: 'queued' },
        order: [['created_at', 'ASC']],
    });

    if (queued.length === 0) {
        logger.info('No queued payouts to process');
        return { success: true, processed: 0, failed: 0 };
    }

    const totalNeeded = queued.reduce((sum, s) => sum + parseFloat(s.ownerPayout), 0);
    const balance = await WiseService.getBalance();

    if (balance < totalNeeded) {
        logger.warn('Insufficient balance for queued payouts', { balance, totalNeeded, queuedCount: queued.length });
        return { success: false, error: 'Insufficient balance', balance, totalNeeded };
    }

    let processed = 0;
    let failed = 0;

    for (const statement of queued) {
        try {
            await statement.reload();
            if (statement.payoutStatus !== 'queued') continue;

            const payoutAmount = parseFloat(statement.ownerPayout);
            if (payoutAmount <= 0) {
                await statement.update({ payoutStatus: 'failed', payoutError: 'Payout amount not positive' });
                failed++;
                continue;
            }

            const { wiseRecipientId } = await resolveWiseRecipientId(statement);
            if (!wiseRecipientId) {
                await statement.update({ payoutStatus: 'failed', payoutError: 'No Wise recipient found' });
                failed++;
                continue;
            }

            await statement.update({ payoutStatus: 'pending', payoutError: null });

            const reference = `Payout - ${statement.ownerName || 'Owner'} - Stmt #${statement.id}`;
            const { transfer, wiseFee } = await WiseService.sendPayout({
                recipientId: parseInt(wiseRecipientId),
                amount: payoutAmount,
                reference,
                statementId: statement.id,
            });

            await statement.update({
                payoutStatus: 'paid',
                payoutTransferId: String(transfer.id),
                paidAt: new Date(),
                payoutError: null,
                wiseFee,
                totalTransferAmount: payoutAmount + wiseFee,
            });
            processed++;
            logger.info('Queued payout processed', { statementId: statement.id, transferId: transfer.id });
        } catch (err) {
            failed++;
            const errorMsg = err.response?.data?.message || err.message || 'Transfer failed';
            await statement.update({ payoutStatus: 'failed', payoutError: errorMsg });
            logger.error('Failed to process queued payout', { statementId: statement.id, error: errorMsg });
        }
    }

    logger.info('Queued payouts processing complete', { processed, failed });
    return { success: true, processed, failed };
}

module.exports = router;
module.exports.processQueuedPayouts = processQueuedPayouts;
