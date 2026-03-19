/**
 * API Routes Integration Tests
 *
 * Tests that the Express app responds correctly to requests WITHOUT authentication.
 * Validates that:
 *   - Protected routes return 401 without auth
 *   - Login endpoint rejects bad credentials
 *   - Response shapes match expected contracts
 *
 * Run with: npx jest api-routes.jest.test.js --verbose
 * (Excluded from default jest run via jest.config.js testPathIgnorePatterns)
 */

const request = require('supertest');
const app = require('../server');
const { sequelize } = require('../models');

afterAll(async () => {
    await sequelize.close();
});

describe('API Routes - Unauthenticated Access', () => {

    describe('Server responds', () => {
        test('GET /api/nonexistent returns 404 JSON for unknown API routes', async () => {
            const res = await request(app).get('/api/nonexistent');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('Protected routes return 401 without token', () => {
        test('GET /api/statements returns 401', async () => {
            const res = await request(app).get('/api/statements');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/listings returns 401', async () => {
            const res = await request(app).get('/api/listings');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/analytics/property-financials returns 401', async () => {
            const res = await request(app).get('/api/analytics/property-financials');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/groups returns 401', async () => {
            const res = await request(app).get('/api/groups');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/expenses returns 401', async () => {
            const res = await request(app).get('/api/expenses');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/financials returns 401', async () => {
            const res = await request(app).get('/api/financials');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/users returns 401', async () => {
            const res = await request(app).get('/api/users');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/payouts returns 401', async () => {
            const res = await request(app).get('/api/payouts');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/tag-schedules returns 401', async () => {
            const res = await request(app).get('/api/tag-schedules');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        test('GET /api/activity-logs returns 401', async () => {
            const res = await request(app).get('/api/activity-logs');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('Auth endpoint - login validation', () => {
        test('POST /api/auth/login with missing credentials returns 400', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('success', false);
            expect(res.body).toHaveProperty('message');
        });

        test('POST /api/auth/login with bad credentials returns 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'nonexistent_user_xyz', password: 'wrong_password_123' });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('success', false);
        });

        test('POST /api/auth/login accepts JSON content type', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set('Content-Type', 'application/json')
                .send({ username: 'test', password: 'test' });
            // Should be 401 (bad creds) not 415 (unsupported media) or 500
            expect([400, 401]).toContain(res.status);
        });
    });

    describe('Auth endpoint - token verification', () => {
        test('POST /api/auth/verify with no token returns 401', async () => {
            const res = await request(app)
                .post('/api/auth/verify')
                .send({});
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('success', false);
        });

        test('POST /api/auth/verify with invalid token returns 401 or 429', async () => {
            const res = await request(app)
                .post('/api/auth/verify')
                .send({ token: 'invalid.jwt.token' });
            expect([401, 429]).toContain(res.status);
        });

        test('POST /api/auth/refresh with no token returns 401 or 429', async () => {
            const res = await request(app)
                .post('/api/auth/refresh')
                .send({});
            expect([401, 429]).toContain(res.status);
        });
    });

    describe('Response shape validation', () => {
        test('401 responses include an error field', async () => {
            const routes = [
                '/api/statements',
                '/api/listings',
                '/api/groups',
                '/api/analytics/property-financials',
            ];

            for (const route of routes) {
                const res = await request(app).get(route);
                expect(res.status).toBe(401);
                expect(res.body).toBeDefined();
                expect(typeof res.body.error).toBe('string');
            }
        });

        test('Auth failure responses include error info', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'bad', password: 'bad' });
            // May get rate-limited (429) or auth failure (401)
            expect([401, 429]).toContain(res.status);
            expect(res.body).toBeDefined();
        });
    });
});
