import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ByHomeTypeTab, { ByHomeTypeData, DateRange } from '../ByHomeTypeTab';

describe('ByHomeTypeTab', () => {
  const mockData: ByHomeTypeData = {
    pm: {
      income: [
        { label: 'PM Income', amount: 45000, percentage: 75 },
        { label: 'Claims', amount: 15000, percentage: 25 },
      ],
      expenses: [
        { label: 'Ads', amount: 8000, percentage: 20 },
        { label: 'Sales Commission', amount: 12000, percentage: 30 },
      ],
      churn: {
        count: 12,
        rate: 8.5,
      },
      monthlyTrend: [
        { month: '2024-01', income: 58000, expenses: 38000, netIncome: 20000 },
        { month: '2024-02', income: 62000, expenses: 40000, netIncome: 22000 },
      ],
    },
    arbitrage: {
      income: [{ label: 'Rental Income', amount: 85000, percentage: 100 }],
      expenses: [
        { label: 'Rent', amount: 45000, percentage: 50 },
        { label: 'Utilities', amount: 8000, percentage: 8.9 },
      ],
      monthlyTrend: [
        { month: '2024-01', income: 80000, expenses: 88000, netIncome: -8000 },
      ],
    },
    owned: {
      income: [{ label: 'Rental Income', amount: 95000, percentage: 100 }],
      expenses: [
        { label: 'Mortgage', amount: 35000, percentage: 50 },
        { label: 'Utilities', amount: 6000, percentage: 8.6 },
      ],
      monthlyTrend: [
        { month: '2024-01', income: 92000, expenses: 68000, netIncome: 24000 },
      ],
    },
    shared: {
      employeeCosts: [
        { label: 'Onboarding', amount: 15000, percentage: 12 },
        { label: 'Client Relations', amount: 18000, percentage: 14.4 },
      ],
      refunds: 8500,
      chargebacks: 3200,
      monthlyTrend: [
        { month: '2024-01', income: 0, expenses: 120000, netIncome: -120000 },
      ],
    },
  };

  const mockDateRange: DateRange = {
    startDate: '2024-01-01',
    endDate: '2024-06-30',
  };

  const mockOnItemClick = jest.fn();

  beforeEach(() => {
    mockOnItemClick.mockClear();
  });

  it('renders category selector with all four categories', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    expect(screen.getByText('Property Management')).toBeInTheDocument();
    expect(screen.getByText('Arbitrage')).toBeInTheDocument();
    expect(screen.getByText('Home Owned')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('defaults to Property Management category', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    expect(screen.getByText('Income Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Expense Breakdown')).toBeInTheDocument();
    expect(screen.getByText('PM Income')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
  });

  it('displays churn metrics for PM category', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    expect(screen.getByText('Churn Metrics')).toBeInTheDocument();
    expect(screen.getByText('Churn Count:')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Churn Rate:')).toBeInTheDocument();
  });

  it('switches to Arbitrage category when clicked', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    const arbitrageButton = screen.getByText('Arbitrage');
    fireEvent.click(arbitrageButton);

    expect(screen.getByText('Rental Income')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Utilities')).toBeInTheDocument();
  });

  it('switches to Home Owned category when clicked', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    const ownedButton = screen.getByText('Home Owned');
    fireEvent.click(ownedButton);

    expect(screen.getByText('Mortgage')).toBeInTheDocument();
  });

  it('switches to Shared category and shows employee costs', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    const sharedButton = screen.getByText('Shared');
    fireEvent.click(sharedButton);

    expect(screen.getByText('Employee Costs by Department')).toBeInTheDocument();
    expect(screen.getByText('Other Costs')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Chargebacks')).toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('Client Relations')).toBeInTheDocument();
  });

  it('displays monthly trend chart', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    expect(screen.getByText('Monthly Trend')).toBeInTheDocument();
  });

  it('calls onItemClick when an income item is clicked', () => {
    render(
      <ByHomeTypeTab
        data={mockData}
        dateRange={mockDateRange}
        onItemClick={mockOnItemClick}
      />
    );

    const pmIncomeItem = screen.getByText('PM Income');
    fireEvent.click(pmIncomeItem);

    expect(mockOnItemClick).toHaveBeenCalledWith('Property Management', 'income', 'PM Income');
  });

  it('calls onItemClick when an expense item is clicked', () => {
    render(
      <ByHomeTypeTab
        data={mockData}
        dateRange={mockDateRange}
        onItemClick={mockOnItemClick}
      />
    );

    const adsExpenseItem = screen.getByText('Ads');
    fireEvent.click(adsExpenseItem);

    expect(mockOnItemClick).toHaveBeenCalledWith('Property Management', 'expense', 'Ads');
  });

  it('formats currency correctly', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    // PM Income total should be $60,000 (45000 + 15000)
    expect(screen.getByText('$60,000')).toBeInTheDocument();
    // PM Expenses total should be $20,000 (8000 + 12000)
    expect(screen.getByText('$20,000')).toBeInTheDocument();
  });

  it('displays percentage contributions', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    expect(screen.getByText('75.0%')).toBeInTheDocument(); // PM Income percentage
    expect(screen.getByText('25.0%')).toBeInTheDocument(); // Claims percentage
  });

  it('shows shared expense summary correctly', () => {
    render(<ByHomeTypeTab data={mockData} dateRange={mockDateRange} />);

    const sharedButton = screen.getByText('Shared');
    fireEvent.click(sharedButton);

    // Refunds + Chargebacks = 8500 + 3200 = 11700
    expect(screen.getByText('$8,500')).toBeInTheDocument();
    expect(screen.getByText('$3,200')).toBeInTheDocument();
    expect(screen.getByText('$11,700')).toBeInTheDocument(); // Total Other Costs

    // Employee costs = 15000 + 18000 = 33000
    expect(screen.getByText('$33,000')).toBeInTheDocument();

    // Total Shared Expenses = 33000 + 11700 = 44700
    expect(screen.getByText('$44,700')).toBeInTheDocument();
  });

  it('renders empty state when no items are present', () => {
    const emptyData: ByHomeTypeData = {
      ...mockData,
      pm: {
        ...mockData.pm,
        income: [],
        expenses: [],
      },
    };

    render(<ByHomeTypeTab data={emptyData} dateRange={mockDateRange} />);

    expect(screen.getAllByText('No items to display')).toHaveLength(2);
  });

  it('handles empty trend data gracefully', () => {
    const noTrendData: ByHomeTypeData = {
      ...mockData,
      pm: {
        ...mockData.pm,
        monthlyTrend: [],
      },
    };

    render(<ByHomeTypeTab data={noTrendData} dateRange={mockDateRange} />);

    expect(screen.getByText('No trend data available')).toBeInTheDocument();
  });
});
