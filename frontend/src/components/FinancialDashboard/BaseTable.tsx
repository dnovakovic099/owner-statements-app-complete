import React, { useState, useMemo, useCallback } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  Download,
  Search,
  SlidersHorizontal,
  ChevronDown,
  GripVertical,
  ChevronUp,
} from 'lucide-react';
import { PropertyFinancialData, MonthlyFinancialData } from './types';
import TransactionModal from './TransactionModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

// Category badge colors
const categoryColors = {
  PM: 'bg-blue-100 text-blue-700 border-blue-300',
  Arbitrage: 'bg-purple-100 text-purple-700 border-purple-300',
  Owned: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

interface BaseTableProps {
  data: PropertyFinancialData[];
  monthsToShow?: number; // Default 6
  onTransactionClick?: (propertyId: number, month: string) => void;
}

// Helper to format currency
const formatCurrency = (amount: number, compact = false): string => {
  if (compact && Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Helper to get color class based on value
const getValueColorClass = (value: number): string => {
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
};

// Month cell component showing Net Income, Gross Revenue, and Total Expenses
interface MonthCellProps {
  data: MonthlyFinancialData | undefined;
  onClick?: () => void;
}

const MonthCell: React.FC<MonthCellProps> = React.memo(({ data, onClick }) => {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-3 px-2 text-gray-400">
        <span className="text-sm">-</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center py-2 px-2 hover:bg-blue-50 rounded-md transition-all duration-150 w-full group cursor-pointer"
    >
      {/* Net Income - Large */}
      <div className={`text-base font-bold tabular-nums ${getValueColorClass(data.netIncome)}`}>
        {formatCurrency(data.netIncome, true)}
      </div>

      {/* Gross Revenue - Small */}
      <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
        Rev: {formatCurrency(data.grossRevenue, true)}
      </div>

      {/* Total Expenses - Small */}
      <div className="text-xs text-gray-500 tabular-nums">
        Exp: {formatCurrency(data.totalExpenses, true)}
      </div>

      {/* Hover indicator */}
      <div className="absolute inset-0 border-2 border-blue-400 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </button>
  );
});
MonthCell.displayName = 'MonthCell';

// Property name cell with category badge
interface PropertyCellProps {
  propertyName: string;
  category: 'PM' | 'Arbitrage' | 'Owned';
}

const PropertyCell: React.FC<PropertyCellProps> = React.memo(({ propertyName, category }) => {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="font-medium text-gray-900 truncate flex-1">{propertyName}</span>
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${categoryColors[category]}`}>
        {category}
      </span>
    </div>
  );
});
PropertyCell.displayName = 'PropertyCell';

const BaseTable: React.FC<BaseTableProps> = ({ data, monthsToShow = 6, onTransactionClick }) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Transaction modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    propertyId?: number;
    month?: string;
  }>({
    isOpen: false,
  });

  // Get the last N months from the data
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    data.forEach((property) => {
      property.monthlyData.forEach((month) => {
        monthsSet.add(month.month);
      });
    });
    return Array.from(monthsSet).sort().slice(-monthsToShow);
  }, [data, monthsToShow]);

  // Format month for display (e.g., "Jan 2024")
  const formatMonthHeader = (month: string): string => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Handle cell click
  const handleCellClick = useCallback(
    (propertyId: number, month: string) => {
      setModalState({ isOpen: true, propertyId, month });
      onTransactionClick?.(propertyId, month);
    },
    [onTransactionClick]
  );

  // Create column definitions
  const columns = useMemo<ColumnDef<PropertyFinancialData>[]>(() => {
    const cols: ColumnDef<PropertyFinancialData>[] = [
      // Property Name Column
      {
        id: 'propertyName',
        accessorKey: 'propertyName',
        size: 250,
        minSize: 200,
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-2 font-semibold text-gray-700 hover:text-gray-900"
          >
            Property
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: ({ row }) => (
          <PropertyCell
            propertyName={row.original.propertyName}
            category={row.original.homeCategory}
          />
        ),
        enableHiding: false,
      },
      // Category Column (hidden by default, available in column selector)
      {
        id: 'category',
        accessorKey: 'homeCategory',
        size: 100,
        header: () => <span className="font-semibold text-gray-700">Category</span>,
        cell: ({ row }) => {
          const category = row.original.homeCategory;
          return (
            <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${categoryColors[category]}`}>
              {category}
            </span>
          );
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
      },
    ];

    // Add month columns
    availableMonths.forEach((month) => {
      cols.push({
        id: `month-${month}`,
        accessorFn: (row) => {
          const monthData = row.monthlyData.find((m) => m.month === month);
          return monthData?.netIncome ?? 0;
        },
        size: 140,
        minSize: 120,
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex flex-col items-center justify-center w-full hover:text-gray-900 group"
          >
            <span className="font-semibold text-gray-700 group-hover:text-gray-900">
              {formatMonthHeader(month)}
            </span>
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
          </button>
        ),
        cell: ({ row }) => {
          const monthData = row.original.monthlyData.find((m) => m.month === month);
          return (
            <MonthCell
              data={monthData}
              onClick={() => handleCellClick(row.original.propertyId, month)}
            />
          );
        },
        sortingFn: 'basic',
      });
    });

    // Lifetime Total Column
    cols.push({
      id: 'lifetimeTotal',
      accessorFn: (row) => row.lifetimeTotal.netIncome,
      size: 140,
      minSize: 120,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex flex-col items-center justify-center w-full hover:text-gray-900 group"
        >
          <span className="font-semibold text-gray-700 group-hover:text-gray-900">
            Lifetime Net
          </span>
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
        </button>
      ),
      cell: ({ row }) => {
        const lifetime = row.original.lifetimeTotal;
        return (
          <div className="flex flex-col items-center justify-center py-2 px-2">
            <div className={`text-base font-bold tabular-nums ${getValueColorClass(lifetime.netIncome)}`}>
              {formatCurrency(lifetime.netIncome)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
              Rev: {formatCurrency(lifetime.grossRevenue, true)}
            </div>
            <div className="text-xs text-gray-500 tabular-nums">
              Exp: {formatCurrency(lifetime.totalExpenses, true)}
            </div>
          </div>
        );
      },
      enableHiding: false,
    });

    return cols;
  }, [availableMonths, handleCellClick]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    globalFilterFn: 'includesString',
  });

  // Export to CSV
  const exportToCSV = useCallback(() => {
    const headers = [
      'Property',
      'Category',
      ...availableMonths.map((m) => formatMonthHeader(m)),
      'Lifetime Total',
    ];

    const rows = table.getFilteredRowModel().rows.map((row) => {
      const property = row.original;
      return [
        property.propertyName,
        property.homeCategory,
        ...availableMonths.map((month) => {
          const monthData = property.monthlyData.find((m) => m.month === month);
          return monthData ? monthData.netIncome.toString() : '0';
        }),
        property.lifetimeTotal.netIncome.toString(),
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial-data-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [table, availableMonths]);

  // Category filter options
  const categories = ['PM', 'Arbitrage', 'Owned'];

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 w-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Property Financial Performance</h2>
            <p className="text-sm text-gray-600 mt-1">
              {table.getFilteredRowModel().rows.length} properties
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Global Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search properties..."
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10 w-full sm:w-64 h-10 bg-white border-gray-300 focus:border-blue-400 focus:ring-blue-300"
              />
            </div>

            {/* Category Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 border-gray-300 bg-white">
                  Category
                  <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel className="text-xs text-gray-500">
                  Filter by Category
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {categories.map((category) => {
                  const filterValue = (table.getColumn('category')?.getFilterValue() as string[]) || [];
                  const isChecked = filterValue.includes(category);
                  return (
                    <DropdownMenuCheckboxItem
                      key={category}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const newValue = checked
                          ? [...filterValue, category]
                          : filterValue.filter((v) => v !== category);
                        table
                          .getColumn('category')
                          ?.setFilterValue(newValue.length ? newValue : undefined);
                      }}
                    >
                      {category}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Column Visibility */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 border-gray-300 bg-white">
                  <SlidersHorizontal className="mr-2 h-4 w-4 text-gray-400" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs text-gray-500">
                  Toggle Columns
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id === 'category' ? 'Category' : column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export CSV Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="h-10 border-gray-300 bg-white hover:bg-gray-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Active Filters Display */}
        {(globalFilter || columnFilters.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500">Active Filters:</span>
            {globalFilter && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-200">
                Search: "{globalFilter}"
                <button onClick={() => setGlobalFilter('')} className="hover:text-blue-900 ml-0.5">
                  ×
                </button>
              </span>
            )}
            {columnFilters.map((filter) => (
              <span
                key={filter.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded-md border border-purple-200"
              >
                {filter.id}: {Array.isArray(filter.value) ? (filter.value as string[]).join(', ') : String(filter.value)}
                <button
                  onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                  className="hover:text-purple-900 ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setGlobalFilter('');
                setColumnFilters([]);
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
        <Table className="w-full" style={{ tableLayout: 'fixed' }}>
          <TableHeader className="sticky top-0 bg-white z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gray-100 border-b-2 border-gray-300">
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  const isDraggable = columnId !== 'propertyName' && columnId !== 'lifetimeTotal';
                  const isDragging = draggedColumn === columnId;

                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      onDragOver={(e) => {
                        if (!draggedColumn || draggedColumn === columnId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={(e) => {
                        if (!draggedColumn || draggedColumn === columnId) return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (!draggedColumn || draggedColumn === columnId) return;
                        e.preventDefault();
                        // Handle column reordering logic here if needed
                        setDraggedColumn(null);
                      }}
                      className={`text-xs font-semibold text-gray-700 uppercase tracking-wider py-3 px-3 relative text-center align-middle group border-r border-gray-200 last:border-r-0 ${
                        isDragging ? 'opacity-50 bg-blue-100' : ''
                      } ${draggedColumn && draggedColumn !== columnId ? 'hover:bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center gap-1 justify-center">
                        {isDraggable && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              setDraggedColumn(columnId);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', columnId);
                            }}
                            onDragEnd={() => {
                              setDraggedColumn(null);
                            }}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 hover:text-gray-500" />
                          </span>
                        )}
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                      {/* Resize handle */}
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            header.getResizeHandler()(e);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          draggable={false}
                          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none group-hover:bg-gray-300 hover:!bg-blue-500 ${
                            header.column.getIsResizing() ? 'bg-blue-500 w-1' : 'bg-gray-200'
                          }`}
                        />
                      )}
                    </TableHead>
                  );
                })}
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
                  {row.getVisibleCells().map((cell) => {
                    return (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="py-1 px-3 text-center align-middle relative"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <Search className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-lg font-medium">No properties found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <span>
            Showing{' '}
            <span className="font-semibold text-gray-900">{table.getFilteredRowModel().rows.length}</span>{' '}
            of <span className="font-semibold text-gray-900">{data.length}</span> properties
          </span>
          <span className="text-xs text-gray-500">Click any cell to view detailed transactions</span>
        </div>
      </div>

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        transactions={[]}
        title={
          modalState.propertyId && modalState.month
            ? `Transactions - ${data.find((p) => p.propertyId === modalState.propertyId)?.propertyName} - ${formatMonthHeader(modalState.month)}`
            : 'Transactions'
        }
      />
    </div>
  );
};

export default BaseTable;
