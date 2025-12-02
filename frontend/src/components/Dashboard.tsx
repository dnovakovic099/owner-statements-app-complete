import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Plus, AlertCircle, LogOut, Home, Search, Check, ChevronDown } from 'lucide-react';
import { dashboardAPI, statementsAPI, expensesAPI, reservationsAPI, listingsAPI } from '../services/api';
import { Owner, Property, Statement } from '../types';
import StatementsTable from './StatementsTable';
import LoadingSpinner from './LoadingSpinner';
import ListingsPage from './ListingsPage';
import ConfirmDialog from './ui/confirm-dialog';
import { useToast } from './ui/toast';

// Lazy load modals for better initial bundle size
const GenerateModal = lazy(() => import('./GenerateModal'));
const UploadModal = lazy(() => import('./UploadModal'));
const ExpenseUpload = lazy(() => import('./ExpenseUpload'));
const EditStatementModal = lazy(() => import('./EditStatementModal'));

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
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
    total: 0,
  });

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
    propertyIds: [] as string[], // Multi-select for combined statement generation
    status: '',
    startDate: '',
    endDate: '',
  });
  const [dateError, setDateError] = useState<string | null>(null);

  // Property search state
  const [propertySearch, setPropertySearch] = useState('');

  // Dropdown states
  const [isPropertyDropdownOpen, setIsPropertyDropdownOpen] = useState(false);
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const propertyDropdownRef = useRef<HTMLDivElement>(null);
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(event.target as Node)) {
        setIsPropertyDropdownOpen(false);
      }
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setIsOwnerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Memoize filtered properties to prevent recalculation on every render
  const filteredProperties = useMemo(() => {
    if (!propertySearch) return properties;
    const searchLower = propertySearch.toLowerCase();
    return properties.filter((property) =>
      property.name.toLowerCase().includes(searchLower) ||
      property.nickname?.toLowerCase().includes(searchLower) ||
      property.displayName?.toLowerCase().includes(searchLower) ||
      property.id.toString().includes(searchLower)
    );
  }, [properties, propertySearch]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    // Reset to first page when filters change
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [filters.ownerId, filters.propertyId, filters.propertyIds, filters.status, filters.startDate, filters.endDate]);

  useEffect(() => {
    // Validate dates before loading
    if (filters.startDate && filters.endDate && new Date(filters.startDate) > new Date(filters.endDate)) {
      setDateError('Start date must be before end date');
      return;
    }
    setDateError(null);
    loadStatements();
  }, [filters, pagination.pageIndex, pagination.pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } finally {
      setLoading(false);
    }
  };

  const loadStatements = async () => {
    try {
      const response = await statementsAPI.getStatements({
        ...filters,
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
      });
      setStatements(response.statements);
      setPagination(prev => ({ ...prev, total: response.total }));
    } catch (err) {
      // Statement loading errors are handled silently - data will be stale
    }
  };


  const handleGenerateStatement = async (data: {
    ownerId: string;
    propertyId?: string;
    propertyIds?: string[];
    tag?: string;
    startDate: string;
    endDate: string;
    calculationType: string;
  }) => {
    // No toast here - the modal has its own loading overlay

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
        // Don't close modal here - let GenerateModal handle it
      }
    } catch (err) {
      throw err; // Re-throw so GenerateModal knows there was an error
    }
  };

  // Called when GenerateModal closes after successful generation
  const handleGenerateModalClose = () => {
    setIsGenerateModalOpen(false);
    loadStatements(); // Refresh the statements list
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
        const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
        window.open(`${baseUrl}/api/statements/${id}/view`, '_blank');
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
            const toastId = showToast('Regenerating statement...', 'loading');
            try {
              await statementsAPI.deleteStatement(id);
              // Check if this is a combined statement (has propertyIds array)
              if (statement.propertyIds && statement.propertyIds.length > 0) {
                await statementsAPI.generateStatement({
                  ownerId: statement.ownerId.toString(),
                  propertyIds: statement.propertyIds.map(id => id.toString()),
                  startDate: statement.weekStartDate,
                  endDate: statement.weekEndDate,
                  calculationType: statement.calculationType || 'checkout'
                });
              } else {
                await statementsAPI.generateStatement({
                  ownerId: statement.ownerId.toString(),
                  propertyId: statement.propertyId?.toString() || '',
                  startDate: statement.weekStartDate,
                  endDate: statement.weekEndDate,
                  calculationType: statement.calculationType || 'checkout'
                });
              }
              updateToast(toastId, 'Statement regenerated successfully', 'success');
              await loadStatements();
            } catch (err) {
              updateToast(toastId, `Failed to regenerate: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
            } finally {
              setRegeneratingStatementId(null);
            }
          },
        });
        return;
      } else if (action === 'finalize') {
        setConfirmDialog({
          isOpen: true,
          title: 'Finalize Statement',
          message: 'Mark this statement as final? You can return it to draft later if needed.',
          type: 'info',
          onConfirm: async () => {
            try {
              await statementsAPI.updateStatementStatus(id, 'final');
              showToast('Statement finalized successfully', 'success');
              await loadStatements();
            } catch (err) {
              showToast(`Failed to finalize statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
            }
          },
        });
        return;
      } else if (action === 'revert-to-draft') {
        setConfirmDialog({
          isOpen: true,
          title: 'Return to Draft',
          message: 'Return this statement to draft status?',
          type: 'info',
          onConfirm: async () => {
            try {
              await statementsAPI.updateStatementStatus(id, 'draft');
              showToast('Statement returned to draft', 'success');
              await loadStatements();
            } catch (err) {
              showToast(`Failed to update statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
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

  const handleBulkAction = async (ids: number[], action: 'download' | 'regenerate') => {
    if (ids.length === 0) return;

    setBulkProcessing(true);

    if (action === 'download') {
      const toastId = showToast(`Downloading ${ids.length} statement(s)...`, 'loading');
      let successCount = 0;
      let failCount = 0;

      // Download each statement sequentially to avoid overwhelming the browser
      for (const id of ids) {
        try {
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
          successCount++;

          // Small delay between downloads to prevent browser issues
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          failCount++;
          console.error(`Failed to download statement ${id}:`, err);
        }
      }

      if (failCount === 0) {
        updateToast(toastId, `Downloaded ${successCount} statement(s)`, 'success');
      } else {
        updateToast(toastId, `Downloaded ${successCount}, failed ${failCount}`, 'error');
      }
    } else if (action === 'regenerate') {
      // Show confirmation dialog for bulk regenerate
      setConfirmDialog({
        isOpen: true,
        title: 'Regenerate Statements',
        message: `Regenerate ${ids.length} statement(s) with the latest data? This will replace the existing statements.`,
        type: 'warning',
        onConfirm: async () => {
          const toastId = showToast(`Regenerating ${ids.length} statement(s)...`, 'loading');
          let successCount = 0;
          let failCount = 0;

          for (const id of ids) {
            try {
              const statement = statements.find(s => s.id === id);
              if (!statement) {
                failCount++;
                continue;
              }

              await statementsAPI.deleteStatement(id);
              // Check if this is a combined statement (has propertyIds array)
              if (statement.propertyIds && statement.propertyIds.length > 0) {
                await statementsAPI.generateStatement({
                  ownerId: statement.ownerId.toString(),
                  propertyIds: statement.propertyIds.map(id => id.toString()),
                  startDate: statement.weekStartDate,
                  endDate: statement.weekEndDate,
                  calculationType: statement.calculationType || 'checkout'
                });
              } else {
                await statementsAPI.generateStatement({
                  ownerId: statement.ownerId.toString(),
                  propertyId: statement.propertyId?.toString() || '',
                  startDate: statement.weekStartDate,
                  endDate: statement.weekEndDate,
                  calculationType: statement.calculationType || 'checkout'
                });
              }
              successCount++;
            } catch (err) {
              failCount++;
              console.error(`Failed to regenerate statement ${id}:`, err);
            }
          }

          if (failCount === 0) {
            updateToast(toastId, `Regenerated ${successCount} statement(s)`, 'success');
          } else {
            updateToast(toastId, `Regenerated ${successCount}, failed ${failCount}`, 'error');
          }

          await loadStatements();
          setBulkProcessing(false);
        },
      });
      return; // Don't setBulkProcessing(false) here - wait for dialog action
    }

    setBulkProcessing(false);
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
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Owner Statements</h1>
              {user && (
                <p className="text-white/80 text-sm mt-1">Welcome, {user.username}</p>
              )}
            </div>
            <div className="flex space-x-2 sm:space-x-3">
              <button
                onClick={() => setCurrentPage('listings')}
                className="flex items-center px-3 sm:px-4 py-2 bg-green-500/20 border border-green-300/30 rounded-md hover:bg-green-500/30 transition-colors text-sm"
                title="Manage Listings"
              >
                <Home className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Listings</span>
              </button>
              <button
                onClick={onLogout}
                className="flex items-center px-3 sm:px-4 py-2 bg-red-500/20 border border-red-300/30 rounded-md hover:bg-red-500/30 transition-colors text-sm"
                title="Logout"
              >
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-4 py-8">

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate Statement
            </button>
          </div>
        </div>

        {/* File Uploads */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Expense Upload */}
          <Suspense fallback={<div className="bg-gray-50 rounded-lg p-6 animate-pulse h-32" />}>
            <ExpenseUpload onUploadSuccess={loadInitialData} />
          </Suspense>

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
        <div className="bg-white rounded-lg shadow-md p-4 mb-8 relative z-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[160px_1fr_auto_auto] gap-4 items-end">
            <div className="w-full">
              <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
              <div className="relative" ref={ownerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                >
                  <span className="text-gray-900 truncate">
                    {filters.ownerId ? owners.find(o => o.id.toString() === filters.ownerId)?.name || 'All Owners' : 'All Owners'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOwnerDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    <div
                      onClick={() => {
                        setFilters({ ...filters, ownerId: '' });
                        setIsOwnerDropdownOpen(false);
                      }}
                      className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center ${filters.ownerId === '' ? 'bg-blue-50' : ''}`}
                    >
                      <div className={`w-4 h-4 border rounded-full mr-3 flex items-center justify-center flex-shrink-0 ${filters.ownerId === '' ? 'border-blue-600' : 'border-gray-300'}`}>
                        {filters.ownerId === '' && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
                      </div>
                      <span className="text-sm text-gray-900">All Owners</span>
                    </div>
                    {owners.map((owner) => (
                      <div
                        key={owner.id}
                        onClick={() => {
                          setFilters({ ...filters, ownerId: owner.id.toString() });
                          setIsOwnerDropdownOpen(false);
                        }}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center ${filters.ownerId === owner.id.toString() ? 'bg-blue-50' : ''}`}
                      >
                        <div className={`w-4 h-4 border rounded-full mr-3 flex items-center justify-center flex-shrink-0 ${filters.ownerId === owner.id.toString() ? 'border-blue-600' : 'border-gray-300'}`}>
                          {filters.ownerId === owner.id.toString() && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
                        </div>
                        <span className="text-sm text-gray-900">{owner.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="w-full sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Property</label>
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

                {/* Property Dropdown - Multi-select */}
                <div className="relative" ref={propertyDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPropertyDropdownOpen(!isPropertyDropdownOpen)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span className="text-gray-900 truncate">
                      {filters.propertyIds.length > 0
                        ? `${filters.propertyIds.length} properties selected`
                        : `All Properties (${filteredProperties.length})`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isPropertyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Custom Dropdown Popup */}
                  {isPropertyDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg flex flex-col">
                      {/* Action buttons */}
                      <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0">
                        <span className="text-xs text-gray-600">
                          {filters.propertyIds.length > 0 ? `${filters.propertyIds.length} selected` : 'Select properties'}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, propertyIds: filteredProperties.map(p => p.id.toString()), propertyId: '' })}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Select All
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, propertyIds: [], propertyId: '' })}
                            className="text-xs text-gray-600 hover:text-gray-800"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Property List */}
                      <div className="max-h-60 overflow-y-auto flex-1">
                        {filteredProperties.map((property) => {
                          const isSelected = filters.propertyIds.includes(property.id.toString());
                          return (
                            <div
                              key={property.id}
                              onClick={() => {
                                const newIds = isSelected
                                  ? filters.propertyIds.filter(id => id !== property.id.toString())
                                  : [...filters.propertyIds, property.id.toString()];
                                setFilters({ ...filters, propertyIds: newIds, propertyId: newIds.length === 1 ? newIds[0] : '' });
                              }}
                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center border-b border-gray-100 last:border-b-0 ${
                                isSelected ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <span className="text-sm text-gray-900 truncate flex-1">
                                {property.nickname || property.displayName || property.name}
                              </span>
                              <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                                ID: {property.id}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Done button */}
                      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsPropertyDropdownOpen(false)}
                          className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                max={filters.endDate && filters.endDate < new Date().toISOString().split('T')[0] ? filters.endDate : new Date().toISOString().split('T')[0]}
                className={`w-full sm:w-36 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateError ? 'border-red-500' : 'border-gray-300'}`}
              />
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                min={filters.startDate || undefined}
                max={new Date().toISOString().split('T')[0]}
                className={`w-full sm:w-36 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateError ? 'border-red-500' : 'border-gray-300'}`}
              />
              {dateError && (
                <p className="text-red-500 text-xs mt-1">{dateError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Statements Table */}
        <StatementsTable
          statements={statements}
          listings={listings}
          onAction={handleStatementAction}
          onBulkAction={handleBulkAction}
          regeneratingId={regeneratingStatementId}
          bulkProcessing={bulkProcessing}
          pagination={pagination}
          onPaginationChange={(pageIndex, pageSize) => setPagination(prev => ({ ...prev, pageIndex, pageSize }))}
        />
      </div>

      {/* Modals - Lazy loaded for better initial bundle size */}
      <Suspense fallback={null}>
        {isGenerateModalOpen && (
          <GenerateModal
            isOpen={isGenerateModalOpen}
            onClose={handleGenerateModalClose}
            onGenerate={handleGenerateStatement}
            owners={owners}
            properties={properties}
          />
        )}

        {isUploadModalOpen && (
          <UploadModal
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            onUpload={handleUploadCSV}
            type={uploadModalType}
            onDownloadTemplate={uploadModalType === 'reservations' ? handleDownloadReservationTemplate : undefined}
          />
        )}

        {isEditModalOpen && (
          <EditStatementModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setEditingStatementId(null);
            }}
            statementId={editingStatementId}
            onStatementUpdated={loadStatements}
          />
        )}
      </Suspense>

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
