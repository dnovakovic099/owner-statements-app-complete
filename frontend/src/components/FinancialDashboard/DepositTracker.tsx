import React from 'react';
import { ExternalLink } from 'lucide-react';

interface DepositData {
  totalAmount: number;
  depositedToday: number;
  arriving: number;
  arrivalDays: string;
  asOfDate: string;
}

interface DepositTrackerProps {
  data: DepositData;
  loading?: boolean;
  onViewDeposits?: () => void;
}

const DepositTracker: React.FC<DepositTrackerProps> = ({
  data,
  loading = false,
  onViewDeposits
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const calculatePercentage = (part: number, total: number) => {
    if (total === 0) return 0;
    return (part / total) * 100;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-8 bg-gray-200 rounded w-2/3"></div>
          <div className="h-6 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const depositedPercent = calculatePercentage(data.depositedToday, data.totalAmount);
  const arrivingPercent = calculatePercentage(data.arriving, data.totalAmount);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Deposit Tracker
          </h3>
          <p className="text-xs text-gray-500 mt-1">{data.asOfDate}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-6">
        Track all your QuickBooks Payments deposits here
      </p>

      {/* Total Amount */}
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-1">Amount from QuickBooks Payments</p>
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.totalAmount)}</p>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="w-full h-10 bg-gray-100 rounded-lg overflow-hidden flex">
          {data.depositedToday > 0 && (
            <div
              style={{ width: `${depositedPercent}%` }}
              className="bg-green-500 flex items-center justify-center transition-all duration-300"
              title={`Deposited: ${formatCurrency(data.depositedToday)}`}
            >
              {depositedPercent > 20 && (
                <span className="text-xs font-medium text-white px-2">
                  {formatCurrency(data.depositedToday)}
                </span>
              )}
            </div>
          )}
          {data.arriving > 0 && (
            <div
              style={{ width: `${arrivingPercent}%` }}
              className="bg-blue-400 flex items-center justify-center transition-all duration-300"
              title={`Arriving: ${formatCurrency(data.arriving)}`}
            >
              {arrivingPercent > 20 && (
                <span className="text-xs font-medium text-white px-2">
                  {formatCurrency(data.arriving)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2 mb-6">
        {data.depositedToday > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
              <span className="text-gray-700">Total deposited today</span>
            </div>
            <span className="font-semibold text-gray-900">
              {formatCurrency(data.depositedToday)}
            </span>
          </div>
        )}
        {data.arriving > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-400 rounded-sm"></div>
              <span className="text-gray-700">Arriving in {data.arrivalDays}</span>
            </div>
            <span className="font-semibold text-gray-900">
              {formatCurrency(data.arriving)}
            </span>
          </div>
        )}
      </div>

      {/* View Deposits Link */}
      <button
        onClick={onViewDeposits}
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
      >
        View deposits
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
};

export default DepositTracker;
