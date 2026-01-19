import { useState, useEffect, useCallback } from 'react';

interface RecentStatementsParams {
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  propertyId?: string;
  tag?: string;
  groupId?: string;
}

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

export const useRecentStatements = (
  params?: RecentStatementsParams
): UseRecentStatementsReturn => {
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

      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.ownerId) queryParams.append('ownerId', params.ownerId);
      if (params?.propertyId) queryParams.append('propertyId', params.propertyId);
      if (params?.tag) queryParams.append('tag', params.tag);
      if (params?.groupId) queryParams.append('groupId', params.groupId);

      const queryString = queryParams.toString();
      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/recent-statements${queryString ? `?${queryString}` : ''}`,
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
  }, [params?.startDate, params?.endDate, params?.ownerId, params?.propertyId, params?.tag, params?.groupId]);

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
