import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, Wallet, Minus } from 'lucide-react';

// Component API Types
interface BreakdownItem {
  label: string;
  value: number;
  color?: string;
}

interface SummaryBubbleProps {
  value: number;
  previousValue: number;
  label: string;
  breakdown?: BreakdownItem[];
  variant?: 'income' | 'expense';
  className?: string;
  changePercentage?: number;
}

interface SummaryBubblesProps {
  totalIncome: number;
  totalExpenses: number;
  incomeChange?: number;  // percentage
  expensesChange?: number; // percentage
  netIncomeChange?: number; // percentage
  isLoading?: boolean;
  // Legacy props for backward compatibility
  income?: {
    value: number;
    previousValue: number;
    breakdown?: BreakdownItem[];
  };
  expenses?: {
    value: number;
    previousValue: number;
    breakdown?: BreakdownItem[];
  };
  className?: string;
}

// Animated Number Counter Hook
const useAnimatedNumber = (value: number, duration: number = 2000) => {
  const [displayValue, setDisplayValue] = useState(0);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
  });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest: number) => {
      setDisplayValue(latest);
    });
    return () => unsubscribe();
  }, [springValue]);

  return displayValue;
};

// Format currency helper
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Calculate percentage change
const calculateChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Individual Summary Bubble Component
const SummaryBubble: React.FC<SummaryBubbleProps> = ({
  value,
  previousValue,
  label,
  breakdown = [],
  variant = 'income',
  className = '',
  changePercentage,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const animatedValue = useAnimatedNumber(value);
  const percentChange = changePercentage ?? calculateChange(value, previousValue);

  // For income: positive change is good (green)
  // For expenses: negative change is good (green), positive is bad (red)
  const isGoodChange = variant === 'income'
    ? percentChange > 0
    : percentChange < 0;

  const hasChange = percentChange !== 0 && percentChange !== undefined;

  // Theme configuration based on variant
  const themes = {
    income: {
      gradient: 'from-emerald-400 via-green-500 to-teal-600',
      glowColor: 'rgba(16, 185, 129, 0.4)',
      iconBg: 'bg-emerald-500/20',
      icon: TrendingUp,
      accentColor: 'text-emerald-300',
      borderColor: 'border-emerald-400/30',
    },
    expense: {
      gradient: 'from-rose-400 via-red-500 to-pink-600',
      glowColor: 'rgba(239, 68, 68, 0.4)',
      iconBg: 'bg-rose-500/20',
      icon: Wallet,
      accentColor: 'text-rose-300',
      borderColor: 'border-rose-400/30',
    },
  };

  const theme = themes[variant];
  const Icon = theme.icon;

  return (
    <motion.div
      className={`relative ${className}`}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, type: 'spring' }}
    >
      {/* Glow Effect */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background: theme.glowColor,
        }}
        animate={{
          scale: isHovered ? 1.1 : 1,
          opacity: isHovered ? 0.8 : 0.4,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Main Bubble Container */}
      <motion.div
        className={`relative aspect-square rounded-full bg-gradient-to-br ${theme.gradient} p-1 shadow-2xl`}
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        {/* Glass Layer */}
        <div className="relative h-full w-full rounded-full bg-white/10 backdrop-blur-xl border border-white/20 overflow-hidden">
          {/* Shimmer Effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{
              x: isHovered ? ['0%', '100%'] : '0%',
            }}
            transition={{
              duration: 1.5,
              repeat: isHovered ? Infinity : 0,
              ease: 'linear',
            }}
          />

          {/* Percentage Badge - Top Right Corner */}
          {hasChange && (
            <motion.div
              className="absolute top-4 right-4 z-10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
              whileHover={{ scale: 1.1 }}
            >
              <div
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm ${
                  isGoodChange
                    ? 'bg-green-100/90 text-green-700 border border-green-200/50'
                    : 'bg-red-100/90 text-red-700 border border-red-200/50'
                }`}
                title="vs previous period"
              >
                {percentChange > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : percentChange < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
                <span className="text-xs font-bold">
                  {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
                </span>
              </div>
            </motion.div>
          )}

          {/* No Change Badge */}
          {!hasChange && (
            <motion.div
              className="absolute top-4 right-4 z-10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
            >
              <div
                className="flex items-center gap-1 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm bg-gray-100/90 text-gray-500 border border-gray-200/50"
                title="vs previous period"
              >
                <Minus className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">—</span>
              </div>
            </motion.div>
          )}

          {/* Content Container */}
          <div className="relative h-full flex flex-col items-center justify-center p-8 text-white">
            {/* Icon */}
            <motion.div
              className={`${theme.iconBg} rounded-full p-3 mb-4`}
              animate={{
                rotate: isHovered ? 360 : 0,
              }}
              transition={{ duration: 0.6 }}
            >
              <Icon className="w-8 h-8 text-white" />
            </motion.div>

            {/* Label */}
            <h3 className="text-sm font-medium uppercase tracking-wider mb-2 opacity-90">
              {label}
            </h3>

            {/* Value */}
            <div className="text-4xl font-bold tracking-tight">
              {formatCurrency(animatedValue)}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Breakdown Popup */}
      {breakdown.length > 0 && (
        <motion.div
          className={`absolute top-full left-1/2 -translate-x-1/2 mt-4 w-64 rounded-2xl bg-white shadow-2xl border ${theme.borderColor} overflow-hidden`}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{
            opacity: isHovered ? 1 : 0,
            y: isHovered ? 0 : -10,
            scale: isHovered ? 1 : 0.95,
            pointerEvents: isHovered ? 'auto' : 'none',
          }}
          transition={{ duration: 0.2 }}
        >
          {/* Breakdown Header */}
          <div className={`bg-gradient-to-r ${theme.gradient} p-4`}>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wide">
              Breakdown
            </h4>
          </div>

          {/* Breakdown Items */}
          <div className="p-4 space-y-3">
            {breakdown.map((item, index) => {
              const percentage = value > 0 ? (item.value / value) * 100 : 0;
              return (
                <motion.div
                  key={index}
                  className="space-y-1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">
                      {item.label}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full bg-gradient-to-r ${theme.gradient}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, delay: index * 0.1 }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    {percentage.toFixed(1)}% of total
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

// Main SummaryBubbles Container Component
const SummaryBubbles: React.FC<SummaryBubblesProps> = ({
  totalIncome,
  totalExpenses,
  incomeChange,
  expensesChange,
  netIncomeChange,
  isLoading = false,
  income,
  expenses,
  className = '',
}) => {
  // Support both new and legacy prop formats
  const incomeValue = totalIncome ?? income?.value ?? 0;
  const expensesValue = totalExpenses ?? expenses?.value ?? 0;
  const incomePrevValue = income?.previousValue ?? 0;
  const expensesPrevValue = expenses?.previousValue ?? 0;

  console.log('[SummaryBubbles] Received props:', {
    totalIncome,
    totalExpenses,
    incomeChange,
    expensesChange,
    netIncomeChange,
    income,
    expenses,
  });

  const netIncome = incomeValue - expensesValue;
  const calculatedNetChange = netIncomeChange ?? calculateChange(
    netIncome,
    incomePrevValue - expensesPrevValue
  );

  if (isLoading) {
    return (
      <div className={`w-full ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 max-w-4xl mx-auto mb-8">
          <div className="aspect-square rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 animate-pulse" />
          <div className="aspect-square rounded-full bg-gradient-to-br from-rose-400 to-pink-600 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Main Bubbles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 max-w-4xl mx-auto mb-8">
        {/* Income Bubble */}
        <SummaryBubble
          value={incomeValue}
          previousValue={incomePrevValue}
          label="Total Income"
          breakdown={income?.breakdown}
          variant="income"
          changePercentage={incomeChange}
        />

        {/* Expenses Bubble */}
        <SummaryBubble
          value={expensesValue}
          previousValue={expensesPrevValue}
          label="Total Expenses"
          breakdown={expenses?.breakdown}
          variant="expense"
          changePercentage={expensesChange}
        />
      </div>

      {/* Net Income Summary Bar */}
      <motion.div
        className="max-w-2xl mx-auto mt-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="relative rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 shadow-xl border border-slate-700/50 overflow-hidden">
          {/* Animated Background */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10"
            animate={{
              x: ['0%', '100%', '0%'],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'linear',
            }}
          />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-400 uppercase tracking-wider mb-1">
                  Net Income
                </p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(netIncome)}
                </p>
              </div>
            </div>

            <motion.div
              className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                calculatedNetChange >= 0
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
              whileHover={{ scale: 1.05 }}
            >
              {calculatedNetChange >= 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              <span className="text-lg font-bold">
                {calculatedNetChange > 0 ? '+' : ''}{Math.abs(calculatedNetChange).toFixed(1)}%
              </span>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SummaryBubbles;
export { SummaryBubble };
export type { SummaryBubbleProps, SummaryBubblesProps, BreakdownItem };
