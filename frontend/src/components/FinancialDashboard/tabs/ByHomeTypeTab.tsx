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
} from 'recharts';

// ============================================================================
// Type Definitions
// ============================================================================

export type HomeCategory = 'Property Management' | 'Arbitrage' | 'Home Owned' | 'Shared';

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

const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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
// Breakdown Card Component
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
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const colorClass = type === 'income' ? 'text-green-600' : 'text-red-600';
  const bgClass = type === 'income' ? 'bg-green-50' : 'bg-red-50';
  const borderClass = type === 'income' ? 'border-green-200' : 'border-red-200';

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className={`${bgClass} border-b ${borderClass} px-4 py-3`}>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className={`text-2xl font-bold ${colorClass} mt-1`}>{formatCurrency(total)}</p>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No items to display</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={index}
                className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                  onItemClick
                    ? 'hover:bg-gray-50 cursor-pointer'
                    : ''
                }`}
                onClick={() => onItemClick?.(item.label)}
              >
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{item.label}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
                      <div
                        className={`h-full ${type === 'income' ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{item.percentage.toFixed(1)}%</span>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${colorClass} ml-4`}>
                  {formatCurrency(item.amount)}
                </span>
              </li>
            ))}
          </ul>
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
// Category Selector Component
// ============================================================================

interface CategorySelectorProps {
  selected: HomeCategory;
  onSelect: (category: HomeCategory) => void;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ selected, onSelect }) => {
  const categories: HomeCategory[] = ['Property Management', 'Arbitrage', 'Home Owned', 'Shared'];

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => onSelect(category)}
          className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
            selected === category
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {category}
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

const MonthlyTrendChart: React.FC<MonthlyTrendChartProps> = ({ data, height = 350 }) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
        style={{ height }}
      >
        <p className="text-gray-500 text-sm">No trend data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
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
            tickFormatter={formatCurrency}
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

  // Memoize current category data
  const currentData = useMemo(() => {
    switch (selectedCategory) {
      case 'Property Management':
        return data.pm;
      case 'Arbitrage':
        return data.arbitrage;
      case 'Home Owned':
        return data.owned;
      case 'Shared':
        return data.shared;
      default:
        return data.pm;
    }
  }, [selectedCategory, data]);

  const handleItemClick = (type: 'income' | 'expense', item: string) => {
    onItemClick?.(selectedCategory, type, item);
  };

  // Render content based on selected category
  const renderCategoryContent = () => {
    switch (selectedCategory) {
      case 'Property Management':
        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Churn Metrics</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Churn Count:</span>
                          <span className="font-semibold text-gray-900">{data.pm.churn.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Churn Rate:</span>
                          <span className="font-semibold text-orange-600">
                            {data.pm.churn.rate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                }
              />
            </div>
            <MonthlyTrendChart data={data.pm.monthlyTrend} />
          </>
        );

      case 'Arbitrage':
        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <MonthlyTrendChart data={data.arbitrage.monthlyTrend} />
          </>
        );

      case 'Home Owned':
        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <MonthlyTrendChart data={data.owned.monthlyTrend} />
          </>
        );

      case 'Shared':
        const totalEmployeeCosts = data.shared.employeeCosts.reduce((sum, item) => sum + item.amount, 0);
        const otherCosts = data.shared.refunds + data.shared.chargebacks;

        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownCard
                title="Employee Costs by Department"
                items={data.shared.employeeCosts}
                type="expense"
                onItemClick={(item) => handleItemClick('expense', item)}
              />
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Other Costs</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Refunds</span>
                      <span className="text-lg font-semibold text-red-600">
                        {formatCurrency(data.shared.refunds)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Chargebacks</span>
                      <span className="text-lg font-semibold text-red-600">
                        {formatCurrency(data.shared.chargebacks)}
                      </span>
                    </div>
                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-gray-900">Total Other Costs</span>
                        <span className="text-xl font-bold text-red-600">
                          {formatCurrency(otherCosts)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg shadow-md border border-blue-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Employee Costs</span>
                      <span className="text-base font-semibold text-gray-900">
                        {formatCurrency(totalEmployeeCosts)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Other Costs</span>
                      <span className="text-base font-semibold text-gray-900">
                        {formatCurrency(otherCosts)}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-blue-300">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-gray-900">Total Shared Expenses</span>
                        <span className="text-xl font-bold text-blue-600">
                          {formatCurrency(totalEmployeeCosts + otherCosts)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <MonthlyTrendChart data={data.shared.monthlyTrend} />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Selector */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <CategorySelector selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      {/* Category Content */}
      {renderCategoryContent()}
    </div>
  );
};

export default ByHomeTypeTab;
