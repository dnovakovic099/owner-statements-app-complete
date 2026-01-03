import React from 'react';
import ProfitLossWidget from './ProfitLossWidget';

/**
 * Example usage of ProfitLossWidget component
 *
 * This example demonstrates the ProfitLossWidget with sample financial data
 * showing income, expenses, and period-over-period comparison.
 */
const ProfitLossWidgetExample: React.FC = () => {
  const handleViewReport = () => {
    console.log('Navigate to full profit & loss report');
    // Add navigation logic here
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Profit & Loss Widget Example
        </h1>

        {/* Example 1: Profitable Business */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            Profitable Business
          </h2>
          <ProfitLossWidget
            income={150000}
            expenses={45000}
            previousIncome={130000}
            previousExpenses={50000}
            onViewReport={handleViewReport}
          />
        </div>

        {/* Example 2: Loss Making Business */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            Loss Making Business
          </h2>
          <ProfitLossWidget
            income={30000}
            expenses={55000}
            previousIncome={40000}
            previousExpenses={50000}
            onViewReport={handleViewReport}
          />
        </div>

        {/* Example 3: High Expense Ratio */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            High Expense Ratio
          </h2>
          <ProfitLossWidget
            income={100000}
            expenses={85000}
            previousIncome={95000}
            previousExpenses={70000}
            onViewReport={handleViewReport}
          />
        </div>

        {/* Example 4: Without View Report Handler */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            Without View Report Button
          </h2>
          <ProfitLossWidget
            income={200000}
            expenses={75000}
            previousIncome={180000}
            previousExpenses={80000}
          />
        </div>
      </div>
    </div>
  );
};

export default ProfitLossWidgetExample;
