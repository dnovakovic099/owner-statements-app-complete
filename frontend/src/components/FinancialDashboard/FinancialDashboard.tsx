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
  const [incomeCategories, setIncomeCategories] = useState<Array<{ name: string; amount: number; transactionCount: number; originalAccounts?: string[] }>>([]);

  // Category data metadata from API
  const [categoryDataSource, setCategoryDataSource] = useState<'quickbooks' | 'statements'>('statements');
  const [categoryMappingEnabled, setCategoryMappingEnabled] = useState(false);
  const [unmappedAccounts, setUnmappedAccounts] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [propertyFinancials, setPropertyFinancials] = useState<any[]>([]);
  const [previousPeriodData, setPreviousPeriodData] = useState({
    income: 0,
    expenses: 0,
  });

  // Lazy loading states - track what data has been fetched
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(['by-category']));
  const [tabLoading, setTabLoading] = useState<string | null>(null);

  // QuickBooks connection state
  const [qbConnectionError, setQbConnectionError] = useState<string | null>(null);

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

  // Store top properties data separately
  const [topProperties, setTopProperties] = useState<Array<{ id: number; name: string; income: number }>>([]);

  // Store By Home Type tab data
  const [byHomeTypeData, setByHomeTypeData] = useState<any>({
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
  });

  const fetchFinancialData = useCallback(async () => {
    console.log('[FinancialDashboard] Fetching financial data for date range:', dateRange);
    setLoading(true);
    setQbConnectionError(null); // Reset error state

    try {
      // Check QuickBooks connection status first
      try {
        const qbCheckResponse = await fetch('/api/quickbooks/accounts', {
          headers: { 'Authorization': 'Basic ' + btoa('LL:bnb547!') }
        });
        const qbCheckData = await qbCheckResponse.json();
        if (!qbCheckData.success) {
          setQbConnectionError('QuickBooks connection required. Please connect to QuickBooks to view financial data.');
        }
      } catch {
        setQbConnectionError('QuickBooks connection required. Please connect to QuickBooks to view financial data.');
      }

      // Helper to extract error from axios error response
      const extractError = (e: any) => ({
        success: false,
        error: e.response?.data?.error || e.response?.data?.message || e.message
      });

      // Fetch only essential data on initial load (lazy load heavy data when tabs are selected)
      const [
        summaryData,
        categoryResponseData,
        homeCategoryResponseData,
        comparisonData,
      ] = await Promise.all([
        financialsAPI.getSummary(dateRange.startDate, dateRange.endDate).catch(extractError),
        financialsAPI.getByCategory(dateRange.startDate, dateRange.endDate).catch(extractError),
        financialsAPI.getByHomeCategory(dateRange.startDate, dateRange.endDate).catch(extractError),
        // Fetch month-over-month comparison for summary badges
        financialsAPI.getComparison(dateRange.startDate, dateRange.endDate, undefined, undefined, 'mom').catch(extractError),
      ]);
      console.log('[FinancialDashboard] Essential API calls completed');
      console.log('[FinancialDashboard] homeCategoryResponseData:', JSON.stringify(homeCategoryResponseData, null, 2));

      // Also check if API responses indicate QuickBooks error (backup check)
      const qbError = [summaryData, categoryResponseData].find(
        r => r?.success === false && (r?.error?.includes('QuickBooks') || r?.error?.includes('not connected'))
      );
      if (qbError) {
        setQbConnectionError('QuickBooks connection expired or not configured. Please reconnect to view accurate financial data.');
        // Continue with whatever data is available
      }

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
          (c: { name: string; total: number; originalAccounts?: string[] }, index: number) => ({
            name: c.name,
            amount: c.total || 0,
            color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
            originalAccounts: c.originalAccounts || [],
          })
        );
        setExpenseCategories(cats);

        // Store category metadata
        setCategoryDataSource(categoryResponseData.data.source || 'statements');
        setCategoryMappingEnabled(categoryResponseData.data.categoryMapping || false);
        setUnmappedAccounts(categoryResponseData.data.unmappedAccounts || []);
      }

      // Extract income categories from API response
      if (categoryResponseData.success && categoryResponseData.data?.income?.categories) {
        const incomeCats = categoryResponseData.data.income.categories.map(
          (c: { name: string; total: number; count?: number; originalAccounts?: string[] }) => ({
            name: c.name,
            amount: c.total || 0,
            transactionCount: c.count || 0,
            originalAccounts: c.originalAccounts || [],
          })
        );
        setIncomeCategories(incomeCats);
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

        // Collect all properties from all categories for Top Properties widget
        const allPropertiesData: Array<{ id: number; name: string; income: number }> = [];

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

          // Extract properties array from this category if available
          if (c.properties && Array.isArray(c.properties)) {
            c.properties.forEach((prop: any) => {
              if (prop.income > 0) { // Only include properties with income
                allPropertiesData.push({
                  id: prop.id,
                  name: prop.name,
                  income: prop.income,
                });
              }
            });
          }
        });

        console.log('[FinancialDashboard] Final categoryMap:', categoryMap);
        console.log('[FinancialDashboard] All properties data:', allPropertiesData);

        setHomeCategories(categoryMap as {
          pm: HomeCategoryData;
          arbitrage: HomeCategoryData;
          owned: HomeCategoryData;
          shared: HomeCategoryData;
        });

        // Sort properties by income and set top 5
        const sortedProperties = allPropertiesData.sort((a, b) => b.income - a.income).slice(0, 5);
        setTopProperties(sortedProperties);
        console.log('[FinancialDashboard] Top 5 properties:', sortedProperties);

        // Transform data for ByHomeTypeTab
        const byHomeTypeTransformed: any = {
          pm: { income: [], expenses: [], churn: { count: 0, rate: 0 }, monthlyTrend: [] },
          arbitrage: { income: [], expenses: [], monthlyTrend: [] },
          owned: { income: [], expenses: [], monthlyTrend: [] },
          shared: { employeeCosts: [], refunds: 0, chargebacks: 0, monthlyTrend: [] },
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

          if (!mappedKey || !c.properties || c.properties.length === 0) {
            return;
          }

          // Calculate totals for percentage calculations
          const totalIncome = c.income || 0;
          const totalExpenses = c.expenses || 0;

          // Create income items from properties
          const incomeItems = c.properties
            .filter((p: any) => p.income > 0)
            .map((p: any) => ({
              label: p.name,
              amount: p.income,
              percentage: totalIncome > 0 ? (p.income / totalIncome) * 100 : 0,
            }))
            .sort((a: any, b: any) => b.amount - a.amount);

          // Create expense items from properties
          const expenseItems = c.properties
            .filter((p: any) => p.expenses > 0)
            .map((p: any) => ({
              label: p.name,
              amount: p.expenses,
              percentage: totalExpenses > 0 ? (p.expenses / totalExpenses) * 100 : 0,
            }))
            .sort((a: any, b: any) => b.amount - a.amount);

          if (mappedKey === 'pm') {
            byHomeTypeTransformed.pm.income = incomeItems;
            byHomeTypeTransformed.pm.expenses = expenseItems;
          } else if (mappedKey === 'arbitrage') {
            byHomeTypeTransformed.arbitrage.income = incomeItems;
            byHomeTypeTransformed.arbitrage.expenses = expenseItems;
          } else if (mappedKey === 'owned') {
            byHomeTypeTransformed.owned.income = incomeItems;
            byHomeTypeTransformed.owned.expenses = expenseItems;
          } else if (mappedKey === 'shared') {
            // For shared, map expenses to employeeCosts
            byHomeTypeTransformed.shared.employeeCosts = expenseItems;
          }
        });

        console.log('[FinancialDashboard] Transformed By Home Type data:', byHomeTypeTransformed);
        setByHomeTypeData(byHomeTypeTransformed);
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
    } catch (error: any) {
      console.error('Failed to fetch financial data:', error);
      // Check if this is a QuickBooks connection error
      if (error?.response?.status === 503 || error?.message?.includes('QuickBooks') || error?.message?.includes('not connected')) {
        setQbConnectionError('QuickBooks connection required. Please connect to QuickBooks to view financial data.');
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // Lazy load data for specific tabs when they are selected
  const loadTabData = useCallback(async (tab: string) => {
    if (loadedTabs.has(tab) || !dateRange.startDate || !dateRange.endDate) {
      return; // Already loaded or no date range
    }

    setTabLoading(tab);
    console.log(`[FinancialDashboard] Lazy loading data for tab: ${tab}`);

    try {
      if (tab === 'by-property') {
        // Load property financials data
        const propertyData = await financialsAPI.getByProperty(6);

        if (propertyData?.success && propertyData.data?.properties) {
          console.log('[FinancialDashboard] Property data received:', propertyData.data.properties.length, 'properties');

          const transformedProperties = propertyData.data.properties.map((prop: any) => {
            let homeCategory: 'PM' | 'Arbitrage' | 'Owned' = 'PM';
            if (prop.homeCategory) {
              const cat = prop.homeCategory.toLowerCase();
              if (cat === 'pm' || cat.includes('property') || cat.includes('manage')) {
                homeCategory = 'PM';
              } else if (cat === 'arbitrage' || cat.includes('arb')) {
                homeCategory = 'Arbitrage';
              } else if (cat === 'owned' || cat.includes('own')) {
                homeCategory = 'Owned';
              }
            }

            return {
              propertyId: prop.id,
              propertyName: prop.name,
              homeCategory,
              bankAccount: undefined,
              monthlyData: (prop.monthlyData || []).map((m: any) => ({
                month: m.month,
                netIncome: m.net || 0,
                grossRevenue: m.income || 0,
                totalExpenses: m.expenses || 0,
                sharedExpenses: 0,
              })),
              lifetimeTotal: {
                netIncome: prop.summary?.netIncome || 0,
                grossRevenue: prop.summary?.totalIncome || 0,
                totalExpenses: prop.summary?.totalExpenses || 0,
              },
            };
          });

          setPropertyFinancials(transformedProperties);
        }
      }

      // Mark tab as loaded
      setLoadedTabs(prev => new Set([...Array.from(prev), tab]));
    } catch (error) {
      console.error(`Failed to load data for tab ${tab}:`, error);
    } finally {
      setTabLoading(null);
    }
  }, [dateRange, loadedTabs]);

  // Handle tab change - trigger lazy loading
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    loadTabData(tab);
  }, [loadTabData]);

  // Fetch financial data when date range changes (with debounce)
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      // Reset loaded tabs when date range changes
      setLoadedTabs(new Set(['by-category']));
      setPropertyFinancials([]);

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
      <div className="p-4 space-y-3 pb-20">
        {/* Date Range Filter */}
        <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

        {/* QuickBooks Connection Required Banner */}
        {qbConnectionError && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-amber-900">QuickBooks Connection Required</h3>
                <p className="text-sm text-amber-800 mt-1">
                  Financial data is currently unavailable. Connect to QuickBooks to view real-time income, expenses, and financial reports.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <a
                    href="/api/quickbooks/auth-url"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                    Connect to QuickBooks
                  </a>
                  <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
                    Data shown below is placeholder only
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 auto-rows-fr">
          {/* Column 1: Profit & Loss + Top Properties */}
          <div className="flex flex-col gap-3 min-h-[400px]">
            <ProfitLossWidget
              income={summary.totalIncome}
              expenses={summary.totalExpenses}
              previousIncome={previousPeriodData.income}
              previousExpenses={previousPeriodData.expenses}
            />
            <TopPropertiesWidget
              properties={topProperties}
            />
          </div>

          {/* Column 2: Expenses Category Chart */}
          <div className="min-h-[400px]">
            <ExpensesCategoryChart
              categories={expenseCategories}
              total={summary.totalExpenses}
              onCategoryClick={handleCategoryClick}
            />
          </div>

          {/* Column 3: Insights + Quick Stats */}
          <div className="flex flex-col gap-3 min-h-[400px]">
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
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
              categories={[
                // Income categories
                ...incomeCategories.map(cat => ({
                  category: cat.name as any,
                  amount: cat.amount,
                  transactionCount: cat.transactionCount,
                  type: 'income' as const,
                  originalAccounts: cat.originalAccounts,
                })),
                // Expense categories
                ...expenseCategories.map(cat => ({
                  category: cat.name as any,
                  amount: cat.amount,
                  transactionCount: 0,
                  type: 'expense' as const,
                  originalAccounts: (cat as any).originalAccounts,
                })),
              ]}
              dateRange={dateRange}
              isLoading={loading}
              dataSource={categoryDataSource}
              categoryMapping={categoryMappingEnabled}
              unmappedAccounts={unmappedAccounts}
            />
          </TabsContent>

          {/* By Property Tab */}
          <TabsContent value="by-property">
            <ByPropertyTab
              properties={propertyFinancials}
              dateRange={dateRange}
              onCellClick={(propertyId, month) => console.log('Cell clicked:', propertyId, month)}
              onPropertyClick={(propertyId) => console.log('Property clicked:', propertyId)}
              isLoading={tabLoading === 'by-property'}
            />
          </TabsContent>

          {/* By Home Type Tab */}
          <TabsContent value="by-home-type">
            <ByHomeTypeTab
              dateRange={dateRange}
              data={byHomeTypeData}
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
