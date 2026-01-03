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

// Set JWT token for all requests
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Legacy function for backward compatibility - now uses JWT
export const setAuthCredentials = (username: string, password: string) => {
  // This function is kept for backward compatibility but doesn't set Basic Auth anymore
  // JWT token is set separately via setAuthToken
};

// Initialize auth from localStorage if available
const initializeAuth = () => {
  try {
    const stored = localStorage.getItem('luxury-lodging-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.token) {
        setAuthToken(parsed.token);
      }
    }
  } catch (error) {
    console.warn('Failed to initialize auth token');
  }
};

// Add response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear stored auth on 401
      localStorage.removeItem('luxury-lodging-auth');
      setAuthToken(null);
      // Optionally redirect to login
      if (window.location.pathname !== '/login' && window.location.pathname !== '/accept-invite') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

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
    hideZeroActivity?: boolean; // Hide statements with $0 revenue AND $0 payout
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
    if (filters?.hideZeroActivity) params.append('hideZeroActivity', 'true');
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
    cancelledReservationIdsToAdd?: string[];
    reservationIdsToAdd?: number[];
    reservationIdsToRemove?: number[];
    customReservationToAdd?: {
      guestName: string;
      checkInDate: string;
      checkOutDate: string;
      nights?: number;
      description?: string;
      // Financial fields
      baseRate: number;
      guestFees?: number;
      platformFees?: number;
      tax?: number;
      pmCommission?: number;
      grossPayout: number;
      // Additional fields
      platform?: 'airbnb' | 'vrbo' | 'direct' | 'booking' | 'other';
      guestPaidDamageCoverage?: number;
    };
    reservationCleaningFeeUpdates?: { [reservationId: string]: number };
    expenseItemUpdates?: Array<{
      globalIndex: number;
      date?: string;
      description?: string;
      category?: string;
      amount?: number;
    }>;
    upsellItemUpdates?: Array<{
      globalIndex: number;
      date?: string;
      description?: string;
      category?: string;
      amount?: number;
    }>;
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

  getCancelledCounts: async (statementIds: number[]): Promise<{ counts: Record<number, number> }> => {
    const response = await api.post('/statements/cancelled-counts', { statementIds });
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

  getListingNames: async (): Promise<{ success: boolean; listings: Pick<Listing, 'id' | 'name' | 'displayName' | 'nickname' | 'internalNotes' | 'ownerEmail' | 'tags'>[] }> => {
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
  recipientEmail: string | null;
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

  sendStatementEmail: async (statementId: number, recipientEmail: string, frequencyTag: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/email/send/${statementId}`, {
      recipientEmail,
      frequencyTag,
      attachPdf: true
    });
    return response.data;
  },

  logFailedEmail: async (data: { statementId: number; propertyId?: number | null; propertyName?: string | null; ownerName?: string | null; reason?: string; errorCode?: string }): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/email/logs/failed', data);
    return response.data;
  },

  scheduleEmails: async (statementIds: number[], scheduledFor: string): Promise<{
    success: boolean;
    message: string;
    scheduled: Array<{ id: number; statementId: number; propertyName: string; recipientEmail: string; scheduledFor: string }>;
    skipped: Array<{ statementId: number; reason: string }>;
    summary: { scheduled: number; skipped: number; total: number };
  }> => {
    const response = await api.post('/email/schedule', { statementIds, scheduledFor });
    return response.data;
  },

  getScheduledEmails: async (status?: string, limit?: number): Promise<{
    success: boolean;
    total: number;
    emails: Array<{
      id: number;
      statementId: number;
      propertyId: number;
      recipientEmail: string;
      recipientName: string;
      propertyName: string;
      frequencyTag: string;
      scheduledFor: string;
      status: string;
      sentAt: string | null;
      errorMessage: string | null;
      createdAt: string;
    }>;
  }> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/email/scheduled?${params.toString()}`);
    return response.data;
  },

  cancelScheduledEmail: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/email/scheduled/${id}`);
    return response.data;
  },

  // Announcement functions
  getOwners: async (tags?: string[]): Promise<{
    success: boolean;
    count: number;
    owners: Array<{ email: string; greeting: string; listings: string[] }>;
  }> => {
    const params = tags && tags.length > 0 ? `?tags=${tags.join(',')}` : '';
    const response = await api.get(`/email/owners${params}`);
    return response.data;
  },

  sendAnnouncement: async (data: {
    subject: string;
    body: string;
    sendToAll: boolean;
    tags?: string[];
    testEmail?: string;
    delayMs?: number;
    retryFailedOnly?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    sent: number;
    failed: number;
    results: { sent: string[]; failed: Array<{ email: string; error: string }> };
  }> => {
    const response = await api.post('/email/announcement', data);
    return response.data;
  },
};

// Tag Schedule API
export interface TagSchedule {
  id?: number;
  tagName: string;
  isEnabled: boolean;
  frequencyType: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  biweeklyWeek?: 'A' | 'B';
  lastNotifiedAt?: string;
  nextScheduledAt?: string;
}

export interface PeriodConfig {
  prefix: string;
  days: number;
  calculationType: 'checkout' | 'calendar';
  templateId?: number | null;
}

export interface TagNotification {
  id: number;
  tagName: string;
  scheduleId: number;
  message: string;
  status: 'unread' | 'read' | 'dismissed' | 'actioned';
  listingCount: number;
  scheduledFor: string;
  readAt?: string;
  actionedAt?: string;
  createdAt: string;
}

export const tagScheduleAPI = {
  // Get all schedules
  getSchedules: async (): Promise<{ success: boolean; schedules: TagSchedule[] }> => {
    const response = await api.get('/tag-schedules/schedules');
    return response.data;
  },

  // Get schedule for a specific tag
  getScheduleByTag: async (tagName: string): Promise<{ success: boolean; schedule: TagSchedule | null }> => {
    const response = await api.get(`/tag-schedules/schedules/${encodeURIComponent(tagName)}`);
    return response.data;
  },

  // Create or update a schedule
  saveSchedule: async (schedule: Omit<TagSchedule, 'id' | 'lastNotifiedAt' | 'nextScheduledAt'>): Promise<{ success: boolean; schedule: TagSchedule; message: string }> => {
    const response = await api.post('/tag-schedules/schedules', schedule);
    return response.data;
  },

  // Delete a schedule
  deleteSchedule: async (tagName: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/tag-schedules/schedules/${encodeURIComponent(tagName)}`);
    return response.data;
  },

  // Get notifications
  getNotifications: async (status?: string, limit?: number): Promise<{ success: boolean; notifications: TagNotification[]; unreadCount: number }> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/tag-schedules/notifications?${params.toString()}`);
    return response.data;
  },

  // Get unread count
  getNotificationCount: async (): Promise<{ success: boolean; count: number }> => {
    const response = await api.get('/tag-schedules/notifications/count');
    return response.data;
  },

  // Mark notification as read
  markNotificationRead: async (id: number): Promise<{ success: boolean; notification: TagNotification }> => {
    const response = await api.put(`/tag-schedules/notifications/${id}/read`);
    return response.data;
  },

  // Mark notification as actioned
  markNotificationActioned: async (id: number): Promise<{ success: boolean; notification: TagNotification }> => {
    const response = await api.put(`/tag-schedules/notifications/${id}/action`);
    return response.data;
  },

  // Dismiss notification
  dismissNotification: async (id: number): Promise<{ success: boolean; notification: TagNotification }> => {
    const response = await api.put(`/tag-schedules/notifications/${id}/dismiss`);
    return response.data;
  },

  // Get listings by tag
  getListingsByTag: async (tagName: string): Promise<{ success: boolean; tagName: string; count: number; listings: any[] }> => {
    const response = await api.get(`/tag-schedules/listings-by-tag/${encodeURIComponent(tagName)}`);
    return response.data;
  },

  // Get all period configs
  getPeriodConfigs: async (): Promise<{ success: boolean; configs: Record<string, PeriodConfig> }> => {
    const response = await api.get('/tag-schedules/period-configs');
    return response.data;
  },

  // Update period config for a tag
  updatePeriodConfig: async (tagName: string, config: Partial<PeriodConfig>): Promise<{ success: boolean; config: PeriodConfig; message: string }> => {
    const response = await api.put(`/tag-schedules/period-configs/${encodeURIComponent(tagName)}`, {
      periodDays: config.days,
      calculationType: config.calculationType,
      templateId: config.templateId
    });
    return response.data;
  },
};

// Email Template Types
export interface EmailTemplateVariable {
  name: string;
  description: string;
  category: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  frequencyType: 'weekly' | 'bi-weekly' | 'monthly' | 'custom';
  calculationType?: 'checkout' | 'calendar';
  isDefault: boolean;
  isSystem: boolean;
  isActive: boolean;
  tags: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Email Templates API
export const emailTemplatesAPI = {
  // Get all templates
  getTemplates: async (filters?: {
    frequencyType?: string;
    isActive?: boolean;
  }): Promise<{ templates: EmailTemplate[]; variables: EmailTemplateVariable[] }> => {
    const params = new URLSearchParams();
    if (filters?.frequencyType) params.append('frequencyType', filters.frequencyType);
    if (filters?.isActive !== undefined) params.append('isActive', filters.isActive.toString());
    const response = await api.get(`/email-templates?${params.toString()}`);
    return response.data;
  },

  // Get template variables
  getVariables: async (): Promise<{ variables: EmailTemplateVariable[] }> => {
    const response = await api.get('/email-templates/variables');
    return response.data;
  },

  // Get single template
  getTemplate: async (id: number): Promise<{ template: EmailTemplate }> => {
    const response = await api.get(`/email-templates/${id}`);
    return response.data;
  },

  // Create template
  createTemplate: async (data: {
    name: string;
    frequencyType?: string;
    tags?: string[];
    subject: string;
    htmlBody: string;
    textBody?: string;
    description?: string;
    isDefault?: boolean;
  }): Promise<{ template: EmailTemplate }> => {
    const response = await api.post('/email-templates', data);
    return response.data;
  },

  // Update template
  updateTemplate: async (id: number, data: {
    name?: string;
    frequencyType?: string;
    tags?: string[];
    subject?: string;
    htmlBody?: string;
    textBody?: string;
    description?: string;
    isDefault?: boolean;
    isActive?: boolean;
  }): Promise<{ template: EmailTemplate }> => {
    const response = await api.put(`/email-templates/${id}`, data);
    return response.data;
  },

  // Delete template
  deleteTemplate: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/email-templates/${id}`);
    return response.data;
  },

  // Set as default
  setDefault: async (id: number): Promise<{ template: EmailTemplate; message: string }> => {
    const response = await api.post(`/email-templates/${id}/set-default`);
    return response.data;
  },

  // Preview template
  previewTemplate: async (data: {
    subject: string;
    htmlBody: string;
    textBody?: string;
  }): Promise<{ subject: string; htmlBody: string; textBody: string; sampleData: Record<string, string> }> => {
    const response = await api.post('/email-templates/preview', data);
    return response.data;
  },
};

// User Types
export interface User {
  id: number;
  username: string;
  email: string;
  role: 'system' | 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  inviteAccepted: boolean;
  isSystemUser?: boolean;
  lastLogin: string | null;
  createdAt: string;
}

// Users API
export const usersAPI = {
  // Get all users (admin only)
  getUsers: async (): Promise<{ success: boolean; users: User[] }> => {
    const response = await api.get('/users');
    return response.data;
  },

  // Get current user info
  getCurrentUser: async (): Promise<{ success: boolean; user: User }> => {
    const response = await api.get('/users/me');
    return response.data;
  },

  // Invite a new user (admin only)
  inviteUser: async (data: {
    email: string;
    username: string;
  }): Promise<{
    success: boolean;
    message?: string;
    user?: User;
    warning?: string;
  }> => {
    const response = await api.post('/users/invite', data);
    return response.data;
  },

  // Resend invite (admin only)
  resendInvite: async (userId: number): Promise<{
    success: boolean;
    message: string;
    warning?: string;
  }> => {
    const response = await api.post(`/users/${userId}/resend-invite`);
    return response.data;
  },

  // Update user (admin only)
  updateUser: async (userId: number, data: {
    isActive?: boolean;
  }): Promise<{ success: boolean; user: User }> => {
    const response = await api.put(`/users/${userId}`, data);
    return response.data;
  },

  // Delete user (admin only)
  deleteUser: async (userId: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },
};

// Activity Log interface
export interface ActivityLogEntry {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// Activity Log API (admin only)
export const activityLogAPI = {
  // Get activity logs
  getLogs: async (params?: {
    limit?: number;
    offset?: number;
    action?: string;
    resource?: string;
    userId?: number;
    username?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    success: boolean;
    logs: ActivityLogEntry[];
    total: number;
    limit: number;
    offset: number;
  }> => {
    const response = await api.get('/activity-logs', { params });
    return response.data;
  },

  // Get filter options
  getFilters: async (): Promise<{
    success: boolean;
    users: string[];
    actions: string[];
  }> => {
    const response = await api.get('/activity-logs/filters');
    return response.data;
  },

  // Get activity stats
  getStats: async (): Promise<{
    success: boolean;
    stats: {
      today: number;
      total: number;
      byAction: { action: string; count: number }[];
    };
  }> => {
    const response = await api.get('/activity-logs/stats');
    return response.data;
  },
};

// Auth API (for invite acceptance - no auth required)
export const authAPI = {
  // Validate invite token
  validateInvite: async (token: string): Promise<{
    success: boolean;
    message?: string;
    user?: { username: string; email: string; role: string };
  }> => {
    const response = await axios.get(`${API_BASE_URL}/auth/invite/${token}`);
    return response.data;
  },

  // Accept invite and set password
  acceptInvite: async (token: string, password: string): Promise<{
    success: boolean;
    message: string;
    user?: { username: string; email: string; role: string };
  }> => {
    const response = await axios.post(`${API_BASE_URL}/auth/accept-invite`, {
      token,
      password,
    });
    return response.data;
  },
};

export default api;
