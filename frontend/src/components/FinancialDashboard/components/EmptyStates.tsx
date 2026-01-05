import React from 'react';
import {
  BarChart3,
  Calendar,
  FileText,
  AlertCircle,
  Filter,
  Database
} from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ElementType;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'error' | 'info';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FileText,
  action,
  variant = 'default',
  className,
}) => {
  const variantStyles = {
    default: {
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-400',
      titleColor: 'text-gray-900',
      descColor: 'text-gray-600',
    },
    error: {
      iconBg: 'bg-red-100',
      iconColor: 'text-red-500',
      titleColor: 'text-red-900',
      descColor: 'text-red-700',
    },
    info: {
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-500',
      titleColor: 'text-blue-900',
      descColor: 'text-blue-700',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-6 text-center',
      className
    )}>
      <div className={cn(
        'w-20 h-20 rounded-full flex items-center justify-center mb-6',
        styles.iconBg
      )}>
        <Icon className={cn('w-10 h-10', styles.iconColor)} />
      </div>

      <h3 className={cn('text-xl font-bold mb-2', styles.titleColor)}>
        {title}
      </h3>

      <p className={cn('text-sm max-w-md mb-6', styles.descColor)}>
        {description}
      </p>

      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
};

// Specific empty states for common scenarios
export const NoDataEmptyState: React.FC<{
  onSelectDateRange?: () => void;
}> = ({ onSelectDateRange }) => (
  <EmptyState
    icon={Calendar}
    title="No Data Available"
    description="Select a date range to view your financial analytics and insights."
    action={onSelectDateRange ? {
      label: 'Select Date Range',
      onClick: onSelectDateRange,
    } : undefined}
    variant="info"
  />
);

export const NoTransactionsEmptyState: React.FC = () => (
  <EmptyState
    icon={FileText}
    title="No Transactions Found"
    description="There are no transactions for the selected period. Try adjusting your date range or filters."
    variant="default"
  />
);

export const NoChartDataEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 text-gray-500 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300">
    <BarChart3 className="w-16 h-16 mb-4 opacity-30" />
    <p className="text-sm font-medium text-gray-700">No data to display</p>
    <p className="text-xs mt-1 text-gray-500">Adjust your filters to see chart data</p>
  </div>
);

export const ErrorEmptyState: React.FC<{
  error?: string;
  onRetry?: () => void;
}> = ({ error, onRetry }) => (
  <EmptyState
    icon={AlertCircle}
    title="Unable to Load Data"
    description={error || "We encountered an error while loading your financial data. Please try again."}
    action={onRetry ? {
      label: 'Retry',
      onClick: onRetry,
    } : undefined}
    variant="error"
  />
);

export const NoResultsEmptyState: React.FC<{
  onClearFilters?: () => void;
}> = ({ onClearFilters }) => (
  <EmptyState
    icon={Filter}
    title="No Results Found"
    description="No data matches your current filters. Try adjusting your search criteria."
    action={onClearFilters ? {
      label: 'Clear Filters',
      onClick: onClearFilters,
    } : undefined}
    variant="info"
  />
);

// Inline empty state for smaller components
export const InlineEmptyState: React.FC<{
  message: string;
  icon?: React.ElementType;
}> = ({ message, icon: Icon = Database }) => (
  <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
    <Icon className="w-5 h-5 opacity-50" />
    <span className="text-sm font-medium">{message}</span>
  </div>
);

// Loading state with message
export const LoadingState: React.FC<{
  message?: string;
}> = ({ message = 'Loading financial data...' }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="relative w-16 h-16 mb-4">
      <div className="absolute inset-0 rounded-full border-4 border-blue-200" />
      <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
    </div>
    <p className="text-sm font-medium text-gray-700">{message}</p>
  </div>
);
