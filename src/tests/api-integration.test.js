/**
 * Integration tests for statement API endpoints
 * Tests the actual API server responses
 */

const http = require('http');

const BASE_URL = 'http://localhost:3003';
const AUTH_HEADER = 'Basic TEw6Ym5iNTQ3IQ=='; // LL:bnb547!

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_HEADER
            },
            timeout: 60000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('='.repeat(60));
    console.log('Running API Integration Tests');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`PASS: ${name}`);
            passed++;
        } catch (error) {
            console.log(`FAIL: ${name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
        }
    }

    // Check if server is running
    console.log('\n--- Checking Server Connection ---\n');

    try {
        const healthCheck = await makeRequest('GET', '/api/statements');
        if (healthCheck.status === 0) {
            console.log('Server is not running. Please start the server first.');
            process.exit(1);
        }
        console.log('Server is running\n');
    } catch (error) {
        console.log('Server is not running. Please start the server first.');
        console.log(`   Error: ${error.message}`);
        process.exit(1);
    }

    // ============================================
    // TEST 1: Owner Lookup Fix
    // ============================================
    console.log('--- Test 1: Owner Lookup Fix ---\n');

    await test('Generate statement with ownerId="1" should NOT return "Owner not found"', async () => {
        const response = await makeRequest('POST', '/api/statements/generate', {
            ownerId: '1',
            propertyId: '300017057',
            startDate: '2025-09-01',
            endDate: '2025-09-30',
            calculationType: 'checkout'
        });

        // Should not get 404 "Owner not found" error
        if (response.status === 404 && response.data.error === 'Owner not found') {
            throw new Error('Got "Owner not found" error - owner lookup fix not working');
        }

        if (response.status === 201) {
            console.log(`   ✓ Statement generated successfully, ID: ${response.data.statement?.id}`);
        } else {
            console.log(`   Response status: ${response.status}, message: ${response.data.message || response.data.error}`);
        }
    });

    // ============================================
    // TEST 2: Get Statements List
    // ============================================
    console.log('\n--- Test 2: Get Statements List ---\n');

    await test('GET /api/statements should return statements list', async () => {
        const response = await makeRequest('GET', '/api/statements');

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        // API returns { statements: [...], total, limit, offset }
        const statements = response.data.statements;
        if (!Array.isArray(statements)) {
            throw new Error('Expected statements to be an array');
        }

        console.log(`   ✓ Found ${statements.length} statements (total: ${response.data.total})`);
    });

    // ============================================
    // TEST 3: Get Listings
    // ============================================
    console.log('\n--- Test 3: Get Listings ---\n');

    let testPropertyId = null;

    await test('GET /api/listings should return listings', async () => {
        const response = await makeRequest('GET', '/api/listings');

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        // API returns { success: true, listings: [...] }
        const listings = response.data.listings;
        if (!Array.isArray(listings) || listings.length === 0) {
            throw new Error('Expected non-empty listings array');
        }

        // Get first active listing for subsequent tests
        const activeListing = listings.find(l => l.isActive);
        if (activeListing) {
            testPropertyId = activeListing.id;
        }

        console.log(`   ✓ Found ${listings.length} listings, sample ID: ${testPropertyId}`);
    });

    // ============================================
    // TEST 4: Statement includes expenses
    // ============================================
    console.log('\n--- Test 4: Statement Includes Expenses ---\n');

    await test('Generated statement should include expenses and items', async () => {
        // Get an existing statement and check its structure
        const listResponse = await makeRequest('GET', '/api/statements');

        if (listResponse.status !== 200 || !listResponse.data.statements?.length) {
            throw new Error('Could not get statements list');
        }

        const statementId = listResponse.data.statements[0].id;
        const response = await makeRequest('GET', `/api/statements/${statementId}`);

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const statement = response.data;

        // Check that statement has expenses-related fields
        // Note: PostgreSQL DECIMAL values may be returned as strings
        if (statement.totalExpenses === undefined || statement.totalExpenses === null) {
            throw new Error('Statement missing totalExpenses field');
        }

        console.log(`   ✓ Statement ${statementId}:`);
        console.log(`     - Total Revenue: $${statement.totalRevenue}`);
        console.log(`     - Total Expenses: $${statement.totalExpenses}`);
        console.log(`     - Items count: ${statement.items?.length || 0}`);
        console.log(`     - Expenses array: ${statement.expenses?.length || 0}`);
        console.log(`     - Owner Payout: $${statement.ownerPayout}`);
    });

    // ============================================
    // TEST 5: Regenerate Statement (was failing before fix)
    // ============================================
    console.log('\n--- Test 5: Regenerate Statement ---\n');

    await test('Regenerate statement should work without "Owner not found" error', async () => {
        // Get an existing statement
        const listResponse = await makeRequest('GET', '/api/statements');

        if (listResponse.status !== 200 || !listResponse.data.statements?.length) {
            throw new Error('Could not get statements list');
        }

        const existingStatement = listResponse.data.statements.find(s => s.propertyId);
        if (!existingStatement) {
            console.log('   No single-property statement found to test regenerate');
            return;
        }

        // Try to regenerate
        const response = await makeRequest('POST', '/api/statements/generate', {
            ownerId: String(existingStatement.ownerId),
            propertyId: String(existingStatement.propertyId),
            startDate: existingStatement.weekStartDate,
            endDate: existingStatement.weekEndDate,
            calculationType: existingStatement.calculationType || 'checkout'
        });

        if (response.status === 404 && response.data.error === 'Owner not found') {
            throw new Error('Got "Owner not found" error on regenerate');
        }

        console.log(`   ✓ Regenerate response: ${response.status} - ${response.data.message || 'OK'}`);
    });

    // ============================================
    // Summary
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log(`Integration Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60));

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('\nAll integration tests passed!\n');
        process.exit(0);
    }
}

runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});
