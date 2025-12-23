import React, { useState, useEffect, useRef } from 'react';
import { Bell, Clock, X, ChevronRight } from 'lucide-react';
import { tagScheduleAPI } from '../services/api';

interface TagNotification {
  id: number;
  tagName: string;
  message: string;
  status: 'unread' | 'read' | 'dismissed' | 'actioned';
  listingCount: number;
  scheduledFor: string;
  createdAt: string;
}

interface NotificationBellProps {
  onNotificationClick: (tagName: string, notificationId: number) => void;
  refreshInterval?: number;
}

const NotificationBell: React.FC<NotificationBellProps> = ({
  onNotificationClick,
  refreshInterval = 60000
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<TagNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const response = await tagScheduleAPI.getNotifications();
      setNotifications(response.notifications || []);
      setUnreadCount(response.unreadCount || 0);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsActioned = async (id: number) => {
    try {
      await tagScheduleAPI.markNotificationActioned(id);
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark notification as actioned:', error);
    }
  };

  const dismissNotification = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tagScheduleAPI.dismissNotification(id);
      fetchNotifications();
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  };

  const handleNotificationClick = async (notification: TagNotification) => {
    await markAsActioned(notification.id);
    onNotificationClick(notification.tagName, notification.id);
    setIsOpen(false);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const activeNotifications = notifications.filter(n => n.status !== 'dismissed');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Reminders</h3>
              {unreadCount > 0 && (
                <span className="text-xs text-blue-600 font-medium">{unreadCount} new</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {activeNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">No reminders</p>
              </div>
            ) : (
              activeNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${
                    notification.status === 'unread' ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      notification.status === 'unread' ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {notification.tagName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {notification.listingCount} listing{notification.listingCount !== 1 ? 's' : ''} ready
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatTime(notification.scheduledFor)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => dismissNotification(notification.id, e)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 text-center">
              Click to view listings for this tag
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
