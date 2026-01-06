import React from 'react';
import { Building2, Home, Key, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface CategoryData {
  income: number;
  expenses: number;
  net: number;
  propertyCount: number;
  changePercent?: number;
  perProperty?: number; // Used for Shared category
}

export interface HomeCategoriesRowProps {
  categories: {
    pm: CategoryData;
    arbitrage: CategoryData;
    owned: CategoryData;
    shared: CategoryData;
  };
  onCategoryClick: (categoryType: 'pm' | 'arbitrage' | 'owned' | 'shared') => void;
}

interface CategoryCardConfig {
  key: 'pm' | 'arbitrage' | 'owned' | 'shared';
  title: string;
  icon: typeof Building2;
  bgTint: string;
  iconBg: string;
  iconColor: string;
}

const categoryConfigs: CategoryCardConfig[] = [
  {
    key: 'pm',
    title: 'Property Management',
    icon: Building2,
    bgTint: 'bg-blue-50/50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    key: 'arbitrage',
    title: 'Arbitrage',
    icon: Home,
    bgTint: 'bg-green-50/50',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
  {
    key: 'owned',
    title: 'Owned',
    icon: Key,
    bgTint: 'bg-purple-50/50',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    key: 'shared',
    title: 'Shared',
    icon: Users,
    bgTint: 'bg-gray-50/50',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-600',
  },
];

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercentage = (value: number): string => {
  return `${Math.abs(value).toFixed(1)}%`;
};

interface CategoryCardProps {
  config: CategoryCardConfig;
  data: CategoryData;
  onClick: () => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ config, data, onClick }) => {
  const { title, icon: Icon, bgTint, iconBg, iconColor, key } = config;
  const { income, expenses, net, propertyCount, changePercent, perProperty } = data;

  const isShared = key === 'shared';
  const hasPositiveChange = changePercent !== undefined && changePercent > 0;
  const ChangeIcon = hasPositiveChange ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl shadow-sm border border-gray-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'transition-all duration-200 cursor-pointer',
        'overflow-hidden'
      )}
    >
      {/* Header with Icon and Title */}
      <div className={cn('px-6 py-4 border-b border-gray-100', bgTint)}>
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', iconBg)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
          <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-6 py-5 space-y-4">
        {isShared ? (
          <>
            {/* Shared category shows per-property metric instead of income/net */}
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Per Property
              </div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">
                {formatCurrency(perProperty || 0)}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Income */}
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Income
              </div>
              <div className="text-2xl font-bold text-green-600 tabular-nums">
                {formatCurrency(income)}
              </div>
            </div>
          </>
        )}

        {/* Expenses (shown for all categories) */}
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Expenses
          </div>
          <div className="text-2xl font-bold text-red-600 tabular-nums">
            {formatCurrency(expenses)}
          </div>
        </div>

        {!isShared && (
          <>
            {/* Net (not shown for Shared) */}
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Net
              </div>
              <div className={cn(
                'text-2xl font-bold tabular-nums',
                net >= 0 ? 'text-gray-900' : 'text-red-600'
              )}>
                {formatCurrency(net)}
              </div>
            </div>
          </>
        )}

        {/* Property Count and Change */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{propertyCount}</span> properties
          </div>

          {changePercent !== undefined && (
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              hasPositiveChange ? 'text-green-600' : 'text-red-600'
            )}>
              <ChangeIcon className="w-4 h-4" />
              <span>{formatPercentage(changePercent)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const HomeCategoriesRow: React.FC<HomeCategoriesRowProps> = ({
  categories,
  onCategoryClick,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {categoryConfigs.map((config) => {
        const data = categories[config.key];
        console.log(`[HomeCategoriesRow] Rendering ${config.key}:`, data);
        return (
          <CategoryCard
            key={config.key}
            config={config}
            data={data}
            onClick={() => onCategoryClick(config.key)}
          />
        );
      })}
    </div>
  );
};
