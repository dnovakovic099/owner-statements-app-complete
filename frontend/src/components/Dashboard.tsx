import React, { useState, useEffect, useRef } from 'react';
import { Plus, AlertCircle, LogOut, Home, Search, Check, ChevronDown } from 'lucide-react';
import { dashboardAPI, statementsAPI, expensesAPI, reservationsAPI, listingsAPI } from '../services/api';
import { Owner, Property, Statement } from '../types';
import StatementsTable from './StatementsTable';
import GenerateModal from './GenerateModal';
import UploadModal from './UploadModal';
import ExpenseUpload from './ExpenseUpload';
import EditStatementModal from './EditStatementModal';
import LoadingSpinner from './LoadingSpinner';
import ListingsPage from './ListingsPage';
import ConfirmDialog from './ui/confirm-dialog';
import { useToast } from './ui/toast';

interface User {
  username: string;
}

interface DashboardProps {
  user: User | null;
  onLogout: () => void;
}

// Lightweight listing type for name lookups
interface ListingName {
  id: number;
  name: string;
  displayName?: string | null;
  nickname?: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const { showToast, updateToast } = useToast();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [listings, setListings] = useState<ListingName[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalType, setUploadModalType] = useState<'expenses' | 'reservations'>('expenses');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStatementId, setEditingStatementId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'listings'>('dashboard');
  const [regeneratingStatementId, setRegeneratingStatementId] = useState<number | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => {},
  });

  // Filter states
  const [filters, setFilters] = useState({
    ownerId: '',
    propertyId: '',
    status: '',
    startDate: '',
    endDate: '',
  });

  // Property search state
  const [propertySearch, setPropertySearch] = useState('');

  // Property dropdown state
  const [isPropertyDropdownOpen, setIsPropertyDropdownOpen] = useState(false);
  const propertyDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(event.target as Node)) {
        setIsPropertyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter properties based on search
  const filteredProperties = properties.filter((property) => {
    if (!propertySearch) return true;
    const searchLower = propertySearch.toLowerCase();
    return (
      property.name.toLowerCase().includes(searchLower) ||
      property.nickname?.toLowerCase().includes(searchLower) ||
      property.displayName?.toLowerCase().includes(searchLower) ||
      property.id.toString().includes(searchLower)
    );
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadStatements();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [ownersResponse, propertiesResponse, listingsResponse] = await Promise.all([
        dashboardAPI.getOwners(),
        dashboardAPI.getProperties(),
        listingsAPI.getListingNames(),
      ]);
      setOwners(ownersResponse);
      setProperties(propertiesResponse);
      setListings(listingsResponse.listings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStatements = async () => {
    try {
      const response = await statementsAPI.getStatements(filters);
      setStatements(response.statements);
    } catch (err) {
      console.error('Failed to load statements:', err);
    }
  };


  const handleGenerateStatement = async (data: {
    ownerId: string;
    propertyId?: string;
    tag?: string;
    startDate: string;
    endDate: string;
    calculationType: string;
  }) => {
    // Show loading toast for single statement generation
    const isBulk = data.ownerId === 'all' || (data.tag && !data.propertyId);
    const toastId = !isBulk ? showToast('Generating statement...', 'loading') : '';

    try {
      const response = await statementsAPI.generateStatement(data);

      // Check if this is a background job (bulk generation or tag-based generation)
      if (response.jobId && (data.ownerId === 'all' || (data.tag && !data.propertyId))) {
        const isTagBased = data.tag && !data.propertyId;
        const message = isTagBased
          ? `Generating statements for properties with tag "${data.tag}". This runs in the background.`
          : 'Bulk statement generation started. This runs in the background.';

        showToast(message, 'info');

        setIsGenerateModalOpen(false);
        // Refresh statements after a short delay to show any initial progress
        setTimeout(() => loadStatements(), 3000);
      }
      // Check if this was a completed bulk generation (old format, shouldn't happen anymore)
      else if (data.ownerId === 'all' && response.summary) {
        const { generated, skipped, errors } = response.summary;
        let message = `Generated ${generated} statement(s)`;
        if (skipped > 0) message += `, skipped ${skipped}`;
        if (errors > 0) message += `, ${errors} errors`;

        showToast(message, errors > 0 ? 'error' : 'success');
        setIsGenerateModalOpen(false);
        await loadStatements();
      } 
      // Single statement generation
      else {
        if (toastId) {
          updateToast(toastId, 'Statement generated successfully', 'success');
        }
        setIsGenerateModalOpen(false);
        await loadStatements();
      }
    } catch (err) {
      if (toastId) {
        updateToast(toastId, `Failed to generate statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      } else {
        showToast(`Failed to generate statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }
      throw err; // Re-throw to keep modal open on error
    }
  };

  const handleUploadCSV = async (file: File) => {
    try {
      if (uploadModalType === 'reservations') {
        const response = await reservationsAPI.uploadCSV(file);
        if (response.success) {
          showToast(response.message, 'success');
        } else {
          showToast(response.error || 'Failed to upload reservations', 'error');
        }
      } else {
        const response = await expensesAPI.uploadCSV(file);
        showToast(`CSV uploaded: ${response.processed} processed, ${response.errors} errors`, response.errors > 0 ? 'error' : 'success');
      }
      setIsUploadModalOpen(false);
      await loadInitialData();
    } catch (err) {
      showToast(`Failed to upload CSV: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  const handleDownloadReservationTemplate = async () => {
    try {
      const blob = await reservationsAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reservation_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      showToast(`Failed to download template: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  const handleStatementAction = async (id: number, action: string) => {
    try {
      if (action === 'send') {
        // Use confirm dialog for send
        setConfirmDialog({
          isOpen: true,
          title: 'Send Statement',
          message: 'Are you sure you want to send this statement?',
          type: 'info',
          onConfirm: async () => {
            try {
              await statementsAPI.updateStatementStatus(id, 'sent');
              showToast('Statement sent successfully', 'success');
              await loadStatements();
            } catch (err) {
              showToast(`Failed to send statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
            }
          },
        });
        return;
      } else if (action === 'view') {
        // Navigate to statement view in same window for debugging
        console.log('Opening view for statement:', id);
        const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
        const viewUrl = `${baseUrl}/api/statements/${id}/view`;
        console.log('View URL:', viewUrl);
        window.open(viewUrl, '_blank');
      } else if (action === 'download') {
        // Show loading toast
        const toastId = showToast('Preparing PDF download...', 'loading');

        try {
          // Download statement as PDF file using server-provided filename
          const response = await statementsAPI.downloadStatementWithHeaders(id);
          const blob = response.blob;
          const filename = response.filename || `statement-${id}.pdf`;

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          // Update toast to success
          updateToast(toastId, `Downloaded: ${filename}`, 'success');
        } catch (err) {
          updateToast(toastId, `Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
        return;
      } else if (action === 'edit') {
        setEditingStatementId(id);
        setIsEditModalOpen(true);
      } else if (action === 'refresh') {
        // Find the statement to get its parameters
        const statement = statements.find(s => s.id === id);
        if (!statement) {
          setConfirmDialog({
            isOpen: true,
            title: 'Error',
            message: 'Statement not found',
            type: 'danger',
            onConfirm: () => {},
          });
          return;
        }

        // Show confirmation dialog
        setConfirmDialog({
          isOpen: true,
          title: 'Regenerate Statement',
          message: 'Regenerate this statement with the latest data? This will replace the existing statement.',
          type: 'info',
          onConfirm: async () => {
            setRegeneratingStatementId(id);
            try {
              await statementsAPI.deleteStatement(id);
              await handleGenerateStatement({
                ownerId: statement.ownerId.toString(),
                propertyId: statement.propertyId?.toString() || '',
                startDate: statement.weekStartDate,
                endDate: statement.weekEndDate,
                calculationType: statement.calculationType || 'checkout'
              });
              await loadStatements();
            } catch (err) {
              setConfirmDialog({
                isOpen: true,
                title: 'Error',
                message: `Failed to regenerate statement: ${err instanceof Error ? err.message : 'Unknown error'}`,
                type: 'danger',
                onConfirm: () => {},
              });
            } finally {
              setRegeneratingStatementId(null);
            }
          },
        });
        return;
      } else if (action === 'delete') {
        setConfirmDialog({
          isOpen: true,
          title: 'Delete Statement',
          message: 'Are you sure you want to delete this statement? This action cannot be undone.',
          type: 'danger',
          onConfirm: async () => {
            try {
              await statementsAPI.deleteStatement(id);
              await loadStatements();
            } catch (err) {
              setConfirmDialog({
                isOpen: true,
                title: 'Error',
                message: `Failed to delete statement: ${err instanceof Error ? err.message : 'Unknown error'}`,
                type: 'danger',
                onConfirm: () => {},
              });
            }
          },
        });
        return;
      }
    } catch (err) {
      showToast(`Failed to ${action} statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
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
            <h2 className="text-lg font-semibold">Error Loading Dashboard</h2>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadInitialData}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show listings page if selected
  if (currentPage === 'listings') {
    return (
      <ListingsPage 
        onBack={() => setCurrentPage('dashboard')} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Owner Statements</h1>
              {user && (
                <p className="text-white/80 text-sm mt-1">Welcome, {user.username}</p>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setCurrentPage('listings')}
                className="flex items-center px-4 py-2 bg-green-500/20 border border-green-300/30 rounded-md hover:bg-green-500/30 transition-colors"
                title="Manage Listings"
              >
                <Home className="w-4 h-4 mr-2" />
                Listings
              </button>
              <button
                onClick={onLogout}
                className="flex items-center px-4 py-2 bg-red-500/20 border border-red-300/30 rounded-md hover:bg-red-500/30 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate Statement
            </button>
          </div>
        </div>

        {/* File Uploads */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Expense Upload */}
          <div>
            <ExpenseUpload onUploadSuccess={loadInitialData} />
          </div>

          {/* Reservation Upload */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow-md p-6 border border-purple-200">
            <h3 className="text-lg font-semibold text-purple-900 mb-2">Import Reservations</h3>
            <p className="text-sm text-purple-700 mb-4">Upload a CSV file with manual reservations</p>
            <button
              onClick={() => {
                setUploadModalType('reservations');
                setIsUploadModalOpen(true);
              }}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
            >
              Upload Reservations CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Owner</label>
              <select
                value={filters.ownerId}
                onChange={(e) => setFilters({ ...filters, ownerId: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Owners</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Property Search</label>
              <div className="space-y-2">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by property name, nickname, or ID..."
                    value={propertySearch}
                    onChange={(e) => setPropertySearch(e.target.value)}
                    className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {propertySearch && (
                    <button
                      onClick={() => setPropertySearch('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      x
                    </button>
                  )}
                </div>

                {/* Property Dropdown */}
                <div className="relative" ref={propertyDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPropertyDropdownOpen(!isPropertyDropdownOpen)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span className="text-gray-900 truncate">
                      {filters.propertyId
                        ? (() => {
                            const selected = properties.find(p => p.id.toString() === filters.propertyId);
                            return selected
                              ? `${selected.nickname || selected.displayName || selected.name} (ID: ${selected.id})`
                              : 'Select Property';
                          })()
                        : `All Properties (${filteredProperties.length})`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isPropertyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Custom Dropdown Popup */}
                  {isPropertyDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-72 overflow-y-auto">
                      {/* All Properties Option */}
                      <div
                        onClick={() => {
                          setFilters({ ...filters, propertyId: '' });
                          setIsPropertyDropdownOpen(false);
                        }}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between ${
                          !filters.propertyId ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                        }`}
                      >
                        <span className="font-medium">All Properties ({filteredProperties.length})</span>
                        {!filters.propertyId && <Check className="w-4 h-4 text-blue-600" />}
                      </div>

                      {/* Property List */}
                      {filteredProperties.map((property) => (
                        <div
                          key={property.id}
                          onClick={() => {
                            setFilters({ ...filters, propertyId: property.id.toString() });
                            setIsPropertyDropdownOpen(false);
                          }}
                          className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between border-t border-gray-100 ${
                            filters.propertyId === property.id.toString() ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                          }`}
                        >
                          <span className="truncate">
                            {property.nickname || property.displayName || property.name} (ID: {property.id})
                          </span>
                          {filters.propertyId === property.id.toString() && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="generated">Generated</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
              </select>
            </div>
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
          </div>
        </div>

        {/* Statements Table */}
        <StatementsTable statements={statements} listings={listings} onAction={handleStatementAction} regeneratingId={regeneratingStatementId} />
      </div>

      {/* Modals */}
      <GenerateModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onGenerate={handleGenerateStatement}
        owners={owners}
        properties={properties}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadCSV}
        type={uploadModalType}
        onDownloadTemplate={uploadModalType === 'reservations' ? handleDownloadReservationTemplate : undefined}
      />

      <EditStatementModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingStatementId(null);
        }}
        statementId={editingStatementId}
        onStatementUpdated={loadStatements}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText={confirmDialog.type === 'danger' ? 'Delete' : 'Confirm'}
      />
    </div>
  );
};

export default Dashboard;
