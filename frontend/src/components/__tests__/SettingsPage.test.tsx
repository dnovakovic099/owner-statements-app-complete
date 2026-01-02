import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../SettingsPage';

// Mock the toast hook
jest.mock('../ui/toast', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('SettingsPage', () => {
  const mockOnBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true, users: [] }),
    });
  });

  describe('Access Control', () => {
    const allowedEmails = [
      'ferdinand@luxurylodgingpm.com',
      'admin@luxurylodgingpm.com',
      'devendravariya73@gmail.com',
    ];

    it.each(allowedEmails)('should allow access for %s', async (email) => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail={email}
        />
      );

      // Should show the settings content, not access denied
      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    it('should allow access for allowed email with different case', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="FERDINAND@LUXURYLODGINGPM.COM"
        />
      );

      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    });

    it('should deny access for non-allowed email', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="random@example.com"
        />
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText('You do not have permission to access settings.')).toBeInTheDocument();
    });

    it('should deny access when email is undefined', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail={undefined}
        />
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('should deny access when email is empty string', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail=""
        />
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('should render all tabs for allowed users', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="admin@luxurylodgingpm.com"
        />
      );

      expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /activity log/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /quickbooks/i })).toBeInTheDocument();
    });

    it('should switch to Activity Log tab when clicked', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="admin@luxurylodgingpm.com"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /activity log/i }));

      // Activity log tab should be active
      expect(screen.getByRole('button', { name: /activity log/i })).toHaveClass('bg-blue-600');
    });

    it('should switch to QuickBooks tab when clicked', () => {
      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="admin@luxurylodgingpm.com"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /quickbooks/i }));

      expect(screen.getByText('QuickBooks Integration')).toBeInTheDocument();
    });
  });

  describe('QuickBooks Integration', () => {
    it('should show "Connect to QuickBooks" button when not connected', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="admin@luxurylodgingpm.com"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /quickbooks/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /connect to quickbooks/i })).toBeInTheDocument();
      });
    });

    it('should show connected status when QuickBooks is connected', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <SettingsPage
          onBack={mockOnBack}
          currentUserRole="admin"
          currentUserEmail="admin@luxurylodgingpm.com"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /quickbooks/i }));

      await waitFor(() => {
        expect(screen.getByText('Connected to QuickBooks')).toBeInTheDocument();
      });
    });
  });
});
