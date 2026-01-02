// Core financial data types

export interface MonthlyFinancialData {
  month: string; // YYYY-MM format
  netIncome: number;
  grossRevenue: number;
  totalExpenses: number;
  sharedExpenses: number;
}

export interface PropertyFinancialData {
  propertyId: number;
  propertyName: string;
  homeCategory: 'PM' | 'Arbitrage' | 'Owned';
  bankAccount?: string; // For future bank account filtering
  monthlyData: MonthlyFinancialData[];
  lifetimeTotal: {
    netIncome: number;
    grossRevenue: number;
    totalExpenses: number;
  };
}

export interface PropertyMetrics {
  propertyId: number;
  propertyName: string;
  homeCategory: 'PM' | 'Arbitrage' | 'Owned';
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  roi: number; // Return on Investment percentage
  monthlyData: {
    month: string;
    netIncome: number;
  }[];
}

// Transaction types
export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  propertyId?: number;
  propertyName?: string;
  vendor?: string;
  department?: string;
  type: 'income' | 'expense';
}

// Line item types for category details
export interface LineItem {
  id: string;
  name: string;
  amount: number;
  transactionCount: number;
  monthlyBreakdown: {
    month: string; // YYYY-MM
    amount: number;
    count: number;
  }[];
}

export interface CategoryLineItems {
  category: 'PM' | 'Arbitrage' | 'Owned' | 'Shared';
  items: LineItem[];
}

// Chart types
export interface TrendDataPoint {
  month: string; // YYYY-MM format
  value: number;
}

export interface TrendLine {
  category: 'PM' | 'Arbitrage' | 'Owned';
  data: TrendDataPoint[];
}

// Filter types
export interface FinancialFilters {
  homeCategory?: 'PM' | 'Arbitrage' | 'Owned' | 'all';
  bankAccount?: string;
  startDate?: string;
  endDate?: string;
  propertyIds?: number[];
}

// Shared expense calculation types
export interface SharedExpense {
  id: string;
  name: string;
  totalAmount: number;
  department: string;
  allocationMethod: 'equal' | 'revenue-based' | 'custom';
  perPropertyAmount?: number; // For equal allocation
  customAllocations?: Record<number, number>; // propertyId -> amount
}

export interface SharedExpenseAllocation {
  propertyId: number;
  expenseId: string;
  expenseName: string;
  amount: number;
}

// API response types
export interface FinancialDataResponse {
  properties: PropertyFinancialData[];
  metrics: PropertyMetrics[];
  categoryDetails: CategoryLineItems[];
  sharedExpenses: SharedExpense[];
  period: {
    startDate: string;
    endDate: string;
  };
}

// Modal types for transaction details
export interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  month?: string;
  category?: string;
  lineItem?: string;
  transactions: Transaction[];
}

// Summary/aggregated financial data for dashboard components
export interface FinancialData {
  period?: string;
  totalIncome: number;
  totalExpenses: number;
  incomeByCategory?: Record<string, number>;
  expensesByCategory?: Record<string, number>;
}
