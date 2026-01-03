import React from 'react';
import { DollarSign, Receipt, TrendingUp, Percent, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '../../../lib/utils';

export interface SummaryCardData {
  value: number;
  change: number;
  sparklineData: Array<{ value: number }>;
}

export interface SummaryCardsRowProps {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  profitMargin: number;
  incomeChange: number;
  expensesChange: number;
  netChange: number;
  marginChange: number;
  sparklineData: {
    income: Array<{ value: number }>;
    expenses: Array<{ value: number }>;
    net: Array<{ value: number }>;
    margin: Array<{ value: number }>;
  };
  onCardClick?: (cardType: 'income' | 'expenses' | 'net' | 'margin') => void;
}

interface CardConfig {
  id: 'income' | 'expenses' | 'net' | 'margin';
  label: string;
  value: number;
  change: number;
  sparklineData: Array<{ value: number }>;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  accentColor: string;
  formatValue: (val: number) => string;
}

export const SummaryCardsRow: React.FC<SummaryCardsRowProps> = ({
  totalIncome,
  totalExpenses,
  netIncome,
  profitMargin,
  incomeChange,
  expensesChange,
  netChange,
  marginChange,
  sparklineData,
  onCardClick,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const cards: CardConfig[] = [
    {
      id: 'income',
      label: 'Total Income',
      value: totalIncome,
      change: incomeChange,
      sparklineData: sparklineData.income,
      icon: DollarSign,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
      accentColor: '#10b981',
      formatValue: formatCurrency,
    },
    {
      id: 'expenses',
      label: 'Total Expenses',
      value: totalExpenses,
      change: expensesChange,
      sparklineData: sparklineData.expenses,
      icon: Receipt,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50',
      accentColor: '#ef4444',
      formatValue: formatCurrency,
    },
    {
      id: 'net',
      label: 'Net Income',
      value: netIncome,
      change: netChange,
      sparklineData: sparklineData.net,
      icon: TrendingUp,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50',
      accentColor: '#2563eb',
      formatValue: formatCurrency,
    },
    {
      id: 'margin',
      label: 'Profit Margin',
      value: profitMargin,
      change: marginChange,
      sparklineData: sparklineData.margin,
      icon: Percent,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-50',
      accentColor: '#8b5cf6',
      formatValue: formatPercent,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
      {cards.map((card) => (
        <SummaryCard
          key={card.id}
          {...card}
          onClick={onCardClick ? () => onCardClick(card.id) : undefined}
        />
      ))}
    </div>
  );
};

interface SummaryCardProps extends Omit<CardConfig, 'formatValue'> {
  formatValue: (val: number) => string;
  onClick?: () => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  label,
  value,
  change,
  sparklineData,
  icon: Icon,
  iconColor,
  iconBg,
  accentColor,
  formatValue,
  onClick,
}) => {
  const isPositiveChange = change >= 0;
  const hasValidSparkline = sparklineData && sparklineData.length >= 2;

  return (
    <div
      className={cn(
        'group relative overflow-hidden',
        'bg-white rounded-xl border border-gray-200',
        'shadow-sm hover:shadow-md',
        'transition-all duration-300',
        'p-5',
        onClick && 'cursor-pointer hover:scale-[1.02] hover:border-gray-300'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {/* Header: Label and Icon */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {label}
          </p>
        </div>
        <div className={cn(
          'p-2 rounded-lg',
          iconBg,
          'transition-transform duration-300 group-hover:scale-110'
        )}>
          <Icon className={cn('w-5 h-5', iconColor)} strokeWidth={2} />
        </div>
      </div>

      {/* Value */}
      <div className="mb-3">
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {formatValue(value)}
        </p>
      </div>

      {/* Change Indicator and Sparkline Row */}
      <div className="flex items-end justify-between">
        {/* Change Indicator */}
        <div className="flex items-center gap-1">
          {change !== 0 && (
            <>
              {isPositiveChange ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-600" strokeWidth={2.5} />
              )}
              <span className={cn(
                'text-sm font-semibold',
                isPositiveChange ? 'text-emerald-600' : 'text-red-600'
              )}>
                {Math.abs(change).toFixed(1)}%
              </span>
            </>
          )}
          {change === 0 && (
            <span className="text-sm font-medium text-gray-400">
              No change
            </span>
          )}
        </div>

        {/* Mini Sparkline */}
        {hasValidSparkline && (
          <div className="w-24 h-10 -mb-1 -mr-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={accentColor}
                  strokeWidth={2}
                  fill={`url(#gradient-${label})`}
                  isAnimationActive={true}
                  animationDuration={1000}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Hover Effect Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-gray-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
  );
};

// Helper function to generate sample sparkline data for testing
export const generateSampleSparklineData = (points: number = 6, baseValue: number = 100): Array<{ value: number }> => {
  return Array.from({ length: points }, (_, i) => ({
    value: baseValue + (Math.random() - 0.5) * baseValue * 0.3,
  }));
};
