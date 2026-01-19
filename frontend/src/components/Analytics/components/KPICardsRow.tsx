import React from 'react';
import { KPICard } from './KPICard';

export interface KPIData {
  revenue: number;
  previousRevenue?: number;
  revenueChange?: number;
  payouts: number;
  previousPayouts?: number;
  payoutsChange?: number;
  pmFees: number;
  previousPmFees?: number;
  pmFeesChange?: number;
  statementCount: number;
  previousStatementCount?: number;
  statementCountChange?: number;
}

export interface KPICardsRowProps {
  data: KPIData;
  loading?: boolean;
  className?: string;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US').format(num);
};

export const KPICardsRow: React.FC<KPICardsRowProps> = ({
  data,
  loading = false,
  className,
}) => {
  const kpiCards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(data.revenue),
      previousValue: data.previousRevenue !== undefined
        ? formatCurrency(data.previousRevenue)
        : undefined,
      percentChange: data.revenueChange,
    },
    {
      title: 'Total Payouts',
      value: formatCurrency(data.payouts),
      previousValue: data.previousPayouts !== undefined
        ? formatCurrency(data.previousPayouts)
        : undefined,
      percentChange: data.payoutsChange,
    },
    {
      title: 'PM Fees',
      value: formatCurrency(data.pmFees),
      previousValue: data.previousPmFees !== undefined
        ? formatCurrency(data.previousPmFees)
        : undefined,
      percentChange: data.pmFeesChange,
    },
    {
      title: 'Statements',
      value: formatNumber(data.statementCount),
      previousValue: data.previousStatementCount !== undefined
        ? formatNumber(data.previousStatementCount)
        : undefined,
      percentChange: data.statementCountChange,
    },
  ];

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 ${className || ''}`}
    >
      {kpiCards.map((card, index) => (
        <KPICard
          key={index}
          title={card.title}
          value={card.value}
          previousValue={card.previousValue}
          percentChange={card.percentChange}
          loading={loading}
        />
      ))}
    </div>
  );
};

export default KPICardsRow;
