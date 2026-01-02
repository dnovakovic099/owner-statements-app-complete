import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Database,
  TrendingUp,
  DollarSign,
  Tag,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Input } from '../ui/input';
import LoadingSpinner from '../LoadingSpinner';
import { quickBooksAPI } from '../../services/api';
import { QuickBooksTransaction, Property, Listing } from '../../types';

interface CategoryMapping {
  qbCategory: string;
  internalCategory: string | null;
  transactionCount: number;
  totalAmount: number;
}

interface SyncStatus {
  lastSyncedAt: string | null;
  isSyncing: boolean;
  error: string | null;
  syncedCount: number;
}

interface QuickBooksViewProps {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

const QuickBooksView: React.FC<QuickBooksViewProps> = ({ dateRange }) => {
  // State management
  const [transactions, setTransactions] = useState<QuickBooksTransaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: null,
    isSyncing: false,
    error: null,
    syncedCount: 0,
  });

  // Filters
  const [selectedQBCategory, setSelectedQBCategory] = useState<string>('');
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
  const [expandedMappings, setExpandedMappings] = useState(false);

  // QB Category filter options
  const QB_CATEGORIES = [
    'Darko Distribution',
    'Owner Payout',
    'Arbitrage Acquisition',
    'Operating Expenses',
    'Marketing & Advertising',
    'Maintenance & Repairs',
    'Utilities',
    'Insurance',
    'Property Management',
    'Cleaning Services',
    'Guest Supplies',
  ];

  // Internal category mapping options
  const INTERNAL_CATEGORIES = [
    'Revenue',
    'Owner Distributions',
    'Property Acquisition',
    'Utilities',
    'Maintenance',
    'Cleaning',
    'Supplies',
    'Marketing',
    'Insurance',
    'Management Fees',
    'Other Operating',
  ];

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [txnResponse, propsResponse, listingsResponse] = await Promise.all([
        quickBooksAPI.getTransactions({
          startDate: dateRange?.startDate,
          endDate: dateRange?.endDate,
        }),
        quickBooksAPI.getProperties(),
        quickBooksAPI.getListings(),
      ]);

      setTransactions(txnResponse.data || []);
      setProperties(propsResponse.data || []);
      setListings(listingsResponse.data || []);

      // Set last sync time
      setSyncStatus((prev) => ({
        ...prev,
        lastSyncedAt: new Date().toISOString(),
        syncedCount: txnResponse.count || 0,
      }));
    } catch (error: any) {
      console.error('Failed to fetch QuickBooks data:', error);
      setSyncStatus((prev) => ({
        ...prev,
        error: error.message || 'Failed to fetch data',
      }));
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle sync
  const handleSync = async () => {
    setSyncStatus((prev) => ({ ...prev, isSyncing: true, error: null }));
    try {
      await fetchData();
      setSyncStatus((prev) => ({ ...prev, isSyncing: false }));
    } catch (error: any) {
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error.message || 'Sync failed',
      }));
    }
  };

  // Handle transaction categorization
  const handleCategorizeTransaction = async (
    transactionId: string,
    propertyId: string,
    department: string
  ) => {
    try {
      await quickBooksAPI.categorizeTransaction(transactionId, {
        propertyId,
        department,
      });

      // Update local state
      setTransactions((prev) =>
        prev.map((txn) =>
          txn.id === transactionId
            ? { ...txn, propertyId, department, categorized: true }
            : txn
        )
      );
    } catch (error) {
      console.error('Failed to categorize transaction:', error);
    }
  };

  // Calculate category mappings
  const categoryMappings: CategoryMapping[] = React.useMemo(() => {
    const mappingMap = new Map<string, CategoryMapping>();

    transactions.forEach((txn) => {
      const qbCat = txn.account || 'Uncategorized';
      if (!mappingMap.has(qbCat)) {
        mappingMap.set(qbCat, {
          qbCategory: qbCat,
          internalCategory: txn.department || null,
          transactionCount: 0,
          totalAmount: 0,
        });
      }
      const mapping = mappingMap.get(qbCat)!;
      mapping.transactionCount++;
      mapping.totalAmount += txn.amount;
    });

    return Array.from(mappingMap.values()).sort(
      (a, b) => b.transactionCount - a.transactionCount
    );
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = React.useMemo(() => {
    return transactions.filter((txn) => {
      const matchesCategory =
        !selectedQBCategory || txn.account === selectedQBCategory;
      const matchesProperty =
        !selectedProperty || txn.propertyId === selectedProperty;
      const matchesSearch =
        !searchTerm ||
        txn.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        txn.account.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesUnmapped =
        !showUnmappedOnly || !txn.categorized;

      return matchesCategory && matchesProperty && matchesSearch && matchesUnmapped;
    });
  }, [transactions, selectedQBCategory, selectedProperty, searchTerm, showUnmappedOnly]);

  // Calculate stats
  const stats = React.useMemo(() => {
    const unmappedCount = transactions.filter((txn) => !txn.categorized).length;
    const categoriesInUse = new Set(
      transactions.filter((txn) => txn.department).map((txn) => txn.department)
    ).size;

    return {
      totalTransactions: transactions.length,
      unmappedTransactions: unmappedCount,
      categoriesInUse,
      totalAmount: transactions.reduce((sum, txn) => sum + txn.amount, 0),
    };
  }, [transactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <Database className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                QuickBooks Integration
              </h2>
              <p className="text-sm text-gray-500">
                Map and manage QuickBooks transactions
              </p>
            </div>
          </div>
          <Button
            onClick={handleSync}
            disabled={syncStatus.isSyncing}
            variant="outline"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${
                syncStatus.isSyncing ? 'animate-spin' : ''
              }`}
            />
            {syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>

        {/* Sync Status */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              Last sync: {formatDateTime(syncStatus.lastSyncedAt)}
            </span>
          </div>
          {syncStatus.error && (
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" />
              <span>{syncStatus.error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Synced */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">
              Total Transactions
            </h4>
            <CheckCircle className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.totalTransactions.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatCurrency(stats.totalAmount)} total
          </p>
        </div>

        {/* Unmapped Transactions */}
        <div
          className={`bg-white rounded-lg shadow-md p-6 border-2 ${
            stats.unmappedTransactions > 0
              ? 'border-orange-300'
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">
              Unmapped Transactions
            </h4>
            {stats.unmappedTransactions > 0 ? (
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
          </div>
          <p
            className={`text-3xl font-bold ${
              stats.unmappedTransactions > 0 ? 'text-orange-600' : 'text-green-600'
            }`}
          >
            {stats.unmappedTransactions.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.unmappedTransactions > 0 ? 'Needs attention' : 'All mapped'}
          </p>
        </div>

        {/* Categories in Use */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">
              Categories in Use
            </h4>
            <Tag className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.categoriesInUse}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            of {INTERNAL_CATEGORIES.length} available
          </p>
        </div>

        {/* QB Categories */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">QB Categories</h4>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {categoryMappings.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Unique QB accounts</p>
        </div>
      </div>

      {/* Category Mapping Interface */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div
          className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50"
          onClick={() => setExpandedMappings(!expandedMappings)}
        >
          <div className="flex items-center gap-3">
            <ArrowRight className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">
              Category Mapping
            </h3>
            <span className="text-sm text-gray-500">
              ({categoryMappings.length} QB categories)
            </span>
          </div>
          {expandedMappings ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>

        {expandedMappings && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryMappings.map((mapping) => (
                <div
                  key={mapping.qbCategory}
                  className={`p-4 rounded-lg border-2 ${
                    mapping.internalCategory
                      ? 'border-green-200 bg-green-50'
                      : 'border-orange-200 bg-orange-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {mapping.qbCategory}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {mapping.transactionCount} transactions •{' '}
                        {formatCurrency(mapping.totalAmount)}
                      </p>
                    </div>
                    {mapping.internalCategory ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 ml-2" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 ml-2" />
                    )}
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      Internal Category
                    </label>
                    <select
                      value={mapping.internalCategory || ''}
                      onChange={(e) => {
                        // This would trigger a batch update API call
                        console.log(
                          `Map ${mapping.qbCategory} to ${e.target.value}`
                        );
                      }}
                      className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select Category --</option>
                      {INTERNAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {categoryMappings.filter((m) => !m.internalCategory).length > 0 && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700">
                  <p className="font-semibold text-orange-900 mb-1">
                    Action Required
                  </p>
                  <p>
                    {categoryMappings.filter((m) => !m.internalCategory).length}{' '}
                    QB categories need to be mapped to internal categories. Map
                    them above to ensure accurate financial reporting.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-8"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* QB Category Filter */}
          <select
            value={selectedQBCategory}
            onChange={(e) => setSelectedQBCategory(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All QB Categories</option>
            {categoryMappings.map((mapping) => (
              <option key={mapping.qbCategory} value={mapping.qbCategory}>
                {mapping.qbCategory} ({mapping.transactionCount})
              </option>
            ))}
          </select>

          {/* Property Filter */}
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Properties</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id.toString()}>
                {prop.name}
              </option>
            ))}
          </select>

          {/* Show Unmapped Only */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showUnmappedOnly"
              checked={showUnmappedOnly}
              onChange={(e) => setShowUnmappedOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor="showUnmappedOnly"
              className="text-sm font-medium text-gray-700 cursor-pointer"
            >
              Unmapped only
            </label>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Transactions
          </h3>
          <span className="text-sm text-gray-500">
            Showing {filteredTransactions.length} of {transactions.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead className="w-[250px]">Description</TableHead>
                <TableHead className="w-[120px]">Amount</TableHead>
                <TableHead className="w-[150px]">QB Category</TableHead>
                <TableHead className="w-[150px]">Mapped Property</TableHead>
                <TableHead className="w-[150px]">Home Category</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-sm text-gray-600">
                      {formatDate(txn.date)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {txn.description}
                    </TableCell>
                    <TableCell
                      className={`text-sm font-semibold ${
                        txn.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(txn.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3 h-3 text-gray-400" />
                        {txn.account || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {txn.propertyId ? (
                        <span className="text-sm text-gray-900">
                          {
                            properties.find(
                              (p) => p.id.toString() === txn.propertyId
                            )?.name
                          }
                        </span>
                      ) : (
                        <select
                          onChange={(e) =>
                            handleCategorizeTransaction(
                              txn.id,
                              e.target.value,
                              txn.department || ''
                            )
                          }
                          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Map Property --</option>
                          {properties.map((prop) => (
                            <option key={prop.id} value={prop.id.toString()}>
                              {prop.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                    <TableCell>
                      {txn.department ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {txn.department}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Unmapped
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {txn.categorized ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs">Mapped</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-orange-600">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs">Pending</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-gray-500 py-8"
                  >
                    No transactions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default QuickBooksView;
