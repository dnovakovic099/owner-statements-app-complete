import React from 'react';

interface InvoiceBreakdown {
  unpaid: {
    amount: number;
    overdue: number;
    notDueYet: number;
    periodLabel: string;
  };
  paid: {
    amount: number;
    deposited: number;
    notDeposited: number;
    periodLabel: string;
  };
}

interface InvoicesWidgetProps {
  data: InvoiceBreakdown;
  loading?: boolean;
  onViewDetails?: (type: 'unpaid' | 'paid') => void;
}

const InvoicesWidget: React.FC<InvoicesWidgetProps> = ({
  data,
  loading = false,
  onViewDetails
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const calculatePercentage = (part: number, total: number) => {
    if (total === 0) return 0;
    return (part / total) * 100;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-8 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const unpaidTotal = data.unpaid.amount;
  const overduePercent = calculatePercentage(data.unpaid.overdue, unpaidTotal);
  const notDueYetPercent = calculatePercentage(data.unpaid.notDueYet, unpaidTotal);

  const paidTotal = data.paid.amount;
  const depositedPercent = calculatePercentage(data.paid.deposited, paidTotal);
  const notDepositedPercent = calculatePercentage(data.paid.notDeposited, paidTotal);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-6">
        Invoices
      </h3>

      {/* Unpaid Section */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-2">
          <button
            onClick={() => onViewDetails?.('unpaid')}
            className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            {formatCurrency(unpaidTotal)} Unpaid
          </button>
          <span className="text-xs text-gray-500">{data.unpaid.periodLabel}</span>
        </div>

        {/* Unpaid Progress Bar */}
        <div className="w-full h-8 bg-gray-100 rounded-lg overflow-hidden flex">
          {data.unpaid.overdue > 0 && (
            <div
              style={{ width: `${overduePercent}%` }}
              className="bg-orange-500 flex items-center justify-center"
            >
              {overduePercent > 15 && (
                <span className="text-xs font-medium text-white px-2">
                  Overdue {formatCurrency(data.unpaid.overdue)}
                </span>
              )}
            </div>
          )}
          {data.unpaid.notDueYet > 0 && (
            <div
              style={{ width: `${notDueYetPercent}%` }}
              className="bg-gray-300 flex items-center justify-center"
            >
              {notDueYetPercent > 15 && (
                <span className="text-xs font-medium text-gray-700 px-2">
                  Not due yet {formatCurrency(data.unpaid.notDueYet)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Unpaid Legend */}
        <div className="flex items-center gap-4 mt-2 text-xs">
          {data.unpaid.overdue > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
              <span className="text-gray-600">
                Overdue {formatCurrency(data.unpaid.overdue)}
              </span>
            </div>
          )}
          {data.unpaid.notDueYet > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gray-300 rounded-sm"></div>
              <span className="text-gray-600">
                Not due yet {formatCurrency(data.unpaid.notDueYet)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Paid Section */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <button
            onClick={() => onViewDetails?.('paid')}
            className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            {formatCurrency(paidTotal)} Paid
          </button>
          <span className="text-xs text-gray-500">{data.paid.periodLabel}</span>
        </div>

        {/* Paid Progress Bar */}
        <div className="w-full h-8 bg-gray-100 rounded-lg overflow-hidden flex">
          {data.paid.notDeposited > 0 && (
            <div
              style={{ width: `${notDepositedPercent}%` }}
              className="bg-blue-300 flex items-center justify-center"
            >
              {notDepositedPercent > 15 && (
                <span className="text-xs font-medium text-blue-900 px-2">
                  Not deposited {formatCurrency(data.paid.notDeposited)}
                </span>
              )}
            </div>
          )}
          {data.paid.deposited > 0 && (
            <div
              style={{ width: `${depositedPercent}%` }}
              className="bg-green-500 flex items-center justify-center"
            >
              {depositedPercent > 15 && (
                <span className="text-xs font-medium text-white px-2">
                  Deposited {formatCurrency(data.paid.deposited)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Paid Legend */}
        <div className="flex items-center gap-4 mt-2 text-xs">
          {data.paid.notDeposited > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-blue-300 rounded-sm"></div>
              <span className="text-gray-600">
                Not deposited {formatCurrency(data.paid.notDeposited)}
              </span>
            </div>
          )}
          {data.paid.deposited > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
              <span className="text-gray-600">
                Deposited {formatCurrency(data.paid.deposited)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoicesWidget;
