/**
 * Financial Calculations Utility Functions
 *
 * This module provides type-safe, pure functions for calculating shared expenses,
 * ROI metrics, and financial aggregations in the financial dashboard.
 *
 * @module financialCalculations
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Home category classification for properties
 */
export type HomeCategory = 'PM' | 'Arbitrage' | 'Owned';

/**
 * Time period for aggregations
 */
export type TimePeriod = 'monthly' | 'quarterly' | 'yearly';

/**
 * Sales-related expenses used in Sales Cost per Property calculation
 */
export interface SalesExpenses {
  /** Total advertising spend */
  ads: number;
  /** Total sales team compensation */
  salesPay: number;
  /** Total onboarding costs */
  onboarding: number;
}

/**
 * Operating expenses breakdown
 */
export interface OperatingExpenses {
  /** Total employee payouts (excluding sales team) */
  employeePayout: number;
  /** Sales team payout (deducted from total for OpEx calculation) */
  salesPayout: number;
  /** Total software/SaaS costs */
  software: number;
  /** Other miscellaneous expenses */
  other: number;
}

/**
 * Property counts by category
 */
export interface PropertyCounts {
  /** Total number of properties under management */
  total: number;
  /** Number of properties closed/acquired in the period */
  closed: number;
  /** Properties by home category */
  byCategory: Record<HomeCategory, number>;
}

/**
 * Investment data for ROI calculations
 */
export interface InvestmentData {
  /** Total capital invested */
  totalInvestment: number;
  /** Investment by category */
  byCategory: Record<HomeCategory, number>;
}

/**
 * Revenue data structure
 */
export interface RevenueData {
  /** Gross revenue before expenses */
  grossRevenue: number;
  /** Revenue by home category */
  byCategory: Record<HomeCategory, number>;
}

/**
 * Complete financial period data
 */
export interface FinancialPeriodData {
  /** Period identifier (YYYY-MM for monthly, YYYY-Q1 for quarterly, YYYY for yearly) */
  period: string;
  /** Revenue data for the period */
  revenue: RevenueData;
  /** Sales expenses */
  salesExpenses: SalesExpenses;
  /** Operating expenses */
  operatingExpenses: OperatingExpenses;
  /** Property counts */
  propertyCounts: PropertyCounts;
  /** Investment data */
  investment: InvestmentData;
}

/**
 * Calculated per-property metrics
 */
export interface PerPropertyMetrics {
  /** Sales cost per property: (Ads + Sales Pay + Onboarding) / Properties Closed */
  salesCostPerProperty: number;
  /** OpEx per property: (Employee Payout - Sales) / Total Properties */
  opExPerProperty: number;
  /** Software cost per property: Total Software / Total Properties */
  softwarePerProperty: number;
}

/**
 * Net income calculation result
 */
export interface NetIncomeResult {
  /** Gross revenue */
  grossRevenue: number;
  /** Total expenses */
  totalExpenses: number;
  /** Net income: Gross Revenue - Total Expenses */
  netIncome: number;
  /** Profit margin percentage */
  profitMargin: number;
}

/**
 * ROI calculation result by category
 */
export interface ROIResult {
  /** Category name */
  category: HomeCategory | 'Overall';
  /** Net income for the category */
  netIncome: number;
  /** Total investment for the category */
  totalInvestment: number;
  /** ROI percentage: (Net Income / Total Investment) * 100 */
  roi: number;
}

/**
 * Average ROI per PM property result
 */
export interface PMPropertyROI {
  /** Average ROI per PM property */
  averageROI: number;
  /** Total PM properties */
  pmPropertyCount: number;
  /** Total net income from PM properties */
  totalPMNetIncome: number;
  /** Total PM investment */
  totalPMInvestment: number;
}

/**
 * Trend comparison result
 */
export interface TrendResult {
  /** Current period value */
  currentValue: number;
  /** Previous period value */
  previousValue: number;
  /** Absolute change */
  absoluteChange: number;
  /** Percentage change */
  percentageChange: number;
  /** Trend direction */
  trend: 'up' | 'down' | 'stable';
}

/**
 * Aggregated financial summary
 */
export interface FinancialSummary {
  /** Period range description */
  periodRange: string;
  /** Per-property metrics */
  perPropertyMetrics: PerPropertyMetrics;
  /** Net income result */
  netIncome: NetIncomeResult;
  /** ROI by category */
  roiByCategory: ROIResult[];
  /** Average ROI per PM property */
  pmPropertyROI: PMPropertyROI;
  /** Trends compared to previous period */
  trends: {
    revenue: TrendResult;
    expenses: TrendResult;
    netIncome: TrendResult;
    roi: TrendResult;
  };
}

/**
 * Currency formatting options
 */
export interface CurrencyFormatOptions {
  /** Currency code (default: 'USD') */
  currency?: string;
  /** Locale for formatting (default: 'en-US') */
  locale?: string;
  /** Minimum fraction digits (default: 2) */
  minimumFractionDigits?: number;
  /** Maximum fraction digits (default: 2) */
  maximumFractionDigits?: number;
  /** Whether to show currency symbol (default: true) */
  showSymbol?: boolean;
  /** Use compact notation for large numbers (default: false) */
  compact?: boolean;
}

// =============================================================================
// CURRENCY FORMATTING UTILITIES
// =============================================================================

/**
 * Formats a number as currency with configurable options
 *
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1234.56, { showSymbol: false }) // "1,234.56"
 * formatCurrency(1500000, { compact: true }) // "$1.5M"
 */
export function formatCurrency(
  amount: number,
  options: CurrencyFormatOptions = {}
): string {
  const {
    currency = 'USD',
    locale = 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showSymbol = true,
    compact = false,
  } = options;

  if (!Number.isFinite(amount)) {
    return showSymbol ? '$0.00' : '0.00';
  }

  const formatOptions: Intl.NumberFormatOptions = {
    minimumFractionDigits,
    maximumFractionDigits,
  };

  if (showSymbol) {
    formatOptions.style = 'currency';
    formatOptions.currency = currency;
  }

  if (compact) {
    formatOptions.notation = 'compact';
    formatOptions.maximumFractionDigits = 1;
  }

  return new Intl.NumberFormat(locale, formatOptions).format(amount);
}

/**
 * Formats a number as a percentage
 *
 * @param value - The decimal value to format (0.15 = 15%)
 * @param decimalPlaces - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 *
 * @example
 * formatPercentage(0.156) // "15.6%"
 * formatPercentage(0.156, 2) // "15.60%"
 */
export function formatPercentage(value: number, decimalPlaces: number = 1): string {
  if (!Number.isFinite(value)) {
    return '0.0%';
  }
  return `${(value * 100).toFixed(decimalPlaces)}%`;
}

/**
 * Formats a raw percentage value (already multiplied by 100)
 *
 * @param value - The percentage value (15.6 = 15.6%)
 * @param decimalPlaces - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 *
 * @example
 * formatPercentageValue(15.6) // "15.6%"
 */
export function formatPercentageValue(value: number, decimalPlaces: number = 1): string {
  if (!Number.isFinite(value)) {
    return '0.0%';
  }
  return `${value.toFixed(decimalPlaces)}%`;
}

// =============================================================================
// SALES COST PER PROPERTY CALCULATION
// =============================================================================

/**
 * Calculates the sales cost per property closed
 *
 * Formula: (Ads + Sales Pay + Onboarding) / Properties Closed
 *
 * @param salesExpenses - Sales-related expenses
 * @param propertiesClosed - Number of properties closed/acquired
 * @returns Sales cost per property, or 0 if no properties closed
 *
 * @example
 * calculateSalesCostPerProperty(
 *   { ads: 5000, salesPay: 10000, onboarding: 2000 },
 *   10
 * ) // 1700
 */
export function calculateSalesCostPerProperty(
  salesExpenses: SalesExpenses,
  propertiesClosed: number
): number {
  if (propertiesClosed <= 0) {
    return 0;
  }

  const totalSalesCost = salesExpenses.ads + salesExpenses.salesPay + salesExpenses.onboarding;
  return totalSalesCost / propertiesClosed;
}

// =============================================================================
// OPEX PER PROPERTY CALCULATION
// =============================================================================

/**
 * Calculates the operating expenses per property
 *
 * Formula: (Employee Payout - Sales Payout) / Total Properties
 *
 * @param operatingExpenses - Operating expenses breakdown
 * @param totalProperties - Total number of properties
 * @returns OpEx per property, or 0 if no properties
 *
 * @example
 * calculateOpExPerProperty(
 *   { employeePayout: 50000, salesPayout: 10000, software: 5000, other: 2000 },
 *   20
 * ) // 2000
 */
export function calculateOpExPerProperty(
  operatingExpenses: OperatingExpenses,
  totalProperties: number
): number {
  if (totalProperties <= 0) {
    return 0;
  }

  const opEx = operatingExpenses.employeePayout - operatingExpenses.salesPayout;
  return opEx / totalProperties;
}

// =============================================================================
// SOFTWARE PER PROPERTY CALCULATION
// =============================================================================

/**
 * Calculates the software cost per property
 *
 * Formula: Total Software / Total Properties
 *
 * @param softwareCost - Total software/SaaS costs
 * @param totalProperties - Total number of properties
 * @returns Software cost per property, or 0 if no properties
 *
 * @example
 * calculateSoftwarePerProperty(5000, 25) // 200
 */
export function calculateSoftwarePerProperty(
  softwareCost: number,
  totalProperties: number
): number {
  if (totalProperties <= 0) {
    return 0;
  }

  return softwareCost / totalProperties;
}

// =============================================================================
// NET INCOME CALCULATION
// =============================================================================

/**
 * Calculates net income from gross revenue and expenses
 *
 * Formula: Net Income = Gross Revenue - Total Expenses
 *
 * @param grossRevenue - Total gross revenue
 * @param salesExpenses - Sales-related expenses
 * @param operatingExpenses - Operating expenses
 * @returns Net income result with profit margin
 *
 * @example
 * calculateNetIncome(
 *   100000,
 *   { ads: 5000, salesPay: 10000, onboarding: 2000 },
 *   { employeePayout: 30000, salesPayout: 10000, software: 5000, other: 3000 }
 * )
 * // { grossRevenue: 100000, totalExpenses: 55000, netIncome: 45000, profitMargin: 0.45 }
 */
export function calculateNetIncome(
  grossRevenue: number,
  salesExpenses: SalesExpenses,
  operatingExpenses: OperatingExpenses
): NetIncomeResult {
  const totalSalesExpenses =
    salesExpenses.ads + salesExpenses.salesPay + salesExpenses.onboarding;

  const totalOperatingExpenses =
    operatingExpenses.employeePayout +
    operatingExpenses.software +
    operatingExpenses.other;

  const totalExpenses = totalSalesExpenses + totalOperatingExpenses;
  const netIncome = grossRevenue - totalExpenses;
  const profitMargin = grossRevenue > 0 ? netIncome / grossRevenue : 0;

  return {
    grossRevenue,
    totalExpenses,
    netIncome,
    profitMargin,
  };
}

/**
 * Calculates net income from pre-computed totals
 *
 * @param grossRevenue - Total gross revenue
 * @param totalExpenses - Total expenses
 * @returns Net income result with profit margin
 */
export function calculateNetIncomeSimple(
  grossRevenue: number,
  totalExpenses: number
): NetIncomeResult {
  const netIncome = grossRevenue - totalExpenses;
  const profitMargin = grossRevenue > 0 ? netIncome / grossRevenue : 0;

  return {
    grossRevenue,
    totalExpenses,
    netIncome,
    profitMargin,
  };
}

// =============================================================================
// ROI CALCULATIONS
// =============================================================================

/**
 * Calculates ROI (Return on Investment)
 *
 * Formula: (Net Income / Total Investment) * 100
 *
 * @param netIncome - Net income amount
 * @param totalInvestment - Total investment amount
 * @returns ROI as a percentage value
 *
 * @example
 * calculateROI(45000, 100000) // 45 (representing 45%)
 */
export function calculateROI(netIncome: number, totalInvestment: number): number {
  if (totalInvestment <= 0) {
    return 0;
  }

  return (netIncome / totalInvestment) * 100;
}

/**
 * Calculates ROI per category
 *
 * @param revenueByCategory - Revenue amounts by category
 * @param expensesByCategory - Expenses amounts by category
 * @param investmentByCategory - Investment amounts by category
 * @returns Array of ROI results by category
 *
 * @example
 * calculateROIByCategory(
 *   { PM: 50000, Arbitrage: 30000, Owned: 20000 },
 *   { PM: 25000, Arbitrage: 20000, Owned: 10000 },
 *   { PM: 100000, Arbitrage: 50000, Owned: 30000 }
 * )
 */
export function calculateROIByCategory(
  revenueByCategory: Record<HomeCategory, number>,
  expensesByCategory: Record<HomeCategory, number>,
  investmentByCategory: Record<HomeCategory, number>
): ROIResult[] {
  const categories: HomeCategory[] = ['PM', 'Arbitrage', 'Owned'];
  const results: ROIResult[] = [];

  let totalNetIncome = 0;
  let totalInvestment = 0;

  for (const category of categories) {
    const revenue = revenueByCategory[category] || 0;
    const expenses = expensesByCategory[category] || 0;
    const investment = investmentByCategory[category] || 0;
    const netIncome = revenue - expenses;

    totalNetIncome += netIncome;
    totalInvestment += investment;

    results.push({
      category,
      netIncome,
      totalInvestment: investment,
      roi: calculateROI(netIncome, investment),
    });
  }

  // Add overall ROI
  results.push({
    category: 'Overall',
    netIncome: totalNetIncome,
    totalInvestment,
    roi: calculateROI(totalNetIncome, totalInvestment),
  });

  return results;
}

// =============================================================================
// AVERAGE ROI PER PM PROPERTY
// =============================================================================

/**
 * Calculates average ROI per PM (Property Management) property
 *
 * @param pmNetIncome - Total net income from PM properties
 * @param pmInvestment - Total investment in PM properties
 * @param pmPropertyCount - Number of PM properties
 * @returns PM property ROI result
 *
 * @example
 * calculateAverageROIPerPMProperty(50000, 100000, 10)
 * // { averageROI: 50, pmPropertyCount: 10, totalPMNetIncome: 50000, totalPMInvestment: 100000 }
 */
export function calculateAverageROIPerPMProperty(
  pmNetIncome: number,
  pmInvestment: number,
  pmPropertyCount: number
): PMPropertyROI {
  if (pmPropertyCount <= 0) {
    return {
      averageROI: 0,
      pmPropertyCount: 0,
      totalPMNetIncome: pmNetIncome,
      totalPMInvestment: pmInvestment,
    };
  }

  const totalROI = calculateROI(pmNetIncome, pmInvestment);
  const averageROI = totalROI; // ROI is already normalized by investment

  return {
    averageROI,
    pmPropertyCount,
    totalPMNetIncome: pmNetIncome,
    totalPMInvestment: pmInvestment,
  };
}

// =============================================================================
// TREND CALCULATIONS
// =============================================================================

/**
 * Calculates trend between two periods
 *
 * @param currentValue - Current period value
 * @param previousValue - Previous period value
 * @param threshold - Percentage threshold for 'stable' classification (default: 0.01 = 1%)
 * @returns Trend result with direction
 *
 * @example
 * calculateTrend(120000, 100000)
 * // { currentValue: 120000, previousValue: 100000, absoluteChange: 20000, percentageChange: 20, trend: 'up' }
 */
export function calculateTrend(
  currentValue: number,
  previousValue: number,
  threshold: number = 0.01
): TrendResult {
  const absoluteChange = currentValue - previousValue;
  const percentageChange = previousValue !== 0 ? (absoluteChange / previousValue) * 100 : 0;

  let trend: 'up' | 'down' | 'stable';
  if (Math.abs(percentageChange) < threshold * 100) {
    trend = 'stable';
  } else if (percentageChange > 0) {
    trend = 'up';
  } else {
    trend = 'down';
  }

  return {
    currentValue,
    previousValue,
    absoluteChange,
    percentageChange,
    trend,
  };
}

/**
 * Calculates multiple trends from period data
 *
 * @param currentPeriod - Current period financial data
 * @param previousPeriod - Previous period financial data
 * @returns Object containing trend results for key metrics
 */
export function calculatePeriodTrends(
  currentPeriod: FinancialPeriodData,
  previousPeriod: FinancialPeriodData
): {
  revenue: TrendResult;
  expenses: TrendResult;
  netIncome: TrendResult;
  roi: TrendResult;
} {
  // Calculate current period totals
  const currentNetIncome = calculateNetIncome(
    currentPeriod.revenue.grossRevenue,
    currentPeriod.salesExpenses,
    currentPeriod.operatingExpenses
  );

  const currentROI = calculateROI(
    currentNetIncome.netIncome,
    currentPeriod.investment.totalInvestment
  );

  // Calculate previous period totals
  const previousNetIncome = calculateNetIncome(
    previousPeriod.revenue.grossRevenue,
    previousPeriod.salesExpenses,
    previousPeriod.operatingExpenses
  );

  const previousROI = calculateROI(
    previousNetIncome.netIncome,
    previousPeriod.investment.totalInvestment
  );

  return {
    revenue: calculateTrend(
      currentPeriod.revenue.grossRevenue,
      previousPeriod.revenue.grossRevenue
    ),
    expenses: calculateTrend(
      currentNetIncome.totalExpenses,
      previousNetIncome.totalExpenses
    ),
    netIncome: calculateTrend(
      currentNetIncome.netIncome,
      previousNetIncome.netIncome
    ),
    roi: calculateTrend(currentROI, previousROI),
  };
}

// =============================================================================
// AGGREGATION FUNCTIONS
// =============================================================================

/**
 * Aggregates monthly financial data into a summary
 *
 * @param monthlyData - Array of monthly financial data
 * @returns Aggregated totals
 */
export function aggregateMonthlyData(
  monthlyData: FinancialPeriodData[]
): Omit<FinancialPeriodData, 'period'> & { periodRange: string } {
  const initial: Omit<FinancialPeriodData, 'period'> = {
    revenue: { grossRevenue: 0, byCategory: { PM: 0, Arbitrage: 0, Owned: 0 } },
    salesExpenses: { ads: 0, salesPay: 0, onboarding: 0 },
    operatingExpenses: { employeePayout: 0, salesPayout: 0, software: 0, other: 0 },
    propertyCounts: { total: 0, closed: 0, byCategory: { PM: 0, Arbitrage: 0, Owned: 0 } },
    investment: { totalInvestment: 0, byCategory: { PM: 0, Arbitrage: 0, Owned: 0 } },
  };

  if (monthlyData.length === 0) {
    return { ...initial, periodRange: '' };
  }

  const aggregated = monthlyData.reduce((acc, data) => {
    // Aggregate revenue
    acc.revenue.grossRevenue += data.revenue.grossRevenue;
    acc.revenue.byCategory.PM += data.revenue.byCategory.PM;
    acc.revenue.byCategory.Arbitrage += data.revenue.byCategory.Arbitrage;
    acc.revenue.byCategory.Owned += data.revenue.byCategory.Owned;

    // Aggregate sales expenses
    acc.salesExpenses.ads += data.salesExpenses.ads;
    acc.salesExpenses.salesPay += data.salesExpenses.salesPay;
    acc.salesExpenses.onboarding += data.salesExpenses.onboarding;

    // Aggregate operating expenses
    acc.operatingExpenses.employeePayout += data.operatingExpenses.employeePayout;
    acc.operatingExpenses.salesPayout += data.operatingExpenses.salesPayout;
    acc.operatingExpenses.software += data.operatingExpenses.software;
    acc.operatingExpenses.other += data.operatingExpenses.other;

    // Use latest property counts (not cumulative)
    acc.propertyCounts.total = Math.max(acc.propertyCounts.total, data.propertyCounts.total);
    acc.propertyCounts.closed += data.propertyCounts.closed;
    acc.propertyCounts.byCategory.PM = Math.max(
      acc.propertyCounts.byCategory.PM,
      data.propertyCounts.byCategory.PM
    );
    acc.propertyCounts.byCategory.Arbitrage = Math.max(
      acc.propertyCounts.byCategory.Arbitrage,
      data.propertyCounts.byCategory.Arbitrage
    );
    acc.propertyCounts.byCategory.Owned = Math.max(
      acc.propertyCounts.byCategory.Owned,
      data.propertyCounts.byCategory.Owned
    );

    // Aggregate investment
    acc.investment.totalInvestment += data.investment.totalInvestment;
    acc.investment.byCategory.PM += data.investment.byCategory.PM;
    acc.investment.byCategory.Arbitrage += data.investment.byCategory.Arbitrage;
    acc.investment.byCategory.Owned += data.investment.byCategory.Owned;

    return acc;
  }, initial);

  const periods = monthlyData.map((d) => d.period).sort();
  const periodRange = `${periods[0]} to ${periods[periods.length - 1]}`;

  return { ...aggregated, periodRange };
}

/**
 * Groups monthly data by quarter
 *
 * @param monthlyData - Array of monthly financial data
 * @returns Map of quarter to aggregated data
 */
export function groupByQuarter(
  monthlyData: FinancialPeriodData[]
): Map<string, FinancialPeriodData[]> {
  const quarters = new Map<string, FinancialPeriodData[]>();

  for (const data of monthlyData) {
    const [year, month] = data.period.split('-').map(Number);
    const quarter = Math.ceil(month / 3);
    const quarterKey = `${year}-Q${quarter}`;

    if (!quarters.has(quarterKey)) {
      quarters.set(quarterKey, []);
    }
    quarters.get(quarterKey)!.push(data);
  }

  return quarters;
}

/**
 * Groups monthly data by year
 *
 * @param monthlyData - Array of monthly financial data
 * @returns Map of year to aggregated data
 */
export function groupByYear(
  monthlyData: FinancialPeriodData[]
): Map<string, FinancialPeriodData[]> {
  const years = new Map<string, FinancialPeriodData[]>();

  for (const data of monthlyData) {
    const year = data.period.split('-')[0];

    if (!years.has(year)) {
      years.set(year, []);
    }
    years.get(year)!.push(data);
  }

  return years;
}

/**
 * Calculates complete financial summary from period data
 *
 * @param currentPeriodData - Current period financial data array
 * @param previousPeriodData - Previous period financial data array (for trends)
 * @returns Complete financial summary
 */
export function calculateFinancialSummary(
  currentPeriodData: FinancialPeriodData[],
  previousPeriodData: FinancialPeriodData[] = []
): FinancialSummary {
  const current = aggregateMonthlyData(currentPeriodData);
  const previous = aggregateMonthlyData(previousPeriodData);

  // Calculate per-property metrics
  const perPropertyMetrics: PerPropertyMetrics = {
    salesCostPerProperty: calculateSalesCostPerProperty(
      current.salesExpenses,
      current.propertyCounts.closed
    ),
    opExPerProperty: calculateOpExPerProperty(
      current.operatingExpenses,
      current.propertyCounts.total
    ),
    softwarePerProperty: calculateSoftwarePerProperty(
      current.operatingExpenses.software,
      current.propertyCounts.total
    ),
  };

  // Calculate net income
  const netIncome = calculateNetIncome(
    current.revenue.grossRevenue,
    current.salesExpenses,
    current.operatingExpenses
  );

  // Calculate ROI by category
  const expensesByCategory: Record<HomeCategory, number> = {
    PM: 0,
    Arbitrage: 0,
    Owned: 0,
  };

  // Distribute expenses proportionally by revenue for category-level ROI
  const totalRevenue = current.revenue.grossRevenue;
  if (totalRevenue > 0) {
    const totalExpenses = netIncome.totalExpenses;
    for (const category of ['PM', 'Arbitrage', 'Owned'] as HomeCategory[]) {
      const categoryRevenue = current.revenue.byCategory[category];
      expensesByCategory[category] = (categoryRevenue / totalRevenue) * totalExpenses;
    }
  }

  const roiByCategory = calculateROIByCategory(
    current.revenue.byCategory,
    expensesByCategory,
    current.investment.byCategory
  );

  // Calculate PM property ROI
  const pmROIResult = roiByCategory.find((r) => r.category === 'PM');
  const pmPropertyROI = calculateAverageROIPerPMProperty(
    pmROIResult?.netIncome || 0,
    pmROIResult?.totalInvestment || 0,
    current.propertyCounts.byCategory.PM
  );

  // Calculate trends
  let trends: FinancialSummary['trends'];
  if (previousPeriodData.length > 0) {
    const previousNetIncome = calculateNetIncome(
      previous.revenue.grossRevenue,
      previous.salesExpenses,
      previous.operatingExpenses
    );

    const currentROI = calculateROI(netIncome.netIncome, current.investment.totalInvestment);
    const previousROI = calculateROI(
      previousNetIncome.netIncome,
      previous.investment.totalInvestment
    );

    trends = {
      revenue: calculateTrend(current.revenue.grossRevenue, previous.revenue.grossRevenue),
      expenses: calculateTrend(netIncome.totalExpenses, previousNetIncome.totalExpenses),
      netIncome: calculateTrend(netIncome.netIncome, previousNetIncome.netIncome),
      roi: calculateTrend(currentROI, previousROI),
    };
  } else {
    // No previous data, return neutral trends
    trends = {
      revenue: { currentValue: current.revenue.grossRevenue, previousValue: 0, absoluteChange: 0, percentageChange: 0, trend: 'stable' },
      expenses: { currentValue: netIncome.totalExpenses, previousValue: 0, absoluteChange: 0, percentageChange: 0, trend: 'stable' },
      netIncome: { currentValue: netIncome.netIncome, previousValue: 0, absoluteChange: 0, percentageChange: 0, trend: 'stable' },
      roi: { currentValue: calculateROI(netIncome.netIncome, current.investment.totalInvestment), previousValue: 0, absoluteChange: 0, percentageChange: 0, trend: 'stable' },
    };
  }

  return {
    periodRange: current.periodRange,
    perPropertyMetrics,
    netIncome,
    roiByCategory,
    pmPropertyROI,
    trends,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Safely divides two numbers, returning 0 if divisor is 0
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @returns Division result or 0 if denominator is 0
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(denominator)) {
    return 0;
  }
  return numerator / denominator;
}

/**
 * Rounds a number to specified decimal places
 *
 * @param value - The value to round
 * @param decimalPlaces - Number of decimal places (default: 2)
 * @returns Rounded value
 */
export function roundToDecimal(value: number, decimalPlaces: number = 2): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

/**
 * Clamps a value between min and max
 *
 * @param value - The value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates the sum of an array of numbers
 *
 * @param values - Array of numbers
 * @returns Sum of all values
 */
export function sum(values: number[]): number {
  return values.reduce((acc, val) => acc + (Number.isFinite(val) ? val : 0), 0);
}

/**
 * Calculates the average of an array of numbers
 *
 * @param values - Array of numbers
 * @returns Average value, or 0 if array is empty
 */
export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return sum(values) / values.length;
}

/**
 * Parses a period string to determine its type
 *
 * @param period - Period string (YYYY-MM, YYYY-Q1, or YYYY)
 * @returns Period type
 */
export function parsePeriodType(period: string): TimePeriod {
  if (/^\d{4}-Q[1-4]$/.test(period)) {
    return 'quarterly';
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    return 'monthly';
  }
  if (/^\d{4}$/.test(period)) {
    return 'yearly';
  }
  return 'monthly'; // Default
}

/**
 * Generates a period string for the previous period
 *
 * @param period - Current period string
 * @returns Previous period string
 */
export function getPreviousPeriod(period: string): string {
  const type = parsePeriodType(period);

  switch (type) {
    case 'monthly': {
      const [year, month] = period.split('-').map(Number);
      if (month === 1) {
        return `${year - 1}-12`;
      }
      return `${year}-${String(month - 1).padStart(2, '0')}`;
    }
    case 'quarterly': {
      const [year, quarter] = period.split('-Q');
      const q = parseInt(quarter, 10);
      if (q === 1) {
        return `${parseInt(year, 10) - 1}-Q4`;
      }
      return `${year}-Q${q - 1}`;
    }
    case 'yearly': {
      return String(parseInt(period, 10) - 1);
    }
    default:
      return period;
  }
}

/**
 * Creates an empty FinancialPeriodData object with zero values
 *
 * @param period - The period identifier
 * @returns Empty financial period data
 */
export function createEmptyPeriodData(period: string): FinancialPeriodData {
  return {
    period,
    revenue: {
      grossRevenue: 0,
      byCategory: { PM: 0, Arbitrage: 0, Owned: 0 },
    },
    salesExpenses: {
      ads: 0,
      salesPay: 0,
      onboarding: 0,
    },
    operatingExpenses: {
      employeePayout: 0,
      salesPayout: 0,
      software: 0,
      other: 0,
    },
    propertyCounts: {
      total: 0,
      closed: 0,
      byCategory: { PM: 0, Arbitrage: 0, Owned: 0 },
    },
    investment: {
      totalInvestment: 0,
      byCategory: { PM: 0, Arbitrage: 0, Owned: 0 },
    },
  };
}
