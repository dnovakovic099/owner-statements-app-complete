import { useState, useEffect, useCallback } from 'react';

interface RevenueTrendParams {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month' | 'year';
  ownerId?: string | number;
  propertyId?: string | number;
}

interface TrendDataPoint {
  period: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  bookings?: number;
}

interface RevenueTrendData {
  trends: TrendDataPoint[];
  totals: {
    revenue: number;
    expenses: number;
    netIncome: number;
  };
}

interface UseRevenueTrendReturn {
  data: RevenueTrendData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const useRevenueTrend = (
  params: RevenueTrendParams
): UseRevenueTrendReturn => {
  const [data, setData] = useState<RevenueTrendData | null>(null);
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

      if (params.ownerId) {
        queryParams.append('ownerId', String(params.ownerId));
      }
      if (params.propertyId) {
        queryParams.append('propertyId', String(params.propertyId));
      }

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/revenue-trend?${queryParams.toString()}`,
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
        err instanceof Error ? err.message : 'Failed to fetch revenue trend';
      setError(errorMessage);
      console.error('Error fetching revenue trend:', err);
    } finally {
      setLoading(false);
    }
  }, [params.startDate, params.endDate, params.granularity, params.ownerId, params.propertyId]);

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
