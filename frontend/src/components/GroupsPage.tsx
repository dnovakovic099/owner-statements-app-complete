import React, { useState, useEffect, useMemo } from 'react';
import {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Plus, Search, Pencil, Trash2, ChevronDown, ChevronRight, FolderOpen, ArrowUpDown, GripVertical, SlidersHorizontal, Home } from 'lucide-react';
import { groupsAPI, listingsAPI } from '../services/api';
import { Listing, ListingGroup } from '../types/index';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from './ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import ConfirmDialog from './ui/confirm-dialog';
import GroupModal from './GroupModal';
import { useToast } from './ui/toast';

const COLUMN_SIZING_KEY = 'groups_column_sizing';
const COLUMN_ORDER_KEY = 'groups_column_order';
const COLUMN_VISIBILITY_KEY = 'groups_column_visibility';

const defaultColumnOrder = ['expand', 'name', 'tags', 'calculationType', 'stripeAccount', 'stripeStatus', 'listingCount', 'actions'];

const tagColors: Record<string, { bg: string; text: string; border: string }> = {
  WEEKLY: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'BI-WEEKLY': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  MONTHLY: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
};

const GroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<ListingGroup[]>([]);
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

  // Modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ListingGroup | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; group: ListingGroup | null }>({
    isOpen: false,
    group: null,
  });

  const { showToast } = useToast();

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_KEY);
      return saved ? JSON.parse(saved) : defaultColumnOrder;
    } catch {
      return defaultColumnOrder;
    }
  });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_SIZING_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Persist table state
  useEffect(() => {
    try { localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility)); } catch {}
  }, [columnVisibility]);
  useEffect(() => {
    try { localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder)); } catch {}
  }, [columnOrder]);
  useEffect(() => {
    try { localStorage.setItem(COLUMN_SIZING_KEY, JSON.stringify(columnSizing)); } catch {}
  }, [columnSizing]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [groupsRes, listingsRes] = await Promise.all([
        groupsAPI.getGroups(),
        listingsAPI.getListings(),
      ]);
      setGroups(groupsRes.groups || []);
      setAllListings(listingsRes.listings || []);
    } catch (err) {
      console.error('Failed to fetch groups data:', err);
      showToast('Failed to load groups', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveGroup = async (data: {
    id?: number;
    name: string;
    tags: string[];
    listingIds: number[];
    calculationType: 'checkout' | 'calendar';
    stripeAccountId?: string | null;
  }) => {
    if (data.id) {
      await groupsAPI.updateGroup(data.id, {
        name: data.name,
        tags: data.tags,
        stripeAccountId: data.stripeAccountId,
      });

      const currentGroup = groups.find(g => g.id === data.id);
      const currentListingIds = currentGroup?.listingIds || [];
      const newListingIds = data.listingIds;

      const toRemove = currentListingIds.filter(id => !newListingIds.includes(id));
      for (const listingId of toRemove) {
        await groupsAPI.removeListingFromGroup(data.id, listingId);
      }

      const toAdd = newListingIds.filter(id => !currentListingIds.includes(id));
      if (toAdd.length > 0) {
        await groupsAPI.addListingsToGroup(data.id, toAdd);
      }

      showToast(`Group "${data.name}" updated`, 'success');
    } else {
      await groupsAPI.createGroup({
        name: data.name,
        tags: data.tags,
        listingIds: data.listingIds,
        stripeAccountId: data.stripeAccountId,
      });
      showToast(`Group "${data.name}" created`, 'success');
    }
    await fetchData();
  };

  const handleDeleteGroup = async () => {
    if (!deleteConfirm.group) return;
    try {
      await groupsAPI.deleteGroup(deleteConfirm.group.id);
      showToast(`Group "${deleteConfirm.group.name}" deleted`, 'success');
      await fetchData();
    } catch (err) {
      console.error('Failed to delete group:', err);
      showToast('Failed to delete group', 'error');
    }
  };

  const maskStripeId = (id: string | null | undefined): string => {
    if (!id) return '';
    if (id.length <= 8) return id;
    return `${id.slice(0, 5)}...${id.slice(-4)}`;
  };

  const getListingsForGroup = (group: ListingGroup): Listing[] => {
    const ids = group.listingIds || [];
    return allListings.filter(l => ids.includes(l.id));
  };

  const toggleExpand = (groupId: number) => {
    setExpandedGroupId(prev => prev === groupId ? null : groupId);
  };

  // Column definitions
  const columns: ColumnDef<ListingGroup>[] = useMemo(() => [
    {
      id: 'expand',
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableResizing: false,
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => {
        const isExpanded = expandedGroupId === row.original.id;
        return (
          <button
            onClick={() => toggleExpand(row.original.id)}
            className={`p-1 rounded transition-colors ${isExpanded ? 'text-purple-600 bg-purple-50' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        );
      },
    },
    {
      accessorKey: 'name',
      size: 220,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900"
        >
          Group Name
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <span className="font-semibold text-gray-900 truncate">{row.getValue('name')}</span>
        </div>
      ),
    },
    {
      id: 'tags',
      accessorFn: (row) => (row.tags || []).join(', '),
      size: 180,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Schedule
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {(row.original.tags || []).map((tag) => {
            const colors = tagColors[tag] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
            return (
              <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                {tag}
              </span>
            );
          })}
        </div>
      ),
    },
    {
      accessorKey: 'calculationType',
      size: 130,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Calc Type
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const type = row.original.calculationType || 'checkout';
        const isCalendar = type === 'calendar';
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
            isCalendar
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}>
            {type === 'checkout' ? 'Check-out' : 'Calendar'}
          </span>
        );
      },
    },
    {
      id: 'stripeAccount',
      accessorFn: (row) => row.stripeAccountId || '',
      size: 170,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Stripe Account
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const stripeId = row.original.stripeAccountId;
        return stripeId ? (
          <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">{maskStripeId(stripeId)}</code>
        ) : (
          <span className="text-xs text-gray-300">--</span>
        );
      },
    },
    {
      id: 'stripeStatus',
      accessorFn: (row) => row.stripeAccountId ? (row.stripeOnboardingStatus || 'pending') : 'none',
      size: 140,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Stripe Status
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const group = row.original;
        if (!group.stripeAccountId) {
          return <span className="text-xs text-gray-300">--</span>;
        }
        const status = group.stripeOnboardingStatus || 'pending';
        const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
          verified: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Connected' },
          pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500', label: 'Pending' },
          requires_action: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', label: 'Action Required' },
          missing: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', dot: 'bg-gray-400', label: 'Not Set' },
        };
        const c = config[status] || config.pending;
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${c.bg} ${c.text} ${c.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        );
      },
    },
    {
      id: 'listingCount',
      accessorFn: (row) => row.listingIds?.length || 0,
      size: 100,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 mx-auto"
        >
          Listings
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const count = row.original.listingIds?.length || 0;
        return (
          <div className="flex justify-center">
            <button
              onClick={() => toggleExpand(row.original.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors border border-purple-200"
            >
              <Home className="w-3 h-3" />
              {count}
            </button>
          </div>
        );
      },
    },
    {
      id: 'actions',
      size: 100,
      minSize: 80,
      enableResizing: false,
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="text-xs font-semibold text-gray-600 uppercase">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          <button
            onClick={() => {
              setEditingGroup(row.original);
              setIsGroupModalOpen(true);
            }}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all hover:scale-110"
            title="Edit group"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteConfirm({ isOpen: true, group: row.original })}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all hover:scale-110"
            title="Delete group"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ], [expandedGroupId, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnLabels: Record<string, string> = {
    name: 'Group Name',
    tags: 'Schedule',
    calculationType: 'Calc Type',
    stripeAccount: 'Stripe Account',
    stripeStatus: 'Stripe Status',
    listingCount: 'Listings',
  };

  const table = useReactTable({
    data: groups,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
      globalFilter,
    },
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Groups</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {groups.length} total group{groups.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 h-9 w-48"
              />
            </div>

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

            <Button
              onClick={() => {
                setEditingGroup(null);
                setIsGroupModalOpen(true);
              }}
              className="bg-purple-600 hover:bg-purple-700 h-9"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Group
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {groups.length === 0 && !globalFilter ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No groups yet</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-sm">
                Groups let you combine multiple listings into a single statement with shared schedule tags and Stripe accounts.
              </p>
              <Button
                onClick={() => {
                  setEditingGroup(null);
                  setIsGroupModalOpen(true);
                }}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Group
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <Table className="w-full min-w-[900px]" style={{ tableLayout: 'fixed' }}>
              <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="bg-white border-b-2 border-gray-300">
                    {headerGroup.headers.map((header) => {
                      const columnId = header.column.id;
                      const isDraggable = columnId !== 'expand' && columnId !== 'actions';
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
                          className={`text-xs font-semibold text-gray-600 uppercase tracking-wider py-2.5 px-2 whitespace-nowrap relative text-center align-middle group border-r border-gray-200 last:border-r-0 ${isDragging ? 'opacity-50 bg-blue-100' : ''} ${draggedColumn && draggedColumn !== columnId ? 'hover:bg-blue-50' : ''}`}
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
                                onDragEnd={() => setDraggedColumn(null)}
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
                              className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none group-hover:bg-gray-300 hover:!bg-blue-500 ${header.column.getIsResizing() ? 'bg-blue-500 w-1' : 'bg-gray-200'}`}
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
                  table.getRowModel().rows.map((row, index) => {
                    const group = row.original;
                    const isExpanded = expandedGroupId === group.id;
                    const groupListings = getListingsForGroup(group);
                    const listingCount = group.listingIds?.length || 0;

                    return (
                      <React.Fragment key={row.id}>
                        <TableRow
                          className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} ${isExpanded ? 'bg-purple-50/30' : ''}`}
                          onClick={() => toggleExpand(group.id)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              style={{ width: cell.column.getSize() }}
                              className="py-2.5 px-2 text-center align-middle"
                              onClick={(e) => {
                                // Don't toggle expand when clicking action buttons
                                if (cell.column.id === 'actions') e.stopPropagation();
                              }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>

                        {/* Expanded listings */}
                        {isExpanded && (
                          <TableRow className="bg-white">
                            <TableCell colSpan={columns.length} className="p-0">
                              <div className="mx-4 my-3 rounded-lg border border-purple-100 bg-purple-50/30 overflow-hidden">
                                <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100">
                                  <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                                    {listingCount} Listing{listingCount !== 1 ? 's' : ''} in this group
                                  </span>
                                </div>
                                {groupListings.length === 0 ? (
                                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                                    No listings in this group
                                  </div>
                                ) : (
                                  <div className="divide-y divide-purple-100/50">
                                    {groupListings.map((listing) => (
                                      <div
                                        key={listing.id}
                                        className="flex items-center justify-between py-2 px-4 hover:bg-purple-50/50 transition-colors"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                          <div className="w-6 h-6 rounded bg-white border border-purple-200 flex items-center justify-center flex-shrink-0">
                                            <Home className="w-3 h-3 text-purple-500" />
                                          </div>
                                          <span className="text-sm font-medium text-gray-900 truncate">
                                            {listing.displayName || listing.nickname || listing.name}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                                          {listing.city && (
                                            <span className="text-xs text-gray-500">
                                              {listing.city}{listing.state ? `, ${listing.state}` : ''}
                                            </span>
                                          )}
                                          {listing.ownerEmail && (
                                            <span className="text-xs text-gray-400 font-mono">
                                              {listing.ownerEmail}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center">
                      <div className="text-gray-500">No groups match your search.</div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false);
          setEditingGroup(null);
        }}
        group={editingGroup}
        onSave={handleSaveGroup}
        allListings={allListings}
        allGroups={groups}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, group: null })}
        onConfirm={handleDeleteGroup}
        title="Delete Group"
        message={`Are you sure you want to delete "${deleteConfirm.group?.name}"? The listings will be ungrouped but not deleted.`}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
};

export default GroupsPage;
