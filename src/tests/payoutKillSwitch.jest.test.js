/**
 * Payout master kill-switch — Jest Suite
 *
 * Covers the flag itself (utils/featureFlags) and the two express guards
 * (middleware/payoutsEnabled). The behaviour that matters most is the default:
 * payouts are OFF unless a stored `true` says otherwise. A missing row, a
 * garbled value, or an unreachable database must all leave the feature off —
 * these transfers are irreversible ACH, so "unsure" has to mean "don't send".
 *
 * Run with: npm run test:jest
 */

// AppConfig pulls in config/database (and therefore sequelize + a real
// connection attempt), so stub the model outright — these tests are about the
// flag's decision logic, not persistence.
jest.mock('../models/AppConfig', () => ({
    findOne: jest.fn(),
    upsert: jest.fn().mockResolvedValue([{}, true]),
    sync: jest.fn().mockResolvedValue(undefined),
}));

const AppConfig = require('../models/AppConfig');
const featureFlags = require('../utils/featureFlags');
const { requirePayoutsEnabled, requirePayoutsEnabledPage } = require('../middleware/payoutsEnabled');

/** Minimal express res double capturing status/json/send. */
function mockRes() {
    return {
        statusCode: null,
        body: null,
        html: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        send(html) { this.html = html; return this; },
    };
}

beforeEach(() => {
    featureFlags.clearCache();
    AppConfig.findOne.mockReset();
    AppConfig.upsert.mockReset().mockResolvedValue([{}, true]);
    AppConfig.sync.mockReset().mockResolvedValue(undefined);
});

describe('isPayoutsEnabled defaults', () => {
    test('no stored row means DISABLED — a fresh environment never pays out', async () => {
        AppConfig.findOne.mockResolvedValue(null);
        await expect(featureFlags.isPayoutsEnabled()).resolves.toBe(false);
    });

    test('fails closed: a database error leaves payouts off', async () => {
        AppConfig.findOne.mockRejectedValue(new Error('connection refused'));
        await expect(featureFlags.isPayoutsEnabled()).resolves.toBe(false);
    });

    test('only an explicit true enables', async () => {
        AppConfig.findOne.mockResolvedValue({ value: true });
        await expect(featureFlags.isPayoutsEnabled()).resolves.toBe(true);
    });

    test('a stringified "true" from an older row or manual edit also enables', async () => {
        AppConfig.findOne.mockResolvedValue({ value: 'true' });
        await expect(featureFlags.isPayoutsEnabled()).resolves.toBe(true);
    });

    test('an explicit false disables', async () => {
        AppConfig.findOne.mockResolvedValue({ value: false });
        await expect(featureFlags.isPayoutsEnabled()).resolves.toBe(false);
    });

    test('a garbled value is treated as off, not as truthy', async () => {
        AppConfig.findOne.mockResolvedValue({ value: 'maybe' });
        await expect(featureFlags.isPayoutsEnabled()).resolves.toBe(false);
    });
});

describe('caching', () => {
    test('repeated reads inside the TTL hit the database once', async () => {
        AppConfig.findOne.mockResolvedValue({ value: true });
        await featureFlags.isPayoutsEnabled();
        await featureFlags.isPayoutsEnabled();
        await featureFlags.isPayoutsEnabled();
        expect(AppConfig.findOne).toHaveBeenCalledTimes(1);
    });

    test('setPayoutsEnabled refreshes the cache immediately — no TTL wait', async () => {
        AppConfig.findOne.mockResolvedValue({ value: true });
        expect(await featureFlags.isPayoutsEnabled()).toBe(true);

        await featureFlags.setPayoutsEnabled(false);

        // Still the stale row in the DB double; the write-through cache must win.
        expect(await featureFlags.isPayoutsEnabled()).toBe(false);
        expect(AppConfig.upsert).toHaveBeenCalledWith({ key: 'payouts_enabled', value: false });
    });

    test('setPayoutsEnabled coerces to a strict boolean', async () => {
        await featureFlags.setPayoutsEnabled('yes');
        expect(AppConfig.upsert).toHaveBeenCalledWith({ key: 'payouts_enabled', value: true });
    });

    test('the sync reader reads off before any async read lands', () => {
        expect(featureFlags.payoutsEnabledCached()).toBe(false);
    });

    test('the sync reader tracks the last async read', async () => {
        AppConfig.findOne.mockResolvedValue({ value: true });
        await featureFlags.isPayoutsEnabled();
        expect(featureFlags.payoutsEnabledCached()).toBe(true);
    });
});

describe('requirePayoutsEnabled (JSON API)', () => {
    test('calls next when payouts are on', async () => {
        AppConfig.findOne.mockResolvedValue({ value: true }); // explicitly enabled
        const next = jest.fn();
        const res = mockRes();
        await requirePayoutsEnabled({}, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
    });

    test('403s with a machine-readable code when payouts are off', async () => {
        AppConfig.findOne.mockResolvedValue({ value: false });
        const next = jest.fn();
        const res = mockRes();
        await requirePayoutsEnabled({}, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('PAYOUTS_DISABLED');
    });
});

describe('requirePayoutsEnabledPage (owner-facing HTML)', () => {
    test('passes through when payouts are on', async () => {
        AppConfig.findOne.mockResolvedValue({ value: true }); // explicitly enabled
        const next = jest.fn();
        const res = mockRes();
        await requirePayoutsEnabledPage({}, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('serves an owner-friendly page, not JSON, when payouts are off', async () => {
        AppConfig.findOne.mockResolvedValue({ value: false });
        const next = jest.fn();
        const res = mockRes();
        await requirePayoutsEnabledPage({}, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(503);
        expect(res.html).toContain('Temporarily Unavailable');
        // No operator jargon or internal codes on a page a property owner sees.
        expect(res.html).not.toContain('PAYOUTS_DISABLED');
    });
});
