import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../Layout/Sidebar';

describe('Sidebar', () => {
  const defaultProps = {
    currentPage: 'dashboard' as const,
    onPageChange: jest.fn(),
    user: { username: 'testuser', email: 'test@example.com', role: 'admin' as const },
    onLogout: jest.fn(),
    collapsed: false,
    onToggleCollapse: jest.fn(),
    newListings: [],
    unreadCount: 0,
    onMarkAsRead: jest.fn(),
    onMarkAllAsRead: jest.fn(),
    onNotificationClick: jest.fn(),
    readListingIds: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Settings Menu Visibility', () => {
    const allowedEmails = [
      'ferdinand@luxurylodgingpm.com',
      'admin@luxurylodgingpm.com',
      'devendravariya73@gmail.com',
    ];

    it.each(allowedEmails)('should show Settings menu for %s', (email) => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'testuser', email, role: 'admin' }}
        />
      );

      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });

    it('should show Settings menu for allowed email with different case', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'testuser', email: 'ADMIN@LUXURYLODGINGPM.COM', role: 'admin' }}
        />
      );

      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });

    it('should hide Settings menu for non-allowed email', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'testuser', email: 'random@example.com', role: 'admin' }}
        />
      );

      expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    });

    it('should hide Settings menu when user email is undefined', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'testuser', role: 'admin' }}
        />
      );

      expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    });

    it('should hide Settings menu when user is null', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={null}
        />
      );

      expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should show Dashboard, Listings, and Email for all users', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'testuser', email: 'random@example.com', role: 'viewer' }}
        />
      );

      expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /listings/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
    });

    it('should call onPageChange when navigation item is clicked', () => {
      const onPageChange = jest.fn();
      render(
        <Sidebar
          {...defaultProps}
          onPageChange={onPageChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /listings/i }));

      expect(onPageChange).toHaveBeenCalledWith('listings');
    });

    it('should highlight active page', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentPage="listings"
        />
      );

      const listingsButton = screen.getByRole('button', { name: /listings/i });
      expect(listingsButton).toHaveClass('bg-blue-50');
    });
  });

  describe('Collapsed State', () => {
    it('should hide labels when collapsed', () => {
      render(
        <Sidebar
          {...defaultProps}
          collapsed={true}
        />
      );

      // Text labels should not be visible
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('should show labels when expanded', () => {
      render(
        <Sidebar
          {...defaultProps}
          collapsed={false}
        />
      );

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  describe('User Profile', () => {
    it('should display username', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'JohnDoe', email: 'john@example.com', role: 'admin' }}
          collapsed={false}
        />
      );

      expect(screen.getByText('JohnDoe')).toBeInTheDocument();
    });

    it('should display user role badge', () => {
      render(
        <Sidebar
          {...defaultProps}
          user={{ username: 'testuser', email: 'test@example.com', role: 'admin' }}
          collapsed={false}
        />
      );

      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    it('should call onLogout when logout button is clicked', () => {
      const onLogout = jest.fn();
      render(
        <Sidebar
          {...defaultProps}
          onLogout={onLogout}
        />
      );

      fireEvent.click(screen.getByTitle('Logout'));

      expect(onLogout).toHaveBeenCalled();
    });
  });

  describe('Notifications', () => {
    it('should show notification count when there are unread notifications', () => {
      render(
        <Sidebar
          {...defaultProps}
          unreadCount={5}
        />
      );

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show 99+ when count exceeds 99', () => {
      render(
        <Sidebar
          {...defaultProps}
          unreadCount={150}
        />
      );

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should not show count badge when unreadCount is 0', () => {
      render(
        <Sidebar
          {...defaultProps}
          unreadCount={0}
        />
      );

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });
});
