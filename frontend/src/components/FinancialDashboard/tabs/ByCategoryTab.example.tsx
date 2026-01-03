import React, { useState } from 'react';
import ByCategoryTab, { CategoryData, QuickBooksCategory } from './ByCategoryTab';

// Mock data for demonstration
const mockCategoryData: CategoryData[] = [
  {
    category: 'Rent',
    amount: 125000,
    transactionCount: 45,
    type: 'income',
  },
  {
    category: 'Cleaning',
    amount: -18500,
    transactionCount: 120,
    type: 'expense',
  },
  {
    category: 'Maintenance',
    amount: -12300,
    transactionCount: 35,
    type: 'expense',
  },
  {
    category: 'Utility',
    amount: -8750,
    transactionCount: 90,
    type: 'expense',
  },
  {
    category: 'Darko Distribution',
    amount: 45000,
    transactionCount: 12,
    type: 'income',
  },
  {
    category: 'Louis Distribution',
    amount: 38000,
    transactionCount: 12,
    type: 'income',
  },
  {
    category: 'Owner Payout',
    amount: -25000,
    transactionCount: 6,
    type: 'expense',
  },
  {
    category: 'Mortgage',
    amount: -42000,
    transactionCount: 12,
    type: 'expense',
  },
  {
    category: 'Review refund',
    amount: -1200,
    transactionCount: 8,
    type: 'expense',
  },
  {
    category: 'Chargeback',
    amount: -850,
    transactionCount: 3,
    type: 'expense',
  },
  {
    category: 'Employee base pay',
    amount: -15000,
    transactionCount: 24,
    type: 'expense',
  },
  {
    category: 'Employee commission',
    amount: -5200,
    transactionCount: 18,
    type: 'expense',
  },
  {
    category: 'Photography pay',
    amount: -3400,
    transactionCount: 15,
    type: 'expense',
  },
  {
    category: 'Legal',
    amount: -2800,
    transactionCount: 4,
    type: 'expense',
  },
  {
    category: 'Tax',
    amount: -18900,
    transactionCount: 8,
    type: 'expense',
  },
  {
    category: 'Software subscription',
    amount: -4200,
    transactionCount: 36,
    type: 'expense',
  },
  {
    category: 'Arbitrage acquisition',
    amount: -75000,
    transactionCount: 5,
    type: 'expense',
  },
  {
    category: 'Home owner acquisition',
    amount: -125000,
    transactionCount: 2,
    type: 'expense',
  },
];

const ByCategoryTabExample: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<QuickBooksCategory | null>(null);

  const handleCategorySelect = (category: QuickBooksCategory) => {
    console.log('Category selected:', category);
    setSelectedCategory(category);
    // In a real app, this would trigger a modal or navigate to transaction details
  };

  const toggleLoading = () => {
    setIsLoading(!isLoading);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            By Category Tab - Example
          </h1>
          <p className="text-gray-600 mb-4">
            Interactive demonstration of the category analysis tab with filters, sorting, and visualizations.
          </p>

          {/* Debug Controls */}
          <div className="flex gap-4 items-center pt-4 border-t border-gray-200">
            <button
              onClick={toggleLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              {isLoading ? 'Hide Loading State' : 'Show Loading State'}
            </button>

            {selectedCategory && (
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <span className="font-medium text-blue-900">Selected:</span>{' '}
                <span className="text-blue-700">{selectedCategory}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Component */}
        <ByCategoryTab
          categories={mockCategoryData}
          onCategorySelect={handleCategorySelect}
          dateRange={{
            startDate: '2024-01-01',
            endDate: '2024-12-31',
          }}
          isLoading={isLoading}
        />

        {/* Usage Instructions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Features</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Category Filter:</strong> Select specific QuickBooks categories or view all
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Transaction Type Toggle:</strong> Filter by Income, Expenses, or All
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Search:</strong> Find categories by name
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Horizontal Bar Chart:</strong> Visual representation of top 10 categories (clickable)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Sortable Table:</strong> Click column headers to sort by Category, Amount, or Percentage
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Responsive Design:</strong> Stacks on mobile, side-by-side on desktop
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>
                <strong>Click to Drill Down:</strong> Click any row or bar to view transactions (triggers onCategorySelect callback)
              </span>
            </li>
          </ul>
        </div>

        {/* Code Example */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage Example</h2>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
{`import { ByCategoryTab } from './tabs';
import type { CategoryData } from './tabs';

const MyDashboard = () => {
  const categoryData: CategoryData[] = [
    {
      category: 'Rent',
      amount: 125000,
      transactionCount: 45,
      type: 'income',
    },
    // ... more categories
  ];

  const handleCategorySelect = (category) => {
    // Open modal or navigate to transactions
    console.log('Selected category:', category);
  };

  return (
    <ByCategoryTab
      categories={categoryData}
      onCategorySelect={handleCategorySelect}
      dateRange={{
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      }}
      isLoading={false}
    />
  );
};`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ByCategoryTabExample;
