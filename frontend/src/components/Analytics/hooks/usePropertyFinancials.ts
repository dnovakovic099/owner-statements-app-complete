import { useState, useEffect, useCallback } from 'react';

interface PropertyFinancialsParams {
  startDate: string;
  endDate: string;
  ownerId?: string;
  propertyId?: string;
  groupId?: string;
  tag?: string;
  includeZero?: boolean;
}

export interface PropertyFinancialItem {
  propertyId: number;
  name: string;
  ownerName: string | null;
  pmFeePercentage: number | null;
  baseRate: number;
  guestFees: number;
  platformFees: number;
  revenue: number;
  pmCommission: number;
  taxes: number;
  grossPayout: number;
  expenses: number;
  ownerPayout: number;
  reservationCount: number;
  statementCount: number;
}

const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const usePropertyFinancials = (params: PropertyFinancialsParams) => {
  const [data, setData] = useState<PropertyFinancialItem[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const authData = localStorage.getItem('luxury-lodging-auth');
      const token = authData ? JSON.parse(authData).token : null;
      if (!token) throw new Error('Authentication token not found');

      const queryParams = new URLSearchParams({
        startDate: params.startDate,
        endDate: params.endDate,
      });
      if (params.ownerId) queryParams.set('ownerId', params.ownerId);
      if (params.propertyId) queryParams.set('propertyId', params.propertyId);
      if (params.groupId) queryParams.set('groupId', params.groupId);
      if (params.tag) queryParams.set('tag', params.tag);
      if (params.includeZero) queryParams.set('includeZero', 'true');

      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/analytics/property-financials?${queryParams.toString()}`,
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
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch property financials';
      setError(errorMessage);
      console.error('Error fetching property financials:', err);
    } finally {
      setLoading(false);
    }
  }, [params.startDate, params.endDate, params.ownerId, params.propertyId, params.groupId, params.tag, params.includeZero]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};
