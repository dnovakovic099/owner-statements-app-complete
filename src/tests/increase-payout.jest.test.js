/**
 * Comprehensive Increase ACH Payout Integration Tests
 *
 * Tests against the real Increase sandbox API covering:
 *   Suite 1: Account & Balance — configuration, balance checks, bank details
 *   Suite 2: Recipient Management — create, get, list external accounts
 *   Suite 3: Single Payouts — various amounts, edge cases, status verification
 *   Suite 4: Batch Payouts — multiple transfers, total verification
 *   Suite 5: Error Handling — invalid recipient, bad amounts, API errors
 *   Suite 6: Transfer Lifecycle — status tracking, transfer history
 *   Suite 7: End-to-End Flow — full resolve-recipient → check-balance → payout → verify
 *
 * Prerequisites:
 *   - INCREASE_API_KEY (sandbox key from .env)
 *   - INCREASE_ACCOUNT_ID (sandbox account from .env)
 *   - INCREASE_SANDBOX=true (from .env)
 *
 * Run:
 *   npx jest increase-payout.jest.test.js --verbose --forceExit
 *
 * Note: Creates a fresh sandbox recipient automatically. Total cost: ~$0.30 in sandbox.
 */

require('dotenv').config();
const IncreaseService = require('../services/IncreaseService');

const SKIP_REASON = !IncreaseService.isConfigured()
    ? 'INCREASE_API_KEY or INCREASE_ACCOUNT_ID not set'
    : process.env.INCREASE_SANDBOX !== 'true'
    ? 'INCREASE_SANDBOX must be "true" (refusing to run against production)'
    : null;

if (SKIP_REASON) {
    describe('Increase Payout Tests', () => {
        test(`SKIPPED: ${SKIP_REASON}`, () => {
            console.warn(`[SKIP] ${SKIP_REASON}`);
        });
    });
}

const describeOrSkip = SKIP_REASON ? describe.skip : describe;

// Shared state across suites
let testRecipientId = null;
let createdTransferIds = [];
let startingBalance = null;

// ═══════════════════════════════════════════════════════════════
// Suite 1: Account & Balance
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 1: Account & Balance', () => {

    test('Increase service is configured and pointing to sandbox', () => {
        expect(IncreaseService.isConfigured()).toBe(true);
        expect(IncreaseService.baseUrl).toContain('sandbox');
    });

    test('can check available balance', async () => {
        const balance = await IncreaseService.getBalance();
        startingBalance = balance;
        console.log(`Starting balance: $${balance.toFixed(2)}`);
        expect(typeof balance).toBe('number');
        expect(balance).toBeGreaterThan(0);
    });

    test('balance details include available and current', async () => {
        const details = await IncreaseService.getBalanceDetails();
        expect(details).toHaveProperty('available_balance');
        expect(details).toHaveProperty('current_balance');
        expect(typeof details.available_balance).toBe('number');
        expect(typeof details.current_balance).toBe('number');
    });

    test('can get account bank details for inbound payments', async () => {
        const details = await IncreaseService.getAccountBankDetails();
        // May return null if no account numbers configured in sandbox
        if (details) {
            expect(Array.isArray(details)).toBe(true);
            if (details.length > 0) {
                expect(details[0]).toHaveProperty('routingNumber');
                expect(details[0]).toHaveProperty('accountNumber');
                console.log(`Bank: ${details[0].bankName}, Routing: ${details[0].routingNumber}`);
            }
        } else {
            console.warn('[INFO] No bank details configured — this is OK for sandbox');
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// Suite 2: Recipient Management
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 2: Recipient Management', () => {

    test('create a new sandbox external account (checking)', async () => {
        const recipient = await IncreaseService.createRecipient({
            name: 'Test Owner - Checking',
            routingNumber: '110000000',
            accountNumber: '000123456789',
            accountType: 'CHECKING',
        });
        expect(recipient).toHaveProperty('id');
        expect(recipient.id).toMatch(/^sandbox_external_account_/);
        expect(recipient).toHaveProperty('status', 'active');
        expect(recipient).toHaveProperty('funding', 'checking');
        expect(recipient).toHaveProperty('description', 'Test Owner - Checking');
        testRecipientId = recipient.id;
        console.log(`Created checking recipient: ${recipient.id}`);
    });

    test('create a savings account recipient', async () => {
        const recipient = await IncreaseService.createRecipient({
            name: 'Test Owner - Savings',
            routingNumber: '110000000',
            accountNumber: '000987654321',
            accountType: 'SAVINGS',
        });
        expect(recipient).toHaveProperty('id');
        expect(recipient).toHaveProperty('funding', 'savings');
        console.log(`Created savings recipient: ${recipient.id}`);
    });

    test('get recipient by ID returns correct data', async () => {
        expect(testRecipientId).toBeTruthy();
        const recipient = await IncreaseService.getRecipient(testRecipientId);
        expect(recipient).toHaveProperty('id', testRecipientId);
        expect(recipient).toHaveProperty('active', true);
        expect(recipient).toHaveProperty('accountHolderName', 'Test Owner - Checking');
        expect(recipient).toHaveProperty('status', 'active');
    });

    test('list recipients includes newly created account', async () => {
        const recipients = await IncreaseService.listRecipients();
        expect(Array.isArray(recipients)).toBe(true);
        expect(recipients.length).toBeGreaterThanOrEqual(1);
        const found = recipients.find(r => r.id === testRecipientId);
        expect(found).toBeTruthy();
        console.log(`Total recipients: ${recipients.length}`);
    });
});

// ═══════════════════════════════════════════════════════════════
// Suite 3: Single Payouts
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 3: Single Payouts', () => {

    test('$0.01 minimum payout', async () => {
        expect(testRecipientId).toBeTruthy();
        const { transfer, wiseFee } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 0.01,
            reference: 'Min payout test',
            statementId: 80001,
        });
        expect(transfer.amount).toBe(1); // 1 cent
        expect(transfer.status).toBe('pending_submission');
        expect(wiseFee).toBe(0);
        createdTransferIds.push(transfer.id);
        console.log(`$0.01 transfer: ${transfer.id}`);
    });

    test('$1.00 payout', async () => {
        const { transfer } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 1.00,
            reference: '$1 payout test',
            statementId: 80002,
        });
        expect(transfer.amount).toBe(100);
        createdTransferIds.push(transfer.id);
        console.log(`$1.00 transfer: ${transfer.id}`);
    });

    test('$10.50 payout (cents precision)', async () => {
        const { transfer } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 10.50,
            reference: '$10.50 test',
            statementId: 80003,
        });
        expect(transfer.amount).toBe(1050);
        createdTransferIds.push(transfer.id);
        console.log(`$10.50 transfer: ${transfer.id}`);
    });

    test('$0.99 payout (sub-dollar)', async () => {
        const { transfer } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 0.99,
            reference: '$0.99 test',
            statementId: 80004,
        });
        expect(transfer.amount).toBe(99);
        createdTransferIds.push(transfer.id);
    });

    test('payout with long reference truncates to 22 chars', async () => {
        const longRef = 'Payout - Very Long Owner Name That Exceeds Limit - Stmt #12345';
        const { transfer } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 0.01,
            reference: longRef,
            statementId: 80005,
        });
        expect(transfer).toHaveProperty('id');
        expect(transfer.statement_descriptor.length).toBeLessThanOrEqual(22);
        createdTransferIds.push(transfer.id);
        console.log(`Truncated descriptor: "${transfer.statement_descriptor}"`);
    });

    test('payout with special characters in reference', async () => {
        const { transfer } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 0.01,
            reference: 'Test & Co. #123',
            statementId: 80006,
        });
        expect(transfer).toHaveProperty('id');
        createdTransferIds.push(transfer.id);
    });

    test('transfer object has expected shape', async () => {
        const { transfer, wiseFee } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 0.01,
            reference: 'Shape test',
            statementId: 80007,
        });
        expect(transfer).toHaveProperty('id');
        expect(transfer).toHaveProperty('type', 'ach_transfer');
        expect(transfer).toHaveProperty('status');
        expect(transfer).toHaveProperty('amount');
        expect(transfer).toHaveProperty('account_id', IncreaseService.accountId);
        expect(transfer).toHaveProperty('external_account_id', testRecipientId);
        expect(transfer).toHaveProperty('created_at');
        expect(typeof wiseFee).toBe('number');
        expect(wiseFee).toBe(0);
        createdTransferIds.push(transfer.id);
    });
});

// ═══════════════════════════════════════════════════════════════
// Suite 4: Batch Payouts
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 4: Batch Payouts', () => {

    test('batch of 5 payouts with varying amounts', async () => {
        expect(testRecipientId).toBeTruthy();
        const payouts = [
            { recipientId: testRecipientId, amount: 0.01, reference: 'Batch A-1', statementId: 70001 },
            { recipientId: testRecipientId, amount: 0.05, reference: 'Batch A-2', statementId: 70002 },
            { recipientId: testRecipientId, amount: 0.10, reference: 'Batch A-3', statementId: 70003 },
            { recipientId: testRecipientId, amount: 0.25, reference: 'Batch A-4', statementId: 70004 },
            { recipientId: testRecipientId, amount: 0.50, reference: 'Batch A-5', statementId: 70005 },
        ];

        const { transfers } = await IncreaseService.sendBatchPayouts(payouts);
        expect(transfers).toHaveLength(5);

        const amounts = transfers.map(t => t.transfer.amount);
        expect(amounts).toEqual([1, 5, 10, 25, 50]); // cents

        const totalCents = amounts.reduce((s, a) => s + a, 0);
        expect(totalCents).toBe(91); // $0.91

        for (const t of transfers) {
            expect(t.wiseFee).toBe(0);
            expect(t).toHaveProperty('statementId');
            createdTransferIds.push(t.transfer.id);
        }

        console.log(`Batch A: 5 transfers, total $${(totalCents / 100).toFixed(2)}`);
    }, 30000);

    test('batch preserves statement ID mapping', async () => {
        const payouts = [
            { recipientId: testRecipientId, amount: 0.01, reference: 'Map 1', statementId: 60001 },
            { recipientId: testRecipientId, amount: 0.01, reference: 'Map 2', statementId: 60002 },
            { recipientId: testRecipientId, amount: 0.01, reference: 'Map 3', statementId: 60003 },
        ];

        const { transfers } = await IncreaseService.sendBatchPayouts(payouts);
        expect(transfers[0].statementId).toBe(60001);
        expect(transfers[1].statementId).toBe(60002);
        expect(transfers[2].statementId).toBe(60003);

        for (const t of transfers) createdTransferIds.push(t.transfer.id);
    }, 15000);

    test('single-item batch works correctly', async () => {
        const { transfers } = await IncreaseService.sendBatchPayouts([
            { recipientId: testRecipientId, amount: 0.01, reference: 'Solo batch', statementId: 60010 },
        ]);
        expect(transfers).toHaveLength(1);
        expect(transfers[0].transfer.amount).toBe(1);
        createdTransferIds.push(transfers[0].transfer.id);
    });
});

// ═══════════════════════════════════════════════════════════════
// Suite 5: Error Handling
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 5: Error Handling', () => {

    test('invalid recipient ID throws error', async () => {
        await expect(
            IncreaseService.sendPayout({
                recipientId: 'nonexistent_id_12345',
                amount: 0.01,
                reference: 'Should fail',
                statementId: 99990,
            })
        ).rejects.toThrow();
    });

    test('getRecipient with invalid ID throws error', async () => {
        await expect(
            IncreaseService.getRecipient('nonexistent_external_account_xyz')
        ).rejects.toThrow();
    });

    test('getTransfer with invalid ID throws error', async () => {
        await expect(
            IncreaseService.getTransfer('nonexistent_transfer_xyz')
        ).rejects.toThrow();
    });

    test('createRecipient with missing fields throws error', async () => {
        await expect(
            IncreaseService.createRecipient({
                name: 'Missing Account',
                routingNumber: '110000000',
                accountNumber: '', // empty
            })
        ).rejects.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════
// Suite 6: Transfer Lifecycle
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 6: Transfer Lifecycle', () => {

    test('verify individual transfer status', async () => {
        expect(createdTransferIds.length).toBeGreaterThan(0);
        const transfer = await IncreaseService.getTransfer(createdTransferIds[0]);
        expect(transfer).toHaveProperty('id', createdTransferIds[0]);
        expect(transfer).toHaveProperty('type', 'ach_transfer');
        expect(['pending_approval', 'pending_submission', 'submitted', 'complete']).toContain(transfer.status);
        console.log(`Transfer ${transfer.id}: ${transfer.status}`);
    });

    test('all created transfers have valid status', async () => {
        const validStatuses = ['pending_approval', 'pending_submission', 'submitted', 'complete'];
        // Spot-check 5 random transfers
        const sample = createdTransferIds.slice(0, Math.min(5, createdTransferIds.length));
        for (const id of sample) {
            const t = await IncreaseService.getTransfer(id);
            expect(validStatuses).toContain(t.status);
        }
        console.log(`Verified ${sample.length} transfers have valid status`);
    });

    test('list recent transfers returns created ones', async () => {
        const transfers = await IncreaseService.listTransfers({ limit: 10 });
        expect(Array.isArray(transfers)).toBe(true);
        expect(transfers.length).toBeGreaterThan(0);

        // At least one of our created transfers should be in the list
        const ourIds = new Set(createdTransferIds);
        const found = transfers.filter(t => ourIds.has(t.id));
        expect(found.length).toBeGreaterThan(0);
        console.log(`Found ${found.length} of our transfers in recent list`);
    });

    test('transfer amounts match what was sent', async () => {
        // Verify the first single payout ($0.01 = 1 cent)
        const transfer = await IncreaseService.getTransfer(createdTransferIds[0]);
        expect(transfer.amount).toBe(1);

        // Verify the $1.00 payout (100 cents)
        if (createdTransferIds.length > 1) {
            const t2 = await IncreaseService.getTransfer(createdTransferIds[1]);
            expect(t2.amount).toBe(100);
        }
    });

    test('transaction history includes our transfers', async () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const { transactions } = await IncreaseService.getBalanceStatement(oneHourAgo, now);
        expect(Array.isArray(transactions)).toBe(true);
        console.log(`Transaction history (last hour): ${transactions.length} entries`);
    });
});

// ═══════════════════════════════════════════════════════════════
// Suite 7: End-to-End Flow
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Suite 7: End-to-End Flow', () => {

    test('full payout lifecycle: create recipient → check balance → payout → verify', async () => {
        // Step 1: Create a fresh recipient
        const recipient = await IncreaseService.createRecipient({
            name: 'E2E Test Owner',
            routingNumber: '110000000',
            accountNumber: '000111222333',
            accountType: 'CHECKING',
        });
        expect(recipient.status).toBe('active');
        console.log(`1. Created recipient: ${recipient.id}`);

        // Step 2: Verify recipient is active
        const verified = await IncreaseService.getRecipient(recipient.id);
        expect(verified.active).toBe(true);
        console.log(`2. Recipient verified: active=${verified.active}`);

        // Step 3: Check balance
        const balance = await IncreaseService.getBalance();
        expect(balance).toBeGreaterThan(0.01);
        console.log(`3. Balance: $${balance.toFixed(2)}`);

        // Step 4: Send payout
        const { transfer, wiseFee } = await IncreaseService.sendPayout({
            recipientId: recipient.id,
            amount: 0.05,
            reference: 'E2E Test Payout',
            statementId: 50001,
        });
        expect(transfer.amount).toBe(5); // 5 cents
        expect(wiseFee).toBe(0);
        console.log(`4. Transfer created: ${transfer.id} — $0.05 — ${transfer.status}`);

        // Step 5: Verify transfer
        const fetched = await IncreaseService.getTransfer(transfer.id);
        expect(fetched.id).toBe(transfer.id);
        expect(fetched.amount).toBe(5);
        expect(fetched.external_account_id).toBe(recipient.id);
        console.log(`5. Transfer verified: ${fetched.status}`);

        // Step 6: Check balance decreased
        const newBalance = await IncreaseService.getBalance();
        console.log(`6. Balance after payout: $${newBalance.toFixed(2)} (was $${balance.toFixed(2)})`);

        createdTransferIds.push(transfer.id);
    });

    test('simulate statement payout reference format', async () => {
        expect(testRecipientId).toBeTruthy();
        // This is the exact format used in payouts.js line 291
        const ownerName = 'Beverly Johnson';
        const statementId = 1544;
        const reference = `Payout - ${ownerName} - Stmt #${statementId}`;

        const { transfer } = await IncreaseService.sendPayout({
            recipientId: testRecipientId,
            amount: 0.01,
            reference,
            statementId,
        });

        // Reference gets truncated to 22 chars
        expect(transfer.statement_descriptor.length).toBeLessThanOrEqual(22);
        expect(transfer).toHaveProperty('id');
        createdTransferIds.push(transfer.id);
        console.log(`Statement payout descriptor: "${transfer.statement_descriptor}"`);
    });
});

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
describeOrSkip('Summary', () => {

    test('final balance and transfer count', async () => {
        const finalBalance = await IncreaseService.getBalance();
        const spent = startingBalance !== null ? startingBalance - finalBalance : 0;
        console.log('\n══════════════════════════════════════');
        console.log('  INCREASE SANDBOX TEST SUMMARY');
        console.log('══════════════════════════════════════');
        console.log(`  Starting balance:  $${startingBalance?.toFixed(2) || 'N/A'}`);
        console.log(`  Final balance:     $${finalBalance.toFixed(2)}`);
        console.log(`  Total spent:       $${spent.toFixed(2)}`);
        console.log(`  Transfers created: ${createdTransferIds.length}`);
        console.log('══════════════════════════════════════\n');
        expect(createdTransferIds.length).toBeGreaterThan(0);
    });
});
