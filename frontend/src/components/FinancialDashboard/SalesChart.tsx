import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface SalesData {
  month: string;
  amount: number;
}

interface SalesChartProps {
  data: SalesData[];
  totalAmount: number;
  loading?: boolean;
}

const SalesChart: React.FC<SalesChartProps> = ({
  data,
  totalAmount,
  loading = false
}) => {
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/4 mb-3"></div>
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-5"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">Sales</h3>
        <p className="text-xs text-gray-500 mt-1">Based on selected date range</p>
      </div>

      {/* Total Amount */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500">Total Amount</p>
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
      </div>

      {/* Chart */}
      <div className="h-64">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
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
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            No sales data available
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesChart;
