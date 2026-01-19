import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { EChartsOption } from 'echarts';

interface ExpenseData {
  category: string;
  amount: number;
  percentage: number;
}

interface ExpenseBreakdownChartProps {
  data: ExpenseData[];
  loading: boolean;
  onCategoryClick?: (category: string) => void;
}

const ExpenseBreakdownChart: React.FC<ExpenseBreakdownChartProps> = ({
  data,
  loading,
  onCategoryClick,
}) => {
  const colorPalette = [
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#F97316', // Orange
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#EF4444', // Red
    '#84CC16', // Lime
    '#06B6D4', // Cyan
    '#A855F7', // Violet
  ];

  const totalExpenses = useMemo(() => {
    return data.reduce((sum, item) => sum + item.amount, 0);
  }, [data]);

  const chartOption: EChartsOption = useMemo(() => {
    const chartData = data.map((item, index) => ({
      name: item.category,
      value: item.amount,
      itemStyle: {
        color: colorPalette[index % colorPalette.length],
      },
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const percentage = params.percent.toFixed(1);
          const amount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(params.value);
          return `<div class="font-semibold">${params.name}</div>
                  <div>${amount} (${percentage}%)</div>`;
        },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#374151',
        },
        padding: 12,
        extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);',
      },
      legend: {
        orient: 'vertical',
        right: '10%',
        top: 'center',
        icon: 'circle',
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 16,
        formatter: (name: string) => {
          const item = data.find((d) => d.category === name);
          if (!item) return name;
          const amount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(item.amount);
          return `{name|${name}}\n{value|${amount}}`;
        },
        textStyle: {
          fontSize: 14,
          color: '#374151',
          rich: {
            name: {
              fontSize: 14,
              color: '#374151',
              fontWeight: 500,
              lineHeight: 20,
            },
            value: {
              fontSize: 13,
              color: '#6B7280',
              lineHeight: 18,
            },
          },
        },
      },
      series: [
        {
          name: 'Expenses',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: false,
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.3)',
            },
            scale: true,
            scaleSize: 8,
          },
          labelLine: {
            show: false,
          },
          data: chartData,
          animationType: 'scale',
          animationEasing: 'elasticOut',
          animationDelay: (idx: number) => idx * 50,
        },
      ],
      graphic: [
        {
          type: 'text',
          left: '35%',
          top: '45%',
          style: {
            text: 'Total Expenses',
            textAlign: 'center',
            fill: '#6B7280',
            fontSize: 14,
            fontWeight: 500,
          },
        },
        {
          type: 'text',
          left: '35%',
          top: '52%',
          style: {
            text: new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(totalExpenses),
            textAlign: 'center',
            fill: '#111827',
            fontSize: 20,
            fontWeight: 700,
          },
        },
      ],
    };
  }, [data, totalExpenses]);

  const handleChartClick = (params: any) => {
    if (params.componentType === 'series' && onCategoryClick) {
      onCategoryClick(params.name);
    }
  };

  const onEvents = {
    click: handleChartClick,
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No expense data available
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Expense breakdown will appear here once data is available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactECharts
        option={chartOption}
        style={{ height: '100%', width: '100%' }}
        onEvents={onEvents}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};

export default ExpenseBreakdownChart;
