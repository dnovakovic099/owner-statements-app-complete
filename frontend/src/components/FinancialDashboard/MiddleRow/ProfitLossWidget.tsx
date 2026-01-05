import React from 'react';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

interface ProfitLossWidgetProps {
  income: number;
  expenses: number;
  previousIncome: number;
  previousExpenses: number;
  onViewReport?: () => void;
}

const ProfitLossWidget: React.FC<ProfitLossWidgetProps> = ({
  income,
  expenses,
  previousIncome,
  previousExpenses,
  onViewReport,
}) => {
  // Calculate net profit and previous net profit
  const netProfit = income - expenses;
  const previousNetProfit = previousIncome - previousExpenses;

  // Calculate percentage change from prior period
  const netProfitChange =
    previousNetProfit !== 0
      ? ((netProfit - previousNetProfit) / Math.abs(previousNetProfit)) * 100
      : netProfit > 0
      ? 100
      : 0;

  // Calculate percentages for horizontal stacked bar
  const total = income + expenses;
  const incomePercentage = total > 0 ? (income / total) * 100 : 50;
  const expensesPercentage = total > 0 ? (expenses / total) * 100 : 50;

  // Determine if profit is positive or negative
  const isProfitPositive = netProfit >= 0;
  const isProfitChangePositive = netProfitChange >= 0;

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-300">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900">Profit & Loss</h3>
      </div>

      {/* Horizontal Stacked Bar */}
      <div className="mb-3">
        <div className="flex h-6 rounded-lg overflow-hidden border border-gray-200">
          {/* Income Bar */}
          <div
            className="bg-green-500 transition-all duration-500 ease-in-out"
            style={{ width: `${incomePercentage}%` }}
            title={`Income: ${incomePercentage.toFixed(1)}%`}
          />
          {/* Expenses Bar */}
          <div
            className="bg-red-500 transition-all duration-500 ease-in-out"
            style={{ width: `${expensesPercentage}%` }}
            title={`Expenses: ${expensesPercentage.toFixed(1)}%`}
          />
        </div>
      </div>

      {/* Income and Expenses Breakdown */}
      <div className="space-y-2 mb-3">
        {/* Income Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
            <span className="text-sm font-medium text-gray-700">Income</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(income)}
          </span>
        </div>

        {/* Expenses Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            <span className="text-sm font-medium text-gray-700">Expenses</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(expenses)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 my-2" />

      {/* Net Profit Section */}
      <div className="flex-1 flex flex-col justify-end">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-medium text-gray-600">Net</span>
          <h2
            className={`text-2xl font-bold ${
              isProfitPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isProfitPositive ? '' : '-'}
            {formatCurrency(netProfit)}
          </h2>
        </div>

        {/* Period Comparison */}
        <div className="flex items-center justify-end gap-2">
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${
              isProfitChangePositive
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {isProfitChangePositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span className="text-xs font-semibold">
              {Math.abs(netProfitChange).toFixed(1)}%
            </span>
          </div>
          <span className="text-xs text-gray-500">from prior period</span>
        </div>
      </div>

      {/* View Full Report Link */}
      {onViewReport && (
        <button
          onClick={onViewReport}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-2 px-4 rounded-lg transition-colors duration-200 group mt-2"
        >
          <span>View full report</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
        </button>
      )}
    </div>
  );
};

export default ProfitLossWidget;
