import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface PropertyData {
  propertyId: number;
  name: string;
  revenue: number;
  payout: number;
  pmFee: number;
}

interface PropertyPerformanceChartProps {
  data: PropertyData[];
  sortBy: 'revenue' | 'payout' | 'pmFee';
  onSortChange: (sort: string) => void;
  onPropertyClick?: (propertyId: number) => void;
  loading: boolean;
}

const PropertyPerformanceChart: React.FC<PropertyPerformanceChartProps> = ({
  data,
  sortBy,
  onSortChange,
  onPropertyClick,
  loading,
}) => {
  const { chartData, hiddenCount } = useMemo(() => {
    if (!data || data.length === 0) {
      return { chartData: [], hiddenCount: 0 };
    }

    // Sort data based on selected metric
    const sorted = [...data].sort((a, b) => b[sortBy] - a[sortBy]);

    // Take top 10
    const top10 = sorted.slice(0, 10);
    const remaining = sorted.length - 10;

    return {
      chartData: top10,
      hiddenCount: remaining > 0 ? remaining : 0,
    };
  }, [data, sortBy]);

  const option: EChartsOption = useMemo(() => {
    if (chartData.length === 0) {
      return {};
    }

    const propertyNames = chartData.map(item => item.name);
    const values = chartData.map(item => item[sortBy]);
    const maxValue = Math.max(...values);

    return {
      grid: {
        left: '5%',
        right: '15%',
        top: '3%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          formatter: '${value}',
          fontSize: 11,
          color: '#6B7280',
        },
        splitLine: {
          lineStyle: {
            color: '#E5E7EB',
          },
        },
      },
      yAxis: {
        type: 'category',
        data: propertyNames,
        axisLabel: {
          fontSize: 12,
          color: '#374151',
          overflow: 'truncate',
          width: 120,
        },
        axisTick: {
          show: false,
        },
        axisLine: {
          show: false,
        },
      },
      series: [
        {
          type: 'bar',
          data: chartData.map((item, index) => ({
            value: item[sortBy],
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  {
                    offset: 0,
                    color: '#3B82F6', // blue-500
                  },
                  {
                    offset: 1,
                    color: '#60A5FA', // blue-400
                  },
                ],
              },
              borderRadius: [0, 4, 4, 0],
            },
            // Store property data for tooltip and click handler
            propertyId: item.propertyId,
            propertyData: item,
          })),
          barMaxWidth: 32,
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => `$${params.value.toLocaleString()}`,
            fontSize: 11,
            color: '#374151',
            fontWeight: 500,
          },
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';

          const data = params[0].data.propertyData;
          return `
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">
              ${data.name}
            </div>
            <div style="font-size: 12px; line-height: 1.8;">
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span style="color: #6B7280;">Revenue:</span>
                <span style="font-weight: 500;">$${data.revenue.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span style="color: #6B7280;">Payout:</span>
                <span style="font-weight: 500;">$${data.payout.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span style="color: #6B7280;">PM Fee:</span>
                <span style="font-weight: 500;">$${data.pmFee.toLocaleString()}</span>
              </div>
            </div>
          `;
        },
        backgroundColor: '#FFFFFF',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        textStyle: {
          color: '#111827',
        },
        extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);',
      },
    };
  }, [chartData, sortBy]);

  const handleChartClick = (params: any) => {
    if (params.componentType === 'series' && onPropertyClick) {
      const propertyId = params.data.propertyId;
      onPropertyClick(propertyId);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No data available</h3>
          <p className="mt-1 text-sm text-gray-500">
            There are no properties to display for the selected period.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with Sort Dropdown */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Property Performance</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-sm text-gray-600">
            Sort by:
          </label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="revenue">Revenue</option>
            <option value="payout">Payout</option>
            <option value="pmFee">PM Fee</option>
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full">
        <ReactECharts
          option={option}
          style={{ height: '400px', width: '100%' }}
          onEvents={{
            click: handleChartClick,
          }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* "And X more" message */}
      {hiddenCount > 0 && (
        <div className="mt-2 text-center">
          <p className="text-sm text-gray-500">
            and {hiddenCount} more {hiddenCount === 1 ? 'property' : 'properties'}
          </p>
        </div>
      )}
    </div>
  );
};

export default PropertyPerformanceChart;
