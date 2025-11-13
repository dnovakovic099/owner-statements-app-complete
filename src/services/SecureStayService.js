const axios = require('axios');

class SecureStayService {
    constructor() {
        this.baseURL = 'https://securestay.ai/securestay_api';
        this.apiKey = process.env.SECURESTAY_API_KEY;
    }

    async makeRequest(endpoint, params = {}) {
        if (!this.apiKey || this.apiKey === 'your_securestay_api_key') {
            console.warn('SecureStay API key not configured, skipping API call');
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
            console.error(`SecureStay API request failed: ${endpoint}`, error.response?.data || error.message);
            throw error;
        }
    }

    async getExpensesForPeriod(startDate, endDate, propertyIds = null, type = null) {
        const typeLabel = type ? ` (type: ${type})` : ' (all types)';
        console.log(`Fetching SecureStay expenses for period: ${startDate} to ${endDate}${typeLabel}`);
        
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

                console.log(`Fetching SecureStay expenses page ${currentPage} (limit: ${limit})${typeLabel}`);
                const response = await this.makeRequest('/accounting/getexpenses', params);
                
                if (response.data && Array.isArray(response.data)) {
                    const pageExpenses = response.data.map(expense => {
                        const amount = parseFloat(expense.amount || 0);
                        const expenseType = expense.type;
                        const category = expense.categories;
                        
                        // Debug log for upsells
                        if (expenseType === 'extras' || category === 'Upsell' || amount > 0) {
                            console.log(`🔍 Potential upsell detected:`, {
                                description: expense.description,
                                amount: amount,
                                type: expenseType,
                                category: category,
                                listing: expense.listing
                            });
                        }
                        
                        return {
                            id: expense.expenseId,
                            description: expense.description || 'Expense',
                            amount: amount,
                            date: expense.dateAdded || expense.dateOfWork,
                            type: expense.categories || expense.type || 'expense',
                            propertyId: null, // SecureStay uses listing names, not IDs
                            vendor: expense.contractorName,
                            listing: expense.listing,
                            status: expense.status,
                            paymentMethod: expense.paymentMethod,
                            category: expense.categories,
                            expenseType: expense.type // Original type from API (expense or extras)
                        };
                    });
                    
                    allExpenses = allExpenses.concat(pageExpenses);
                    
                    // Check if we have more pages
                    // If we got fewer results than the limit, we've reached the end
                    if (response.data.length < limit) {
                        hasMorePages = false;
                    } else {
                        currentPage++;
                    }
                    
                    console.log(`Page ${currentPage - 1}: Got ${response.data.length} expenses (total so far: ${allExpenses.length})`);
                } else {
                    hasMorePages = false;
                }
            }
            
            console.log(`✅ Fetched ${allExpenses.length} total expenses from SecureStay API across ${currentPage - 1} pages${typeLabel}`);
            return allExpenses;
            
        } catch (error) {
            console.warn('SecureStay API not available, returning empty expenses:', error.message);
            return [];
        }
    }

    async getExtrasForPeriod(startDate, endDate, propertyIds = null) {
        console.log(`Fetching SecureStay extras for period: ${startDate} to ${endDate}`);
        return this.getExpensesForPeriod(startDate, endDate, propertyIds, 'extras');
    }

    async getAllExpensesAndExtras(startDate, endDate, propertyIds = null) {
        console.log(`Fetching all SecureStay expenses and extras for period: ${startDate} to ${endDate}`);
        
        // Fetch both expenses and extras in parallel
        const [expenses, extras] = await Promise.all([
            this.getExpensesForPeriod(startDate, endDate, propertyIds, 'expense'),
            this.getExpensesForPeriod(startDate, endDate, propertyIds, 'extras')
        ]);

        const combined = [...expenses, ...extras];
        console.log(`✅ Combined total: ${expenses.length} expenses + ${extras.length} extras = ${combined.length} items`);
        return combined;
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
            console.warn('SecureStay cleaning fees API not available');
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
            console.warn('SecureStay maintenance API not available');
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
            console.warn('SecureStay upsells API not available');
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

        console.log(`Fetching SecureStay expenses for week: ${startDateStr} to ${endDateStr}`);

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

        console.log(`Found ${allExpenses.length} expenses from SecureStay for the week`);
        return allExpenses;
    }
}

module.exports = new SecureStayService();
