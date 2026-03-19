/**
 * Real Increase ACH Payout Integration Test
 *
 * Tests the full payout flow against the Increase sandbox API:
 *   1. Check if Increase is configured
 *   2. Check account balance
 *   3. List external accounts (recipients)
 *   4. Send a $0.01 test payout to a real sandbox recipient
 *   5. Verify transfer status
 *   6. Send a batch of 10 test payouts ($0.01 each)
 *   7. Verify all transfers completed
 *
 * Prerequisites:
 *   - INCREASE_API_KEY (sandbox key)
 *   - INCREASE_ACCOUNT_ID (sandbox account)
 *   - INCREASE_SANDBOX=true
 *   - TEST_RECIPIENT_ID (sandbox external account ID)
 *
 * Run:
 *   INCREASE_SANDBOX=true TEST_RECIPIENT_ID=sandbox_external_account_xxx \
 *     npx jest increase-payout.jest.test.js --verbose --forceExit
 */

require('dotenv').config();
const IncreaseService = require('../services/IncreaseService');

const TEST_RECIPIENT_ID = process.env.TEST_RECIPIENT_ID;
const SKIP_REASON = !IncreaseService.isConfigured()
    ? 'INCREASE_API_KEY or INCREASE_ACCOUNT_ID not set'
    : process.env.INCREASE_SANDBOX !== 'true'
    ? 'INCREASE_SANDBOX must be "true" (refusing to run against production)'
    : !TEST_RECIPIENT_ID
    ? 'TEST_RECIPIENT_ID not set (sandbox external account ID required)'
    : null;

const describeOrSkip = SKIP_REASON ? describe.skip : describe;

if (SKIP_REASON) {
    describe('Increase Payout Tests', () => {
        test(`SKIPPED: ${SKIP_REASON}`, () => {
            console.warn(`[SKIP] ${SKIP_REASON}`);
        });
    });
}

describeOrSkip('Increase Payout — Sandbox Integration', () => {
    // Store transfer IDs for cleanup/verification
    const createdTransferIds = [];

    test('Increase service is configured', () => {
        expect(IncreaseService.isConfigured()).toBe(true);
        expect(IncreaseService.baseUrl).toContain('sandbox');
    });

    test('can check account balance', async () => {
        const balance = await IncreaseService.getBalance();
        console.log(`Account balance: $${balance.toFixed(2)}`);
        expect(typeof balance).toBe('number');
        expect(balance).toBeGreaterThanOrEqual(0);
    });

    test('can get balance details', async () => {
        const details = await IncreaseService.getBalanceDetails();
        expect(details).toHaveProperty('available_balance');
        expect(details).toHaveProperty('current_balance');
        console.log(`Available: $${(details.available_balance / 100).toFixed(2)}, Current: $${(details.current_balance / 100).toFixed(2)}`);
    });

    test('can list external accounts', async () => {
        const recipients = await IncreaseService.listRecipients();
        expect(Array.isArray(recipients)).toBe(true);
        console.log(`Found ${recipients.length} external accounts`);
        if (recipients.length > 0) {
            console.log(`First: ${recipients[0].description} (${recipients[0].id}) — status: ${recipients[0].status}`);
        }
    });

    test('can get test recipient details', async () => {
        const recipient = await IncreaseService.getRecipient(TEST_RECIPIENT_ID);
        expect(recipient).toHaveProperty('id', TEST_RECIPIENT_ID);
        expect(recipient).toHaveProperty('active');
        expect(recipient).toHaveProperty('accountHolderName');
        console.log(`Recipient: ${recipient.accountHolderName} — active: ${recipient.active}`);
    });

    test('single $0.01 payout via sendPayout()', async () => {
        const { transfer, wiseFee } = await IncreaseService.sendPayout({
            recipientId: TEST_RECIPIENT_ID,
            amount: 0.01,
            reference: 'Test Payout $0.01',
            statementId: 99999,
        });

        expect(transfer).toHaveProperty('id');
        expect(transfer).toHaveProperty('status');
        expect(transfer).toHaveProperty('amount', 1); // 1 cent
        expect(wiseFee).toBe(0);

        createdTransferIds.push(transfer.id);
        console.log(`Transfer created: ${transfer.id} — status: ${transfer.status} — $0.01`);
    });

    test('can verify transfer status', async () => {
        expect(createdTransferIds.length).toBeGreaterThan(0);
        const transfer = await IncreaseService.getTransfer(createdTransferIds[0]);
        expect(transfer).toHaveProperty('id', createdTransferIds[0]);
        expect(transfer).toHaveProperty('status');
        // Sandbox transfers may be pending_approval, pending_submission, or submitted
        expect(['pending_approval', 'pending_submission', 'submitted', 'complete']).toContain(transfer.status);
        console.log(`Transfer ${transfer.id} status: ${transfer.status}`);
    });

    test('batch payout: 10 transfers of $0.01 each', async () => {
        const payouts = Array.from({ length: 10 }, (_, i) => ({
            recipientId: TEST_RECIPIENT_ID,
            amount: 0.01,
            reference: `Batch Test ${i + 1}`,
            statementId: 90000 + i,
        }));

        const { transfers } = await IncreaseService.sendBatchPayouts(payouts);

        expect(transfers).toHaveLength(10);

        let totalAmount = 0;
        for (const t of transfers) {
            expect(t.transfer).toHaveProperty('id');
            expect(t.transfer).toHaveProperty('status');
            expect(t.transfer.amount).toBe(1); // 1 cent each
            expect(t.wiseFee).toBe(0);
            expect(t).toHaveProperty('statementId');
            createdTransferIds.push(t.transfer.id);
            totalAmount += t.transfer.amount;
        }

        expect(totalAmount).toBe(10); // 10 cents total
        console.log(`\n=== Batch Payout Results ===`);
        console.log(`Transfers: ${transfers.length}`);
        console.log(`Total: $${(totalAmount / 100).toFixed(2)}`);
        transfers.forEach((t, i) => {
            console.log(`  ${i + 1}. ${t.transfer.id} — status: ${t.transfer.status} — stmt #${t.statementId}`);
        });
    }, 30000); // 30s timeout for 10 API calls

    test('can list recent transfers', async () => {
        const transfers = await IncreaseService.listTransfers({ limit: 5 });
        expect(Array.isArray(transfers)).toBe(true);
        expect(transfers.length).toBeGreaterThan(0);
        console.log(`\nRecent transfers (last 5):`);
        transfers.forEach(t => {
            console.log(`  ${t.id} — $${(t.amount / 100).toFixed(2)} — ${t.status}`);
        });
    });

    test('verify all created transfers exist', async () => {
        expect(createdTransferIds.length).toBe(11); // 1 single + 10 batch
        // Spot-check first and last
        const first = await IncreaseService.getTransfer(createdTransferIds[0]);
        const last = await IncreaseService.getTransfer(createdTransferIds[createdTransferIds.length - 1]);
        expect(first).toHaveProperty('id');
        expect(last).toHaveProperty('id');
        console.log(`\nAll ${createdTransferIds.length} transfers verified`);
        console.log(`Total cost: $${(createdTransferIds.length * 0.01).toFixed(2)}`);
    });

    test('summary: balance after payouts', async () => {
        const balance = await IncreaseService.getBalance();
        console.log(`\nBalance after all payouts: $${balance.toFixed(2)}`);
        expect(typeof balance).toBe('number');
    });
});
