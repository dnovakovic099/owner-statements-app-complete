import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChevronDown } from 'lucide-react';

interface SalesData {
  month: string;
  amount: number;
}

interface SalesChartProps {
  data: SalesData[];
  totalAmount: number;
  loading?: boolean;
  onPeriodChange?: (period: 'ytd' | 'last12' | 'last30' | 'custom') => void;
}

const SalesChart: React.FC<SalesChartProps> = ({
  data,
  totalAmount,
  loading = false,
  onPeriodChange
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'ytd' | 'last12' | 'last30' | 'custom'>('ytd');
  const [showDropdown, setShowDropdown] = useState(false);

  const periods = [
    { value: 'ytd', label: 'This year to date' },
    { value: 'last12', label: 'Last 12 months' },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom date range' }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatXAxis = (value: string) => {
    // Format month from YYYY-MM to short month name
    const [year, month] = value.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  const handlePeriodChange = (period: 'ytd' | 'last12' | 'last30' | 'custom') => {
    setSelectedPeriod(period);
    setShowDropdown(false);
    onPeriodChange?.(period);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const currentPeriodLabel = periods.find(p => p.value === selectedPeriod)?.label || 'This year to date';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Sales</h3>
          <div className="relative mt-1">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors"
            >
              {currentPeriodLabel}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                {periods.map((period) => (
                  <button
                    key={period.value}
                    onClick={() => handlePeriodChange(period.value as any)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      selectedPeriod === period.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Total Amount */}
      <div className="mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Amount</p>
        <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tickFormatter={formatXAxis}
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              formatter={(value) => formatCurrency(value as number)}
              labelFormatter={(label) => formatXAxis(label as string)}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              iconType="circle"
            />
            <Bar
              dataKey="amount"
              fill="#10b981"
              name="Amount"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SalesChart;
