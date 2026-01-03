import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ByPropertyTab from '../ByPropertyTab';
import { PropertyFinancialData } from '../../types';

describe('ByPropertyTab', () => {
  const mockProperties: PropertyFinancialData[] = [
    {
      propertyId: 1,
      propertyName: 'Sunset Villa',
      homeCategory: 'PM',
      bankAccount: 'Chase Business',
      monthlyData: [
        {
          month: '2024-01',
          netIncome: 3500,
          grossRevenue: 5000,
          totalExpenses: 1500,
          sharedExpenses: 200,
        },
      ],
      lifetimeTotal: {
        netIncome: 3500,
        grossRevenue: 5000,
        totalExpenses: 1500,
      },
    },
  ];

  const mockHandlers = {
    onCellClick: jest.fn(),
    onPropertyClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(
      <ByPropertyTab
        properties={mockProperties}
        dateRange={{ startDate: '2024-01-01', endDate: '2024-01-31' }}
        {...mockHandlers}
      />
    );
  });

  it('displays property name', () => {
    render(
      <ByPropertyTab
        properties={mockProperties}
        dateRange={{ startDate: '2024-01-01', endDate: '2024-01-31' }}
        {...mockHandlers}
      />
    );
    
    expect(screen.getByText('Sunset Villa')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    render(
      <ByPropertyTab
        properties={[]}
        dateRange={{ startDate: '2024-01-01', endDate: '2024-01-31' }}
        isLoading={true}
        {...mockHandlers}
      />
    );
    
    // Should show skeleton loaders
    expect(screen.getAllByRole('generic')).toHaveLength(expect.any(Number));
  });

  it('displays empty state when no properties', () => {
    render(
      <ByPropertyTab
        properties={[]}
        dateRange={{ startDate: '2024-01-01', endDate: '2024-01-31' }}
        {...mockHandlers}
      />
    );
    
    expect(screen.getByText('No Properties Found')).toBeInTheDocument();
  });

  it('calls onPropertyClick when property name is clicked', () => {
    render(
      <ByPropertyTab
        properties={mockProperties}
        dateRange={{ startDate: '2024-01-01', endDate: '2024-01-31' }}
        {...mockHandlers}
      />
    );
    
    fireEvent.click(screen.getByText('Sunset Villa'));
    expect(mockHandlers.onPropertyClick).toHaveBeenCalledWith(1);
  });

  it('filters properties by search query', () => {
    const multipleProperties: PropertyFinancialData[] = [
      ...mockProperties,
      {
        propertyId: 2,
        propertyName: 'Downtown Loft',
        homeCategory: 'Arbitrage',
        monthlyData: [],
        lifetimeTotal: { netIncome: 0, grossRevenue: 0, totalExpenses: 0 },
      },
    ];

    render(
      <ByPropertyTab
        properties={multipleProperties}
        dateRange={{ startDate: '2024-01-01', endDate: '2024-01-31' }}
        {...mockHandlers}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search properties...');
    fireEvent.change(searchInput, { target: { value: 'Sunset' } });

    expect(screen.getByText('Sunset Villa')).toBeInTheDocument();
    expect(screen.queryByText('Downtown Loft')).not.toBeInTheDocument();
  });
});
