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
  User,
} from 'lucide-react';

type Page = 'dashboard' | 'listings' | 'email' | 'settings';

interface UserInfo {
  username: string;
  role?: 'system' | 'admin' | 'editor' | 'viewer';
}

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

  const isAdmin = user?.role === 'system' || user?.role === 'admin';

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ease-in-out z-40 ${
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
          if (item.adminOnly && !isAdmin) return null;
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
      <div className="px-2 py-1 border-t border-gray-100 flex-shrink-0" ref={notificationRef}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-0.5' : 'justify-between'}`}>
          {/* Notifications Button */}
          <button
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all flex-shrink-0 ${
              isNotificationOpen
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full font-bold leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Collapse Toggle */}
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all flex-shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Notification Dropdown */}
        {isNotificationOpen && (
          <div className={`absolute ${collapsed ? 'left-16' : 'left-60'} bottom-32 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden`}>
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">New Listings</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{unreadCount} unread</span>
                  <button
                    onClick={() => {
                      setIsNotificationOpen(false);
                      setShowAllNotifications(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
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
                      className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        isRead ? 'bg-gray-50/50' : 'bg-white'
                      }`}
                      onClick={() => {
                        onNotificationClick(listing);
                        setIsNotificationOpen(false);
                        setShowAllNotifications(false);
                        if (!isRead) onMarkAsRead(listing.id);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
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
                        {!isRead && (
                          <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {newListings.length > 0 && (
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                {unreadCount > 0 ? (
                  <button
                    onClick={() => {
                      onMarkAllAsRead();
                      setIsNotificationOpen(false);
                      setShowAllNotifications(false);
                    }}
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
