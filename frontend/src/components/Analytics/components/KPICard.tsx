import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface KPICardProps {
  title: string;
  value: string | number;
  previousValue?: string | number;
  percentChange?: number;
  loading?: boolean;
  className?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  previousValue,
  percentChange,
  loading = false,
  className,
}) => {
  const isPositive = percentChange !== undefined && percentChange >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  const trendColor = isPositive ? 'text-green-600' : 'text-red-600';
  const trendBgColor = isPositive ? 'bg-green-50' : 'bg-red-50';

  if (loading) {
    return (
      <div
        className={cn(
          'bg-white rounded-lg shadow-md p-6 border border-gray-200 animate-pulse',
          className
        )}
      >
        <div className="space-y-3">
          <div className="h-4 w-24 bg-gray-300 rounded" />
          <div className="h-8 w-32 bg-gray-300 rounded" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-gray-300 rounded" />
            <div className="h-4 w-16 bg-gray-300 rounded" />
          </div>
          <div className="h-3 w-28 bg-gray-300 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-md p-6 border border-gray-200',
        'hover:shadow-lg transition-shadow duration-200',
        className
      )}
    >
      {/* Title */}
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </h3>

      {/* Current Value */}
      <div className="text-3xl font-bold text-gray-900 mb-3 tabular-nums">
        {value}
      </div>

      {/* Trend Indicator */}
      {percentChange !== undefined && (
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full',
              trendBgColor
            )}
          >
            <TrendIcon className={cn('w-4 h-4', trendColor)} />
            <span className={cn('text-sm font-semibold', trendColor)}>
              {isPositive ? '+' : ''}
              {percentChange.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Previous Value */}
      {previousValue !== undefined && (
        <p className="text-xs text-gray-500 font-medium">
          Previous: {previousValue}
        </p>
      )}
    </div>
  );
};

export default KPICard;
