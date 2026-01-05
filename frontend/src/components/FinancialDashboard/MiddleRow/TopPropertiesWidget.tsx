import React from 'react';
import { Building2, TrendingUp, TrendingDown } from 'lucide-react';

interface PropertyPerformance {
  id: number;
  name: string;
  income: number;
  change?: number;
}

interface TopPropertiesWidgetProps {
  properties: PropertyPerformance[];
  onPropertyClick?: (propertyId: number) => void;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const TopPropertiesWidget: React.FC<TopPropertiesWidgetProps> = ({
  properties,
  onPropertyClick,
}) => {
  const topProperties = properties.slice(0, 5);

  // Compact empty state
  if (topProperties.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 text-center">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">No property data for this period</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-5 h-5 text-blue-600" />
        <h3 className="text-base font-semibold text-gray-900">Top Properties</h3>
      </div>

      {topProperties.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-2">No property data</p>
      ) : (
        <div className="space-y-1.5 flex-1">
          {topProperties.map((property, index) => (
            <div
              key={property.id}
              onClick={() => onPropertyClick?.(property.id)}
              className={`flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors ${
                onPropertyClick ? 'cursor-pointer' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="text-sm text-gray-900 truncate">{property.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(property.income)}
                </span>
                {property.change !== undefined && (
                  <span className={`flex items-center text-xs ${
                    property.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {property.change >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopPropertiesWidget;
