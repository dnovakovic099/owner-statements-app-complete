import { useState, useEffect, useCallback } from 'react';

interface MonthlyComparisonParams {
  months?: number;
}

export interface MonthlyComparisonDataPoint {
  month: string;
  year: number;
  revenue: number;
  payout: number;
  expenses: number;
  count: number;
}

interface UseMonthlyComparisonReturn {
  data: MonthlyComparisonDataPoint[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const useMonthlyComparison = (
  params: MonthlyComparisonParams = {}
): UseMonthlyComparisonReturn => {
  const [data, setData] = useState<MonthlyComparisonDataPoint[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { months = 6 } = params;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const authData = localStorage.getItem('luxury-lodging-auth');
      const token = authData ? JSON.parse(authData).token : null;
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const queryParams = new URLSearchParams({
        months: months.toString(),
      });

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/monthly-comparison?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch monthly comparison';
      setError(errorMessage);
      console.error('Error fetching monthly comparison:', err);
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
};
