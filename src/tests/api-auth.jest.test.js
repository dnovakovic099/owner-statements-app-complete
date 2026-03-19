/**
 * API Authentication Integration Tests
 *
 * Tests the full auth flow: login, token verification, token refresh,
 * and access to protected routes with valid tokens.
 *
 * REQUIRES environment variables:
 *   TEST_AUTH_USER - username for an existing account
 *   TEST_AUTH_PASS - password for that account
 *
 * Skips all tests if env vars are not set.
 *
 * Run with:
 *   TEST_AUTH_USER=myuser TEST_AUTH_PASS=mypass npx jest api-auth.jest.test.js --verbose
 *
 * (Excluded from default jest run via jest.config.js testPathIgnorePatterns)
 */

const request = require('supertest');
const app = require('../server');

const TEST_USER = process.env.TEST_AUTH_USER;
const TEST_PASS = process.env.TEST_AUTH_PASS;

const skipMessage = 'Skipping: TEST_AUTH_USER and TEST_AUTH_PASS env vars are not set';
const shouldRun = TEST_USER && TEST_PASS;

// Conditional describe: skip entire suite when credentials are missing
const describeSuite = shouldRun ? describe : describe.skip;

describeSuite('API Authentication Flow', () => {
    let authToken;

    describe('Login', () => {
        test('POST /api/auth/login with valid credentials returns token', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: TEST_USER, password: TEST_PASS });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('token');
            expect(typeof res.body.token).toBe('string');
            expect(res.body.token.length).toBeGreaterThan(0);

            // Validate user object shape
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('username');
            expect(res.body.user).toHaveProperty('role');
            expect(['admin', 'editor', 'viewer']).toContain(res.body.user.role);

            // Store token for subsequent tests
            authToken = res.body.token;
        });
    });

    describe('Token Verification', () => {
        test('POST /api/auth/verify with valid token returns user info', async () => {
            // Ensure we have a token from the login test
            expect(authToken).toBeDefined();

            const res = await request(app)
                .post('/api/auth/verify')
                .send({ token: authToken });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('username', TEST_USER);
            expect(res.body.user).toHaveProperty('role');
        });

        test('POST /api/auth/verify with Bearer header returns user info', async () => {
            expect(authToken).toBeDefined();

            const res = await request(app)
                .post('/api/auth/verify')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('user');
        });
    });

    describe('Token Refresh', () => {
        test('POST /api/auth/refresh with valid token returns new token', async () => {
            expect(authToken).toBeDefined();

            const res = await request(app)
                .post('/api/auth/refresh')
                .send({ token: authToken });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('token');
            expect(typeof res.body.token).toBe('string');
            expect(res.body.token.length).toBeGreaterThan(0);

            // Validate the new token also contains user info
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('username', TEST_USER);
        });
    });

    describe('Protected Route Access with Token', () => {
        test('GET /api/statements with valid token does not return 401', async () => {
            expect(authToken).toBeDefined();

            const res = await request(app)
                .get('/api/statements')
                .set('Authorization', `Bearer ${authToken}`);

            // Should NOT be 401; actual status depends on data (200, 404, etc.)
            expect(res.status).not.toBe(401);
        });

        test('GET /api/listings with valid token does not return 401', async () => {
            expect(authToken).toBeDefined();

            const res = await request(app)
                .get('/api/listings')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).not.toBe(401);
        });

        test('GET /api/groups with valid token does not return 401', async () => {
            expect(authToken).toBeDefined();

            const res = await request(app)
                .get('/api/groups')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).not.toBe(401);
        });

        test('GET /api/analytics/property-financials with valid token does not return 401', async () => {
            expect(authToken).toBeDefined();

            const res = await request(app)
                .get('/api/analytics/property-financials')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).not.toBe(401);
        });
    });

    describe('Invalid Token Rejection', () => {
        test('GET /api/statements with expired/tampered token returns 401', async () => {
            const res = await request(app)
                .get('/api/statements')
                .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJmYWtlIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.invalidsignature');

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });
});

// Print a notice when skipping so it's clear in test output
if (!shouldRun) {
    describe('API Authentication Flow', () => {
        test(skipMessage, () => {
            console.log(`\n  ${skipMessage}\n`);
        });
    });
}
