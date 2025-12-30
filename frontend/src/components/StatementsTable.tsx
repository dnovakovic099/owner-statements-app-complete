import React, { useState, useEffect } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnSizingState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Eye, Edit, Download, Trash2, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, SlidersHorizontal, Search, ArrowUpDown, CheckCircle, RotateCcw, Square, CheckSquare, AlertTriangle, Calendar, ClipboardList, FileSpreadsheet, Mail, GripVertical } from 'lucide-react';
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

// Helper to get auth token for PDF viewing
const getAuthToken = (): string | null => {
  try {
    const stored = localStorage.getItem('luxury-lodging-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || null;
    }
  } catch {
    // Ignore
  }
  return null;
};

// Lightweight listing type for name lookups
interface ListingName {
  id: number;
  name: string;
  displayName?: string | null;
  nickname?: string | null;
  internalNotes?: string | null;
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
  onBulkAction?: (ids: number[], action: 'download' | 'regenerate' | 'delete' | 'finalize' | 'revert-to-draft' | 'export-csv' | 'send-email') => void;
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
  const COLUMN_ORDER_KEY = 'statements-table-column-order';
  const COLUMN_SIZING_KEY = 'statements-table-column-sizing';

  // Default column order
  const defaultColumnOrder = [
    'select',
    'ownerName',
    'propertyName',
    'week',
    'calculationType',
    'totalRevenue',
    'ownerPayout',
    'status',
    'createdAt',
    'actions',
  ];

  // Load column visibility from localStorage on mount
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Load column order from localStorage on mount
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_KEY);
      return saved ? JSON.parse(saved) : defaultColumnOrder;
    } catch {
      return defaultColumnOrder;
    }
  });

  // Load column sizing from localStorage on mount
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_SIZING_KEY);
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

  // Save column order to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder));
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [columnOrder]);

  // Save column sizing to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_SIZING_KEY, JSON.stringify(columnSizing));
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [columnSizing]);

  // Drag and drop state
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isRowsDropdownOpen, setIsRowsDropdownOpen] = useState(false);
  const [markerFilter, setMarkerFilter] = useState<string[]>([]);

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
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableResizing: false,
      header: ({ table }) => (
        <div className="flex justify-center">
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
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
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
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'ownerName',
      size: 150,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Owner
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 truncate block text-center">{row.getValue('ownerName')}</span>
      ),
    },
    {
      accessorKey: 'propertyName',
      size: 450,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Property
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const displayName = getPropertyDisplayName(row.original);
        const pmPercentage = row.original.pmPercentage ?? 15;
        const cleaningWarning = row.original.cleaningMismatchWarning;
        const shouldConvertToCalendar = row.original.shouldConvertToCalendar;
        const needsReview = row.original.needsReview;
        const reviewDetails = row.original.reviewDetails;
        return (
          <span className="cursor-default inline-flex items-center justify-center gap-1.5 group/cell relative w-full">
            <span className="text-gray-700 truncate">
              {displayName}
            </span>
            {shouldConvertToCalendar && (
              <span className="relative group/calendar flex-shrink-0">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span className="absolute left-0 top-full mt-1 z-50 hidden group-hover/calendar:inline-flex items-center bg-blue-600 text-white px-2 py-1 rounded text-[11px] whitespace-nowrap pointer-events-none shadow-lg">
                  Long stay - consider prorating to calendar
                </span>
              </span>
            )}
            {cleaningWarning && (
              <span className="relative group/warn flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="absolute left-0 top-full mt-1 z-50 hidden group-hover/warn:inline-flex items-center bg-amber-600 text-white px-2 py-1 rounded text-[11px] whitespace-nowrap pointer-events-none shadow-lg">
                  {cleaningWarning.message}
                </span>
              </span>
            )}
            {needsReview && (
              <span className="relative group/review flex-shrink-0">
                <ClipboardList className="h-4 w-4 text-purple-500" />
                <span className="absolute left-0 top-full mt-1 z-50 hidden group-hover/review:inline-flex items-center bg-purple-600 text-white px-2 py-1 rounded text-[11px] whitespace-nowrap pointer-events-none shadow-lg">
                  {reviewDetails?.expenseCount ? `${reviewDetails.expenseCount} expense${reviewDetails.expenseCount > 1 ? 's' : ''}` : ''}
                  {reviewDetails?.expenseCount && reviewDetails?.additionalPayoutCount ? ', ' : ''}
                  {reviewDetails?.additionalPayoutCount ? `${reviewDetails.additionalPayoutCount} additional payout${reviewDetails.additionalPayoutCount > 1 ? 's' : ''}` : ''}
                  {!reviewDetails?.expenseCount && !reviewDetails?.additionalPayoutCount && 'Has expenses or additional payouts'}
                </span>
              </span>
            )}
            <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1 z-50 hidden group-hover/cell:inline-flex items-center bg-gray-900 text-white px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none">
              <span className="text-blue-300 mr-1">PM:</span>
              <span className="font-semibold">{pmPercentage}%</span>
            </span>
          </span>
        );
      },
    },
    {
      id: 'week',
      size: 150,
      accessorFn: (row) => row.weekStartDate,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Period
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-gray-700 whitespace-nowrap">
          {formatDateRange(row.original.weekStartDate, row.original.weekEndDate)}
        </span>
      ),
      sortingFn: 'datetime',
    },
    {
      accessorKey: 'calculationType',
      size: 100,
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
    },
    {
      accessorKey: 'totalRevenue',
      size: 120,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
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
    },
    {
      accessorKey: 'ownerPayout',
      size: 120,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
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
    },
    {
      accessorKey: 'status',
      size: 100,
      header: () => <span className="font-semibold text-gray-600">Status</span>,
      cell: ({ row }) => getStatusBadge(row.getValue('status')),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: 'createdAt',
      size: 180,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
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
      sortingFn: 'datetime',
    },
    {
      id: 'actions',
      size: 250,
      enableResizing: false,
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
          <div className="flex items-center justify-center">
            <ActionButton
              href={`${process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : ''}/api/statements/${statement.id}/view?token=${getAuthToken() || ''}`}
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
              tooltip={statement.status !== 'draft' ? 'Cannot Delete Final Statement' : 'Delete'}
              icon={<Trash2 className="w-[18px] h-[18px]" />}
              color="text-red-500"
              disabled={statement.status !== 'draft'}
            />
          </div>
        );
      },
      enableHiding: false,
    },
  ];

  // Filter statements by markers (client-side for current page)
  const filteredStatements = React.useMemo(() => {
    if (markerFilter.length === 0) return statements;

    return statements.filter(s => {
      if (markerFilter.includes('cleaning') && s.cleaningMismatchWarning) return true;
      if (markerFilter.includes('review') && s.needsReview) return true;
      if (markerFilter.includes('calendar') && s.shouldConvertToCalendar) return true;
      return false;
    });
  }, [statements, markerFilter]);

  // Calculate derived pagination values
  const pageCount = Math.ceil(pagination.total / pagination.pageSize);
  const canPreviousPage = pagination.pageIndex > 0;
  const canNextPage = pagination.pageIndex < pageCount - 1;

  const table = useReactTable({
    data: filteredStatements,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    globalFilterFn: 'includesString',
    manualPagination: true, // Server-side pagination
    pageCount,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnSizing,
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
            <p className="text-sm text-gray-500 mt-0.5">
              {markerFilter.length > 0
                ? `${filteredStatements.length} of ${pagination.total} statements (filtered)`
                : `${pagination.total} total statements`}
            </p>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'finalize')}
                disabled={bulkProcessing}
                className="h-8 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Finalize
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'revert-to-draft')}
                disabled={bulkProcessing}
                className="h-8 border-orange-300 bg-white text-orange-600 hover:bg-orange-50"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Draft
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'delete')}
                disabled={bulkProcessing}
                className="h-8 border-red-300 bg-white text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'export-csv')}
                disabled={bulkProcessing}
                className="h-8 border-teal-300 bg-white text-teal-700 hover:bg-teal-50"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction(selectedIds, 'send-email')}
                disabled={bulkProcessing}
                className="h-8 border-purple-300 bg-white text-purple-700 hover:bg-purple-50"
              >
                <Mail className="w-4 h-4 mr-1.5" />
                Send Email
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

            {/* Markers Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 bg-white">
                  Markers
                  {markerFilter.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">
                      {markerFilter.length}
                    </span>
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-gray-500">Filter by Markers</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={markerFilter.includes('cleaning')}
                  onCheckedChange={(checked) => {
                    setMarkerFilter(prev =>
                      checked ? [...prev, 'cleaning'] : prev.filter(v => v !== 'cleaning')
                    );
                  }}
                >
                  Cleaning Mismatch
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={markerFilter.includes('review')}
                  onCheckedChange={(checked) => {
                    setMarkerFilter(prev =>
                      checked ? [...prev, 'review'] : prev.filter(v => v !== 'review')
                    );
                  }}
                >
                  Has Expenses/Payouts
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={markerFilter.includes('calendar')}
                  onCheckedChange={(checked) => {
                    setMarkerFilter(prev =>
                      checked ? [...prev, 'calendar'] : prev.filter(v => v !== 'calendar')
                    );
                  }}
                >
                  Calendar Conversion
                </DropdownMenuCheckboxItem>
                {markerFilter.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <button
                      onClick={() => setMarkerFilter([])}
                      className="w-full px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-left"
                    >
                      Clear filters
                    </button>
                  </>
                )}
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
                <DropdownMenuSeparator />
                <button
                  onClick={() => setColumnOrder(defaultColumnOrder)}
                  className="w-full px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-left"
                >
                  Reset column order
                </button>
                <button
                  onClick={() => setColumnSizing({})}
                  className="w-full px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-left"
                >
                  Reset column widths
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active Filters Display */}
        {(globalFilter || columnFilters.length > 0 || markerFilter.length > 0) && (
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
            {markerFilter.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-md border border-purple-100">
                Markers: {markerFilter.map(m =>
                  m === 'cleaning' ? 'Cleaning' : m === 'review' ? 'Expenses/Payouts' : 'Calendar'
                ).join(', ')}
                <button onClick={() => setMarkerFilter([])} className="hover:text-purple-900 ml-0.5">×</button>
              </span>
            )}
            <button
              onClick={() => {
                setGlobalFilter('');
                setColumnFilters([]);
                setMarkerFilter([]);
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
        <Table className="w-full min-w-[900px]" style={{ tableLayout: 'fixed' }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-white border-b-2 border-gray-300">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { align?: string; width?: string } | undefined;
                  const align = meta?.align || 'left';
                  const width = meta?.width;
                  const columnId = header.column.id;
                  const isDraggable = columnId !== 'select' && columnId !== 'actions';
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

                        const newColumnOrder = [...columnOrder];
                        const draggedIndex = newColumnOrder.indexOf(draggedColumn);
                        const targetIndex = newColumnOrder.indexOf(columnId);

                        if (draggedIndex !== -1 && targetIndex !== -1) {
                          newColumnOrder.splice(draggedIndex, 1);
                          newColumnOrder.splice(targetIndex, 0, draggedColumn);
                          setColumnOrder(newColumnOrder);
                        }
                        setDraggedColumn(null);
                      }}
                      className={`text-xs font-semibold text-gray-600 uppercase tracking-wider py-2.5 px-2 whitespace-nowrap relative text-center align-middle group border-r border-gray-200 last:border-r-0 ${
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
                  data-state={row.getIsSelected() && 'selected'}
                  className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  {row.getVisibleCells().map((cell) => {
                    return (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="py-2.5 px-2 text-center align-middle"
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
              {markerFilter.length > 0 ? (
                <>
                  <span className="font-medium text-gray-700">{filteredStatements.length}</span>
                  {' '}of{' '}
                  <span className="font-medium text-gray-700">{pagination.total}</span>
                  {' '}(filtered)
                </>
              ) : (
                <>
                  <span className="font-medium text-gray-700">{pagination.total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1}</span>
                  {' '}-{' '}
                  <span className="font-medium text-gray-700">{Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.total)}</span>
                  {' '}of{' '}
                  <span className="font-medium text-gray-700">{pagination.total}</span>
                </>
              )}
            </span>

            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Rows:</span>
              <div className="relative">
                <button
                  onClick={() => setIsRowsDropdownOpen(!isRowsDropdownOpen)}
                  onBlur={() => setTimeout(() => setIsRowsDropdownOpen(false), 150)}
                  className="h-8 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer flex items-center gap-2"
                >
                  {pagination.pageSize}
                  <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isRowsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRowsDropdownOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[70px] z-50">
                    {[15, 25, 50, 100].map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          onPaginationChange(0, size);
                          setIsRowsDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-sm text-left hover:bg-blue-50 transition-colors ${
                          pagination.pageSize === size ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
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
