import React from 'react';
import { DashboardSummary } from '../types';

interface StatsCardsProps {
  summary: DashboardSummary;
}

const StatsCards: React.FC<StatsCardsProps> = ({ summary }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          Properties
        </h3>
        <div className="text-3xl font-bold text-gray-900">{summary.totalProperties}</div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          Owners
        </h3>
        <div className="text-3xl font-bold text-gray-900">{summary.totalOwners}</div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          Pending
        </h3>
        <div className="text-3xl font-bold text-gray-900">{summary.pendingStatements}</div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          This Week
        </h3>
        <div className="text-3xl font-bold text-green-600">
          {formatCurrency(summary.thisWeekRevenue)}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          Change
        </h3>
        <div
          className={`text-3xl font-bold ${
            summary.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {formatPercentage(summary.revenueChange)}
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
