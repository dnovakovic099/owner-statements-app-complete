import React, { useMemo } from 'react';
import {
  NetIncomeTrendChart,
  ROIByCategoryChart,
  PMPropertyROIChart,
  IncomeVsExpensesChart,
  transformToNetIncomeTrend,
  transformToROIByCategory,
  transformToPMPropertyROI,
  transformToIncomeExpense,
} from './Charts';
import { PropertyMetrics } from './types';

/**
 * ChartsExample - Demonstration of all Recharts-based financial chart components
 *
 * This component shows how to use the four main chart components:
 * 1. NetIncomeTrendChart - Multi-line chart showing net income trends across categories
 * 2. ROIByCategoryChart - Horizontal bar chart showing ROI per category
 * 3. PMPropertyROIChart - Vertical bar chart showing ROI for individual PM properties
 * 4. IncomeVsExpensesChart - Stacked area chart showing income vs expenses over time
 */

interface ChartsExampleProps {
  properties: PropertyMetrics[];
  isLoading?: boolean;
}

const ChartsExample: React.FC<ChartsExampleProps> = ({ properties, isLoading = false }) => {
  // Transform data for each chart using the utility functions
  const netIncomeTrendData = useMemo(
    () => transformToNetIncomeTrend(properties),
    [properties]
  );

  const roiByCategoryData = useMemo(
    () => transformToROIByCategory(properties),
    [properties]
  );

  const pmPropertyROIData = useMemo(
    () => transformToPMPropertyROI(properties),
    [properties]
  );

  const incomeExpenseData = useMemo(
    () => transformToIncomeExpense(properties),
    [properties]
  );

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Financial Dashboard - Chart Components
        </h1>
        <p className="text-gray-600">
          Comprehensive financial visualizations built with Recharts
        </p>
      </div>

      {/* Grid Layout for Charts */}
      <div className="grid grid-cols-1 gap-6">
        {/* Row 1: Net Income Trend - Full Width */}
        <div className="col-span-1">
          <NetIncomeTrendChart
            data={netIncomeTrendData}
            isLoading={isLoading}
            height={400}
          />
        </div>

        {/* Row 2: ROI Charts - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ROIByCategoryChart
            data={roiByCategoryData}
            isLoading={isLoading}
            height={300}
          />
          <PMPropertyROIChart
            data={pmPropertyROIData}
            targetROI={15}
            isLoading={isLoading}
            height={400}
          />
        </div>

        {/* Row 3: Income vs Expenses - Full Width */}
        <div className="col-span-1">
          <IncomeVsExpensesChart
            data={incomeExpenseData}
            isLoading={isLoading}
            height={400}
          />
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-white rounded-lg shadow-sm p-6 mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Chart Component Usage
        </h2>
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">
              1. Net Income Trend Chart
            </h3>
            <p className="mb-2">Multi-line chart comparing net income across PM, Arbitrage, and Owned properties.</p>
            <div className="bg-gray-50 p-3 rounded font-mono text-xs">
              {`<NetIncomeTrendChart
  data={netIncomeTrendData}
  isLoading={false}
  height={400}
/>`}
            </div>
            <ul className="mt-2 list-disc list-inside text-gray-600">
              <li>Click legend items to toggle line visibility</li>
              <li>Hover over data points for exact values</li>
              <li>Responsive design adapts to container width</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">
              2. ROI by Category Chart
            </h3>
            <p className="mb-2">Horizontal bar chart showing ROI percentage for each home category.</p>
            <div className="bg-gray-50 p-3 rounded font-mono text-xs">
              {`<ROIByCategoryChart
  data={roiByCategoryData}
  isLoading={false}
  height={300}
/>`}
            </div>
            <ul className="mt-2 list-disc list-inside text-gray-600">
              <li>Color-coded by category</li>
              <li>Percentage labels on bars</li>
              <li>Tooltip shows exact ROI value</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">
              3. PM Property ROI Chart
            </h3>
            <p className="mb-2">Vertical bar chart showing individual PM property performance.</p>
            <div className="bg-gray-50 p-3 rounded font-mono text-xs">
              {`<PMPropertyROIChart
  data={pmPropertyROIData}
  targetROI={15}
  isLoading={false}
  height={400}
/>`}
            </div>
            <ul className="mt-2 list-disc list-inside text-gray-600">
              <li>Sorted by ROI descending</li>
              <li>Target ROI reference line (customizable)</li>
              <li>Color-coded: green above target, red below</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">
              4. Income vs Expenses Chart
            </h3>
            <p className="mb-2">Stacked area chart comparing income and expenses over time.</p>
            <div className="bg-gray-50 p-3 rounded font-mono text-xs">
              {`<IncomeVsExpensesChart
  data={incomeExpenseData}
  isLoading={false}
  height={400}
/>`}
            </div>
            <ul className="mt-2 list-disc list-inside text-gray-600">
              <li>Gradient fill for visual appeal</li>
              <li>Tooltip shows income, expenses, and net income</li>
              <li>Easy to spot trends and gaps</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Design System Info */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Design System
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 rounded bg-blue-500" />
              <span className="text-sm font-medium">PM</span>
            </div>
            <code className="text-xs text-gray-600">#3B82F6</code>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 rounded bg-orange-500" />
              <span className="text-sm font-medium">Arbitrage</span>
            </div>
            <code className="text-xs text-gray-600">#F97316</code>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 rounded bg-green-500" />
              <span className="text-sm font-medium">Owned / Income</span>
            </div>
            <code className="text-xs text-gray-600">#10B981</code>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 rounded bg-red-500" />
              <span className="text-sm font-medium">Expenses</span>
            </div>
            <code className="text-xs text-gray-600">#EF4444</code>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-4">
          All charts use consistent colors, rounded corners (8px), and subtle shadows for a modern, cohesive design.
        </p>
      </div>
    </div>
  );
};

export default ChartsExample;
