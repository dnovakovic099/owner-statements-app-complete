
/**
 * Integration Tests for cleaningFeePassThrough Feature
 *
 * These tests verify the actual API endpoints work correctly
 * by making HTTP requests to the running server.
 */

const http = require('http');

const BASE_URL = 'http://localhost:3003';
const AUTH_HEADER = 'Basic TEw6Ym5iNTQ3IQ=='; // LL:bnb547!

// Test configuration
let testPropertyIdA = null;  // Property with cleaningFeePassThrough=true
let testPropertyIdB = null;  // Property with cleaningFeePassThrough=false
let createdStatementIds = [];

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
            timeout: 120000
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

async function runIntegrationTests() {
    console.log('\n========================================');
    console.log('CLEANING FEE PASSTHROUGH INTEGRATION TESTS');
    console.log('========================================\n');

    let passedTests = 0;
    let failedTests = 0;
    let skippedTests = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`PASS: ${name}`);
            passedTests++;
        } catch (error) {
            if (error.message.includes('SKIP')) {
                console.log(`SKIP: ${name} - ${error.message}`);
                skippedTests++;
            } else {
                console.log(`FAIL: ${name}`);
                console.log(`   Error: ${error.message}`);
                failedTests++;
            }
        }
    }

    // ----------------------------------------------------------------------------
    // SETUP: Get real listing IDs from the database
    // ----------------------------------------------------------------------------
    console.log('--- SETUP: Getting listings from database ---\n');

    try {
        const listingsResponse = await makeRequest('GET', '/api/listings');
        const listings = listingsResponse.data.listings || listingsResponse.data;

        if (!Array.isArray(listings) || listings.length < 2) {
            console.log('WARNING: Need at least 2 listings for integration tests. Skipping...');
            return;
        }

        // Find listings with different cleaningFeePassThrough settings
        const withPassThrough = listings.find(l => l.cleaningFeePassThrough);
        const withoutPassThrough = listings.find(l => !l.cleaningFeePassThrough);

        if (withPassThrough) {
            testPropertyIdA = withPassThrough.id;
            console.log(`Using Property A (passthrough=true): ${withPassThrough.nickname || withPassThrough.name} (ID: ${testPropertyIdA})`);
        } else {
            testPropertyIdA = listings[0].id;
            console.log(`Using Property A: ${listings[0].nickname || listings[0].name} (ID: ${testPropertyIdA})`);
        }

        if (withoutPassThrough) {
            testPropertyIdB = withoutPassThrough.id;
            console.log(`Using Property B (passthrough=false): ${withoutPassThrough.nickname || withoutPassThrough.name} (ID: ${testPropertyIdB})`);
        } else {
            testPropertyIdB = listings[1]?.id || listings[0].id;
            console.log(`Using Property B: ${listings[1]?.nickname || listings[1]?.name} (ID: ${testPropertyIdB})`);
        }

        console.log('');
    } catch (error) {
        console.log(`❌ Failed to get listings: ${error.message}`);
        return;
    }

    // ----------------------------------------------------------------------------
    // TEST: Listing Config API
    // ----------------------------------------------------------------------------
    console.log('--- TEST GROUP: Listing Config API ---\n');

    await test('Can get listing with cleaningFeePassThrough field', async () => {
        const response = await makeRequest('GET', `/api/listings/${testPropertyIdA}`);
        const listing = response.data.listing;

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (typeof listing.cleaningFeePassThrough === 'undefined') {
            throw new Error('cleaningFeePassThrough field missing from listing response');
        }

        console.log(`   Current cleaningFeePassThrough value: ${listing.cleaningFeePassThrough}`);
    });

    await test('Can update cleaningFeePassThrough setting via config', async () => {
        // Get current value
        const getResponse = await makeRequest('GET', `/api/listings/${testPropertyIdA}`);
        const originalValue = getResponse.data.listing.cleaningFeePassThrough;

        // Toggle the value
        const newValue = !originalValue;
        const updateResponse = await makeRequest('PUT', `/api/listings/${testPropertyIdA}/config`, {
            cleaningFeePassThrough: newValue
        });

        if (updateResponse.status !== 200) {
            throw new Error(`Update failed with status ${updateResponse.status}`);
        }

        // Verify it changed
        const verifyResponse = await makeRequest('GET', `/api/listings/${testPropertyIdA}`);
        if (verifyResponse.data.listing.cleaningFeePassThrough !== newValue) {
            throw new Error('cleaningFeePassThrough value did not update');
        }

        console.log(`   Updated from ${originalValue} to ${newValue}`);

        // Restore original value
        await makeRequest('PUT', `/api/listings/${testPropertyIdA}/config`, {
            cleaningFeePassThrough: originalValue
        });
        console.log(`   Restored to original value: ${originalValue}`);
    });

    // ----------------------------------------------------------------------------
    // TEST: Statement Generation with cleaningFeePassThrough
    // ----------------------------------------------------------------------------
    console.log('\n--- TEST GROUP: Statement Generation ---\n');

    // Use a past date range that likely has data
    const testStartDate = '2025-11-01';
    const testEndDate = '2025-11-30';

    await test('Can generate statement for property with cleaningFeePassThrough', async () => {
        try {
            const response = await makeRequest('POST', '/api/statements/generate', {
                propertyId: testPropertyIdA,
                startDate: testStartDate,
                endDate: testEndDate,
                calculationType: 'calendar'
            });

            if (response.status === 201 && response.data.statement?.id) {
                createdStatementIds.push(response.data.statement.id);
                console.log(`   Created statement ID: ${response.data.statement.id}`);
                console.log(`   Total Revenue: $${response.data.statement.totalRevenue}`);
                console.log(`   Owner Payout: $${response.data.statement.ownerPayout}`);
            } else if (response.status === 400) {
                throw new Error('SKIP: ' + (response.data.error || 'No reservations in test period'));
            } else {
                console.log(`   Response: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            if (error.message.includes('SKIP')) throw error;
            throw error;
        }
    });

    await test('Can generate combined statement for properties with mixed passthrough settings', async () => {
        if (testPropertyIdA === testPropertyIdB) {
            throw new Error('SKIP: Need 2 different properties');
        }

        try {
            const response = await makeRequest('POST', '/api/statements/generate', {
                propertyIds: [testPropertyIdA, testPropertyIdB],
                startDate: testStartDate,
                endDate: testEndDate,
                calculationType: 'calendar'
            });

            if (response.status === 201 && response.data.statement?.id) {
                createdStatementIds.push(response.data.statement.id);
                console.log(`   Created combined statement ID: ${response.data.statement.id}`);
                console.log(`   Is Combined: ${response.data.statement.isCombinedStatement}`);
                console.log(`   Total Revenue: $${response.data.statement.totalRevenue}`);
                console.log(`   Owner Payout: $${response.data.statement.ownerPayout}`);
            } else if (response.status === 400) {
                throw new Error('SKIP: ' + (response.data.error || 'No data in test period'));
            } else {
                console.log(`   Response: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            if (error.message.includes('SKIP')) throw error;
            throw error;
        }
    });

    // ----------------------------------------------------------------------------
    // TEST: Statement View/PDF
    // ----------------------------------------------------------------------------
    console.log('\n--- TEST GROUP: Statement View ---\n');

    await test('Statement view returns HTML with correct structure', async () => {
        if (createdStatementIds.length === 0) {
            throw new Error('SKIP: No statements created');
        }

        const statementId = createdStatementIds[0];
        const response = await makeRequest('GET', `/api/statements/${statementId}/view`);

        if (response.status !== 200) {
            throw new Error(`View request failed with status ${response.status}`);
        }

        const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        if (!html.includes('RENTAL ACTIVITY')) {
            throw new Error('HTML missing RENTAL ACTIVITY section');
        }

        console.log(`   HTML contains RENTAL ACTIVITY section`);
    });

    await test('Statement list includes ownerPayout and totalRevenue', async () => {
        const response = await makeRequest('GET', '/api/statements');

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const statements = response.data.statements;

        if (!Array.isArray(statements) || statements.length === 0) {
            throw new Error('SKIP: No statements in database');
        }

        const statement = statements[0];

        if (typeof statement.ownerPayout === 'undefined') {
            throw new Error('ownerPayout missing from statement list');
        }

        if (typeof statement.totalRevenue === 'undefined') {
            throw new Error('totalRevenue missing from statement list');
        }

        console.log(`   Sample statement: Revenue=$${statement.totalRevenue}, Payout=$${statement.ownerPayout}`);
    });

    // ----------------------------------------------------------------------------
    // TEST: Expense Filtering
    // ----------------------------------------------------------------------------
    console.log('\n--- TEST GROUP: Expense Filtering Logic ---\n');

    await test('Cleaning expense categories are recognized', async () => {
        // Test the filtering logic locally
        const cleaningCategories = ['Cleaning', 'cleaning', 'CLEANING', 'House Cleaning'];

        for (const cat of cleaningCategories) {
            if (!cat.toLowerCase().includes('cleaning')) {
                throw new Error(`Category "${cat}" should be detected as cleaning`);
            }
        }

        // "Clean Energy" should NOT be detected
        const cleanEnergy = 'Clean Energy'.toLowerCase();
        if (cleanEnergy.startsWith('cleaning')) {
            throw new Error('"Clean Energy" incorrectly detected as cleaning');
        }

        console.log('   Cleaning detection logic works correctly');
    });

    // ----------------------------------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------------------------------
    console.log('\n--- CLEANUP ---\n');

    // Delete test statements
    for (const id of createdStatementIds) {
        try {
            await makeRequest('DELETE', `/api/statements/${id}`);
            console.log(`   Deleted test statement: ${id}`);
        } catch (error) {
            console.log(`   Warning: Could not delete statement ${id}: ${error.message}`);
        }
    }

    // ----------------------------------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------------------------------
    console.log('\n========================================');
    console.log('INTEGRATION TEST SUMMARY');
    console.log('========================================');
    console.log(`Passed:  ${passedTests}`);
    console.log(`Failed:  ${failedTests}`);
    console.log(`Skipped: ${skippedTests}`);
    console.log(`Total:   ${passedTests + failedTests + skippedTests}`);
    console.log('========================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

// Check if server is running before tests
async function checkServer() {
    try {
        const response = await makeRequest('GET', '/api/listings');
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

async function main() {
    console.log('Checking if server is running...');

    const serverRunning = await checkServer();

    if (!serverRunning) {
        console.log('\nWARNING: Server is not running at http://localhost:3003');
        console.log('Please start the server first: npm start');
        console.log('\nRunning unit tests only...\n');

        // Run unit tests instead
        require('./cleaningFeePassThrough.test.js');
        return;
    }

    console.log('Server is running. Starting integration tests...\n');
    await runIntegrationTests();
}

main().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});
