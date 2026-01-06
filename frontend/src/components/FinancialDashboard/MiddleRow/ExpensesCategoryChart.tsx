import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ExpenseCategory {
  name: string;
  amount: number;
  color: string;
  originalAccounts?: string[]; // Original QuickBooks account names
}

export interface ExpensesCategoryChartProps {
  categories: ExpenseCategory[];
  total: number;
  onCategoryClick?: (category: ExpenseCategory) => void;
}

// ============================================================================
// Professional Color Palette
// ============================================================================

export const DEFAULT_COLORS = [
  '#3b82f6', // blue-500 (primary)
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#94a3b8', // slate-400 (for "Other")
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
      <div className="bg-white text-gray-900 px-4 py-3 rounded-xl shadow-xl border border-gray-200">
        <p className="font-semibold text-sm">{data.name}</p>
        <p className="text-lg font-bold text-gray-900 mt-1">
          {formatCurrency(data.amount)}
        </p>
        <p className="text-xs text-gray-500">
          {formatPercentage(data.percentage)} of total
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

  // Prepare chart data - group small categories into "Other"
  const chartData = useMemo(() => {
    const MIN_PERCENTAGE = 3; // Group categories below 3% into "Other"
    const MAX_SEGMENTS = 8; // Maximum segments to show

    const withPercentages = categories.map((category, index) => ({
      name: category.name,
      amount: category.amount,
      percentage: total > 0 ? (category.amount / total) * 100 : 0,
      color: category.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      originalAccounts: category.originalAccounts,
    }));

    // Sort by amount descending
    const sorted = [...withPercentages].sort((a, b) => b.amount - a.amount);

    // Take top categories and group the rest into "Other"
    const topCategories = sorted.slice(0, MAX_SEGMENTS - 1);
    const otherCategories = sorted.slice(MAX_SEGMENTS - 1);

    // Also move very small categories to "Other"
    const finalCategories: typeof topCategories = [];
    let otherAmount = 0;

    topCategories.forEach((cat) => {
      if (cat.percentage < MIN_PERCENTAGE) {
        otherAmount += cat.amount;
      } else {
        finalCategories.push(cat);
      }
    });

    // Add remaining categories to "Other"
    otherCategories.forEach((cat) => {
      otherAmount += cat.amount;
    });

    // Add "Other" category if there's any
    if (otherAmount > 0) {
      finalCategories.push({
        name: 'Other',
        amount: otherAmount,
        percentage: total > 0 ? (otherAmount / total) * 100 : 0,
        color: '#94a3b8', // slate-400
        originalAccounts: [],
      });
    }

    // Assign colors
    return finalCategories.map((cat, index) => ({
      ...cat,
      color: cat.name === 'Other' ? '#94a3b8' : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    }));
  }, [categories, total]);

  // Handle segment click
  const handlePieClick = (data: any, index: number) => {
    if (onCategoryClick && chartData[index].name !== 'Other') {
      const category = categories.find(c => c.name === chartData[index].name);
      if (category) {
        onCategoryClick(category);
      }
    }
  };

  // Handle list item click
  const handleListItemClick = (categoryName: string) => {
    if (onCategoryClick && categoryName !== 'Other') {
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

  // Empty state
  if (categories.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Expenses by Category
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No expense data available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      {/* Header */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-gray-900">
          Expenses by Category
        </h3>
      </div>

      {/* Chart Container */}
      <div className="relative flex-shrink-0" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={95}
              paddingAngle={3}
              dataKey="amount"
              onClick={handlePieClick}
              onMouseEnter={(_, index) => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="#fff"
                  strokeWidth={3}
                  style={{
                    cursor: entry.name !== 'Other' ? 'pointer' : 'default',
                    opacity: activeIndex !== null && activeIndex !== index ? 0.5 : 1,
                    transform: activeIndex === index ? 'scale(1.02)' : 'scale(1)',
                    transformOrigin: 'center',
                    transition: 'all 0.2s ease-out',
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
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(total)}
            </p>
            <p className="text-xs text-gray-500 font-medium">Total</p>
          </div>
        </div>
      </div>

      {/* Categories List */}
      <div className="flex-1 mt-2 overflow-auto">
        <div className="space-y-1">
          {chartData.map((category, index) => (
            <div
              key={category.name}
              onClick={() => handleListItemClick(category.name)}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
              className={`
                flex items-center justify-between py-2 px-3 rounded-lg
                transition-all duration-200
                ${category.name !== 'Other' && onCategoryClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                ${activeIndex === index ? 'bg-gray-50' : ''}
              `}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-sm text-gray-700 truncate">
                  {category.name}
                </span>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(category.amount)}
                </span>
                <span className="text-xs text-gray-500 w-12 text-right font-medium">
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
