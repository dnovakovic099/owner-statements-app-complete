/**
 * Ops notify utility — Jest Suite
 *
 * Emails payout-pipeline alerts to the ops team (OPS_ALERT_EMAIL, default
 * devendravariya73@gmail.com). Must be a safe no-op when SMTP is off and must
 * never throw. Run with: npm run test:jest
 */

// Isolate the digest buffer to a throwaway file so tests never touch data/.
const path = require('path');
const fs = require('fs');
const os = require('os');
process.env.PAYOUT_DIGEST_BUFFER_FILE = path.join(os.tmpdir(), `payout-digest-test-${process.pid}.json`);

jest.mock('../services/EmailService', () => ({
    isConfigured: true,
    sendOpsAlert: jest.fn().mockResolvedValue({ messageId: 'test' }),
}));

const EmailService = require('../services/EmailService');
const { notifyOps, opsRecipients, queuePayoutStatusChange, flushStatusChanges } = require('../utils/notify');

const OLD_ENV = process.env.OPS_ALERT_EMAIL;
afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.OPS_ALERT_EMAIL;
    else process.env.OPS_ALERT_EMAIL = OLD_ENV;
    EmailService.sendOpsAlert.mockClear();
    EmailService.isConfigured = true;
});

describe('opsRecipients', () => {
    test('defaults to the ops team (Devendra + Ferdy) when env unset', () => {
        delete process.env.OPS_ALERT_EMAIL;
        expect(opsRecipients()).toEqual(['devendravariya73@gmail.com', 'ferdinand@luxurylodgingpm.com']);
    });
    test('env override is comma-split, trimmed, de-duped', () => {
        process.env.OPS_ALERT_EMAIL = ' a@x.com , b@x.com ,a@x.com ';
        expect(opsRecipients()).toEqual(['a@x.com', 'b@x.com']);
    });
});

describe('notifyOps', () => {
    test('sends one email to all recipients with level in the subject', async () => {
        process.env.OPS_ALERT_EMAIL = 'devendravariya73@gmail.com,ferdy@example.com';
        await notifyOps({ title: 'Payouts stuck', text: 'body line', level: 'warn', fields: [{ label: 'Count', value: '13' }] });
        expect(EmailService.sendOpsAlert).toHaveBeenCalledTimes(1);
        const [to, subject, body] = EmailService.sendOpsAlert.mock.calls[0];
        expect(to).toBe('devendravariya73@gmail.com,ferdy@example.com');
        expect(subject).toBe('[WARN] Payouts stuck');
        expect(body).toContain('body line');
        expect(body).toContain('Count: 13');
    });

    test('no-op (no send) when SMTP is not configured', async () => {
        EmailService.isConfigured = false;
        await notifyOps({ title: 'x' });
        expect(EmailService.sendOpsAlert).not.toHaveBeenCalled();
    });

    test('never throws when the email send rejects', async () => {
        EmailService.sendOpsAlert.mockRejectedValueOnce(new Error('smtp down'));
        await expect(notifyOps({ title: 'x' })).resolves.toBeUndefined();
    });
});

describe('end-of-day payout digest', () => {
    beforeEach(() => { EmailService.isConfigured = true; process.env.OPS_ALERT_EMAIL = 'ops@x.com'; });
    afterEach(async () => { await flushStatusChanges(); EmailService.sendOpsAlert.mockClear(); });
    afterAll(() => { try { fs.unlinkSync(process.env.PAYOUT_DIGEST_BUFFER_FILE); } catch (_) {} });

    test('a full day of changes flushes as ONE combined digest email', async () => {
        queuePayoutStatusChange({ id: 8585, prev: 'awaiting_funding', next: 'paid', amount: 7132.87, property: '58th Ave' });
        queuePayoutStatusChange({ id: 8716, prev: 'awaiting_funding', next: 'paid', amount: 1664.10, property: 'Merion' });
        queuePayoutStatusChange({ id: 8743, prev: 'pending', next: 'failed', amount: 4941.26, property: '58th Ave', error: 'no funds' });
        await flushStatusChanges();

        expect(EmailService.sendOpsAlert).toHaveBeenCalledTimes(1);
        const [, subject, body, html] = EmailService.sendOpsAlert.mock.calls[0];
        // Failures escalate the subject; count + total appear for a scannable summary.
        expect(subject).toContain('[ACTION NEEDED]');
        expect(subject).toContain('3 updates');
        expect(subject).toContain('Payout digest');
        // Plain-text fallback still lists every payout, grouped by status.
        expect(body).toContain('#8585');
        expect(body).toContain('#8716');
        expect(body).toContain('#8743');
        expect(body).toContain('no funds');
        expect(body).toMatch(/PAID — 2 payout/);
        expect(body).toMatch(/FAILED — 1 payout/);
        // The HTML digest is present and includes the amounts/statement ids.
        expect(html).toBeTruthy();
        expect(html).toContain('Daily payout digest');
        expect(html).toContain('#8585');
        expect(html).toContain('7,132.87');
    });

    test('no changes means no email (empty buffer is a no-op)', async () => {
        await flushStatusChanges();
        expect(EmailService.sendOpsAlert).not.toHaveBeenCalled();
    });

    test('queued changes survive a fresh module load (persisted to disk)', async () => {
        queuePayoutStatusChange({ id: 9001, prev: 'pending', next: 'paid', amount: 100, property: 'Persisted' });
        jest.resetModules();
        // Re-require the module: it should load the persisted buffer from disk.
        const reloaded = require('../utils/notify');
        expect(reloaded.pendingDigestCount()).toBeGreaterThanOrEqual(1);
        await reloaded.flushStatusChanges();
    });
});
