import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StatementsTable from '../StatementsTable';
import { Statement } from '../../types';

// Mock the tooltip component
jest.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('StatementsTable', () => {
  const createMockStatement = (overrides: Partial<Statement> = {}): Statement => ({
    id: 1,
    ownerId: 1,
    ownerName: 'Test Owner',
    propertyId: 100,
    propertyName: 'Test Property',
    weekStartDate: '2025-01-01',
    weekEndDate: '2025-01-07',
    totalRevenue: 1000,
    totalExpenses: 100,
    ownerPayout: 900,
    pmCommission: 15,
    techFees: 50,
    insuranceFees: 25,
    adjustments: 0,
    status: 'draft',
    sentAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    calculationType: 'checkout',
    ...overrides,
  });

  const defaultProps = {
    statements: [createMockStatement()],
    loading: false,
    onAction: jest.fn(),
    onBulkAction: jest.fn(),
    pagination: { pageIndex: 0, pageSize: 15, total: 1 },
    onPaginationChange: jest.fn(),
    owners: [],
    listings: [],
    typeFilter: 'all' as const,
    onTypeFilterChange: jest.fn(),
    statusFilter: 'all' as const,
    onStatusFilterChange: jest.fn(),
    markerFilter: [],
    onMarkerFilterChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Revert to Draft Button', () => {
    it('should disable "Revert to Draft" button when status is "draft"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'draft' })]}
        />
      );

      // Find the revert button by its tooltip or icon
      const revertButton = screen.getByTitle('Already Draft');
      expect(revertButton).toBeDisabled();
    });

    it('should disable "Revert to Draft" button when status is "sent"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'sent' })]}
        />
      );

      const revertButton = screen.getByTitle('Cannot revert sent statement');
      expect(revertButton).toBeDisabled();
    });

    it('should enable "Revert to Draft" button when status is "final"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'final' })]}
        />
      );

      const revertButton = screen.getByTitle('Return to Draft');
      expect(revertButton).not.toBeDisabled();
    });

    it('should enable "Revert to Draft" button when status is "paid"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'paid' })]}
        />
      );

      const revertButton = screen.getByTitle('Return to Draft');
      expect(revertButton).not.toBeDisabled();
    });

    it('should call onAction with "revert-to-draft" when clicked', () => {
      const onAction = jest.fn();
      render(
        <StatementsTable
          {...defaultProps}
          onAction={onAction}
          statements={[createMockStatement({ id: 123, status: 'final' })]}
        />
      );

      const revertButton = screen.getByTitle('Return to Draft');
      fireEvent.click(revertButton);

      expect(onAction).toHaveBeenCalledWith(123, 'revert-to-draft');
    });
  });

  describe('Delete Button', () => {
    it('should enable delete button when status is "draft"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'draft' })]}
        />
      );

      const deleteButton = screen.getByTitle('Delete');
      expect(deleteButton).not.toBeDisabled();
    });

    it('should disable delete button when status is "sent"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'sent' })]}
        />
      );

      const deleteButton = screen.getByTitle('Cannot Delete Final Statement');
      expect(deleteButton).toBeDisabled();
    });

    it('should disable delete button when status is "final"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'final' })]}
        />
      );

      const deleteButton = screen.getByTitle('Cannot Delete Final Statement');
      expect(deleteButton).toBeDisabled();
    });
  });

  describe('Finalize Button', () => {
    it('should enable finalize button when status is "draft"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'draft' })]}
        />
      );

      const finalizeButton = screen.getByTitle('Mark as Final');
      expect(finalizeButton).not.toBeDisabled();
    });

    it('should disable finalize button when status is "final"', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: 'final' })]}
        />
      );

      const finalizeButton = screen.getByTitle('Already Final');
      expect(finalizeButton).toBeDisabled();
    });
  });

  describe('Cancelled Reservations Icon', () => {
    it('should show info icon when cancelledReservationCount > 0', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ cancelledReservationCount: 2 })]}
        />
      );

      // The icon should be present - we can check for the tooltip text
      expect(screen.getByText('2 cancelled reservations in period')).toBeInTheDocument();
    });

    it('should not show info icon when cancelledReservationCount is 0', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ cancelledReservationCount: 0 })]}
        />
      );

      expect(screen.queryByText(/cancelled reservations? in period/)).not.toBeInTheDocument();
    });

    it('should not show info icon when cancelledReservationCount is undefined', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement()]}
        />
      );

      expect(screen.queryByText(/cancelled reservations? in period/)).not.toBeInTheDocument();
    });

    it('should show singular "reservation" for count of 1', () => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ cancelledReservationCount: 1 })]}
        />
      );

      expect(screen.getByText('1 cancelled reservation in period')).toBeInTheDocument();
    });
  });

  describe('Status Badge', () => {
    it.each([
      ['draft', 'Draft'],
      ['final', 'Final'],
      ['sent', 'Sent'],
      ['paid', 'Paid'],
    ])('should display correct badge for %s status', (status, expectedText) => {
      render(
        <StatementsTable
          {...defaultProps}
          statements={[createMockStatement({ status: status as Statement['status'] })]}
        />
      );

      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when loading is true', () => {
      render(
        <StatementsTable
          {...defaultProps}
          loading={true}
          statements={[]}
        />
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty message when no statements', () => {
      render(
        <StatementsTable
          {...defaultProps}
          loading={false}
          statements={[]}
        />
      );

      expect(screen.getByText(/no statements/i)).toBeInTheDocument();
    });
  });
});
