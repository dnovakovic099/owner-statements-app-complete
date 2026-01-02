import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  subtitle?: string;
  loading?: boolean;
  className?: string;
}

const variantStyles = {
  default: {
    gradient: 'from-gray-50 via-gray-100 to-gray-50',
    iconBg: 'bg-gradient-to-br from-gray-500 to-gray-600',
    textPrimary: 'text-gray-900',
    textSecondary: 'text-gray-600',
    border: 'border-gray-200',
    glow: 'shadow-gray-200/50',
  },
  success: {
    gradient: 'from-emerald-50 via-green-50 to-emerald-50',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    textPrimary: 'text-emerald-900',
    textSecondary: 'text-emerald-700',
    border: 'border-emerald-200',
    glow: 'shadow-emerald-200/50',
  },
  danger: {
    gradient: 'from-red-50 via-rose-50 to-red-50',
    iconBg: 'bg-gradient-to-br from-red-500 to-rose-600',
    textPrimary: 'text-red-900',
    textSecondary: 'text-red-700',
    border: 'border-red-200',
    glow: 'shadow-red-200/50',
  },
  warning: {
    gradient: 'from-amber-50 via-yellow-50 to-amber-50',
    iconBg: 'bg-gradient-to-br from-amber-500 to-yellow-600',
    textPrimary: 'text-amber-900',
    textSecondary: 'text-amber-700',
    border: 'border-amber-200',
    glow: 'shadow-amber-200/50',
  },
  info: {
    gradient: 'from-blue-50 via-indigo-50 to-blue-50',
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    textPrimary: 'text-blue-900',
    textSecondary: 'text-blue-700',
    border: 'border-blue-200',
    glow: 'shadow-blue-200/50',
  },
};

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  variant = 'default',
  subtitle,
  loading = false,
  className,
}) => {
  const styles = variantStyles[variant];
  const TrendIcon = trend && trend.value > 0 ? TrendingUp : TrendingDown;
  const trendColor = trend && trend.value > 0 ? 'text-emerald-600' : 'text-red-600';

  if (loading) {
    return (
      <div className={cn(
        'relative overflow-hidden rounded-2xl border bg-gradient-to-br',
        styles.gradient,
        styles.border,
        'shadow-lg shadow-gray-200/30',
        'p-6 animate-pulse',
        className
      )}>
        <div className="flex items-start justify-between mb-4">
          <div className="w-14 h-14 bg-gray-300 rounded-xl" />
          <div className="h-4 w-20 bg-gray-300 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 bg-gray-300 rounded" />
          <div className="h-8 w-32 bg-gray-300 rounded" />
          <div className="h-3 w-28 bg-gray-300 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-2xl border bg-gradient-to-br',
      styles.gradient,
      styles.border,
      'shadow-lg hover:shadow-xl',
      styles.glow,
      'transition-all duration-300 hover:scale-[1.02]',
      'p-6',
      className
    )}>
      {/* Subtle animated background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,0,0,0.1),transparent)]" />
      </div>

      {/* Content */}
      <div className="relative">
        {/* Header with icon and trend */}
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            'p-3.5 rounded-xl shadow-lg',
            styles.iconBg,
            'transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3'
          )}>
            <Icon className="w-7 h-7 text-white" />
          </div>

          {trend && (
            <div className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full',
              'bg-white/80 backdrop-blur-sm',
              'shadow-sm border border-gray-200/50',
              'transition-all duration-300 group-hover:scale-105'
            )}>
              <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />
              <span className={cn('text-xs font-semibold', trendColor)}>
                {Math.abs(trend.value).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        <h4 className={cn(
          'text-sm font-semibold mb-2 uppercase tracking-wide',
          styles.textSecondary
        )}>
          {title}
        </h4>

        {/* Value */}
        <p className={cn(
          'text-3xl font-bold mb-1.5 tabular-nums',
          styles.textPrimary,
          'transition-all duration-300'
        )}>
          {value}
        </p>

        {/* Subtitle or trend label */}
        {(subtitle || trend?.label) && (
          <p className="text-xs text-gray-600 font-medium">
            {subtitle || trend?.label}
          </p>
        )}
      </div>

      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
  );
};
