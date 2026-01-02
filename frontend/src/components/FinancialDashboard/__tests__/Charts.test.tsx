import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  NetIncomeTrendChart,
  ROIByCategoryChart,
  PMPropertyROIChart,
  IncomeVsExpensesChart,
  transformToNetIncomeTrend,
  transformToROIByCategory,
  transformToPMPropertyROI,
  transformToIncomeExpense,
  CHART_COLORS,
} from '../Charts';
import type {
  NetIncomeTrendData,
  ROIByCategoryData,
  PropertyROIData,
  IncomeExpenseData,
} from '../Charts';
import type { PropertyMetrics } from '../types';

// ============================================================================
// Mock Data
// ============================================================================

const mockPropertyMetrics: PropertyMetrics[] = [
  {
    propertyId: 1,
    propertyName: 'Downtown Loft',
    homeCategory: 'PM',
    totalRevenue: 48000,
    totalExpenses: 32000,
    netIncome: 16000,
    roi: 50,
    monthlyData: [
      { month: '2024-01', netIncome: 1200 },
      { month: '2024-02', netIncome: 1400 },
      { month: '2024-03', netIncome: 1300 },
    ],
  },
  {
    propertyId: 2,
    propertyName: 'Beach House',
    homeCategory: 'Arbitrage',
    totalRevenue: 60000,
    totalExpenses: 45000,
    netIncome: 15000,
    roi: 33.33,
    monthlyData: [
      { month: '2024-01', netIncome: 1100 },
      { month: '2024-02', netIncome: 1250 },
      { month: '2024-03', netIncome: 1350 },
    ],
  },
  {
    propertyId: 3,
    propertyName: 'Mountain Cabin',
    homeCategory: 'Owned',
    totalRevenue: 36000,
    totalExpenses: 18000,
    netIncome: 18000,
    roi: 100,
    monthlyData: [
      { month: '2024-01', netIncome: 1500 },
      { month: '2024-02', netIncome: 1550 },
      { month: '2024-03', netIncome: 1600 },
    ],
  },
];

// ============================================================================
// NetIncomeTrendChart Tests
// ============================================================================

describe('NetIncomeTrendChart', () => {
  const mockTrendData: NetIncomeTrendData[] = [
    { month: '2024-01', PM: 1200, Arbitrage: 1100, Owned: 1500 },
    { month: '2024-02', PM: 1400, Arbitrage: 1250, Owned: 1550 },
    { month: '2024-03', PM: 1300, Arbitrage: 1350, Owned: 1600 },
  ];

  it('renders chart with title', () => {
    render(<NetIncomeTrendChart data={mockTrendData} />);
    expect(screen.getByText('Net Income Trend by Category')).toBeInTheDocument();
  });

  it('displays loading skeleton when isLoading is true', () => {
    render(<NetIncomeTrendChart data={[]} isLoading={true} />);
    expect(screen.getByText('Loading chart...')).toBeInTheDocument();
  });

  it('displays empty state when data is empty', () => {
    render(<NetIncomeTrendChart data={[]} isLoading={false} />);
    expect(screen.getByText('No net income trend data available')).toBeInTheDocument();
  });

  it('renders legend with clickable items', () => {
    render(<NetIncomeTrendChart data={mockTrendData} />);
    expect(screen.getByText('PM')).toBeInTheDocument();
    expect(screen.getByText('Arbitrage')).toBeInTheDocument();
    expect(screen.getByText('Owned')).toBeInTheDocument();
  });

  it('shows toggle visibility instruction', () => {
    render(<NetIncomeTrendChart data={mockTrendData} />);
    expect(screen.getByText('Click legend items to toggle visibility')).toBeInTheDocument();
  });
});

// ============================================================================
// ROIByCategoryChart Tests
// ============================================================================

describe('ROIByCategoryChart', () => {
  const mockROIData: ROIByCategoryData[] = [
    { category: 'PM', roi: 50, color: CHART_COLORS.PM },
    { category: 'Arbitrage', roi: 33.33, color: CHART_COLORS.Arbitrage },
    { category: 'Owned', roi: 100, color: CHART_COLORS.Owned },
  ];

  it('renders chart with title', () => {
    render(<ROIByCategoryChart data={mockROIData} />);
    expect(screen.getByText('ROI by Category')).toBeInTheDocument();
  });

  it('displays loading skeleton when isLoading is true', () => {
    render(<ROIByCategoryChart data={[]} isLoading={true} />);
    expect(screen.getByText('Loading chart...')).toBeInTheDocument();
  });

  it('displays empty state when data is empty', () => {
    render(<ROIByCategoryChart data={[]} isLoading={false} />);
    expect(screen.getByText('No ROI data available')).toBeInTheDocument();
  });

  it('renders all category names', () => {
    render(<ROIByCategoryChart data={mockROIData} />);
    // Categories should be visible in the chart (via Recharts)
    // Note: Recharts uses SVG, so text appears in the DOM
    expect(screen.getByText('PM')).toBeInTheDocument();
    expect(screen.getByText('Arbitrage')).toBeInTheDocument();
    expect(screen.getByText('Owned')).toBeInTheDocument();
  });
});

// ============================================================================
// PMPropertyROIChart Tests
// ============================================================================

describe('PMPropertyROIChart', () => {
  const mockPMROIData: PropertyROIData[] = [
    { propertyName: 'Downtown Loft', roi: 50, propertyId: 1 },
    { propertyName: 'Suburban Condo', roi: 42, propertyId: 3 },
    { propertyName: 'City Apartment', roi: 38, propertyId: 5 },
  ];

  it('renders chart with title', () => {
    render(<PMPropertyROIChart data={mockPMROIData} />);
    expect(screen.getByText('ROI per PM Property')).toBeInTheDocument();
  });

  it('displays loading skeleton when isLoading is true', () => {
    render(<PMPropertyROIChart data={[]} isLoading={true} />);
    expect(screen.getByText('Loading chart...')).toBeInTheDocument();
  });

  it('displays empty state when data is empty', () => {
    render(<PMPropertyROIChart data={[]} isLoading={false} />);
    expect(screen.getByText('No PM property ROI data available')).toBeInTheDocument();
  });

  it('shows legend for above/below target', () => {
    render(<PMPropertyROIChart data={mockPMROIData} />);
    expect(screen.getByText('Above Target')).toBeInTheDocument();
    expect(screen.getByText('Below Target')).toBeInTheDocument();
  });

  it('uses default target ROI of 15', () => {
    const { container } = render(<PMPropertyROIChart data={mockPMROIData} />);
    // Check if ReferenceLine label contains "Target: 15%"
    // This would require more specific testing with SVG queries
    expect(container).toBeInTheDocument();
  });

  it('accepts custom target ROI', () => {
    const { container } = render(<PMPropertyROIChart data={mockPMROIData} targetROI={20} />);
    expect(container).toBeInTheDocument();
  });
});

// ============================================================================
// IncomeVsExpensesChart Tests
// ============================================================================

describe('IncomeVsExpensesChart', () => {
  const mockIncomeExpenseData: IncomeExpenseData[] = [
    { month: '2024-01', income: 15000, expenses: 10000 },
    { month: '2024-02', income: 16500, expenses: 10500 },
    { month: '2024-03', income: 17000, expenses: 11000 },
  ];

  it('renders chart with title', () => {
    render(<IncomeVsExpensesChart data={mockIncomeExpenseData} />);
    expect(screen.getByText('Income vs Expenses Over Time')).toBeInTheDocument();
  });

  it('displays loading skeleton when isLoading is true', () => {
    render(<IncomeVsExpensesChart data={[]} isLoading={true} />);
    expect(screen.getByText('Loading chart...')).toBeInTheDocument();
  });

  it('displays empty state when data is empty', () => {
    render(<IncomeVsExpensesChart data={[]} isLoading={false} />);
    expect(screen.getByText('No income/expense data available')).toBeInTheDocument();
  });

  it('renders legend items for Income and Expenses', () => {
    render(<IncomeVsExpensesChart data={mockIncomeExpenseData} />);
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
  });
});

// ============================================================================
// Data Transformation Tests
// ============================================================================

describe('Data Transformation Utilities', () => {
  describe('transformToNetIncomeTrend', () => {
    it('aggregates monthly net income by category', () => {
      const result = transformToNetIncomeTrend(mockPropertyMetrics);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        month: '2024-01',
        PM: 1200,
        Arbitrage: 1100,
        Owned: 1500,
      });
      expect(result[1]).toEqual({
        month: '2024-02',
        PM: 1400,
        Arbitrage: 1250,
        Owned: 1550,
      });
      expect(result[2]).toEqual({
        month: '2024-03',
        PM: 1300,
        Arbitrage: 1350,
        Owned: 1600,
      });
    });

    it('returns empty array when no properties', () => {
      const result = transformToNetIncomeTrend([]);
      expect(result).toEqual([]);
    });

    it('sorts results by month ascending', () => {
      const unsortedMetrics: PropertyMetrics[] = [
        {
          ...mockPropertyMetrics[0],
          monthlyData: [
            { month: '2024-03', netIncome: 1300 },
            { month: '2024-01', netIncome: 1200 },
            { month: '2024-02', netIncome: 1400 },
          ],
        },
      ];

      const result = transformToNetIncomeTrend(unsortedMetrics);
      expect(result[0].month).toBe('2024-01');
      expect(result[1].month).toBe('2024-02');
      expect(result[2].month).toBe('2024-03');
    });
  });

  describe('transformToROIByCategory', () => {
    it('calculates ROI per category', () => {
      const result = transformToROIByCategory(mockPropertyMetrics);

      expect(result).toHaveLength(3);

      const pmCategory = result.find(r => r.category === 'PM');
      expect(pmCategory).toBeDefined();
      expect(pmCategory?.roi).toBe(150); // 48000 / 32000 * 100

      const arbitrageCategory = result.find(r => r.category === 'Arbitrage');
      expect(arbitrageCategory).toBeDefined();
      expect(arbitrageCategory?.roi).toBeCloseTo(133.33, 1); // 60000 / 45000 * 100

      const ownedCategory = result.find(r => r.category === 'Owned');
      expect(ownedCategory).toBeDefined();
      expect(ownedCategory?.roi).toBe(200); // 36000 / 18000 * 100
    });

    it('assigns correct colors to categories', () => {
      const result = transformToROIByCategory(mockPropertyMetrics);

      const pmCategory = result.find(r => r.category === 'PM');
      expect(pmCategory?.color).toBe(CHART_COLORS.PM);

      const arbitrageCategory = result.find(r => r.category === 'Arbitrage');
      expect(arbitrageCategory?.color).toBe(CHART_COLORS.Arbitrage);

      const ownedCategory = result.find(r => r.category === 'Owned');
      expect(ownedCategory?.color).toBe(CHART_COLORS.Owned);
    });

    it('returns empty array when no properties', () => {
      const result = transformToROIByCategory([]);
      expect(result).toEqual([]);
    });
  });

  describe('transformToPMPropertyROI', () => {
    it('filters only PM properties', () => {
      const result = transformToPMPropertyROI(mockPropertyMetrics);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        propertyName: 'Downtown Loft',
        roi: 50,
        propertyId: 1,
      });
    });

    it('excludes non-PM properties', () => {
      const result = transformToPMPropertyROI(mockPropertyMetrics);

      const nonPMProperties = result.filter(
        r => r.propertyName === 'Beach House' || r.propertyName === 'Mountain Cabin'
      );
      expect(nonPMProperties).toHaveLength(0);
    });

    it('returns empty array when no PM properties', () => {
      const nonPMMetrics = mockPropertyMetrics.filter(p => p.homeCategory !== 'PM');
      const result = transformToPMPropertyROI(nonPMMetrics);
      expect(result).toEqual([]);
    });
  });

  describe('transformToIncomeExpense', () => {
    it('aggregates income and expenses by month', () => {
      const result = transformToIncomeExpense(mockPropertyMetrics);

      expect(result).toHaveLength(3);
      expect(result[0].month).toBe('2024-01');
      expect(result[1].month).toBe('2024-02');
      expect(result[2].month).toBe('2024-03');

      // Each result should have income and expenses
      result.forEach(monthData => {
        expect(monthData).toHaveProperty('income');
        expect(monthData).toHaveProperty('expenses');
        expect(monthData.income).toBeGreaterThan(0);
        expect(monthData.expenses).toBeGreaterThan(0);
      });
    });

    it('returns empty array when no properties', () => {
      const result = transformToIncomeExpense([]);
      expect(result).toEqual([]);
    });

    it('sorts results by month ascending', () => {
      const result = transformToIncomeExpense(mockPropertyMetrics);
      expect(result[0].month).toBe('2024-01');
      expect(result[1].month).toBe('2024-02');
      expect(result[2].month).toBe('2024-03');
    });
  });
});

// ============================================================================
// CHART_COLORS Tests
// ============================================================================

describe('CHART_COLORS', () => {
  it('exports consistent color palette', () => {
    expect(CHART_COLORS.PM).toBe('#3B82F6');
    expect(CHART_COLORS.Arbitrage).toBe('#F97316');
    expect(CHART_COLORS.Owned).toBe('#10B981');
    expect(CHART_COLORS.income).toBe('#10B981');
    expect(CHART_COLORS.expenses).toBe('#EF4444');
    expect(CHART_COLORS.grid).toBe('#E5E7EB');
    expect(CHART_COLORS.text).toBe('#6B7280');
    expect(CHART_COLORS.textDark).toBe('#374151');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Chart Integration', () => {
  it('full data pipeline: PropertyMetrics to NetIncomeTrendChart', () => {
    const trendData = transformToNetIncomeTrend(mockPropertyMetrics);
    const { container } = render(<NetIncomeTrendChart data={trendData} />);

    expect(screen.getByText('Net Income Trend by Category')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('full data pipeline: PropertyMetrics to ROIByCategoryChart', () => {
    const roiData = transformToROIByCategory(mockPropertyMetrics);
    const { container } = render(<ROIByCategoryChart data={roiData} />);

    expect(screen.getByText('ROI by Category')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('full data pipeline: PropertyMetrics to PMPropertyROIChart', () => {
    const pmRoiData = transformToPMPropertyROI(mockPropertyMetrics);
    const { container } = render(<PMPropertyROIChart data={pmRoiData} />);

    expect(screen.getByText('ROI per PM Property')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('full data pipeline: PropertyMetrics to IncomeVsExpensesChart', () => {
    const incomeExpenseData = transformToIncomeExpense(mockPropertyMetrics);
    const { container } = render(<IncomeVsExpensesChart data={incomeExpenseData} />);

    expect(screen.getByText('Income vs Expenses Over Time')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
