const axios = require('axios');

class SecureStayService {
    constructor() {
        this.baseURL = 'https://securestay.ai/securestay_api';
        this.apiKey = process.env.SECURESTAY_API_KEY;
    }

    async makeRequest(endpoint, params = {}) {
        if (!this.apiKey || this.apiKey === 'your_securestay_api_key') {
            return { expenses: [] };
        }

        try {
            const url = new URL(`${this.baseURL}${endpoint}`);
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined) {
                    url.searchParams.append(key, params[key]);
                }
            });

            const response = await axios.get(url.toString(), {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async getExpensesForPeriod(startDate, endDate, propertyIds = null, type = null) {
        try {
            let allExpenses = [];
            let currentPage = 1;
            let hasMorePages = true;
            const limit = 100; // Increase limit per page for efficiency
            
            while (hasMorePages) {
                const params = {
                    fromDate: startDate,
                    toDate: endDate,
                    page: currentPage,
                    limit: limit,
                    dateType: 'expenseDate',
                    expenseState: 'active'
                };

                // Add type parameter if specified (expense, extras, or omit for both)
                if (type) {
                    params.type = type;
                }

                const response = await this.makeRequest('/accounting/getexpenses', params);
                
                if (response.data && Array.isArray(response.data)) {
                    const pageExpenses = response.data.map(expense => ({
                        id: expense.expenseId,
                        description: expense.description || 'Expense',
                        amount: parseFloat(expense.amount || 0),
                        date: expense.dateAdded || expense.dateOfWork,
                        type: expense.categories || expense.type || 'expense',
                        propertyId: null, // SecureStay uses listing names, not IDs
                        secureStayListingId: expense.listingMapId, // SecureStay's internal listing ID
                        vendor: expense.contractorName,
                        listing: expense.listing,
                        status: expense.status,
                        paymentMethod: expense.paymentMethod,
                        category: expense.categories,
                        expenseType: expense.type, // Original type from API (expense or extras)
                        llCover: expense.llCover || 0 // LL Cover flag - if 1, company covers (exclude from owner statement)
                    }));
                    
                    allExpenses = allExpenses.concat(pageExpenses);
                    
                    // Check if we have more pages
                    // If we got fewer results than the limit, we've reached the end
                    if (response.data.length < limit) {
                        hasMorePages = false;
                    } else {
                        currentPage++;
                    }
                } else {
                    hasMorePages = false;
                }
            }

            return allExpenses;

        } catch (error) {
            return [];
        }
    }

    async getExtrasForPeriod(startDate, endDate, propertyIds = null) {
        return this.getExpensesForPeriod(startDate, endDate, propertyIds, 'extras');
    }

    async getAllExpensesAndExtras(startDate, endDate, propertyIds = null) {
        // Fetch both expenses and extras in parallel
        const [expenses, extras] = await Promise.all([
            this.getExpensesForPeriod(startDate, endDate, propertyIds, 'expense'),
            this.getExpensesForPeriod(startDate, endDate, propertyIds, 'extras')
        ]);

        return [...expenses, ...extras];
    }

    async getCleaningFees(startDate, endDate, propertyIds = null) {
        const params = {
            startDate,
            endDate,
            type: 'cleaning'
        };

        if (propertyIds && propertyIds.length > 0) {
            params.propertyIds = propertyIds.join(',');
        }

        try {
            const response = await this.makeRequest('/cleaning-fees', params);
            return response.fees || [];
        } catch (error) {
            return [];
        }
    }

    async getMaintenanceInvoices(startDate, endDate, propertyIds = null) {
        const params = {
            startDate,
            endDate,
            type: 'maintenance'
        };

        if (propertyIds && propertyIds.length > 0) {
            params.propertyIds = propertyIds.join(',');
        }

        try {
            const response = await this.makeRequest('/maintenance', params);
            return response.invoices || [];
        } catch (error) {
            return [];
        }
    }

    async getUpsells(startDate, endDate, propertyIds = null) {
        const params = {
            startDate,
            endDate,
            type: 'upsell'
        };

        if (propertyIds && propertyIds.length > 0) {
            params.propertyIds = propertyIds.join(',');
        }

        try {
            const response = await this.makeRequest('/upsells', params);
            return response.upsells || [];
        } catch (error) {
            return [];
        }
    }

    // Transform SecureStay expense data to our format
    transformExpense(secureStayExpense, type = 'other') {
        return {
            propertyId: null, // Will be set when matching with our properties
            type: this.mapExpenseType(type, secureStayExpense.category),
            description: secureStayExpense.description || secureStayExpense.title,
            amount: parseFloat(secureStayExpense.amount || 0),
            date: secureStayExpense.date || secureStayExpense.invoiceDate,
            source: 'securestay',
            sourceId: secureStayExpense.id?.toString(),
            invoiceNumber: secureStayExpense.invoiceNumber,
            vendor: secureStayExpense.vendor || secureStayExpense.supplier,
            category: secureStayExpense.category,
            notes: secureStayExpense.notes
        };
    }

    mapExpenseType(apiType, category) {
        const typeMap = {
            'cleaning': 'cleaning',
            'maintenance': 'maintenance',
            'upsell': 'upsell',
            'repair': 'maintenance',
            'supplies': 'maintenance',
            'service': 'other'
        };

        // First try to map by API type
        if (typeMap[apiType]) {
            return typeMap[apiType];
        }

        // Then try to map by category
        if (category && typeMap[category.toLowerCase()]) {
            return typeMap[category.toLowerCase()];
        }

        return 'other';
    }

    // Get all expenses for a week (Tuesday to Monday)
    async getExpensesForWeek(weekStartDate, propertyIds = null) {
        const startDate = new Date(weekStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const [expenses, cleaningFees, maintenanceInvoices, upsells] = await Promise.all([
            this.getExpensesForPeriod(startDateStr, endDateStr, propertyIds),
            this.getCleaningFees(startDateStr, endDateStr, propertyIds),
            this.getMaintenanceInvoices(startDateStr, endDateStr, propertyIds),
            this.getUpsells(startDateStr, endDateStr, propertyIds)
        ]);

        const allExpenses = [
            ...expenses.map(e => this.transformExpense(e, 'other')),
            ...cleaningFees.map(e => this.transformExpense(e, 'cleaning')),
            ...maintenanceInvoices.map(e => this.transformExpense(e, 'maintenance')),
            ...upsells.map(e => this.transformExpense(e, 'upsell'))
        ];

        return allExpenses;
    }
}

module.exports = new SecureStayService();
