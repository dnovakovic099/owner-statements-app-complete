import { useState, useEffect, useCallback } from 'react';

interface StatementStatusParams {
  startDate: string;
  endDate: string;
  ownerId?: string;
  propertyId?: string;
  tag?: string;
  groupId?: string;
}

interface StatementStatusItem {
  status: string;
  count: number;
}

interface UseStatementStatusReturn {
  data: StatementStatusItem[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const useStatementStatus = (
  params: StatementStatusParams
): UseStatementStatusReturn => {
  const [data, setData] = useState<StatementStatusItem[] | null>(null);
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
      if (params.ownerId) queryParams.append('ownerId', params.ownerId);
      if (params.propertyId) queryParams.append('propertyId', params.propertyId);
      if (params.tag) queryParams.append('tag', params.tag);
      if (params.groupId) queryParams.append('groupId', params.groupId);

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/statement-status?${queryParams.toString()}`,
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
        err instanceof Error ? err.message : 'Failed to fetch statement status';
      setError(errorMessage);
      console.error('Error fetching statement status:', err);
    } finally {
      setLoading(false);
    }
  }, [params.startDate, params.endDate, params.ownerId, params.propertyId, params.tag, params.groupId]);

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
