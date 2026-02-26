import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Plus, AlertCircle, Search, Check, ChevronDown, Upload } from 'lucide-react';
import { dashboardAPI, statementsAPI, expensesAPI, reservationsAPI, listingsAPI, emailAPI, payoutsAPI } from '../services/api';
import { Owner, Property, Statement } from '../types';
import StatementsTable from './StatementsTable';
import LoadingSpinner from './LoadingSpinner';
import ListingsPage from './ListingsPage';
import EmailDashboard from './EmailDashboard';
import SettingsPage from './SettingsPage';
import ConfirmDialog from './ui/confirm-dialog';
import { useToast } from './ui/toast';
import { Layout } from './Layout';

// Lazy load modals for better initial bundle size
const GenerateModal = lazy(() => import('./GenerateModal'));
const UploadModal = lazy(() => import('./UploadModal'));
const EditStatementModal = lazy(() => import('./EditStatementModal'));
// const FinancialDashboard = lazy(() => import('./FinancialDashboard/FinancialDashboard'));
const AnalyticsDashboard = lazy(() => import('./Analytics/AnalyticsDashboard'));
const GroupsPage = lazy(() => import('./GroupsPage'));
const StripePage = lazy(() => import('./StripePage'));

interface User {
  username: string;
  email?: string;
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
  stripeAccountId?: string | null;
  stripeOnboardingStatus?: 'missing' | 'pending' | 'verified' | 'requires_action';
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
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'listings' | 'groups' | 'stripe' | 'email' | 'settings' | 'financials' | 'analytics'>('dashboard');
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
  };

  // Calculate dynamic page size based on viewport height
  const getDynamicPageSize = () => {
    const vh = window.innerHeight;
    // header ~50px, filters ~50px, table header+toolbar ~100px, pagination ~50px, padding ~30px
    const overhead = 280;
    const rowHeight = 35;
    const rows = Math.max(10, Math.floor((vh - overhead) / rowHeight));
    return rows;
  };

  // Pagination state
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: getDynamicPageSize(),
    total: 0,
  });

  // Recalculate page size on window resize
  useEffect(() => {
    const handleResize = () => {
      const newSize = getDynamicPageSize();
      setPagination(prev => {
        if (prev.pageSize !== newSize) {
          return { ...prev, pageSize: newSize, pageIndex: 0 };
        }
        return prev;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
    showCancelButton?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => { },
    showCancelButton: true,
    confirmText: undefined,
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
    search: '', // Search by propertyName, groupName, or ownerName
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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch newly added listings and email stats
  useEffect(() => {
    const fetchNewListings = async () => {
      try {
        const response = await listingsAPI.getNewlyAddedListings(7);
        if (response.success && response.listings.length > 0) {
          setNewListings(response.listings);
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

      // Fetch cancelled reservation counts in background (non-blocking)
      if (response.statements.length > 0) {
        const statementIds = response.statements.map((s: Statement) => s.id);
        statementsAPI.getCancelledCounts(statementIds).then(({ counts }) => {
          setStatements(prev => prev.map(stmt => ({
            ...stmt,
            cancelledReservationCount: counts[stmt.id] || 0
          })));
        }).catch(() => {
          // Silently fail - cancelled counts are optional
        });
      }
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
        const viewWindow = window.open('', '_blank');
        if (!viewWindow) {
          showToast('Please allow pop-ups to view the statement', 'error');
          return;
        }

        try {
          const html = await statementsAPI.viewStatementHtml(id);
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          viewWindow.location.href = url;

          // Revoke the object URL after the window loads to avoid leaks
          viewWindow.addEventListener('load', () => {
            URL.revokeObjectURL(url);
          });
        } catch (err) {
          viewWindow.close();
          showToast(`Failed to open statement: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
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
            onConfirm: () => { },
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
            onConfirm: () => { },
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
                onConfirm: () => { },
              });
            }
          },
        });
        return;
      } else if (action === 'pay-owner') {
        // Find the statement to get its info
        const statement = statements.find(s => s.id === id);
        if (!statement) {
          showToast('Statement not found', 'error');
          return;
        }

        if (statement.ownerPayout === 0) {
          showToast('No payout amount to transfer', 'error');
          return;
        }

        const payoutStatus = (statement as any).payoutStatus;
        if (payoutStatus === 'paid' || payoutStatus === 'collected') {
          showToast('This statement has already been settled', 'error');
          return;
        }

        // Check if listing has a connected Stripe account
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        if (listingId) {
          const listing = listings.find(l => l.id === listingId);
          if (!listing?.stripeAccountId) {
            showToast('No Stripe account connected for this listing. Add a Stripe Account ID in Listings settings.', 'error');
            return;
          }
          if (listing.stripeOnboardingStatus === 'requires_action' || listing.stripeOnboardingStatus === 'pending') {
            showToast('Stripe account is not yet enabled. The owner needs to complete Stripe onboarding.', 'error');
            return;
          }
        }

        const payoutAmount = Number(statement.ownerPayout) || 0;

        if (payoutAmount > 0) {
          // Positive payout — send money to owner
          const stripeFee = Math.round(payoutAmount * 0.0025 * 100) / 100; // 0.25%
          const totalTransfer = payoutAmount + stripeFee;
          setConfirmDialog({
            isOpen: true,
            title: 'Pay Owner via Stripe',
            message: `Transfer to ${statement.ownerName || 'owner'}?\n\nOwner Payout: $${payoutAmount.toFixed(2)}\nStripe Fee (0.25%): $${stripeFee.toFixed(2)}\nTotal Transfer: $${totalTransfer.toFixed(2)}`,
            type: 'info',
            onConfirm: async () => {
              const toastId = showToast('Processing Stripe transfer...', 'loading');
              try {
                const response = await payoutsAPI.transferToOwner(id);
                if (response.success) {
                  const actualTotal = response.totalTransferAmount || totalTransfer;
                  updateToast(toastId, `Payment of $${actualTotal.toFixed(2)} sent successfully!`, 'success');
                  await loadStatements();
                } else {
                  updateToast(toastId, response.error || 'Transfer failed', 'error');
                }
              } catch (err: any) {
                const errorMessage = err?.response?.data?.error || err?.message || 'Transfer failed';
                updateToast(toastId, errorMessage, 'error');
              }
            },
          });
        } else {
          // Negative payout — collect money from owner via Stripe
          const collectAmount = Math.abs(payoutAmount);
          setConfirmDialog({
            isOpen: true,
            title: 'Collect from Owner via Stripe',
            message: `Owner ${statement.ownerName || ''} owes $${collectAmount.toFixed(2)} for this statement.\n\nCollect $${collectAmount.toFixed(2)} from their connected Stripe account?`,
            type: 'warning',
            confirmText: 'Collect',
            onConfirm: async () => {
              const toastId = showToast('Collecting payment via Stripe...', 'loading');
              try {
                const response = await payoutsAPI.collectFromOwner(id);
                if (response.success) {
                  updateToast(toastId, `Collected $${collectAmount.toFixed(2)} from owner`, 'success');
                  await loadStatements();
                } else {
                  updateToast(toastId, response.error || 'Collection failed', 'error');
                }
              } catch (err: any) {
                const errorMessage = err?.response?.data?.error || err?.message || 'Collection failed';
                updateToast(toastId, errorMessage, 'error');
              }
            },
          });
        }
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

  const handleBulkAction = async (ids: number[], action: 'download' | 'regenerate' | 'delete' | 'finalize' | 'revert-to-draft' | 'export-csv' | 'send-email' | 'pay-owner') => {
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
          type: 'info',
          onConfirm: () => { },
          showCancelButton: false,
          confirmText: 'OK',
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
    } else if (action === 'pay-owner') {
      const selectedStatements = statements.filter(s => ids.includes(s.id));

      // Filter for valid payouts (must have positive payout, not already paid, and have Stripe account)
      const validPayouts = selectedStatements.filter(s => {
        if (s.ownerPayout <= 0 || (s as any).payoutStatus === 'paid') return false;
        const lid = s.propertyId || (s.propertyIds && s.propertyIds[0]);
        if (!lid) return false;
        const listing = listings.find(l => l.id === lid);
        if (!listing?.stripeAccountId) return false;
        if (listing.stripeOnboardingStatus === 'requires_action' || listing.stripeOnboardingStatus === 'pending') return false;
        return true;
      });

      const noStripeCount = selectedStatements.filter(s => {
        const lid = s.propertyId || (s.propertyIds && s.propertyIds[0]);
        const listing = lid ? listings.find(l => l.id === lid) : null;
        return !listing?.stripeAccountId || listing?.stripeOnboardingStatus === 'requires_action' || listing?.stripeOnboardingStatus === 'pending';
      }).length;

      const skippedCount = selectedStatements.length - validPayouts.length;

      if (validPayouts.length === 0) {
        setConfirmDialog({
          isOpen: true,
          title: 'No Statements to Pay',
          message: skippedCount > 0
            ? `None of the selected statements can be paid. They may have $0 payout, are already paid, or have no Stripe account connected.`
            : 'No statements selected.',
          type: 'info',
          onConfirm: () => { },
          showCancelButton: false,
          confirmText: 'OK',
        });
        setBulkProcessing(false);
        return;
      }

      const totalAmount = validPayouts.reduce((sum, s) => sum + s.ownerPayout, 0);

      const message = `Are you sure you want to pay ${validPayouts.length} owners via Stripe?\n\n` +
        `Total Payout: $${totalAmount.toFixed(2)}\n\n` +
        (skippedCount > 0 ? `(${skippedCount} skipped` + (noStripeCount > 0 ? `, ${noStripeCount} without Stripe` : '') + ` - $0, already paid, or no Stripe)` : '');

      setConfirmDialog({
        isOpen: true,
        title: 'Bulk Pay Owners',
        message: message,
        type: 'info',
        onConfirm: async () => {
          const toastId = showToast(`Processing ${validPayouts.length} payments...`, 'loading');
          let successCount = 0;
          let failCount = 0;

          for (const statement of validPayouts) {
            try {
              const response = await payoutsAPI.transferToOwner(statement.id);
              if (response.success) {
                successCount++;
              } else {
                failCount++;
                console.error(`Failed to pay statement ${statement.id}:`, response.error);
              }
            } catch (err: any) {
              failCount++;
              console.error(`Failed to pay statement ${statement.id}:`, err);
            }
          }

          if (failCount === 0) {
            updateToast(toastId, `Successfully paid ${successCount} owners`, 'success');
          } else {
            updateToast(toastId, `Paid ${successCount} owners, failed ${failCount}`, 'error');
          }

          await loadStatements();
          setBulkProcessing(false);
        },
      });
      return; // Wait for dialog
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

  // Handle notification click from sidebar
  const handleNotificationClick = (listing: NewListing) => {
    setSelectedListingId(listing.id);
    setCurrentPage('listings');
    markAsRead(listing.id);
  };

  // Render content based on current page
  const renderContent = () => {
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
          hideSidebar={true}
        />
      );
    }

    if (currentPage === 'groups') {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <GroupsPage />
        </Suspense>
      );
    }

    if (currentPage === 'stripe') {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <StripePage />
        </Suspense>
      );
    }

    if (currentPage === 'email') {
      return (
        <EmailDashboard
          onBack={() => setCurrentPage('dashboard')}
          hideSidebar={true}
        />
      );
    }

    if (currentPage === 'settings') {
      return (
        <SettingsPage
          onBack={() => setCurrentPage('dashboard')}
          currentUserRole={user?.role || 'admin'}
          currentUserEmail={user?.email || ''}
          hideSidebar={true}
        />
      );
    }

    // if (currentPage === 'financials') {
    //   return (
    //     <Suspense fallback={<LoadingSpinner />}>
    //       <FinancialDashboard
    //         onBack={() => setCurrentPage('dashboard')}
    //       />
    //     </Suspense>
    //   );
    // }

    if (currentPage === 'analytics') {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <AnalyticsDashboard
            onBack={() => setCurrentPage('dashboard')}
          />
        </Suspense>
      );
    }

    // Dashboard content
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Page Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-2 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-500 text-sm mt-0.5">Manage owner statements and view activity</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setUploadModalType('expenses');
                  setIsUploadModalOpen(true);
                }}
                className="flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm whitespace-nowrap"
              >
                <Upload className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Upload Expenses</span>
              </button>
              <button
                onClick={() => {
                  setUploadModalType('reservations');
                  setIsUploadModalOpen(true);
                }}
                className="flex items-center px-3 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium text-sm whitespace-nowrap"
              >
                <Upload className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Import Reservations</span>
              </button>
              <button
                onClick={() => setIsGenerateModalOpen(true)}
                className="flex items-center px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Generate Statement</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-4">

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-md px-3 py-2 mb-4 relative z-20 flex-shrink-0">
            <div className="flex flex-wrap items-end gap-3">
              {/* Owner */}
              <div className="min-w-[160px] w-[22%]">
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Owner</label>
                <div className="relative" ref={ownerDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm text-left bg-white flex items-center justify-between transition-all duration-150 ${isOwnerDropdownOpen ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : 'border-gray-300 hover:border-gray-400'}`}
                  >
                    <span className={`truncate ${filters.ownerId ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                      {filters.ownerId ? owners.find(o => o.id.toString() === filters.ownerId)?.name || 'All Owners' : 'All Owners'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform duration-200 ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOwnerDropdownOpen && (
                    <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="max-h-[480px] overflow-y-auto py-1">
                        <div
                          onClick={() => {
                            setFilters({ ...filters, ownerId: '' });
                            setIsOwnerDropdownOpen(false);
                          }}
                          className={`mx-1 px-3 py-2 cursor-pointer rounded-lg flex items-center transition-colors duration-100 ${filters.ownerId === '' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                        >
                          <div className={`w-4 h-4 border-2 rounded-full mr-3 flex items-center justify-center flex-shrink-0 transition-colors ${filters.ownerId === '' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                            {filters.ownerId === '' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                          <span className="text-sm font-medium">All Owners</span>
                        </div>
                        {owners.map((owner) => (
                          <div
                            key={owner.id}
                            onClick={() => {
                              setFilters({ ...filters, ownerId: owner.id.toString() });
                              setIsOwnerDropdownOpen(false);
                            }}
                            className={`mx-1 px-3 py-2 cursor-pointer rounded-lg flex items-center transition-colors duration-100 ${filters.ownerId === owner.id.toString() ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                          >
                            <div className={`w-4 h-4 border-2 rounded-full mr-3 flex items-center justify-center flex-shrink-0 transition-colors ${filters.ownerId === owner.id.toString() ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                              {filters.ownerId === owner.id.toString() && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                            <span className="text-sm">{owner.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Property */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Property</label>
                <div className="relative" ref={propertyDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPropertyDropdownOpen(!isPropertyDropdownOpen)}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm text-left bg-white flex items-center justify-between transition-all duration-150 ${isPropertyDropdownOpen ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : 'border-gray-300 hover:border-gray-400'}`}
                  >
                    <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mr-2" />
                    <span className={`truncate flex-1 ${filters.propertyIds.length > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                      {filters.propertyIds.length > 0
                        ? `${filters.propertyIds.length} properties selected`
                        : `All Properties (${filteredProperties.length})`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform duration-200 ${isPropertyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Combined Search + Dropdown Popup */}
                  {isPropertyDropdownOpen && (
                    <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* Search input inside dropdown */}
                      <div className="px-3 pt-3 pb-2 flex-shrink-0">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <input
                            type="text"
                            placeholder="Search properties..."
                            value={propertySearch}
                            onChange={(e) => setPropertySearch(e.target.value)}
                            className="w-full border border-gray-200 bg-gray-50 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:bg-white transition-colors"
                            autoFocus
                          />
                          {propertySearch && (
                            <button
                              onClick={() => setPropertySearch('')}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                            >
                              <span className="text-xs leading-none">&times;</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="px-3 py-1.5 flex justify-between items-center flex-shrink-0 border-b border-gray-100">
                        <span className="text-xs text-gray-500">
                          {filters.propertyIds.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{filters.propertyIds.length}</span>
                              selected
                            </span>
                          ) : 'Select properties'}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, propertyIds: filteredProperties.map(p => p.id.toString()), propertyId: '' })}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, propertyIds: [], propertyId: '' })}
                            className="text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded-md transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Property List */}
                      <div className="max-h-[480px] overflow-y-auto flex-1 py-1">
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
                              className={`mx-1 px-3 py-2 cursor-pointer rounded-lg flex items-center transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                              <div className={`w-4 h-4 border-2 rounded flex items-center justify-center flex-shrink-0 transition-all duration-150 ${isSelected ? 'bg-blue-500 border-blue-500 shadow-sm' : 'border-gray-300'}`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <span className={`text-sm truncate flex-1 ml-3 ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                                {property.nickname || property.displayName || property.name}
                              </span>
                              <span className="text-[11px] text-gray-400 ml-2 flex-shrink-0 tabular-nums">
                                {property.id}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Done button */}
                      <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/80 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { setIsPropertyDropdownOpen(false); setPropertySearch(''); }}
                          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Start Date */}
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* End Date */}
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Hide $0 Toggle */}
              <div className="flex-shrink-0 flex items-center pb-1">
                <label className="inline-flex items-center cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={filters.hideZeroActivity}
                    onChange={(e) => setFilters({ ...filters, hideZeroActivity: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-1.5 text-xs text-gray-600">Hide $0</span>
                </label>
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
            onSearchChange={(search) => {
              setFilters(prev => ({ ...prev, search }));
              setPagination(prev => ({ ...prev, pageIndex: 0 })); // Reset to first page on search
            }}
            initialSearch={filters.search}
          />
        </div>
      </div>
    );
  };

  // Main render with Layout wrapper
  return (
    <Layout
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      user={user}
      onLogout={onLogout}
      newListings={newListings}
      unreadCount={unreadListings.length}
      onMarkAsRead={markAsRead}
      onMarkAllAsRead={markAllAsRead}
      onNotificationClick={handleNotificationClick}
      readListingIds={readListingIds}
    >
      {renderContent()}

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
        confirmText={confirmDialog.confirmText || (confirmDialog.type === 'danger' ? 'Delete' : 'Confirm')}
        showCancelButton={confirmDialog.showCancelButton !== false}
      />
    </Layout>
  );
};

export default Dashboard;
