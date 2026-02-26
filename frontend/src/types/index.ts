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
  nickname?: string | null;
  displayName?: string | null;
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
  isOffboarded?: boolean;
  createdAt: string;
  updatedAt: string;
  Owner?: Owner;
}

export interface Reservation {
  id: number;
  hostawayId?: string;
  hostifyId?: number;
  propertyId: number;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  grossAmount: number;
  clientRevenue?: number;
  hostPayoutAmount: number;
  platformFees: number;
  cleaningFee?: number;
  nights: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'modified' | 'new';
  source: string;
  isProrated: boolean;
  weeklyPayoutDate: string | null;
}

export interface StatementItem {
  type: 'revenue' | 'expense' | 'upsell';
  description: string;
  amount: number;
  date: string;
  category: string;
  vendor?: string;
  listing?: string;
  hidden?: boolean;
  hiddenReason?: 'manual' | 'll_cover' | 'prior_statement';
  priorStatementId?: number;
  priorPeriod?: string;
}

export interface Statement {
  id: number;
  ownerId: number;
  ownerName: string;
  propertyId?: number | null;
  propertyIds?: number[] | null;
  propertyName: string;
  isCombinedStatement?: boolean;
  weekStartDate: string;
  weekEndDate: string;
  calculationType?: 'checkout' | 'calendar';
  totalRevenue: number;
  totalExpenses: number;
  pmCommission: number;
  pmPercentage: number;
  techFees: number;
  insuranceFees: number;
  adjustments: number;
  ownerPayout: number;
  cleaningFeePassThrough?: boolean;
  totalCleaningFee?: number;
  cleaningMismatchWarning?: {
    type: string;
    message: string;
    reservationCount: number;
    cleaningExpenseCount: number;
    reservationsWithOwnFee?: number;
    difference: number;
  } | null;
  needsReview?: boolean;
  reviewDetails?: {
    expenseCount: number;
    additionalPayoutCount: number;
  } | null;
  shouldConvertToCalendar?: boolean;
  cancelledReservationCount?: number;
  status: 'draft' | 'final' | 'sent' | 'paid';
  sentAt: string | null;
  createdAt: string;
  reservations?: Reservation[];
  expenses?: any[];
  items?: StatementItem[];
  internalNotes?: string | null;
  // Payout tracking fields
  payoutStatus?: 'pending' | 'paid' | 'collected' | 'failed' | null;
  payoutTransferId?: string | null;
  paidAt?: string | null;
  payoutError?: string | null;
  stripeFee?: number | null;
  totalTransferAmount?: number | null;
  hasPriorStatementDuplicates?: boolean;
  priorStatementDuplicateCount?: number;
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
  displayName?: string | null;
  nickname?: string | null;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  personCapacity?: number;
  bedroomsNumber?: number;
  bathroomsNumber?: number;
  currency?: string;
  price?: number;
  cleaningFee?: number;
  checkInTimeStart?: number;
  checkInTimeEnd?: number;
  checkOutTime?: number;
  minNights?: number;
  maxNights?: number;
  pmFeePercentage?: number;
  isCohostOnAirbnb: boolean;
  airbnbPassThroughTax?: boolean;
  disregardTax?: boolean;
  cleaningFeePassThrough?: boolean;
  guestPaidDamageCoverage?: boolean;
  includeChildListings?: boolean;
  waiveCommission?: boolean;
  waiveCommissionUntil?: string | null;
  newPmFeeEnabled?: boolean;
  newPmFeePercentage?: number | null;
  newPmFeeStartDate?: string | null;
  defaultPetFee?: number | null;
  tags?: string[];
  ownerEmail?: string | null;
  ownerGreeting?: string | null;
  autoSendStatements?: boolean;
  internalNotes?: string | null;
  payoutStatus?: 'missing' | 'pending' | 'on_file';
  payoutNotes?: string | null;
  stripeAccountId?: string | null;
  stripeOnboardingStatus?: 'missing' | 'pending' | 'verified' | 'requires_action';
  isActive: boolean;
  isOffboarded?: boolean;
  lastSyncedAt?: string;
  syncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  groupId?: number | null;
  group?: ListingGroup | null;
}

export interface ListingGroup {
  id: number;
  name: string;
  tags: string[];
  listingIds: number[];
  calculationType?: 'checkout' | 'calendar';
  stripeAccountId?: string | null;
  stripeOnboardingStatus?: 'missing' | 'pending' | 'verified' | 'requires_action';
  listings?: Listing[];
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
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
