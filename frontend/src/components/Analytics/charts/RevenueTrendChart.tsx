import React, { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface RevenueTrendData {
  period: string;
  revenue: number;
  expenses: number;
  payout: number;
}

interface RevenueTrendChartProps {
  data: RevenueTrendData[];
  granularity: 'week' | 'month' | 'quarter';
  onGranularityChange: (granularity: 'week' | 'month' | 'quarter') => void;
  loading?: boolean;
}

const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({
  data,
  granularity,
  onGranularityChange,
  loading = false,
}) => {
  const [visibleLines, setVisibleLines] = useState({
    revenue: true,
    expenses: true,
    payout: true,
  });

  const toggleLine = (line: keyof typeof visibleLines) => {
    setVisibleLines((prev) => ({
      ...prev,
      [line]: !prev[line],
    }));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const chartOption: EChartsOption = useMemo(() => {
    const periods = data.map((d) => d.period);
    const revenueData = data.map((d) => d.revenue);
    const expensesData = data.map((d) => d.expenses);
    const payoutData = data.map((d) => d.payout);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#374151',
          fontSize: 12,
        },
        padding: [12, 16],
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';

          const period = params[0].axisValue;
          let tooltipContent = `<div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">${period}</div>`;

          params.forEach((param: any) => {
            if (param.value !== undefined && param.value !== null) {
              tooltipContent += `
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${param.color}; margin-right: 8px;"></span>
                  <span style="flex: 1; color: #6b7280;">${param.seriesName}:</span>
                  <span style="font-weight: 600; margin-left: 16px;">${formatCurrency(param.value)}</span>
                </div>
              `;
            }
          });

          return tooltipContent;
        },
      },
      legend: {
        show: false,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: periods,
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: periods.length > 12 ? 45 : 0,
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: {
          show: false,
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => {
            if (value >= 1000000) {
              return `$${(value / 1000000).toFixed(1)}M`;
            } else if (value >= 1000) {
              return `$${(value / 1000).toFixed(0)}k`;
            }
            return `$${value}`;
          },
        },
        splitLine: {
          lineStyle: {
            color: '#f3f4f6',
            type: 'dashed',
          },
        },
      },
      series: [
        {
          name: 'Revenue',
          type: 'line',
          data: visibleLines.revenue ? revenueData : [],
          smooth: true,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 3,
            color: '#3b82f6',
          },
          itemStyle: {
            color: '#3b82f6',
            borderWidth: 2,
            borderColor: '#fff',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.01)' },
              ],
            },
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              borderWidth: 3,
              shadowBlur: 10,
              shadowColor: 'rgba(59, 130, 246, 0.5)',
            },
          },
        },
        {
          name: 'Expenses',
          type: 'line',
          data: visibleLines.expenses ? expensesData : [],
          smooth: true,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 3,
            color: '#ef4444',
          },
          itemStyle: {
            color: '#ef4444',
            borderWidth: 2,
            borderColor: '#fff',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(239, 68, 68, 0.2)' },
                { offset: 1, color: 'rgba(239, 68, 68, 0.01)' },
              ],
            },
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              borderWidth: 3,
              shadowBlur: 10,
              shadowColor: 'rgba(239, 68, 68, 0.5)',
            },
          },
        },
        {
          name: 'Payout',
          type: 'line',
          data: visibleLines.payout ? payoutData : [],
          smooth: true,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 3,
            color: '#10b981',
          },
          itemStyle: {
            color: '#10b981',
            borderWidth: 2,
            borderColor: '#fff',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
                { offset: 1, color: 'rgba(16, 185, 129, 0.01)' },
              ],
            },
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              borderWidth: 3,
              shadowBlur: 10,
              shadowColor: 'rgba(16, 185, 129, 0.5)',
            },
          },
        },
      ],
      animation: true,
      animationDuration: 800,
      animationEasing: 'cubicOut',
    };
  }, [data, visibleLines]);

  // Empty state
  if (!loading && (!data || data.length === 0)) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Revenue Trend</h2>
          <div className="flex gap-2">
            {(['week', 'month', 'quarter'] as const).map((option) => (
              <button
                key={option}
                onClick={() => onGranularityChange(option)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  granularity === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <svg
            className="w-16 h-16 mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="text-base font-medium">No revenue data available</p>
          <p className="text-sm mt-1">Data will appear here once statements are generated</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Revenue Trend</h2>
          <div className="flex gap-2">
            {(['week', 'month', 'quarter'] as const).map((option) => (
              <button
                key={option}
                disabled
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  granularity === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                } opacity-50 cursor-not-allowed`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header with title and granularity toggle */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Revenue Trend</h2>
        <div className="flex gap-2">
          {(['week', 'month', 'quarter'] as const).map((option) => (
            <button
              key={option}
              onClick={() => onGranularityChange(option)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                granularity === option
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend with toggleable lines */}
      <div className="flex items-center gap-6 mb-4 flex-wrap">
        <button
          onClick={() => toggleLine('revenue')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
            visibleLines.revenue
              ? 'bg-blue-50 hover:bg-blue-100'
              : 'bg-gray-50 hover:bg-gray-100 opacity-50'
          }`}
        >
          <span
            className={`w-3 h-3 rounded-full transition-all ${
              visibleLines.revenue ? 'bg-blue-600' : 'bg-gray-400'
            }`}
          ></span>
          <span className="text-sm font-medium text-gray-700">Revenue</span>
        </button>

        <button
          onClick={() => toggleLine('expenses')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
            visibleLines.expenses
              ? 'bg-red-50 hover:bg-red-100'
              : 'bg-gray-50 hover:bg-gray-100 opacity-50'
          }`}
        >
          <span
            className={`w-3 h-3 rounded-full transition-all ${
              visibleLines.expenses ? 'bg-red-600' : 'bg-gray-400'
            }`}
          ></span>
          <span className="text-sm font-medium text-gray-700">Expenses</span>
        </button>

        <button
          onClick={() => toggleLine('payout')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
            visibleLines.payout
              ? 'bg-green-50 hover:bg-green-100'
              : 'bg-gray-50 hover:bg-gray-100 opacity-50'
          }`}
        >
          <span
            className={`w-3 h-3 rounded-full transition-all ${
              visibleLines.payout ? 'bg-green-600' : 'bg-gray-400'
            }`}
          ></span>
          <span className="text-sm font-medium text-gray-700">Payout</span>
        </button>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: '400px' }}>
        <ReactECharts
          option={chartOption}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
};

export default RevenueTrendChart;
