import React, { useState, useEffect } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Eye, Edit, Download, Trash2, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, SlidersHorizontal, Search, ArrowUpDown, CheckCircle, RotateCcw, Square, CheckSquare } from 'lucide-react';
import { Statement } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tooltip } from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

// Lightweight listing type for name lookups
interface ListingName {
  id: number;
  name: string;
  displayName?: string | null;
  nickname?: string | null;
}

interface PaginationState {
  pageIndex: number;
  pageSize: number;
  total: number;
}

interface StatementsTableProps {
  statements: Statement[];
  listings?: ListingName[];
  onAction: (id: number, action: string) => void;
  onBulkAction?: (ids: number[], action: 'download' | 'regenerate') => void;
  regeneratingId?: number | null;
  bulkProcessing?: boolean;
  pagination: PaginationState;
  onPaginationChange: (pageIndex: number, pageSize: number) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const formatDateRange = (startDate: string, endDate: string) => {
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const start = parseLocalDate(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = parseLocalDate(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start} - ${end}`;
};

const formatDateTime = (dateTimeStr: string) => {
  const date = new Date(dateTimeStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  });
};

const getStatusBadge = (status: string) => {
  const statusConfig = {
    draft: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
    final: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    generated: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    sent: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
    paid: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', dot: 'bg-gray-500' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${config.bg} ${config.text} ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Action Button Component with Tooltip - Memoized to prevent unnecessary re-renders
interface ActionButtonProps {
  onClick?: () => void;
  href?: string;
  tooltip: string;
  icon: React.ReactNode;
  color: string;
  disabled?: boolean;
}

const ActionButton = React.memo<ActionButtonProps>(({ onClick, href, tooltip, icon, color, disabled }) => {
  const buttonClass = `inline-flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 hover:bg-gray-100 ${color} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110'}`;

  if (href) {
    return (
      <Tooltip content={tooltip}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
        >
          {icon}
        </a>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={buttonClass}
      >
        {icon}
      </button>
    </Tooltip>
  );
});
ActionButton.displayName = 'ActionButton';

const StatementsTable: React.FC<StatementsTableProps> = ({
  statements,
  listings = [],
  onAction,
  onBulkAction,
  regeneratingId,
  bulkProcessing = false,
  pagination,
  onPaginationChange,
}) => {
  const COLUMN_VISIBILITY_KEY = 'statements-table-column-visibility';

  // Load column visibility from localStorage on mount
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save column visibility to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility));
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [columnVisibility]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Get selected statement IDs
  const selectedIds = React.useMemo(() => {
    return Object.keys(rowSelection)
      .filter(key => rowSelection[key])
      .map(key => statements[parseInt(key)]?.id)
      .filter(Boolean) as number[];
  }, [rowSelection, statements]);

  // Clear selection when statements change
  useEffect(() => {
    setRowSelection({});
  }, [statements]);

  // Create a lookup map for property names to display names/nicknames
  const listingNameMap = React.useMemo(() => {
    const map = new Map<number, string>();
    listings.forEach(listing => {
      // Prefer nickname, then displayName, then fall back to name
      const displayName = listing.nickname || listing.displayName || listing.name;
      map.set(listing.id, displayName);
    });
    return map;
  }, [listings]);

  // Helper to get display name for a property
  const getPropertyDisplayName = (statement: Statement) => {
    if (statement.propertyId && listingNameMap.has(statement.propertyId)) {
      return listingNameMap.get(statement.propertyId)!;
    }
    return statement.propertyName;
  };

  const columns: ColumnDef<Statement>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <button
          onClick={() => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected())}
          className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
        >
          {table.getIsAllPageRowsSelected() ? (
            <CheckSquare className="w-4 h-4 text-blue-600" />
          ) : table.getIsSomePageRowsSelected() ? (
            <div className="w-2.5 h-2.5 bg-blue-600 rounded-sm" />
          ) : (
            <Square className="w-4 h-4 text-gray-400" />
          )}
        </button>
      ),
      cell: ({ row }) => (
        <button
          onClick={() => row.toggleSelected(!row.getIsSelected())}
          className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
        >
          {row.getIsSelected() ? (
            <CheckSquare className="w-4 h-4 text-blue-600" />
          ) : (
            <Square className="w-4 h-4 text-gray-400" />
          )}
        </button>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { align: 'center', width: '36px' },
    },
    {
      accessorKey: 'ownerName',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 text-left font-semibold text-gray-600 hover:text-gray-900"
        >
          Owner
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 truncate block">{row.getValue('ownerName')}</span>
      ),
      meta: { align: 'left', width: '9%' },
    },
    {
      accessorKey: 'propertyName',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 text-left font-semibold text-gray-600 hover:text-gray-900"
        >
          Property
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const displayName = getPropertyDisplayName(row.original);
        return (
          <span className="text-gray-700 block truncate" title={displayName}>
            {displayName}
          </span>
        );
      },
      meta: { align: 'left', width: '18%' },
    },
    {
      id: 'week',
      accessorFn: (row) => `${row.weekStartDate} - ${row.weekEndDate}`,
      header: () => <span className="font-semibold text-gray-600">Period</span>,
      cell: ({ row }) => (
        <span className="text-gray-700 whitespace-nowrap">
          {formatDateRange(row.original.weekStartDate, row.original.weekEndDate)}
        </span>
      ),
      meta: { align: 'left', width: '9%' },
    },
    {
      accessorKey: 'calculationType',
      header: () => <span className="font-semibold text-gray-600">Type</span>,
      cell: ({ row }) => {
        const type = row.getValue('calculationType') as string;
        return (
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
            type === 'calendar'
              ? 'bg-sky-50 text-sky-700 border border-sky-200'
              : 'bg-slate-50 text-slate-700 border border-slate-200'
          }`}>
            {type === 'calendar' ? 'Calendar' : 'Checkout'}
          </span>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      meta: { align: 'center', width: '6%' },
    },
    {
      accessorKey: 'totalRevenue',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 justify-end w-full font-semibold text-gray-600 hover:text-gray-900"
        >
          Revenue
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-semibold text-gray-900 tabular-nums">
          {formatCurrency(row.getValue('totalRevenue'))}
        </span>
      ),
      meta: { align: 'right', width: '8%' },
    },
    {
      accessorKey: 'ownerPayout',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 justify-end w-full font-semibold text-gray-600 hover:text-gray-900"
        >
          Payout
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const payout = row.getValue('ownerPayout') as number;
        return (
          <span className={`font-bold tabular-nums ${payout < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(payout)}
          </span>
        );
      },
      meta: { align: 'right', width: '8%' },
    },
    {
      accessorKey: 'status',
      header: () => <span className="font-semibold text-gray-600">Status</span>,
      cell: ({ row }) => getStatusBadge(row.getValue('status')),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      meta: { align: 'center', width: '6%' },
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 text-left font-semibold text-gray-600 hover:text-gray-900"
        >
          Created
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {row.getValue('createdAt') ? formatDateTime(row.getValue('createdAt')) : '-'}
        </span>
      ),
      meta: { align: 'left', width: '11%' },
    },
    {
      id: 'actions',
      header: () => <span className="font-semibold text-gray-600">Actions</span>,
      cell: ({ row }) => {
        const statement = row.original;
        const isRegenerating = regeneratingId === statement.id;

        if (isRegenerating) {
          return (
            <div className="flex items-center gap-2 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Regenerating...</span>
            </div>
          );
        }

        return (
          <div className="flex items-center">
            <ActionButton
              href={`${process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : ''}/api/statements/${statement.id}/view`}
              tooltip="View Statement"
              icon={<Eye className="w-[18px] h-[18px]" />}
              color="text-blue-600"
            />
            <ActionButton
              onClick={() => onAction(statement.id, 'edit')}
              tooltip={statement.status === 'final' ? 'Cannot Edit Final Statement' : 'Edit Statement'}
              icon={<Edit className="w-[18px] h-[18px]" />}
              color="text-amber-600"
              disabled={statement.status === 'final'}
            />
            <ActionButton
              onClick={() => onAction(statement.id, 'refresh')}
              tooltip="Regenerate"
              icon={<RefreshCw className="w-[18px] h-[18px]" />}
              color="text-indigo-600"
            />
            <ActionButton
              onClick={() => onAction(statement.id, 'download')}
              tooltip="Download PDF"
              icon={<Download className="w-[18px] h-[18px]" />}
              color="text-purple-600"
            />
            <ActionButton
              onClick={() => onAction(statement.id, 'finalize')}
              tooltip={statement.status === 'final' ? 'Already Final' : 'Mark as Final'}
              icon={<CheckCircle className="w-[18px] h-[18px]" />}
              color="text-emerald-600"
              disabled={statement.status === 'final'}
            />
            <ActionButton
              onClick={() => onAction(statement.id, 'revert-to-draft')}
              tooltip={statement.status === 'draft' ? 'Already Draft' : 'Return to Draft'}
              icon={<RotateCcw className="w-[18px] h-[18px]" />}
              color="text-orange-600"
              disabled={statement.status === 'draft'}
            />
            <ActionButton
              onClick={() => onAction(statement.id, 'delete')}
              tooltip="Delete"
              icon={<Trash2 className="w-[18px] h-[18px]" />}
              color="text-red-500"
            />
          </div>
        );
      },
      enableHiding: false,
      meta: { align: 'left', width: '15%' },
    },
  ];

  // Calculate derived pagination values
  const pageCount = Math.ceil(pagination.total / pagination.pageSize);
  const canPreviousPage = pagination.pageIndex > 0;
  const canNextPage = pagination.pageIndex < pageCount - 1;

  const table = useReactTable({
    data: statements,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    globalFilterFn: 'includesString',
    manualPagination: true, // Server-side pagination
    pageCount,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      rowSelection,
      pagination: {
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
      },
    },
  });

  if (statements.length === 0 && pagination.total === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No statements found</h2>
          <p className="text-gray-500">Generate your first statement using the button above.</p>
        </div>
      </div>
    );
  }

  const columnLabels: Record<string, string> = {
    ownerName: 'Owner',
    propertyName: 'Property',
    week: 'Period',
    calculationType: 'Type',
    totalRevenue: 'Revenue',
    ownerPayout: 'Payout',
    status: 'Status',
    createdAt: 'Created',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Statements</h2>
            <p className="text-sm text-gray-500 mt-0.5">{pagination.total} total statements</p>
          </div>

          {/* Bulk Actions - shown when items are selected */}
          {selectedIds.length > 0 && onBulkAction && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-700">
                {selectedIds.length} selected
              </span>
              <div className="h-4 w-px bg-blue-300" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'download')}
                disabled={bulkProcessing}
                className="h-8 border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'regenerate')}
                disabled={bulkProcessing}
                className="h-8 border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
              >
                {bulkProcessing ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                )}
                Regenerate
              </Button>
              <button
                onClick={() => setRowSelection({})}
                className="ml-1 text-blue-600 hover:text-blue-800 text-sm"
              >
                Clear
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Global Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search..."
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 w-full sm:w-56 h-9 bg-white border-gray-200 focus:border-blue-300 focus:ring-blue-200"
              />
            </div>

            {/* Type Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 bg-white">
                  Type
                  <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel className="text-xs text-gray-500">Filter by Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['checkout', 'calendar'].map((type) => {
                  const filterValue = (table.getColumn('calculationType')?.getFilterValue() as string[]) || [];
                  const isChecked = filterValue.includes(type);
                  return (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const newValue = checked
                          ? [...filterValue, type]
                          : filterValue.filter((v) => v !== type);
                        table.getColumn('calculationType')?.setFilterValue(newValue.length ? newValue : undefined);
                      }}
                    >
                      {type === 'calendar' ? 'Calendar' : 'Checkout'}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 bg-white">
                  Status
                  <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel className="text-xs text-gray-500">Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['draft', 'final'].map((status) => {
                  const filterValue = (table.getColumn('status')?.getFilterValue() as string[]) || [];
                  const isChecked = filterValue.includes(status);
                  return (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const newValue = checked
                          ? [...filterValue, status]
                          : filterValue.filter((v) => v !== status);
                        table.getColumn('status')?.setFilterValue(newValue.length ? newValue : undefined);
                      }}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Column Visibility */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 bg-white">
                  <SlidersHorizontal className="mr-2 h-4 w-4 text-gray-400" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs text-gray-500">Toggle Columns</DropdownMenuLabel>
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
                      {columnLabels[column.id] || column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active Filters Display */}
        {(globalFilter || columnFilters.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500">Filters:</span>
            {globalFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">
                Search: "{globalFilter}"
                <button onClick={() => setGlobalFilter('')} className="hover:text-blue-900 ml-0.5">×</button>
              </span>
            )}
            {columnFilters.map((filter) => (
              <span key={filter.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-md border border-gray-200">
                {columnLabels[filter.id] || filter.id}: {Array.isArray(filter.value) ? (filter.value as string[]).join(', ') : String(filter.value)}
                <button
                  onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                  className="hover:text-gray-900 ml-0.5"
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
        <Table className="w-full min-w-[1100px]" style={{ tableLayout: 'fixed' }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gray-50 border-b border-gray-200">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { align?: string; width?: string } | undefined;
                  const align = meta?.align || 'left';
                  const width = meta?.width;
                  return (
                    <TableHead
                      key={header.id}
                      style={width ? { width } : undefined}
                      className={`text-xs font-semibold text-gray-500 uppercase tracking-wider py-2.5 px-2 whitespace-nowrap ${
                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
                  data-state={row.getIsSelected() && 'selected'}
                  className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { align?: string; width?: string } | undefined;
                    const align = meta?.align || 'left';
                    const width = meta?.width;
                    return (
                      <TableCell
                        key={cell.id}
                        style={width ? { width } : undefined}
                        className={`py-2.5 px-2 ${
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="text-gray-500">No results found.</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Results info and page size */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            <span className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{pagination.total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1}</span>
              {' '}-{' '}
              <span className="font-medium text-gray-700">{Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.total)}</span>
              {' '}of{' '}
              <span className="font-medium text-gray-700">{pagination.total}</span>
            </span>

            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Rows:</span>
              <div className="relative inline-flex">
                <select
                  value={pagination.pageSize}
                  onChange={(e) => onPaginationChange(0, Number(e.target.value))}
                  className="h-9 pl-3 pr-8 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                  style={{
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    appearance: 'none',
                    backgroundImage: 'none'
                  }}
                >
                  {[10, 25, 50, 100].map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPaginationChange(pagination.pageIndex - 1, pagination.pageSize)}
              disabled={!canPreviousPage}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Prev</span>
            </button>

            <div className="flex items-center">
              {Array.from({ length: pageCount }, (_, i) => i).map((page) => {
                const currentPage = pagination.pageIndex;
                const totalPages = pageCount;

                if (
                  page === 0 ||
                  page === totalPages - 1 ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => onPaginationChange(page, pagination.pageSize)}
                      className={`w-8 h-8 text-sm font-medium rounded-md transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {page + 1}
                    </button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="w-8 text-center text-gray-400">...</span>;
                }
                return null;
              })}
            </div>

            <button
              onClick={() => onPaginationChange(pagination.pageIndex + 1, pagination.pageSize)}
              disabled={!canNextPage}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatementsTable;
