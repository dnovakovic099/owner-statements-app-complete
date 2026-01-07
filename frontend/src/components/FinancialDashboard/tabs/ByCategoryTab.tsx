import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Info } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { ChartSkeleton, InlineEmptyState } from '../components/LoadingStates';
import { NoResultsEmptyState } from '../components/EmptyStates';

// Standard QuickBooks expense categories (mapped from various account names)
const QUICKBOOKS_CATEGORIES = [
  'Darko Distribution',
  'Louis Distribution',
  'Owner Payout',
  'Rent',
  'Mortgage',
  'Utility',
  'Cleaning',
  'Maintenance',
  'Review refund',
  'Chargeback',
  'Employee base pay',
  'Employee commission',
  'Photography pay',
  'Legal',
  'Tax',
  'Software subscription',
  'Arbitrage acquisition',
  'Home owner acquisition',
] as const;

export type QuickBooksCategory = typeof QUICKBOOKS_CATEGORIES[number] | string;

export interface CategoryData {
  category: QuickBooksCategory;
  amount: number;
  transactionCount: number;
  type: 'income' | 'expense';
  percentage?: number;
  // Original QuickBooks accounts that were mapped to this category
  originalAccounts?: string[];
  // All transactions for this category (for drill-down)
  transactions?: any[];
}

export interface ByCategoryTabProps {
  categories: CategoryData[];
  onCategorySelect?: (category: QuickBooksCategory, categoryData?: CategoryData) => void;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  isLoading?: boolean;
  // Data source indicator
  dataSource?: 'quickbooks' | 'statements';
  // Whether category mapping is active
  categoryMapping?: boolean;
  // List of unmapped accounts (for debugging/improvement)
  unmappedAccounts?: string[];
}

type SortField = 'category' | 'amount' | 'percentage';
type SortDirection = 'asc' | 'desc';
type TransactionType = 'income' | 'expense' | 'all';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Category color mapping for consistent visual representation
const getCategoryColor = (_category: QuickBooksCategory, index: number): string => {
  const colors = [
    '#3b82f6', // blue-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
    '#f97316', // orange-500
    '#06b6d4', // cyan-500
    '#84cc16', // lime-500
  ];
  return colors[index % colors.length];
};

const ByCategoryTab: React.FC<ByCategoryTabProps> = ({
  categories,
  onCategorySelect,
  dateRange: _dateRange,
  isLoading = false,
  dataSource = 'statements',
  categoryMapping = false,
  unmappedAccounts = [],
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [transactionType, setTransactionType] = useState<TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('amount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filter and process data
  const processedData = useMemo(() => {
    let filtered = [...categories];

    // Filter by transaction type
    if (transactionType !== 'all') {
      filtered = filtered.filter((item) => item.type === transactionType);
    }

    // Filter by selected category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((item) =>
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Calculate percentages
    const total = filtered.reduce((sum, item) => sum + Math.abs(item.amount), 0);
    const withPercentages = filtered.map((item) => ({
      ...item,
      percentage: total > 0 ? (Math.abs(item.amount) / total) * 100 : 0,
    }));

    // Sort data
    withPercentages.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortField) {
        case 'category':
          aValue = a.category;
          bValue = b.category;
          break;
        case 'amount':
          aValue = Math.abs(a.amount);
          bValue = Math.abs(b.amount);
          break;
        case 'percentage':
          aValue = a.percentage || 0;
          bValue = b.percentage || 0;
          break;
        default:
          aValue = Math.abs(a.amount);
          bValue = Math.abs(b.amount);
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return withPercentages;
  }, [categories, selectedCategory, transactionType, searchQuery, sortField, sortDirection]);

  // Chart data (top 10 for better visualization)
  const chartData = useMemo(() => {
    return processedData.slice(0, 10).map((item) => ({
      category: item.category,
      amount: Math.abs(item.amount),
      percentage: item.percentage || 0,
    }));
  }, [processedData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleRowClick = (categoryName: QuickBooksCategory, categoryData?: CategoryData) => {
    // Pass both the category name and full data (including type) to the parent
    onCategorySelect?.(categoryName, categoryData);
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4 text-blue-600" />
    ) : (
      <ArrowDown className="h-4 w-4 text-blue-600" />
    );
  };

  if (isLoading) {
    return <ChartSkeleton height={600} />;
  }

  const hasData = categories.length > 0;
  const hasFilteredData = processedData.length > 0;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        {/* Data Source Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              dataSource === 'quickbooks'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {dataSource === 'quickbooks' ? 'QuickBooks Data' : 'Statement Data'}
            </span>
            {categoryMapping && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Categories Mapped
              </span>
            )}
          </div>
          {unmappedAccounts && unmappedAccounts.length > 0 && (
            <div className="relative group/unmapped">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 cursor-help">
                {unmappedAccounts.length} Unmapped Account{unmappedAccounts.length !== 1 ? 's' : ''}
              </span>
              <div className="absolute right-0 top-full mt-2 hidden group-hover/unmapped:block z-20">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg max-w-xs">
                  <div className="font-medium mb-1">Accounts without mapping:</div>
                  {unmappedAccounts.slice(0, 10).map((acc, i) => (
                    <div key={i} className="text-gray-300 truncate">{acc}</div>
                  ))}
                  {unmappedAccounts.length > 10 && (
                    <div className="text-gray-400 mt-1">...and {unmappedAccounts.length - 10} more</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Category Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Category
            </label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {/* Show standard categories first, then any additional from data */}
                {QUICKBOOKS_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
                {/* Add any categories from data that aren't in the standard list */}
                {categories
                  .map(c => c.category)
                  .filter((cat, idx, arr) =>
                    arr.indexOf(cat) === idx &&
                    !QUICKBOOKS_CATEGORIES.includes(cat as typeof QUICKBOOKS_CATEGORIES[number])
                  )
                  .map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          {/* Transaction Type Toggle */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Type
            </label>
            <div className="flex gap-2">
              <Button
                variant={transactionType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransactionType('all')}
                className="flex-1"
              >
                All
              </Button>
              <Button
                variant={transactionType === 'income' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransactionType('income')}
                className="flex-1"
              >
                Income
              </Button>
              <Button
                variant={transactionType === 'expense' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransactionType('expense')}
                className="flex-1"
              >
                Expenses
              </Button>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {!hasData ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <InlineEmptyState title="No data" description="No category data available for the selected date range" />
        </div>
      ) : !hasFilteredData ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <NoResultsEmptyState
            onClearFilters={() => {
              setSelectedCategory('all');
              setTransactionType('all');
              setSearchQuery('');
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Horizontal Bar Chart */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Top Categories by Amount
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {transactionType === 'all' ? 'All transactions' :
                 transactionType === 'income' ? 'Income only' : 'Expenses only'}
              </p>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => formatCurrency(value)}
                  className="text-xs"
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={150}
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value) || 0)}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar
                  dataKey="amount"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(data: any) => {
                    if (data?.payload?.category) {
                      // Find the full item data from processedData
                      const item = processedData.find(d => d.category === data.payload.category);
                      handleRowClick(data.payload.category as QuickBooksCategory, item);
                    }
                  }}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getCategoryColor(entry.category as QuickBooksCategory, index)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right: Sortable Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Category Details
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {processedData.length} {processedData.length === 1 ? 'category' : 'categories'}
              </p>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '468px' }}>
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wider hover:text-gray-900"
                      >
                        Category
                        <SortIcon field="category" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSort('amount')}
                        className="flex items-center justify-end gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wider hover:text-gray-900 ml-auto"
                      >
                        Amount
                        <SortIcon field="amount" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSort('percentage')}
                        className="flex items-center justify-end gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wider hover:text-gray-900 ml-auto"
                      >
                        Percentage
                        <SortIcon field="percentage" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {processedData.map((item, index) => (
                    <tr
                      key={item.category}
                      onClick={() => handleRowClick(item.category, item)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: getCategoryColor(item.category, index),
                            }}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {item.category}
                              </span>
                              {/* Show info icon if this category has mapped original accounts */}
                              {item.originalAccounts && item.originalAccounts.length > 0 && (
                                <div className="relative group/tooltip">
                                  <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-20">
                                    <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                                      <div className="font-medium mb-1">Mapped from:</div>
                                      {item.originalAccounts.map((acc, i) => (
                                        <div key={i} className="text-gray-300">{acc}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.transactionCount}{' '}
                              {item.transactionCount === 1 ? 'transaction' : 'transactions'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div
                          className={`text-sm font-semibold ${
                            item.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {item.type === 'income' ? '+' : '-'}
                          {formatCurrency(item.amount)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm text-gray-700">
                            {formatPercentage(item.percentage || 0)}
                          </span>
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all duration-300"
                              style={{
                                width: `${Math.min(item.percentage || 0, 100)}%`,
                                backgroundColor: getCategoryColor(item.category, index),
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ByCategoryTab;
