import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Wallet, Activity } from 'lucide-react';
import { KPICard } from './KPICard';

interface EnhancedSummaryCardsProps {
  totalIncome: number;
  totalExpenses: number;
  incomeChange?: number;
  expensesChange?: number;
  loading?: boolean;
}

export const EnhancedSummaryCards: React.FC<EnhancedSummaryCardsProps> = ({
  totalIncome,
  totalExpenses,
  incomeChange = 0,
  expensesChange = 0,
  loading = false,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const cashFlow = totalIncome > 0 ? (totalIncome - totalExpenses) : 0;

  // Calculate net profit change (simplified - would need historical data for accurate calculation)
  const netProfitChange = incomeChange - expensesChange;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {/* Total Revenue */}
      <KPICard
        title="Total Revenue"
        value={formatCurrency(totalIncome)}
        icon={TrendingUp}
        variant="success"
        trend={incomeChange !== 0 ? {
          value: incomeChange,
          label: 'vs previous period'
        } : undefined}
        subtitle="Total income across all properties"
        loading={loading}
      />

      {/* Total Expenses */}
      <KPICard
        title="Total Expenses"
        value={formatCurrency(totalExpenses)}
        icon={TrendingDown}
        variant="danger"
        trend={expensesChange !== 0 ? {
          value: -expensesChange, // Negative because lower expenses is better
          label: 'vs previous period'
        } : undefined}
        subtitle="Operating costs and fees"
        loading={loading}
      />

      {/* Net Profit */}
      <KPICard
        title="Net Profit"
        value={formatCurrency(netProfit)}
        icon={DollarSign}
        variant={netProfit >= 0 ? 'info' : 'warning'}
        trend={netProfitChange !== 0 ? {
          value: netProfitChange,
          label: `${profitMargin.toFixed(1)}% margin`
        } : {
          value: 0,
          label: `${profitMargin.toFixed(1)}% margin`
        }}
        subtitle={netProfit >= 0 ? 'Positive cash flow' : 'Negative cash flow'}
        loading={loading}
      />

      {/* Cash Flow / Operating Margin */}
      <KPICard
        title="Operating Margin"
        value={`${profitMargin.toFixed(1)}%`}
        icon={Activity}
        variant="default"
        subtitle={`${formatCurrency(cashFlow)} cash flow`}
        loading={loading}
      />
    </div>
  );
};

// Alternative compact version for secondary sections
interface CompactMetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'orange';
}

export const CompactMetricCard: React.FC<CompactMetricCardProps> = ({
  label,
  value,
  change,
  icon: Icon,
  color = 'blue',
}) => {
  const colorStyles = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  const iconColors = {
    blue: 'text-blue-600',
    green: 'text-emerald-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorStyles[color]} transition-all duration-200 hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${iconColors[color]}`} />
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {label}
            </p>
          </div>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {change !== undefined && change !== 0 && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${
            change > 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {change > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>{Math.abs(change).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
