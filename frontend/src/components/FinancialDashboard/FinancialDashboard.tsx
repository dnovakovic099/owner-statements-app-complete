import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { BarChart3, TrendingUp, Download, PieChart, Home, GitCompare, Activity } from 'lucide-react';
import DateRangeFilter, { DateRange } from './DateRangeFilter';
import KPICards from './KPICards';
import IncomeExpenseChart, { IncomeExpenseData } from './charts/IncomeExpenseChart';
import { CategoryData } from './charts/CategoryPieChart';
import { ChartWithSelector } from './ChartWithSelector';
import HomeCategoryView, { HomeCategoryData } from './HomeCategoryView';
import TransactionModal, { Transaction } from './TransactionModal';
import ComparisonView from './ComparisonView';
import SkeletonLoader from './SkeletonLoader';
import { financialsAPI } from '../../services/api';

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

interface FinancialDashboardProps {
  onBack?: () => void;
}

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ onBack }) => {
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(false);
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

  const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [homeCategoryData, setHomeCategoryData] = useState<HomeCategoryData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    profitMargin: 0,
    roi: 0,
    occupancyRate: 0,
    averageNightlyRate: 0,
  });

  const fetchFinancialData = useCallback(async () => {
    console.log('[FinancialDashboard] Fetching financial data for date range:', dateRange);
    setLoading(true);
    try {
      // Fetch all data in parallel using the financials API
      const [
        summaryData,
        timeSeriesData,
        categoryResponseData,
        homeCategoryResponseData,
        transactionsData,
        metricsData,
        comparisonData,
      ] = await Promise.all([
        financialsAPI.getSummary(dateRange.startDate, dateRange.endDate),
        financialsAPI.getTimeSeries(dateRange.startDate, dateRange.endDate),
        financialsAPI.getByCategory(dateRange.startDate, dateRange.endDate),
        financialsAPI.getByHomeCategory(dateRange.startDate, dateRange.endDate),
        financialsAPI.getTransactions(dateRange.startDate, dateRange.endDate),
        financialsAPI.getMetrics(dateRange.startDate, dateRange.endDate),
        // Fetch month-over-month comparison for summary badges
        financialsAPI.getComparison(dateRange.startDate, dateRange.endDate, undefined, undefined, 'mom'),
      ]);
      console.log('[FinancialDashboard] All API calls completed');

      // Extract comparison percentages
      let incomeChange = 0;
      let expensesChange = 0;
      if (comparisonData?.success && comparisonData.data?.changes) {
        incomeChange = comparisonData.data.changes.income?.percent || 0;
        expensesChange = comparisonData.data.changes.expenses?.percent || 0;
      }

      // Update state with fetched data - map backend response to frontend expected format
      if (summaryData.success && summaryData.data?.summary) {
        const s = summaryData.data.summary;
        console.log('[FinancialDashboard] Summary API response:', s);
        setSummary({
          totalIncome: s.totalIncome || 0,
          totalExpenses: s.totalExpenses || 0,
          incomeChange,
          expensesChange,
        });
        console.log('[FinancialDashboard] Summary state set with changes:', {
          totalIncome: s.totalIncome || 0,
          totalExpenses: s.totalExpenses || 0,
          incomeChange,
          expensesChange,
        });
      }
      if (timeSeriesData.success) {
        setIncomeExpenseData(timeSeriesData.data || []);
      }
      if (categoryResponseData.success && categoryResponseData.data?.expenses?.categories) {
        // Map to CategoryData format: { category, amount, color }
        const cats = categoryResponseData.data.expenses.categories.map((c: { name: string; total: number }) => ({
          category: c.name,
          amount: c.total || 0,
        }));
        setCategoryData(cats);
      }
      if (homeCategoryResponseData.success && homeCategoryResponseData.data?.categories) {
        // Map to HomeCategoryData format
        console.log('[FinancialDashboard] Home category API response:', homeCategoryResponseData.data.categories);
        const homeCats = homeCategoryResponseData.data.categories.map((c: {
          category: string;
          name: string;
          income: number;
          expenses: number;
          netIncome: number;
          propertyCount: number;
          properties?: any[]
        }) => ({
          category: c.name, // Use the display name (e.g., 'Arbitrage', 'Property Management')
          income: c.income || 0,
          expenses: c.expenses || 0,
          netIncome: c.netIncome || 0,
          propertyCount: c.propertyCount || 0,
          properties: c.properties || [],
        }));
        console.log('[FinancialDashboard] Home category data mapped to:', homeCats);
        setHomeCategoryData(homeCats);
      }
      if (transactionsData.success && transactionsData.data?.transactions) {
        setTransactions(transactionsData.data.transactions || []);
      }
      if (metricsData.success && metricsData.data) {
        const m = metricsData.data;
        setMetrics({
          profitMargin: parseFloat(m.summary?.operatingMargin) || 0,
          roi: 0, // Would need investment data
          occupancyRate: 0, // Would need occupancy data
          averageNightlyRate: m.averages?.revenuePerNight || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch financial data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // Fetch financial data when date range changes
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
    // Create CSV export of financial data
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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Compact Header Row: Title + Date Filter + Export Button */}
      <div className="bg-white border-b border-gray-200/60 px-4 py-3 flex-shrink-0 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-profit p-2.5 rounded-lg shadow-sm">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Financial Dashboard</h1>
              <p className="text-xs text-gray-500">Real-time insights and analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 justify-end">
            <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
            <Button
              onClick={handleExportData}
              variant="outline"
              size="sm"
              className="hover:bg-gray-50 transition-all duration-200 hover:shadow-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>
      </div>

      {/* Fullscreen Content Area */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">

          {loading ? (
            <SkeletonLoader />
          ) : (
            <>
              {/* KPI Cards */}
              <KPICards
                totalIncome={summary.totalIncome}
                totalExpenses={summary.totalExpenses}
                incomeChange={summary.incomeChange}
                expensesChange={summary.expensesChange}
                isLoading={loading}
              />

              {/* Full-Width Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 mb-6">
                  <TabsTrigger value="overview">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="by-category">
                    <PieChart className="w-4 h-4 mr-2" />
                    By Category
                  </TabsTrigger>
                  <TabsTrigger value="by-property">
                    <Home className="w-4 h-4 mr-2" />
                    By Property
                  </TabsTrigger>
                  <TabsTrigger value="comparison">
                    <GitCompare className="w-4 h-4 mr-2" />
                    Comparison
                  </TabsTrigger>
                  <TabsTrigger value="metrics">
                    <Activity className="w-4 h-4 mr-2" />
                    Metrics
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                  {/* Bento Grid Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 auto-rows-auto">
                    {/* Main Chart - Spans 2 columns on desktop */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <ChartWithSelector
                        title="Income vs Expenses Over Time"
                        data={incomeExpenseData.map(d => ({
                          name: d.month,
                          income: d.income,
                          expenses: d.expenses,
                        }))}
                        series={[
                          { dataKey: 'income', name: 'Income', color: '#10B981' },
                          { dataKey: 'expenses', name: 'Expenses', color: '#EF4444' },
                        ]}
                        defaultType="line"
                        allowedTypes={['line', 'bar', 'area']}
                        height={350}
                        isLoading={loading}
                      />
                    </div>

                    {/* Quick Stats Panel */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
                      <div className="space-y-4">
                        {/* Highest Income Month */}
                        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                          <p className="text-xs font-medium text-green-600 uppercase tracking-wider mb-1">
                            Highest Income
                          </p>
                          <p className="text-2xl font-bold text-green-900">
                            ${incomeExpenseData.length > 0
                              ? Math.max(...incomeExpenseData.map(d => d.income)).toLocaleString('en-US', { minimumFractionDigits: 2 })
                              : '0.00'}
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            {incomeExpenseData.length > 0
                              ? incomeExpenseData.find(d => d.income === Math.max(...incomeExpenseData.map(x => x.income)))?.month || 'N/A'
                              : 'N/A'}
                          </p>
                        </div>

                        {/* Highest Expense Month */}
                        <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                          <p className="text-xs font-medium text-red-600 uppercase tracking-wider mb-1">
                            Highest Expenses
                          </p>
                          <p className="text-2xl font-bold text-red-900">
                            ${incomeExpenseData.length > 0
                              ? Math.max(...incomeExpenseData.map(d => d.expenses)).toLocaleString('en-US', { minimumFractionDigits: 2 })
                              : '0.00'}
                          </p>
                          <p className="text-xs text-red-700 mt-1">
                            {incomeExpenseData.length > 0
                              ? incomeExpenseData.find(d => d.expenses === Math.max(...incomeExpenseData.map(x => x.expenses)))?.month || 'N/A'
                              : 'N/A'}
                          </p>
                        </div>

                        {/* Average Monthly Income */}
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                          <p className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">
                            Avg Monthly Income
                          </p>
                          <p className="text-2xl font-bold text-blue-900">
                            ${incomeExpenseData.length > 0
                              ? (incomeExpenseData.reduce((acc, d) => acc + d.income, 0) / incomeExpenseData.length).toLocaleString('en-US', { minimumFractionDigits: 2 })
                              : '0.00'}
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            Over {incomeExpenseData.length} month{incomeExpenseData.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        {/* Average Monthly Expenses */}
                        <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                          <p className="text-xs font-medium text-purple-600 uppercase tracking-wider mb-1">
                            Avg Monthly Expenses
                          </p>
                          <p className="text-2xl font-bold text-purple-900">
                            ${incomeExpenseData.length > 0
                              ? (incomeExpenseData.reduce((acc, d) => acc + d.expenses, 0) / incomeExpenseData.length).toLocaleString('en-US', { minimumFractionDigits: 2 })
                              : '0.00'}
                          </p>
                          <p className="text-xs text-purple-700 mt-1">
                            Over {incomeExpenseData.length} month{incomeExpenseData.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Category Pie Chart */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <ChartWithSelector
                        title="Expenses by Category"
                        data={categoryData.map(d => ({
                          name: d.category,
                          amount: d.amount,
                        }))}
                        series={[
                          { dataKey: 'amount', name: 'Amount', color: '#3B82F6' },
                        ]}
                        defaultType="pie"
                        allowedTypes={['pie', 'bar']}
                        height={350}
                        isLoading={loading}
                      />
                    </div>

                    {/* Top 5 Categories List */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Categories</h3>
                      <div className="space-y-3">
                        {categoryData
                          .sort((a, b) => b.amount - a.amount)
                          .slice(0, 5)
                          .map((cat, index) => {
                            const percentage = summary.totalExpenses > 0
                              ? ((cat.amount / summary.totalExpenses) * 100).toFixed(1)
                              : '0.0';
                            return (
                              <div
                                key={cat.category}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group"
                                onClick={() => handleCategoryClick(cat.category)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                                    {index + 1}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900 text-sm">{cat.category}</p>
                                    <p className="text-xs text-gray-500">{percentage}% of total</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-gray-900 text-sm">
                                    ${cat.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        {categoryData.length === 0 && (
                          <p className="text-gray-500 text-sm text-center py-8">No category data available</p>
                        )}
                      </div>
                      {categoryData.length > 5 && (
                        <button
                          onClick={() => setActiveTab('by-category')}
                          className="mt-4 w-full text-sm text-blue-600 hover:text-blue-700 font-medium py-2 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View all {categoryData.length} categories
                        </button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* By Category Tab */}
                <TabsContent value="by-category" className="space-y-4">
                  <ChartWithSelector
                    title="Expenses by Category"
                    data={categoryData.map(d => ({
                      name: d.category,
                      amount: d.amount,
                    }))}
                    series={[
                      { dataKey: 'amount', name: 'Amount', color: '#8B5CF6' },
                    ]}
                    defaultType="bar"
                    allowedTypes={['bar', 'pie', 'line']}
                    height={350}
                    isLoading={loading}
                  />
                  <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50 hover:shadow-card-hover transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Category Details</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsTransactionModalOpen(true)}
                        className="hover:bg-gray-50 transition-all duration-200"
                      >
                        View All Transactions
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {categoryData.map((cat) => {
                        const percentage = (
                          (cat.amount / summary.totalExpenses) *
                          100
                        ).toFixed(1);
                        return (
                          <div
                            key={cat.category}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 hover:shadow-sm transition-all duration-200 cursor-pointer group"
                            onClick={() => handleCategoryClick(cat.category)}
                          >
                            <span className="font-medium text-gray-900 group-hover:text-profit-600 transition-colors">{cat.category}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-gray-600">{percentage}%</span>
                              <span className="font-semibold text-gray-900">
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
                <TabsContent value="by-property" className="space-y-4">
                  <HomeCategoryView data={homeCategoryData} />
                </TabsContent>

                {/* Comparison Tab */}
                <TabsContent value="comparison" className="space-y-4">
                  <ComparisonView
                    currentPeriod={{ startDate: dateRange.startDate, endDate: dateRange.endDate }}
                  />
                </TabsContent>

                {/* Metrics Tab */}
                <TabsContent value="metrics" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Profit Margin */}
                    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 group">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Profit Margin</h4>
                        <div className="p-2 bg-profit-50 rounded-lg group-hover:bg-profit-100 transition-colors">
                          <TrendingUp className="w-5 h-5 text-profit-600" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mb-1">
                        {metrics.profitMargin.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {summary.totalIncome > 0
                          ? ((summary.totalIncome - summary.totalExpenses) / summary.totalIncome * 100).toFixed(1)
                          : '0.0'}% of revenue
                      </p>
                    </div>

                    {/* ROI */}
                    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 group">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">ROI</h4>
                        <div className="p-2 bg-income-50 rounded-lg group-hover:bg-income-100 transition-colors">
                          <TrendingUp className="w-5 h-5 text-income-600" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mb-1">
                        {metrics.roi.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">Return on investment</p>
                    </div>

                    {/* Occupancy Rate */}
                    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 group">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Occupancy</h4>
                        <div className="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
                          <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mb-1">
                        {metrics.occupancyRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">Average across properties</p>
                    </div>

                    {/* Average Nightly Rate */}
                    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 group">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Avg Nightly</h4>
                        <div className="p-2 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors">
                          <TrendingUp className="w-5 h-5 text-orange-600" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mb-1">
                        ${metrics.averageNightlyRate.toFixed(0)}
                      </p>
                      <p className="text-xs text-gray-500">Per night average</p>
                    </div>
                  </div>

                  {/* Charts */}
                  <IncomeExpenseChart data={incomeExpenseData} />
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
        title={selectedCategory ? `${selectedCategory} Transactions` : 'All Transactions'}
      />
    </div>
  );
};

export default FinancialDashboard;
