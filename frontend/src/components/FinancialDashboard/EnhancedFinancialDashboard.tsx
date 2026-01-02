import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BarChart3, TrendingUp, PieChart, Home, Activity } from 'lucide-react';
import DateRangeFilter, { DateRange } from './DateRangeFilter';
import { EnhancedSummaryCards } from './components/EnhancedSummaryCards';
import { EnhancedChart } from './components/EnhancedChart';
import { EnhancedPieChart } from './components/EnhancedPieChart';
import { DashboardHeader, SectionHeader } from './components/DashboardHeader';
import { DashboardSkeleton } from './components/LoadingStates';
import { NoDataEmptyState, ErrorEmptyState } from './components/EmptyStates';
import HomeCategoryView, { HomeCategoryData } from './HomeCategoryView';
import TransactionModal, { Transaction } from './TransactionModal';
import { financialsAPI } from '../../services/api';
import { cn } from '../../lib/utils';

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

interface EnhancedFinancialDashboardProps {
  onBack?: () => void;
}

export const EnhancedFinancialDashboard: React.FC<EnhancedFinancialDashboardProps> = ({ onBack }) => {
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);

  // Financial data states
  const [summary, setSummary] = useState<FinancialSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    incomeChange: 0,
    expensesChange: 0,
  });

  const [incomeExpenseData, setIncomeExpenseData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [homeCategoryData, setHomeCategoryData] = useState<HomeCategoryData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    profitMargin: 0,
    roi: 0,
    occupancyRate: 0,
    averageNightlyRate: 0,
  });

  const fetchFinancialData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [
        summaryData,
        timeSeriesData,
        categoryResponseData,
        homeCategoryResponseData,
        transactionsData,
        metricsData,
      ] = await Promise.all([
        financialsAPI.getSummary(dateRange.startDate, dateRange.endDate),
        financialsAPI.getTimeSeries(dateRange.startDate, dateRange.endDate),
        financialsAPI.getByCategory(dateRange.startDate, dateRange.endDate),
        financialsAPI.getByHomeCategory(dateRange.startDate, dateRange.endDate),
        financialsAPI.getTransactions(dateRange.startDate, dateRange.endDate),
        financialsAPI.getMetrics(dateRange.startDate, dateRange.endDate),
      ]);

      // Update summary
      if (summaryData.success && summaryData.data?.summary) {
        const s = summaryData.data.summary;
        setSummary({
          totalIncome: s.totalIncome || 0,
          totalExpenses: s.totalExpenses || 0,
          incomeChange: 0,
          expensesChange: 0,
        });
      }

      // Update time series data
      if (timeSeriesData.success) {
        setIncomeExpenseData(timeSeriesData.data || []);
      }

      // Update category data
      if (categoryResponseData.success && categoryResponseData.data?.expenses?.categories) {
        const cats = categoryResponseData.data.expenses.categories.map((c: { name: string; total: number }) => ({
          category: c.name,
          amount: c.total || 0,
        }));
        setCategoryData(cats);
      }

      // Update home category data
      if (homeCategoryResponseData.success && homeCategoryResponseData.data?.categories) {
        const homeCats = homeCategoryResponseData.data.categories.map((c: any) => ({
          category: c.name,
          income: c.income || 0,
          expenses: c.expenses || 0,
          netIncome: c.netIncome || 0,
          propertyCount: c.propertyCount || 0,
        }));
        setHomeCategoryData(homeCats);
      }

      // Update transactions
      if (transactionsData.success && transactionsData.data?.transactions) {
        setTransactions(transactionsData.data.transactions || []);
      }

      // Update metrics
      if (metricsData.success && metricsData.data) {
        const m = metricsData.data;
        setMetrics({
          profitMargin: parseFloat(m.summary?.operatingMargin) || 0,
          roi: 0,
          occupancyRate: 0,
          averageNightlyRate: m.averages?.revenuePerNight || 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch financial data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // Fetch data when date range changes
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchFinancialData();
    }
  }, [dateRange, fetchFinancialData]);

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    setIsTransactionModalOpen(true);
  };

  const handleExportData = () => {
    const csvRows: string[][] = [];
    csvRows.push(['Financial Dashboard Export', `${dateRange.startDate} to ${dateRange.endDate}`]);
    csvRows.push([]);
    csvRows.push(['Summary']);
    csvRows.push(['Total Income', `$${summary.totalIncome.toFixed(2)}`]);
    csvRows.push(['Total Expenses', `$${summary.totalExpenses.toFixed(2)}`]);
    csvRows.push(['Net Profit', `$${(summary.totalIncome - summary.totalExpenses).toFixed(2)}`]);
    csvRows.push([]);
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
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const filteredTransactions = selectedCategory
    ? transactions.filter((t) => t.category === selectedCategory)
    : transactions;

  // Show loading skeleton on initial load
  if (loading && !summary.totalIncome && !summary.totalExpenses) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        <DashboardHeader
          dateRange={dateRange}
          onExport={handleExportData}
          onRefresh={fetchFinancialData}
        />
        <div className="flex-1 overflow-auto">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        <DashboardHeader
          dateRange={dateRange}
          onExport={handleExportData}
          onRefresh={fetchFinancialData}
        />
        <div className="flex-1 overflow-auto p-6">
          <ErrorEmptyState error={error} onRetry={fetchFinancialData} />
        </div>
      </div>
    );
  }

  // Show empty state if no date range selected
  if (!dateRange.startDate || !dateRange.endDate) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        <DashboardHeader />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
            <div className="mt-8">
              <NoDataEmptyState />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Enhanced Header */}
      <DashboardHeader
        dateRange={dateRange}
        onExport={handleExportData}
        onRefresh={fetchFinancialData}
        isRefreshing={loading}
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-8">
          {/* Date Range Filter */}
          <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

          {/* Enhanced Summary Cards */}
          <EnhancedSummaryCards
            totalIncome={summary.totalIncome}
            totalExpenses={summary.totalExpenses}
            incomeChange={summary.incomeChange}
            expensesChange={summary.expensesChange}
            loading={loading}
          />

          {/* Enhanced Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn(
              'grid w-full grid-cols-4 mb-8 p-1.5 bg-white rounded-2xl shadow-lg border border-gray-200',
              'h-auto'
            )}>
              <TabsTrigger
                value="overview"
                className={cn(
                  'flex items-center gap-2 py-3 text-sm font-semibold rounded-xl',
                  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600',
                  'data-[state=active]:text-white data-[state=active]:shadow-lg',
                  'transition-all duration-200'
                )}
              >
                <BarChart3 className="w-4 h-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="by-category"
                className={cn(
                  'flex items-center gap-2 py-3 text-sm font-semibold rounded-xl',
                  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600',
                  'data-[state=active]:text-white data-[state=active]:shadow-lg',
                  'transition-all duration-200'
                )}
              >
                <PieChart className="w-4 h-4" />
                By Category
              </TabsTrigger>
              <TabsTrigger
                value="by-property"
                className={cn(
                  'flex items-center gap-2 py-3 text-sm font-semibold rounded-xl',
                  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-green-600',
                  'data-[state=active]:text-white data-[state=active]:shadow-lg',
                  'transition-all duration-200'
                )}
              >
                <Home className="w-4 h-4" />
                By Property
              </TabsTrigger>
              <TabsTrigger
                value="metrics"
                className={cn(
                  'flex items-center gap-2 py-3 text-sm font-semibold rounded-xl',
                  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-600 data-[state=active]:to-amber-600',
                  'data-[state=active]:text-white data-[state=active]:shadow-lg',
                  'transition-all duration-200'
                )}
              >
                <Activity className="w-4 h-4" />
                Metrics
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-8 mt-0">
              <EnhancedChart
                data={incomeExpenseData}
                title="Revenue & Expenses Trend"
                height={450}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <EnhancedPieChart
                  data={categoryData}
                  title="Top Expense Categories"
                  onCategoryClick={handleCategoryClick}
                />

                {/* Quick Insights Card */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                  <SectionHeader
                    title="Quick Insights"
                    subtitle="Key performance indicators"
                    icon={TrendingUp}
                  />

                  <div className="space-y-4">
                    {/* Profit Margin */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                      <div>
                        <p className="text-sm font-semibold text-blue-900 mb-1">Profit Margin</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {summary.totalIncome > 0
                            ? (((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100).toFixed(1)
                            : '0.0'}%
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* Average Monthly Revenue */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900 mb-1">Avg Monthly Revenue</p>
                        <p className="text-2xl font-bold text-emerald-700">
                          ${(summary.totalIncome / Math.max(incomeExpenseData.length, 1)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* Expense Ratio */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                      <div>
                        <p className="text-sm font-semibold text-purple-900 mb-1">Expense Ratio</p>
                        <p className="text-2xl font-bold text-purple-700">
                          {summary.totalIncome > 0
                            ? ((summary.totalExpenses / summary.totalIncome) * 100).toFixed(1)
                            : '0.0'}%
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                        <Activity className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* By Category Tab */}
            <TabsContent value="by-category" className="space-y-8 mt-0">
              <EnhancedPieChart
                data={categoryData}
                title="Expense Breakdown by Category"
                onCategoryClick={handleCategoryClick}
                height={500}
              />

              {/* Category Details Table */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                <SectionHeader
                  title="Category Details"
                  subtitle="Detailed expense breakdown"
                  action={{
                    label: 'View All Transactions',
                    onClick: () => setIsTransactionModalOpen(true),
                  }}
                />

                <div className="space-y-2">
                  {categoryData
                    .sort((a, b) => b.amount - a.amount)
                    .map((cat) => {
                      const percentage = ((cat.amount / summary.totalExpenses) * 100).toFixed(1);
                      return (
                        <div
                          key={cat.category}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer group"
                          onClick={() => handleCategoryClick(cat.category)}
                        >
                          <span className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {cat.category}
                          </span>
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-semibold text-gray-600 bg-white px-3 py-1 rounded-full">
                              {percentage}%
                            </span>
                            <span className="font-bold text-gray-900 min-w-[120px] text-right">
                              ${cat.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </TabsContent>

            {/* By Property Tab */}
            <TabsContent value="by-property" className="space-y-8 mt-0">
              <HomeCategoryView data={homeCategoryData} />
            </TabsContent>

            {/* Metrics Tab */}
            <TabsContent value="metrics" className="space-y-8 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {/* Profit Margin */}
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-xl p-6 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <TrendingUp className="w-8 h-8 opacity-80" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-90 mb-2">
                    Profit Margin
                  </p>
                  <p className="text-4xl font-bold mb-1">
                    {metrics.profitMargin.toFixed(1)}%
                  </p>
                  <p className="text-xs opacity-75">
                    {summary.totalIncome > 0
                      ? `${(((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100).toFixed(1)}% of revenue`
                      : '0.0% of revenue'}
                  </p>
                </div>

                {/* ROI */}
                <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl shadow-xl p-6 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <Activity className="w-8 h-8 opacity-80" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-90 mb-2">ROI</p>
                  <p className="text-4xl font-bold mb-1">{metrics.roi.toFixed(1)}%</p>
                  <p className="text-xs opacity-75">Return on investment</p>
                </div>

                {/* Occupancy Rate */}
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-xl p-6 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <Home className="w-8 h-8 opacity-80" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-90 mb-2">
                    Occupancy Rate
                  </p>
                  <p className="text-4xl font-bold mb-1">{metrics.occupancyRate.toFixed(1)}%</p>
                  <p className="text-xs opacity-75">Average across properties</p>
                </div>

                {/* Avg Nightly Rate */}
                <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl shadow-xl p-6 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <BarChart3 className="w-8 h-8 opacity-80" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-90 mb-2">
                    Avg Nightly Rate
                  </p>
                  <p className="text-4xl font-bold mb-1">${metrics.averageNightlyRate.toFixed(0)}</p>
                  <p className="text-xs opacity-75">Per night average</p>
                </div>
              </div>

              {/* Charts */}
              <EnhancedChart
                data={incomeExpenseData}
                title="Performance Trends"
                height={450}
              />
            </TabsContent>
          </Tabs>
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
        title={selectedCategory ? `${selectedCategory} Transactions` : 'All Transactions'}
      />
    </div>
  );
};

export default EnhancedFinancialDashboard;
