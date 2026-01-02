export { default as FinancialDashboard } from './FinancialDashboard';
export { default as DateRangeFilter } from './DateRangeFilter';
export { default as SummaryBubbles } from './SummaryBubbles';
export { default as HomeCategoryView } from './HomeCategoryView';
export { default as TransactionModal } from './TransactionModal';
export { default as IncomeExpenseChart } from './charts/IncomeExpenseChart';
export { default as CategoryPieChart } from './charts/CategoryPieChart';

// New components for property-level financial analysis
export { default as PropertyFinancials } from './PropertyFinancials';
export { default as MetricsDashboard } from './MetricsDashboard';
export { default as CategoryDetails } from './CategoryDetails';
export { default as TrendLineChart } from './charts/TrendLineChart';
export { default as BaseTable } from './BaseTable';

// Recharts-based chart components
export {
  NetIncomeTrendChart,
  ROIByCategoryChart,
  PMPropertyROIChart,
  IncomeVsExpensesChart,
  CHART_COLORS,
  transformToNetIncomeTrend,
  transformToROIByCategory,
  transformToPMPropertyROI,
  transformToIncomeExpense,
} from './Charts';

// Export types
export * from './types';
