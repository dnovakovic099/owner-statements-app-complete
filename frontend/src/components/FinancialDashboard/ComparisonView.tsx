import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  TrendingUp,
  DollarSign,
  Wallet,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { financialsAPI } from '../../services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ============================================================================
// Types
// ============================================================================

export interface ComparisonViewProps {
  currentPeriod: { startDate: string; endDate: string };
  onPeriodChange?: (preset: string) => void;
}

interface PeriodData {
  income: number;
  expenses: number;
  netIncome: number;
  profitMargin: number;
}

interface ComparisonData {
  current: PeriodData;
  previous: PeriodData;
  loading: boolean;
}

type PresetType = 'month-vs-month' | 'quarter-vs-quarter' | 'year-vs-year' | 'custom';

// ============================================================================
// Helper Functions
// ============================================================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const calculateChange = (current: number, previous: number): { percent: number; absolute: number; isPositive: boolean } => {
  const absolute = current - previous;
  const percent = previous !== 0 ? (absolute / previous) * 100 : 0;
  return {
    percent,
    absolute,
    isPositive: absolute >= 0,
  };
};

const getPresetDates = (preset: PresetType): { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } } => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  switch (preset) {
    case 'month-vs-month': {
      // This month vs last month
      const thisMonthStart = new Date(currentYear, currentMonth, 1);
      const thisMonthEnd = new Date(currentYear, currentMonth + 1, 0);
      const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
      const lastMonthEnd = new Date(currentYear, currentMonth, 0);

      return {
        current: {
          startDate: thisMonthStart.toISOString().split('T')[0],
          endDate: thisMonthEnd.toISOString().split('T')[0],
        },
        previous: {
          startDate: lastMonthStart.toISOString().split('T')[0],
          endDate: lastMonthEnd.toISOString().split('T')[0],
        },
      };
    }

    case 'quarter-vs-quarter': {
      // This quarter vs last quarter
      const currentQuarter = Math.floor(currentMonth / 3);
      const thisQuarterStart = new Date(currentYear, currentQuarter * 3, 1);
      const thisQuarterEnd = new Date(currentYear, currentQuarter * 3 + 3, 0);
      const lastQuarterStart = new Date(currentYear, currentQuarter * 3 - 3, 1);
      const lastQuarterEnd = new Date(currentYear, currentQuarter * 3, 0);

      return {
        current: {
          startDate: thisQuarterStart.toISOString().split('T')[0],
          endDate: thisQuarterEnd.toISOString().split('T')[0],
        },
        previous: {
          startDate: lastQuarterStart.toISOString().split('T')[0],
          endDate: lastQuarterEnd.toISOString().split('T')[0],
        },
      };
    }

    case 'year-vs-year': {
      // This year vs last year
      const thisYearStart = new Date(currentYear, 0, 1);
      const thisYearEnd = new Date(currentYear, 11, 31);
      const lastYearStart = new Date(currentYear - 1, 0, 1);
      const lastYearEnd = new Date(currentYear - 1, 11, 31);

      return {
        current: {
          startDate: thisYearStart.toISOString().split('T')[0],
          endDate: thisYearEnd.toISOString().split('T')[0],
        },
        previous: {
          startDate: lastYearStart.toISOString().split('T')[0],
          endDate: lastYearEnd.toISOString().split('T')[0],
        },
      };
    }

    default:
      // Custom - return empty dates
      return {
        current: { startDate: '', endDate: '' },
        previous: { startDate: '', endDate: '' },
      };
  }
};

// ============================================================================
// Period Card Component
// ============================================================================

interface PeriodCardProps {
  title: string;
  data: PeriodData;
  variant: 'current' | 'previous';
}

const PeriodCard: React.FC<PeriodCardProps> = ({ title, data, variant }) => {
  const isPrevious = variant === 'previous';

  return (
    <div className={`bg-white rounded-xl shadow-sm border-2 p-6 ${isPrevious ? 'border-gray-200' : 'border-blue-300'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${isPrevious ? 'text-gray-700' : 'text-blue-900'}`}>
          {title}
        </h3>
        <div className={`p-2 rounded-lg ${isPrevious ? 'bg-gray-100' : 'bg-blue-100'}`}>
          <Calendar className={`w-5 h-5 ${isPrevious ? 'text-gray-600' : 'text-blue-600'}`} />
        </div>
      </div>

      <div className="space-y-4">
        {/* Income */}
        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-gray-700">Income</span>
          </div>
          <span className="text-lg font-bold text-green-700">
            {formatCurrency(data.income)}
          </span>
        </div>

        {/* Expenses */}
        <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-gray-700">Expenses</span>
          </div>
          <span className="text-lg font-bold text-red-700">
            {formatCurrency(data.expenses)}
          </span>
        </div>

        {/* Net Income */}
        <div className={`flex items-center justify-between p-3 rounded-lg ${
          data.netIncome >= 0 ? 'bg-blue-50' : 'bg-orange-50'
        }`}>
          <div className="flex items-center gap-2">
            <DollarSign className={`w-4 h-4 ${data.netIncome >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
            <span className="text-sm font-medium text-gray-700">Net Income</span>
          </div>
          <span className={`text-lg font-bold ${
            data.netIncome >= 0 ? 'text-blue-700' : 'text-orange-700'
          }`}>
            {formatCurrency(data.netIncome)}
          </span>
        </div>

        {/* Profit Margin */}
        <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Profit Margin</span>
          </div>
          <span className="text-lg font-bold text-purple-700">
            {data.profitMargin.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Change Indicator Component
// ============================================================================

interface ChangeIndicatorProps {
  label: string;
  current: number;
  previous: number;
  isCurrency?: boolean;
  inverseColors?: boolean; // For expenses, where decrease is good
}

const ChangeIndicator: React.FC<ChangeIndicatorProps> = ({
  label,
  current,
  previous,
  isCurrency = true,
  inverseColors = false,
}) => {
  const change = calculateChange(current, previous);
  const isImprovement = inverseColors ? !change.isPositive : change.isPositive;
  const color = isImprovement ? 'green' : 'red';
  const bgColor = isImprovement ? 'bg-green-50' : 'bg-red-50';
  const textColor = isImprovement ? 'text-green-700' : 'text-red-700';
  const Icon = change.isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={`p-4 rounded-lg ${bgColor} border border-${color}-200`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${textColor}`}>
            {change.percent !== 0 ? `${change.isPositive ? '+' : ''}${change.percent.toFixed(1)}%` : '0.0%'}
          </span>
        </div>

        <div className="text-sm text-gray-600">
          {isCurrency ? formatCurrency(Math.abs(change.absolute)) : change.absolute.toFixed(1)}
          {' '}
          {change.isPositive ? 'increase' : 'decrease'}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Custom Tooltip for Chart
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
            <span className="font-semibold">{formatCurrency(entry.value)}</span>
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

const ComparisonView: React.FC<ComparisonViewProps> = ({ currentPeriod, onPeriodChange }) => {
  const [preset, setPreset] = useState<PresetType>('month-vs-month');
  const [showCustomDates, setShowCustomDates] = useState(false);

  const [customCurrentStart, setCustomCurrentStart] = useState('');
  const [customCurrentEnd, setCustomCurrentEnd] = useState('');
  const [customPreviousStart, setCustomPreviousStart] = useState('');
  const [customPreviousEnd, setCustomPreviousEnd] = useState('');

  const [comparisonData, setComparisonData] = useState<ComparisonData>({
    current: { income: 0, expenses: 0, netIncome: 0, profitMargin: 0 },
    previous: { income: 0, expenses: 0, netIncome: 0, profitMargin: 0 },
    loading: false,
  });

  // Fetch comparison data from API
  const fetchComparisonData = async (
    currentDates: { startDate: string; endDate: string },
    previousDates: { startDate: string; endDate: string }
  ) => {
    setComparisonData(prev => ({ ...prev, loading: true }));

    try {
      const response = await financialsAPI.getComparison(
        currentDates.startDate,
        currentDates.endDate,
        previousDates.startDate,
        previousDates.endDate
      );

      if (response.success && response.data) {
        const { current, previous } = response.data;

        setComparisonData({
          current: {
            income: current.income || 0,
            expenses: current.expenses || 0,
            netIncome: current.netIncome || 0,
            profitMargin: parseFloat(current.profitMargin) || 0,
          },
          previous: {
            income: previous.income || 0,
            expenses: previous.expenses || 0,
            netIncome: previous.netIncome || 0,
            profitMargin: parseFloat(previous.profitMargin) || 0,
          },
          loading: false,
        });
      } else {
        throw new Error(response.error || 'Failed to fetch comparison data');
      }
    } catch (error) {
      console.error('Failed to fetch comparison data:', error);
      setComparisonData(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle preset change
  const handlePresetChange = (newPreset: PresetType) => {
    setPreset(newPreset);

    if (newPreset === 'custom') {
      setShowCustomDates(true);
    } else {
      setShowCustomDates(false);
      const dates = getPresetDates(newPreset);
      fetchComparisonData(dates.current, dates.previous);

      if (onPeriodChange) {
        onPeriodChange(newPreset);
      }
    }
  };

  // Handle custom date application
  const handleApplyCustomDates = () => {
    if (customCurrentStart && customCurrentEnd && customPreviousStart && customPreviousEnd) {
      fetchComparisonData(
        { startDate: customCurrentStart, endDate: customCurrentEnd },
        { startDate: customPreviousStart, endDate: customPreviousEnd }
      );
    }
  };

  // Initialize with default preset
  useEffect(() => {
    const dates = getPresetDates('month-vs-month');
    fetchComparisonData(dates.current, dates.previous);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prepare chart data
  const chartData = [
    {
      name: 'Income',
      Current: comparisonData.current.income,
      Previous: comparisonData.previous.income,
    },
    {
      name: 'Expenses',
      Current: comparisonData.current.expenses,
      Previous: comparisonData.previous.expenses,
    },
    {
      name: 'Net Income',
      Current: comparisonData.current.netIncome,
      Previous: comparisonData.previous.netIncome,
    },
  ];

  const COLORS = {
    Current: '#3B82F6',
    Previous: '#9CA3AF',
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Comparison Period</h3>
        </div>

        {/* Preset Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            size="sm"
            variant={preset === 'month-vs-month' ? 'default' : 'outline'}
            onClick={() => handlePresetChange('month-vs-month')}
          >
            This Month vs Last Month
          </Button>
          <Button
            size="sm"
            variant={preset === 'quarter-vs-quarter' ? 'default' : 'outline'}
            onClick={() => handlePresetChange('quarter-vs-quarter')}
          >
            This Quarter vs Last Quarter
          </Button>
          <Button
            size="sm"
            variant={preset === 'year-vs-year' ? 'default' : 'outline'}
            onClick={() => handlePresetChange('year-vs-year')}
          >
            This Year vs Last Year
          </Button>
          <Button
            size="sm"
            variant={preset === 'custom' ? 'default' : 'outline'}
            onClick={() => handlePresetChange('custom')}
          >
            Custom
          </Button>
        </div>

        {/* Custom Date Inputs */}
        {showCustomDates && (
          <div className="space-y-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Current Period */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Current Period</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                    <Input
                      type="date"
                      value={customCurrentStart}
                      onChange={(e) => setCustomCurrentStart(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                    <Input
                      type="date"
                      value={customCurrentEnd}
                      onChange={(e) => setCustomCurrentEnd(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Previous Period */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Previous Period</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                    <Input
                      type="date"
                      value={customPreviousStart}
                      onChange={(e) => setCustomPreviousStart(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                    <Input
                      type="date"
                      value={customPreviousEnd}
                      onChange={(e) => setCustomPreviousEnd(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={handleApplyCustomDates} size="sm" className="w-full md:w-auto">
              Apply Custom Dates
            </Button>
          </div>
        )}
      </div>

      {/* Side-by-Side Period Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PeriodCard
          title="Current Period"
          data={comparisonData.current}
          variant="current"
        />
        <PeriodCard
          title="Previous Period"
          data={comparisonData.previous}
          variant="previous"
        />
      </div>

      {/* Change Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Summary</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ChangeIndicator
            label="Income"
            current={comparisonData.current.income}
            previous={comparisonData.previous.income}
          />
          <ChangeIndicator
            label="Expenses"
            current={comparisonData.current.expenses}
            previous={comparisonData.previous.expenses}
            inverseColors={true}
          />
          <ChangeIndicator
            label="Net Income"
            current={comparisonData.current.netIncome}
            previous={comparisonData.previous.netIncome}
          />
          <ChangeIndicator
            label="Profit Margin"
            current={comparisonData.current.profitMargin}
            previous={comparisonData.previous.profitMargin}
            isCurrency={false}
          />
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Period Comparison</h3>

        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickFormatter={(value) => {
                if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                return `$${value}`;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="Current" fill={COLORS.Current} radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-current-${index}`} fill={COLORS.Current} />
              ))}
            </Bar>
            <Bar dataKey="Previous" fill={COLORS.Previous} radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-previous-${index}`} fill={COLORS.Previous} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ComparisonView;
