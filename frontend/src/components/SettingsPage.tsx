import React, { useState, useEffect } from 'react';
import {
  Users,
  Mail,
  Shield,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  UserPlus,
  Clock,
  Lock,
  Pencil,
  Activity,
  LogIn,
  FileText,
  Send,
  Download,
  Eye,
  Settings,
  Link,
  ExternalLink,
  CheckCircle
} from 'lucide-react';
import { usersAPI, activityLogAPI, User, ActivityLogEntry } from '../services/api';
import { useToast } from './ui/toast';
import ConfirmDialog from './ui/confirm-dialog';

interface SettingsPageProps {
  onBack: () => void;
  currentUserRole: string;
  currentUserEmail?: string;
  hideSidebar?: boolean;
}

// Allowed emails for Settings access
const SETTINGS_ALLOWED_EMAILS = [
  'ferdinand@luxurylodgingpm.com',
  'admin@luxurylodgingpm.com',
  'devendravariya73@gmail.com'
];

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, currentUserRole, currentUserEmail, hideSidebar = false }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'quickbooks'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // QuickBooks state
  const [qbConnected, setQbConnected] = useState(false);
  const [qbLoading, setQbLoading] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenForm, setTokenForm] = useState({
    companyId: '',
    accessToken: '',
    refreshToken: ''
  });
  const [savingTokens, setSavingTokens] = useState(false);

  // Activity log state
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [filterActions, setFilterActions] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedStartDate, setSelectedStartDate] = useState('');
  const [selectedEndDate, setSelectedEndDate] = useState('');

  // Sorting state with localStorage persistence
  const [sortField, setSortField] = useState<'date' | 'user' | 'event'>(() => {
    const stored = localStorage.getItem('activityLog_sortField');
    return (stored as 'date' | 'user' | 'event') || 'date';
  });
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
    const stored = localStorage.getItem('activityLog_sortDirection');
    return (stored as 'asc' | 'desc') || 'desc';
  });

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    username: ''
  });
  const [inviting, setInviting] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    isActive: true
  });

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger' as 'danger' | 'warning' | 'info',
    onConfirm: () => {}
  });

  useEffect(() => {
    loadUsers();
  }, []);

  // Check QuickBooks connection when tab changes
  useEffect(() => {
    if (activeTab === 'quickbooks') {
      checkQuickBooksConnection();
    }
  }, [activeTab]);

  const checkQuickBooksConnection = async () => {
    try {
      setQbLoading(true);
      const response = await fetch('/api/quickbooks/accounts', {
        headers: {
          'Authorization': 'Basic ' + btoa('LL:bnb547!')
        }
      });
      const data = await response.json();
      setQbConnected(data.success === true);
    } catch {
      setQbConnected(false);
    } finally {
      setQbLoading(false);
    }
  };

  const handleConnectQuickBooks = async () => {
    try {
      setQbLoading(true);
      const response = await fetch('/api/quickbooks/auth-url', {
        headers: {
          'Authorization': 'Basic ' + btoa('LL:bnb547!')
        }
      });
      const data = await response.json();
      if (data.success && data.authUrl) {
        window.open(data.authUrl, '_blank');
        showToast('QuickBooks authorization window opened. Complete the sign-in process.', 'info');
      } else {
        showToast('Failed to get QuickBooks auth URL', 'error');
      }
    } catch (err) {
      showToast('Failed to connect to QuickBooks', 'error');
    } finally {
      setQbLoading(false);
    }
  };

  const handleSaveTokens = async () => {
    if (!tokenForm.companyId || !tokenForm.accessToken || !tokenForm.refreshToken) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    try {
      setSavingTokens(true);
      const response = await fetch('/api/quickbooks/save-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa('LL:bnb547!')
        },
        body: JSON.stringify({
          companyId: tokenForm.companyId,
          accessToken: tokenForm.accessToken,
          refreshToken: tokenForm.refreshToken
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Tokens saved successfully! Server restart required.', 'success');
        setShowTokenModal(false);
        setTokenForm({ companyId: '', accessToken: '', refreshToken: '' });
        // Check connection after a brief delay
        setTimeout(() => checkQuickBooksConnection(), 1000);
      } else {
        showToast(data.error || 'Failed to save tokens', 'error');
      }
    } catch (err) {
      showToast('Failed to save tokens', 'error');
    } finally {
      setSavingTokens(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs();
      loadFilterOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, selectedAction, selectedStartDate, selectedEndDate]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await usersAPI.getUsers();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to manage users');
      } else {
        setError('Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    try {
      setActivityLoading(true);
      const params: any = { limit: 100 };
      if (selectedUser) params.username = selectedUser;
      if (selectedAction) params.action = selectedAction;
      if (selectedStartDate) params.startDate = selectedStartDate;
      if (selectedEndDate) params.endDate = selectedEndDate;

      const response = await activityLogAPI.getLogs(params);
      if (response.success) {
        setActivityLogs(response.logs);
        setActivityTotal(response.total);
      }
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    try {
      const response = await activityLogAPI.getFilters();
      if (response.success) {
        setFilterUsers(response.users);
        setFilterActions(response.actions);
      }
    } catch (err) {
      console.error('Failed to load filter options:', err);
    }
  };

  const clearFilters = () => {
    setSelectedUser('');
    setSelectedAction('');
    setSelectedStartDate('');
    setSelectedEndDate('');
  };

  // Handle sort change
  const handleSort = (field: 'date' | 'user' | 'event') => {
    if (sortField === field) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      localStorage.setItem('activityLog_sortDirection', newDirection);
    } else {
      setSortField(field);
      setSortDirection('desc');
      localStorage.setItem('activityLog_sortField', field);
      localStorage.setItem('activityLog_sortDirection', 'desc');
    }
  };

  // Sort the activity logs
  const sortedActivityLogs = [...activityLogs].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'date':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'user':
        comparison = (a.username || '').localeCompare(b.username || '');
        break;
      case 'event':
        comparison = a.action.localeCompare(b.action);
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LOGIN':
        return <LogIn className="w-4 h-4 text-green-600" />;
      case 'LOGIN_FAILED':
        return <LogIn className="w-4 h-4 text-red-600" />;
      case 'DELETE':
        return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'SEND_EMAIL':
        return <Send className="w-4 h-4 text-blue-600" />;
      case 'STATUS_UPDATE':
        return <FileText className="w-4 h-4 text-purple-600" />;
      case 'CREATE_STATEMENT':
        return <FileText className="w-4 h-4 text-green-600" />;
      case 'VIEW_STATEMENT':
        return <Eye className="w-4 h-4 text-blue-600" />;
      case 'DOWNLOAD_STATEMENT':
        return <Download className="w-4 h-4 text-indigo-600" />;
      case 'UPDATE_LISTING':
        return <Settings className="w-4 h-4 text-orange-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatActivityDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let relative = '';
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays < 7) relative = `${diffDays}d ago`;
    else relative = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return relative;
  };

  const getReadableAction = (action: string) => {
    const actionMap: Record<string, string> = {
      'LOGIN': 'Signed in',
      'LOGIN_FAILED': 'Failed sign in',
      'DELETE': 'Deleted',
      'SEND_EMAIL': 'Sent email',
      'STATUS_UPDATE': 'Status changed',
      'CREATE_STATEMENT': 'Created',
      'VIEW_STATEMENT': 'Viewed',
      'DOWNLOAD_STATEMENT': 'Downloaded',
      'UPDATE_LISTING': 'Updated listing',
      'SEND_TEST_ANNOUNCEMENT': 'Test email',
      'SEND_ANNOUNCEMENT': 'Announcement',
    };
    return actionMap[action] || action.replace(/_/g, ' ').toLowerCase();
  };

  const parseDetails = (details: string | null) => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  };

  const handleInviteUser = async () => {
    if (!inviteForm.email || !inviteForm.username) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    try {
      setInviting(true);
      const response = await usersAPI.inviteUser(inviteForm);
      if (response.success) {
        if (response.warning) {
          showToast(response.warning, 'info');
        } else {
          showToast('Invite sent successfully', 'success');
        }
        setIsInviteModalOpen(false);
        setInviteForm({ email: '', username: '' });
        loadUsers();
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to send invite', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (userId: number) => {
    try {
      const response = await usersAPI.resendInvite(userId);
      if (response.warning) {
        showToast(response.warning, 'info');
      } else {
        showToast('Invite resent successfully', 'success');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to resend invite', 'error');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const response = await usersAPI.updateUser(editingUser.id, editForm);
      if (response.success) {
        showToast('User updated successfully', 'success');
        setEditingUser(null);
        loadUsers();
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to update user', 'error');
    }
  };

  const handleDeleteUser = (user: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete User',
      message: `Are you sure you want to delete "${user.username}"? This action cannot be undone.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          const response = await usersAPI.deleteUser(user.id);
          if (response.success) {
            showToast('User deleted successfully', 'success');
            loadUsers();
          }
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Failed to delete user', 'error');
        }
      }
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Only specific emails can access this page
  const hasAccess = currentUserEmail && SETTINGS_ALLOWED_EMAILS.includes(currentUserEmail.toLowerCase());

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-2 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-500 text-sm mt-0.5">Access Denied</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-500">You do not have permission to access settings.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-2 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500 text-sm mt-0.5">User management and activity logs</p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
          {/* Tabs */}
          <div className="mb-4 flex space-x-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === 'users'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4 mr-2" />
              Users
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === 'activity'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Activity className="w-4 h-4 mr-2" />
              Activity Log
            </button>
            <button
              onClick={() => setActiveTab('quickbooks')}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === 'quickbooks'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Link className="w-4 h-4 mr-2" />
              QuickBooks
            </button>
          </div>

          {/* User Management Section */}
          {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center">
                <Users className="w-5 h-5 text-gray-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Users</h2>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite User
              </button>
            </div>

            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-500">Loading users...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-500">{error}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Login
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id} className={!user.isActive ? 'bg-gray-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="font-medium text-gray-900">{user.username}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.isSystemUser ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              <Shield className="w-3 h-3 mr-1" />
                              System
                            </span>
                          ) : !user.inviteAccepted ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </span>
                          ) : user.isActive ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Check className="w-3 h-3 mr-1" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <X className="w-3 h-3 mr-1" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(user.lastLogin)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            {user.isSystemUser ? (
                              <span className="inline-flex items-center px-2 py-1 text-xs text-gray-500" title="System administrator cannot be modified">
                                <Lock className="w-3 h-3 mr-1" />
                                Protected
                              </span>
                            ) : (
                              <>
                                {!user.inviteAccepted && (
                                  <button
                                    onClick={() => handleResendInvite(user.id)}
                                    className="p-1 text-yellow-600 hover:text-yellow-900 hover:bg-yellow-50 rounded"
                                    title="Resend Invite"
                                  >
                                    <Mail className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingUser(user);
                                    setEditForm({ isActive: user.isActive });
                                  }}
                                  className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
                                  title="Edit User"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user)}
                                  className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                                  title="Delete User"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                          No users found. Invite someone to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
          )}

          {/* Activity Log Section */}
          {activeTab === 'activity' && (
          <div className="space-y-4">
            {/* Filters Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Users</option>
                  {filterUsers.map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Events</option>
                  {filterActions.map(action => (
                    <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={selectedStartDate}
                    onChange={(e) => setSelectedStartDate(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={selectedEndDate}
                    onChange={(e) => setSelectedEndDate(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {(selectedUser || selectedAction || selectedStartDate || selectedEndDate) && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear filters
                  </button>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm text-gray-500">{activityTotal} activities</span>
                  <button
                    onClick={loadActivityLogs}
                    disabled={activityLoading}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${activityLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
              {/* Sort Options */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Sort by:</span>
                <div className="flex gap-1">
                  {[
                    { field: 'date' as const, label: 'Date' },
                    { field: 'user' as const, label: 'User' },
                    { field: 'event' as const, label: 'Event' },
                  ].map(({ field, label }) => (
                    <button
                      key={field}
                      onClick={() => handleSort(field)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                        sortField === field
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                      {sortField === field && (
                        <span className="text-blue-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {activityLoading ? (
                <div className="p-12 text-center">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-gray-500">Loading activity logs...</p>
                </div>
              ) : sortedActivityLogs.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No activity logs found</p>
                  <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sortedActivityLogs.map((log) => {
                    const details = parseDetails(log.details);
                    const getDetails = () => {
                      switch(log.action) {
                        case 'LOGIN': return 'Successfully logged in';
                        case 'LOGIN_FAILED': return 'Failed login attempt';
                        case 'DELETE': {
                          const name = details?.propertyName || `Statement #${log.resourceId}`;
                          const period = details?.period ? ` (${details.period})` : '';
                          return `Deleted: ${name}${period}`;
                        }
                        case 'SEND_EMAIL': {
                          const name = details?.propertyName || `Statement #${log.resourceId}`;
                          const period = details?.period ? ` (${details.period})` : '';
                          return `Sent to ${details?.recipientEmail || 'unknown'} - ${name}${period}`;
                        }
                        case 'STATUS_UPDATE': {
                          const name = details?.propertyName || `Statement #${log.resourceId}`;
                          const oldStatus = details?.oldStatus ? `${details.oldStatus} → ` : '';
                          return `${oldStatus}${details?.newStatus || 'unknown'} - ${name}`;
                        }
                        case 'CREATE_STATEMENT': {
                          const name = details?.propertyName || `Statement #${log.resourceId}`;
                          const period = details?.period ? ` (${details.period})` : '';
                          return `Created: ${name}${period}`;
                        }
                        case 'VIEW_STATEMENT': {
                          const name = details?.propertyName || `Statement #${log.resourceId}`;
                          const period = details?.period ? ` (${details.period})` : '';
                          return `Viewed: ${name}${period}`;
                        }
                        case 'DOWNLOAD_STATEMENT': {
                          const name = details?.filename || details?.propertyName || `Statement #${log.resourceId}`;
                          return `Downloaded: ${name}`;
                        }
                        case 'UPDATE_LISTING': {
                          const name = details?.listingName || `Listing #${log.resourceId}`;
                          const changes = details?.changesDetailed?.join(', ') || details?.changes?.join(', ') || 'settings';
                          return `${name} - ${changes}`;
                        }
                        case 'SEND_TEST_ANNOUNCEMENT': {
                          return `Test sent to ${details?.recipientEmail || 'unknown'}: "${details?.subject || 'Announcement'}"`;
                        }
                        case 'SEND_ANNOUNCEMENT': {
                          return `Sent to ${details?.recipientCount || 0} recipients: "${details?.subject || 'Announcement'}"`;
                        }
                        default: return `${log.resource} ${log.resourceId ? '#' + log.resourceId : ''}`;
                      }
                    };
                    return (
                      <div key={log.id} className="px-5 py-3.5 hover:bg-blue-50/50 transition-colors border-l-4 border-transparent hover:border-blue-400">
                        <div className="flex items-center gap-4">
                          {/* Action Icon */}
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                            log.action === 'LOGIN' ? 'bg-green-100' :
                            log.action === 'LOGIN_FAILED' ? 'bg-red-100' :
                            log.action === 'DELETE' ? 'bg-red-100' :
                            log.action === 'CREATE_STATEMENT' ? 'bg-emerald-100' :
                            log.action === 'SEND_EMAIL' || log.action === 'SEND_ANNOUNCEMENT' || log.action === 'SEND_TEST_ANNOUNCEMENT' ? 'bg-blue-100' :
                            log.action === 'VIEW_STATEMENT' ? 'bg-slate-100' :
                            log.action === 'DOWNLOAD_STATEMENT' ? 'bg-indigo-100' :
                            log.action === 'UPDATE_LISTING' ? 'bg-amber-100' :
                            log.action === 'STATUS_UPDATE' ? 'bg-purple-100' :
                            'bg-gray-100'
                          }`}>
                            {getActionIcon(log.action)}
                          </div>
                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{log.username || 'System'}</span>
                              <span className="text-gray-400">•</span>
                              <span className={`text-sm font-medium ${
                                log.action === 'LOGIN' ? 'text-green-700' :
                                log.action === 'LOGIN_FAILED' ? 'text-red-600' :
                                log.action === 'DELETE' ? 'text-red-600' :
                                log.action === 'CREATE_STATEMENT' ? 'text-emerald-700' :
                                log.action.includes('SEND') ? 'text-blue-700' :
                                log.action === 'DOWNLOAD_STATEMENT' ? 'text-indigo-700' :
                                log.action === 'UPDATE_LISTING' ? 'text-amber-700' :
                                log.action === 'STATUS_UPDATE' ? 'text-purple-700' :
                                'text-gray-700'
                              }`}>
                                {getReadableAction(log.action)}
                              </span>
                            </div>
                            <p className={`text-sm ${log.action === 'LOGIN_FAILED' ? 'text-red-500' : 'text-gray-500'} truncate max-w-2xl`}>
                              {getDetails()}
                            </p>
                          </div>
                          {/* Timestamp */}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-sm font-medium text-gray-400">{formatActivityDate(log.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          )}

          {/* QuickBooks Section */}
          {activeTab === 'quickbooks' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center">
              <Link className="w-5 h-5 text-gray-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">QuickBooks Integration</h2>
            </div>

            <div className="p-6">
              {qbLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-500">Checking connection status...</p>
                </div>
              ) : qbConnected ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Connected to QuickBooks</h3>
                  <p className="text-gray-500 mb-4">Your QuickBooks account is connected and ready to use.</p>
                  <button
                    onClick={checkQuickBooksConnection}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 inline mr-2" />
                    Refresh Status
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Link className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect to QuickBooks</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Connect your QuickBooks account to sync transactions, manage expenses, and streamline your accounting workflow.
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={handleConnectQuickBooks}
                      disabled={qbLoading}
                      className="inline-flex items-center px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <ExternalLink className="w-5 h-5 mr-2" />
                      Connect to QuickBooks
                    </button>
                    <div className="flex items-center gap-2 text-gray-400">
                      <div className="w-16 h-px bg-gray-300"></div>
                      <span className="text-sm">or</span>
                      <div className="w-16 h-px bg-gray-300"></div>
                    </div>
                    <button
                      onClick={() => setShowTokenModal(true)}
                      className="inline-flex items-center px-4 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Paste Tokens from Playground
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-4">
                    You'll be redirected to Intuit to authorize the connection.
                  </p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

      {/* Invite User Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Invite New User</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={inviteForm.username}
                  onChange={(e) => setInviteForm({ ...inviteForm, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="johndoe"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsInviteModalOpen(false);
                  setInviteForm({ email: '', username: '' });
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInviteUser}
                disabled={inviting}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {inviting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Invite
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit User</h2>
              <p className="text-sm text-gray-500">{editingUser.username} ({editingUser.email})</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Account Active</span>
                </label>
                <p className="text-xs text-gray-500 ml-6 mt-1">
                  Inactive users cannot log in
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Paste QuickBooks Tokens</h2>
              <p className="text-sm text-gray-500">Copy tokens from QuickBooks Playground</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Instructions:</strong> Go to{' '}
                  <a
                    href="https://developer.intuit.com/app/developer/playground"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600"
                  >
                    QuickBooks Playground
                  </a>, connect to your sandbox company, then copy the tokens from the "Get App Now" response.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company ID (realmId)
                </label>
                <input
                  type="text"
                  value={tokenForm.companyId}
                  onChange={(e) => setTokenForm({ ...tokenForm, companyId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="9341453585361979"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token
                </label>
                <textarea
                  value={tokenForm.accessToken}
                  onChange={(e) => setTokenForm({ ...tokenForm, accessToken: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs h-24 resize-none"
                  placeholder="eyJlbmMiOiJBMTI4Q0JDLUhTMjU2..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refresh Token
                </label>
                <textarea
                  value={tokenForm.refreshToken}
                  onChange={(e) => setTokenForm({ ...tokenForm, refreshToken: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs h-24 resize-none"
                  placeholder="AB11734437284aw2zOlXS1..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  setTokenForm({ companyId: '', accessToken: '', refreshToken: '' });
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTokens}
                disabled={savingTokens}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {savingTokens ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save Tokens
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="Delete"
      />
    </div>
  );
};

export default SettingsPage;
