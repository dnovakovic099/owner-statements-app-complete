import { useState, useEffect, useCallback } from 'react';

interface PropertyPerformanceParams {
  startDate: string;
  endDate: string;
  sortBy?: 'revenue' | 'netIncome' | 'occupancy' | 'bookings';
  ownerId?: string | number;
  propertyId?: string | number;
}

interface PropertyMetrics {
  propertyId: number;
  propertyName: string;
  address?: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  bookings: number;
  occupancyRate?: number;
  averageNightlyRate?: number;
}

interface PropertyPerformanceData {
  properties: PropertyMetrics[];
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    totalNetIncome: number;
    totalBookings: number;
  };
}

interface UsePropertyPerformanceReturn {
  data: PropertyPerformanceData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const usePropertyPerformance = (
  params: PropertyPerformanceParams
): UsePropertyPerformanceReturn => {
  const [data, setData] = useState<PropertyPerformanceData | null>(null);
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
      });

      if (params.sortBy) {
        queryParams.append('sortBy', params.sortBy);
      }
      if (params.ownerId) {
        queryParams.append('ownerId', String(params.ownerId));
      }
      if (params.propertyId) {
        queryParams.append('propertyId', String(params.propertyId));
      }

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/property-performance?${queryParams.toString()}`,
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
        err instanceof Error ? err.message : 'Failed to fetch property performance';
      setError(errorMessage);
      console.error('Error fetching property performance:', err);
    } finally {
      setLoading(false);
    }
  }, [params.startDate, params.endDate, params.sortBy, params.ownerId, params.propertyId]);

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
