import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

type Page = 'dashboard' | 'listings' | 'groups' | 'stripe' | 'email' | 'settings' | 'financials' | 'analytics';

interface UserInfo {
  username: string;
  email?: string;
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

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onPageChange: (page: Page) => void;
  user: UserInfo | null;
  onLogout: () => void;
  // Notification props
  newListings: NewListing[];
  unreadCount: number;
  onMarkAsRead: (id: number) => void;
  onMarkAllAsRead: () => void;
  onNotificationClick: (listing: NewListing) => void;
  readListingIds: number[];
}

const COLLAPSED_KEY = 'sidebar_collapsed';
const MOBILE_BREAKPOINT = 768;

const Layout: React.FC<LayoutProps> = ({
  children,
  currentPage,
  onPageChange,
  user,
  onLogout,
  newListings,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
  readListingIds,
}) => {
  // Initialize collapsed state from localStorage or based on screen size
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === 'true';
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  // Mobile drawer state (overlay mode)
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );

  // Handle screen resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      // Auto-collapse on mobile if not already collapsed
      if (mobile && !collapsed) {
        setCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [collapsed]);

  // Persist collapsed state
  const toggleCollapse = () => {
    const newValue = !collapsed;
    setCollapsed(newValue);
    localStorage.setItem(COLLAPSED_KEY, String(newValue));
  };

  // Handle page change - close mobile drawer
  const handlePageChange = (page: Page) => {
    onPageChange(page);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  // Handle notification click
  const handleNotificationClick = (listing: NewListing) => {
    onNotificationClick(listing);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  return (
    <div className="h-screen bg-gray-50 overflow-hidden flex flex-col">
      {/* Mobile Header Bar */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30 print:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 text-lg font-semibold text-gray-900">Luxury Lodging</span>
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
              {unreadCount} new
            </span>
          )}
        </header>
      )}

      {/* Mobile Backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity print:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: drawer */}
      <div
        className={`print:hidden ${
          isMobile
            ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : ''
        }`}
      >
        <Sidebar
          currentPage={currentPage}
          onPageChange={handlePageChange}
          user={user}
          onLogout={onLogout}
          collapsed={isMobile ? false : collapsed}
          onToggleCollapse={isMobile ? () => setMobileOpen(false) : toggleCollapse}
          newListings={newListings}
          unreadCount={unreadCount}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
          onNotificationClick={handleNotificationClick}
          readListingIds={readListingIds}
        />
      </div>

      {/* Main Content */}
      <main
        className={`flex-1 overflow-hidden transition-all duration-200 print:ml-0 print:pt-0 ${
          isMobile
            ? 'pt-14' // Account for mobile header
            : collapsed
            ? 'ml-16'
            : 'ml-60'
        }`}
      >
        <div className="h-full overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
