import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Button } from '../../ui/button';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '../../../lib/utils';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ComparisonMetric {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

export interface ComparisonData {
  income: number;
  expenses: number;
  netIncome: number;
  profitMargin: number;
  propertyCount: number;
  avgPerProperty: number;
}

export interface PeriodData {
  label: string;
  startDate: string;
  endDate: string;
  data: ComparisonData;
}

export interface ComparisonTabProps {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
  comparisonData?: ComparisonMetric[];
  onPeriodChange?: (currentPeriod: string, previousPeriod: string) => void;
}

// Period options for dropdowns
const PERIOD_OPTIONS = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'this-year', label: 'This Year' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'last-30-days', label: 'Last 30 Days' },
  { value: 'last-60-days', label: 'Last 60 Days' },
  { value: 'last-90-days', label: 'Last 90 Days' },
  { value: 'last-6-months', label: 'Last 6 Months' },
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

const calculateChange = (current: number, previous: number) => {
  const change = current - previous;
  const changePercent = previous !== 0 ? (change / Math.abs(previous)) * 100 : 0;
  return { change, changePercent };
};

// ============================================================================
// Change Indicator Component
// ============================================================================

interface ChangeIndicatorProps {
  change: number;
  changePercent: number;
  isPercentageMetric?: boolean;
}

const ChangeIndicator: React.FC<ChangeIndicatorProps> = ({
  change,
  changePercent,
  isPercentageMetric = false,
}) => {
  const isPositive = change > 0;
  const isNegative = change < 0;
  const isNeutral = change === 0;

  const colorClass = isPositive
    ? 'text-green-600 bg-green-50'
    : isNegative
    ? 'text-red-600 bg-red-50'
    : 'text-gray-600 bg-gray-50';

  const Icon = isPositive ? ArrowUp : isNegative ? ArrowDown : Minus;

  return (
    <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full', colorClass)}>
      <Icon className="w-4 h-4" />
      <span className="font-semibold text-sm">
        {isPercentageMetric ? formatPercentage(Math.abs(change)) : formatCurrency(Math.abs(change))}
      </span>
      <span className="text-xs">({formatPercentage(Math.abs(changePercent))})</span>
    </div>
  );
};

// ============================================================================
// Custom Tooltip Component
// ============================================================================

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-2">{label}</p>
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

// ============================================================================
// Main Component
// ============================================================================

const ComparisonTab: React.FC<ComparisonTabProps> = ({
  currentPeriod,
  previousPeriod,
  comparisonData,
  onPeriodChange,
}) => {
  const [selectedCurrentPeriod, setSelectedCurrentPeriod] = useState('this-month');
  const [selectedPreviousPeriod, setSelectedPreviousPeriod] = useState('last-month');

  // Build metrics from period data
  const metrics: ComparisonMetric[] = comparisonData || [
    {
      metric: 'Income',
      current: currentPeriod.data.income,
      previous: previousPeriod.data.income,
      ...calculateChange(currentPeriod.data.income, previousPeriod.data.income),
    },
    {
      metric: 'Expenses',
      current: currentPeriod.data.expenses,
      previous: previousPeriod.data.expenses,
      ...calculateChange(currentPeriod.data.expenses, previousPeriod.data.expenses),
    },
    {
      metric: 'Net Income',
      current: currentPeriod.data.netIncome,
      previous: previousPeriod.data.netIncome,
      ...calculateChange(currentPeriod.data.netIncome, previousPeriod.data.netIncome),
    },
    {
      metric: 'Profit Margin',
      current: currentPeriod.data.profitMargin,
      previous: previousPeriod.data.profitMargin,
      ...calculateChange(currentPeriod.data.profitMargin, previousPeriod.data.profitMargin),
    },
    {
      metric: 'Property Count',
      current: currentPeriod.data.propertyCount,
      previous: previousPeriod.data.propertyCount,
      ...calculateChange(currentPeriod.data.propertyCount, previousPeriod.data.propertyCount),
    },
    {
      metric: 'Avg per Property',
      current: currentPeriod.data.avgPerProperty,
      previous: previousPeriod.data.avgPerProperty,
      ...calculateChange(currentPeriod.data.avgPerProperty, previousPeriod.data.avgPerProperty),
    },
  ];

  // Prepare chart data
  const chartData = metrics.map((m) => ({
    name: m.metric,
    Current: m.current,
    Previous: m.previous,
  }));

  const handleApply = () => {
    if (onPeriodChange) {
      onPeriodChange(selectedCurrentPeriod, selectedPreviousPeriod);
    }
  };

  return (
    <div className="space-y-6">
      {/* Period Selectors */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 w-full">
            {/* Current Period Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 w-full">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Compare:
              </label>
              <Select value={selectedCurrentPeriod} onValueChange={setSelectedCurrentPeriod}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* VS Label */}
            <div className="hidden sm:flex items-center justify-center px-2">
              <span className="text-sm font-semibold text-gray-500">vs</span>
            </div>

            {/* Previous Period Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 w-full">
              <Select value={selectedPreviousPeriod} onValueChange={setSelectedPreviousPeriod}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Apply Button */}
          <Button onClick={handleApply} className="w-full sm:w-auto">
            Apply
          </Button>
        </div>

        {/* Period Info Display */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">Current: </span>
              <span className="font-semibold text-gray-900">{currentPeriod.label}</span>
              <span className="text-gray-500 ml-2 text-xs">
                ({currentPeriod.startDate} to {currentPeriod.endDate})
              </span>
            </div>
            <div>
              <span className="text-gray-600">Previous: </span>
              <span className="font-semibold text-gray-900">{previousPeriod.label}</span>
              <span className="text-gray-500 ml-2 text-xs">
                ({previousPeriod.startDate} to {previousPeriod.endDate})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Metric
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Current Period
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Previous Period
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Change
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {metrics.map((metric, index) => {
                const isPercentageMetric = metric.metric === 'Profit Margin';
                const isCountMetric = metric.metric === 'Property Count';

                return (
                  <tr
                    key={metric.metric}
                    className={cn(
                      'hover:bg-gray-50 transition-colors',
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    )}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{metric.metric}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-semibold text-gray-900">
                        {isPercentageMetric
                          ? formatPercentage(metric.current)
                          : isCountMetric
                          ? metric.current
                          : formatCurrency(metric.current)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-gray-600">
                        {isPercentageMetric
                          ? formatPercentage(metric.previous)
                          : isCountMetric
                          ? metric.previous
                          : formatCurrency(metric.previous)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <ChangeIndicator
                        change={metric.change}
                        changePercent={metric.changePercent}
                        isPercentageMetric={isPercentageMetric || isCountMetric}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side-by-Side Bar Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Comparison Chart
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fill: '#6B7280', fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="square"
            />
            <Bar
              dataKey="Current"
              name="Current Period"
              fill="#3B82F6"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            />
            <Bar
              dataKey="Previous"
              name="Previous Period"
              fill="#9CA3AF"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ComparisonTab;
