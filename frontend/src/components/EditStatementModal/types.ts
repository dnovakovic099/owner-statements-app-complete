/**
 * Shared types for EditStatementModal components
 */

import { Statement, Reservation } from '../../types';

export interface ExpenseItem {
  date: string;
  description: string;
  category: string;
  amount: number;
  hidden?: boolean;
  isLLCover?: boolean;
}

export interface EditedExpense {
  date: string;
  description: string;
  category: string;
  amount: string;
}

export interface CustomReservationData {
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: string;
  description: string;
  baseRate: string;
  guestFees: string;
  platformFees: string;
  tax: string;
  pmCommission: string;
  grossPayout: string;
  platform: 'airbnb' | 'vrbo' | 'direct' | 'booking' | 'other';
  guestPaidDamageCoverage: string;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: 'default' | 'warning' | 'success';
  onConfirm: () => void;
}

export interface StatementPeriodSettings {
  startDate: string;
  endDate: string;
  calculationType: 'checkout' | 'calendar';
}

// Props for sub-components
export interface ExpensesListProps {
  expenses: ExpenseItem[];
  selectedIndices: number[];
  onToggleSelect: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onEdit: (index: number) => void;
  editingIndex: number | null;
  editedExpense: EditedExpense | null;
  onEditChange: (field: keyof EditedExpense, value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onHideSelected: () => void;
  onUnhideSelected?: () => void;
  title: string;
  isLLCover?: boolean;
  showHidden?: boolean;
}

export interface ReservationsTableProps {
  reservations: Reservation[];
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  cleaningFeeEdits?: { [reservationId: string]: string };
  onCleaningFeeChange?: (reservationId: string, value: string) => void;
  showCleaningFeeEdit?: boolean;
  listingInfo?: { cleaningFeePassThrough?: boolean };
}

export interface CustomReservationFormProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: CustomReservationData;
  onChange: (field: keyof CustomReservationData, value: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export interface StatementPeriodEditorProps {
  startDate: string;
  endDate: string;
  calculationType: 'checkout' | 'calendar';
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onCalculationTypeChange: (value: 'checkout' | 'calendar') => void;
  onThisMonth: () => void;
  onLastMonth: () => void;
  onReconfigure: () => void;
  isReconfiguring: boolean;
}
