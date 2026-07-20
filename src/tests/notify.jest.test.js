/**
 * Ops notify utility — Jest Suite
 *
 * Emails payout-pipeline alerts to the ops team (OPS_ALERT_EMAIL, default
 * devendravariya73@gmail.com). Must be a safe no-op when SMTP is off and must
 * never throw. Run with: npm run test:jest
 */

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

describe('batched payout status changes', () => {
    beforeEach(() => { EmailService.isConfigured = true; process.env.OPS_ALERT_EMAIL = 'ops@x.com'; });
    afterEach(async () => { await flushStatusChanges(); EmailService.sendOpsAlert.mockClear(); });

    test('multiple queued changes flush as ONE combined email', async () => {
        queuePayoutStatusChange({ id: 8585, prev: 'awaiting_funding', next: 'paid', amount: 7132.87, property: '58th Ave' });
        queuePayoutStatusChange({ id: 8716, prev: 'awaiting_funding', next: 'paid', amount: 1664.10, property: 'Merion' });
        queuePayoutStatusChange({ id: 8743, prev: 'pending', next: 'failed', amount: 4941.26, property: '58th Ave', error: 'no funds' });
        await flushStatusChanges();

        expect(EmailService.sendOpsAlert).toHaveBeenCalledTimes(1);
        const [, subject, body] = EmailService.sendOpsAlert.mock.calls[0];
        expect(subject).toContain('[ERROR]');           // any failure escalates the batch
        expect(subject).toContain('3 payout status changes');
        expect(body).toContain('#8585');
        expect(body).toContain('#8716');
        expect(body).toContain('#8743');
        expect(body).toContain('no funds');
        expect(body).toMatch(/PAID — 2 payout/);
        expect(body).toMatch(/FAILED — 1 payout/);
    });

    test('flush with an empty buffer sends nothing', async () => {
        await flushStatusChanges();
        expect(EmailService.sendOpsAlert).not.toHaveBeenCalled();
    });
});
