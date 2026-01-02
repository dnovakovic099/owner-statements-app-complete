import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Wallet,
  Percent
} from 'lucide-react';

interface KPICardsProps {
  totalIncome: number;
  totalExpenses: number;
  incomeChange?: number;
  expensesChange?: number;
  isLoading?: boolean;
}

interface KPICardData {
  label: string;
  value: number;
  change?: number;
  icon: React.ReactNode;
  colorClass: string;
  borderColor: string;
  iconBgColor: string;
  iconColor: string;
}

const KPICards: React.FC<KPICardsProps> = ({
  totalIncome,
  totalExpenses,
  incomeChange,
  expensesChange,
  isLoading = false,
}) => {
  const netIncome = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

  // Calculate net income change if we have both income and expense changes
  const netIncomeChange =
    incomeChange !== undefined && expensesChange !== undefined
      ? incomeChange - expensesChange
      : undefined;

  const cards: KPICardData[] = [
    {
      label: 'Total Income',
      value: totalIncome,
      change: incomeChange,
      icon: <DollarSign className="w-5 h-5" />,
      colorClass: 'text-green-600',
      borderColor: 'border-green-500',
      iconBgColor: 'bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      label: 'Total Expenses',
      value: totalExpenses,
      change: expensesChange,
      icon: <CreditCard className="w-5 h-5" />,
      colorClass: 'text-red-600',
      borderColor: 'border-red-500',
      iconBgColor: 'bg-red-50',
      iconColor: 'text-red-600',
    },
    {
      label: 'Net Income',
      value: netIncome,
      change: netIncomeChange,
      icon: <Wallet className="w-5 h-5" />,
      colorClass: netIncome >= 0 ? 'text-blue-600' : 'text-red-600',
      borderColor: 'border-blue-500',
      iconBgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Profit Margin',
      value: profitMargin,
      icon: <Percent className="w-5 h-5" />,
      colorClass: profitMargin >= 0 ? 'text-purple-600' : 'text-red-600',
      borderColor: 'border-purple-500',
      iconBgColor: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
  ];

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));
  };

  const ChangeBadge: React.FC<{ change?: number; isPercentageCard?: boolean }> = ({
    change,
    isPercentageCard = false
  }) => {
    if (change === undefined) return null;

    const isPositive = change >= 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const bgColor = isPositive ? 'bg-green-100' : 'bg-red-100';
    const textColor = isPositive ? 'text-green-700' : 'text-red-700';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className={`flex items-center gap-1 px-2 py-1 rounded-full ${bgColor} ${textColor} text-xs font-medium`}
      >
        <Icon className="w-3 h-3" />
        <span>{Math.abs(change).toFixed(1)}%</span>
      </motion.div>
    );
  };

  const SkeletonCard = () => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
          <div className="h-8 bg-gray-300 rounded w-32 mb-2"></div>
          <div className="h-5 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => {
        const isPercentageCard = card.label === 'Profit Margin';
        const displayValue = isPercentageCard
          ? card.value.toFixed(1)
          : formatCurrency(card.value);
        const sign = !isPercentageCard && card.value < 0 ? '-' : '';

        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className={`
              relative bg-white rounded-xl border-l-4 ${card.borderColor}
              shadow-sm hover:shadow-md transition-all duration-300
              p-5 overflow-hidden group
            `}
          >
            {/* Subtle gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-gray-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative z-10">
              {/* Header: Label and Icon */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">
                    {card.label}
                  </p>
                </div>
                <div className={`${card.iconBgColor} ${card.iconColor} p-2.5 rounded-lg`}>
                  {card.icon}
                </div>
              </div>

              {/* Value */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
                className="mb-2"
              >
                <h3 className={`text-2xl font-bold ${card.colorClass} tracking-tight`}>
                  {sign}{isPercentageCard ? '' : ''}{displayValue}
                  {isPercentageCard && '%'}
                </h3>
              </motion.div>

              {/* Change Badge */}
              <div className="flex items-center justify-between">
                <ChangeBadge change={card.change} isPercentageCard={isPercentageCard} />

                {/* Sparkline placeholder - could be enhanced with actual trend data */}
                {card.change !== undefined && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
                    className="flex items-end gap-0.5 h-6"
                  >
                    {[3, 5, 4, 6, 5, 7, 6].map((height, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full ${
                          card.change && card.change >= 0 ? 'bg-green-400' : 'bg-red-400'
                        }`}
                        style={{ height: `${height * 3}px` }}
                      />
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Decorative corner element */}
            <div className={`
              absolute -right-6 -bottom-6 w-24 h-24 rounded-full
              ${card.iconBgColor} opacity-20 group-hover:opacity-30
              transition-opacity duration-300
            `} />
          </motion.div>
        );
      })}
    </div>
  );
};

export default KPICards;
