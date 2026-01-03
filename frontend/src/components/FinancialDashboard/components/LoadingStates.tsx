import React from 'react';
import { cn } from '../../../lib/utils';

export const CardSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn(
    'rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-6 animate-pulse',
    className
  )}>
    <div className="flex items-start justify-between mb-4">
      <div className="w-14 h-14 bg-gray-300 rounded-xl" />
      <div className="h-6 w-20 bg-gray-300 rounded-full" />
    </div>
    <div className="space-y-3">
      <div className="h-3 w-24 bg-gray-300 rounded" />
      <div className="h-8 w-32 bg-gray-300 rounded" />
      <div className="h-3 w-28 bg-gray-300 rounded" />
    </div>
  </div>
);

export const ChartSkeleton: React.FC<{ className?: string; height?: number }> = ({
  className,
  height = 400,
}) => (
  <div className={cn(
    'rounded-2xl border border-gray-200 bg-white p-6 animate-pulse',
    className
  )}>
    {/* Header */}
    <div className="flex items-center justify-between mb-6">
      <div className="h-6 w-48 bg-gray-300 rounded" />
      <div className="flex gap-3">
        <div className="h-8 w-24 bg-gray-300 rounded" />
        <div className="h-8 w-24 bg-gray-300 rounded" />
      </div>
    </div>

    {/* Chart area */}
    <div className="space-y-4" style={{ height: `${height}px` }}>
      <div className="flex items-end gap-2 h-full">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-200 rounded-t-lg"
            style={{ height: `${Math.random() * 60 + 40}%` }}
          />
        ))}
      </div>
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; className?: string }> = ({
  rows = 5,
  className,
}) => (
  <div className={cn('rounded-2xl border border-gray-200 bg-white overflow-hidden', className)}>
    {/* Header */}
    <div className="bg-gray-50 border-b border-gray-200 p-4">
      <div className="flex gap-4">
        <div className="h-4 w-32 bg-gray-300 rounded" />
        <div className="h-4 w-24 bg-gray-300 rounded" />
        <div className="h-4 w-28 bg-gray-300 rounded" />
        <div className="flex-1" />
      </div>
    </div>

    {/* Rows */}
    <div className="divide-y divide-gray-200">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="flex gap-4 items-center">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="flex-1" />
            <div className="h-8 w-20 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 p-6">
    {/* KPI Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartSkeleton />
      <ChartSkeleton />
    </div>

    {/* Table */}
    <TableSkeleton />
  </div>
);

// Shimmer effect for more polished loading
export const ShimmerSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('relative overflow-hidden bg-gray-200 rounded', className)}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
  </div>
);

// Inline empty state for use within components
export const InlineEmptyState: React.FC<{
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}> = ({ icon, title = 'No data', description, className }) => (
  <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
    {icon && <div className="mb-4 text-gray-400">{icon}</div>}
    <h3 className="text-lg font-medium text-gray-900">{title}</h3>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
  </div>
);

// Add to tailwind.config.js:
// keyframes: {
//   shimmer: {
//     '100%': { transform: 'translateX(100%)' },
//   },
// },
