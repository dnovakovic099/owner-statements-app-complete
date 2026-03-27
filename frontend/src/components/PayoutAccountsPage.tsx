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
import { Search, FolderOpen, Home, ChevronDown, ChevronRight, ArrowUpDown, GripVertical, SlidersHorizontal, CreditCard, Pencil, Check, X, Send, Copy, Download, ExternalLink, RefreshCw, Info, Unplug } from 'lucide-react';
import { groupsAPI, listingsAPI, payoutsAPI } from '../services/api';
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
import { useToast } from './ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const COLUMN_SIZING_KEY = 'payout_column_sizing';
const COLUMN_ORDER_KEY = 'payout_column_order';
const COLUMN_VISIBILITY_KEY = 'payout_column_visibility';

const defaultColumnOrder = ['expand', 'name', 'type', 'ownerEmail', 'schedule', 'wiseRecipient', 'wiseStatus', 'listingCount'];

const tagColors: Record<string, { bg: string; text: string; border: string }> = {
  WEEKLY: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'BI-WEEKLY': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  MONTHLY: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
};

type PayoutConnectionRow = {
  type: 'group' | 'listing';
  id: number;
  name: string;
  ownerEmail: string | null;
  wiseRecipientId: string | null;
  connected: boolean;
  wiseStatus: string;
  schedule: string[];
  listingCount: number;
  listings: Listing[];
};

const PayoutAccountsPage: React.FC = () => {
  const [groups, setGroups] = useState<ListingGroup[]>([]);
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<PayoutConnectionRow | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string } | null>(null);

  const [csvExporting, setCsvExporting] = useState(false);

  // Refresh debounce
  const [refreshingRowKey, setRefreshingRowKey] = useState<string | null>(null);

  // Filter state — persist to localStorage
  const FILTER_STATUS_KEY = 'payout_filter_status';
  const FILTER_TYPE_KEY = 'payout_filter_type';
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    try { return localStorage.getItem(FILTER_STATUS_KEY) || 'all'; } catch { return 'all'; }
  });
  const [typeFilter, setTypeFilter] = useState<string>(() => {
    try { return localStorage.getItem(FILTER_TYPE_KEY) || 'all'; } catch { return 'all'; }
  });
  useEffect(() => { try { localStorage.setItem(FILTER_STATUS_KEY, statusFilter); } catch {} }, [statusFilter]);
  useEffect(() => { try { localStorage.setItem(FILTER_TYPE_KEY, typeFilter); } catch {} }, [typeFilter]);

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
      setFetchError(false);
      const [groupsRes, listingsRes] = await Promise.all([
        groupsAPI.getGroups(),
        listingsAPI.getListings(),
      ]);
      setGroups(groupsRes.groups || []);
      setAllListings(listingsRes.listings || []);
    } catch (err) {
      console.error('Failed to fetch payout connections data:', err);
      setFetchError(true);
      showToast('Failed to load payout connections', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openInviteModal = (row: PayoutConnectionRow) => {
    setInviteTarget(row);
    setInviteResult(null);
    setInviteModalOpen(true);
  };

  const handleGenerateInvite = async () => {
    if (!inviteTarget) return;
    setInviteLoading(true);
    try {
      const result = await payoutsAPI.generateInvite({
        entityType: inviteTarget.type,
        entityId: inviteTarget.id,
        email: inviteTarget.ownerEmail || undefined,
      });
      setInviteResult({ inviteUrl: result.inviteUrl });
      showToast('Invite link generated', 'success');
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to generate invite link';
      showToast(msg, 'error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRefreshStatus = async (row: PayoutConnectionRow) => {
    const rowKey = getRowKey(row);
    if (!row.wiseRecipientId || refreshingRowKey) return;
    setRefreshingRowKey(rowKey);
    try {
      await payoutsAPI.refreshWiseStatus({
        wiseRecipientId: row.wiseRecipientId,
        ...(row.type === 'group' ? { groupId: row.id } : { listingId: row.id }),
      });
      showToast('Status refreshed', 'success');
      fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to refresh status', 'error');
    } finally {
      setRefreshingRowKey(null);
    }
  };

  const handleDisconnect = async (row: PayoutConnectionRow) => {
    if (!window.confirm(`Disconnect payout account for "${row.name}"? This will archive the Increase external account.`)) return;
    const rowKey = getRowKey(row);
    setRefreshingRowKey(rowKey);
    try {
      await payoutsAPI.disconnectAccount({ entityType: row.type, entityId: row.id });
      showToast('Payout account disconnected', 'success');
      fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to disconnect', 'error');
    } finally {
      setRefreshingRowKey(null);
    }
  };

  const exportCSV = async () => {
    setCsvExporting(true);
    try {
      const clientMap = new Map<string, { name: string; listings: string[]; email: string; wiseRecipientId: string | null; entityType: 'listing' | 'group'; entityId: number }>();

      for (const row of table.getFilteredRowModel().rows) {
        const data = row.original;
        const clientKey = data.ownerEmail || data.name;
        if (!clientMap.has(clientKey)) {
          clientMap.set(clientKey, {
            name: data.name,
            listings: [],
            email: data.ownerEmail || '',
            wiseRecipientId: data.wiseRecipientId || null,
            entityType: data.type,
            entityId: data.id,
          });
        }
        const client = clientMap.get(clientKey)!;
        if (data.type === 'group') {
          client.listings.push(...data.listings.map(l => l.nickname || l.displayName || l.name));
        } else {
          client.listings.push(data.name);
        }
      }

      const clients = Array.from(clientMap.values());
      const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

      const csvRows = [['client name', 'listings', 'email', 'increase account id', 'status'].join(',')];
      clients.forEach((client) => {
        csvRows.push([
          escapeCsv(client.name),
          escapeCsv(client.listings.join('; ')),
          escapeCsv(client.email),
          escapeCsv(client.wiseRecipientId || ''),
          escapeCsv(client.wiseRecipientId ? 'connected' : 'not connected'),
        ].join(','));
      });

      const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'payout-accounts.csv';
      a.click();
      URL.revokeObjectURL(url);

      showToast('CSV exported', 'success');
    } catch (err) {
      showToast('Failed to export CSV', 'error');
    } finally {
      setCsvExporting(false);
    }
  };

  // Build unified row model
  const rows: PayoutConnectionRow[] = useMemo(() => {
    const result: PayoutConnectionRow[] = [];

    const groupedListingIds = new Set<number>();
    for (const group of groups) {
      for (const id of group.listingIds || []) {
        groupedListingIds.add(id);
      }
    }

    for (const group of groups) {
      const memberListings = allListings.filter(l => (group.listingIds || []).includes(l.id));
      const firstListingEmail = memberListings.length > 0 ? (memberListings[0].ownerEmail || null) : null;
      result.push({
        type: 'group',
        id: group.id,
        name: group.name,
        ownerEmail: firstListingEmail,
        wiseRecipientId: group.wiseRecipientId || null,
        connected: !!(group.wiseRecipientId && group.wiseStatus === 'verified'),
        wiseStatus: group.wiseStatus || 'missing',
        schedule: group.tags || [],
        listingCount: (group.listingIds || []).length,
        listings: memberListings,
      });
    }

    for (const listing of allListings) {
      if (listing.groupId != null) continue;
      if (groupedListingIds.has(listing.id)) continue;
      result.push({
        type: 'listing',
        id: listing.id,
        name: listing.displayName || listing.nickname || listing.name,
        ownerEmail: listing.ownerEmail || null,
        wiseRecipientId: (listing as any).wiseRecipientId || null,
        connected: !!((listing as any).wiseRecipientId && (listing as any).wiseStatus === 'verified'),
        wiseStatus: (listing as any).wiseStatus || 'missing',
        schedule: listing.tags || [],
        listingCount: 1,
        listings: [listing],
      });
    }

    return result;
  }, [groups, allListings]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (statusFilter === 'connected') {
      filtered = filtered.filter(r => r.connected);
    } else if (statusFilter === 'not_connected') {
      filtered = filtered.filter(r => !r.connected);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === typeFilter);
    }
    return filtered;
  }, [rows, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const connected = rows.filter(r => r.connected).length;
    const notConnected = rows.filter(r => !r.connected).length;
    return { total, connected, notConnected };
  }, [rows]);

  const maskRecipientId = (id: string | null | undefined): string => {
    if (!id) return '';
    if (id.length <= 8) return id;
    return `${id.slice(0, 5)}...${id.slice(-4)}`;
  };

  const getRowKey = (row: PayoutConnectionRow) => `${row.type}-${row.id}`;

  const toggleExpand = (row: PayoutConnectionRow) => {
    const key = getRowKey(row);
    setExpandedRowId(prev => prev === key ? null : key);
  };

  // Column definitions
  const columns: ColumnDef<PayoutConnectionRow>[] = useMemo(() => [
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
        const isExpanded = expandedRowId === getRowKey(row.original);
        return (
          <button
            onClick={() => toggleExpand(row.original)}
            className={`p-1 rounded transition-colors ${isExpanded ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/30' : 'text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
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
          className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Name
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
            row.original.type === 'group' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            {row.original.type === 'group' ? (
              <FolderOpen className="w-3.5 h-3.5 text-purple-600" />
            ) : (
              <Home className="w-3.5 h-3.5 text-blue-600" />
            )}
          </div>
          <span className="font-semibold text-gray-900 dark:text-white truncate">{row.getValue('name')}</span>
        </div>
      ),
    },
    {
      id: 'type',
      accessorFn: (row) => row.type,
      size: 90,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mx-auto"
        >
          Type
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const isGroup = row.original.type === 'group';
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
            isGroup
              ? 'bg-purple-50 text-purple-700 border-purple-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            {isGroup ? 'Group' : 'Listing'}
          </span>
        );
      },
    },
    {
      id: 'ownerEmail',
      accessorFn: (row) => row.ownerEmail || '',
      size: 200,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Owner Email
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const email = row.original.ownerEmail;
        return email ? (
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate block">{email}</span>
        ) : (
          <span className="text-xs text-gray-300 dark:text-gray-600">--</span>
        );
      },
    },
    {
      id: 'schedule',
      accessorFn: (row) => (row.schedule || []).join(', '),
      size: 160,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mx-auto"
        >
          Schedule
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {(row.original.schedule || []).map((tag) => {
            const colors = tagColors[tag] || { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-200 dark:border-gray-700' };
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
      id: 'wiseRecipient',
      accessorFn: (row) => row.wiseRecipientId || '',
      size: 220,
      header: ({ column }) => (
        <div className="flex items-center gap-1 mx-auto">
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Increase Account
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <span title="External account ID from Increase for ACH payouts">
            <Info className="h-3.5 w-3.5 text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" />
          </span>
        </div>
      ),
      cell: ({ row }) => {
        const recipientId = row.original.wiseRecipientId;

        return (
          <div className="flex items-center gap-1.5 justify-center">
            {recipientId ? (
              <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300">{maskRecipientId(recipientId)}</code>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openInviteModal(row.original);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                title="Send payout setup invite to owner"
              >
                <Send className="w-3 h-3" />
                Invite Owner
              </button>
            )}
          </div>
        );
      },
    },
    {
      id: 'wiseStatus',
      accessorFn: (row) => row.connected ? 'connected' : 'not_connected',
      size: 140,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mx-auto"
        >
          Status
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const status = row.original.wiseStatus;
        const hasRecipient = !!row.original.wiseRecipientId;
        const isVerified = status === 'verified';
        const isPending = status === 'pending';
        const needsAction = status === 'requires_action';

        const statusConfig = isVerified
          ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Verified' }
          : isPending
          ? { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', label: 'Pending' }
          : needsAction
          ? { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Action Needed' }
          : hasRecipient
          ? { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-500', label: 'Connected' }
          : { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', dot: 'bg-gray-400', label: 'Not Connected' };

        return (
          <div className="flex items-center gap-1.5 justify-center">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
              {statusConfig.label}
            </span>
            {hasRecipient && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openInviteModal(row.original);
                  }}
                  className="p-1 text-gray-400 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                  title="Update bank account — send new setup link to owner"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefreshStatus(row.original);
                  }}
                  disabled={refreshingRowKey === getRowKey(row.original)}
                  className="p-1 text-gray-400 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors disabled:opacity-50"
                  title="Refresh status from Increase"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshingRowKey === getRowKey(row.original) ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDisconnect(row.original);
                  }}
                  disabled={refreshingRowKey === getRowKey(row.original)}
                  className="p-1 text-gray-400 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                  title="Disconnect payout account"
                >
                  <Unplug className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        );
      },
    },
    {
      id: 'listingCount',
      accessorFn: (row) => row.listingCount,
      size: 100,
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mx-auto"
        >
          Listings
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      ),
      cell: ({ row }) => {
        const count = row.original.listingCount;
        return (
          <div className="flex justify-center">
            <button
              onClick={() => toggleExpand(row.original)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors border border-purple-200"
            >
              <Home className="w-3 h-3" />
              {count}
            </button>
          </div>
        );
      },
    },
  ], [expandedRowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnLabels: Record<string, string> = {
    name: 'Name',
    type: 'Type',
    ownerEmail: 'Owner Email',
    schedule: 'Schedule',
    wiseRecipient: 'Increase Account',
    wiseStatus: 'Status',
    listingCount: 'Listings',
  };

  const table = useReactTable({
    data: filteredRows,
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

  if (loading || fetchError) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payout Accounts (Increase)</h2>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-400 mt-0.5">
            {fetchError ? 'Failed to load payout connections' : 'Loading payout connections...'}
          </p>
        </div>
        {fetchError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <X className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Could not load payout connections. Check your network and try again.</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-3 py-2">
            <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    {['Name', 'Type', 'Owner Email', 'Schedule', 'Increase Account', 'Status', 'Listings'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...Array(14)].map((_, i) => (
                    <tr key={i} className="border-b dark:border-gray-700 last:border-b-0">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-3 py-3">
                          <div
                            className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${j === 0 ? 'w-36' : j === 4 ? 'w-28' : 'w-20'}`}
                            style={{ animationDelay: `${i * 50 + j * 30}ms` }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              Payout Accounts (Increase)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {rows.length} total connection{rows.length !== 1 ? 's' : ''}
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

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  Status
                  <ChevronDown className="ml-1 h-3.5 w-3.5 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={statusFilter === 'all'} onCheckedChange={() => setStatusFilter('all')}>
                  All
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === 'connected'} onCheckedChange={() => setStatusFilter('connected')}>
                  Connected
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === 'not_connected'} onCheckedChange={() => setStatusFilter('not_connected')}>
                  Not Connected
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Type Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  Type
                  <ChevronDown className="ml-1 h-3.5 w-3.5 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">Filter by Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={typeFilter === 'all'} onCheckedChange={() => setTypeFilter('all')}>
                  All
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={typeFilter === 'group'} onCheckedChange={() => setTypeFilter('group')}>
                  Groups
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={typeFilter === 'listing'} onCheckedChange={() => setTypeFilter('listing')}>
                  Listings
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Column Visibility */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  <SlidersHorizontal className="mr-2 h-4 w-4 text-gray-400" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">Toggle Columns</DropdownMenuLabel>
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
                  className="w-full px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                >
                  Reset column order
                </button>
                <button
                  onClick={() => setColumnSizing({})}
                  className="w-full px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                >
                  Reset column widths
                </button>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export CSV */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-gray-200 bg-white"
              onClick={exportCSV}
              disabled={csvExporting}
            >
              <Download className="mr-2 h-4 w-4 text-gray-400" />
              {csvExporting ? 'Exporting...' : 'Export CSV'}
            </Button>

          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.total}</div>
          </div>
          <div className="flex-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 px-4 py-3">
            <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Connected</div>
            <div className="text-2xl font-bold text-emerald-700 mt-0.5">{stats.connected}</div>
          </div>
          <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Not Connected</div>
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-0.5">{stats.notConnected}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {rows.length === 0 && !globalFilter ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No connections found</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-sm">
                Create groups or add listings to see their Increase connection status here.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <Table className="w-full min-w-[1100px]" style={{ tableLayout: 'fixed' }}>
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
                    const rowData = row.original;
                    const rowKey = getRowKey(rowData);
                    const isExpanded = expandedRowId === rowKey;
                    const rowListings = rowData.listings;

                    return (
                      <React.Fragment key={row.id}>
                        <TableRow
                          className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} ${isExpanded ? 'bg-purple-50/30' : ''}`}
                          onClick={() => toggleExpand(rowData)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              style={{ width: cell.column.getSize() }}
                              className="py-2.5 px-2 text-center align-middle"
                              onClick={(e) => {
                                if (cell.column.id === 'wiseRecipient') e.stopPropagation();
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
                                    {rowData.listingCount} Listing{rowData.listingCount !== 1 ? 's' : ''}
                                    {rowData.type === 'group' ? ' in this group' : ''}
                                  </span>
                                </div>
                                {rowListings.length === 0 ? (
                                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                                    No listings found
                                  </div>
                                ) : (
                                  <div className="divide-y divide-purple-100/50">
                                    {rowListings.map((listing) => {
                                      const hasOwnRecipient = !!(listing as any).wiseRecipientId;
                                      const inheritsFromGroup = !hasOwnRecipient && rowData.type === 'group' && !!rowData.wiseRecipientId;
                                      return (
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
                                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
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
                                            {hasOwnRecipient ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                                Own ID
                                              </span>
                                            ) : inheritsFromGroup ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                                <span className="w-1 h-1 rounded-full bg-blue-500" />
                                                Via Group
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-400 border border-gray-200">
                                                <span className="w-1 h-1 rounded-full bg-gray-400" />
                                                None
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
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
                      <div className="text-gray-500">No connections match your filters.</div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      <Dialog open={inviteModalOpen} onOpenChange={(open) => { if (!open) { setInviteModalOpen(false); setInviteResult(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              Payout Setup Invite
            </DialogTitle>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                Invite link generated successfully
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invite Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteResult.inviteUrl}
                    readOnly
                    className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-600 truncate"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteResult.inviteUrl);
                      showToast('Link copied to clipboard', 'success');
                    }}
                    className="flex-shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <a
                    href={inviteResult.inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-200 bg-white px-3 hover:bg-gray-50"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-500" />
                  </a>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Send this link to the owner. They'll enter their bank details and the connection will be automatic. The link is single-use.</p>
              </div>

              <Button
                variant="outline"
                onClick={() => { setInviteModalOpen(false); setInviteResult(null); }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="text-sm text-gray-500">
                {inviteTarget?.connected
                  ? <>Generate a new setup link for <span className="font-medium text-gray-900">{inviteTarget?.name}</span> to update their bank account details. The new account will replace the current one.</>
                  : <>Generate a secure link for <span className="font-medium text-gray-900">{inviteTarget?.name}</span> to connect their bank account for Increase ACH payouts.</>
                }
              </div>

              {inviteTarget?.ownerEmail && (
                <div className="text-xs text-gray-400">
                  Owner email: <span className="font-mono">{inviteTarget.ownerEmail}</span>
                </div>
              )}

              <Button
                onClick={handleGenerateInvite}
                disabled={inviteLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {inviteLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Generating...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Generate Invite Link
                  </div>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayoutAccountsPage;
