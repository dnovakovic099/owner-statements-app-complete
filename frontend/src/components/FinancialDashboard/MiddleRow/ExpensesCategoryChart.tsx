import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ExpenseCategory {
  name: string;
  amount: number;
  color: string;
}

export interface ExpensesCategoryChartProps {
  categories: ExpenseCategory[];
  total: number;
  onCategoryClick?: (category: ExpenseCategory) => void;
}

// ============================================================================
// Default Color Palette (Professional blues, teals, grays)
// ============================================================================

export const DEFAULT_COLORS = [
  '#2563eb', // blue-600
  '#0891b2', // cyan-600
  '#6366f1', // indigo-500
  '#8b5cf6', // violet-500
  '#64748b', // slate-500
  '#0ea5e9', // sky-500
  '#06b6d4', // cyan-500
  '#6d28d9', // violet-700
  '#475569', // slate-600
  '#3b82f6', // blue-500
];

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

// ============================================================================
// Custom Tooltip Component
// ============================================================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-1">{data.name}</p>
        <p className="text-xs text-gray-300">
          {formatCurrency(data.amount)} ({formatPercentage(data.percentage)})
        </p>
      </div>
    );
  }
  return null;
};

// ============================================================================
// Main Component
// ============================================================================

export const ExpensesCategoryChart: React.FC<ExpensesCategoryChartProps> = ({
  categories,
  total,
  onCategoryClick,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Prepare chart data with percentages and colors
  const chartData = useMemo(() => {
    return categories.map((category, index) => ({
      name: category.name,
      amount: category.amount,
      percentage: total > 0 ? (category.amount / total) * 100 : 0,
      color: category.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    }));
  }, [categories, total]);

  // Get top 5 categories for the list
  const topCategories = useMemo(() => {
    return [...chartData]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [chartData]);

  // Handle segment click
  const handlePieClick = (data: any, index: number) => {
    if (onCategoryClick) {
      const category = categories[index];
      onCategoryClick(category);
    }
  };

  // Handle list item click
  const handleListItemClick = (categoryName: string) => {
    if (onCategoryClick) {
      const category = categories.find((c) => c.name === categoryName);
      if (category) {
        onCategoryClick(category);
      }
    }
  };

  // Handle mouse enter/leave for highlighting
  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  // Empty state - compact version
  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Expenses by Category
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Total: {formatCurrency(total)}
          </p>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <svg
              className="mx-auto h-10 w-10"
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
          </div>
          <p className="text-sm text-gray-500">No expense data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Expenses by Category
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Total: {formatCurrency(total)}
        </p>
      </div>

      {/* Chart */}
      <div className="relative mb-4">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="amount"
              onClick={handlePieClick}
              onMouseEnter={(_, index) => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="#fff"
                  strokeWidth={2}
                  className={`
                    cursor-pointer transition-opacity duration-200
                    ${activeIndex !== null && activeIndex !== index ? 'opacity-50' : 'opacity-100'}
                  `}
                  style={{
                    filter: activeIndex === index ? 'brightness(1.1)' : 'none',
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center Total */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(total)}
            </p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>
      </div>

      {/* Top Categories List */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Top Categories
        </h4>
        <div className="space-y-1">
          {topCategories.map((category, index) => (
            <div
              key={category.name}
              onClick={() => handleListItemClick(category.name)}
              onMouseEnter={() => {
                const chartIndex = chartData.findIndex(
                  (c) => c.name === category.name
                );
                handleMouseEnter(chartIndex);
              }}
              onMouseLeave={handleMouseLeave}
              className={`
                flex items-center justify-between py-2 px-2 rounded-lg
                transition-all duration-200
                ${onCategoryClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                ${
                  activeIndex !== null &&
                  chartData[activeIndex]?.name === category.name
                    ? 'bg-gray-50'
                    : ''
                }
              `}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-sm text-gray-900 truncate">
                  {category.name}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(category.amount)}
                </span>
                <span className="text-xs text-gray-500 w-10 text-right">
                  {formatPercentage(category.percentage)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExpensesCategoryChart;
