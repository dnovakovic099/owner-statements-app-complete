import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  BarChart3,
  Download,
  Settings,
  RefreshCw,
  AlertCircle,
  Calendar,
  Filter,
  X,
} from 'lucide-react';
import DateRangeFilter, { DateRange } from './DateRangeFilter';
import SummaryBubbles from './SummaryBubbles';
import PropertyFinancials, { PropertyFinancialData } from './PropertyFinancials';
import HomeCategoryView, { HomeCategoryData } from './HomeCategoryView';
import MetricsDashboard from './MetricsDashboard';
import CategoryDetails from './CategoryDetails';
import TransactionModal, { Transaction } from './TransactionModal';
import LoadingSpinner from '../LoadingSpinner';
import { financialsAPI } from '../../services/api';
import { cn } from '../../lib/utils';

// Types
interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  incomeChange: number;
  expensesChange: number;
}

interface FinancialMetrics {
  profitMargin: number;
  roi: number;
  occupancyRate: number;
  averageNightlyRate: number;
}

interface CategoryData {
  category: string;
  amount: number;
  color?: string;
}

interface IncomeExpenseData {
  month: string;
  income: number;
  expenses: number;
}

interface GlobalFilters {
  dateRange: DateRange;
  homeCategories: string[];
  bankAccount: string;
}

interface FinancialDashboardProps {
  onBack?: () => void;
}

// Skeleton Loading Components
const SkeletonCard = () => (
  <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200 animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
      <div className="w-16 h-6 bg-gray-200 rounded"></div>
    </div>
    <div className="space-y-2">
      <div className="w-24 h-4 bg-gray-200 rounded"></div>
      <div className="w-32 h-8 bg-gray-200 rounded"></div>
    </div>
  </div>
);

const SkeletonTable = () => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
          <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
          <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
          <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

// Empty State Component
const EmptyState = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 max-w-md mx-auto">{description}</p>
  </div>
);

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                Something went wrong
              </h3>
              <p className="text-red-700 text-sm mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ onBack }) => {
  // State management
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Global filters state
  const [filters, setFilters] = useState<GlobalFilters>({
    dateRange: { startDate: '', endDate: '' },
    homeCategories: [],
    bankAccount: 'all',
  });

  // Data states
  const [summary, setSummary] = useState<FinancialSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    incomeChange: 0,
    expensesChange: 0,
  });

  const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [homeCategoryData, setHomeCategoryData] = useState<HomeCategoryData[]>([]);
  const [propertyFinancials, setPropertyFinancials] = useState<PropertyFinancialData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    profitMargin: 0,
    roi: 0,
    occupancyRate: 0,
    averageNightlyRate: 0,
  });

  // Modal states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch financial data
  const fetchFinancialData = useCallback(async () => {
    if (!filters.dateRange.startDate || !filters.dateRange.endDate) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = filters.dateRange;

      // Fetch all data in parallel
      const [
        summaryData,
        timeSeriesData,
        categoryResponseData,
        homeCategoryResponseData,
        transactionsData,
        metricsData,
      ] = await Promise.all([
        financialsAPI.getSummary(startDate, endDate),
        financialsAPI.getTimeSeries(startDate, endDate),
        financialsAPI.getByCategory(startDate, endDate),
        financialsAPI.getByHomeCategory(startDate, endDate),
        financialsAPI.getTransactions(startDate, endDate),
        financialsAPI.getMetrics(startDate, endDate),
      ]);

      // Process summary data
      if (summaryData.success && summaryData.data?.summary) {
        const s = summaryData.data.summary;
        setSummary({
          totalIncome: s.totalIncome || 0,
          totalExpenses: s.totalExpenses || 0,
          incomeChange: 0, // Would need historical data for comparison
          expensesChange: 0,
        });
      }

      // Process time series data
      if (timeSeriesData.success) {
        setIncomeExpenseData(timeSeriesData.data || []);
      }

      // Process category data
      if (categoryResponseData.success && categoryResponseData.data?.expenses?.categories) {
        const cats = categoryResponseData.data.expenses.categories.map(
          (c: { name: string; total: number }) => ({
            category: c.name,
            amount: c.total || 0,
          })
        );
        setCategoryData(cats);
      }

      // Process home category data
      if (homeCategoryResponseData.success && homeCategoryResponseData.data?.categories) {
        const homeCats = homeCategoryResponseData.data.categories.map(
          (c: {
            name: string;
            income: number;
            expenses: number;
            netIncome: number;
            propertyCount: number;
          }) => ({
            category: c.name,
            income: c.income || 0,
            expenses: c.expenses || 0,
            netIncome: c.netIncome || 0,
            propertyCount: c.propertyCount || 0,
          })
        );
        setHomeCategoryData(homeCats);
      }

      // Process transactions
      if (transactionsData.success && transactionsData.data?.transactions) {
        setTransactions(transactionsData.data.transactions || []);
      }

      // Process metrics
      if (metricsData.success && metricsData.data) {
        const m = metricsData.data;
        setMetrics({
          profitMargin: parseFloat(m.summary?.operatingMargin) || 0,
          roi: 0, // Would need investment data
          occupancyRate: 0, // Would need occupancy data
          averageNightlyRate: m.averages?.revenuePerNight || 0,
        });
      }

      // Mock property financials data (would come from API)
      // This is a placeholder - you'll need to implement the actual API endpoint
      setPropertyFinancials([]);
    } catch (err) {
      console.error('Failed to fetch financial data:', err);
      setError('Failed to load financial data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters.dateRange]);

  // Fetch data when filters change
  useEffect(() => {
    fetchFinancialData();
  }, [fetchFinancialData]);

  // Export data handler
  const handleExportData = () => {
    const csvRows: string[][] = [];
    csvRows.push(['Financial Dashboard Export']);
    csvRows.push([
      `Period: ${filters.dateRange.startDate} to ${filters.dateRange.endDate}`,
    ]);
    csvRows.push([]);
    csvRows.push(['Summary']);
    csvRows.push(['Total Income', `$${summary.totalIncome.toFixed(2)}`]);
    csvRows.push(['Total Expenses', `$${summary.totalExpenses.toFixed(2)}`]);
    csvRows.push([
      'Net Profit',
      `$${(summary.totalIncome - summary.totalExpenses).toFixed(2)}`,
    ]);
    csvRows.push([]);
    csvRows.push(['Expense Categories']);
    csvRows.push(['Category', 'Amount']);
    categoryData.forEach((cat) => {
      csvRows.push([cat.category, `$${cat.amount.toFixed(2)}`]);
    });

    const csvContent = csvRows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `financial-dashboard-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeURL(url);
    document.body.removeChild(a);
  };

  // Filter transactions by category
  const filteredTransactions = selectedCategory
    ? transactions.filter((t) => t.category === selectedCategory)
    : transactions;

  // Apply home category filter to data
  const filteredHomeCategoryData =
    filters.homeCategories.length > 0
      ? homeCategoryData.filter((cat) =>
          filters.homeCategories.includes(cat.category)
        )
      : homeCategoryData;

  const hasData = filters.dateRange.startDate && filters.dateRange.endDate;
  const isEmpty = !loading && hasData && summary.totalIncome === 0 && summary.totalExpenses === 0;

  return (
    <ErrorBoundary>
      <div className="h-full flex flex-col overflow-hidden bg-gray-50">
        {/* Header Section */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-4 pb-3 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 rounded-xl shadow-md">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Financial Dashboard
                </h1>
                <p className="text-gray-500 text-sm">
                  Comprehensive financial analytics and insights
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowFilters(!showFilters)}
                variant="outline"
                size="sm"
                className={cn(
                  'transition-colors',
                  showFilters && 'bg-blue-50 border-blue-300'
                )}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
              <Button
                onClick={fetchFinancialData}
                variant="outline"
                size="sm"
                disabled={loading || !hasData}
              >
                <RefreshCw
                  className={cn('w-4 h-4 mr-2', loading && 'animate-spin')}
                />
                Refresh
              </Button>
              <Button
                onClick={handleExportData}
                variant="outline"
                size="sm"
                disabled={!hasData || isEmpty}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* Global Filters Bar */}
          {showFilters && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Global Filters
                </h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Date Range Filter */}
                <div className="md:col-span-1">
                  <DateRangeFilter
                    dateRange={filters.dateRange}
                    onDateRangeChange={(range) =>
                      setFilters((prev) => ({ ...prev, dateRange: range }))
                    }
                  />
                </div>

                {/* Home Category Multi-Select */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Home Categories
                  </label>
                  <Select
                    value={filters.homeCategories.join(',')}
                    onValueChange={(value) => {
                      const categories = value ? value.split(',') : [];
                      setFilters((prev) => ({
                        ...prev,
                        homeCategories: categories,
                      }));
                    }}
                  >
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Categories</SelectItem>
                      <SelectItem value="PM">Property Management</SelectItem>
                      <SelectItem value="Arbitrage">Arbitrage</SelectItem>
                      <SelectItem value="Owned">Home Owned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Bank Account Selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Bank Account
                  </label>
                  <Select
                    value={filters.bankAccount}
                    onValueChange={(value) =>
                      setFilters((prev) => ({ ...prev, bankAccount: value }))
                    }
                  >
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="All Accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      {/* Future: Add bank account options from API */}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active Filters Display */}
              {(filters.homeCategories.length > 0 ||
                filters.bankAccount !== 'all') && (
                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-medium text-gray-500">
                    Active:
                  </span>
                  {filters.homeCategories.map((category) => (
                    <span
                      key={category}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-md"
                    >
                      {category}
                      <button
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            homeCategories: prev.homeCategories.filter(
                              (c) => c !== category
                            ),
                          }))
                        }
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {filters.bankAccount !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-md">
                      {filters.bankAccount}
                      <button
                        onClick={() =>
                          setFilters((prev) => ({ ...prev, bankAccount: 'all' }))
                        }
                        className="hover:text-purple-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        homeCategories: [],
                        bankAccount: 'all',
                      }))
                    }
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-6">
            {/* Date Range Selector (if filters hidden) */}
            {!showFilters && (
              <DateRangeFilter
                dateRange={filters.dateRange}
                onDateRangeChange={(range) =>
                  setFilters((prev) => ({ ...prev, dateRange: range }))
                }
              />
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-800 font-medium">{error}</p>
                  <Button
                    onClick={fetchFinancialData}
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                <SkeletonTable />
              </div>
            ) : !hasData ? (
              /* No Date Range Selected */
              <EmptyState
                title="Select a Date Range"
                description="Choose a date range to view your financial analytics and insights."
              />
            ) : isEmpty ? (
              /* No Data Available */
              <EmptyState
                title="No Financial Data"
                description="There is no financial data available for the selected date range."
              />
            ) : (
              <>
                {/* Summary Bubbles */}
                <SummaryBubbles
                  totalIncome={summary.totalIncome}
                  totalExpenses={summary.totalExpenses}
                  incomeChange={summary.incomeChange}
                  expensesChange={summary.expensesChange}
                />

                {/* Tab Navigation */}
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-5 mb-6 bg-white shadow-sm border border-gray-200">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="by-category">By Category</TabsTrigger>
                    <TabsTrigger value="by-property">By Property</TabsTrigger>
                    <TabsTrigger value="metrics">Metrics</TabsTrigger>
                    <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="space-y-6">
                    <HomeCategoryView data={filteredHomeCategoryData} />
                    <CategoryDetails
                      categoryData={categoryData}
                      onCategoryClick={(category) => {
                        setSelectedCategory(category);
                        setIsTransactionModalOpen(true);
                      }}
                    />
                  </TabsContent>

                  {/* By Category Tab */}
                  <TabsContent value="by-category" className="space-y-6">
                    <CategoryDetails
                      categoryData={categoryData}
                      onCategoryClick={(category) => {
                        setSelectedCategory(category);
                        setIsTransactionModalOpen(true);
                      }}
                    />
                  </TabsContent>

                  {/* By Property Tab */}
                  <TabsContent value="by-property" className="space-y-6">
                    {propertyFinancials.length > 0 ? (
                      <PropertyFinancials
                        data={propertyFinancials}
                        onMonthCellClick={(propertyId, month) => {
                          console.log('Property clicked:', propertyId, month);
                          // Future: Open detailed view for property/month
                        }}
                      />
                    ) : (
                      <EmptyState
                        title="No Property Data"
                        description="Property financial data will be displayed here once available."
                      />
                    )}
                  </TabsContent>

                  {/* Metrics Tab */}
                  <TabsContent value="metrics" className="space-y-6">
                    <MetricsDashboard
                      metrics={metrics}
                      summary={summary}
                      incomeExpenseData={incomeExpenseData}
                    />
                  </TabsContent>

                  {/* QuickBooks Tab */}
                  <TabsContent value="quickbooks" className="space-y-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                      <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        QuickBooks Integration
                      </h3>
                      <p className="text-gray-500 max-w-md mx-auto mb-4">
                        QuickBooks synchronization and categorization features
                        will be available here.
                      </p>
                      <Button variant="outline" size="sm">
                        Coming Soon
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>

        {/* Transaction Modal */}
        <TransactionModal
          isOpen={isTransactionModalOpen}
          onClose={() => {
            setIsTransactionModalOpen(false);
            setSelectedCategory(null);
          }}
          transactions={filteredTransactions}
          title={
            selectedCategory
              ? `${selectedCategory} Transactions`
              : 'All Transactions'
          }
        />
      </div>
    </ErrorBoundary>
  );
};

export default FinancialDashboard;
