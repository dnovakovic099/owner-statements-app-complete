import React, { useState, useEffect } from 'react';
import { Filter, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { quickBooksAPI } from '../services/api';
import { QuickBooksTransaction, QuickBooksAccount, QuickBooksDepartment, Property, Listing } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface TransactionsPageProps {
  onBack: () => void;
}

const TransactionsPage: React.FC<TransactionsPageProps> = ({ onBack }) => {
  const [transactions, setTransactions] = useState<QuickBooksTransaction[]>([]);
  const [accounts, setAccounts] = useState<QuickBooksAccount[]>([]);
  const [departments, setDepartments] = useState<QuickBooksDepartment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState<string | null>(null);

  // Filter states
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    accountType: '',
    showUncategorized: true,
    showCategorized: true,
  });

  // Categorization modal state
  const [categorizationModal, setCategorizationModal] = useState<{
    isOpen: boolean;
    transaction: QuickBooksTransaction | null;
  }>({
    isOpen: false,
    transaction: null,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [accountsResponse, departmentsResponse, propertiesResponse, listingsResponse] = await Promise.all([
        quickBooksAPI.getAccounts(),
        quickBooksAPI.getDepartments(),
        quickBooksAPI.getProperties(),
        quickBooksAPI.getListings(),
      ]);

      setAccounts(accountsResponse.data);
      setDepartments(departmentsResponse.data);
      setProperties(propertiesResponse.data);
      setListings(listingsResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load initial data');
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await quickBooksAPI.getTransactions({
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        accountType: filters.accountType || undefined,
      });

      setTransactions(response.data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    }
  };

  const handleCategorizeTransaction = async (transactionId: string, propertyId: string, listingId: string, department: string) => {
    try {
      setCategorizing(transactionId);
      await quickBooksAPI.categorizeTransaction(transactionId, { propertyId, listingId, department });
      
      // Update the transaction in the local state
      setTransactions(prev => prev.map(t => 
        t.id === transactionId 
          ? { ...t, propertyId, listingId, department, categorized: true }
          : t
      ));
      
      setCategorizationModal({ isOpen: false, transaction: null });
      alert('✅ Transaction categorized successfully');
    } catch (err) {
      alert(`❌ Failed to categorize transaction: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCategorizing(null);
    }
  };

  const openCategorizationModal = (transaction: QuickBooksTransaction) => {
    setCategorizationModal({ isOpen: true, transaction });
  };

  const filteredTransactions = transactions.filter(transaction => {
    if (filters.showUncategorized && filters.showCategorized) {
      return true;
    }
    if (filters.showUncategorized && !transaction.categorized) {
      return true;
    }
    if (filters.showCategorized && transaction.categorized) {
      return true;
    }
    return false;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="flex items-center text-red-600 mb-4">
            <AlertCircle className="w-6 h-6 mr-2" />
            <h2 className="text-lg font-semibold">Error Loading Transactions</h2>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="flex space-x-3">
            <button
              onClick={loadInitialData}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={onBack}
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">💰 QuickBooks Transactions</h1>
              <p className="text-white/80 text-sm mt-1">Categorize transactions by property and department</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={loadTransactions}
                className="flex items-center px-4 py-2 bg-white/20 border border-white/30 rounded-md hover:bg-white/30 transition-colors"
                title="Refresh Transactions"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
              <button
                onClick={onBack}
                className="flex items-center px-4 py-2 bg-red-500/20 border border-red-300/30 rounded-md hover:bg-red-500/30 transition-colors"
                title="Back to Dashboard"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center mb-4">
            <Filter className="w-5 h-5 mr-2 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
              <select
                value={filters.accountType}
                onChange={(e) => setFilters({ ...filters, accountType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Account Types</option>
                {Array.from(new Set(accounts.map(a => a.AccountType))).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Show</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.showUncategorized}
                    onChange={(e) => setFilters({ ...filters, showUncategorized: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Uncategorized</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.showCategorized}
                    onChange={(e) => setFilters({ ...filters, showCategorized: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Categorized</span>
                </label>
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ startDate: '', endDate: '', accountType: '', showUncategorized: true, showCategorized: true })}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Transactions ({filteredTransactions.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Listing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(transaction.date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {transaction.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.account}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(transaction.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.propertyId ? (
                        (() => {
                          const property = properties.find(p => p.id.toString() === transaction.propertyId);
                          return property ? (property.nickname || property.name) : 'Unknown';
                        })()
                      ) : (
                        <span className="text-gray-400">Not categorized</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.listingId ? (
                        (() => {
                          const listing = listings.find(l => l.id.toString() === transaction.listingId);
                          return listing ? (listing.nickname || listing.name) : 'Unknown';
                        })()
                      ) : (
                        <span className="text-gray-400">Not categorized</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.department || (
                        <span className="text-gray-400">Not categorized</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {transaction.categorized ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Categorized
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Uncategorized
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openCategorizationModal(transaction)}
                        disabled={categorizing === transaction.id}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {categorizing === transaction.id ? 'Categorizing...' : 'Categorize'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Categorization Modal */}
      {categorizationModal.isOpen && categorizationModal.transaction && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Categorize Transaction
              </h3>
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  <strong>Description:</strong> {categorizationModal.transaction.description}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Amount:</strong> {formatCurrency(categorizationModal.transaction.amount)}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Date:</strong> {formatDate(categorizationModal.transaction.date)}
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Property
                  </label>
                  <select
                    id="property-select"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} (ID: {property.id})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Listing
                  </label>
                  <select
                    id="listing-select"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a listing (optional)</option>
                    {listings.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.nickname || listing.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department
                  </label>
                  <select
                    id="department-select"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a department</option>
                    {departments.map((department) => (
                      <option key={department.Name} value={department.Name}>
                        {department.Name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setCategorizationModal({ isOpen: false, transaction: null })}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const propertySelect = document.getElementById('property-select') as HTMLSelectElement;
                    const listingSelect = document.getElementById('listing-select') as HTMLSelectElement;
                    const departmentSelect = document.getElementById('department-select') as HTMLSelectElement;
                    
                    if (!propertySelect.value || !departmentSelect.value) {
                      alert('Please select both property and department');
                      return;
                    }
                    
                    handleCategorizeTransaction(
                      categorizationModal.transaction!.id,
                      propertySelect.value,
                      listingSelect.value,
                      departmentSelect.value
                    );
                  }}
                  disabled={categorizing === categorizationModal.transaction.id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {categorizing === categorizationModal.transaction.id ? 'Categorizing...' : 'Categorize'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsPage;

