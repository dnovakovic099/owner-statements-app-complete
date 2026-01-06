import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

// Types for line items
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

// PM Category line items
export const PM_LINE_ITEMS = [
  'Ads',
  'Sales Commission',
  'Sales Base',
  'Onboarding',
  'Photography',
  'Claims Income',
  'PM Income',
  'Churn',
];

// Arbitrage Category line items
export const ARBITRAGE_LINE_ITEMS = [
  'Rent',
  'Utilities',
  'Cleanings',
  'Maintenance',
  'Additional',
];

// Home Owned Category line items
export const OWNED_LINE_ITEMS = [
  'Mortgage',
  'Rent',
  'Utilities',
  'Cleanings',
  'Maintenance',
  'Additional',
];

// Shared Category line items (by department)
export const SHARED_DEPARTMENTS = [
  'Employee Costs - Sales',
  'Employee Costs - Operations',
  'Employee Costs - Admin',
  'Refunds',
  'Chargebacks',
];

interface CategoryDetailsProps {
  data: CategoryLineItems[];
  onLineItemClick?: (category: string, lineItem: string, month?: string) => void;
  className?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatMonth = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const CategoryDetails: React.FC<CategoryDetailsProps> = ({
  data,
  onLineItemClick,
  className = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('PM');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Get data for selected category
  const categoryData = useMemo(() => {
    return data.find(d => d.category === selectedCategory);
  }, [data, selectedCategory]);

  // Toggle item expansion
  const toggleItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // Calculate totals
  const totals = useMemo(() => {
    if (!categoryData) return { total: 0, count: 0 };

    const total = categoryData.items.reduce((sum, item) => sum + item.amount, 0);
    const count = categoryData.items.reduce((sum, item) => sum + item.transactionCount, 0);

    return { total, count };
  }, [categoryData]);

  // Get all unique months from line items
  const availableMonths = useMemo(() => {
    if (!categoryData) return [];

    const monthsSet = new Set<string>();
    categoryData.items.forEach(item => {
      item.monthlyBreakdown.forEach(month => {
        monthsSet.add(month.month);
      });
    });

    return Array.from(monthsSet).sort().reverse().slice(0, 6).reverse();
  }, [categoryData]);

  // Category colors
  const categoryColors = {
    PM: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'text-blue-600' },
    Arbitrage: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'text-orange-600' },
    Owned: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', accent: 'text-green-600' },
    Shared: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', accent: 'text-purple-600' },
  };

  const currentColor = categoryColors[selectedCategory as keyof typeof categoryColors];

  if (!categoryData || categoryData.items.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Category Details</h3>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px] h-9 bg-white border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PM">PM</SelectItem>
              <SelectItem value="Arbitrage">Arbitrage</SelectItem>
              <SelectItem value="Owned">Owned</SelectItem>
              <SelectItem value="Shared">Shared Expenses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-center py-12 text-gray-500">
          No data available for this category
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Category Details</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Detailed breakdown by line item
            </p>
          </div>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[200px] h-9 bg-white border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PM">PM</SelectItem>
              <SelectItem value="Arbitrage">Arbitrage</SelectItem>
              <SelectItem value="Owned">Owned</SelectItem>
              <SelectItem value="Shared">Shared Expenses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Totals Summary */}
        <div className={`mt-4 p-4 ${currentColor.bg} border ${currentColor.border} rounded-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentColor.text}`}>Total {selectedCategory} Expenses</p>
              <p className={`text-2xl font-bold ${currentColor.accent} mt-1`}>
                {formatCurrency(totals.total)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Total Transactions</p>
              <p className="text-lg font-semibold text-gray-700 mt-1">{totals.count}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items List */}
      <div className="p-6 space-y-2">
        {categoryData.items.map((item) => {
          const isExpanded = expandedItems.has(item.id);
          const hasMonthlyData = item.monthlyBreakdown && item.monthlyBreakdown.length > 0;

          return (
            <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Item Header */}
              <button
                onClick={() => {
                  if (hasMonthlyData) {
                    toggleItem(item.id);
                  } else {
                    onLineItemClick?.(selectedCategory, item.name);
                  }
                }}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  {hasMonthlyData && (
                    <div className="text-gray-400">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  )}
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.transactionCount} transaction{item.transactionCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg ${item.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(item.amount))}
                  </p>
                </div>
              </button>

              {/* Monthly Breakdown */}
              {isExpanded && hasMonthlyData && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {availableMonths.map(month => {
                      const monthData = item.monthlyBreakdown.find(m => m.month === month);

                      if (!monthData || monthData.amount === 0) {
                        return (
                          <div
                            key={month}
                            className="bg-white rounded border border-gray-200 p-3 opacity-50"
                          >
                            <p className="text-xs text-gray-500 font-medium mb-1">
                              {formatMonth(month)}
                            </p>
                            <p className="text-sm text-gray-400">-</p>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={month}
                          onClick={() => onLineItemClick?.(selectedCategory, item.name, month)}
                          className="bg-white rounded border border-gray-300 p-3 hover:border-blue-400 hover:shadow-sm transition-all text-left"
                        >
                          <p className="text-xs text-gray-500 font-medium mb-1">
                            {formatMonth(month)}
                          </p>
                          <p className={`text-sm font-semibold ${monthData.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(Math.abs(monthData.amount))}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {monthData.count} txn{monthData.count !== 1 ? 's' : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Help Text */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500">
          Click on any line item to view detailed transactions. Click on a monthly breakdown to filter by month.
        </p>
      </div>
    </div>
  );
};

export default CategoryDetails;
