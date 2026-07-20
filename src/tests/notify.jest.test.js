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
const { notifyOps, opsRecipients } = require('../utils/notify');

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
