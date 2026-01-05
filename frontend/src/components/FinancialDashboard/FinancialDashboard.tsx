import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { PieChart, Home, GitCompare, TrendingUp, Percent } from 'lucide-react';
import DateRangeFilter, { DateRange } from './DateRangeFilter';
import { DashboardHeader } from './components/DashboardHeader';
import { SummaryCardsRow } from './components/SummaryCardsRow';
import { generateSampleSparklineData } from './components/SummaryCardsRow';
import ProfitLossWidget from './MiddleRow/ProfitLossWidget';
import ExpensesCategoryChart, { ExpenseCategory } from './MiddleRow/ExpensesCategoryChart';
import InsightsFeed, { Insight } from './MiddleRow/InsightsFeed';
import TopPropertiesWidget from './MiddleRow/TopPropertiesWidget';
import QuickStatsWidget from './MiddleRow/QuickStatsWidget';
import { HomeCategoriesRow, CategoryData as HomeCategoryData } from './components/HomeCategoriesRow';
import TransactionModal, { Transaction } from './TransactionModal';
import ByCategoryTab from './tabs/ByCategoryTab';
import ByPropertyTab from './tabs/ByPropertyTab';
import ByHomeTypeTab from './tabs/ByHomeTypeTab';
import ComparisonTab from './tabs/ComparisonTab';
import { financialsAPI } from '../../services/api';

interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  profitMargin: number;
  incomeChange: number;
  expensesChange: number;
  netChange: number;
  marginChange: number;
}

interface FinancialDashboardProps {
  onBack?: () => void;
}

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ onBack }) => {
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('by-category');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);

  // Financial data states
  const [summary, setSummary] = useState<FinancialSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    netIncome: 0,
    profitMargin: 0,
    incomeChange: 0,
    expensesChange: 0,
    netChange: 0,
    marginChange: 0,
  });

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [previousPeriodData, setPreviousPeriodData] = useState({
    income: 0,
    expenses: 0,
  });

  // Home categories data for HomeCategoriesRow
  const [homeCategories, setHomeCategories] = useState<{
    pm: HomeCategoryData;
    arbitrage: HomeCategoryData;
    owned: HomeCategoryData;
    shared: HomeCategoryData;
  }>({
    pm: { income: 0, expenses: 0, net: 0, propertyCount: 0 },
    arbitrage: { income: 0, expenses: 0, net: 0, propertyCount: 0 },
    owned: { income: 0, expenses: 0, net: 0, propertyCount: 0 },
    shared: { income: 0, expenses: 0, net: 0, propertyCount: 0, perProperty: 0 },
  });

  const fetchFinancialData = useCallback(async () => {
    console.log('[FinancialDashboard] Fetching financial data for date range:', dateRange);
    setLoading(true);
    try {
      // Fetch all data in parallel using the financials API
      const [
        summaryData,
        categoryResponseData,
        homeCategoryResponseData,
        transactionsData,
        comparisonData,
      ] = await Promise.all([
        financialsAPI.getSummary(dateRange.startDate, dateRange.endDate),
        financialsAPI.getByCategory(dateRange.startDate, dateRange.endDate),
        financialsAPI.getByHomeCategory(dateRange.startDate, dateRange.endDate),
        financialsAPI.getTransactions(dateRange.startDate, dateRange.endDate),
        // Fetch month-over-month comparison for summary badges
        financialsAPI.getComparison(dateRange.startDate, dateRange.endDate, undefined, undefined, 'mom'),
      ]);
      console.log('[FinancialDashboard] All API calls completed');
      console.log('[FinancialDashboard] homeCategoryResponseData:', JSON.stringify(homeCategoryResponseData, null, 2));

      // Extract comparison percentages and previous period data
      let incomeChange = 0;
      let expensesChange = 0;
      let netChange = 0;
      let marginChange = 0;
      let prevIncome = 0;
      let prevExpenses = 0;

      if (comparisonData?.success && comparisonData.data?.changes) {
        incomeChange = comparisonData.data.changes.income?.percent || 0;
        expensesChange = comparisonData.data.changes.expenses?.percent || 0;
        netChange = comparisonData.data.changes.netIncome?.percent || 0;
        marginChange = comparisonData.data.changes.profitMargin?.percent || 0;

        // Get previous period values
        prevIncome = comparisonData.data.previousPeriod?.totalIncome || 0;
        prevExpenses = comparisonData.data.previousPeriod?.totalExpenses || 0;
      }

      setPreviousPeriodData({
        income: prevIncome,
        expenses: prevExpenses,
      });

      // Update state with fetched data
      if (summaryData.success && summaryData.data?.summary) {
        const s = summaryData.data.summary;
        const netIncome = (s.totalIncome || 0) - (s.totalExpenses || 0);
        const profitMargin = s.totalIncome > 0 ? (netIncome / s.totalIncome) * 100 : 0;

        console.log('[FinancialDashboard] Summary API response:', s);
        setSummary({
          totalIncome: s.totalIncome || 0,
          totalExpenses: s.totalExpenses || 0,
          netIncome,
          profitMargin,
          incomeChange,
          expensesChange,
          netChange,
          marginChange,
        });
      }

      if (categoryResponseData.success && categoryResponseData.data?.expenses?.categories) {
        // Map to ExpenseCategory format with colors
        const DEFAULT_COLORS = [
          '#2563eb', '#0891b2', '#6366f1', '#8b5cf6', '#64748b',
          '#0ea5e9', '#06b6d4', '#6d28d9', '#475569', '#3b82f6',
        ];

        const cats: ExpenseCategory[] = categoryResponseData.data.expenses.categories.map(
          (c: { name: string; total: number }, index: number) => ({
            name: c.name,
            amount: c.total || 0,
            color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          })
        );
        setExpenseCategories(cats);
      }

      if (homeCategoryResponseData.success && homeCategoryResponseData.data?.categories) {
        // Map to home categories format
        console.log('[FinancialDashboard] Home category API response:', homeCategoryResponseData.data.categories);

        const categoryMap: Record<string, HomeCategoryData> = {
          pm: { income: 0, expenses: 0, net: 0, propertyCount: 0 },
          arbitrage: { income: 0, expenses: 0, net: 0, propertyCount: 0 },
          owned: { income: 0, expenses: 0, net: 0, propertyCount: 0 },
          shared: { income: 0, expenses: 0, net: 0, propertyCount: 0, perProperty: 0 },
        };

        homeCategoryResponseData.data.categories.forEach((c: any) => {
          const key = c.category.toLowerCase().replace(/\s+/g, '-');
          let mappedKey: 'pm' | 'arbitrage' | 'owned' | 'shared' | null = null;

          if (key.includes('property-management') || key.includes('pm')) {
            mappedKey = 'pm';
          } else if (key.includes('arbitrage')) {
            mappedKey = 'arbitrage';
          } else if (key.includes('owned')) {
            mappedKey = 'owned';
          } else if (key.includes('shared') || key.includes('partnership')) {
            mappedKey = 'shared';
          }

          console.log(`[FinancialDashboard] Mapping category "${c.category}" (key="${key}") -> "${mappedKey}", income=${c.income}, properties=${c.propertyCount}`);

          if (!mappedKey) {
            console.log(`[FinancialDashboard] Skipping unknown category: ${c.category}`);
            return;
          }

          categoryMap[mappedKey] = {
            income: c.income || 0,
            expenses: c.expenses || 0,
            net: c.netIncome || 0,
            propertyCount: c.propertyCount || 0,
            ...(mappedKey === 'shared' && {
              perProperty: c.propertyCount > 0 ? (c.netIncome || 0) / c.propertyCount : 0,
            }),
          };
        });

        console.log('[FinancialDashboard] Final categoryMap:', categoryMap);
        setHomeCategories(categoryMap as {
          pm: HomeCategoryData;
          arbitrage: HomeCategoryData;
          owned: HomeCategoryData;
          shared: HomeCategoryData;
        });
      }

      if (transactionsData.success && transactionsData.data?.transactions) {
        setTransactions(transactionsData.data.transactions || []);
      }

      // Generate sample insights based on data
      const newInsights: Insight[] = [];
      if (incomeChange > 10) {
        newInsights.push({
          id: '1',
          type: 'trend-up',
          message: `Income is up ${incomeChange.toFixed(1)}% compared to last period`,
          timestamp: 'Just now',
        });
      } else if (incomeChange < -10) {
        newInsights.push({
          id: '2',
          type: 'warning',
          message: `Income is down ${Math.abs(incomeChange).toFixed(1)}% compared to last period`,
          timestamp: 'Just now',
        });
      }

      if (expensesChange > 15) {
        newInsights.push({
          id: '3',
          type: 'warning',
          message: `Expenses increased by ${expensesChange.toFixed(1)}% - review spending`,
          timestamp: 'Just now',
        });
      }

      setInsights(newInsights);
    } catch (error) {
      console.error('Failed to fetch financial data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // Fetch financial data when date range changes (with debounce)
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      // Debounce to avoid rapid API calls when clicking filter buttons
      const timeoutId = setTimeout(() => {
        fetchFinancialData();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [dateRange, fetchFinancialData]);

  // Event handlers
  const handleCategoryClick = (category: ExpenseCategory) => {
    setSelectedCategory(category.name);
    setIsTransactionModalOpen(true);
  };

  const handleHomeCategoryClick = (categoryType: 'pm' | 'arbitrage' | 'owned' | 'shared') => {
    console.log(`Home category clicked: ${categoryType}`);
    // Could navigate to detailed view or show modal
  };

  const handleSummaryCardClick = (cardType: 'income' | 'expenses' | 'net' | 'margin') => {
    console.log(`Summary card clicked: ${cardType}`);
    // Could navigate to detailed view
  };

  const handleInsightClick = (insight: Insight) => {
    console.log('Insight clicked:', insight);
    // Could navigate or show more details
  };

  const handleExportData = () => {
    // Create CSV export of financial data
    const csvRows: string[][] = [];
    csvRows.push(['Financial Dashboard Export', `${dateRange.startDate} to ${dateRange.endDate}`]);
    csvRows.push([]);
    csvRows.push(['Summary']);
    csvRows.push(['Total Income', `$${summary.totalIncome.toFixed(2)}`]);
    csvRows.push(['Total Expenses', `$${summary.totalExpenses.toFixed(2)}`]);
    csvRows.push(['Net Income', `$${summary.netIncome.toFixed(2)}`]);
    csvRows.push(['Profit Margin', `${summary.profitMargin.toFixed(2)}%`]);
    csvRows.push([]);
    csvRows.push(['Category', 'Amount']);
    expenseCategories.forEach((cat) => {
      csvRows.push([cat.name, `$${cat.amount.toFixed(2)}`]);
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

  // Generate sparkline data for summary cards
  const sparklineData = {
    income: generateSampleSparklineData(6, summary.totalIncome / 6),
    expenses: generateSampleSparklineData(6, summary.totalExpenses / 6),
    net: generateSampleSparklineData(6, summary.netIncome / 6),
    margin: generateSampleSparklineData(6, summary.profitMargin),
  };

  return (
    <div className="h-full bg-gray-50 overflow-y-auto flex flex-col">
      {/* Dashboard Header */}
      <DashboardHeader
        onExportData={handleExportData}
        notificationCount={insights.length}
      />

      {/* Main Content - scrollable with tighter spacing */}
      <div className="p-4 space-y-4 pb-20">
        {/* Date Range Filter */}
        <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

        {/* Summary Cards Row */}
        <SummaryCardsRow
          totalIncome={summary.totalIncome}
          totalExpenses={summary.totalExpenses}
          netIncome={summary.netIncome}
          profitMargin={summary.profitMargin}
          incomeChange={summary.incomeChange}
          expensesChange={summary.expensesChange}
          netChange={summary.netChange}
          marginChange={summary.marginChange}
          sparklineData={sparklineData}
          onCardClick={handleSummaryCardClick}
        />

        {/* Middle Row: 3-column grid with stacked widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Column 1: Profit & Loss + Top Properties */}
          <div className="space-y-4">
            <ProfitLossWidget
              income={summary.totalIncome}
              expenses={summary.totalExpenses}
              previousIncome={previousPeriodData.income}
              previousExpenses={previousPeriodData.expenses}
            />
            <TopPropertiesWidget
              properties={homeCategories.pm.propertyCount > 0
                ? transactions.slice(0, 5).map((t, i) => ({
                    id: i,
                    name: t.description || `Property ${i + 1}`,
                    income: t.amount > 0 ? t.amount : 0,
                  }))
                : []
              }
            />
          </div>

          {/* Column 2: Expenses Category Chart */}
          <ExpensesCategoryChart
            categories={expenseCategories}
            total={summary.totalExpenses}
            onCategoryClick={handleCategoryClick}
          />

          {/* Column 3: Insights + Quick Stats */}
          <div className="space-y-4">
            <InsightsFeed
              insights={insights}
              onInsightClick={handleInsightClick}
            />
            <QuickStatsWidget
              propertyCount={homeCategories.pm.propertyCount + homeCategories.arbitrage.propertyCount + homeCategories.owned.propertyCount}
              avgIncomePerProperty={
                homeCategories.pm.propertyCount > 0
                  ? summary.totalIncome / homeCategories.pm.propertyCount
                  : 0
              }
              periodLabel={`${new Date(dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(dateRange.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            />
          </div>
        </div>

        {/* Home Categories Row */}
        <HomeCategoriesRow
          categories={homeCategories}
          onCategoryClick={handleHomeCategoryClick}
        />

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="by-category">
              <PieChart className="w-4 h-4 mr-2" />
              By Category
            </TabsTrigger>
            <TabsTrigger value="by-property">
              <Home className="w-4 h-4 mr-2" />
              By Property
            </TabsTrigger>
            <TabsTrigger value="by-home-type">
              <Home className="w-4 h-4 mr-2" />
              By Home Type
            </TabsTrigger>
            <TabsTrigger value="comparison">
              <GitCompare className="w-4 h-4 mr-2" />
              Comparison
            </TabsTrigger>
            <TabsTrigger value="roi">
              <Percent className="w-4 h-4 mr-2" />
              ROI
            </TabsTrigger>
          </TabsList>

          {/* By Category Tab */}
          <TabsContent value="by-category">
            <ByCategoryTab
              categories={expenseCategories.map(cat => ({
                category: cat.name as any,
                amount: cat.amount,
                transactionCount: 0,
                type: 'expense' as const,
                percentage: summary.totalExpenses > 0 ? (cat.amount / summary.totalExpenses) * 100 : 0,
              }))}
              dateRange={dateRange}
              isLoading={loading}
            />
          </TabsContent>

          {/* By Property Tab */}
          <TabsContent value="by-property">
            <ByPropertyTab
              properties={[]}
              dateRange={dateRange}
              onCellClick={(propertyId, month) => console.log('Cell clicked:', propertyId, month)}
              onPropertyClick={(propertyId) => console.log('Property clicked:', propertyId)}
              isLoading={loading}
            />
          </TabsContent>

          {/* By Home Type Tab */}
          <TabsContent value="by-home-type">
            <ByHomeTypeTab
              dateRange={dateRange}
              data={{
                pm: {
                  income: [],
                  expenses: [],
                  churn: { count: 0, rate: 0 },
                  monthlyTrend: [],
                },
                arbitrage: {
                  income: [],
                  expenses: [],
                  monthlyTrend: [],
                },
                owned: {
                  income: [],
                  expenses: [],
                  monthlyTrend: [],
                },
                shared: {
                  employeeCosts: [],
                  refunds: 0,
                  chargebacks: 0,
                  monthlyTrend: [],
                },
              }}
            />
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison">
            <ComparisonTab
              currentPeriod={{
                label: 'Current Period',
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                data: {
                  income: summary.totalIncome,
                  expenses: summary.totalExpenses,
                  netIncome: summary.netIncome,
                  profitMargin: summary.profitMargin,
                  propertyCount: homeCategories.pm.propertyCount + homeCategories.arbitrage.propertyCount + homeCategories.owned.propertyCount,
                  avgPerProperty: 0,
                },
              }}
              previousPeriod={{
                label: 'Previous Period',
                startDate: '',
                endDate: '',
                data: {
                  income: previousPeriodData.income,
                  expenses: previousPeriodData.expenses,
                  netIncome: previousPeriodData.income - previousPeriodData.expenses,
                  profitMargin: previousPeriodData.income > 0
                    ? ((previousPeriodData.income - previousPeriodData.expenses) / previousPeriodData.income) * 100
                    : 0,
                  propertyCount: 0,
                  avgPerProperty: 0,
                },
              }}
            />
          </TabsContent>

          {/* ROI Tab */}
          <TabsContent value="roi">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 mb-4">
                  <TrendingUp className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">ROI Analysis</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Return on Investment metrics and property performance analysis
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100">
                    <p className="text-sm font-medium text-gray-600 mb-2">Average ROI</p>
                    <p className="text-3xl font-bold text-gray-900">--</p>
                    <p className="text-xs text-gray-500 mt-1">Across all properties</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                    <p className="text-sm font-medium text-gray-600 mb-2">Best Performing</p>
                    <p className="text-3xl font-bold text-gray-900">--</p>
                    <p className="text-xs text-gray-500 mt-1">Property name</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-6 border border-orange-100">
                    <p className="text-sm font-medium text-gray-600 mb-2">Total Return</p>
                    <p className="text-3xl font-bold text-gray-900">--</p>
                    <p className="text-xs text-gray-500 mt-1">Year to date</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
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
