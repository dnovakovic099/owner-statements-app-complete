import React, { useState, useMemo } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

// Types
export interface PropertyFinancialData {
  propertyId: number;
  propertyName: string;
  homeCategory: 'PM' | 'Arbitrage' | 'Owned';
  monthlyData: MonthlyFinancialData[];
  lifetimeTotal: {
    netIncome: number;
    grossRevenue: number;
    totalExpenses: number;
  };
}

export interface MonthlyFinancialData {
  month: string; // YYYY-MM format
  netIncome: number;
  grossRevenue: number;
  totalExpenses: number;
  sharedExpenses: number;
}

interface PropertyFinancialsProps {
  data: PropertyFinancialData[];
  onMonthCellClick?: (propertyId: number, month: string) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatMonthLabel = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const PropertyFinancials: React.FC<PropertyFinancialsProps> = ({
  data,
  onMonthCellClick,
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [homeCategoryFilter, setHomeCategoryFilter] = useState<string>('all');
  const [bankAccountFilter, setBankAccountFilter] = useState<string>('all');

  // Get unique months from all properties (last 6 months)
  const availableMonths = useMemo(() => {
    const allMonths = new Set<string>();
    data.forEach(property => {
      property.monthlyData.forEach(month => {
        allMonths.add(month.month);
      });
    });
    return Array.from(allMonths)
      .sort()
      .reverse()
      .slice(0, 6)
      .reverse();
  }, [data]);

  // Filter data based on category filter
  const filteredData = useMemo(() => {
    let filtered = data;

    if (homeCategoryFilter !== 'all') {
      filtered = filtered.filter(p => p.homeCategory === homeCategoryFilter);
    }

    // Bank account filter would be implemented when we have bank account data
    // For now, we'll just return the category-filtered data

    return filtered;
  }, [data, homeCategoryFilter, bankAccountFilter]);

  // Define columns dynamically based on available months
  const columns = useMemo<ColumnDef<PropertyFinancialData>[]>(() => {
    const baseColumns: ColumnDef<PropertyFinancialData>[] = [
      {
        accessorKey: 'propertyName',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900"
          >
            Property Name
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 truncate block">
            {row.getValue('propertyName')}
          </span>
        ),
        size: 250,
      },
      {
        accessorKey: 'homeCategory',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900"
          >
            Category
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        ),
        cell: ({ row }) => {
          const category = row.getValue('homeCategory') as string;
          const colors = {
            PM: 'bg-blue-50 text-blue-700 border-blue-200',
            Arbitrage: 'bg-orange-50 text-orange-700 border-orange-200',
            Owned: 'bg-green-50 text-green-700 border-green-200',
          };
          return (
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${colors[category as keyof typeof colors]}`}>
              {category}
            </span>
          );
        },
        size: 120,
      },
    ];

    // Add month columns
    const monthColumns: ColumnDef<PropertyFinancialData>[] = availableMonths.map(month => ({
      id: `month-${month}`,
      header: () => (
        <div className="text-center font-semibold text-gray-600">
          {formatMonthLabel(month)}
        </div>
      ),
      cell: ({ row }) => {
        const property = row.original;
        const monthData = property.monthlyData.find(m => m.month === month);

        if (!monthData) {
          return (
            <div className="text-center text-gray-400 text-sm py-2">
              -
            </div>
          );
        }

        return (
          <button
            onClick={() => onMonthCellClick?.(property.propertyId, month)}
            className="w-full text-center hover:bg-blue-50 transition-colors py-2 px-1 group cursor-pointer rounded"
          >
            <div className={`font-semibold ${monthData.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(monthData.netIncome)}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 group-hover:text-gray-700">
              {formatCurrency(monthData.grossRevenue)} / {formatCurrency(monthData.totalExpenses)}
            </div>
          </button>
        );
      },
      size: 140,
      enableSorting: false,
    }));

    // Add lifetime total column
    const lifetimeColumn: ColumnDef<PropertyFinancialData> = {
      id: 'lifetime',
      header: ({ column }) => (
        <div className="text-center font-semibold text-gray-600">
          Lifetime Total
        </div>
      ),
      cell: ({ row }) => {
        const lifetime = row.original.lifetimeTotal;
        return (
          <div className="text-center py-2 px-1 bg-gray-50">
            <div className={`font-bold text-base ${lifetime.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(lifetime.netIncome)}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {formatCurrency(lifetime.grossRevenue)} / {formatCurrency(lifetime.totalExpenses)}
            </div>
          </div>
        );
      },
      size: 160,
      enableSorting: false,
    };

    return [...baseColumns, ...monthColumns, lifetimeColumn];
  }, [availableMonths, onMonthCellClick]);

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full">
      {/* Header with Filters */}
      <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Property Financials</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Per-property financial performance overview
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Home Category Filter */}
            <Select value={homeCategoryFilter} onValueChange={setHomeCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 bg-white border-gray-200">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
                <SelectItem value="Arbitrage">Arbitrage</SelectItem>
                <SelectItem value="Owned">Owned</SelectItem>
              </SelectContent>
            </Select>

            {/* Bank Account Filter - Placeholder for future implementation */}
            <Select value={bankAccountFilter} onValueChange={setBankAccountFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 bg-white border-gray-200">
                <SelectValue placeholder="All Bank Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bank Accounts</SelectItem>
                {/* Future: Add bank account options */}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters Display */}
        {(homeCategoryFilter !== 'all' || bankAccountFilter !== 'all') && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500">Filters:</span>
            {homeCategoryFilter !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">
                Category: {homeCategoryFilter}
                <button
                  onClick={() => setHomeCategoryFilter('all')}
                  className="hover:text-blue-900 ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {bankAccountFilter !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">
                Bank: {bankAccountFilter}
                <button
                  onClick={() => setBankAccountFilter('all')}
                  className="hover:text-blue-900 ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setHomeCategoryFilter('all');
                setBankAccountFilter('all');
              }}
              className="text-xs font-medium text-red-600 hover:text-red-800"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-white border-b-2 border-gray-300">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-3 text-center border-r border-gray-200 last:border-r-0"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="py-2 px-3 text-center align-middle border-r border-gray-100 last:border-r-0"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="text-gray-500">No properties found.</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <div className="text-sm text-gray-500">
          Showing <span className="font-medium text-gray-700">{filteredData.length}</span> properties
        </div>
      </div>
    </div>
  );
};

export default PropertyFinancials;
