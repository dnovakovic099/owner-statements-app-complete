import React, { useMemo } from 'react';
import { Settings, Bell, FileText, Download, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import { DateRange } from '../DateRangeFilter';

export interface DashboardHeaderProps {
  // New props
  onGenerateStatement?: () => void;
  onExportData?: () => void;
  onSettings?: () => void;
  onNotifications?: () => void;
  notificationCount?: number;
  className?: string;
  // Legacy props for backwards compatibility
  dateRange?: DateRange;
  onExport?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onGenerateStatement,
  onExportData,
  onSettings,
  onNotifications,
  notificationCount = 0,
  className,
  // Legacy props
  dateRange,
  onExport,
  onRefresh,
  isRefreshing = false,
}) => {
  // Use onExport as fallback for onExportData
  const handleExport = onExportData || onExport;
  // Get time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning!';
    if (hour < 18) return 'Good afternoon!';
    return 'Good evening!';
  }, []);

  return (
    <div className={cn(
      'bg-white border-b border-gray-200',
      'px-6 py-4',
      className
    )}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Greeting */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {greeting}
          </h1>
          <p className="text-sm text-gray-600">
            Here's your business overview
          </p>
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary: Generate Statement */}
          {onGenerateStatement && (
            <Button
              onClick={onGenerateStatement}
              variant="default"
              size="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Generate Statement
            </Button>
          )}

          {/* Secondary: Export Data */}
          {handleExport && (
            <Button
              onClick={handleExport}
              variant="outline"
              size="default"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
          )}

          {/* Refresh button (legacy support) */}
          {onRefresh && (
            <Button
              onClick={onRefresh}
              variant="ghost"
              size="icon"
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              disabled={isRefreshing}
              aria-label="Refresh data"
            >
              <RefreshCw className={cn('w-5 h-5', isRefreshing && 'animate-spin')} />
            </Button>
          )}

          {/* Icon button: Settings */}
          {onSettings && (
            <Button
              onClick={onSettings}
              variant="ghost"
              size="icon"
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          )}

          {/* Icon button: Notifications with badge */}
          {onNotifications && (
            <Button
              onClick={onNotifications}
              variant="ghost"
              size="icon"
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 relative"
              aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount})` : ''}`}
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full h-5 w-5 flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Secondary header for sections (keeping for backwards compatibility)
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
