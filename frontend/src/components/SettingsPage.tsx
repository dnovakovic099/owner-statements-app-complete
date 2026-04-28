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
  Calendar,
  Play,
  Pause,
  CalendarDays,
  Plus,
  ChevronDown,
  Database,
  CheckCircle,
  XCircle,
  HardDrive,
  Save,
  Power
} from 'lucide-react';
import { usersAPI, activityLogAPI, appLogsAPI, backupAPI, User, ActivityLogEntry } from '../services/api';
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
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'appLogs' | 'backup'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Custom dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Activity log state
  const ACTIVITY_PAGE_SIZE = 50;
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
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

  // Application logs state
  const [appLogs, setAppLogs] = useState<any[]>([]);
  const [appLogsLoading, setAppLogsLoading] = useState(false);
  const [appLogsTotal, setAppLogsTotal] = useState(0);
  const [appLogsLevel, setAppLogsLevel] = useState('');
  const [appLogsOffset, setAppLogsOffset] = useState(0);

  // Backup state
  const BACKUP_HISTORY_PAGE_SIZE = 25;
  const [backupStatus, setBackupStatus] = useState<any>(null);
  const [backupFiles, setBackupFiles] = useState<any[]>([]);
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [backupHistoryPage, setBackupHistoryPage] = useState(0);
  const [backupNextScheduled, setBackupNextScheduled] = useState<any>(null);
  const [backupDiskUsage, setBackupDiskUsage] = useState<any>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupTriggering, setBackupTriggering] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState<string | null>(null);
  const [backupConfig, setBackupConfig] = useState<any>(null);
  const [backupConfigDraft, setBackupConfigDraft] = useState<any>(null);
  const [backupConfigSaving, setBackupConfigSaving] = useState(false);

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

  // Load app logs / backup when tab changes
  useEffect(() => {
    if (activeTab === 'appLogs') {
      loadAppLogs();
    }
    if (activeTab === 'backup') {
      loadBackupStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadAppLogs = async (offset = 0, level = appLogsLevel) => {
    setAppLogsLoading(true);
    try {
      const params: any = { limit: 50, offset };
      if (level) params.level = level;
      const data = await appLogsAPI.getLogs(params);
      setAppLogs(data.logs || []);
      setAppLogsTotal(data.total || 0);
      setAppLogsOffset(offset);
    } catch (err) {
      showToast('Failed to load application logs', 'error');
    }
    setAppLogsLoading(false);
  };

  // Backup functions
  const loadBackupStatus = async () => {
    setBackupLoading(true);
    try {
      const [statusData, configData] = await Promise.all([
        backupAPI.getStatus(),
        backupAPI.getConfig()
      ]);
      setBackupStatus(statusData.status);
      setBackupFiles(statusData.localFiles || []);
      setBackupHistory(statusData.history || []);
      setBackupNextScheduled(statusData.nextScheduled);
      setBackupDiskUsage(statusData.diskUsage);
      if (configData.config) {
        setBackupConfig(configData.config);
        setBackupConfigDraft(configData.config);
      }
    } catch (err) {
      showToast('Failed to load backup status', 'error');
    }
    setBackupLoading(false);
  };

  const saveBackupConfig = async () => {
    if (!backupConfigDraft) return;
    setBackupConfigSaving(true);
    try {
      const result = await backupAPI.updateConfig(backupConfigDraft);
      setBackupConfig(result.config);
      setBackupConfigDraft(result.config);
      showToast('Backup configuration saved', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to save config', 'error');
    }
    setBackupConfigSaving(false);
  };

  const triggerBackup = async () => {
    setBackupTriggering(true);
    try {
      await backupAPI.trigger();
      showToast('Backup triggered successfully', 'success');
      loadBackupStatus();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Backup failed', 'error');
    }
    setBackupTriggering(false);
  };

  const downloadBackup = async (filename: string) => {
    setBackupDownloading(filename);
    try {
      await backupAPI.download(filename);
      showToast('Download started', 'success');
    } catch (err) {
      showToast('Download failed', 'error');
    }
    setBackupDownloading(null);
  };

  // Schedule management functions
  const getAuthHeaders = (): Record<string, string> => {
    const authData = localStorage.getItem('luxury-lodging-auth');
    if (authData) {
      const { token } = JSON.parse(authData);
      return { 'Authorization': `Bearer ${token}` };
    }
    return {};
  };

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs(0);
      loadFilterOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'activity') {
      // Reset to first page when filters change
      loadActivityLogs(0);
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

  const loadActivityLogs = async (offset: number = activityOffset) => {
    try {
      setActivityLoading(true);
      const params: any = { limit: ACTIVITY_PAGE_SIZE, offset };
      if (selectedUser) params.username = selectedUser;
      if (selectedAction) params.action = selectedAction;
      if (selectedStartDate) params.startDate = selectedStartDate;
      if (selectedEndDate) params.endDate = selectedEndDate;

      const response = await activityLogAPI.getLogs(params);
      if (response.success) {
        setActivityLogs(response.logs);
        setActivityTotal(response.total);
        setActivityOffset(offset);
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
      case 'AUTO_GENERATE':
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
      'AUTO_GENERATE': 'Auto-generated',
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
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-800 overflow-hidden">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 pt-2 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Access Denied</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Access Denied</h2>
              <p className="text-gray-500 dark:text-gray-400">You do not have permission to access settings.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-800 overflow-hidden">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 pt-2 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">User management, activity logs, and system status</p>
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
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Activity className="w-4 h-4 mr-2" />
              Activity Log
            </button>
            <button
              onClick={() => setActiveTab('appLogs')}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === 'appLogs'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Application Logs
            </button>
            <button
              onClick={() => setActiveTab('backup')}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === 'backup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Database className="w-4 h-4 mr-2" />
              Backup
            </button>
          </div>

          {/* User Management Section */}
          {activeTab === 'users' && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center">
                <Users className="w-5 h-5 text-gray-600 dark:text-gray-400 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Users</h2>
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
                <RefreshCw className="w-8 h-8 text-gray-400 dark:text-gray-500 animate-spin mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Loading users...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-500">{error}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Last Login
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {users.map((user) => (
                      <tr key={user.id} className={!user.isActive ? 'bg-gray-50 dark:bg-gray-800' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{user.username}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.lastLogin)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            {user.isSystemUser ? (
                              <span className="inline-flex items-center px-2 py-1 text-xs text-gray-500 dark:text-gray-400" title="System administrator cannot be modified">
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
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
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
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Users</option>
                  {filterUsers.map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-gray-400 dark:text-gray-500">to</span>
                  <input
                    type="date"
                    value={selectedEndDate}
                    onChange={(e) => setSelectedEndDate(e.target.value)}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  <span className="text-sm text-gray-500 dark:text-gray-400">{activityTotal.toLocaleString()} activities</span>
                  <button
                    onClick={() => loadActivityLogs(activityOffset)}
                    disabled={activityLoading}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${activityLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
              {/* Sort Options */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sort by:</span>
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
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {activityLoading ? (
                <div className="p-12 text-center">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">Loading activity logs...</p>
                </div>
              ) : sortedActivityLogs.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No activity logs found</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sortedActivityLogs.map((log) => {
                    const details = parseDetails(log.details);
                    // Resolve property/group name from any available detail field
                    const getStatementName = () => details?.propertyName || details?.groupName || details?.listingName || `Statement #${log.resourceId}`;
                    const getPeriod = () => {
                      const p = details?.period || (details?.startDate && details?.endDate ? `${details.startDate} to ${details.endDate}` : null);
                      return p ? ` (${p})` : '';
                    };
                    const getDetails = () => {
                      switch(log.action) {
                        case 'LOGIN': return 'Successfully logged in';
                        case 'LOGIN_FAILED': return 'Failed login attempt';
                        case 'DELETE': {
                          return `Deleted: ${getStatementName()}${getPeriod()}`;
                        }
                        case 'SEND_EMAIL': {
                          return `Sent to ${details?.recipientEmail || 'unknown'} - ${getStatementName()}${getPeriod()}`;
                        }
                        case 'STATUS_UPDATE': {
                          const oldStatus = details?.oldStatus ? `${details.oldStatus} → ` : '';
                          return `${oldStatus}${details?.newStatus || 'unknown'} - ${getStatementName()}`;
                        }
                        case 'CREATE_STATEMENT': {
                          return `Created: ${getStatementName()}${getPeriod()}`;
                        }
                        case 'VIEW_STATEMENT': {
                          return `Viewed: ${getStatementName()}${getPeriod()}`;
                        }
                        case 'DOWNLOAD_STATEMENT': {
                          const name = details?.filename || details?.propertyName || details?.groupName || details?.listingName || `Statement #${log.resourceId}`;
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
                        case 'AUTO_GENERATE': {
                          return `Auto-generated: ${getStatementName()}${getPeriod()}`;
                        }
                        default: return `${log.resource} ${log.resourceId ? '#' + log.resourceId : ''}`;
                      }
                    };
                    return (
                      <div key={log.id} className="px-5 py-3.5 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors border-l-4 border-transparent hover:border-blue-400">
                        <div className="flex items-center gap-4">
                          {/* Action Icon */}
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                            log.action === 'LOGIN' ? 'bg-green-100' :
                            log.action === 'LOGIN_FAILED' ? 'bg-red-100' :
                            log.action === 'DELETE' ? 'bg-red-100' :
                            log.action === 'CREATE_STATEMENT' || log.action === 'AUTO_GENERATE' ? 'bg-emerald-100' :
                            log.action === 'SEND_EMAIL' || log.action === 'SEND_ANNOUNCEMENT' || log.action === 'SEND_TEST_ANNOUNCEMENT' ? 'bg-blue-100' :
                            log.action === 'VIEW_STATEMENT' ? 'bg-slate-100' :
                            log.action === 'DOWNLOAD_STATEMENT' ? 'bg-indigo-100' :
                            log.action === 'UPDATE_LISTING' ? 'bg-amber-100' :
                            log.action === 'STATUS_UPDATE' ? 'bg-purple-100' :
                            'bg-gray-100 dark:bg-gray-800'
                          }`}>
                            {getActionIcon(log.action)}
                          </div>
                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900 dark:text-white">{log.username || 'System'}</span>
                              <span className="text-gray-400 dark:text-gray-500">•</span>
                              <span className={`text-sm font-medium ${
                                log.action === 'LOGIN' ? 'text-green-700' :
                                log.action === 'LOGIN_FAILED' ? 'text-red-600' :
                                log.action === 'DELETE' ? 'text-red-600' :
                                log.action === 'CREATE_STATEMENT' || log.action === 'AUTO_GENERATE' ? 'text-emerald-700' :
                                log.action.includes('SEND') ? 'text-blue-700' :
                                log.action === 'DOWNLOAD_STATEMENT' ? 'text-indigo-700' :
                                log.action === 'UPDATE_LISTING' ? 'text-amber-700' :
                                log.action === 'STATUS_UPDATE' ? 'text-purple-700' :
                                'text-gray-700 dark:text-gray-300'
                              }`}>
                                {getReadableAction(log.action)}
                              </span>
                            </div>
                            <p className={`text-sm ${log.action === 'LOGIN_FAILED' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} truncate max-w-2xl`}>
                              {getDetails()}
                            </p>
                          </div>
                          {/* Timestamp */}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-sm font-medium text-gray-400 dark:text-gray-500">{formatActivityDate(log.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Pagination */}
              {activityTotal > ACTIVITY_PAGE_SIZE && (
                <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {activityTotal === 0 ? 0 : activityOffset + 1}–{Math.min(activityOffset + ACTIVITY_PAGE_SIZE, activityTotal)} of {activityTotal}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={activityOffset === 0 || activityLoading}
                      onClick={() => loadActivityLogs(Math.max(0, activityOffset - ACTIVITY_PAGE_SIZE))}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      Previous
                    </button>
                    <button
                      disabled={activityOffset + ACTIVITY_PAGE_SIZE >= activityTotal || activityLoading}
                      onClick={() => loadActivityLogs(activityOffset + ACTIVITY_PAGE_SIZE)}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

      {/* Application Logs Tab */}
      {activeTab === 'appLogs' && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-gray-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Application Logs</h2>
              <span className="ml-3 text-sm text-gray-500">{appLogsTotal} entries (3-day retention)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {[
                  { value: '', label: 'All Levels' },
                  { value: 'error', label: 'Error' },
                  { value: 'warn', label: 'Warning' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setAppLogsLevel(opt.value); loadAppLogs(0, opt.value); }}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      appLogsLevel === opt.value
                        ? 'bg-white text-gray-900 shadow-sm font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => loadAppLogs(0, appLogsLevel)}
                className="flex items-center px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </button>
            </div>
          </div>

          {appLogsLoading ? (
            <div className="p-8 text-center text-gray-500">Loading logs...</div>
          ) : appLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No application logs found</p>
              <p className="text-xs mt-1">Error and warning logs appear here automatically</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {appLogs.map((log: any) => {
                  const meta = typeof log.metadata === 'string' ? (() => { try { return JSON.parse(log.metadata); } catch { return null; } })() : log.metadata;
                  const ts = new Date(log.timestamp);
                  const timeStr = ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <div key={log.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`flex-shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          log.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {log.level}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 break-words">{log.message}</p>
                          {log.context && (
                            <span className="text-xs text-gray-400 mr-2">[{log.context}]</span>
                          )}
                          {meta && (
                            <details className="mt-1">
                              <summary className="text-xs text-blue-600 cursor-pointer hover:underline">Details</summary>
                              <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-32 text-gray-600">
                                {JSON.stringify(meta, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">{timeStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Pagination */}
              {appLogsTotal > 50 && (
                <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Showing {appLogsOffset + 1}–{Math.min(appLogsOffset + 50, appLogsTotal)} of {appLogsTotal}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={appLogsOffset === 0}
                      onClick={() => loadAppLogs(Math.max(0, appLogsOffset - 50))}
                      className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      disabled={appLogsOffset + 50 >= appLogsTotal}
                      onClick={() => loadAppLogs(appLogsOffset + 50)}
                      className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* Backup Section */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center">
                <Database className="w-5 h-5 text-gray-600 dark:text-gray-400 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Database Backup</h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={loadBackupStatus}
                  disabled={backupLoading}
                  className="flex items-center px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${backupLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={triggerBackup}
                  disabled={backupTriggering}
                  className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {backupTriggering ? (
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-1" />
                  )}
                  {backupTriggering ? 'Running...' : 'Backup Now'}
                </button>
              </div>
            </div>

            {backupLoading && !backupStatus ? (
              <div className="text-center py-8 text-gray-500">Loading backup status...</div>
            ) : backupStatus ? (
              <div className="p-6">
                {/* Status Cards Row */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                  {/* Last Success */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Success</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {backupStatus.lastSuccessAt
                        ? new Date(backupStatus.lastSuccessAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'Never'}
                    </p>
                    {backupStatus.lastSuccessMethod && (
                      <p className="text-xs text-gray-500 mt-1">{backupStatus.lastSuccessMethod} / {backupStatus.lastSuccessSizeMB} MB</p>
                    )}
                  </div>

                  {/* Last Failure */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      {backupStatus.lastFailAt ? (
                        <XCircle className="w-4 h-4 text-red-500 mr-2" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      )}
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Failure</span>
                    </div>
                    <p className={`text-sm font-semibold ${backupStatus.lastFailAt ? 'text-red-600' : 'text-green-600'}`}>
                      {backupStatus.lastFailAt
                        ? new Date(backupStatus.lastFailAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'None'}
                    </p>
                    {backupStatus.lastFailError && (
                      <p className="text-xs text-red-500 mt-1 truncate" title={backupStatus.lastFailError}>{backupStatus.lastFailError}</p>
                    )}
                  </div>

                  {/* Consecutive Failures */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <AlertCircle className={`w-4 h-4 mr-2 ${backupStatus.consecutiveFailures > 0 ? 'text-red-500' : 'text-green-500'}`} />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Failures in a Row</span>
                    </div>
                    <p className={`text-2xl font-bold ${backupStatus.consecutiveFailures > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {backupStatus.consecutiveFailures}
                    </p>
                  </div>

                  {/* Totals */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <HardDrive className="w-4 h-4 text-blue-500 mr-2" />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Backups</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{backupStatus.totalBackups}</p>
                    {backupStatus.totalFailures > 0 && (
                      <p className="text-xs text-red-500 mt-1">{backupStatus.totalFailures} failed</p>
                    )}
                  </div>

                  {/* Next Scheduled */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <Clock className="w-4 h-4 text-purple-500 mr-2" />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Next Backup</span>
                    </div>
                    {backupNextScheduled ? (
                      <>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {new Date(backupNextScheduled.time).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">in ~{backupNextScheduled.hoursFromNow}h ({backupNextScheduled.tiers?.join(', ')})</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">--</p>
                    )}
                  </div>
                </div>

                {/* Disk Usage */}
                {backupDiskUsage && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                      <HardDrive className="w-4 h-4 mr-2" />
                      Disk Usage
                    </h3>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{backupDiskUsage.totalMB} MB</span>
                      <span className="text-sm text-gray-500">{backupDiskUsage.fileCount} files on disk</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (parseFloat(backupDiskUsage.totalMB) / 100) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">of ~100 MB typical capacity</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">No backup data available. The backup service starts when the server boots.</div>
            )}
          </div>

          {/* Configuration Card */}
          {backupConfigDraft && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
                  <Settings className="w-4 h-4 mr-2" />
                  Backup Configuration
                </h3>
                <button
                  onClick={saveBackupConfig}
                  disabled={backupConfigSaving || JSON.stringify(backupConfigDraft) === JSON.stringify(backupConfig)}
                  className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-1" />
                  {backupConfigSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Enabled Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Scheduled Backups</label>
                    <p className="text-xs text-gray-500 mt-0.5">When disabled, only manual backups work</p>
                  </div>
                  <button
                    onClick={() => setBackupConfigDraft({ ...backupConfigDraft, enabled: !backupConfigDraft.enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      backupConfigDraft.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      backupConfigDraft.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {/* Email Recipients */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Mail className="w-3.5 h-3.5 inline mr-1" />
                      Email To
                    </label>
                    <input
                      type="text"
                      value={backupConfigDraft.emailTo || ''}
                      onChange={(e) => setBackupConfigDraft({ ...backupConfigDraft, emailTo: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Mail className="w-3.5 h-3.5 inline mr-1" />
                      Email CC
                    </label>
                    <input
                      type="text"
                      value={backupConfigDraft.emailCc || ''}
                      onChange={(e) => setBackupConfigDraft({ ...backupConfigDraft, emailCc: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="cc1@example.com, cc2@example.com"
                    />
                  </div>
                </div>

                {/* Backup Days */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Calendar className="w-3.5 h-3.5 inline mr-1" />
                    Backup Days
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                      const selected = (backupConfigDraft.backupDays || []).includes(idx);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const current = backupConfigDraft.backupDays || [];
                            const updated = selected ? current.filter((d: number) => d !== idx) : [...current, idx].sort((a: number, b: number) => a - b);
                            setBackupConfigDraft({ ...backupConfigDraft, backupDays: updated });
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Select which days backups should run (empty = every day)</p>
                </div>

                {/* Backup Hour */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Clock className="w-3.5 h-3.5 inline mr-1" />
                      Backup Hour (EST, 0-23)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={backupConfigDraft.backupHours?.[0] ?? 18}
                      onChange={(e) => setBackupConfigDraft({ ...backupConfigDraft, backupHours: [parseInt(e.target.value) || 0] })}
                      className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">Hour of the day (EST) when backup runs</p>
                  </div>
                </div>

                {/* Retention Policy */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Retention Policy (days)
                  </label>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { key: 'scheduled', label: 'Scheduled' },
                      { key: 'weekly', label: 'Weekly' },
                      { key: 'bi-weekly', label: 'Bi-Weekly' },
                      { key: 'monthly', label: 'Monthly' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-md px-3 py-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                        <input
                          type="number"
                          min="1"
                          value={backupConfigDraft.retention?.[key] || ''}
                          onChange={(e) => setBackupConfigDraft({
                            ...backupConfigDraft,
                            retention: { ...backupConfigDraft.retention, [key]: parseInt(e.target.value) || 1 }
                          })}
                          className="w-16 px-2 py-1 text-xs text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Backup History */}
          {backupHistory.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
                  <Activity className="w-4 h-4 mr-2" />
                  Backup History ({backupHistory.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Time</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Tiers</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Method</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Size</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Email</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupHistory.slice(backupHistoryPage * BACKUP_HISTORY_PAGE_SIZE, backupHistoryPage * BACKUP_HISTORY_PAGE_SIZE + BACKUP_HISTORY_PAGE_SIZE).map((entry: any, idx: number) => (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2 px-4">
                          {entry.success ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                              <XCircle className="w-3 h-3 mr-1" />FAIL
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-gray-700 dark:text-gray-300 text-xs">
                          {new Date(entry.timestamp).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-1">
                            {(Array.isArray(entry.tiers) ? entry.tiers : (() => { try { return JSON.parse(entry.tiers); } catch { return []; } })()).map((tier: string, i: number) => (
                              <span key={i} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                                {tier}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-4 text-gray-600 dark:text-gray-400 text-xs">{entry.backupMethod}</td>
                        <td className="py-2 px-4 text-gray-600 dark:text-gray-400 text-xs">
                          {entry.compressedSizeMB ? `${entry.compressedSizeMB} MB` : '--'}
                        </td>
                        <td className="py-2 px-4">
                          {entry.emailed ? (
                            <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400"><Mail className="w-3 h-3 mr-1" />Sent</span>
                          ) : entry.success ? (
                            <span className="inline-flex items-center text-xs text-yellow-600 dark:text-yellow-400"><AlertCircle className="w-3 h-3 mr-1" />Local only</span>
                          ) : (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-xs">
                          {entry.success ? (
                            <span className="text-gray-500">{entry.elapsed}s</span>
                          ) : (
                            <span className="text-red-500 truncate max-w-[200px] inline-block" title={entry.error}>{entry.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {backupHistory.length > BACKUP_HISTORY_PAGE_SIZE && (
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {backupHistoryPage * BACKUP_HISTORY_PAGE_SIZE + 1}–{Math.min((backupHistoryPage + 1) * BACKUP_HISTORY_PAGE_SIZE, backupHistory.length)} of {backupHistory.length} entries
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={backupHistoryPage === 0}
                      onClick={() => setBackupHistoryPage(p => Math.max(0, p - 1))}
                      className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      Previous
                    </button>
                    <button
                      disabled={(backupHistoryPage + 1) * BACKUP_HISTORY_PAGE_SIZE >= backupHistory.length}
                      onClick={() => setBackupHistoryPage(p => p + 1)}
                      className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Local Files */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                Local Backup Files ({backupFiles.length})
              </h3>
            </div>
            {backupFiles.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">File</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Size</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Created</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Tiers</th>
                      <th className="text-left py-2 px-4 text-gray-600 dark:text-gray-400 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupFiles.map((file: any, idx: number) => {
                      const tierPart = file.name.split('_')[1] || '';
                      const tiers = tierPart.split('+').map((t: string) => t.charAt(0).toUpperCase() + t.slice(1));
                      return (
                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="py-2 px-4 text-gray-900 dark:text-gray-100 font-mono text-xs truncate max-w-[250px]" title={file.name}>
                            {file.name}
                          </td>
                          <td className="py-2 px-4 text-gray-600 dark:text-gray-400 text-xs">{file.sizeMB} MB</td>
                          <td className="py-2 px-4 text-gray-600 dark:text-gray-400 text-xs">
                            {new Date(file.created).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex flex-wrap gap-1">
                              {tiers.map((tier: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                                  {tier}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <button
                              onClick={() => downloadBackup(file.name)}
                              disabled={backupDownloading === file.name}
                              className="flex items-center px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                              {backupDownloading === file.name ? (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3 mr-1" />
                              )}
                              Download
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
                No local backup files. Backups are emailed and cleaned up after successful delivery.
              </div>
            )}
          </div>
        </div>
      )}
      </div>

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
