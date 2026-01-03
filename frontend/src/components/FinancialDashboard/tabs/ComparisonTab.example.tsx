import React from 'react';
import ComparisonTab, { PeriodData } from './ComparisonTab';

/**
 * Example usage of ComparisonTab component
 *
 * This component compares financial metrics between two time periods.
 * It displays a comparison table with change indicators and a side-by-side bar chart.
 */

const ComparisonTabExample: React.FC = () => {
  // Example current period data (This Month)
  const currentPeriod: PeriodData = {
    label: 'December 2025',
    startDate: '2025-12-01',
    endDate: '2025-12-31',
    data: {
      income: 125000,
      expenses: 78000,
      netIncome: 47000,
      profitMargin: 37.6,
      propertyCount: 15,
      avgPerProperty: 8333,
    },
  };

  // Example previous period data (Last Month)
  const previousPeriod: PeriodData = {
    label: 'November 2025',
    startDate: '2025-11-01',
    endDate: '2025-11-30',
    data: {
      income: 118000,
      expenses: 72000,
      netIncome: 46000,
      profitMargin: 39.0,
      propertyCount: 14,
      avgPerProperty: 8429,
    },
  };

  const handlePeriodChange = (currentPeriod: string, previousPeriod: string) => {
    console.log('Period changed:', { currentPeriod, previousPeriod });
    // Here you would typically:
    // 1. Fetch new data based on the selected periods
    // 2. Update the state with the new data
    // 3. Trigger a re-render
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Financial Comparison Example
          </h1>
          <p className="text-gray-600">
            Compare financial metrics between two time periods
          </p>
        </div>

        <ComparisonTab
          currentPeriod={currentPeriod}
          previousPeriod={previousPeriod}
          onPeriodChange={handlePeriodChange}
        />
      </div>
    </div>
  );
};

export default ComparisonTabExample;

/**
 * Usage Notes:
 *
 * 1. Period Data Structure:
 *    - Provide PeriodData objects with label, dates, and financial metrics
 *    - The component automatically calculates changes and percentages
 *
 * 2. Custom Comparison Data:
 *    - Optionally pass custom comparisonData prop with pre-calculated metrics
 *    - Useful if you need custom calculation logic
 *
 * 3. Period Selection:
 *    - Users can select from predefined period options
 *    - onPeriodChange callback fires when Apply button is clicked
 *    - Implement data fetching logic in the callback
 *
 * 4. Responsive Design:
 *    - Table scrolls horizontally on mobile devices
 *    - Period selectors stack vertically on small screens
 *    - Chart adjusts to container width
 *
 * 5. Visual Indicators:
 *    - Green: Positive changes
 *    - Red: Negative changes
 *    - Gray: No change
 *    - Includes both absolute and percentage changes
 *
 * 6. Integration with Financial Dashboard:
 *    - Add as a new tab in the Tabs component
 *    - Pass period data from parent state
 *    - Connect to existing API endpoints for data fetching
 */

/**
 * Example integration with existing FinancialDashboard:
 *
 * In index.tsx or FinancialDashboard.tsx:
 *
 * import { ComparisonTab } from './tabs';
 *
 * // Add to TabsList:
 * <TabsTrigger value="comparison">Comparison</TabsTrigger>
 *
 * // Add to TabsContent:
 * <TabsContent value="comparison" className="space-y-6">
 *   <ComparisonTab
 *     currentPeriod={currentPeriodData}
 *     previousPeriod={previousPeriodData}
 *     onPeriodChange={handleComparisonPeriodChange}
 *   />
 * </TabsContent>
 */
