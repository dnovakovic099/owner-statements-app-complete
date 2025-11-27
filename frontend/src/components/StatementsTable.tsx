import React, { useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Eye, Edit, Send, Download, Trash2, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, SlidersHorizontal, Search, ArrowUpDown } from 'lucide-react';
import { Statement } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
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

interface StatementsTableProps {
  statements: Statement[];
  listings?: ListingName[];
  onAction: (id: number, action: string) => void;
  regeneratingId?: number | null;
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
  const statusClasses = {
    draft: 'bg-yellow-100 text-yellow-800',
    generated: 'bg-blue-100 text-blue-800',
    sent: 'bg-green-100 text-green-800',
    paid: 'bg-purple-100 text-purple-800',
  };

  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
        statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const StatementsTable: React.FC<StatementsTableProps> = ({ statements, listings = [], onAction, regeneratingId }) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

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
      accessorKey: 'ownerName',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2 -ml-2"
        >
          Owner
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.getValue('ownerName')}</div>
      ),
    },
    {
      accessorKey: 'propertyName',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2 -ml-2"
        >
          Property
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const displayName = getPropertyDisplayName(row.original);
        return (
          <div className="text-gray-900 max-w-[200px] truncate" title={displayName}>
            {displayName}
          </div>
        );
      },
    },
    {
      id: 'week',
      accessorFn: (row) => `${row.weekStartDate} - ${row.weekEndDate}`,
      header: 'Week',
      cell: ({ row }) => (
        <div className="text-gray-900 whitespace-nowrap">
          {formatDateRange(row.original.weekStartDate, row.original.weekEndDate)}
        </div>
      ),
    },
    {
      accessorKey: 'calculationType',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('calculationType') as string;
        return (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            type === 'calendar'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-800'
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
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2 -ml-2"
        >
          Revenue
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">
          {formatCurrency(row.getValue('totalRevenue'))}
        </div>
      ),
    },
    {
      accessorKey: 'ownerPayout',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2 -ml-2"
        >
          Payout
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-bold text-gray-900">
          {formatCurrency(row.getValue('ownerPayout'))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.getValue('status')),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2 -ml-2"
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-xs text-gray-500">
          {row.getValue('createdAt') ? formatDateTime(row.getValue('createdAt')) : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const statement = row.original;
        const isRegenerating = regeneratingId === statement.id;
        return (
          <div className="flex space-x-2">
            {isRegenerating ? (
              <div className="flex items-center text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm">Regenerating...</span>
              </div>
            ) : (
              <>
                <a
                  href={`${process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : ''}/api/statements/${statement.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-900 inline-block"
                  title="View Statement"
                >
                  <Eye className="w-4 h-4" />
                </a>
                <button
                  onClick={() => onAction(statement.id, 'refresh')}
                  className="text-indigo-600 hover:text-indigo-900"
                  title="Regenerate Statement"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                {(statement.status === 'draft' || statement.status === 'modified') && (
                  <button
                    onClick={() => onAction(statement.id, 'edit')}
                    className="text-yellow-600 hover:text-yellow-900"
                    title="Edit Statement"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {statement.status === 'generated' && (
                  <button
                    onClick={() => onAction(statement.id, 'send')}
                    className="text-green-600 hover:text-green-900"
                    title="Send Statement"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onAction(statement.id, 'download')}
                  className="text-purple-600 hover:text-purple-900"
                  title="Download Statement"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onAction(statement.id, 'delete')}
                  className="text-red-600 hover:text-red-900"
                  title="Delete Statement"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        );
      },
      enableHiding: false,
    },
  ];

  const table = useReactTable({
    data: statements,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (statements.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No statements found</h2>
          <p className="text-gray-600">Generate your first statement using the button above.</p>
        </div>
      </div>
    );
  }

  const columnLabels: Record<string, string> = {
    ownerName: 'Owner',
    propertyName: 'Property',
    week: 'Week',
    calculationType: 'Type',
    totalRevenue: 'Revenue',
    ownerPayout: 'Payout',
    status: 'Status',
    createdAt: 'Created',
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Statements</h2>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Global Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search all columns..."
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 w-full sm:w-64"
              />
            </div>

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10">
                  Status
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['draft', 'generated', 'sent', 'paid'].map((status) => {
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

            {/* Type Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10">
                  Type
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
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

            {/* Column Visibility */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
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
            <span className="text-sm text-gray-500">Active filters:</span>
            {globalFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                Search: "{globalFilter}"
                <button onClick={() => setGlobalFilter('')} className="hover:text-blue-600">×</button>
              </span>
            )}
            {columnFilters.map((filter) => (
              <span key={filter.id} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                {columnLabels[filter.id] || filter.id}: {Array.isArray(filter.value) ? (filter.value as string[]).join(', ') : String(filter.value)}
                <button
                  onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                  className="hover:text-gray-600"
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
              className="text-xs text-red-600 hover:text-red-800"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gray-50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-medium text-gray-500 uppercase tracking-wider">
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
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span>
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}{' '}
            of {table.getFilteredRowModel().rows.length}
          </span>
          <span className="mx-2 text-gray-300">|</span>
          <span>Rows per page:</span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => {
              table.setPageSize(Number(e.target.value));
            }}
            className="h-8 w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[10, 25, 50, 100].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: table.getPageCount() }, (_, i) => i).map((page) => {
              const currentPage = table.getState().pagination.pageIndex;
              const totalPages = table.getPageCount();

              // Show first, last, current, and adjacent pages
              if (
                page === 0 ||
                page === totalPages - 1 ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              ) {
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => table.setPageIndex(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page + 1}
                  </Button>
                );
              } else if (page === currentPage - 2 || page === currentPage + 2) {
                return <span key={page} className="px-1">...</span>;
              }
              return null;
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StatementsTable;
