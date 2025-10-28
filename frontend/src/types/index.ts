export interface Owner {
  id: number;
  name: string;
  email: string;
  defaultPmPercentage: number;
  propertyCount: number;
  properties: Property[];
}

export interface Property {
  id: number;
  hostawayId: string;
  name: string;
  address: string;
  ownerId: number;
  pmPercentage: number | null;
  coHosting: {
    enabled: boolean;
    percentage: number;
    partner: string;
  } | null;
  specialRules: any | null;
  techFeeAmount: number | null;
  insuranceFeeAmount: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  Owner?: Owner;
}

export interface Reservation {
  id: number;
  hostawayId: string;
  propertyId: number;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  grossAmount: number;
  hostPayoutAmount: number;
  platformFees: number;
  nights: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'modified' | 'new';
  source: string;
  isProrated: boolean;
  weeklyPayoutDate: string | null;
}

export interface StatementItem {
  type: 'revenue' | 'expense';
  description: string;
  amount: number;
  date: string;
  category: string;
}

export interface Statement {
  id: number;
  ownerId: number;
  ownerName: string;
  propertyId?: number | null;
  propertyName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalRevenue: number;
  totalExpenses: number;
  pmCommission: number;
  pmPercentage: number;
  techFees: number;
  insuranceFees: number;
  adjustments: number;
  ownerPayout: number;
  status: 'draft' | 'generated' | 'sent' | 'paid' | 'modified';
  sentAt: string | null;
  createdAt: string;
  reservations?: Reservation[];
  expenses?: any[];
  items?: StatementItem[];
}

export interface DashboardSummary {
  totalProperties: number;
  totalOwners: number;
  pendingStatements: number;
  thisWeekRevenue: number;
  lastWeekRevenue: number;
  revenueChange: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  currentWeek: {
    start: string;
    end: string;
  };
  previousWeek: {
    start: string;
    end: string;
  };
  recentStatements: Statement[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface SyncResponse {
  message: string;
  synced: number;
  skipped: number;
  total?: number;
}

export interface Listing {
  id: number;
  name: string;
  address: string;
  country: string;
  city: string;
  personCapacity: number;
  bedroomsNumber: number;
  bathroomsNumber: number;
  currency: string;
  price: number;
  cleaningFee: number;
  checkInTimeStart: number;
  checkInTimeEnd: number;
  checkOutTime: number;
  minNights: number;
  maxNights: number;
  isActive: boolean;
  syncedAt: string;
}

export interface QuickBooksTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  account: string;
  accountType: string;
  type: string;
  department?: string;
  propertyId?: string;
  listingId?: string;
  categorized?: boolean;
  raw?: any;
}

export interface QuickBooksAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType: string;
  Classification: string;
  Active: boolean;
}

export interface QuickBooksDepartment {
  Id?: string;
  Name: string;
}

export interface TransactionCategorization {
  propertyId: string;
  listingId?: string;
  department: string;
  categorizedAt: string;
}
