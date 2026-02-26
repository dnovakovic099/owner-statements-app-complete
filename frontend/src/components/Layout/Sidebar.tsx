import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Home,
  Mail,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  X,
  BarChart3,
  FolderOpen,
  CreditCard,
} from 'lucide-react';

type Page = 'dashboard' | 'listings' | 'groups' | 'stripe' | 'email' | 'settings' | 'financials' | 'analytics';

interface UserInfo {
  username: string;
  email?: string;
  role?: 'system' | 'admin' | 'editor' | 'viewer';
}

// Allowed emails for Settings access
const SETTINGS_ALLOWED_EMAILS = [
  'ferdinand@luxurylodgingpm.com',
  'admin@luxurylodgingpm.com',
  'devendravariya73@gmail.com'
];

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

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  user: UserInfo | null;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Notification props
  newListings: NewListing[];
  unreadCount: number;
  onMarkAsRead: (id: number) => void;
  onMarkAllAsRead: () => void;
  onNotificationClick: (listing: NewListing) => void;
  readListingIds: number[];
}

const navItems: { id: Page; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'listings', label: 'Listings', icon: <Home className="w-5 h-5" /> },
  { id: 'groups', label: 'Groups', icon: <FolderOpen className="w-5 h-5" /> },
  { id: 'stripe', label: 'Stripe', icon: <CreditCard className="w-5 h-5" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, adminOnly: true },
  { id: 'email', label: 'Email', icon: <Mail className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" />, adminOnly: true },
];

const roleColors: Record<string, string> = {
  system: 'bg-purple-100 text-purple-700',
  admin: 'bg-green-100 text-green-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-700',
};

const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  user,
  onLogout,
  collapsed,
  onToggleCollapse,
  newListings,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
  readListingIds,
}) => {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
        setShowAllNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if user email is in the allowed list for Settings access
  const hasSettingsAccess = user?.email && SETTINGS_ALLOWED_EMAILS.includes(user.email.toLowerCase());

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ease-in-out z-40 print:hidden ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo Section */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        {!collapsed && (
          <span className="text-lg font-semibold text-gray-900 truncate">
            Luxury Lodging
          </span>
        )}
        {collapsed && (
          <span className="text-lg font-bold text-blue-600 mx-auto">LL</span>
        )}
      </div>

      {/* Navigation - scrollbar hidden */}
      <nav
        className="flex-1 py-4 px-2 space-y-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {navItems.map((item) => {
          if (item.adminOnly && !hasSettingsAccess) return null;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors group relative ${
                isActive
                  ? 'bg-blue-50 text-blue-600 border-l-3 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className={`${isActive ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-700'}`}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className={`ml-3 font-medium ${isActive ? 'text-blue-600' : ''}`}>
                  {item.label}
                </span>
              )}
              {/* Tooltip for collapsed state */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions Bar */}
      <div className="px-2 py-2 border-t border-gray-100 flex-shrink-0 relative" ref={notificationRef}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'}`}>
          {/* Notifications Button */}
          <button
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-all flex-shrink-0 ${
              isNotificationOpen
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full font-bold leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Collapse Toggle */}
          <button
            onClick={onToggleCollapse}
            className="relative z-10 flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg text-gray-500 bg-gray-50 hover:bg-gray-200 hover:text-gray-700 transition-all flex-shrink-0 border border-gray-200 hover:border-gray-300 active:bg-gray-300 cursor-pointer shadow-sm"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ touchAction: 'manipulation' }}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Notification Dropdown */}
        {isNotificationOpen && (
          <div className={`absolute ${collapsed ? 'left-16' : 'left-60'} bottom-0 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden`}>
            <div className="px-4 py-3 border-b border-gray-100 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">New Listings</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] font-semibold rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsNotificationOpen(false);
                    setShowAllNotifications(false);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
              {newListings.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm text-gray-400">No new listings</p>
                </div>
              ) : (
                (showAllNotifications ? newListings : newListings.slice(0, 5)).map((listing) => {
                  const isRead = readListingIds.includes(listing.id);
                  return (
                    <div
                      key={listing.id}
                      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-blue-50/50 ${
                        isRead ? '' : 'bg-blue-50/30'
                      }`}
                      onClick={() => {
                        onNotificationClick(listing);
                        setIsNotificationOpen(false);
                        setShowAllNotifications(false);
                        if (!isRead) onMarkAsRead(listing.id);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isRead ? 'text-gray-500' : 'text-gray-900'}`}>
                            {listing.displayName}
                          </p>
                          <p className={`text-xs truncate mt-0.5 ${isRead ? 'text-gray-400' : 'text-gray-500'}`}>
                            {listing.city}{listing.state ? `, ${listing.state}` : ''}
                          </p>
                        </div>
                        <span className={`text-[11px] whitespace-nowrap ${isRead ? 'text-gray-300' : 'text-gray-400'}`}>
                          {new Date(listing.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {newListings.length > 0 && (
              <div className="px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center">
                {unreadCount > 0 ? (
                  <button
                    onClick={() => {
                      onMarkAllAsRead();
                      setIsNotificationOpen(false);
                      setShowAllNotifications(false);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    Mark all read
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">All read</span>
                )}
                {newListings.length > 5 && (
                  <button
                    onClick={() => setShowAllNotifications(!showAllNotifications)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    {showAllNotifications ? 'Show less' : `View all (${newListings.length})`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Profile Section */}
      <div className={`px-2 py-2 border-t border-gray-100 flex-shrink-0 ${collapsed ? 'flex flex-col items-center gap-1' : ''}`}>
        {/* Profile Row */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 px-1'}`}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
              <span className="text-white font-semibold text-xs">
                {user?.username?.slice(0, 2).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></div>
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.username || 'User'}
              </p>
              {user?.role && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${roleColors[user.role] || roleColors.viewer}`}>
                  {user.role}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Logout Button - Separate Row */}
        <button
          onClick={onLogout}
          className={`flex items-center ${
            collapsed
              ? 'justify-center w-9 h-9 mt-1'
              : 'w-full px-3 py-2 mt-2'
          } rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors group`}
          title="Logout"
        >
          <LogOut className={`${collapsed ? 'w-4 h-4' : 'w-4 h-4'}`} />
          {!collapsed && <span className="ml-2 text-sm font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
