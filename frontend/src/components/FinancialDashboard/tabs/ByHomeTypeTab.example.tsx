import React from 'react';
import ByHomeTypeTab, { ByHomeTypeData, DateRange } from './ByHomeTypeTab';

/**
 * Example usage of the ByHomeTypeTab component
 *
 * This demonstrates how to structure data for all four home categories:
 * - Property Management (PM)
 * - Arbitrage
 * - Home Owned
 * - Shared
 */

// Sample data for demonstration
const sampleData: ByHomeTypeData = {
  // Property Management Category
  pm: {
    income: [
      { label: 'PM Income', amount: 45000, percentage: 75 },
      { label: 'Claims', amount: 15000, percentage: 25 },
    ],
    expenses: [
      { label: 'Ads', amount: 8000, percentage: 20 },
      { label: 'Sales Commission', amount: 12000, percentage: 30 },
      { label: 'Sales Base', amount: 10000, percentage: 25 },
      { label: 'Onboarding', amount: 5000, percentage: 12.5 },
      { label: 'Photography', amount: 5000, percentage: 12.5 },
    ],
    churn: {
      count: 12,
      rate: 8.5,
    },
    monthlyTrend: [
      { month: '2024-01', income: 58000, expenses: 38000, netIncome: 20000 },
      { month: '2024-02', income: 62000, expenses: 40000, netIncome: 22000 },
      { month: '2024-03', income: 60000, expenses: 39000, netIncome: 21000 },
      { month: '2024-04', income: 65000, expenses: 41000, netIncome: 24000 },
      { month: '2024-05', income: 68000, expenses: 42000, netIncome: 26000 },
      { month: '2024-06', income: 70000, expenses: 43000, netIncome: 27000 },
    ],
  },

  // Arbitrage Category
  arbitrage: {
    income: [
      { label: 'Rental Income', amount: 85000, percentage: 100 },
    ],
    expenses: [
      { label: 'Rent', amount: 45000, percentage: 50 },
      { label: 'Utilities', amount: 8000, percentage: 8.9 },
      { label: 'Cleanings', amount: 12000, percentage: 13.3 },
      { label: 'Maintenance', amount: 15000, percentage: 16.7 },
      { label: 'Additional', amount: 10000, percentage: 11.1 },
    ],
    monthlyTrend: [
      { month: '2024-01', income: 80000, expenses: 88000, netIncome: -8000 },
      { month: '2024-02', income: 82000, expenses: 89000, netIncome: -7000 },
      { month: '2024-03', income: 85000, expenses: 90000, netIncome: -5000 },
      { month: '2024-04', income: 88000, expenses: 91000, netIncome: -3000 },
      { month: '2024-05', income: 90000, expenses: 92000, netIncome: -2000 },
      { month: '2024-06', income: 92000, expenses: 90000, netIncome: 2000 },
    ],
  },

  // Home Owned Category
  owned: {
    income: [
      { label: 'Rental Income', amount: 95000, percentage: 100 },
    ],
    expenses: [
      { label: 'Mortgage', amount: 35000, percentage: 50 },
      { label: 'Rent', amount: 0, percentage: 0 }, // Either mortgage or rent, not both
      { label: 'Utilities', amount: 6000, percentage: 8.6 },
      { label: 'Cleanings', amount: 10000, percentage: 14.3 },
      { label: 'Maintenance', amount: 12000, percentage: 17.1 },
      { label: 'Additional', amount: 7000, percentage: 10 },
    ],
    monthlyTrend: [
      { month: '2024-01', income: 92000, expenses: 68000, netIncome: 24000 },
      { month: '2024-02', income: 93000, expenses: 69000, netIncome: 24000 },
      { month: '2024-03', income: 95000, expenses: 70000, netIncome: 25000 },
      { month: '2024-04', income: 96000, expenses: 70000, netIncome: 26000 },
      { month: '2024-05', income: 98000, expenses: 71000, netIncome: 27000 },
      { month: '2024-06', income: 100000, expenses: 72000, netIncome: 28000 },
    ],
  },

  // Shared Category (Employee Costs & Other)
  shared: {
    employeeCosts: [
      { label: 'Onboarding', amount: 15000, percentage: 12 },
      { label: 'Client Relations', amount: 18000, percentage: 14.4 },
      { label: 'Review Mediation', amount: 12000, percentage: 9.6 },
      { label: 'Pricing', amount: 14000, percentage: 11.2 },
      { label: 'Accounting', amount: 20000, percentage: 16 },
      { label: 'Sales', amount: 16000, percentage: 12.8 },
      { label: 'Admin', amount: 10000, percentage: 8 },
      { label: 'Maintenance', amount: 8000, percentage: 6.4 },
      { label: 'Guest Relations', amount: 7000, percentage: 5.6 },
      { label: 'Marketing', amount: 5000, percentage: 4 },
    ],
    refunds: 8500,
    chargebacks: 3200,
    monthlyTrend: [
      { month: '2024-01', income: 0, expenses: 120000, netIncome: -120000 },
      { month: '2024-02', income: 0, expenses: 122000, netIncome: -122000 },
      { month: '2024-03', income: 0, expenses: 125000, netIncome: -125000 },
      { month: '2024-04', income: 0, expenses: 123000, netIncome: -123000 },
      { month: '2024-05', income: 0, expenses: 126000, netIncome: -126000 },
      { month: '2024-06', income: 0, expenses: 128000, netIncome: -128000 },
    ],
  },
};

const sampleDateRange: DateRange = {
  startDate: '2024-01-01',
  endDate: '2024-06-30',
};

const ByHomeTypeTabExample: React.FC = () => {
  const handleItemClick = (category: string, type: 'income' | 'expense', item: string) => {
    console.log(`Clicked: ${category} - ${type} - ${item}`);
    // In a real application, you might:
    // - Navigate to a detailed view
    // - Open a modal with transaction details
    // - Filter a table to show related transactions
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            By Home Type Financial Dashboard
          </h1>
          <p className="text-gray-600">
            View financial breakdowns and trends by property category
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Period: {new Date(sampleDateRange.startDate).toLocaleDateString()} -{' '}
            {new Date(sampleDateRange.endDate).toLocaleDateString()}
          </p>
        </div>

        <ByHomeTypeTab
          data={sampleData}
          dateRange={sampleDateRange}
          onItemClick={handleItemClick}
        />

        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage Notes</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-blue-600 mt-0.5">•</span>
              <span>
                <strong>Category Selector:</strong> Use the pill buttons at the top to switch between
                Property Management, Arbitrage, Home Owned, and Shared categories.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-blue-600 mt-0.5">•</span>
              <span>
                <strong>Breakdown Cards:</strong> Click on any income or expense item to drill down
                into transaction details (check console for demo).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-blue-600 mt-0.5">•</span>
              <span>
                <strong>Progress Bars:</strong> Visual indicators show the percentage contribution of
                each item to the total.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-blue-600 mt-0.5">•</span>
              <span>
                <strong>Monthly Trend Chart:</strong> The area chart at the bottom shows income vs
                expenses over time for the selected category.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-blue-600 mt-0.5">•</span>
              <span>
                <strong>Responsive Design:</strong> The layout automatically stacks on mobile devices
                for optimal viewing.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-blue-600 mt-0.5">•</span>
              <span>
                <strong>Category-Specific Features:</strong> PM includes churn metrics, Shared shows
                employee costs by department with refunds/chargebacks.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ByHomeTypeTabExample;
