import React, { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { PropertyMetrics } from './types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface NetIncomeTrendData {
  month: string;
  PM: number;
  Arbitrage: number;
  Owned: number;
}

export interface ROIByCategoryData {
  category: string;
  roi: number;
  color: string;
}

export interface PropertyROIData {
  propertyName: string;
  roi: number;
  propertyId: number;
}

export interface IncomeExpenseData {
  month: string;
  income: number;
  expenses: number;
}

// ============================================================================
// Color Palette
// ============================================================================

export const CHART_COLORS = {
  PM: '#3B82F6',        // blue-500
  Arbitrage: '#F97316', // orange-500
  Owned: '#10B981',     // green-500
  income: '#10B981',    // green-500
  expenses: '#EF4444',  // red-500
  grid: '#E5E7EB',      // gray-200
  text: '#6B7280',      // gray-500
  textDark: '#374151',  // gray-700
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

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

// ============================================================================
// Custom Tooltip Components
// ============================================================================

const CustomLineTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-2">{formatMonth(label)}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-medium">{entry.name}:</span>
            <span className="font-semibold">{formatCurrency(entry.value as number)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-1">{label}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">ROI:</span>
          <span className="font-semibold">{formatPercentage(payload[0].value as number)}</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomAreaTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const income = payload.find((p: any) => p.dataKey === 'income')?.value as number || 0;
    const expenses = payload.find((p: any) => p.dataKey === 'expenses')?.value as number || 0;
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
// Loading Skeleton Component
// ============================================================================

const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 400 }) => (
  <div className="animate-pulse" style={{ height }}>
    <div className="h-full bg-gray-200 rounded-lg flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading chart...</div>
    </div>
  </div>
);

// ============================================================================
// Empty State Component
// ============================================================================

const EmptyState: React.FC<{ message?: string; height?: number }> = ({
  message = 'No data available',
  height = 400,
}) => (
  <div
    className="flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
    style={{ height }}
  >
    <div className="text-center">
      <svg
        className="mx-auto h-12 w-12 text-gray-400 mb-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  </div>
);

// ============================================================================
// 1. Net Income Trend Line Chart
// ============================================================================

export interface NetIncomeTrendChartProps {
  data: NetIncomeTrendData[];
  isLoading?: boolean;
  height?: number;
}

export const NetIncomeTrendChart: React.FC<NetIncomeTrendChartProps> = ({
  data,
  isLoading = false,
  height = 400,
}) => {
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const toggleLine = (dataKey: string) => {
    setHiddenLines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dataKey)) {
        newSet.delete(dataKey);
      } else {
        newSet.add(dataKey);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return <ChartSkeleton height={height} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message="No net income trend data available" height={height} />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Net Income Trend by Category
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
          <Tooltip content={<CustomLineTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            onClick={(e) => toggleLine(e.dataKey as string)}
            formatter={(value) => <span className="cursor-pointer hover:underline">{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="PM"
            stroke={CHART_COLORS.PM}
            strokeWidth={2.5}
            dot={{ r: 4, strokeWidth: 2, fill: CHART_COLORS.PM }}
            activeDot={{ r: 6 }}
            hide={hiddenLines.has('PM')}
          />
          <Line
            type="monotone"
            dataKey="Arbitrage"
            stroke={CHART_COLORS.Arbitrage}
            strokeWidth={2.5}
            dot={{ r: 4, strokeWidth: 2, fill: CHART_COLORS.Arbitrage }}
            activeDot={{ r: 6 }}
            hide={hiddenLines.has('Arbitrage')}
          />
          <Line
            type="monotone"
            dataKey="Owned"
            stroke={CHART_COLORS.Owned}
            strokeWidth={2.5}
            dot={{ r: 4, strokeWidth: 2, fill: CHART_COLORS.Owned }}
            activeDot={{ r: 6 }}
            hide={hiddenLines.has('Owned')}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-500 mt-2 text-center">
        Click legend items to toggle visibility
      </p>
    </div>
  );
};

// ============================================================================
// 2. ROI Bar Chart by Category
// ============================================================================

export interface ROIByCategoryChartProps {
  data: ROIByCategoryData[];
  isLoading?: boolean;
  height?: number;
}

export const ROIByCategoryChart: React.FC<ROIByCategoryChartProps> = ({
  data,
  isLoading = false,
  height = 300,
}) => {
  if (isLoading) {
    return <ChartSkeleton height={height} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message="No ROI data available" height={height} />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        ROI by Category
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 50, left: 80, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            type="number"
            tickFormatter={formatPercentage}
            tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fill: CHART_COLORS.textDark, fontSize: 12, fontWeight: 500 }}
          />
          <Tooltip content={<CustomBarTooltip />} />
          <Bar
            dataKey="roi"
            radius={[0, 8, 8, 0]}
            label={{
              position: 'right',
              formatter: (value: any) => formatPercentage(value),
              fill: CHART_COLORS.textDark,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {data.map((entry, index) => (
              <Bar key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// 3. Average ROI per PM Property
// ============================================================================

export interface PMPropertyROIChartProps {
  data: PropertyROIData[];
  targetROI?: number;
  isLoading?: boolean;
  height?: number;
}

export const PMPropertyROIChart: React.FC<PMPropertyROIChartProps> = ({
  data,
  targetROI = 15,
  isLoading = false,
  height = 400,
}) => {
  if (isLoading) {
    return <ChartSkeleton height={height} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message="No PM property ROI data available" height={height} />;
  }

  // Sort by ROI descending
  const sortedData = [...data].sort((a, b) => b.roi - a.roi);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        ROI per PM Property
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={sortedData} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="propertyName"
            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis
            tickFormatter={formatPercentage}
            tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
          />
          <Tooltip content={<CustomBarTooltip />} />
          <ReferenceLine
            y={targetROI}
            stroke="#DC2626"
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{
              value: `Target: ${targetROI}%`,
              position: 'right',
              fill: '#DC2626',
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <Bar
            dataKey="roi"
            radius={[8, 8, 0, 0]}
            label={{
              position: 'top',
              formatter: (value: any) => formatPercentage(value),
              fill: CHART_COLORS.textDark,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {sortedData.map((entry, index) => (
              <Bar
                key={`cell-${index}`}
                fill={entry.roi >= targetROI ? CHART_COLORS.Owned : CHART_COLORS.expenses}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span>Above Target</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span>Below Target</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. Income vs Expenses Area Chart
// ============================================================================

export interface IncomeVsExpensesChartProps {
  data: IncomeExpenseData[];
  isLoading?: boolean;
  height?: number;
}

export const IncomeVsExpensesChart: React.FC<IncomeVsExpensesChartProps> = ({
  data,
  isLoading = false,
  height = 400,
}) => {
  if (isLoading) {
    return <ChartSkeleton height={height} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message="No income/expense data available" height={height} />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Income vs Expenses Over Time
      </h3>
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
          <Tooltip content={<CustomAreaTooltip />} />
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
// Data Transformation Utilities
// ============================================================================

export const transformToNetIncomeTrend = (
  properties: PropertyMetrics[]
): NetIncomeTrendData[] => {
  const monthMap = new Map<string, { PM: number; Arbitrage: number; Owned: number }>();

  properties.forEach(property => {
    property.monthlyData.forEach(({ month, netIncome }) => {
      if (!monthMap.has(month)) {
        monthMap.set(month, { PM: 0, Arbitrage: 0, Owned: 0 });
      }
      const data = monthMap.get(month)!;
      data[property.homeCategory] += netIncome;
    });
  });

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

export const transformToROIByCategory = (
  properties: PropertyMetrics[]
): ROIByCategoryData[] => {
  const categoryMap = new Map<string, { totalRevenue: number; totalExpenses: number }>();

  properties.forEach(property => {
    if (!categoryMap.has(property.homeCategory)) {
      categoryMap.set(property.homeCategory, { totalRevenue: 0, totalExpenses: 0 });
    }
    const data = categoryMap.get(property.homeCategory)!;
    data.totalRevenue += property.totalRevenue;
    data.totalExpenses += property.totalExpenses;
  });

  const colorMap: Record<string, string> = {
    PM: CHART_COLORS.PM,
    Arbitrage: CHART_COLORS.Arbitrage,
    Owned: CHART_COLORS.Owned,
  };

  return Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    roi: data.totalExpenses !== 0 ? (data.totalRevenue / data.totalExpenses) * 100 : 0,
    color: colorMap[category] || '#6B7280',
  }));
};

export const transformToPMPropertyROI = (
  properties: PropertyMetrics[]
): PropertyROIData[] => {
  return properties
    .filter(p => p.homeCategory === 'PM')
    .map(p => ({
      propertyName: p.propertyName,
      roi: p.roi,
      propertyId: p.propertyId,
    }));
};

export const transformToIncomeExpense = (
  properties: PropertyMetrics[]
): IncomeExpenseData[] => {
  const monthMap = new Map<string, { income: number; expenses: number }>();

  properties.forEach(property => {
    property.monthlyData.forEach(({ month }) => {
      if (!monthMap.has(month)) {
        monthMap.set(month, { income: 0, expenses: 0 });
      }
    });
  });

  properties.forEach(property => {
    const totalRevenue = property.totalRevenue;
    const totalExpenses = property.totalExpenses;
    const monthCount = property.monthlyData.length || 1;
    const avgMonthlyRevenue = totalRevenue / monthCount;
    const avgMonthlyExpenses = totalExpenses / monthCount;

    property.monthlyData.forEach(({ month }) => {
      const data = monthMap.get(month)!;
      data.income += avgMonthlyRevenue;
      data.expenses += avgMonthlyExpenses;
    });
  });

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));
};
