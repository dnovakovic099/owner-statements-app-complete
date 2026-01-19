import { useState, useEffect, useCallback } from 'react';

interface Owner {
  id: number | string;
  name: string;
}

interface Property {
  id: number | string;
  name: string;
}

interface AnalyticsFiltersData {
  owners: Owner[];
  properties: Property[];
}

interface UseAnalyticsFiltersReturn {
  data: AnalyticsFiltersData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const useAnalyticsFilters = (): UseAnalyticsFiltersReturn => {
  const [data, setData] = useState<AnalyticsFiltersData | null>(null);
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

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/filters`,
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
        err instanceof Error ? err.message : 'Failed to fetch analytics filters';
      setError(errorMessage);
      console.error('Error fetching analytics filters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
