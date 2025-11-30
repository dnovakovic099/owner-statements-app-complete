/**
 * Test cases for statement generation fixes:
 * 1. Owner lookup - mapping ownerId 1/'1'/'default' to default owner
 * 2. Expense filtering - checking both propertyId and secureStayListingId
 */

const assert = require('assert');

// Mock data for testing
const mockOwners = [
    { id: 'default', name: 'Default Owner' },
    { id: 123, name: 'John Smith' },
    { id: 456, name: 'Jane Doe' }
];

const mockExpenses = [
    // Uploaded expense with propertyId
    { id: 1, propertyId: 100, secureStayListingId: null, amount: -50, date: '2025-11-25', description: 'Cleaning' },
    // SecureStay expense with secureStayListingId
    { id: 2, propertyId: null, secureStayListingId: '100', amount: -75, date: '2025-11-26', description: 'Maintenance' },
    // SecureStay expense for different property
    { id: 3, propertyId: null, secureStayListingId: '200', amount: -100, date: '2025-11-27', description: 'Repairs' },
    // Uploaded expense for different property
    { id: 4, propertyId: 200, secureStayListingId: null, amount: -25, date: '2025-11-28', description: 'Supplies' },
    // Upsell (positive amount)
    { id: 5, propertyId: 100, secureStayListingId: null, amount: 30, date: '2025-11-25', description: 'Early checkin', type: 'upsell' },
];

// Owner lookup function (same logic as in statements-file.js)
function findOwner(owners, ownerId) {
    return owners.find(o => {
        if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
            return o.id === 'default';
        }
        return o.id === ownerId || o.id === parseInt(ownerId);
    }) || owners[0];
}

// Expense filter function (same logic as in statements-file.js)
function filterExpensesForProperty(expenses, propertyId, startDate, endDate) {
    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);

    return expenses.filter(exp => {
        // Check both propertyId (for uploaded expenses) and secureStayListingId (for SecureStay expenses)
        const matchesPropertyId = exp.propertyId === propertyId;
        const matchesSecureStayId = exp.secureStayListingId && parseInt(exp.secureStayListingId) === propertyId;
        if (!matchesPropertyId && !matchesSecureStayId) {
            return false;
        }
        const expenseDate = new Date(exp.date);
        return expenseDate >= periodStart && expenseDate <= periodEnd;
    });
}

// Test Suite
console.log('='.repeat(60));
console.log('Running Statement Fixes Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

// ============================================
// TEST GROUP 1: Owner Lookup Tests
// ============================================
console.log('\n--- Owner Lookup Tests ---\n');

test('ownerId "1" (string) should find default owner', () => {
    const owner = findOwner(mockOwners, '1');
    assert.strictEqual(owner.id, 'default', `Expected 'default', got '${owner.id}'`);
    assert.strictEqual(owner.name, 'Default Owner');
});

test('ownerId 1 (number) should find default owner', () => {
    const owner = findOwner(mockOwners, 1);
    assert.strictEqual(owner.id, 'default', `Expected 'default', got '${owner.id}'`);
    assert.strictEqual(owner.name, 'Default Owner');
});

test('ownerId "default" should find default owner', () => {
    const owner = findOwner(mockOwners, 'default');
    assert.strictEqual(owner.id, 'default');
    assert.strictEqual(owner.name, 'Default Owner');
});

test('ownerId 123 should find John Smith', () => {
    const owner = findOwner(mockOwners, 123);
    assert.strictEqual(owner.id, 123);
    assert.strictEqual(owner.name, 'John Smith');
});

test('ownerId "456" (string) should find Jane Doe', () => {
    const owner = findOwner(mockOwners, '456');
    assert.strictEqual(owner.id, 456);
    assert.strictEqual(owner.name, 'Jane Doe');
});

test('Unknown ownerId should fallback to first owner (default)', () => {
    const owner = findOwner(mockOwners, 999);
    assert.strictEqual(owner.id, 'default', 'Should fallback to default owner');
});

// ============================================
// TEST GROUP 2: Expense Filtering Tests
// ============================================
console.log('\n--- Expense Filtering Tests ---\n');

test('Should find expenses by propertyId', () => {
    const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
    const uploadedExpense = expenses.find(e => e.id === 1);
    assert.ok(uploadedExpense, 'Should find uploaded expense with propertyId=100');
});

test('Should find expenses by secureStayListingId', () => {
    const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
    const secureStayExpense = expenses.find(e => e.id === 2);
    assert.ok(secureStayExpense, 'Should find SecureStay expense with secureStayListingId=100');
});

test('Should find both propertyId and secureStayListingId expenses for same property', () => {
    const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
    // Should include: id=1 (propertyId=100), id=2 (secureStayListingId='100'), id=5 (propertyId=100, upsell)
    assert.strictEqual(expenses.length, 3, `Expected 3 expenses for property 100, got ${expenses.length}`);
});

test('Should NOT include expenses from other properties', () => {
    const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
    const wrongPropertyExpense = expenses.find(e => e.id === 3 || e.id === 4);
    assert.ok(!wrongPropertyExpense, 'Should NOT include expenses from property 200');
});

test('Should filter by date range', () => {
    // Only expenses from Nov 25-26
    const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-25', '2025-11-26');
    assert.strictEqual(expenses.length, 3, `Expected 3 expenses in date range, got ${expenses.length}`);
});

test('Should return empty array for property with no expenses', () => {
    const expenses = filterExpensesForProperty(mockExpenses, 999, '2025-11-24', '2025-11-30');
    assert.strictEqual(expenses.length, 0, 'Should return empty array for non-existent property');
});

test('Should include upsells (positive amounts) in expense list', () => {
    const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
    const upsell = expenses.find(e => e.id === 5);
    assert.ok(upsell, 'Should include upsell in filtered expenses');
    assert.strictEqual(upsell.amount, 30, 'Upsell should have positive amount');
});

// ============================================
// Summary
// ============================================
console.log('\n' + '='.repeat(60));
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!\n');
    process.exit(0);
}
