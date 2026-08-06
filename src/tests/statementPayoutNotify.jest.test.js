/**
 * Statement payout-status change notification hook — Jest Suite
 *
 * The Statement model's afterUpdate hook QUEUES a payout-status change (which the
 * notifier later flushes as one combined email) whenever payoutStatus changes to
 * a meaningful state. Transient states (pending/queued) are skipped.
 * Run: npm run test:jest
 */

jest.mock('../utils/notify', () => ({
    notifyOpsAsync: jest.fn(),
    notifyOps: jest.fn(),
    opsRecipients: jest.fn(() => ['devendravariya73@gmail.com']),
    queuePayoutStatusChange: jest.fn(),
    flushStatusChanges: jest.fn(),
}));

const notify = require('../utils/notify');
const Statement = require('../models/Statement');
const featureFlags = require('../utils/featureFlags');

// The hook is gated on the payout kill-switch, which defaults to OFF. In a live
// process the cached flag is always warm by the time a payout status changes —
// every path that can move one (the cron ticks, the /api/payouts guard) reads
// the flag first. Tests call the hook directly, so warm the cache by hand.
beforeEach(() => {
    jest.spyOn(featureFlags, 'payoutsEnabledCached').mockReturnValue(true);
});
afterAll(() => jest.restoreAllMocks());

// Minimal Sequelize-instance stand-in with the changed()/previous() API the hook uses.
const fakeInstance = (overrides = {}) => ({
    id: 8585,
    payoutStatus: 'paid',
    ownerPayout: 7132.87,
    propertyName: '58th Ave. N',
    ownerName: 'Tom',
    payoutError: null,
    _prev: 'awaiting_funding',
    changed(field) { return field === 'payoutStatus'; },
    previous(field) { return field === 'payoutStatus' ? this._prev : undefined; },
    ...overrides,
});

const runAfterUpdate = (instance) => Statement.runHooks('afterUpdate', instance, {});

afterEach(() => notify.queuePayoutStatusChange.mockClear());

describe('Statement afterUpdate queues payout status change', () => {
    test('queues on awaiting_funding -> paid with full payload', async () => {
        await runAfterUpdate(fakeInstance());
        expect(notify.queuePayoutStatusChange).toHaveBeenCalledTimes(1);
        const arg = notify.queuePayoutStatusChange.mock.calls[0][0];
        expect(arg).toMatchObject({ id: 8585, prev: 'awaiting_funding', next: 'paid', amount: 7132.87, property: '58th Ave. N' });
    });

    test('queues on -> failed and carries the payout error', async () => {
        await runAfterUpdate(fakeInstance({ payoutStatus: 'failed', _prev: 'pending', payoutError: 'insufficient funds' }));
        expect(notify.queuePayoutStatusChange).toHaveBeenCalledTimes(1);
        expect(notify.queuePayoutStatusChange.mock.calls[0][0]).toMatchObject({ next: 'failed', error: 'insufficient funds' });
    });

    test('does NOT queue when payoutStatus did not change', async () => {
        await runAfterUpdate(fakeInstance({ changed: () => false }));
        expect(notify.queuePayoutStatusChange).not.toHaveBeenCalled();
    });

    test.each(['pending', 'queued'])('does NOT queue for transient state %p', async (state) => {
        await runAfterUpdate(fakeInstance({ payoutStatus: state }));
        expect(notify.queuePayoutStatusChange).not.toHaveBeenCalled();
    });

    test('does NOT queue when a non-payout field changed', async () => {
        await runAfterUpdate(fakeInstance({ changed: (f) => f === 'ownerName' }));
        expect(notify.queuePayoutStatusChange).not.toHaveBeenCalled();
    });

    test('does NOT queue while the payout kill-switch is off', async () => {
        featureFlags.payoutsEnabledCached.mockReturnValue(false);
        await runAfterUpdate(fakeInstance());
        expect(notify.queuePayoutStatusChange).not.toHaveBeenCalled();
    });
});
