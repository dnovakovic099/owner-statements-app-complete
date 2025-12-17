import axios from 'axios';
import { DashboardData, Owner, Property, Statement, SyncResponse, QuickBooksTransaction, QuickBooksAccount, QuickBooksDepartment, Listing } from '../types';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3003/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthCredentials = (username: string, password: string) => {
  api.defaults.auth = { username, password };
};

// Initialize auth from localStorage if available
const initializeAuth = () => {
  try {
    const stored = localStorage.getItem('luxury-lodging-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.username && parsed.password) {
        setAuthCredentials(parsed.username, parsed.password);
      }
    }
  } catch (error) {
    console.warn('Failed to initialize auth credentials');
  }
};

initializeAuth();

// Dashboard API
export const dashboardAPI = {
  getDashboardData: async (): Promise<DashboardData> => {
    const response = await api.get('/dashboard');
    return response.data;
  },

  getOwners: async (): Promise<Owner[]> => {
    const response = await api.get('/dashboard/owners');
    return response.data;
  },

  getProperties: async (): Promise<Property[]> => {
    const response = await api.get('/dashboard/properties');
    return response.data;
  },
};

// Statements API
export const statementsAPI = {
  getStatements: async (filters?: {
    ownerId?: string;
    propertyId?: string;
    propertyIds?: string[];
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ statements: Statement[]; total: number; limit: number; offset: number }> => {
    const params = new URLSearchParams();
    if (filters?.ownerId) params.append('ownerId', filters.ownerId);
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    // Support multi-select: pass propertyIds as comma-separated string
    if (filters?.propertyIds && filters.propertyIds.length > 0) {
      params.append('propertyIds', filters.propertyIds.join(','));
    }
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());
    if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());

    const response = await api.get(`/statements?${params.toString()}`);
    return response.data;
  },

  generateStatement: async (data: {
    ownerId: string;
    propertyId?: string;
    propertyIds?: string[]; // Support multiple properties for combined statement
    tag?: string;
    startDate: string;
    endDate: string;
    calculationType: string;
    generateCombined?: boolean; // For tag-based generation: true = one combined statement, false = separate statements
  }): Promise<{ 
    message: string;
    jobId?: string;  // For background jobs (bulk generation)
    status?: string;  // Job status
    note?: string;  // User-facing message
    statusUrl?: string;  // URL to check job status
    summary?: {
      generated: number;
      skipped: number;
      errors: number;
    };
    results?: {
      generated: any[];
      skipped: any[];
      errors: any[];
    };
  }> => {
    const response = await api.post('/statements/generate', data);
    return response.data;
  },

  updateStatementStatus: async (id: number, status: string): Promise<{ message: string }> => {
    const response = await api.put(`/statements/${id}/status`, { status });
    return response.data;
  },

  getStatement: async (id: number): Promise<Statement> => {
    const response = await api.get(`/statements/${id}`);
    return response.data;
  },
   getStatementData: async (id: number): Promise<Statement> => {
    const response = await api.get(`/statements/${id}/view/data`);
    return response.data.data;
  },

  downloadStatement: async (id: number): Promise<Blob> => {
    const response = await api.get(`/statements/${id}/download`, { responseType: 'blob' });
    return response.data;
  },

  downloadStatementWithHeaders: async (id: number): Promise<{ blob: Blob; filename: string }> => {
    const response = await api.get(`/statements/${id}/download`, { responseType: 'blob' });

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = `statement-${id}.pdf`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    return {
      blob: response.data,
      filename
    };
  },

  bulkDownloadStatements: async (ids: number[]): Promise<{ blob: Blob; filename: string }> => {
    const response = await api.post('/statements/bulk-download', { ids }, { responseType: 'blob' });

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = `statements-${new Date().toISOString().split('T')[0]}.zip`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    return {
      blob: response.data,
      filename
    };
  },

  deleteStatement: async (id: number): Promise<void> => {
    await api.delete(`/statements/${id}`);
  },

  getJobStatus: async (jobId: string): Promise<{ status: string; progress?: { current: number; total: number }; result?: { summary: { generated: number; skipped: number; errors: number } } }> => {
    const response = await api.get(`/statements/jobs/${jobId}`);
    return response.data;
  },

  editStatement: async (id: number, data: {
    expenseIdsToRemove?: number[];
    cancelledReservationIdsToAdd?: number[];
    reservationIdsToAdd?: number[];
    reservationIdsToRemove?: number[];
    customReservationToAdd?: {
      guestName: string;
      checkInDate: string;
      checkOutDate: string;
      amount: number;
      nights?: number;
      description?: string;
    };
    reservationCleaningFeeUpdates?: { [reservationId: string]: number };
  }): Promise<{ message: string; statement?: any }> => {
    const response = await api.put(`/statements/${id}`, data);
    return response.data;
  },

  getCancelledReservations: async (id: number): Promise<{
    cancelledReservations: any[];
    count: number;
    statementPeriod: {
      start: string;
      end: string;
      propertyId?: number;
    };
  }> => {
    const response = await api.get(`/statements/${id}/cancelled-reservations`);
    return response.data;
  },

  getAvailableReservations: async (id: number): Promise<{
    availableReservations: any[];
    count: number;
    statementPeriod: {
      start: string;
      end: string;
      propertyId?: number;
      calculationType?: string;
    };
  }> => {
    const response = await api.get(`/statements/${id}/available-reservations`);
    return response.data;
  },

  reconfigureStatement: async (id: number, data: {
    startDate: string;
    endDate: string;
    calculationType: 'checkout' | 'calendar';
  }): Promise<{ message: string; statement: Statement }> => {
    const response = await api.put(`/statements/${id}/reconfigure`, data);
    return response.data;
  },
};

// Reservations API
export const reservationsAPI = {
  syncReservations: async (data: {
    startDate: string;
    endDate: string;
  }): Promise<SyncResponse> => {
    const response = await api.post('/reservations/sync', data);
    return response.data;
  },

  downloadTemplate: async (): Promise<Blob> => {
    const response = await api.get('/reservations-import/template', { responseType: 'blob' });
    return response.data;
  },

  uploadCSV: async (file: File): Promise<{
    success: boolean;
    message: string;
    data?: any;
    error?: string;
  }> => {
    const formData = new FormData();
    formData.append('reservationFile', file);
    const response = await api.post('/reservations-import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
};

// Expenses API
export const expensesAPI = {
  syncExpenses: async (data: {
    startDate: string;
    endDate: string;
  }): Promise<SyncResponse> => {
    const response = await api.post('/expenses/sync', data);
    return response.data;
  },

  uploadCSV: async (file: File): Promise<{ processed: number; errors: number }> => {
    const formData = new FormData();
    formData.append('csvFile', file);

    const response = await api.post('/expenses/upload-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('expenseFile', file);
    const response = await api.post('/expenses/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  getUploaded: async () => {
    const response = await api.get('/expenses/uploaded');
    return response.data;
  },

  getDuplicates: async (params?: { startDate?: string; endDate?: string; propertyId?: string }) => {
    const response = await api.get('/expenses/duplicates', { params });
    return response.data;
  },

  deleteUploaded: async (filename: string) => {
    const response = await api.delete(`/expenses/uploaded/${filename}`);
    return response.data;
  },

  getTemplate: async () => {
    const response = await api.get('/expenses/template', { responseType: 'blob' });
    return response.data;
  },
};

// QuickBooks API
export const quickBooksAPI = {
  getTransactions: async (params?: {
    startDate?: string;
    endDate?: string;
    accountType?: string;
  }): Promise<{ data: QuickBooksTransaction[]; count: number }> => {
    const response = await api.get('/quickbooks/transactions', { params });
    return response.data;
  },

  getAccounts: async (): Promise<{ data: QuickBooksAccount[] }> => {
    const response = await api.get('/quickbooks/accounts');
    return response.data;
  },

  getDepartments: async (): Promise<{ data: QuickBooksDepartment[] }> => {
    const response = await api.get('/quickbooks/departments');
    return response.data;
  },

  getProperties: async (): Promise<{ data: Property[] }> => {
    const response = await api.get('/quickbooks/properties');
    return response.data;
  },

  getListings: async (): Promise<{ data: Listing[] }> => {
    const response = await api.get('/quickbooks/listings');
    return response.data;
  },

  categorizeTransaction: async (transactionId: string, data: {
    propertyId: string;
    listingId?: string;
    department: string;
  }): Promise<{ message: string }> => {
    const response = await api.put(`/quickbooks/transactions/${transactionId}/categorize`, data);
    return response.data;
  },

  getAuthUrl: async (): Promise<{ authUrl: string }> => {
    const response = await api.get('/quickbooks/auth-url');
    return response.data;
  },

  handleAuthCallback: async (code: string): Promise<{ message: string }> => {
    const response = await api.post('/quickbooks/auth/callback', { code });
    return response.data;
  },
};

// Listings API
export const listingsAPI = {
  getListings: async (listingIds?: number[]): Promise<{ success: boolean; listings: Listing[] }> => {
    const params = listingIds && listingIds.length > 0
      ? `?ids=${listingIds.join(',')}`
      : '';
    const response = await api.get(`/listings${params}`);
    return response.data;
  },

  getListingNames: async (): Promise<{ success: boolean; listings: Pick<Listing, 'id' | 'name' | 'displayName' | 'nickname' | 'internalNotes'>[] }> => {
    const response = await api.get('/listings/names');
    return response.data;
  },

  getListing: async (id: number): Promise<{ success: boolean; listing: Listing }> => {
    const response = await api.get(`/listings/${id}`);
    return response.data;
  },

  updateListingConfig: async (id: number, config: {
    displayName?: string;
    isCohostOnAirbnb?: boolean;
    pmFeePercentage?: number;
    defaultPetFee?: number | null;
    tags?: string[];
    airbnbPassThroughTax?: boolean;
    disregardTax?: boolean;
    cleaningFeePassThrough?: boolean;
    guestPaidDamageCoverage?: boolean;
    includeChildListings?: boolean;
    waiveCommission?: boolean;
    waiveCommissionUntil?: string | null;
    ownerEmail?: string | null;
    ownerGreeting?: string | null;
    autoSendStatements?: boolean;
    internalNotes?: string | null;
  }): Promise<{ success: boolean; message: string; listing: Listing }> => {
    const response = await api.put(`/listings/${id}/config`, config);
    return response.data;
  },

  updateDisplayName: async (id: number, displayName: string): Promise<{ success: boolean; message: string; listing: Listing }> => {
    const response = await api.put(`/listings/${id}/display-name`, { displayName });
    return response.data;
  },

  updateCohostStatus: async (id: number, isCohostOnAirbnb: boolean): Promise<{ success: boolean; message: string; listing: Listing }> => {
    const response = await api.put(`/listings/${id}/cohost-status`, { isCohostOnAirbnb });
    return response.data;
  },

  updatePmFee: async (id: number, pmFeePercentage: number): Promise<{ success: boolean; message: string; listing: Listing }> => {
    const response = await api.put(`/listings/${id}/pm-fee`, { pmFeePercentage });
    return response.data;
  },

  syncListings: async (): Promise<{ success: boolean; message: string; synced: number; errors: number }> => {
    const response = await api.post('/listings/sync');
    return response.data;
  },

  getNewlyAddedListings: async (days: number = 7): Promise<{
    success: boolean;
    count: number;
    listings: Array<{
      id: number;
      name: string;
      displayName: string;
      nickname: string | null;
      city: string | null;
      state: string | null;
      pmFeePercentage: number | null;
      createdAt: string;
    }>;
  }> => {
    const response = await api.get(`/listings/newly-added?days=${days}`);
    return response.data;
  },
};

// Email API
export interface EmailLog {
  id: number;
  statementId: number;
  propertyId: number | null;
  recipientEmail: string;
  recipientName: string | null;
  propertyName: string | null;
  frequencyTag: string | null;
  subject: string | null;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  messageId: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  attemptedAt: string | null;
  sentAt: string | null;
  retryCount: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export interface EmailStats {
  sent: number;
  failed: number;
  pending: number;
  bounced: number;
}

export const emailAPI = {
  getEmailLogs: async (filters?: {
    limit?: number;
    offset?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    recipientEmail?: string;
    statementId?: number;
  }): Promise<{ logs: EmailLog[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());
    if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.recipientEmail) params.append('recipientEmail', filters.recipientEmail);
    if (filters?.statementId !== undefined) params.append('statementId', filters.statementId.toString());

    const response = await api.get(`/email/logs?${params.toString()}`);
    return { logs: response.data.logs, total: response.data.total };
  },

  getEmailStats: async (): Promise<EmailStats> => {
    const response = await api.get('/email/logs/stats');
    const stats = response.data.stats;
    return {
      sent: stats.totalSent,
      failed: stats.totalFailed,
      pending: stats.totalPending,
      bounced: stats.totalBounced
    };
  },

  getEmailLog: async (id: number): Promise<EmailLog> => {
    const response = await api.get(`/email/logs/${id}`);
    return response.data;
  },

  retryEmail: async (id: number): Promise<{ success: boolean; message: string; log?: EmailLog }> => {
    const response = await api.post(`/email/logs/${id}/retry`);
    return response.data;
  },
};

export default api;
