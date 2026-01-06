import React from 'react';
import { ChevronRight } from 'lucide-react';

interface PaymentStatus {
  notPaid: {
    amount: number;
    count: number;
    overdue: number;
  };
  paid: {
    amount: number;
    count: number;
  };
  deposited: {
    amount: number;
    count: number;
  };
}

interface PaymentStatusCardsProps {
  data: PaymentStatus;
  loading?: boolean;
  onCardClick?: (type: 'notPaid' | 'paid' | 'deposited') => void;
}

const PaymentStatusCards: React.FC<PaymentStatusCardsProps> = ({
  data,
  loading = false,
  onCardClick
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Not Paid Card */}
      <div
        onClick={() => onCardClick?.('notPaid')}
        className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      >
        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Not Paid</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {formatCurrency(data.notPaid.amount)}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          {data.notPaid.overdue > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                {data.notPaid.overdue} overdue
              </span>
              <span className="text-xs text-gray-500">
                {data.notPaid.count} total invoices
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Paid Card */}
      <div
        onClick={() => onCardClick?.('paid')}
        className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      >
        <div className="h-1 bg-gradient-to-r from-green-400 to-emerald-500"></div>
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Paid</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {formatCurrency(data.paid.amount)}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {data.paid.count} paid
            </span>
          </div>
        </div>
      </div>

      {/* Deposited Card */}
      <div
        onClick={() => onCardClick?.('deposited')}
        className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      >
        <div className="h-1 bg-gradient-to-r from-blue-400 to-cyan-500"></div>
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Deposited</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {formatCurrency(data.deposited.amount)}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {data.deposited.count} deposited
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusCards;
