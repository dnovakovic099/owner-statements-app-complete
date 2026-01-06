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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-7 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Not Paid Card */}
      <div
        onClick={() => onCardClick?.('notPaid')}
        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group p-4"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <p className="text-sm font-semibold text-gray-700">Not Paid</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {formatCurrency(data.notPaid.amount)}
        </p>
        {data.notPaid.overdue > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              {data.notPaid.overdue} overdue
            </span>
            <span className="text-xs text-gray-500">
              {data.notPaid.count} total invoices
            </span>
          </div>
        )}
      </div>

      {/* Paid Card */}
      <div
        onClick={() => onCardClick?.('paid')}
        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group p-4"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <p className="text-sm font-semibold text-gray-700">Paid</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {formatCurrency(data.paid.amount)}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {data.paid.count} paid
          </span>
        </div>
      </div>

      {/* Deposited Card */}
      <div
        onClick={() => onCardClick?.('deposited')}
        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group p-4"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <p className="text-sm font-semibold text-gray-700">Deposited</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {formatCurrency(data.deposited.amount)}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {data.deposited.count} deposited
          </span>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusCards;
