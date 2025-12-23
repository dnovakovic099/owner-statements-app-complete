import React, { useState, useEffect } from 'react';
import {
  Home,
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
  Filter,
  Settings
} from 'lucide-react';
import { usersAPI, activityLogAPI, User, ActivityLogEntry } from '../services/api';
import { useToast } from './ui/toast';
import ConfirmDialog from './ui/confirm-dialog';

interface SettingsPageProps {
  onBack: () => void;
  currentUserRole: string;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, currentUserRole }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'LOGIN':
        return 'bg-green-100 text-green-800';
      case 'LOGIN_FAILED':
        return 'bg-red-100 text-red-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'SEND_EMAIL':
        return 'bg-blue-100 text-blue-800';
      case 'STATUS_UPDATE':
        return 'bg-purple-100 text-purple-800';
      case 'CREATE_STATEMENT':
        return 'bg-green-100 text-green-800';
      case 'VIEW_STATEMENT':
        return 'bg-blue-100 text-blue-800';
      case 'DOWNLOAD_STATEMENT':
        return 'bg-indigo-100 text-indigo-800';
      case 'UPDATE_LISTING':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatActivityDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  // Only system and admin users can access this page
  if (currentUserRole !== 'admin' && currentUserRole !== 'system') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            <div className="flex items-center">
              <button
                onClick={onBack}
                className="mr-4 p-2 hover:bg-white/10 rounded-md transition-colors"
              >
                <Home className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
                <p className="text-white/80 text-sm mt-1">Access Denied</p>
              </div>
            </div>
          </div>
        </header>
        <div className="w-full px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-500">Only administrators can access settings.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={onBack}
                className="mr-4 p-2 hover:bg-white/10 rounded-md transition-colors"
              >
                <Home className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
                <p className="text-white/80 text-sm mt-1">User Management</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-4 py-8">
        <div className="w-full px-2">
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
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center">
                <Activity className="w-5 h-5 text-gray-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
                <span className="ml-2 text-sm text-gray-500">({activityTotal} total)</span>
              </div>
              <button
                onClick={loadActivityLogs}
                className="flex items-center px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors text-sm"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${activityLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Filters */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center">
                  <Filter className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-500">Filters:</span>
                </div>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Users</option>
                  {filterUsers.map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Events</option>
                  {filterActions.map(action => (
                    <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={selectedStartDate}
                  onChange={(e) => setSelectedStartDate(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={selectedEndDate}
                  onChange={(e) => setSelectedEndDate(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="To"
                />
                {(selectedUser || selectedAction || selectedStartDate || selectedEndDate) && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {activityLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-500">Loading activity logs...</p>
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="p-8 text-center">
                <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No activity logs found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">IP</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-44">Date/Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 max-h-[500px] overflow-y-auto">
                    {activityLogs.map((log) => {
                      const details = parseDetails(log.details);
                      const getDetails = () => {
                        switch(log.action) {
                          case 'LOGIN': return 'Successfully logged in';
                          case 'LOGIN_FAILED': return 'Failed login attempt';
                          case 'DELETE': return `Deleted: ${details?.propertyName || 'unknown'}`;
                          case 'SEND_EMAIL': return `Email to ${details?.recipientEmail} - ${details?.propertyName || ''}`;
                          case 'STATUS_UPDATE': return `Status → "${details?.newStatus}" - ${details?.propertyName || ''}`;
                          case 'CREATE_STATEMENT': return `Created: ${details?.propertyName || ''} (${details?.period || ''})`;
                          case 'VIEW_STATEMENT': return `Viewed: ${details?.propertyName || ''}`;
                          case 'DOWNLOAD_STATEMENT': return `Downloaded: ${details?.filename || details?.propertyName || ''}`;
                          case 'UPDATE_LISTING': return `${details?.listingName || ''} (${details?.changes?.join(', ') || 'settings'})`;
                          default: return `${log.resource} ${log.resourceId ? '#' + log.resourceId : ''}`;
                        }
                      };
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-medium text-gray-900">{log.username || 'Unknown'}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              {getActionIcon(log.action)}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getActionBadgeClass(log.action)}`}>
                                {log.action.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            <span className={log.action === 'LOGIN_FAILED' ? 'text-red-600' : ''}>
                              {getDetails()}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                            {log.ipAddress || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                            {formatActivityDate(log.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>
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
