import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Input } from '../../ui/input';
import { PropertyFinancialData, Transaction } from '../types';
import { DateRange } from '../DateRangeFilter';

interface ByPropertyTabProps {
  properties: PropertyFinancialData[];
  dateRange: DateRange;
  onCellClick: (propertyId: number, month: string) => void;
  onPropertyClick: (propertyId: number) => void;
  isLoading?: boolean;
}

type SortField = 'property' | 'lifetime' | string; // string for month columns
type SortDirection = 'asc' | 'desc';

interface AllocatedCost {
  propertyId: number;
  monthlyAllocations: {
    month: string;
    amount: number;
  }[];
  lifetimeTotal: number;
}

const ByPropertyTab: React.FC<ByPropertyTabProps> = ({
  properties,
  dateRange,
  onCellClick,
  onPropertyClick,
  isLoading = false,
}) => {
  const [homeCategoryFilter, setHomeCategoryFilter] = useState<string>('all');
  const [bankAccountFilter, setBankAccountFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('property');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Extract unique months from properties
  const monthColumns = useMemo(() => {
    if (!properties || properties.length === 0) return [];
    const monthsSet = new Set<string>();
    properties.forEach(property => {
      property.monthlyData?.forEach(data => {
        monthsSet.add(data.month);
      });
    });
    return Array.from(monthsSet).sort();
  }, [properties]);

  // Get unique home categories
  const homeCategories = useMemo(() => {
    const categories = new Set(properties.map(p => p.homeCategory));
    return Array.from(categories);
  }, [properties]);

  // Get unique bank accounts
  const bankAccounts = useMemo(() => {
    const accounts = new Set(
      properties.map(p => p.bankAccount).filter(Boolean) as string[]
    );
    return Array.from(accounts);
  }, [properties]);

  // Calculate allocated costs (mock implementation - would come from API in production)
  const allocatedCosts: AllocatedCost[] = useMemo(() => {
    // Mock: Allocate $500 per property per month for employee/software
    return properties.map(property => ({
      propertyId: property.propertyId,
      monthlyAllocations: monthColumns.map(month => ({
        month,
        amount: 500, // Mock amount
      })),
      lifetimeTotal: monthColumns.length * 500,
    }));
  }, [properties, monthColumns]);

  // Filter and sort properties
  const filteredAndSortedProperties = useMemo(() => {
    let filtered = properties.filter(property => {
      // Home category filter
      if (homeCategoryFilter !== 'all' && property.homeCategory !== homeCategoryFilter) {
        return false;
      }

      // Bank account filter
      if (bankAccountFilter !== 'all' && property.bankAccount !== bankAccountFilter) {
        return false;
      }

      // Search filter
      if (searchQuery && !property.propertyName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortField === 'property') {
        aValue = a.propertyName.toLowerCase();
        bValue = b.propertyName.toLowerCase();
      } else if (sortField === 'lifetime') {
        aValue = a.lifetimeTotal.netIncome;
        bValue = b.lifetimeTotal.netIncome;
      } else {
        // Month column
        const aMonth = a.monthlyData.find(m => m.month === sortField);
        const bMonth = b.monthlyData.find(m => m.month === sortField);
        aValue = aMonth?.netIncome || 0;
        bValue = bMonth?.netIncome || 0;
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return filtered;
  }, [properties, homeCategoryFilter, bankAccountFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to desc for numeric columns
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (month: string) => {
    // Convert YYYY-MM to "MMM YY"
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'PM':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'Arbitrage':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Owned':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getMonthData = (property: PropertyFinancialData, month: string) => {
    return property.monthlyData.find(m => m.month === month);
  };

  const getAllocatedCost = (propertyId: number, month: string) => {
    const cost = allocatedCosts.find(c => c.propertyId === propertyId);
    return cost?.monthlyAllocations.find(m => m.month === month)?.amount || 0;
  };

  const getAllocatedCostLifetime = (propertyId: number) => {
    const cost = allocatedCosts.find(c => c.propertyId === propertyId);
    return cost?.lifetimeTotal || 0;
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4 mb-6">
          <div className="w-48 h-10 bg-gray-200 animate-pulse rounded-md"></div>
          <div className="w-48 h-10 bg-gray-200 animate-pulse rounded-md"></div>
          <div className="flex-1 h-10 bg-gray-200 animate-pulse rounded-md"></div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-gray-200 animate-pulse rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!properties || properties.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Properties Found</h3>
          <p className="text-gray-600">
            No property data available for the selected date range. Try adjusting your filters or date range.
          </p>
        </div>
      </div>
    );
  }

  if (filteredAndSortedProperties.length === 0) {
    return (
      <div className="space-y-4">
        {/* Filter Bar */}
        <div className="flex gap-4 mb-6">
          <Select value={homeCategoryFilter} onValueChange={setHomeCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Home Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {homeCategories.map(category => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={bankAccountFilter} onValueChange={setBankAccountFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Bank Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {bankAccounts.map(account => (
                <SelectItem key={account} value={account}>{account}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Matching Properties</h3>
            <p className="text-gray-600">
              No properties match your current filters. Try adjusting your search criteria.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex gap-4 mb-6">
        <Select value={homeCategoryFilter} onValueChange={setHomeCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Home Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {homeCategories.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bankAccountFilter} onValueChange={setBankAccountFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Bank Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {bankAccounts.map(account => (
              <SelectItem key={account} value={account}>{account}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search properties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table Container with Horizontal Scroll */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {/* Property Column - Sticky */}
                <th
                  className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[250px]"
                  onClick={() => handleSort('property')}
                >
                  <div className="flex items-center gap-2">
                    <span>Property</span>
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>

                {/* Month Columns */}
                {monthColumns.map(month => (
                  <th
                    key={month}
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[140px]"
                    onClick={() => handleSort(month)}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span>{formatMonth(month)}</span>
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                ))}

                {/* Lifetime Column */}
                <th
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[140px] bg-blue-50"
                  onClick={() => handleSort('lifetime')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Lifetime</span>
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Property Rows */}
              {filteredAndSortedProperties.map((property, index) => (
                <tr
                  key={property.propertyId}
                  className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                >
                  {/* Property Name Cell - Sticky */}
                  <td className={`sticky left-0 z-10 px-4 py-4 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} border-r border-gray-200`}>
                    <button
                      onClick={() => onPropertyClick(property.propertyId)}
                      className="text-left w-full group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                          {property.propertyName}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getCategoryBadgeColor(property.homeCategory)}`}>
                          {property.homeCategory}
                        </span>
                      </div>
                    </button>
                  </td>

                  {/* Month Cells */}
                  {monthColumns.map(month => {
                    const monthData = getMonthData(property, month);
                    const grossIncome = monthData?.grossRevenue || 0;
                    const expenses = monthData?.totalExpenses || 0;
                    const netIncome = monthData?.netIncome || 0;

                    return (
                      <td
                        key={month}
                        className="px-4 py-4 text-center cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => onCellClick(property.propertyId, month)}
                      >
                        <div className="space-y-1">
                          <div className="text-sm text-green-600">
                            {formatCurrency(grossIncome)}
                          </div>
                          <div className="text-xs text-red-600">
                            {formatCurrency(expenses)}
                          </div>
                          <div className={`text-sm font-bold ${netIncome >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatCurrency(netIncome)}
                          </div>
                        </div>
                      </td>
                    );
                  })}

                  {/* Lifetime Cell */}
                  <td className="px-4 py-4 text-center bg-blue-50/30 border-l border-gray-200">
                    <div className="space-y-1">
                      <div className="text-sm text-green-600">
                        {formatCurrency(property.lifetimeTotal.grossRevenue)}
                      </div>
                      <div className="text-xs text-red-600">
                        {formatCurrency(property.lifetimeTotal.totalExpenses)}
                      </div>
                      <div className={`text-sm font-bold ${property.lifetimeTotal.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(property.lifetimeTotal.netIncome)}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Allocated Costs Row */}
              <tr className="bg-amber-50 border-t-2 border-amber-200 font-medium">
                <td className="sticky left-0 z-10 bg-amber-50 px-4 py-4 border-r border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-amber-900">Allocated Costs</span>
                    <span className="text-xs text-amber-700">(Employee/Software)</span>
                  </div>
                </td>

                {/* Month Cells for Allocated Costs */}
                {monthColumns.map(month => {
                  const totalAllocated = filteredAndSortedProperties.reduce((sum, property) => {
                    return sum + getAllocatedCost(property.propertyId, month);
                  }, 0);

                  return (
                    <td key={month} className="px-4 py-4 text-center">
                      <div className="space-y-1">
                        <div className="text-sm text-amber-700">
                          {formatCurrency(0)}
                        </div>
                        <div className="text-xs text-red-600">
                          {formatCurrency(totalAllocated)}
                        </div>
                        <div className="text-sm font-bold text-red-600">
                          {formatCurrency(-totalAllocated)}
                        </div>
                      </div>
                    </td>
                  );
                })}

                {/* Lifetime for Allocated Costs */}
                <td className="px-4 py-4 text-center bg-amber-100/50 border-l border-amber-200">
                  <div className="space-y-1">
                    <div className="text-sm text-amber-700">
                      {formatCurrency(0)}
                    </div>
                    <div className="text-xs text-red-600">
                      {formatCurrency(filteredAndSortedProperties.reduce((sum, property) =>
                        sum + getAllocatedCostLifetime(property.propertyId), 0
                      ))}
                    </div>
                    <div className="text-sm font-bold text-red-600">
                      {formatCurrency(-filteredAndSortedProperties.reduce((sum, property) =>
                        sum + getAllocatedCostLifetime(property.propertyId), 0
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600 text-center">
        Showing {filteredAndSortedProperties.length} of {properties.length} properties
      </div>
    </div>
  );
};

export default ByPropertyTab;
