import { useState, useEffect, useCallback } from 'react';

interface RecentStatement {
  id: number;
  propertyName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalRevenue: number;
  ownerPayout: number;
  status: string;
}

interface UseRecentStatementsReturn {
  data: RecentStatement[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const useRecentStatements = (): UseRecentStatementsReturn => {
  const [data, setData] = useState<RecentStatement[] | null>(null);
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
        `${baseUrl}/api/analytics/recent-statements`,
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
        err instanceof Error ? err.message : 'Failed to fetch recent statements';
      setError(errorMessage);
      console.error('Error fetching recent statements:', err);
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
