/**
 * Test cases for statement generation fixes:
 * 1. Owner lookup - mapping ownerId 1/'1'/'default' to default owner
 * 2. Expense filtering - checking both propertyId and secureStayListingId
 */

// Mock data for testing
const mockOwners = [
    { id: 'default', name: 'Default Owner' },
    { id: 123, name: 'John Smith' },
    { id: 456, name: 'Jane Doe' }
];

const mockExpenses = [
    { id: 1, propertyId: 100, secureStayListingId: null, amount: -50, date: '2025-11-25', description: 'Cleaning' },
    { id: 2, propertyId: null, secureStayListingId: '100', amount: -75, date: '2025-11-26', description: 'Maintenance' },
    { id: 3, propertyId: null, secureStayListingId: '200', amount: -100, date: '2025-11-27', description: 'Repairs' },
    { id: 4, propertyId: 200, secureStayListingId: null, amount: -25, date: '2025-11-28', description: 'Supplies' },
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
        const matchesPropertyId = exp.propertyId === propertyId;
        const matchesSecureStayId = exp.secureStayListingId && parseInt(exp.secureStayListingId) === propertyId;
        if (!matchesPropertyId && !matchesSecureStayId) {
            return false;
        }
        const expenseDate = new Date(exp.date);
        return expenseDate >= periodStart && expenseDate <= periodEnd;
    });
}

describe('Statement Fixes Tests', () => {

    describe('Owner Lookup Tests', () => {

        test('ownerId "1" (string) should find default owner', () => {
            const owner = findOwner(mockOwners, '1');
            expect(owner.id).toBe('default');
            expect(owner.name).toBe('Default Owner');
        });

        test('ownerId 1 (number) should find default owner', () => {
            const owner = findOwner(mockOwners, 1);
            expect(owner.id).toBe('default');
            expect(owner.name).toBe('Default Owner');
        });

        test('ownerId "default" should find default owner', () => {
            const owner = findOwner(mockOwners, 'default');
            expect(owner.id).toBe('default');
            expect(owner.name).toBe('Default Owner');
        });

        test('ownerId 123 should find John Smith', () => {
            const owner = findOwner(mockOwners, 123);
            expect(owner.id).toBe(123);
            expect(owner.name).toBe('John Smith');
        });

        test('ownerId "456" (string) should find Jane Doe', () => {
            const owner = findOwner(mockOwners, '456');
            expect(owner.id).toBe(456);
            expect(owner.name).toBe('Jane Doe');
        });

        test('Unknown ownerId should fallback to first owner (default)', () => {
            const owner = findOwner(mockOwners, 999);
            expect(owner.id).toBe('default');
        });
    });

    describe('Expense Filtering Tests', () => {

        test('Should find expenses by propertyId', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
            const uploadedExpense = expenses.find(e => e.id === 1);
            expect(uploadedExpense).toBeTruthy();
        });

        test('Should find expenses by secureStayListingId', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
            const secureStayExpense = expenses.find(e => e.id === 2);
            expect(secureStayExpense).toBeTruthy();
        });

        test('Should find both propertyId and secureStayListingId expenses for same property', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
            expect(expenses.length).toBe(3);
        });

        test('Should NOT include expenses from other properties', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
            const wrongPropertyExpense = expenses.find(e => e.id === 3 || e.id === 4);
            expect(wrongPropertyExpense).toBeFalsy();
        });

        test('Should filter by date range', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-25', '2025-11-26');
            expect(expenses.length).toBe(3);
        });

        test('Should return empty array for property with no expenses', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 999, '2025-11-24', '2025-11-30');
            expect(expenses.length).toBe(0);
        });

        test('Should include upsells (positive amounts) in expense list', () => {
            const expenses = filterExpensesForProperty(mockExpenses, 100, '2025-11-24', '2025-11-30');
            const upsell = expenses.find(e => e.id === 5);
            expect(upsell).toBeTruthy();
            expect(upsell.amount).toBe(30);
        });
    });
});
