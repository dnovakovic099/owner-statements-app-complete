import React, { useState } from 'react';
import { ExpensesCategoryChart, ExpenseCategory } from './ExpensesCategoryChart';

/**
 * Example usage of ExpensesCategoryChart component
 *
 * This demonstrates how to integrate the component with real data
 * and handle category click interactions.
 */

const ExpensesCategoryChartExample: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);

  // Sample expense data
  const expenseCategories: ExpenseCategory[] = [
    { name: 'Cleaning', amount: 4500, color: '#2563eb' },
    { name: 'Maintenance', amount: 3200, color: '#0891b2' },
    { name: 'Utilities', amount: 2800, color: '#6366f1' },
    { name: 'Supplies', amount: 1900, color: '#8b5cf6' },
    { name: 'Marketing', amount: 1500, color: '#64748b' },
    { name: 'Insurance', amount: 1200, color: '#0ea5e9' },
    { name: 'Software', amount: 800, color: '#06b6d4' },
    { name: 'Professional Services', amount: 600, color: '#6d28d9' },
  ];

  const totalExpenses = expenseCategories.reduce((sum, cat) => sum + cat.amount, 0);

  const handleCategoryClick = (category: ExpenseCategory) => {
    setSelectedCategory(category);
    console.log('Category clicked:', category);
    // Here you could:
    // - Open a modal with detailed transactions
    // - Navigate to a detailed view
    // - Filter other components based on this category
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Expenses Category Chart Example
        </h1>

        {/* Main Chart Component */}
        <ExpensesCategoryChart
          categories={expenseCategories}
          total={totalExpenses}
          onCategoryClick={handleCategoryClick}
        />

        {/* Selected Category Display */}
        {selectedCategory && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">
              Selected Category
            </h3>
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <span className="text-blue-900 font-medium">
                {selectedCategory.name}
              </span>
              <span className="text-blue-700">
                ${selectedCategory.amount.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Usage Instructions */}
        <div className="mt-8 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Usage</h3>
          <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-x-auto">
            <code>{`import { ExpensesCategoryChart } from './MiddleRow';

const categories = [
  { name: 'Cleaning', amount: 4500, color: '#2563eb' },
  { name: 'Maintenance', amount: 3200, color: '#0891b2' },
  // ... more categories
];

<ExpensesCategoryChart
  categories={categories}
  total={16500}
  onCategoryClick={(category) => {
    console.log('Clicked:', category);
  }}
/>`}</code>
          </pre>
        </div>

        {/* Features List */}
        <div className="mt-6 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Features</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Interactive donut chart with hover effects</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Center display shows total amount</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Top 5 categories listed below chart</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Clickable segments and list items</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Professional color palette (blues, teals, grays)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Synchronized hover states between chart and list</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Custom tooltips with amount and percentage</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Empty state handling</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Fully typed with TypeScript</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>QuickBooks-inspired styling</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ExpensesCategoryChartExample;
