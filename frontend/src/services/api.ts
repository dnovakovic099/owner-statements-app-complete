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
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ statements: Statement[] }> => {
    const params = new URLSearchParams();
    if (filters?.ownerId) params.append('ownerId', filters.ownerId);
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    const response = await api.get(`/statements?${params.toString()}`);
    return response.data;
  },

  generateStatement: async (data: {
    ownerId: string;
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<{ message: string }> => {
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

  downloadStatement: async (id: number): Promise<Blob> => {
    const response = await api.get(`/statements/${id}/download`, { responseType: 'blob' });
    return response.data;
  },

  deleteStatement: async (id: number): Promise<void> => {
    await api.delete(`/statements/${id}`);
  },

  editStatement: async (id: number, data: {
    expenseIdsToRemove?: number[];
    cancelledReservationIdsToAdd?: number[];
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

export default api;
