/**
 * Unit tests for the ACH cancel path in IncreaseService.
 *
 * These mock axios entirely — no sandbox or network needed — because the
 * behaviour that matters here is selection (which transfers are cancelable),
 * pagination (not acting on a partial list silently), and failure handling
 * (a submitted transfer must not abort a batch cancel).
 *
 * Run: npx jest increase-cancel.jest.test.js
 */

jest.mock('axios');
const axios = require('axios');

const mockGet = jest.fn();
const mockPost = jest.fn();
axios.create = jest.fn(() => ({ get: mockGet, post: mockPost }));

const IncreaseService = require('../services/IncreaseService');

// The service reads these in its constructor; the singleton is already built,
// so set them on the instance directly.
IncreaseService.apiKey = 'test-key';
IncreaseService.accountId = 'account_test';

const transfer = (id, status, amount) => ({
    id,
    status,
    amount,
    external_account_id: 'ext_1',
    statement_descriptor: 'Payout',
    created_at: '2026-07-20T10:00:00Z',
});

beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
});

describe('listPendingTransfers', () => {
    test('keeps only transfers Increase can still cancel', async () => {
        mockGet.mockResolvedValue({
            data: {
                data: [
                    transfer('ach_1', 'pending_approval', 10000),
                    transfer('ach_2', 'pending_submission', 25000),
                    transfer('ach_3', 'submitted', 5000),
                    transfer('ach_4', 'returned', 7000),
                    transfer('ach_5', 'canceled', 8000),
                ],
                next_cursor: null,
            },
        });

        const { pending, scanned } = await IncreaseService.listPendingTransfers();

        expect(scanned).toBe(5);
        expect(pending.map(t => t.id)).toEqual(['ach_1', 'ach_2']);
    });

    test('tags negative amounts as inbound funding pulls, positives as payouts', async () => {
        mockGet.mockResolvedValue({
            data: {
                data: [
                    transfer('ach_payout', 'pending_submission', 15000),
                    transfer('ach_funding', 'pending_submission', -500000),
                ],
                next_cursor: null,
            },
        });

        const { pending } = await IncreaseService.listPendingTransfers();
        const byId = Object.fromEntries(pending.map(t => [t.id, t]));

        expect(byId.ach_payout.direction).toBe('payout');
        expect(byId.ach_payout.amountDollars).toBe(150);
        expect(byId.ach_funding.direction).toBe('funding_pull');
        expect(byId.ach_funding.amountDollars).toBe(5000);
    });

    test('follows the cursor across pages', async () => {
        mockGet
            .mockResolvedValueOnce({
                data: { data: [transfer('ach_1', 'pending_submission', 100)], next_cursor: 'cur_2' },
            })
            .mockResolvedValueOnce({
                data: { data: [transfer('ach_2', 'pending_submission', 200)], next_cursor: null },
            });

        const { pending, truncated } = await IncreaseService.listPendingTransfers();

        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(mockGet.mock.calls[1][1].params.cursor).toBe('cur_2');
        expect(pending.map(t => t.id)).toEqual(['ach_1', 'ach_2']);
        expect(truncated).toBe(false);
    });

    test('flags truncation instead of pretending the list is complete', async () => {
        mockGet.mockResolvedValue({
            data: { data: [transfer('ach_1', 'pending_submission', 100)], next_cursor: 'always_more' },
        });

        const { truncated } = await IncreaseService.listPendingTransfers({ maxPages: 3 });

        expect(mockGet).toHaveBeenCalledTimes(3);
        expect(truncated).toBe(true);
    });
});

describe('cancelTransfer', () => {
    test('reports success with the resulting status', async () => {
        mockPost.mockResolvedValue({ data: { id: 'ach_1', status: 'canceled' } });

        const result = await IncreaseService.cancelTransfer('ach_1');

        expect(mockPost).toHaveBeenCalledWith('/ach_transfers/ach_1/cancel');
        expect(result).toMatchObject({ canceled: true, transferId: 'ach_1', status: 'canceled' });
    });

    test('returns a reason rather than throwing when Increase refuses', async () => {
        mockPost.mockRejectedValue({
            response: { status: 409, data: { detail: 'Transfer has already been submitted.' } },
        });

        const result = await IncreaseService.cancelTransfer('ach_submitted');

        expect(result.canceled).toBe(false);
        expect(result.reason).toBe('Transfer has already been submitted.');
        expect(result.httpStatus).toBe(409);
    });
});
