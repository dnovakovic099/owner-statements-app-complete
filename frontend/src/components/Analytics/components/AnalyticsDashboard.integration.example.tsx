import React, { useState, useEffect } from 'react';
import { KPICardsRow, type KPIData } from './KPICardsRow';

/**
 * Integration example showing how to use KPICardsRow in an Analytics Dashboard
 *
 * This example demonstrates:
 * 1. Fetching analytics data from an API
 * 2. Handling loading states
 * 3. Error handling
 * 4. Proper TypeScript typing
 */

interface AnalyticsResponse {
  current: {
    revenue: number;
    payouts: number;
    pmFees: number;
    statementCount: number;
  };
  previous: {
    revenue: number;
    payouts: number;
    pmFees: number;
    statementCount: number;
  };
}

export const AnalyticsDashboardIntegration: React.FC = () => {
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);

        // Example API call - replace with your actual endpoint
        const response = await fetch('/api/analytics/kpis', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch analytics data');
        }

        const data: AnalyticsResponse = await response.json();

        // Calculate percent changes
        const calculateChange = (current: number, previous: number): number => {
          if (previous === 0) return 0;
          return ((current - previous) / previous) * 100;
        };

        // Transform API response to KPIData format
        const transformedData: KPIData = {
          revenue: data.current.revenue,
          previousRevenue: data.previous.revenue,
          revenueChange: calculateChange(data.current.revenue, data.previous.revenue),

          payouts: data.current.payouts,
          previousPayouts: data.previous.payouts,
          payoutsChange: calculateChange(data.current.payouts, data.previous.payouts),

          pmFees: data.current.pmFees,
          previousPmFees: data.previous.pmFees,
          pmFeesChange: calculateChange(data.current.pmFees, data.previous.pmFees),

          statementCount: data.current.statementCount,
          previousStatementCount: data.previous.statementCount,
          statementCountChange: calculateChange(
            data.current.statementCount,
            data.previous.statementCount
          ),
        };

        setKpiData(transformedData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Analytics</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // Loading state or loaded data
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <KPICardsRow
        data={kpiData || {
          revenue: 0,
          payouts: 0,
          pmFees: 0,
          statementCount: 0,
        }}
        loading={loading}
      />

      {/* Other dashboard content would go here */}
      <div className="mt-8">
        {/* Charts, tables, etc. */}
      </div>
    </div>
  );
};

/**
 * Alternative: Using with React Query for better data management
 */
/*
import { useQuery } from '@tanstack/react-query';

export const AnalyticsDashboardWithReactQuery: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-kpis'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/kpis');
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json() as Promise<AnalyticsResponse>;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const kpiData: KPIData | null = data ? transformAnalyticsData(data) : null;

  return (
    <KPICardsRow
      data={kpiData || defaultKPIData}
      loading={isLoading}
    />
  );
};
*/

export default AnalyticsDashboardIntegration;
