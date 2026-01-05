import React from 'react';
import { Home, DollarSign, Percent, Calendar } from 'lucide-react';

interface QuickStatsWidgetProps {
  propertyCount: number;
  avgIncomePerProperty: number;
  avgOccupancyRate?: number;
  periodLabel: string;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const QuickStatsWidget: React.FC<QuickStatsWidgetProps> = ({
  propertyCount,
  avgIncomePerProperty,
  avgOccupancyRate,
  periodLabel,
}) => {
  const stats = [
    {
      icon: Home,
      label: 'Active Properties',
      value: propertyCount.toString(),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      icon: DollarSign,
      label: 'Avg Income/Property',
      value: formatCurrency(avgIncomePerProperty),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      icon: Calendar,
      label: 'Period',
      value: periodLabel,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  if (avgOccupancyRate !== undefined) {
    stats.splice(2, 0, {
      icon: Percent,
      label: 'Avg Occupancy',
      value: `${avgOccupancyRate.toFixed(0)}%`,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Quick Stats</h3>

      <div className="space-y-3">
        {stats.slice(0, 3).map((stat, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuickStatsWidget;
