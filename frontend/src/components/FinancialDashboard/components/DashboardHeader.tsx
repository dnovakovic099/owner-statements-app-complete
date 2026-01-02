import React from 'react';
import { BarChart3, Download, RefreshCw, Calendar, Filter } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  onExport?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  className?: string;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = 'Financial Dashboard',
  subtitle = 'Comprehensive financial analytics and insights',
  onExport,
  onRefresh,
  isRefreshing = false,
  dateRange,
  className,
}) => {
  const formatDateRange = () => {
    if (!dateRange?.startDate || !dateRange?.endDate) {
      return 'Select date range';
    }

    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };

    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  return (
    <div className={cn(
      'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600',
      'border-b border-blue-700/20 shadow-xl',
      'px-6 pt-6 pb-8',
      className
    )}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,0.1),transparent)]" />
      </div>

      <div className="relative">
        {/* Main header content */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-2xl shadow-lg">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>

            {/* Title and subtitle */}
            <div>
              <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
                {title}
              </h1>
              <p className="text-blue-100 text-sm font-medium">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {onRefresh && (
              <Button
                onClick={onRefresh}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
                className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all"
              >
                <RefreshCw className={cn(
                  'w-4 h-4 mr-2',
                  isRefreshing && 'animate-spin'
                )} />
                Refresh
              </Button>
            )}

            {onExport && (
              <Button
                onClick={onExport}
                variant="outline"
                size="sm"
                className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Date range indicator */}
        {dateRange && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
            <Calendar className="w-4 h-4 text-blue-100" />
            <span className="text-sm font-semibold text-white">
              {formatDateRange()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Secondary header for sections
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
  };
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
}) => {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-lg">
            <Icon className="w-5 h-5 text-white" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {action && (
        <Button
          onClick={action.onClick}
          variant="outline"
          size="sm"
          className="hover:bg-blue-50 hover:border-blue-300 transition-all"
        >
          {action.icon && <action.icon className="w-4 h-4 mr-2" />}
          {action.label}
        </Button>
      )}
    </div>
  );
};
