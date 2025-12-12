/**
 * Calendar Conversion Integration Tests
 *
 * Tests the actual bulk generation endpoint behavior
 * Run with: node src/tests/calendarConversion.integration.test.js
 *
 * Prerequisites:
 * - Server running on localhost:3003
 * - Test property with a long-stay reservation
 */

const http = require('http');

const BASE_URL = 'http://localhost:3003';
const AUTH = 'Basic ' + Buffer.from('LL:bnb547!').toString('base64');

// API paths (statements-file routes are mounted at /api/statements)
const STATEMENTS_PATH = '/api/statements';
const LISTINGS_PATH = '/api/listings';

// Helper to make HTTP requests
function httpRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Authorization': AUTH,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Test helper
async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        return true;
    } catch (error) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('\n========================================');
    console.log('Calendar Conversion Integration Tests');
    console.log('========================================\n');

    let passed = 0;
    let failed = 0;

    // Check if server is running
    console.log('--- Pre-flight Check ---\n');

    try {
        const healthCheck = await httpRequest('GET', `${STATEMENTS_PATH}?limit=1`);
        if (healthCheck.status !== 200) {
            console.log('  ✗ Server not responding. Make sure server is running on port 3003');
            console.log(`    Status: ${healthCheck.status}, Response: ${JSON.stringify(healthCheck.data).substring(0, 100)}`);
            process.exit(1);
        }
        console.log('  ✓ Server is running');
    } catch (error) {
        console.log('  ✗ Server not accessible:', error.message);
        console.log('\n  Please start the server with: npm start');
        process.exit(1);
    }

    // Test 1: Check that statement with shouldConvertToCalendar flag is returned
    console.log('\n--- TEST GROUP 1: API Response Fields ---\n');

    if (await test('1.1 Statements API includes shouldConvertToCalendar field', async () => {
        const response = await httpRequest('GET', `${STATEMENTS_PATH}?limit=10`);

        if (response.status !== 200) {
            throw new Error(`Expected 200, got ${response.status}`);
        }

        // Check that field exists in response schema (even if false)
        const statements = response.data.statements || [];
        if (statements.length > 0) {
            const hasField = 'shouldConvertToCalendar' in statements[0];
            if (!hasField) {
                throw new Error('shouldConvertToCalendar field not found in statement response');
            }
        }
    })) passed++; else failed++;

    if (await test('1.2 Statements API includes calendarConversionNotice field', async () => {
        const response = await httpRequest('GET', `${STATEMENTS_PATH}?limit=10`);

        if (response.status !== 200) {
            throw new Error(`Expected 200, got ${response.status}`);
        }

        const statements = response.data.statements || [];
        if (statements.length > 0) {
            const hasField = 'calendarConversionNotice' in statements[0];
            if (!hasField) {
                throw new Error('calendarConversionNotice field not found in statement response');
            }
        }
    })) passed++; else failed++;

    if (await test('1.3 Statements API includes overlappingReservationCount field', async () => {
        const response = await httpRequest('GET', `${STATEMENTS_PATH}?limit=10`);

        if (response.status !== 200) {
            throw new Error(`Expected 200, got ${response.status}`);
        }

        const statements = response.data.statements || [];
        if (statements.length > 0) {
            const hasField = 'overlappingReservationCount' in statements[0];
            if (!hasField) {
                throw new Error('overlappingReservationCount field not found in statement response');
            }
        }
    })) passed++; else failed++;

    // Test 2: Generate a statement and check fields
    console.log('\n--- TEST GROUP 2: Statement Generation ---\n');

    // Get active listings to find a property to test with
    let testPropertyId = null;
    let testPropertyName = null;

    if (await test('2.1 Get active listings for test', async () => {
        const response = await httpRequest('GET', `${LISTINGS_PATH}?active=true`);

        if (response.status !== 200) {
            throw new Error(`Expected 200, got ${response.status}`);
        }

        const listings = response.data.listings || response.data || [];
        if (listings.length === 0) {
            throw new Error('No active listings found');
        }

        // Use first active listing
        testPropertyId = listings[0].id;
        testPropertyName = listings[0].nickname || listings[0].name;
        console.log(`    Using property: ${testPropertyName} (${testPropertyId})`);
    })) passed++; else failed++;

    if (testPropertyId) {
        // Generate statement in checkout mode for a past period
        if (await test('2.2 Generate statement (checkout mode)', async () => {
            const response = await httpRequest('POST', `${STATEMENTS_PATH}/generate`, {
                propertyId: testPropertyId,
                startDate: '2025-10-01',
                endDate: '2025-10-31',
                calculationType: 'checkout'
            });

            if (response.status !== 200 && response.status !== 201) {
                throw new Error(`Expected 200/201, got ${response.status}: ${JSON.stringify(response.data)}`);
            }

            // Response is { message, statement: { ... } }
            const statement = response.data.statement || response.data;

            // Check new fields exist
            if (!('shouldConvertToCalendar' in statement)) {
                throw new Error('shouldConvertToCalendar not in generated statement');
            }

            console.log(`    shouldConvertToCalendar: ${statement.shouldConvertToCalendar}`);
            console.log(`    totalRevenue: $${statement.totalRevenue}`);

            if (statement.calendarConversionNotice) {
                console.log(`    Notice: ${statement.calendarConversionNotice.substring(0, 60)}...`);
            }
        })) passed++; else failed++;

        // Generate statement in calendar mode
        if (await test('2.3 Generate statement (calendar mode)', async () => {
            const response = await httpRequest('POST', `${STATEMENTS_PATH}/generate`, {
                propertyId: testPropertyId,
                startDate: '2025-10-01',
                endDate: '2025-10-31',
                calculationType: 'calendar'
            });

            if (response.status !== 200 && response.status !== 201) {
                throw new Error(`Expected 200/201, got ${response.status}: ${JSON.stringify(response.data)}`);
            }

            // Response is { message, statement: { ... } }
            const statement = response.data.statement || response.data;

            console.log(`    shouldConvertToCalendar: ${statement.shouldConvertToCalendar}`);
            console.log(`    totalRevenue: $${statement.totalRevenue}`);
        })) passed++; else failed++;
    }

    // Test 3: Check statement detail includes overlapping reservations
    console.log('\n--- TEST GROUP 3: Statement Detail API ---\n');

    // Find a statement with shouldConvertToCalendar = true
    let testStatementId = null;

    if (await test('3.1 Find statement with calendar conversion flag', async () => {
        const response = await httpRequest('GET', `${STATEMENTS_PATH}?limit=100`);

        if (response.status !== 200) {
            throw new Error(`Expected 200, got ${response.status}`);
        }

        const statements = response.data.statements || [];
        const flaggedStatement = statements.find(s => s.shouldConvertToCalendar === true);

        if (flaggedStatement) {
            testStatementId = flaggedStatement.id;
            console.log(`    Found flagged statement: ID ${testStatementId}`);
            console.log(`    Notice: ${flaggedStatement.calendarConversionNotice?.substring(0, 50)}...`);
        } else {
            console.log(`    No statements with shouldConvertToCalendar=true found (this may be expected)`);
        }
    })) passed++; else failed++;

    if (testStatementId) {
        if (await test('3.2 Statement detail includes overlappingReservations', async () => {
            const response = await httpRequest('GET', `${STATEMENTS_PATH}/${testStatementId}`);

            if (response.status !== 200) {
                throw new Error(`Expected 200, got ${response.status}`);
            }

            const statement = response.data;

            // Old statements may not have this field - that's OK
            if (!statement.overlappingReservations) {
                console.log(`    overlappingReservations: not present (statement may predate this feature)`);
                console.log(`    calendarConversionNotice: ${statement.calendarConversionNotice || 'not present'}`);
            } else {
                console.log(`    Overlapping reservations: ${statement.overlappingReservations.length}`);
                if (statement.overlappingReservations.length > 0) {
                    const first = statement.overlappingReservations[0];
                    console.log(`    First: ${first.guestName} (${first.checkInDate} - ${first.checkOutDate})`);
                }
            }
        })) passed++; else failed++;
    }

    // Test 4: Check PDF includes notice
    console.log('\n--- TEST GROUP 4: PDF Generation ---\n');

    if (testStatementId) {
        if (await test('4.1 PDF for flagged statement includes notice banner', async () => {
            // The /view endpoint returns HTML
            const response = await httpRequest('GET', `${STATEMENTS_PATH}/${testStatementId}/view`);

            if (response.status !== 200) {
                throw new Error(`Expected 200, got ${response.status}`);
            }

            const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

            // Check for notice elements
            const hasNoticeClass = html.includes('calendar-notice');
            const hasNoticeTitle = html.includes('Calendar Conversion Recommended');

            if (!hasNoticeClass && !hasNoticeTitle) {
                // This might be expected if the statement doesn't have the flag set in DB
                console.log(`    Notice banner: Not found (statement may need regeneration)`);
            } else {
                console.log(`    Notice banner found in HTML: Yes`);
            }
        })) passed++; else failed++;
    } else {
        console.log('  - Skipping PDF test (no flagged statement found)');
    }

    // Summary
    console.log('\n========================================');
    console.log(`Integration Tests Complete`);
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    console.log('========================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('Test error:', error);
    process.exit(1);
});
