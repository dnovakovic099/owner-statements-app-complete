import React, { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, AreaChart as AreaChartIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type ChartType = 'line' | 'bar' | 'area' | 'pie';

export interface ChartDataPoint {
  name: string;
  [key: string]: string | number;
}

export interface ChartSeries {
  dataKey: string;
  name: string;
  color: string;
}

export interface ChartWithSelectorProps {
  title: string;
  data: ChartDataPoint[];
  series: ChartSeries[];
  defaultType?: ChartType;
  allowedTypes?: ChartType[];
  height?: number;
  showLegend?: boolean;
  isLoading?: boolean;
}

// ============================================================================
// Color Palette
// ============================================================================

const COLORS = [
  '#10B981', // Green
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

// ============================================================================
// Chart Type Selector Component
// ============================================================================

interface ChartTypeSelectorProps {
  currentType: ChartType;
  allowedTypes: ChartType[];
  onChange: (type: ChartType) => void;
}

const ChartTypeSelector: React.FC<ChartTypeSelectorProps> = ({
  currentType,
  allowedTypes,
  onChange,
}) => {
  const typeIcons: Record<ChartType, React.ReactNode> = {
    line: <LineChartIcon className="w-4 h-4" />,
    bar: <BarChart3 className="w-4 h-4" />,
    area: <AreaChartIcon className="w-4 h-4" />,
    pie: <PieChartIcon className="w-4 h-4" />,
  };

  const typeLabels: Record<ChartType, string> = {
    line: 'Line',
    bar: 'Bar',
    area: 'Area',
    pie: 'Pie',
  };

  return (
    <div className="flex items-center gap-1 bg-gray-100/80 backdrop-blur-sm rounded-lg p-1 border border-gray-200/50">
      {allowedTypes.map((type) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
            ${currentType === type
              ? 'bg-white text-gray-900 shadow-md scale-105'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }
          `}
          title={`${typeLabels[type]} Chart`}
        >
          {typeIcons[type]}
          <span className="hidden sm:inline">{typeLabels[type]}</span>
        </button>
      ))}
    </div>
  );
};

// ============================================================================
// Format Helpers
// ============================================================================

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
};

const formatFullCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// ============================================================================
// Custom Tooltip
// ============================================================================

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 bg-opacity-95 text-white p-3 rounded-lg shadow-lg border border-gray-700">
        <p className="font-semibold text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-medium">{entry.name}:</span>
            <span className="font-semibold">{formatFullCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================================
// Pie Chart Custom Label
// ============================================================================

const renderPieLabel = ({ name, value, percent }: any) => {
  return `${name}: ${(percent * 100).toFixed(0)}%`;
};

// ============================================================================
// Loading Skeleton
// ============================================================================

const ChartSkeleton: React.FC<{ height: number }> = ({ height }) => (
  <div className="animate-pulse" style={{ height }}>
    <div className="h-full bg-gray-200 rounded-lg flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading chart...</div>
    </div>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const ChartWithSelector: React.FC<ChartWithSelectorProps> = ({
  title,
  data,
  series,
  defaultType = 'line',
  allowedTypes = ['line', 'bar', 'area', 'pie'],
  height = 400,
  showLegend = true,
  isLoading = false,
}) => {
  const [chartType, setChartType] = useState<ChartType>(defaultType);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200/50 p-6 hover:shadow-card-hover transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <ChartSkeleton height={height} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200/50 p-6 hover:shadow-card-hover transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div
          className="flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
          style={{ height }}
        >
          <p className="text-gray-500 text-sm">No data available</p>
        </div>
      </div>
    );
  }

  // Prepare pie chart data (aggregate all series)
  const pieData = chartType === 'pie'
    ? series.map((s, index) => ({
        name: s.name,
        value: data.reduce((sum, d) => sum + (Number(d[s.dataKey]) || 0), 0),
        color: s.color || COLORS[index % COLORS.length],
      }))
    : [];

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200/50 p-6 hover:shadow-card-hover transition-all duration-200 group">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <ChartTypeSelector
          currentType={chartType}
          allowedTypes={allowedTypes}
          onChange={setChartType}
        />
      </div>

      <ResponsiveContainer width="100%" height={height}>
        {chartType === 'line' ? (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickFormatter={formatCurrency}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {series.map((s, index) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color || COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ fill: s.color || COLORS[index % COLORS.length], strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickFormatter={formatCurrency}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {series.map((s, index) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={s.name}
                fill={s.color || COLORS[index % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickFormatter={formatCurrency}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {series.map((s, index) => (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color || COLORS[index % COLORS.length]}
                fill={s.color || COLORS[index % COLORS.length]}
                fillOpacity={0.3}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : (
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderPieLabel}
              outerRadius={height / 3}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any) => formatFullCurrency(value as number)} />
            {showLegend && <Legend />}
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartWithSelector;
