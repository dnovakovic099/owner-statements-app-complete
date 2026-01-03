import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Target, Building2, Home, Key, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ROIMetric {
  value: number; // ROI percentage
  change: number; // Change vs prior period (percentage points)
}

export interface ROIMetrics {
  average: ROIMetric;
  pm: ROIMetric;
  arbitrage: ROIMetric;
  owned: ROIMetric;
}

export interface TrendDataPoint {
  month: string; // YYYY-MM format or display format
  PM: number;
  Arbitrage: number;
  Owned: number;
}

export interface PropertyPerformance {
  propertyId: number;
  propertyName: string;
  roi: number; // ROI percentage
  trend: 'up' | 'down' | 'stable'; // Trend direction
}

export interface ROITabProps {
  roiData: ROIMetrics;
  trendData: TrendDataPoint[];
  topPerformers: PropertyPerformance[];
  needsAttention: PropertyPerformance[];
  onPropertyClick?: (propertyId: number) => void;
}

// ============================================================================
// Color Palette & Utilities
// ============================================================================

const CHART_COLORS = {
  PM: '#3B82F6',        // blue-500
  Arbitrage: '#F97316', // orange-500
  Owned: '#10B981',     // green-500
  grid: '#E5E7EB',      // gray-200
  text: '#6B7280',      // gray-500
} as const;

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const formatMonth = (monthStr: string): string => {
  // Handle both YYYY-MM and already formatted strings
  if (monthStr.includes('-')) {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return monthStr;
};

const getROIColor = (roi: number): 'success' | 'warning' | 'danger' => {
  if (roi >= 100) return 'success';
  if (roi >= 50) return 'warning';
  return 'danger';
};

const variantStyles = {
  success: {
    gradient: 'from-emerald-50 via-green-50 to-emerald-50',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    textPrimary: 'text-emerald-900',
    textSecondary: 'text-emerald-700',
    border: 'border-emerald-200',
    glow: 'shadow-emerald-200/50',
  },
  warning: {
    gradient: 'from-amber-50 via-yellow-50 to-amber-50',
    iconBg: 'bg-gradient-to-br from-amber-500 to-yellow-600',
    textPrimary: 'text-amber-900',
    textSecondary: 'text-amber-700',
    border: 'border-amber-200',
    glow: 'shadow-amber-200/50',
  },
  danger: {
    gradient: 'from-red-50 via-rose-50 to-red-50',
    iconBg: 'bg-gradient-to-br from-red-500 to-rose-600',
    textPrimary: 'text-red-900',
    textSecondary: 'text-red-700',
    border: 'border-red-200',
    glow: 'shadow-red-200/50',
  },
};

// ============================================================================
// ROI Metric Card Component
// ============================================================================

interface ROICardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  metric: ROIMetric;
}

const ROICard: React.FC<ROICardProps> = ({ title, icon: Icon, metric }) => {
  const variant = getROIColor(metric.value);
  const styles = variantStyles[variant];
  const TrendIcon = metric.change >= 0 ? TrendingUp : TrendingDown;
  const trendColor = metric.change >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-2xl border bg-gradient-to-br',
      styles.gradient,
      styles.border,
      'shadow-lg hover:shadow-xl',
      styles.glow,
      'transition-all duration-300 hover:scale-[1.02]',
      'p-6'
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

          {metric.change !== 0 && (
            <div className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full',
              'bg-white/80 backdrop-blur-sm',
              'shadow-sm border border-gray-200/50',
              'transition-all duration-300 group-hover:scale-105'
            )}>
              <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />
              <span className={cn('text-xs font-semibold', trendColor)}>
                {Math.abs(metric.change).toFixed(1)}%
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
          {formatPercentage(metric.value)}
        </p>

        {/* Subtitle */}
        <p className="text-xs text-gray-600 font-medium">
          {metric.change >= 0 ? 'vs last period' : 'vs last period'}
        </p>
      </div>

      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
  );
};

// ============================================================================
// Custom Tooltip Component
// ============================================================================

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-2">{formatMonth(label)}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-300">{entry.name}:</span>
            <span className="font-semibold">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================================
// Property Performance List Component
// ============================================================================

interface PropertyListProps {
  title: string;
  properties: PropertyPerformance[];
  onPropertyClick?: (propertyId: number) => void;
}

const PropertyList: React.FC<PropertyListProps> = ({ title, properties, onPropertyClick }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      {properties.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">No properties to display</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((property, index) => {
            const variant = getROIColor(property.roi);
            const TrendIcon = property.trend === 'up' ? TrendingUp : property.trend === 'down' ? TrendingDown : null;

            return (
              <div
                key={property.propertyId}
                onClick={() => onPropertyClick?.(property.propertyId)}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg',
                  'transition-all duration-200',
                  onPropertyClick ? 'cursor-pointer hover:bg-gray-50 hover:shadow-sm' : '',
                  'border border-transparent hover:border-gray-200'
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Rank */}
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-600">{index + 1}</span>
                  </div>

                  {/* Property Name */}
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {property.propertyName}
                  </span>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* ROI Percentage */}
                  <span className={cn(
                    'text-sm font-bold',
                    variant === 'success' && 'text-emerald-600',
                    variant === 'warning' && 'text-amber-600',
                    variant === 'danger' && 'text-red-600'
                  )}>
                    {formatPercentage(property.roi)}
                  </span>

                  {/* Trend Arrow */}
                  {TrendIcon && (
                    <TrendIcon className={cn(
                      'w-4 h-4',
                      property.trend === 'up' ? 'text-emerald-600' : 'text-red-600'
                    )} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main ROITab Component
// ============================================================================

export const ROITab: React.FC<ROITabProps> = ({
  roiData,
  trendData,
  topPerformers,
  needsAttention,
  onPropertyClick,
}) => {
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // ROI cards configuration
  const roiCards = useMemo(() => [
    { title: 'Average ROI', icon: Target, metric: roiData.average },
    { title: 'PM ROI', icon: Building2, metric: roiData.pm },
    { title: 'Arbitrage ROI', icon: Home, metric: roiData.arbitrage },
    { title: 'Owned ROI', icon: Key, metric: roiData.owned },
  ], [roiData]);

  return (
    <div className="space-y-6">
      {/* Top Row: ROI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {roiCards.map((card) => (
          <ROICard
            key={card.title}
            title={card.title}
            icon={card.icon}
            metric={card.metric}
          />
        ))}
      </div>

      {/* Middle Row: Multi-line Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Net Income by Home Category (Monthly Trend)
        </h3>

        {trendData.length === 0 ? (
          <div className="flex items-center justify-center h-80">
            <p className="text-sm text-gray-500">No trend data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={trendData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                stroke={CHART_COLORS.text}
                style={{ fontSize: '12px' }}
              />
              <YAxis
                tickFormatter={formatCurrency}
                stroke={CHART_COLORS.text}
                style={{ fontSize: '12px' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
                onMouseEnter={(e) => setHoveredLine(e.dataKey as string)}
                onMouseLeave={() => setHoveredLine(null)}
              />
              <Line
                type="monotone"
                dataKey="PM"
                stroke={CHART_COLORS.PM}
                strokeWidth={hoveredLine === 'PM' || !hoveredLine ? 3 : 2}
                opacity={hoveredLine === 'PM' || !hoveredLine ? 1 : 0.3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={800}
              />
              <Line
                type="monotone"
                dataKey="Arbitrage"
                stroke={CHART_COLORS.Arbitrage}
                strokeWidth={hoveredLine === 'Arbitrage' || !hoveredLine ? 3 : 2}
                opacity={hoveredLine === 'Arbitrage' || !hoveredLine ? 1 : 0.3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={800}
              />
              <Line
                type="monotone"
                dataKey="Owned"
                stroke={CHART_COLORS.Owned}
                strokeWidth={hoveredLine === 'Owned' || !hoveredLine ? 3 : 2}
                opacity={hoveredLine === 'Owned' || !hoveredLine ? 1 : 0.3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={800}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom Row: Two-column Property Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PropertyList
          title="Top Performers"
          properties={topPerformers}
          onPropertyClick={onPropertyClick}
        />
        <PropertyList
          title="Needs Attention"
          properties={needsAttention}
          onPropertyClick={onPropertyClick}
        />
      </div>
    </div>
  );
};

export default ROITab;
