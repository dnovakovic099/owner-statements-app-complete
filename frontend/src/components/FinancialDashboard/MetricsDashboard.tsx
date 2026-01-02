import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Home, BarChart3 } from 'lucide-react';
import TrendLineChart, { TrendLine } from './charts/TrendLineChart';

export interface PropertyMetrics {
  propertyId: number;
  propertyName: string;
  homeCategory: 'PM' | 'Arbitrage' | 'Owned';
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  roi: number; // Return on Investment percentage
  monthlyData: {
    month: string;
    netIncome: number;
  }[];
}

interface MetricsDashboardProps {
  properties: PropertyMetrics[];
  className?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercent = (value: number) => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  properties,
  className = '',
}) => {
  // Calculate aggregate metrics
  const metrics = useMemo(() => {
    const totalProperties = properties.length;
    const totalRevenue = properties.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalExpenses = properties.reduce((sum, p) => sum + p.totalExpenses, 0);
    const avgRevenuePerProperty = totalProperties > 0 ? totalRevenue / totalProperties : 0;
    const avgExpensePerProperty = totalProperties > 0 ? totalExpenses / totalProperties : 0;

    // ROI by category
    const categorizedProperties: Record<string, PropertyMetrics[]> = {
      PM: [],
      Arbitrage: [],
      Owned: [],
    };

    properties.forEach(p => {
      if (categorizedProperties[p.homeCategory]) {
        categorizedProperties[p.homeCategory].push(p);
      }
    });

    const avgROIByCategory = Object.entries(categorizedProperties).map(([category, props]) => {
      const avgROI = props.length > 0
        ? props.reduce((sum, p) => sum + p.roi, 0) / props.length
        : 0;

      return {
        category: category as 'PM' | 'Arbitrage' | 'Owned',
        avgROI,
        count: props.length,
        totalRevenue: props.reduce((sum, p) => sum + p.totalRevenue, 0),
        totalExpenses: props.reduce((sum, p) => sum + p.totalExpenses, 0),
        netIncome: props.reduce((sum, p) => sum + p.netIncome, 0),
      };
    });

    return {
      totalProperties,
      totalRevenue,
      totalExpenses,
      avgRevenuePerProperty,
      avgExpensePerProperty,
      avgROIByCategory,
    };
  }, [properties]);

  // Prepare trend chart data
  const trendChartData = useMemo<TrendLine[]>(() => {
    const categorizedData: Record<string, Map<string, number>> = {
      PM: new Map(),
      Arbitrage: new Map(),
      Owned: new Map(),
    };

    properties.forEach(property => {
      const categoryMap = categorizedData[property.homeCategory];
      if (categoryMap) {
        property.monthlyData.forEach(({ month, netIncome }) => {
          const currentValue = categoryMap.get(month) || 0;
          categoryMap.set(month, currentValue + netIncome);
        });
      }
    });

    return Object.entries(categorizedData).map(([category, monthMap]) => ({
      category: category as 'PM' | 'Arbitrage' | 'Owned',
      data: Array.from(monthMap.entries())
        .map(([month, value]) => ({ month, value }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    }));
  }, [properties]);

  // Top performing properties by ROI
  const topPropertiesByROI = useMemo(() => {
    return [...properties]
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 5);
  }, [properties]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Properties */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Properties</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.totalProperties}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Home className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Avg Revenue per Property */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Avg Revenue/Property</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(metrics.avgRevenuePerProperty)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Avg Expense per Property */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Avg Expense/Property</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(metrics.avgExpensePerProperty)}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        {/* Total Net Income */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Net Income</p>
              <p className={`text-2xl font-bold mt-1 ${
                (metrics.totalRevenue - metrics.totalExpenses) >= 0
                  ? 'text-emerald-600'
                  : 'text-red-600'
              }`}>
                {formatCurrency(metrics.totalRevenue - metrics.totalExpenses)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ROI by Category */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Average ROI by Home Category</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.avgROIByCategory.map(({ category, avgROI, count, netIncome }) => {
            const colors = {
              PM: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'text-blue-600' },
              Arbitrage: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'text-orange-600' },
              Owned: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', accent: 'text-green-600' },
            };
            const color = colors[category as keyof typeof colors];

            return (
              <div
                key={category}
                className={`${color.bg} border ${color.border} rounded-lg p-4`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${color.text}`}>{category}</span>
                  <span className="text-xs text-gray-500">{count} properties</span>
                </div>
                <div className={`text-3xl font-bold ${color.accent} mb-1`}>
                  {formatPercent(avgROI)}
                </div>
                <div className="text-sm text-gray-600">
                  Net: <span className="font-semibold">{formatCurrency(netIncome)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend Line Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Net Income Trends by Home Category
        </h3>
        <TrendLineChart data={trendChartData} height={350} className="w-full" />
      </div>

      {/* Top Performing Properties */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Top 5 Properties by ROI
        </h3>
        <div className="space-y-3">
          {topPropertiesByROI.map((property, index) => (
            <div
              key={property.propertyId}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{property.propertyName}</p>
                  <p className="text-xs text-gray-500">{property.homeCategory}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${property.roi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatPercent(property.roi)}
                </p>
                <p className="text-xs text-gray-500">{formatCurrency(property.netIncome)}</p>
              </div>
            </div>
          ))}
          {topPropertiesByROI.length === 0 && (
            <p className="text-center text-gray-500 py-8">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricsDashboard;
