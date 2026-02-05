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
  ChevronDown
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

// Days of week for dropdowns
const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];

// Frequency types for dropdowns
const FREQUENCY_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-Weekly (every 2 weeks)' },
  { value: 'monthly', label: 'Monthly' }
];

// Allowed emails for Settings access
const SETTINGS_ALLOWED_EMAILS = [
  'ferdinand@luxurylodgingpm.com',
  'admin@luxurylodgingpm.com',
  'devendravariya73@gmail.com'
];

// Schedule type for managing auto-generation schedules
interface TagSchedule {
  id: number;
  tagName: string;
  isEnabled: boolean;
  frequencyType: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  biweeklyStartDate: string | null;
  lastNotifiedAt: string | null;
  nextScheduledAt: string | null;
  periodDays: number | null;
  calculationType: 'checkout' | 'calendar' | null;
  skipDates: string[];
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, currentUserRole, currentUserEmail, hideSidebar = false }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'schedules'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Schedules state
  const [schedules, setSchedules] = useState<TagSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<TagSchedule | null>(null);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    tagName: '',
    frequencyType: 'weekly' as 'weekly' | 'biweekly' | 'monthly',
    dayOfWeek: 1,
    dayOfMonth: 1,
    timeOfDay: '08:00',
    biweeklyStartDate: '2026-01-19',
    calculationType: 'checkout' as 'checkout' | 'calendar'
  });

  // Custom dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

  // Load schedules when tab changes
  useEffect(() => {
    if (activeTab === 'schedules') {
      loadSchedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Schedule management functions
  const getAuthHeaders = (): Record<string, string> => {
    const authData = localStorage.getItem('luxury-lodging-auth');
    if (authData) {
      const { token } = JSON.parse(authData);
      return { 'Authorization': `Bearer ${token}` };
    }
    return {};
  };

  const loadSchedules = async () => {
    try {
      setSchedulesLoading(true);
      const response = await fetch('/api/tag-schedules/schedules', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
      showToast('Failed to load schedules', 'error');
    } finally {
      setSchedulesLoading(false);
    }
  };

  const handleToggleSchedule = async (schedule: TagSchedule) => {
    try {
      const response = await fetch('/api/tag-schedules/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          tagName: schedule.tagName,
          frequencyType: schedule.frequencyType,
          dayOfWeek: schedule.dayOfWeek,
          dayOfMonth: schedule.dayOfMonth,
          timeOfDay: schedule.timeOfDay,
          isEnabled: !schedule.isEnabled
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast(`Schedule ${!schedule.isEnabled ? 'enabled' : 'disabled'}`, 'success');
        loadSchedules();
      } else {
        showToast(data.error || 'Failed to update schedule', 'error');
      }
    } catch (err) {
      showToast('Failed to update schedule', 'error');
    }
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule) return;

    try {
      const response = await fetch('/api/tag-schedules/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          tagName: editingSchedule.tagName,
          frequencyType: editingSchedule.frequencyType,
          dayOfWeek: editingSchedule.frequencyType !== 'monthly' ? scheduleForm.dayOfWeek : null,
          dayOfMonth: editingSchedule.frequencyType === 'monthly' ? scheduleForm.dayOfMonth : null,
          timeOfDay: scheduleForm.timeOfDay,
          biweeklyStartDate: editingSchedule.frequencyType === 'biweekly' ? scheduleForm.biweeklyStartDate : null,
          isEnabled: editingSchedule.isEnabled,
          calculationType: scheduleForm.calculationType
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Schedule updated successfully', 'success');
        setEditingSchedule(null);
        loadSchedules();
      } else {
        showToast(data.error || 'Failed to update schedule', 'error');
      }
    } catch (err) {
      showToast('Failed to update schedule', 'error');
    }
  };

  const handleAddSchedule = async () => {
    if (!scheduleForm.tagName.trim()) {
      showToast('Please enter a tag name', 'error');
      return;
    }

    try {
      const response = await fetch('/api/tag-schedules/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          tagName: scheduleForm.tagName.trim().toUpperCase(),
          frequencyType: scheduleForm.frequencyType,
          dayOfWeek: scheduleForm.frequencyType !== 'monthly' ? scheduleForm.dayOfWeek : null,
          dayOfMonth: scheduleForm.frequencyType === 'monthly' ? scheduleForm.dayOfMonth : null,
          timeOfDay: scheduleForm.timeOfDay,
          biweeklyStartDate: scheduleForm.frequencyType === 'biweekly' ? scheduleForm.biweeklyStartDate : null,
          isEnabled: true,
          calculationType: scheduleForm.calculationType
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Schedule created successfully', 'success');
        setIsAddScheduleOpen(false);
        setScheduleForm({
          tagName: '',
          frequencyType: 'weekly',
          dayOfWeek: 1,
          dayOfMonth: 1,
          timeOfDay: '08:00',
          biweeklyStartDate: '2026-01-19',
          calculationType: 'checkout'
        });
        loadSchedules();
      } else {
        showToast(data.error || 'Failed to create schedule', 'error');
      }
    } catch (err) {
      showToast('Failed to create schedule', 'error');
    }
  };

  const getDayName = (dayOfWeek: number | null) => {
    if (dayOfWeek === null) return '-';
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  };

  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
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
            <p className="text-gray-500 text-sm mt-0.5">User management, activity logs, and schedules</p>
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
              onClick={() => setActiveTab('schedules')}
              className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === 'schedules'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Schedules
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

          {/* Schedules Section */}
          {activeTab === 'schedules' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 text-gray-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Auto-Generation Schedules</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setScheduleForm({
                      tagName: '',
                      frequencyType: 'weekly',
                      dayOfWeek: 1,
                      dayOfMonth: 1,
                      timeOfDay: '08:00',
                      biweeklyStartDate: '2026-01-19',
                      calculationType: 'checkout'
                    });
                    setIsAddScheduleOpen(true);
                  }}
                  className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Schedule
                </button>
                <button
                  onClick={loadSchedules}
                  disabled={schedulesLoading}
                  className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${schedulesLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-500 mb-6">
                Configure automatic statement generation schedules. Statements will be auto-generated at 8:00 AM EST on the configured days for listings/groups with matching tags.
              </p>

              {schedulesLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-500">Loading schedules...</p>
                </div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No schedules configured</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Schedules are created automatically when listings or groups are assigned tags.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        schedule.isEnabled ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            schedule.isEnabled ? 'bg-green-100' : 'bg-gray-200'
                          }`}>
                            <CalendarDays className={`w-5 h-5 ${schedule.isEnabled ? 'text-green-600' : 'text-gray-400'}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{schedule.tagName}</h3>
                            <p className="text-sm text-gray-500">
                              {schedule.frequencyType === 'weekly' && `Every ${getDayName(schedule.dayOfWeek)}`}
                              {schedule.frequencyType === 'biweekly' && `Every other ${getDayName(schedule.dayOfWeek)} (from ${schedule.biweeklyStartDate || '2026-01-19'})`}
                              {schedule.frequencyType === 'monthly' && `Monthly on day ${schedule.dayOfMonth}`}
                              {' at '}{formatTimeDisplay(schedule.timeOfDay)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingSchedule(schedule);
                              setScheduleForm({
                                tagName: schedule.tagName,
                                frequencyType: schedule.frequencyType,
                                dayOfWeek: schedule.dayOfWeek ?? 1,
                                dayOfMonth: schedule.dayOfMonth ?? 1,
                                timeOfDay: schedule.timeOfDay,
                                biweeklyStartDate: schedule.biweeklyStartDate || '2026-01-19',
                                calculationType: schedule.calculationType || 'checkout'
                              });
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Schedule"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleSchedule(schedule)}
                            className={`p-2 rounded-lg transition-colors ${
                              schedule.isEnabled
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={schedule.isEnabled ? 'Disable Schedule' : 'Enable Schedule'}
                          >
                            {schedule.isEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-xs">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full ${
                          schedule.isEnabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {schedule.isEnabled ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3 mr-1" />
                              Disabled
                            </>
                          )}
                        </span>
                        <div className="flex items-center gap-4">
                          {schedule.nextScheduledAt && schedule.isEnabled && (
                            <span className="text-blue-600 font-medium">
                              Next run: {new Date(schedule.nextScheduledAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                          {schedule.lastNotifiedAt && (
                            <span className="text-gray-500">
                              Last run: {new Date(schedule.lastNotifiedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </div>

      {/* Edit Schedule Modal */}
      {editingSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit Schedule</h2>
              <p className="text-sm text-gray-500">{editingSchedule.tagName}</p>
            </div>
            <div className="p-6 space-y-4">
              {editingSchedule.frequencyType !== 'monthly' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Week
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === 'editDayOfWeek' ? null : 'editDayOfWeek')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span>{DAYS_OF_WEEK.find(d => d.value === scheduleForm.dayOfWeek)?.label}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openDropdown === 'editDayOfWeek' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'editDayOfWeek' && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            setScheduleForm({ ...scheduleForm, dayOfWeek: day.value });
                            setOpenDropdown(null);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${scheduleForm.dayOfWeek === day.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {editingSchedule.frequencyType === 'monthly' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Month
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === 'editDayOfMonth' ? null : 'editDayOfMonth')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span>{scheduleForm.dayOfMonth}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openDropdown === 'editDayOfMonth' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'editDayOfMonth' && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setScheduleForm({ ...scheduleForm, dayOfMonth: day });
                            setOpenDropdown(null);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${scheduleForm.dayOfMonth === day ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time of Day (EST)
                </label>
                <input
                  type="time"
                  value={scheduleForm.timeOfDay}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, timeOfDay: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {editingSchedule.frequencyType === 'biweekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bi-weekly Start Date
                  </label>
                  <input
                    type="date"
                    value={scheduleForm.biweeklyStartDate}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, biweeklyStartDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The schedule will run every 2 weeks starting from this date
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Calculation Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, calculationType: 'checkout' })}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                      scheduleForm.calculationType === 'checkout'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, calculationType: 'calendar' })}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                      scheduleForm.calculationType === 'calendar'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Calendar
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Used for new listings; existing listings use their last statement's type
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setEditingSchedule(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSchedule}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {isAddScheduleOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Add New Schedule</h2>
              <p className="text-sm text-gray-500">Create a new auto-generation schedule</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tag Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={scheduleForm.tagName}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, tagName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., WEEKLY, BI-WEEKLY, MONTHLY"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Will match listings/groups with tags containing this text
                </p>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency Type
                </label>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'addFrequency' ? null : 'addFrequency')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span>{FREQUENCY_TYPES.find(f => f.value === scheduleForm.frequencyType)?.label}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openDropdown === 'addFrequency' ? 'rotate-180' : ''}`} />
                </button>
                {openDropdown === 'addFrequency' && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                    {FREQUENCY_TYPES.map(freq => (
                      <button
                        key={freq.value}
                        type="button"
                        onClick={() => {
                          setScheduleForm({ ...scheduleForm, frequencyType: freq.value as 'weekly' | 'biweekly' | 'monthly' });
                          setOpenDropdown(null);
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${scheduleForm.frequencyType === freq.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                      >
                        {freq.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {scheduleForm.frequencyType !== 'monthly' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Week
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === 'addDayOfWeek' ? null : 'addDayOfWeek')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span>{DAYS_OF_WEEK.find(d => d.value === scheduleForm.dayOfWeek)?.label}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openDropdown === 'addDayOfWeek' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'addDayOfWeek' && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            setScheduleForm({ ...scheduleForm, dayOfWeek: day.value });
                            setOpenDropdown(null);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${scheduleForm.dayOfWeek === day.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {scheduleForm.frequencyType === 'monthly' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Month
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === 'addDayOfMonth' ? null : 'addDayOfMonth')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span>{scheduleForm.dayOfMonth}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openDropdown === 'addDayOfMonth' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'addDayOfMonth' && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setScheduleForm({ ...scheduleForm, dayOfMonth: day });
                            setOpenDropdown(null);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${scheduleForm.dayOfMonth === day ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time of Day (EST)
                </label>
                <input
                  type="time"
                  value={scheduleForm.timeOfDay}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, timeOfDay: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {scheduleForm.frequencyType === 'biweekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bi-weekly Start Date
                  </label>
                  <input
                    type="date"
                    value={scheduleForm.biweeklyStartDate}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, biweeklyStartDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The schedule will run every 2 weeks starting from this date
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Calculation Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, calculationType: 'checkout' })}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                      scheduleForm.calculationType === 'checkout'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, calculationType: 'calendar' })}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                      scheduleForm.calculationType === 'calendar'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Calendar
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Used for new listings; existing listings use their last statement's type
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setIsAddScheduleOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSchedule}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}

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
