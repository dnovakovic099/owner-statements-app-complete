import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

// ============================================================================
// Type Definitions
// ============================================================================

export type HomeCategory = 'Property Management' | 'Arbitrage' | 'Owned' | 'Shared';

export interface IncomeItem {
  label: string;
  amount: number;
  percentage: number;
}

export interface ExpenseItem {
  label: string;
  amount: number;
  percentage: number;
}

export interface MonthlyTrendData {
  month: string; // YYYY-MM format
  income: number;
  expenses: number;
  netIncome: number;
}

export interface PMData {
  income: IncomeItem[];
  expenses: ExpenseItem[];
  churn: {
    count: number;
    rate: number;
  };
  monthlyTrend: MonthlyTrendData[];
}

export interface ArbitrageData {
  income: IncomeItem[];
  expenses: ExpenseItem[];
  monthlyTrend: MonthlyTrendData[];
}

export interface HomeOwnedData {
  income: IncomeItem[];
  expenses: ExpenseItem[];
  monthlyTrend: MonthlyTrendData[];
}

export interface SharedData {
  employeeCosts: ExpenseItem[]; // by department
  refunds: number;
  chargebacks: number;
  monthlyTrend: MonthlyTrendData[];
}

export interface ByHomeTypeData {
  pm: PMData;
  arbitrage: ArbitrageData;
  owned: HomeOwnedData;
  shared: SharedData;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ByHomeTypeTabProps {
  data: ByHomeTypeData;
  dateRange: DateRange;
  onItemClick?: (category: HomeCategory, type: 'income' | 'expense', item: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const CHART_COLORS = {
  income: '#10B981',    // green-500
  expenses: '#EF4444',  // red-500
  netIncome: '#3B82F6', // blue-500
  grid: '#E5E7EB',      // gray-200
  text: '#6B7280',      // gray-500
} as const;

const TOP_ITEMS_COUNT = 5;

// ============================================================================
// Utility Functions
// ============================================================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCurrencyCompact = (value: number): string => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return formatCurrency(value);
};

const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

// ============================================================================
// Icons Components
// ============================================================================

const TrendUpIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const TrendDownIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
  </svg>
);

const ChevronDownIcon = ({ className = '' }: { className?: string }) => (
  <svg className={`w-5 h-5 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const DollarIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

// ============================================================================
// Summary Card Component
// ============================================================================

interface SummaryCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  type: 'income' | 'expense' | 'neutral';
  subtitle?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, type, subtitle }) => {
  const bgColor = type === 'income' ? 'bg-green-50' : type === 'expense' ? 'bg-red-50' : 'bg-blue-50';
  const borderColor = type === 'income' ? 'border-green-200' : type === 'expense' ? 'border-red-200' : 'border-blue-200';
  const textColor = type === 'income' ? 'text-green-600' : type === 'expense' ? 'text-red-600' : 'text-blue-600';
  const iconBg = type === 'income' ? 'bg-green-100' : type === 'expense' ? 'bg-red-100' : 'bg-blue-100';

  return (
    <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${textColor} mt-1`}>{formatCurrency(value)}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${iconBg} ${textColor} p-3 rounded-full`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Summary Cards Row Component
// ============================================================================

interface SummaryCardsProps {
  totalIncome: number;
  totalExpenses: number;
  itemCount: number;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ totalIncome, totalExpenses, itemCount }) => {
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : '0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <SummaryCard
        title="Total Income"
        value={totalIncome}
        icon={<TrendUpIcon />}
        type="income"
        subtitle={`From ${itemCount} properties`}
      />
      <SummaryCard
        title="Total Expenses"
        value={totalExpenses}
        icon={<TrendDownIcon />}
        type="expense"
        subtitle="Operating costs"
      />
      <SummaryCard
        title="Net Profit"
        value={netProfit}
        icon={<DollarIcon />}
        type={netProfit >= 0 ? 'income' : 'expense'}
        subtitle={`${profitMargin}% margin`}
      />
    </div>
  );
};

// ============================================================================
// Custom Tooltip Component
// ============================================================================

const CustomTrendTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const income = payload.find((p: any) => p.dataKey === 'income')?.value || 0;
    const expenses = payload.find((p: any) => p.dataKey === 'expenses')?.value || 0;
    const netIncome = income - expenses;

    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-2">{formatMonth(label)}</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span className="font-medium">Income:</span>
            <span className="font-semibold">{formatCurrency(income)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span className="font-medium">Expenses:</span>
            <span className="font-semibold">{formatCurrency(expenses)}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-gray-600">
            <span className="font-medium">Net Income:</span>
            <span className={`font-semibold ${netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(netIncome)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// ============================================================================
// Enhanced Breakdown Card Component
// ============================================================================

interface BreakdownCardProps {
  title: string;
  items: Array<{ label: string; amount: number; percentage: number }>;
  type: 'income' | 'expense';
  onItemClick?: (item: string) => void;
  extraContent?: React.ReactNode;
}

const BreakdownCard: React.FC<BreakdownCardProps> = ({
  title,
  items,
  type,
  onItemClick,
  extraContent,
}) => {
  const [showAll, setShowAll] = useState(false);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const colorClass = type === 'income' ? 'text-green-600' : 'text-red-600';
  const bgClass = type === 'income' ? 'bg-green-50' : 'bg-red-50';
  const borderClass = type === 'income' ? 'border-green-200' : 'border-red-200';
  const barColor = type === 'income' ? 'bg-green-500' : 'bg-red-500';

  const displayItems = showAll ? items : items.slice(0, TOP_ITEMS_COUNT);
  const hiddenCount = items.length - TOP_ITEMS_COUNT;
  const hiddenTotal = items.slice(TOP_ITEMS_COUNT).reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`${bgClass} border-b ${borderClass} px-5 py-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">
            {items.length} items
          </span>
        </div>
        <p className={`text-2xl font-bold ${colorClass} mt-1`}>{formatCurrency(total)}</p>
      </div>

      {/* Items List */}
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No items to display</p>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item, index) => (
              <div
                key={index}
                className={`group rounded-lg transition-all ${
                  onItemClick
                    ? 'hover:bg-gray-50 cursor-pointer hover:shadow-sm'
                    : ''
                }`}
                onClick={() => onItemClick?.(item.label)}
              >
                <div className="flex items-center justify-between py-2 px-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${bgClass} flex items-center justify-center`}>
                      <span className="text-xs font-bold text-gray-600">#{index + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-gray-700">
                        {item.label}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                          <div
                            className={`h-full ${barColor} transition-all`}
                            style={{ width: `${Math.min(item.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${colorClass} ml-4 flex-shrink-0`}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              </div>
            ))}

            {/* Show More / Show Less Button */}
            {items.length > TOP_ITEMS_COUNT && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(!showAll);
                }}
                className="w-full mt-2 py-2 px-4 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {showAll ? (
                  <>
                    Show Less
                    <ChevronDownIcon className="rotate-180" />
                  </>
                ) : (
                  <>
                    Show {hiddenCount} More ({formatCurrencyCompact(hiddenTotal)})
                    <ChevronDownIcon />
                  </>
                )}
              </button>
            )}
          </div>
        )}
        {extraContent && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {extraContent}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Top Performers Chart Component
// ============================================================================

interface TopPerformersChartProps {
  incomeItems: IncomeItem[];
  expenseItems: ExpenseItem[];
}

const TopPerformersChart: React.FC<TopPerformersChartProps> = ({ incomeItems, expenseItems }) => {
  // Combine income and expenses for each property
  const propertyData = useMemo(() => {
    const propertyMap = new Map<string, { name: string; income: number; expenses: number; net: number }>();

    incomeItems.forEach(item => {
      if (!propertyMap.has(item.label)) {
        propertyMap.set(item.label, { name: item.label, income: 0, expenses: 0, net: 0 });
      }
      const prop = propertyMap.get(item.label)!;
      prop.income = item.amount;
      prop.net = prop.income - prop.expenses;
    });

    expenseItems.forEach(item => {
      if (!propertyMap.has(item.label)) {
        propertyMap.set(item.label, { name: item.label, income: 0, expenses: 0, net: 0 });
      }
      const prop = propertyMap.get(item.label)!;
      prop.expenses = item.amount;
      prop.net = prop.income - prop.expenses;
    });

    return Array.from(propertyMap.values())
      .sort((a, b) => b.net - a.net)
      .slice(0, 8)
      .map(p => ({
        ...p,
        name: p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name,
      }));
  }, [incomeItems, expenseItems]);

  if (propertyData.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performers by Net Profit</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={propertyData} layout="vertical" margin={{ left: 20, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis type="number" tickFormatter={formatCurrencyCompact} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => formatCurrency(value as number)}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="net" name="Net Profit" radius={[0, 4, 4, 0]}>
            {propertyData.map((entry, index) => (
              <Cell key={index} fill={entry.net >= 0 ? CHART_COLORS.income : CHART_COLORS.expenses} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// Category Selector Component
// ============================================================================

interface CategorySelectorProps {
  selected: HomeCategory;
  onSelect: (category: HomeCategory) => void;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ selected, onSelect }) => {
  const categories: { key: HomeCategory; icon: React.ReactNode }[] = [
    { key: 'Property Management', icon: <HomeIcon /> },
    { key: 'Arbitrage', icon: <HomeIcon /> },
    { key: 'Owned', icon: <HomeIcon /> },
    { key: 'Shared', icon: <DollarIcon /> },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map(({ key, icon }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            selected === key
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {icon}
          {key}
        </button>
      ))}
    </div>
  );
};

// ============================================================================
// Monthly Trend Chart Component
// ============================================================================

interface MonthlyTrendChartProps {
  data: MonthlyTrendData[];
  height?: number;
}

const MonthlyTrendChart: React.FC<MonthlyTrendChartProps> = ({ data, height = 300 }) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300"
        style={{ height }}
      >
        <p className="text-gray-500 text-sm">No trend data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Trend</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.income} stopOpacity={0.8} />
              <stop offset="95%" stopColor={CHART_COLORS.income} stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.expenses} stopOpacity={0.8} />
              <stop offset="95%" stopColor={CHART_COLORS.expenses} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tickFormatter={formatCurrencyCompact}
            tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
          />
          <Tooltip content={<CustomTrendTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke={CHART_COLORS.income}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorIncome)"
          />
          <Area
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke={CHART_COLORS.expenses}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorExpenses)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// Main ByHomeTypeTab Component
// ============================================================================

const ByHomeTypeTab: React.FC<ByHomeTypeTabProps> = ({ data, dateRange, onItemClick }) => {
  const [selectedCategory, setSelectedCategory] = useState<HomeCategory>('Property Management');

  const handleItemClick = (type: 'income' | 'expense', item: string) => {
    onItemClick?.(selectedCategory, type, item);
  };

  // Calculate totals for current category
  const getCurrentTotals = () => {
    switch (selectedCategory) {
      case 'Property Management':
        return {
          income: data.pm.income.reduce((sum, i) => sum + i.amount, 0),
          expenses: data.pm.expenses.reduce((sum, i) => sum + i.amount, 0),
          count: data.pm.income.length,
        };
      case 'Arbitrage':
        return {
          income: data.arbitrage.income.reduce((sum, i) => sum + i.amount, 0),
          expenses: data.arbitrage.expenses.reduce((sum, i) => sum + i.amount, 0),
          count: data.arbitrage.income.length,
        };
      case 'Owned':
        return {
          income: data.owned.income.reduce((sum, i) => sum + i.amount, 0),
          expenses: data.owned.expenses.reduce((sum, i) => sum + i.amount, 0),
          count: data.owned.income.length,
        };
      case 'Shared':
        return {
          income: 0,
          expenses: data.shared.employeeCosts.reduce((sum, i) => sum + i.amount, 0) + data.shared.refunds + data.shared.chargebacks,
          count: data.shared.employeeCosts.length,
        };
      default:
        return { income: 0, expenses: 0, count: 0 };
    }
  };

  const totals = getCurrentTotals();

  // Render content based on selected category
  const renderCategoryContent = () => {
    switch (selectedCategory) {
      case 'Property Management':
        return (
          <>
            <SummaryCards
              totalIncome={totals.income}
              totalExpenses={totals.expenses}
              itemCount={totals.count}
            />

            <TopPerformersChart
              incomeItems={data.pm.income}
              expenseItems={data.pm.expenses}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <BreakdownCard
                title="Income Breakdown"
                items={data.pm.income}
                type="income"
                onItemClick={(item) => handleItemClick('income', item)}
              />
              <BreakdownCard
                title="Expense Breakdown"
                items={data.pm.expenses}
                type="expense"
                onItemClick={(item) => handleItemClick('expense', item)}
                extraContent={
                  data.pm.churn && (
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        Churn Metrics
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-white rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{data.pm.churn.count}</p>
                          <p className="text-xs text-gray-500">Properties Lost</p>
                        </div>
                        <div className="text-center p-3 bg-white rounded-lg">
                          <p className="text-2xl font-bold text-orange-600">{data.pm.churn.rate.toFixed(1)}%</p>
                          <p className="text-xs text-gray-500">Churn Rate</p>
                        </div>
                      </div>
                    </div>
                  )
                }
              />
            </div>
            <div className="mt-6">
              <MonthlyTrendChart data={data.pm.monthlyTrend} />
            </div>
          </>
        );

      case 'Arbitrage':
        return (
          <>
            <SummaryCards
              totalIncome={totals.income}
              totalExpenses={totals.expenses}
              itemCount={totals.count}
            />

            <TopPerformersChart
              incomeItems={data.arbitrage.income}
              expenseItems={data.arbitrage.expenses}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <BreakdownCard
                title="Income Breakdown"
                items={data.arbitrage.income}
                type="income"
                onItemClick={(item) => handleItemClick('income', item)}
              />
              <BreakdownCard
                title="Expense Breakdown"
                items={data.arbitrage.expenses}
                type="expense"
                onItemClick={(item) => handleItemClick('expense', item)}
              />
            </div>
            <div className="mt-6">
              <MonthlyTrendChart data={data.arbitrage.monthlyTrend} />
            </div>
          </>
        );

      case 'Owned':
        return (
          <>
            <SummaryCards
              totalIncome={totals.income}
              totalExpenses={totals.expenses}
              itemCount={totals.count}
            />

            <TopPerformersChart
              incomeItems={data.owned.income}
              expenseItems={data.owned.expenses}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <BreakdownCard
                title="Income Breakdown"
                items={data.owned.income}
                type="income"
                onItemClick={(item) => handleItemClick('income', item)}
              />
              <BreakdownCard
                title="Expense Breakdown"
                items={data.owned.expenses}
                type="expense"
                onItemClick={(item) => handleItemClick('expense', item)}
              />
            </div>
            <div className="mt-6">
              <MonthlyTrendChart data={data.owned.monthlyTrend} />
            </div>
          </>
        );

      case 'Shared':
        const totalEmployeeCosts = data.shared.employeeCosts.reduce((sum, item) => sum + item.amount, 0);
        const otherCosts = data.shared.refunds + data.shared.chargebacks;
        const totalSharedExpenses = totalEmployeeCosts + otherCosts;

        return (
          <>
            {/* Summary Cards for Shared */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <SummaryCard
                title="Employee Costs"
                value={totalEmployeeCosts}
                icon={<DollarIcon />}
                type="expense"
                subtitle={`${data.shared.employeeCosts.length} departments`}
              />
              <SummaryCard
                title="Other Costs"
                value={otherCosts}
                icon={<TrendDownIcon />}
                type="expense"
                subtitle="Refunds & Chargebacks"
              />
              <SummaryCard
                title="Total Shared Expenses"
                value={totalSharedExpenses}
                icon={<DollarIcon />}
                type="expense"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownCard
                title="Employee Costs by Department"
                items={data.shared.employeeCosts}
                type="expense"
                onItemClick={(item) => handleItemClick('expense', item)}
              />
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-red-50 border-b border-red-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-gray-900">Other Costs</h3>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(otherCosts)}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </div>
                      <span className="font-medium text-gray-900">Refunds</span>
                    </div>
                    <span className="text-lg font-semibold text-red-600">{formatCurrency(data.shared.refunds)}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="font-medium text-gray-900">Chargebacks</span>
                    </div>
                    <span className="text-lg font-semibold text-red-600">{formatCurrency(data.shared.chargebacks)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <MonthlyTrendChart data={data.shared.monthlyTrend} />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <CategorySelector selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      {/* Category Content */}
      {renderCategoryContent()}
    </div>
  );
};

export default ByHomeTypeTab;
