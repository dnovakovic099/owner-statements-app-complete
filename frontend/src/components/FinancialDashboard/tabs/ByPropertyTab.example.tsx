import React, { useState } from 'react';
import ByPropertyTab from './ByPropertyTab';
import { PropertyFinancialData } from '../types';

/**
 * Example usage of ByPropertyTab component
 * 
 * This component displays a comprehensive table view of properties with:
 * - Monthly financial data in columns
 * - Lifetime totals
 * - Filtering by home category and bank account
 * - Search functionality
 * - Sortable columns
 * - Allocated costs row
 */

// Mock data for demonstration
const mockProperties: PropertyFinancialData[] = [
  {
    propertyId: 1,
    propertyName: 'Sunset Villa',
    homeCategory: 'PM',
    bankAccount: 'Chase Business',
    monthlyData: [
      {
        month: '2024-01',
        netIncome: 3500,
        grossRevenue: 5000,
        totalExpenses: 1500,
        sharedExpenses: 200,
      },
      {
        month: '2024-02',
        netIncome: 4200,
        grossRevenue: 6000,
        totalExpenses: 1800,
        sharedExpenses: 200,
      },
      {
        month: '2024-03',
        netIncome: 4800,
        grossRevenue: 6500,
        totalExpenses: 1700,
        sharedExpenses: 200,
      },
    ],
    lifetimeTotal: {
      netIncome: 12500,
      grossRevenue: 17500,
      totalExpenses: 5000,
    },
  },
  {
    propertyId: 2,
    propertyName: 'Downtown Loft',
    homeCategory: 'Arbitrage',
    bankAccount: 'Bank of America',
    monthlyData: [
      {
        month: '2024-01',
        netIncome: 2800,
        grossRevenue: 4200,
        totalExpenses: 1400,
        sharedExpenses: 200,
      },
      {
        month: '2024-02',
        netIncome: 3100,
        grossRevenue: 4500,
        totalExpenses: 1400,
        sharedExpenses: 200,
      },
      {
        month: '2024-03',
        netIncome: 3400,
        grossRevenue: 4800,
        totalExpenses: 1400,
        sharedExpenses: 200,
      },
    ],
    lifetimeTotal: {
      netIncome: 9300,
      grossRevenue: 13500,
      totalExpenses: 4200,
    },
  },
  {
    propertyId: 3,
    propertyName: 'Beachfront Condo',
    homeCategory: 'Owned',
    bankAccount: 'Chase Business',
    monthlyData: [
      {
        month: '2024-01',
        netIncome: 5200,
        grossRevenue: 7000,
        totalExpenses: 1800,
        sharedExpenses: 200,
      },
      {
        month: '2024-02',
        netIncome: 5800,
        grossRevenue: 7800,
        totalExpenses: 2000,
        sharedExpenses: 200,
      },
      {
        month: '2024-03',
        netIncome: 6400,
        grossRevenue: 8500,
        totalExpenses: 2100,
        sharedExpenses: 200,
      },
    ],
    lifetimeTotal: {
      netIncome: 17400,
      grossRevenue: 23300,
      totalExpenses: 5900,
    },
  },
];

const ByPropertyTabExample: React.FC = () => {
  const [selectedCell, setSelectedCell] = useState<{ propertyId: number; month: string } | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);

  const handleCellClick = (propertyId: number, month: string) => {
    setSelectedCell({ propertyId, month });
    console.log('Cell clicked:', { propertyId, month });
    // In a real app, this would open a transaction detail modal
  };

  const handlePropertyClick = (propertyId: number) => {
    setSelectedProperty(propertyId);
    console.log('Property clicked:', propertyId);
    // In a real app, this would navigate to property detail page or open a modal
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">By Property Tab - Example</h1>
        
        <ByPropertyTab
          properties={mockProperties}
          dateRange={{ startDate: '2024-01-01', endDate: '2024-03-31' }}
          onCellClick={handleCellClick}
          onPropertyClick={handlePropertyClick}
          isLoading={false}
        />

        {/* Display selected state */}
        {selectedCell && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Selected Cell:</strong> Property ID {selectedCell.propertyId}, Month {selectedCell.month}
            </p>
          </div>
        )}

        {selectedProperty && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Selected Property:</strong> Property ID {selectedProperty}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ByPropertyTabExample;
