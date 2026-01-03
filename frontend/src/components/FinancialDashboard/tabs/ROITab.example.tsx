import React from 'react';
import { ROITab, ROIMetrics, TrendDataPoint, PropertyPerformance } from './ROITab';

/**
 * Example usage of the ROITab component
 *
 * This demonstrates how to use the ROITab component with sample data.
 * ROI is calculated as: (Net Income / Total Expenses) * 100
 */

// Sample ROI metrics data with changes vs prior period
const sampleROIData: ROIMetrics = {
  average: {
    value: 85.5,  // 85.5% average ROI
    change: 5.2,  // Up 5.2% from prior period
  },
  pm: {
    value: 120.3, // 120.3% ROI for PM properties
    change: 8.1,  // Up 8.1% from prior period
  },
  arbitrage: {
    value: 65.4,  // 65.4% ROI for Arbitrage properties
    change: -2.3, // Down 2.3% from prior period
  },
  owned: {
    value: 45.8,  // 45.8% ROI for Owned properties
    change: 1.5,  // Up 1.5% from prior period
  },
};

// Sample trend data showing net income by category over time
const sampleTrendData: TrendDataPoint[] = [
  { month: '2024-01', PM: 25000, Arbitrage: 18000, Owned: 12000 },
  { month: '2024-02', PM: 28000, Arbitrage: 19500, Owned: 13500 },
  { month: '2024-03', PM: 26500, Arbitrage: 17000, Owned: 11000 },
  { month: '2024-04', PM: 30000, Arbitrage: 22000, Owned: 14000 },
  { month: '2024-05', PM: 32000, Arbitrage: 21000, Owned: 15500 },
  { month: '2024-06', PM: 31000, Arbitrage: 23500, Owned: 16000 },
  { month: '2024-07', PM: 35000, Arbitrage: 24000, Owned: 17500 },
  { month: '2024-08', PM: 33500, Arbitrage: 22500, Owned: 16500 },
  { month: '2024-09', PM: 36000, Arbitrage: 25000, Owned: 18000 },
  { month: '2024-10', PM: 34000, Arbitrage: 23000, Owned: 17000 },
  { month: '2024-11', PM: 37500, Arbitrage: 26500, Owned: 19000 },
  { month: '2024-12', PM: 39000, Arbitrage: 28000, Owned: 20000 },
];

// Top 5 performing properties by ROI
const sampleTopPerformers: PropertyPerformance[] = [
  {
    propertyId: 101,
    propertyName: 'Sunset Boulevard Suite',
    roi: 145.8,
    trend: 'up',
  },
  {
    propertyId: 205,
    propertyName: 'Downtown Loft',
    roi: 132.4,
    trend: 'up',
  },
  {
    propertyId: 312,
    propertyName: 'Beachfront Villa',
    roi: 128.9,
    trend: 'stable',
  },
  {
    propertyId: 156,
    propertyName: 'Mountain View Cabin',
    roi: 118.2,
    trend: 'up',
  },
  {
    propertyId: 89,
    propertyName: 'City Center Apartment',
    roi: 112.5,
    trend: 'down',
  },
];

// Bottom 5 properties needing attention (low ROI)
const sampleNeedsAttention: PropertyPerformance[] = [
  {
    propertyId: 234,
    propertyName: 'Riverside Cottage',
    roi: 35.2,
    trend: 'down',
  },
  {
    propertyId: 178,
    propertyName: 'Suburban House',
    roi: 38.7,
    trend: 'down',
  },
  {
    propertyId: 421,
    propertyName: 'Garden Flat',
    roi: 42.1,
    trend: 'stable',
  },
  {
    propertyId: 367,
    propertyName: 'Lakeside Retreat',
    roi: 45.9,
    trend: 'down',
  },
  {
    propertyId: 145,
    propertyName: 'Historic Townhouse',
    roi: 48.3,
    trend: 'up',
  },
];

/**
 * Example component demonstrating ROITab usage
 */
export const ROITabExample: React.FC = () => {
  const handlePropertyClick = (propertyId: number) => {
    console.log('Property clicked:', propertyId);
    // In a real app, this would navigate to property details or show a modal
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ROI Dashboard
          </h1>
          <p className="text-gray-600">
            Track return on investment across all properties and categories
          </p>
        </div>

        <ROITab
          roiData={sampleROIData}
          trendData={sampleTrendData}
          topPerformers={sampleTopPerformers}
          needsAttention={sampleNeedsAttention}
          onPropertyClick={handlePropertyClick}
        />
      </div>
    </div>
  );
};

/**
 * Helper function to calculate ROI from financial data
 * ROI = (Net Income / Total Expenses) * 100
 */
export const calculateROI = (netIncome: number, totalExpenses: number): number => {
  if (totalExpenses === 0) return 0;
  return (netIncome / totalExpenses) * 100;
};

/**
 * Helper function to calculate ROI change between two periods
 */
export const calculateROIChange = (currentROI: number, previousROI: number): number => {
  return currentROI - previousROI;
};

/**
 * Helper function to determine trend direction
 */
export const determineTrend = (
  currentValue: number,
  previousValue: number,
  threshold: number = 2
): 'up' | 'down' | 'stable' => {
  const change = currentValue - previousValue;
  if (Math.abs(change) < threshold) return 'stable';
  return change > 0 ? 'up' : 'down';
};

export default ROITabExample;
