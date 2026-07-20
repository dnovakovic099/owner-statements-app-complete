/**
 * Statement payout-status change notification hook — Jest Suite
 *
 * The Statement model's afterUpdate hook emails an ops alert whenever
 * payoutStatus changes to a meaningful state (paid/failed/awaiting_funding/...).
 * Transient internal states (pending/queued) are skipped. Run: npm run test:jest
 */

jest.mock('../utils/notify', () => ({
    notifyOpsAsync: jest.fn(),
    notifyOps: jest.fn(),
    opsRecipients: jest.fn(() => ['devendravariya73@gmail.com']),
}));

const notify = require('../utils/notify');
const Statement = require('../models/Statement');

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

afterEach(() => notify.notifyOpsAsync.mockClear());

describe('Statement afterUpdate payout notification', () => {
    test('notifies on awaiting_funding -> paid (success)', async () => {
        await runAfterUpdate(fakeInstance());
        expect(notify.notifyOpsAsync).toHaveBeenCalledTimes(1);
        const arg = notify.notifyOpsAsync.mock.calls[0][0];
        expect(arg.title).toContain('#8585');
        expect(arg.title).toContain('paid');
        expect(arg.level).toBe('success');
    });

    test('notifies on -> failed with error field and error level', async () => {
        await runAfterUpdate(fakeInstance({ payoutStatus: 'failed', _prev: 'pending', payoutError: 'insufficient funds' }));
        expect(notify.notifyOpsAsync).toHaveBeenCalledTimes(1);
        const arg = notify.notifyOpsAsync.mock.calls[0][0];
        expect(arg.level).toBe('error');
        expect(JSON.stringify(arg.fields)).toContain('insufficient funds');
    });

    test('does NOT notify when payoutStatus did not change', async () => {
        await runAfterUpdate(fakeInstance({ changed: () => false }));
        expect(notify.notifyOpsAsync).not.toHaveBeenCalled();
    });

    test.each(['pending', 'queued'])('does NOT notify for transient state %p', async (state) => {
        await runAfterUpdate(fakeInstance({ payoutStatus: state }));
        expect(notify.notifyOpsAsync).not.toHaveBeenCalled();
    });

    test('does NOT notify when a non-payout field changed', async () => {
        await runAfterUpdate(fakeInstance({ changed: (f) => f === 'ownerName' }));
        expect(notify.notifyOpsAsync).not.toHaveBeenCalled();
    });
});
