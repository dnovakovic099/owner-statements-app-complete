import { useState, useEffect, useCallback } from 'react';

interface PayoutTrendParams {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month' | 'quarter';
}

interface PayoutTrendDataPoint {
  period: string;
  periodDate: string;
  payout: number;
}

interface UsePayoutTrendReturn {
  data: PayoutTrendDataPoint[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const usePayoutTrend = (
  params: PayoutTrendParams
): UsePayoutTrendReturn => {
  const [data, setData] = useState<PayoutTrendDataPoint[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        startDate: params.startDate,
        endDate: params.endDate,
        granularity: params.granularity,
      });

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/payout-trend?${queryParams.toString()}`,
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
        err instanceof Error ? err.message : 'Failed to fetch payout trend';
      setError(errorMessage);
      console.error('Error fetching payout trend:', err);
    } finally {
      setLoading(false);
    }
  }, [params.startDate, params.endDate, params.granularity]);

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
