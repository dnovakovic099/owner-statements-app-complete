/**
 * BaseTable Usage Example
 *
 * This file demonstrates how to use the BaseTable component for the Financial Dashboard.
 */

import React, { useState, useEffect } from 'react';
import BaseTable from './BaseTable';
import { PropertyFinancialData } from './types';

// Example: Using BaseTable in a page component
const FinancialReportPage: React.FC = () => {
  const [financialData, setFinancialData] = useState<PropertyFinancialData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch financial data from API
    const fetchFinancialData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/financials/properties');
        const data = await response.json();
        setFinancialData(data.properties);
      } catch (error) {
        console.error('Error fetching financial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFinancialData();
  }, []);

  const handleTransactionClick = (propertyId: number, month: string) => {
    console.log('Transaction clicked:', { propertyId, month });
    // You can fetch detailed transactions here and pass them to the modal
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <BaseTable
        data={financialData}
        monthsToShow={6} // Show last 6 months
        onTransactionClick={handleTransactionClick}
      />
    </div>
  );
};

// Example: Sample data structure
export const sampleFinancialData: PropertyFinancialData[] = [
  {
    propertyId: 1,
    propertyName: 'Sunset Villa',
    homeCategory: 'PM',
    monthlyData: [
      {
        month: '2025-08',
        netIncome: 4500,
        grossRevenue: 8000,
        totalExpenses: 3500,
        sharedExpenses: 500,
      },
      {
        month: '2025-09',
        netIncome: 5200,
        grossRevenue: 9000,
        totalExpenses: 3800,
        sharedExpenses: 500,
      },
      {
        month: '2025-10',
        netIncome: 4800,
        grossRevenue: 8500,
        totalExpenses: 3700,
        sharedExpenses: 500,
      },
      {
        month: '2025-11',
        netIncome: 6000,
        grossRevenue: 10000,
        totalExpenses: 4000,
        sharedExpenses: 500,
      },
      {
        month: '2025-12',
        netIncome: 7500,
        grossRevenue: 12000,
        totalExpenses: 4500,
        sharedExpenses: 500,
      },
      {
        month: '2026-01',
        netIncome: 5500,
        grossRevenue: 9500,
        totalExpenses: 4000,
        sharedExpenses: 500,
      },
    ],
    lifetimeTotal: {
      netIncome: 125000,
      grossRevenue: 250000,
      totalExpenses: 125000,
    },
  },
  {
    propertyId: 2,
    propertyName: 'Oceanfront Paradise',
    homeCategory: 'Arbitrage',
    monthlyData: [
      {
        month: '2025-08',
        netIncome: 3200,
        grossRevenue: 6500,
        totalExpenses: 3300,
        sharedExpenses: 400,
      },
      {
        month: '2025-09',
        netIncome: 3800,
        grossRevenue: 7200,
        totalExpenses: 3400,
        sharedExpenses: 400,
      },
      {
        month: '2025-10',
        netIncome: 3500,
        grossRevenue: 6800,
        totalExpenses: 3300,
        sharedExpenses: 400,
      },
      {
        month: '2025-11',
        netIncome: 4200,
        grossRevenue: 7800,
        totalExpenses: 3600,
        sharedExpenses: 400,
      },
      {
        month: '2025-12',
        netIncome: 5000,
        grossRevenue: 9000,
        totalExpenses: 4000,
        sharedExpenses: 400,
      },
      {
        month: '2026-01',
        netIncome: 3900,
        grossRevenue: 7500,
        totalExpenses: 3600,
        sharedExpenses: 400,
      },
    ],
    lifetimeTotal: {
      netIncome: 85000,
      grossRevenue: 180000,
      totalExpenses: 95000,
    },
  },
  {
    propertyId: 3,
    propertyName: 'Mountain Retreat',
    homeCategory: 'Owned',
    monthlyData: [
      {
        month: '2025-08',
        netIncome: 6000,
        grossRevenue: 9500,
        totalExpenses: 3500,
        sharedExpenses: 300,
      },
      {
        month: '2025-09',
        netIncome: 6500,
        grossRevenue: 10000,
        totalExpenses: 3500,
        sharedExpenses: 300,
      },
      {
        month: '2025-10',
        netIncome: 5800,
        grossRevenue: 9200,
        totalExpenses: 3400,
        sharedExpenses: 300,
      },
      {
        month: '2025-11',
        netIncome: 7000,
        grossRevenue: 11000,
        totalExpenses: 4000,
        sharedExpenses: 300,
      },
      {
        month: '2025-12',
        netIncome: 8500,
        grossRevenue: 13000,
        totalExpenses: 4500,
        sharedExpenses: 300,
      },
      {
        month: '2026-01',
        netIncome: 6200,
        grossRevenue: 9800,
        totalExpenses: 3600,
        sharedExpenses: 300,
      },
    ],
    lifetimeTotal: {
      netIncome: 180000,
      grossRevenue: 320000,
      totalExpenses: 140000,
    },
  },
  {
    propertyId: 4,
    propertyName: 'Downtown Loft',
    homeCategory: 'PM',
    monthlyData: [
      {
        month: '2025-08',
        netIncome: -500, // Negative example
        grossRevenue: 2000,
        totalExpenses: 2500,
        sharedExpenses: 200,
      },
      {
        month: '2025-09',
        netIncome: 500,
        grossRevenue: 3000,
        totalExpenses: 2500,
        sharedExpenses: 200,
      },
      {
        month: '2025-10',
        netIncome: 800,
        grossRevenue: 3500,
        totalExpenses: 2700,
        sharedExpenses: 200,
      },
      {
        month: '2025-11',
        netIncome: 1200,
        grossRevenue: 4000,
        totalExpenses: 2800,
        sharedExpenses: 200,
      },
      {
        month: '2025-12',
        netIncome: 1500,
        grossRevenue: 4500,
        totalExpenses: 3000,
        sharedExpenses: 200,
      },
      {
        month: '2026-01',
        netIncome: 1000,
        grossRevenue: 3800,
        totalExpenses: 2800,
        sharedExpenses: 200,
      },
    ],
    lifetimeTotal: {
      netIncome: 25000,
      grossRevenue: 80000,
      totalExpenses: 55000,
    },
  },
];

export default FinancialReportPage;
