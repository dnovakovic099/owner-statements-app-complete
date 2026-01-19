import React from 'react';
import { KPICardsRow } from './KPICardsRow';

/**
 * Example usage of KPICardsRow component
 *
 * This component displays a responsive grid of 4 KPI cards:
 * - Total Revenue
 * - Total Payouts
 * - PM Fees
 * - Statement Count
 */

export const KPICardsRowExample: React.FC = () => {
  // Example with real data
  const exampleData = {
    revenue: 125000,
    previousRevenue: 110000,
    revenueChange: 13.6,
    payouts: 95000,
    previousPayouts: 88000,
    payoutsChange: 8.0,
    pmFees: 12500,
    previousPmFees: 11000,
    pmFeesChange: 13.6,
    statementCount: 48,
    previousStatementCount: 45,
    statementCountChange: 6.7,
  };

  // Example with loading state
  const loadingExample = (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Loading State</h2>
        <KPICardsRow
          data={exampleData}
          loading={true}
        />
      </div>
    </div>
  );

  // Example with real data
  const dataExample = (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">With Data</h2>
        <KPICardsRow data={exampleData} />
      </div>
    </div>
  );

  // Example with negative trends
  const negativeExample = (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">With Negative Trends</h2>
        <KPICardsRow
          data={{
            revenue: 95000,
            previousRevenue: 110000,
            revenueChange: -13.6,
            payouts: 75000,
            previousPayouts: 88000,
            payoutsChange: -14.8,
            pmFees: 9500,
            previousPmFees: 11000,
            pmFeesChange: -13.6,
            statementCount: 42,
            previousStatementCount: 45,
            statementCountChange: -6.7,
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-8 bg-gray-50">
      {loadingExample}
      {dataExample}
      {negativeExample}
    </div>
  );
};

export default KPICardsRowExample;
