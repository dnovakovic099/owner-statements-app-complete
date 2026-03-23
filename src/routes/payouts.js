const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const ListingService = require('../services/ListingService');
const IncreaseService = require('../services/IncreaseService');
const { Listing } = require('../models');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

const ListingGroup = require('../models/ListingGroup');
const { Statement } = require('../models');
const payoutReceiptTemplate = require('../templates/emails/payoutReceipt');
const collectionInvoiceTemplate = require('../templates/emails/collectionInvoice');

/**
 * Resolve the Increase external account ID for a statement.
 * Priority: group recipient > individual listing recipient
 */
async function resolveWiseRecipientId(statement) {
    // Check group-level recipient first
    if (statement.groupId) {
        try {
            const group = await ListingGroup.findByPk(statement.groupId);
            if (group && group.wiseRecipientId) {
                return { wiseRecipientId: group.wiseRecipientId, source: 'group' };
            }
        } catch (e) {
            logger.warn('Failed to check group Increase recipient', { groupId: statement.groupId, error: e.message });
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

    // Model getter auto-decrypts wiseRecipientId (stores Increase external_account_id)
    const recipientId = listing.wiseRecipientId;

    if (!recipientId) {
        return { wiseRecipientId: null, source: null, error: 'No Increase external account configured for this listing' };
    }

    return { wiseRecipientId: recipientId, source: 'listing' };
}

// ─── GET /config ─────────────────────────────────────────────
router.get('/config', async (req, res) => {
    res.json({
        wiseConfigured: IncreaseService.isConfigured(),
        increaseConfigured: IncreaseService.isConfigured(),
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
// Check Increase recipient status
router.post('/refresh-status', async (req, res) => {
    try {
        const { wiseRecipientId, listingId, groupId } = req.body;

        if (!wiseRecipientId) {
            return res.status(400).json({ error: 'wiseRecipientId is required' });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const recipient = await IncreaseService.getRecipient(wiseRecipientId);
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
        res.status(500).json({ error: 'Failed to refresh payout status' });
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

// Receipt route is handled in server.js (public, uses short-lived JWT token in query string)

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

        if (statement.payoutStatus === 'paid' || statement.payoutStatus === 'pending') {
            return res.status(400).json({ error: `Statement already ${statement.payoutStatus}` });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        // Resolve recipient
        const { wiseRecipientId, error: resolveError } = await resolveWiseRecipientId(statement);
        if (!wiseRecipientId) {
            return res.status(400).json({ error: resolveError || 'No Increase external account found' });
        }

        // Atomic mark as pending — prevents double-payout from concurrent requests
        const [affectedRows] = await Statement.update(
            { payoutStatus: 'pending', payoutError: null },
            { where: { id: statementId, payoutStatus: { [require('sequelize').Op.notIn]: ['paid', 'pending'] } } }
        );
        if (affectedRows === 0) {
            return res.status(409).json({ error: 'Statement is already being processed' });
        }

        // Check balance
        let balance;
        try {
            balance = await IncreaseService.getBalance();
        } catch (e) {
            logger.warn('Failed to check Increase balance', { error: e.message });
            balance = null;
        }

        if (balance !== null && balance < payoutAmount) {
            await statement.update({ payoutStatus: 'failed', payoutError: `Insufficient balance ($${balance.toFixed(2)}, need $${payoutAmount.toFixed(2)})` });
            return res.status(400).json({
                error: `Insufficient Increase balance ($${balance.toFixed(2)}, need $${payoutAmount.toFixed(2)}). Please fund your Increase account.`,
                balance,
                needed: payoutAmount,
            });
        }

        // Execute payout
        const ownerName = statement.ownerName || 'Owner';
        const reference = `Payout - ${ownerName} - Stmt #${statementId}`;

        const { transfer, wiseFee } = await IncreaseService.sendPayout({
            recipientId: wiseRecipientId,
            amount: payoutAmount,
            reference,
            statementId,
            individualName: ownerName,
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

        logger.info('Increase payout completed', { statementId, transferId: transfer.id, amount: payoutAmount });

        res.json({
            success: true,
            queued: false,
            message: 'Payout sent via Increase ACH',
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
                    payoutError: error.response?.data?.detail || error.response?.data?.title || error.message || 'Increase transfer failed',
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
// For negative balance — generate payment page + send invoice with bank details
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

        // Get Increase bank details for the payment page
        let bankDetails = null;
        try {
            bankDetails = await IncreaseService.getAccountBankDetails();
        } catch (e) {
            logger.warn('Could not fetch Increase bank details', { error: e.message });
        }

        // Send invoice email with payment link and bank details
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
                    html: collectionInvoiceTemplate({
                        ownerName: statement.ownerName,
                        collectAmount,
                        paymentPageUrl,
                        bankDetailsHtml,
                        statementId,
                        startDate: statement.weekStartDate,
                        endDate: statement.weekEndDate,
                    }),
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
// Get Increase bank details for receiving payments
router.get('/bank-details', async (req, res) => {
    try {
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }
        const details = await IncreaseService.getAccountBankDetails();
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
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const days = parseInt(req.query.days) || 30;
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

        const statementData = await IncreaseService.getBalanceStatement(start, end);

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
// Bulk pay multiple statements via Increase
router.post('/fund-and-queue', async (req, res) => {
    try {
        const { statementIds } = req.body;
        if (!statementIds || !Array.isArray(statementIds) || statementIds.length === 0) {
            return res.status(400).json({ error: 'statementIds array is required' });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
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
                skipped.push({ id: stmt.id, reason: resolveError || 'No Increase recipient' });
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
            balance = await IncreaseService.getBalance();
        } catch (e) {
            logger.warn('Failed to check Increase balance', { error: e.message });
            balance = null;
        }

        if (balance !== null && balance < totalAmount) {
            return res.status(400).json({
                error: `Insufficient Increase balance ($${balance.toFixed(2)}, need $${totalAmount.toFixed(2)}). Please fund your Increase account.`,
                balance,
                needed: totalAmount,
            });
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
                    recipientId: wiseRecipientId,
                    amount: parseFloat(statement.ownerPayout),
                    reference: `Payout - ${statement.ownerName} - Stmt #${statement.id}`,
                    statementId: statement.id,
                    individualName: statement.ownerName || 'Owner',
                }));

                const { transfers } = await IncreaseService.sendBatchPayouts(batchPayouts);

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

                        const { transfer, wiseFee } = await IncreaseService.sendPayout({
                            recipientId: wiseRecipientId,
                            amount,
                            reference,
                            statementId: statement.id,
                            individualName: statement.ownerName || 'Owner',
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

                    const { transfer, wiseFee } = await IncreaseService.sendPayout({
                        recipientId: wiseRecipientId,
                        amount,
                        reference,
                        statementId: statement.id,
                        individualName: statement.ownerName || 'Owner',
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
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }
        const balance = await IncreaseService.getBalance();
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

// ─── GET /reconcile ──────────────────────────────────────────
// Check Increase transfer statuses and update statements accordingly (admin-only)
router.get('/reconcile', async (req, res) => {
    try {
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const reconciliationService = require('../services/ReconciliationService');
        const result = await reconciliationService.reconcileTransfers();

        logger.info('Reconciliation completed', result);
        res.json({ success: true, ...result });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'reconcile' });
        res.status(500).json({ error: 'Reconciliation failed' });
    }
});

/**
 * Process all queued payout transfers.
 * Checks balance, and if sufficient, processes all queued statements.
 */
async function processQueuedPayouts() {
    if (!IncreaseService.isConfigured()) {
        logger.warn('Increase not configured, cannot process queued payouts');
        return { success: false, error: 'Increase not configured' };
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
    const balance = await IncreaseService.getBalance();

    if (balance < totalNeeded) {
        logger.warn('Insufficient Increase balance for queued payouts', { balance, totalNeeded, queuedCount: queued.length });
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
                await statement.update({ payoutStatus: 'failed', payoutError: 'No Increase external account found' });
                failed++;
                continue;
            }

            await statement.update({ payoutStatus: 'pending', payoutError: null });

            const reference = `Payout - ${statement.ownerName || 'Owner'} - Stmt #${statement.id}`;
            const { transfer, wiseFee } = await IncreaseService.sendPayout({
                recipientId: wiseRecipientId,
                amount: payoutAmount,
                reference,
                statementId: statement.id,
                individualName: statement.ownerName || 'Owner',
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
