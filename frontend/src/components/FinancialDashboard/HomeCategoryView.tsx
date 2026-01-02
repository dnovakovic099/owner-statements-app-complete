import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Home,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Building2,
  HomeIcon,
  Handshake,
  ClipboardList,
  BarChart3
} from 'lucide-react';

export interface HomeCategoryData {
  category: string;
  income: number;
  expenses: number;
  netIncome?: number;
  propertyCount?: number;
  properties?: Array<{
    id: number;
    name: string;
    income: number;
    expenses: number;
  }>;
}

interface HomeCategoryViewProps {
  data: HomeCategoryData[];
}

const HomeCategoryView: React.FC<HomeCategoryViewProps> = ({ data }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Guard against undefined data
  if (!data || !Array.isArray(data)) {
    return (
      <div className="text-center text-gray-500 py-8">
        <p>No category data available</p>
      </div>
    );
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getCategoryIcon = (category: string): React.ReactNode => {
    const iconClass = "w-6 h-6";
    // Match the display names from the API
    switch (category) {
      case 'Arbitrage':
        return <Briefcase className={`${iconClass} text-purple-600`} />;
      case 'Property Management':
        return <Building2 className={`${iconClass} text-green-600`} />;
      case 'Owned Properties':
        return <HomeIcon className={`${iconClass} text-blue-600`} />;
      case 'Shared/Partnership':
        return <Handshake className={`${iconClass} text-orange-600`} />;
      case 'Uncategorized':
        return <ClipboardList className={`${iconClass} text-gray-600`} />;
      default:
        return <BarChart3 className={`${iconClass} text-gray-600`} />;
    }
  };

  const getCategoryColor = (category: string) => {
    // Match the display names from the API
    switch (category) {
      case 'Arbitrage':
        return 'from-purple-50 to-purple-100 border-purple-200';
      case 'Property Management':
        return 'from-green-50 to-green-100 border-green-200';
      case 'Owned Properties':
        return 'from-blue-50 to-blue-100 border-blue-200';
      case 'Shared/Partnership':
        return 'from-orange-50 to-orange-100 border-orange-200';
      case 'Uncategorized':
        return 'from-gray-50 to-gray-100 border-gray-200';
      default:
        return 'from-gray-50 to-gray-100 border-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Home Category</h3>
      {data.map((category) => {
        const net = category.income - category.expenses;
        const isExpanded = expandedCategories.has(category.category);
        const margin = category.income > 0 ? (net / category.income) * 100 : 0;

        return (
          <div
            key={category.category}
            className={`bg-gradient-to-br ${getCategoryColor(
              category.category
            )} rounded-lg shadow-md border overflow-hidden`}
          >
            {/* Category Header */}
            <div
              className="p-4 cursor-pointer hover:bg-white/30 transition-colors"
              onClick={() => toggleCategory(category.category)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/50">
                    {getCategoryIcon(category.category)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{category.category}</h4>
                    <p className="text-xs text-gray-600">{category.properties?.length || category.propertyCount || 0} properties</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Income */}
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm font-medium">Income</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(category.income)}
                    </p>
                  </div>

                  {/* Expenses */}
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-red-600">
                      <TrendingDown className="w-4 h-4" />
                      <span className="text-sm font-medium">Expenses</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(category.expenses)}
                    </p>
                  </div>

                  {/* Net */}
                  <div className="text-right min-w-[140px]">
                    <div className="text-sm font-medium text-gray-600">Net</div>
                    <p
                      className={`text-lg font-bold ${
                        net >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(net)}
                    </p>
                    <p className="text-xs text-gray-500">{margin.toFixed(1)}% margin</p>
                  </div>

                  {/* Expand Icon */}
                  <div className="ml-2">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Property Details */}
            {isExpanded && category.properties && category.properties.length > 0 && (
              <div className="border-t border-gray-200 bg-white/40">
                <div className="p-4 space-y-2">
                  {category.properties.map((property: any) => {
                    const propertyNet = property.income - property.expenses;
                    return (
                      <div
                        key={property.id}
                        className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {property.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right min-w-[100px]">
                            <p className="text-sm text-green-600">
                              {formatCurrency(property.income)}
                            </p>
                          </div>
                          <div className="text-right min-w-[100px]">
                            <p className="text-sm text-red-600">
                              {formatCurrency(property.expenses)}
                            </p>
                          </div>
                          <div className="text-right min-w-[100px]">
                            <p
                              className={`text-sm font-semibold ${
                                propertyNet >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(propertyNet)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default HomeCategoryView;
