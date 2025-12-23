import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Plus, AlertCircle, LogOut, Home, Search, Check, ChevronDown, Bell, X, Mail, Settings } from 'lucide-react';
import { dashboardAPI, statementsAPI, expensesAPI, reservationsAPI, listingsAPI, emailAPI } from '../services/api';
import { Owner, Property, Statement } from '../types';
import StatementsTable from './StatementsTable';
import LoadingSpinner from './LoadingSpinner';
import ListingsPage from './ListingsPage';
import EmailDashboard from './EmailDashboard';
import SettingsPage from './SettingsPage';
import ConfirmDialog from './ui/confirm-dialog';
import { useToast } from './ui/toast';

// Lazy load modals for better initial bundle size
const GenerateModal = lazy(() => import('./GenerateModal'));
const UploadModal = lazy(() => import('./UploadModal'));
const ExpenseUpload = lazy(() => import('./ExpenseUpload'));
const EditStatementModal = lazy(() => import('./EditStatementModal'));

interface User {
  username: string;
  role?: 'system' | 'admin' | 'editor' | 'viewer';
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
  internalNotes?: string | null;
  ownerEmail?: string | null;
  tags?: string[] | null;
}

// Newly added listing for notifications
interface NewListing {
  id: number;
  name: string;
  displayName: string;
  nickname: string | null;
  city: string | null;
  state: string | null;
  pmFeePercentage: number | null;
  createdAt: string;
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
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'listings' | 'email' | 'settings'>('dashboard');
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [regeneratingStatementId, setRegeneratingStatementId] = useState<number | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [pendingRegenerateId, setPendingRegenerateId] = useState<number | null>(null);

  // Notification states
  const [newListings, setNewListings] = useState<NewListing[]>([]);
  const [readListingIds, setReadListingIds] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('readListingNotifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [showAutoNotification, setShowAutoNotification] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Filter out read notifications
  const unreadListings = newListings.filter(l => !readListingIds.includes(l.id));

  // Mark a listing as read
  const markAsRead = (listingId: number) => {
    const newReadIds = [...readListingIds, listingId];
    setReadListingIds(newReadIds);
    localStorage.setItem('readListingNotifications', JSON.stringify(newReadIds));
  };

  // Mark all as read
  const markAllAsRead = () => {
    const allIds = newListings.map(l => l.id);
    const newReadIds = Array.from(new Set([...readListingIds, ...allIds]));
    setReadListingIds(newReadIds);
    localStorage.setItem('readListingNotifications', JSON.stringify(newReadIds));
    setIsNotificationOpen(false);
    setShowAllNotifications(false);
  };

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
    hideZeroActivity: true, // Default: hide statements with $0 revenue AND $0 payout
  });

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
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
        setShowAllNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch newly added listings, email stats, and show auto notification
  useEffect(() => {
    const fetchNewListings = async () => {
      try {
        const response = await listingsAPI.getNewlyAddedListings(7);
        if (response.success && response.listings.length > 0) {
          setNewListings(response.listings);
          // Check if there are unread listings
          const storedReadIds = localStorage.getItem('readListingNotifications');
          const readIds = storedReadIds ? JSON.parse(storedReadIds) : [];
          const hasUnread = response.listings.some(l => !readIds.includes(l.id));
          if (hasUnread) {
            // Show auto notification for 5 seconds
            setShowAutoNotification(true);
            setTimeout(() => {
              setShowAutoNotification(false);
            }, 5000);
          }
        }
      } catch (error) {
        console.error('Failed to fetch newly added listings:', error);
      }
    };
    fetchNewListings();
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
  }, [filters.ownerId, filters.propertyId, filters.propertyIds, filters.status, filters.startDate, filters.endDate, filters.hideZeroActivity]);

  useEffect(() => {
    loadStatements();
  }, [filters, pagination.pageIndex, pagination.pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle URL parameters for actions from statement view page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Handle edit action
    const editStatementId = params.get('editStatement');
    if (editStatementId) {
      const id = parseInt(editStatementId, 10);
      if (!isNaN(id)) {
        setEditingStatementId(id);
        setIsEditModalOpen(true);
        window.history.replaceState({}, '', window.location.pathname);
      }
      return;
    }

    // Handle regenerate action
    const regenerateStatementId = params.get('regenerateStatement');
    if (regenerateStatementId) {
      const id = parseInt(regenerateStatementId, 10);
      if (!isNaN(id)) {
        window.history.replaceState({}, '', window.location.pathname);
        // Set pending regenerate to be processed after statements load
        setPendingRegenerateId(id);
      }
    }
  }, []);

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
    generateCombined?: boolean;
  }) => {
    // No toast here - the modal has its own loading overlay

    try {
      const response = await statementsAPI.generateStatement(data);

      // Check if this is a background job (bulk generation or tag-based SEPARATE generation)
      // Combined tag-based statements are NOT background jobs
      const isBackgroundJob = data.ownerId === 'all' || (data.tag && !data.propertyId && !data.generateCombined);
      if (response.jobId && isBackgroundJob) {
        const isTagBased = data.tag && !data.propertyId;
        const message = isTagBased
          ? `Generating separate statements for properties with tag "${data.tag}". This runs in the background.`
          : 'Bulk statement generation started. This runs in the background.';

        const toastId = showToast(message, 'loading');

        setIsGenerateModalOpen(false);

        // Poll for job completion
        const jobId = response.jobId as string;
        const pollInterval = setInterval(async () => {
          try {
            const jobStatus = await statementsAPI.getJobStatus(jobId);

            if (jobStatus.status === 'completed') {
              clearInterval(pollInterval);
              const { generated, skipped, errors } = jobStatus.result?.summary || { generated: 0, skipped: 0, errors: 0 };
              let completionMessage = `Generated ${generated} statement(s)`;
              if (skipped > 0) completionMessage += `, skipped ${skipped}`;
              if (errors > 0) completionMessage += `, ${errors} errors`;

              updateToast(toastId, completionMessage, errors > 0 ? 'error' : 'success');
              await loadStatements();
            } else if (jobStatus.status === 'failed') {
              clearInterval(pollInterval);
              updateToast(toastId, 'Bulk generation failed', 'error');
              await loadStatements();
            } else if (jobStatus.progress) {
              // Update progress in toast
              updateToast(toastId, `Generating... ${jobStatus.progress.current}/${jobStatus.progress.total}`, 'loading');
            }
          } catch (err) {
            // If polling fails, stop and refresh anyway
            clearInterval(pollInterval);
            updateToast(toastId, 'Generation completed', 'success');
            await loadStatements();
          }
        }, 2000); // Poll every 2 seconds
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
        // Get auth token for PDF viewing
        const authData = localStorage.getItem('luxury-lodging-auth');
        const token = authData ? JSON.parse(authData).token : '';
        window.open(`${baseUrl}/api/statements/${id}/view?token=${token}`, '_blank');
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
        // Check if statement is draft before showing delete confirmation
        const statement = statements.find(s => s.id === id);
        if (statement && statement.status !== 'draft') {
          setConfirmDialog({
            isOpen: true,
            title: 'Cannot Delete',
            message: 'Cannot delete finalized statement. Please return to draft status first.',
            type: 'danger',
            onConfirm: () => {},
          });
          return;
        }
        setConfirmDialog({
          isOpen: true,
          title: 'Delete Statement',
          message: 'Are you sure you want to delete this statement? This action cannot be undone.',
          type: 'danger',
          onConfirm: async () => {
            try {
              await statementsAPI.deleteStatement(id);
              await loadStatements();
            } catch (err: unknown) {
              // Extract error message from API response
              const errorMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                || (err instanceof Error ? err.message : 'Unknown error');
              setConfirmDialog({
                isOpen: true,
                title: 'Error',
                message: `Failed to delete statement: ${errorMessage}`,
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

  // Process pending regenerate from URL parameter after statements are loaded
  useEffect(() => {
    if (pendingRegenerateId && statements.length > 0 && !loading) {
      const id = pendingRegenerateId;
      setPendingRegenerateId(null);
      handleStatementAction(id, 'refresh');
    }
  }, [pendingRegenerateId, statements, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBulkAction = async (ids: number[], action: 'download' | 'regenerate' | 'delete' | 'finalize' | 'revert-to-draft' | 'export-csv' | 'send-email') => {
    if (ids.length === 0) return;

    setBulkProcessing(true);

    if (action === 'download') {
      const toastId = showToast(`Creating ZIP with ${ids.length} statement(s)...`, 'loading');

      try {
        const response = await statementsAPI.bulkDownloadStatements(ids);
        const blob = response.blob;
        const filename = response.filename;

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        updateToast(toastId, `Downloaded ${ids.length} statement(s) as ZIP`, 'success');
      } catch (err) {
        console.error('Failed to download statements:', err);
        updateToast(toastId, 'Failed to download statements', 'error');
      }
      setBulkProcessing(false);
    } else if (action === 'delete') {
      // Filter to only draft statements - only drafts can be deleted
      const draftIds = ids.filter(id => {
        const statement = statements.find(s => s.id === id);
        return statement && statement.status === 'draft';
      });
      const skippedCount = ids.length - draftIds.length;

      if (draftIds.length === 0) {
        setConfirmDialog({
          isOpen: true,
          title: 'Cannot Delete',
          message: 'None of the selected statements can be deleted. Only draft statements can be deleted. Please return finalized statements to draft status first.',
          type: 'danger',
          onConfirm: () => {},
        });
        return;
      }

      const warningMessage = skippedCount > 0
        ? `Are you sure you want to delete ${draftIds.length} draft statement(s)? ${skippedCount} finalized statement(s) will be skipped. This action cannot be undone.`
        : `Are you sure you want to delete ${draftIds.length} statement(s)? This action cannot be undone.`;

      // Show confirmation dialog for bulk delete
      setConfirmDialog({
        isOpen: true,
        title: 'Delete Statements',
        message: warningMessage,
        type: 'danger',
        onConfirm: async () => {
          const toastId = showToast(`Deleting ${draftIds.length} statement(s)...`, 'loading');
          let successCount = 0;
          let failCount = 0;

          for (const id of draftIds) {
            try {
              await statementsAPI.deleteStatement(id);
              successCount++;
            } catch (err) {
              failCount++;
              console.error(`Failed to delete statement ${id}:`, err);
            }
          }

          if (failCount === 0) {
            updateToast(toastId, `Deleted ${successCount} statement(s)`, 'success');
          } else {
            updateToast(toastId, `Deleted ${successCount}, failed ${failCount}`, 'error');
          }

          await loadStatements();
          setBulkProcessing(false);
        },
      });
      return; // Don't setBulkProcessing(false) here - wait for dialog action
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
    } else if (action === 'finalize') {
      // Show confirmation dialog for bulk finalize
      setConfirmDialog({
        isOpen: true,
        title: 'Finalize Statements',
        message: `Mark ${ids.length} statement(s) as final?`,
        type: 'info',
        onConfirm: async () => {
          const toastId = showToast(`Finalizing ${ids.length} statement(s)...`, 'loading');
          let successCount = 0;
          let failCount = 0;

          for (const id of ids) {
            try {
              await statementsAPI.updateStatementStatus(id, 'final');
              successCount++;
            } catch (err) {
              failCount++;
              console.error(`Failed to finalize statement ${id}:`, err);
            }
          }

          if (failCount === 0) {
            updateToast(toastId, `Finalized ${successCount} statement(s)`, 'success');
          } else {
            updateToast(toastId, `Finalized ${successCount}, failed ${failCount}`, 'error');
          }

          await loadStatements();
          setBulkProcessing(false);
        },
      });
      return; // Don't setBulkProcessing(false) here - wait for dialog action
    } else if (action === 'revert-to-draft') {
      // Show confirmation dialog for bulk revert to draft
      setConfirmDialog({
        isOpen: true,
        title: 'Return to Draft',
        message: `Return ${ids.length} statement(s) to draft status?`,
        type: 'info',
        onConfirm: async () => {
          const toastId = showToast(`Returning ${ids.length} statement(s) to draft...`, 'loading');
          let successCount = 0;
          let failCount = 0;

          for (const id of ids) {
            try {
              await statementsAPI.updateStatementStatus(id, 'draft');
              successCount++;
            } catch (err) {
              failCount++;
              console.error(`Failed to revert statement ${id} to draft:`, err);
            }
          }

          if (failCount === 0) {
            updateToast(toastId, `Returned ${successCount} statement(s) to draft`, 'success');
          } else {
            updateToast(toastId, `Reverted ${successCount}, failed ${failCount}`, 'error');
          }

          await loadStatements();
          setBulkProcessing(false);
        },
      });
      return; // Don't setBulkProcessing(false) here - wait for dialog action
    } else if (action === 'export-csv') {
      // Export selected statements to CSV
      const selectedStatements = statements.filter(s => ids.includes(s.id));

      // Debug: Log listings to check if internalNotes are present
      console.log('Listings with internalNotes:', listings.filter(l => l.internalNotes).map(l => ({ id: l.id, nickname: l.nickname, internalNotes: l.internalNotes })));
      console.log('Selected statements propertyIds:', selectedStatements.map(s => ({ id: s.id, propertyId: s.propertyId, propertyIds: s.propertyIds, propertyName: s.propertyName })));

      // Build CSV content
      const csvRows: string[] = [];
      csvRows.push(['Property Name', 'Period', 'Type', 'Net Payout', 'Internal Note'].join(','));

      // Helper to escape CSV values
      const escapeCSV = (value: string | null | undefined): string => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        // If contains comma, quotes, or newlines, wrap in quotes and escape internal quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      // Helper to get display name for a property
      const getPropertyDisplayName = (propertyId: number): string => {
        const listing = listings.find(l => l.id === propertyId);
        if (listing) {
          return listing.nickname || listing.displayName || listing.name;
        }
        return `Property ${propertyId}`;
      };

      // Helper to get internal note for a property
      const getPropertyInternalNote = (propertyId: number): string => {
        const listing = listings.find(l => l.id === propertyId);
        return listing?.internalNotes || '';
      };

      // Format date
      const formatDate = (dateStr: string): string => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };

      for (const statement of selectedStatements) {
        // Get property names (all if multiple)
        let propertyNames: string[] = [];
        if (statement.propertyIds && statement.propertyIds.length > 0) {
          propertyNames = statement.propertyIds.map(id => getPropertyDisplayName(id));
        } else if (statement.propertyId) {
          propertyNames = [getPropertyDisplayName(statement.propertyId)];
        } else {
          propertyNames = [statement.propertyName];
        }

        // Get period
        const period = `${formatDate(statement.weekStartDate)} - ${formatDate(statement.weekEndDate)}`;

        // Get type
        const type = statement.calculationType === 'calendar' ? 'Calendar' : 'Checkout';

        // Get net payout - format as currency (ensure it's a number)
        const payoutValue = typeof statement.ownerPayout === 'string'
          ? parseFloat(statement.ownerPayout)
          : statement.ownerPayout;
        const netPayout = `$${(payoutValue || 0).toFixed(2)}`;

        // Get internal notes (all if multiple properties)
        let internalNotes: string[] = [];
        if (statement.propertyIds && statement.propertyIds.length > 0) {
          for (const propId of statement.propertyIds) {
            const note = getPropertyInternalNote(propId);
            if (note) {
              const displayName = getPropertyDisplayName(propId);
              internalNotes.push(`[${displayName}]: ${note}`);
            }
          }
        } else if (statement.propertyId) {
          const note = getPropertyInternalNote(statement.propertyId);
          if (note) {
            internalNotes = [note];
          }
        }

        // Add row
        csvRows.push([
          escapeCSV(propertyNames.join('; ')),
          escapeCSV(period),
          escapeCSV(type),
          escapeCSV(netPayout),
          escapeCSV(internalNotes.join(' | '))
        ].join(','));
      }

      // Create and download file
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0];
      a.download = `statements-export-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast(`Exported ${selectedStatements.length} statement(s) to CSV`, 'success');
      setBulkProcessing(false);
      return;
    } else if (action === 'send-email') {
      // Send emails to owners for selected statements
      const selectedStatements = statements.filter(s => ids.includes(s.id));
      const toastId = showToast(`Sending ${selectedStatements.length} email(s)...`, 'loading');

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const statement of selectedStatements) {
        try {
          let ownerEmail: string | null = null;
          let frequencyTag = 'MONTHLY';

          // For multi-property statements, check all listings have same email
          console.log('[SendEmail] Statement:', statement.id, 'propertyId:', statement.propertyId, 'propertyIds:', statement.propertyIds);
          if (statement.propertyIds && statement.propertyIds.length > 0) {
            const statementListings = statement.propertyIds
              .map(pid => listings.find(l => l.id === pid))
              .filter(Boolean);

            const emails = statementListings
              .map(l => l?.ownerEmail)
              .filter(Boolean) as string[];

            const uniqueEmails = Array.from(new Set(emails));

            if (uniqueEmails.length === 0) {
              // No emails found
              skipped++;
              await emailAPI.logFailedEmail({
                statementId: statement.id,
                propertyId: statement.propertyId,
                propertyName: statement.propertyName,
                ownerName: statement.ownerName,
                reason: 'No email address configured for owner',
                errorCode: 'NO_EMAIL'
              });
              continue;
            } else if (uniqueEmails.length > 1) {
              // Multiple different emails - flag it
              skipped++;
              await emailAPI.logFailedEmail({
                statementId: statement.id,
                propertyId: statement.propertyId,
                propertyName: statement.propertyName,
                ownerName: statement.ownerName,
                reason: `Multiple different owner emails found: ${uniqueEmails.join(', ')}`,
                errorCode: 'MULTIPLE_EMAILS'
              });
              continue;
            }

            ownerEmail = uniqueEmails[0];
            // Get frequency tag from first listing (match weekly/monthly pattern)
            const firstListing = statementListings[0];
            frequencyTag = firstListing?.tags?.find(t => /weekly|monthly/i.test(t)) || 'MONTHLY';
          } else {
            // Single property statement
            const listing = listings.find(l => l.id === statement.propertyId);
            console.log('[SendEmail] Single property - Found listing:', listing?.id, 'ownerEmail:', listing?.ownerEmail);

            if (!listing?.ownerEmail) {
              skipped++;
              await emailAPI.logFailedEmail({
                statementId: statement.id,
                propertyId: statement.propertyId,
                propertyName: statement.propertyName,
                ownerName: statement.ownerName,
                reason: 'No email address configured for owner',
                errorCode: 'NO_EMAIL'
              });
              continue;
            }

            ownerEmail = listing.ownerEmail;
            frequencyTag = listing.tags?.find(t => /weekly|monthly/i.test(t)) || 'MONTHLY';
          }

          if (!ownerEmail) {
            skipped++;
            continue;
          }

          // Send email via API
          const response = await emailAPI.sendStatementEmail(statement.id, ownerEmail, frequencyTag);

          if (response.success) {
            sent++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Failed to send email for statement ${statement.id}:`, error);
          failed++;
        }
      }

      if (sent > 0) {
        updateToast(toastId, `Sent ${sent} email(s)${skipped > 0 ? `, ${skipped} skipped (no owner email)` : ''}${failed > 0 ? `, ${failed} failed` : ''}`, 'success');
      } else if (skipped > 0) {
        updateToast(toastId, `${skipped} statement(s) skipped - no owner email configured`, 'error');
      } else {
        updateToast(toastId, `Failed to send emails`, 'error');
      }

      // Refresh statements to update status
      await loadStatements();
      setBulkProcessing(false);
      return;
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
        onBack={() => {
          setCurrentPage('dashboard');
          setSelectedListingId(null);
        }}
        initialSelectedListingId={selectedListingId}
        newListings={newListings}
        readListingIds={readListingIds}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onOpenEmailDashboard={() => setCurrentPage('email')}
      />
    );
  }

  // Show email dashboard if selected
  if (currentPage === 'email') {
    return (
      <EmailDashboard
        onBack={() => setCurrentPage('dashboard')}
      />
    );
  }

  // Show settings page if selected
  if (currentPage === 'settings') {
    return (
      <SettingsPage
        onBack={() => setCurrentPage('dashboard')}
        currentUserRole={user?.role || 'admin'}
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
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Notification Bell */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="relative flex items-center justify-center w-10 h-10 bg-yellow-500/20 border border-yellow-300/30 rounded-md hover:bg-yellow-500/30 transition-colors"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadListings.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-bold">
                      {unreadListings.length > 9 ? '9+' : unreadListings.length}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {isNotificationOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">New Listings</h3>
                        <span className="text-xs text-gray-500">{unreadListings.length} unread of {newListings.length}</span>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {newListings.length === 0 ? (
                        <div className="px-4 py-6 text-center text-gray-500">
                          No new listings
                        </div>
                      ) : (
                        (showAllNotifications ? newListings : newListings.slice(0, 5)).map((listing) => {
                          const isRead = readListingIds.includes(listing.id);
                          return (
                            <div
                              key={listing.id}
                              className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${isRead ? 'bg-gray-50/50' : 'bg-white'}`}
                            >
                              <div className="flex items-start justify-between">
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => {
                                    setSelectedListingId(listing.id);
                                    setCurrentPage('listings');
                                    setIsNotificationOpen(false);
                                    setShowAllNotifications(false);
                                    if (!isRead) markAsRead(listing.id);
                                  }}
                                >
                                  <p className={`font-medium truncate ${isRead ? 'text-gray-500' : 'text-gray-900'}`}>
                                    {listing.displayName}
                                  </p>
                                  <p className={`text-sm truncate ${isRead ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {listing.city}{listing.state ? `, ${listing.state}` : ''}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    Added {new Date(listing.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="ml-2 flex flex-col items-end gap-1">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isRead ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-800'}`}>
                                    {listing.pmFeePercentage || 15}% PM
                                  </span>
                                  {!isRead && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markAsRead(listing.id);
                                      }}
                                      className="text-xs text-gray-400 hover:text-blue-600"
                                    >
                                      Mark read
                                    </button>
                                  )}
                                  {isRead && (
                                    <span className="text-xs text-gray-400">Read</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    {newListings.length > 0 && (
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                        {unreadListings.length > 0 ? (
                          <button
                            onClick={markAllAsRead}
                            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                          >
                            Mark all read
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">All read</span>
                        )}
                        {newListings.length > 5 && (
                          <button
                            onClick={() => setShowAllNotifications(!showAllNotifications)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {showAllNotifications ? 'Show Less' : `View All (${newListings.length})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setCurrentPage('email')}
                className="flex items-center justify-center w-10 h-10 bg-blue-500/20 border border-blue-300/30 rounded-md hover:bg-blue-500/30 transition-colors"
                title="Email Dashboard"
              >
                <Mail className="w-5 h-5" />
              </button>

              {(user?.role === 'system' || user?.role === 'admin') && (
                <button
                  onClick={() => setCurrentPage('settings')}
                  className="flex items-center justify-center w-10 h-10 bg-gray-500/20 border border-gray-300/30 rounded-md hover:bg-gray-500/30 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}

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

      {/* Auto-show notification for most recent listing (appears for 5 seconds) */}
      {showAutoNotification && unreadListings.length > 0 && (
        <div className="fixed top-20 right-4 z-50 notification-slide-in">
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-80 overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center text-white">
                <Bell className="w-4 h-4 mr-2" />
                <span className="font-medium text-sm">New Listing Added</span>
              </div>
              <button
                onClick={() => setShowAutoNotification(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="font-medium text-gray-900">{unreadListings[0].displayName}</p>
              <p className="text-sm text-gray-500">
                {unreadListings[0].city}{unreadListings[0].state ? `, ${unreadListings[0].state}` : ''}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">
                  Added {new Date(unreadListings[0].createdAt).toLocaleDateString()}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  {unreadListings[0].pmFeePercentage || 15}% PM Fee
                </span>
              </div>
              <div className="flex items-center mt-2">
                <button
                  onClick={() => {
                    setSelectedListingId(unreadListings[0].id);
                    setCurrentPage('listings');
                    setShowAutoNotification(false);
                    markAsRead(unreadListings[0].id);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Property
                </button>
                {unreadListings.length > 1 && (
                  <button
                    onClick={() => {
                      setShowAutoNotification(false);
                      setIsNotificationOpen(true);
                    }}
                    className="ml-3 text-sm text-gray-500 hover:text-gray-700 font-medium"
                  >
                    +{unreadListings.length - 1} more
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                className="w-full sm:w-36 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full sm:w-36 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {/* Hide $0 Activity Toggle */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hideZeroActivity}
                onChange={(e) => setFilters({ ...filters, hideZeroActivity: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-600">Hide $0 activity statements</span>
              <span className="ml-1 text-xs text-gray-400">(no revenue & no payout)</span>
            </label>
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
        onClose={() => {
          setConfirmDialog({ ...confirmDialog, isOpen: false });
          setBulkProcessing(false);
        }}
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
