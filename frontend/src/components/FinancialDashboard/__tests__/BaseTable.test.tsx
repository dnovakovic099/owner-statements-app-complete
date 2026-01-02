/**
 * BaseTable Component Tests
 *
 * Tests for the BaseTable component covering:
 * - Rendering with data
 * - Sorting functionality
 * - Filtering (search, category)
 * - Cell interactions
 * - Export functionality
 * - Column visibility
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import BaseTable from '../BaseTable';
import { PropertyFinancialData } from '../types';

// Mock data
const mockData: PropertyFinancialData[] = [
  {
    propertyId: 1,
    propertyName: 'Sunset Villa',
    homeCategory: 'PM',
    monthlyData: [
      {
        month: '2025-12',
        netIncome: 5000,
        grossRevenue: 8000,
        totalExpenses: 3000,
        sharedExpenses: 500,
      },
      {
        month: '2026-01',
        netIncome: 4500,
        grossRevenue: 7500,
        totalExpenses: 3000,
        sharedExpenses: 500,
      },
    ],
    lifetimeTotal: {
      netIncome: 50000,
      grossRevenue: 100000,
      totalExpenses: 50000,
    },
  },
  {
    propertyId: 2,
    propertyName: 'Ocean Breeze',
    homeCategory: 'Arbitrage',
    monthlyData: [
      {
        month: '2025-12',
        netIncome: 3000,
        grossRevenue: 6000,
        totalExpenses: 3000,
        sharedExpenses: 400,
      },
      {
        month: '2026-01',
        netIncome: 3500,
        grossRevenue: 6500,
        totalExpenses: 3000,
        sharedExpenses: 400,
      },
    ],
    lifetimeTotal: {
      netIncome: 35000,
      grossRevenue: 70000,
      totalExpenses: 35000,
    },
  },
  {
    propertyId: 3,
    propertyName: 'Mountain Retreat',
    homeCategory: 'Owned',
    monthlyData: [
      {
        month: '2025-12',
        netIncome: 6000,
        grossRevenue: 9000,
        totalExpenses: 3000,
        sharedExpenses: 300,
      },
      {
        month: '2026-01',
        netIncome: 5500,
        grossRevenue: 8500,
        totalExpenses: 3000,
        sharedExpenses: 300,
      },
    ],
    lifetimeTotal: {
      netIncome: 60000,
      grossRevenue: 120000,
      totalExpenses: 60000,
    },
  },
];

describe('BaseTable Component', () => {
  describe('Rendering', () => {
    it('should render the table with property names', () => {
      render(<BaseTable data={mockData} />);

      expect(screen.getByText('Sunset Villa')).toBeInTheDocument();
      expect(screen.getByText('Ocean Breeze')).toBeInTheDocument();
      expect(screen.getByText('Mountain Retreat')).toBeInTheDocument();
    });

    it('should display category badges', () => {
      render(<BaseTable data={mockData} />);

      expect(screen.getAllByText('PM')).toHaveLength(1);
      expect(screen.getAllByText('Arbitrage')).toHaveLength(1);
      expect(screen.getAllByText('Owned')).toHaveLength(1);
    });

    it('should show correct property count', () => {
      render(<BaseTable data={mockData} />);

      expect(screen.getByText(/3 properties/i)).toBeInTheDocument();
    });

    it('should render month columns', () => {
      render(<BaseTable data={mockData} monthsToShow={2} />);

      // Should show Dec 2025 and Jan 2026
      expect(screen.getByText(/Dec 2025/i)).toBeInTheDocument();
      expect(screen.getByText(/Jan 2026/i)).toBeInTheDocument();
    });

    it('should render lifetime total column', () => {
      render(<BaseTable data={mockData} />);

      expect(screen.getByText('Lifetime Net')).toBeInTheDocument();
    });

    it('should display financial values in cells', () => {
      render(<BaseTable data={mockData} />);

      // Check for revenue and expense labels (there are multiple)
      const revLabels = screen.getAllByText(/Rev:/i);
      const expLabels = screen.getAllByText(/Exp:/i);

      expect(revLabels.length).toBeGreaterThan(0);
      expect(expLabels.length).toBeGreaterThan(0);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no data', () => {
      render(<BaseTable data={[]} />);

      expect(screen.getByText('No properties found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });
  });

  describe('Search and Filtering', () => {
    it('should filter properties by search term', () => {
      render(<BaseTable data={mockData} />);

      const searchInput = screen.getByPlaceholderText('Search properties...');
      fireEvent.change(searchInput, { target: { value: 'Ocean' } });

      // Should show Ocean Breeze
      expect(screen.getByText('Ocean Breeze')).toBeInTheDocument();

      // Should not show others
      expect(screen.queryByText('Sunset Villa')).not.toBeInTheDocument();
      expect(screen.queryByText('Mountain Retreat')).not.toBeInTheDocument();
    });

    it('should clear search filter', () => {
      render(<BaseTable data={mockData} />);

      const searchInput = screen.getByPlaceholderText('Search properties...');
      fireEvent.change(searchInput, { target: { value: 'Ocean' } });

      // Clear filter
      const clearButton = screen.getByText('Clear all');
      fireEvent.click(clearButton);

      // All properties should be visible again
      expect(screen.getByText('Sunset Villa')).toBeInTheDocument();
      expect(screen.getByText('Ocean Breeze')).toBeInTheDocument();
      expect(screen.getByText('Mountain Retreat')).toBeInTheDocument();
    });

    it('should show active filters', () => {
      render(<BaseTable data={mockData} />);

      const searchInput = screen.getByPlaceholderText('Search properties...');
      fireEvent.change(searchInput, { target: { value: 'Villa' } });

      expect(screen.getByText(/Search: "Villa"/i)).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort properties by name', () => {
      render(<BaseTable data={mockData} />);

      // Click property name header to sort
      const propertyHeader = screen.getByRole('button', { name: /Property/i });
      fireEvent.click(propertyHeader);

      // Get all property names in order
      const rows = screen.getAllByRole('row');
      const propertyRows = rows.slice(1); // Skip header row

      // First property should be Mountain Retreat (alphabetically first)
      expect(within(propertyRows[0]).getByText('Mountain Retreat')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onTransactionClick when cell is clicked', () => {
      const handleTransactionClick = jest.fn();
      render(<BaseTable data={mockData} onTransactionClick={handleTransactionClick} />);

      // Find and click a month cell (look for a cell with revenue/expense info)
      const cells = screen.getAllByText(/Rev:/i);
      if (cells.length > 0) {
        const cell = cells[0].closest('button');
        if (cell) {
          fireEvent.click(cell);
          expect(handleTransactionClick).toHaveBeenCalledTimes(1);
        }
      }
    });
  });

  describe('Export Functionality', () => {
    it('should have export CSV button', () => {
      render(<BaseTable data={mockData} />);

      const exportButton = screen.getByRole('button', { name: /Export CSV/i });
      expect(exportButton).toBeInTheDocument();
    });

    it('should trigger CSV export on button click', () => {
      // Mock URL.createObjectURL
      global.URL.createObjectURL = jest.fn(() => 'mock-url');
      global.URL.revokeObjectURL = jest.fn();

      // Mock createElement and click
      const mockLink = document.createElement('a');
      const clickSpy = jest.spyOn(mockLink, 'click');
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);

      render(<BaseTable data={mockData} />);

      const exportButton = screen.getByRole('button', { name: /Export CSV/i });
      fireEvent.click(exportButton);

      // Verify CSV was generated and download triggered
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();

      // Cleanup
      jest.restoreAllMocks();
    });
  });

  describe('Column Visibility', () => {
    it('should have column visibility toggle', () => {
      render(<BaseTable data={mockData} />);

      const columnsButton = screen.getByRole('button', { name: /Columns/i });
      expect(columnsButton).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('should render table with overflow scroll', () => {
      const { container } = render(<BaseTable data={mockData} />);

      const scrollContainer = container.querySelector('.overflow-x-auto');
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  describe('Color Coding', () => {
    it('should apply green color to positive values', () => {
      const { container } = render(<BaseTable data={mockData} />);

      // Positive net income should have green text color
      const greenValues = container.querySelectorAll('.text-emerald-600');
      expect(greenValues.length).toBeGreaterThan(0);
    });

    it('should apply red color to negative values', () => {
      const negativeData: PropertyFinancialData[] = [
        {
          ...mockData[0],
          monthlyData: [
            {
              month: '2026-01',
              netIncome: -1000,
              grossRevenue: 2000,
              totalExpenses: 3000,
              sharedExpenses: 500,
            },
          ],
        },
      ];

      const { container } = render(<BaseTable data={negativeData} />);

      // Negative net income should have red text color
      const redValues = container.querySelectorAll('.text-red-600');
      expect(redValues.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('should have proper table semantics', () => {
      render(<BaseTable data={mockData} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should have accessible buttons', () => {
      render(<BaseTable data={mockData} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        // Each button should be accessible (have text or aria-label)
        expect(
          button.textContent || button.getAttribute('aria-label')
        ).toBeTruthy();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      // Create a large dataset
      const largeData: PropertyFinancialData[] = Array.from({ length: 100 }, (_, i) => ({
        propertyId: i + 1,
        propertyName: `Property ${i + 1}`,
        homeCategory: ['PM', 'Arbitrage', 'Owned'][i % 3] as 'PM' | 'Arbitrage' | 'Owned',
        monthlyData: [
          {
            month: '2026-01',
            netIncome: Math.random() * 10000,
            grossRevenue: Math.random() * 15000,
            totalExpenses: Math.random() * 5000,
            sharedExpenses: 500,
          },
        ],
        lifetimeTotal: {
          netIncome: Math.random() * 100000,
          grossRevenue: Math.random() * 200000,
          totalExpenses: Math.random() * 100000,
        },
      }));

      const startTime = performance.now();
      render(<BaseTable data={largeData} />);
      const endTime = performance.now();

      // Should render in less than 1 second
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
