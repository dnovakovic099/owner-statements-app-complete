import React, { useState, useEffect, useCallback } from 'react';
import { X, DollarSign, AlertTriangle, Plus, Calendar, FileText, Save, Edit2, Check } from 'lucide-react';
import { statementsAPI, listingsAPI } from '../services/api';
import { Statement, Reservation } from '../types';
import { Checkbox } from './ui/checkbox';

// Custom Confirm Dialog Component
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'warning' | 'success';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default'
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    default: 'bg-blue-600 hover:bg-blue-700',
    warning: 'bg-amber-600 hover:bg-amber-700',
    success: 'bg-green-600 hover:bg-green-700'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${variant === 'warning' ? 'bg-amber-100' : variant === 'success' ? 'bg-green-100' : 'bg-blue-100'
              }`}>
              <AlertTriangle className={`w-5 h-5 ${variant === 'warning' ? 'text-amber-600' : variant === 'success' ? 'text-green-600' : 'text-blue-600'
                }`} />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

interface EditStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  statementId: number | null;
  onStatementUpdated: () => void;
}

const EditStatementModal: React.FC<EditStatementModalProps> = ({
  isOpen,
  onClose,
  statementId,
  onStatementUpdated,
}) => {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedExpenseIndices, setSelectedExpenseIndices] = useState<number[]>([]);
  const [selectedUpsellIndices, setSelectedUpsellIndices] = useState<number[]>([]);
  const [selectedHiddenExpenseIndices, setSelectedHiddenExpenseIndices] = useState<number[]>([]);
  const [selectedHiddenUpsellIndices, setSelectedHiddenUpsellIndices] = useState<number[]>([]);
  const [selectedLLCoverExpenseIndices, setSelectedLLCoverExpenseIndices] = useState<number[]>([]);
  const [selectedLLCoverUpsellIndices, setSelectedLLCoverUpsellIndices] = useState<number[]>([]);
  const [selectedPriorExpenseIndices, setSelectedPriorExpenseIndices] = useState<number[]>([]);
  const [selectedPriorUpsellIndices, setSelectedPriorUpsellIndices] = useState<number[]>([]);
  const [showHiddenExpenses, setShowHiddenExpenses] = useState(false);
  const [showHiddenUpsells, setShowHiddenUpsells] = useState(false);
  const [selectedReservationIdsToRemove, setSelectedReservationIdsToRemove] = useState<number[]>([]);
  const [selectedReservationIdsToAdd, setSelectedReservationIdsToAdd] = useState<number[]>([]);
  const [availableReservations, setAvailableReservations] = useState<Reservation[]>([]);
  const [cleaningFeeEdits, setCleaningFeeEdits] = useState<{ [reservationId: string]: string }>({});
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [showAvailableSection, setShowAvailableSection] = useState(false);
  const [cancelledReservations, setCancelledReservations] = useState<any[]>([]);
  const [loadingCancelled, setLoadingCancelled] = useState(false);
  const [showCancelledSection, setShowCancelledSection] = useState(false);
  const [selectedCancelledIdsToAdd, setSelectedCancelledIdsToAdd] = useState<string[]>([]);
  const [showCustomReservationForm, setShowCustomReservationForm] = useState(false);
  const [customReservation, setCustomReservation] = useState({
    guestName: '',
    checkInDate: '',
    checkOutDate: '',
    nights: '',
    description: '',
    // Financial fields
    baseRate: '',
    guestFees: '',
    platformFees: '',
    tax: '',
    pmCommission: '',
    grossPayout: '',
    // Additional fields
    platform: 'direct' as 'airbnb' | 'vrbo' | 'direct' | 'booking' | 'other',
    guestPaidDamageCoverage: ''
  });
  const [error, setError] = useState<string | null>(null);

  // Pagination state for large lists
  const ITEMS_PER_PAGE = 50;
  const [reservationsDisplayCount, setReservationsDisplayCount] = useState(ITEMS_PER_PAGE);
  const [expensesDisplayCount, setExpensesDisplayCount] = useState(ITEMS_PER_PAGE);

  // Internal notes state
  const [internalNotes, setInternalNotes] = useState('');
  const [notesModified, setNotesModified] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Expense editing state
  const [editingExpenseIndex, setEditingExpenseIndex] = useState<number | null>(null);
  const [editedExpense, setEditedExpense] = useState<{
    date: string;
    description: string;
    category: string;
    amount: string;
  } | null>(null);

  // Upsell editing state
  const [editingUpsellIndex, setEditingUpsellIndex] = useState<number | null>(null);
  const [editedUpsell, setEditedUpsell] = useState<{
    date: string;
    description: string;
    category: string;
    amount: string;
  } | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'default' | 'warning' | 'success';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'default',
    onConfirm: () => { }
  });

  // Statement period & settings state
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editCalculationType, setEditCalculationType] = useState<'checkout' | 'calendar'>('checkout');
  const [isReconfiguring, setIsReconfiguring] = useState(false);

  const loadStatement = useCallback(async () => {
    if (!statementId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await statementsAPI.getStatement(statementId);
      setStatement(response);
      setSelectedExpenseIndices([]);
      setSelectedUpsellIndices([]);
      setSelectedHiddenExpenseIndices([]);
      setSelectedHiddenUpsellIndices([]);
      setSelectedLLCoverExpenseIndices([]);
      setSelectedLLCoverUpsellIndices([]);
      setSelectedPriorExpenseIndices([]);
      setSelectedPriorUpsellIndices([]);
      setSelectedReservationIdsToRemove([]);
      setSelectedReservationIdsToAdd([]);
      setAvailableReservations([]);
      setShowAvailableSection(false);
      setCancelledReservations([]);
      setShowCancelledSection(false);
      setSelectedCancelledIdsToAdd([]);
      setShowHiddenExpenses(false);
      setShowHiddenUpsells(false);
      setCleaningFeeEdits({});
      setInternalNotes(response.internalNotes || '');
      setNotesModified(false);
      setEditingExpenseIndex(null);
      setEditedExpense(null);
      setEditingUpsellIndex(null);
      setEditedUpsell(null);
      // Reset pagination
      setReservationsDisplayCount(ITEMS_PER_PAGE);
      setExpensesDisplayCount(ITEMS_PER_PAGE);
      // Initialize statement period & settings
      setEditStartDate(response.weekStartDate || '');
      setEditEndDate(response.weekEndDate || '');
      setEditCalculationType((response.calculationType as 'checkout' | 'calendar') || 'checkout');
    } catch (err) {
      setError('Failed to load statement details');
      console.error('Failed to load statement:', err);
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  useEffect(() => {
    if (isOpen && statementId) {
      loadStatement();
    }
  }, [isOpen, statementId, loadStatement]);

  const loadAvailableReservations = async () => {
    if (!statementId) return;

    try {
      setLoadingAvailable(true);
      setError(null);
      const response = await statementsAPI.getAvailableReservations(statementId);
      setAvailableReservations(response.availableReservations);
      setShowAvailableSection(true);
    } catch (err) {
      setError('Failed to load available reservations');
      console.error('Failed to load available reservations:', err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const loadCancelledReservations = async () => {
    if (!statementId) return;

    try {
      setLoadingCancelled(true);
      setError(null);
      const response = await statementsAPI.getCancelledReservations(statementId);
      setCancelledReservations(response.cancelledReservations);
      setShowCancelledSection(true);
    } catch (err) {
      setError('Failed to load cancelled reservations');
      console.error('Failed to load cancelled reservations:', err);
    } finally {
      setLoadingCancelled(false);
    }
  };

  const handleCancelledReservationToggle = (hostifyId: string) => {
    setSelectedCancelledIdsToAdd(prev =>
      prev.includes(hostifyId)
        ? prev.filter(id => id !== hostifyId)
        : [...prev, hostifyId]
    );
  };

  // Quick select date helpers
  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setEditStartDate(firstDay.toISOString().split('T')[0]);
    setEditEndDate(lastDay.toISOString().split('T')[0]);
  };

  const setLastMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    setEditStartDate(firstDay.toISOString().split('T')[0]);
    setEditEndDate(lastDay.toISOString().split('T')[0]);
  };

  const setThisYear = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), 0, 1);
    const lastDay = new Date(now.getFullYear(), 11, 31);
    setEditStartDate(firstDay.toISOString().split('T')[0]);
    setEditEndDate(lastDay.toISOString().split('T')[0]);
  };

  // Handle reconfigure statement
  const handleReconfigure = async () => {
    if (!statementId || !editStartDate || !editEndDate) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Reconfigure Statement',
      message: `This will regenerate the statement with the new date range (${editStartDate} to ${editEndDate}) and calculation method (${editCalculationType}). Custom reservations will be preserved. Continue?`,
      confirmText: 'Update Statement',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsReconfiguring(true);
        try {
          await statementsAPI.reconfigureStatement(statementId, {
            startDate: editStartDate,
            endDate: editEndDate,
            calculationType: editCalculationType
          });
          await loadStatement();
          onStatementUpdated();
        } catch (err) {
          setError('Failed to reconfigure statement');
          console.error('Failed to reconfigure statement:', err);
        } finally {
          setIsReconfiguring(false);
        }
      }
    });
  };

  const handleExpenseToggle = (index: number) => {
    // Don't toggle if we're editing
    if (editingExpenseIndex !== null) return;

    setSelectedExpenseIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleHiddenExpenseToggle = (index: number) => {
    setSelectedHiddenExpenseIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleLLCoverExpenseToggle = (index: number) => {
    setSelectedLLCoverExpenseIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleLLCoverUpsellToggle = (index: number) => {
    setSelectedLLCoverUpsellIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handlePriorExpenseToggle = (index: number) => {
    setSelectedPriorExpenseIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handlePriorUpsellToggle = (index: number) => {
    setSelectedPriorUpsellIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleStartEditExpense = (index: number, expense: any, e: React.MouseEvent) => {
    e.stopPropagation();
    // Deselect any selected expenses when entering edit mode
    setSelectedExpenseIndices([]);
    setSelectedHiddenExpenseIndices([]);
    setEditingExpenseIndex(index);
    setEditedExpense({
      date: expense.date || '',
      description: expense.description || '',
      category: expense.category || '',
      amount: String(expense.amount || 0)
    });
  };

  const handleCancelEditExpense = () => {
    setEditingExpenseIndex(null);
    setEditedExpense(null);
  };

  const handleSaveEditedExpense = async () => {
    if (!statement || editingExpenseIndex === null || !editedExpense) return;

    // Validate
    if (!editedExpense.description.trim()) {
      setError('Description is required');
      return;
    }
    const amount = parseFloat(editedExpense.amount);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Find the global index of this expense in statement.items
    let globalIndex = -1;
    let expenseCount = 0;
    for (let i = 0; i < (statement.items?.length || 0); i++) {
      if (statement.items![i].type === 'expense' && !statement.items![i].hidden) {
        if (expenseCount === editingExpenseIndex) {
          globalIndex = i;
          break;
        }
        expenseCount++;
      }
    }

    if (globalIndex === -1) {
      setError('Could not find expense to update');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await statementsAPI.editStatement(statement.id, {
        expenseItemUpdates: [{
          globalIndex,
          date: editedExpense.date,
          description: editedExpense.description.trim(),
          category: editedExpense.category,
          amount: amount
        }]
      });

      setEditingExpenseIndex(null);
      setEditedExpense(null);
      onStatementUpdated();
      // Reload the statement to show updated data
      loadStatement();
    } catch (err) {
      setError('Failed to update expense');
      console.error('Failed to update expense:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpsellToggle = (index: number) => {
    // Don't toggle if we're editing
    if (editingUpsellIndex !== null) return;

    setSelectedUpsellIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleHiddenUpsellToggle = (index: number) => {
    setSelectedHiddenUpsellIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleStartEditUpsell = (index: number, upsell: any, e: React.MouseEvent) => {
    e.stopPropagation();
    // Deselect any selected upsells when entering edit mode
    setSelectedUpsellIndices([]);
    setSelectedHiddenUpsellIndices([]);
    setEditingUpsellIndex(index);
    setEditedUpsell({
      date: upsell.date || '',
      description: upsell.description || '',
      category: upsell.category || '',
      amount: String(upsell.amount || 0)
    });
  };

  const handleCancelEditUpsell = () => {
    setEditingUpsellIndex(null);
    setEditedUpsell(null);
  };

  const handleSaveEditedUpsell = async () => {
    if (!statement || editingUpsellIndex === null || !editedUpsell) return;

    // Validate
    if (!editedUpsell.description.trim()) {
      setError('Description is required');
      return;
    }
    const amount = parseFloat(editedUpsell.amount);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Find the global index of this upsell in statement.items
    let globalIndex = -1;
    let upsellCount = 0;
    for (let i = 0; i < (statement.items?.length || 0); i++) {
      if (statement.items![i].type === 'upsell' && !statement.items![i].hidden) {
        if (upsellCount === editingUpsellIndex) {
          globalIndex = i;
          break;
        }
        upsellCount++;
      }
    }

    if (globalIndex === -1) {
      setError('Could not find upsell to update');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await statementsAPI.editStatement(statement.id, {
        upsellItemUpdates: [{
          globalIndex,
          date: editedUpsell.date,
          description: editedUpsell.description.trim(),
          category: editedUpsell.category,
          amount: amount
        }]
      });

      setEditingUpsellIndex(null);
      setEditedUpsell(null);
      onStatementUpdated();
      // Reload the statement to show updated data
      loadStatement();
    } catch (err) {
      setError('Failed to update upsell');
      console.error('Failed to update upsell:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReservationRemoveToggle = (reservationId: number) => {
    setSelectedReservationIdsToRemove(prev =>
      prev.includes(reservationId)
        ? prev.filter(id => id !== reservationId)
        : [...prev, reservationId]
    );
  };

  const handleReservationAddToggle = (reservationId: number) => {
    setSelectedReservationIdsToAdd(prev =>
      prev.includes(reservationId)
        ? prev.filter(id => id !== reservationId)
        : [...prev, reservationId]
    );
  };

  const handleCleaningFeeChange = (reservationId: string, value: string) => {
    setCleaningFeeEdits(prev => ({
      ...prev,
      [reservationId]: value
    }));
  };

  const handleSaveCleaningFees = () => {
    if (!statement || Object.keys(cleaningFeeEdits).length === 0) return;

    // Convert string values to numbers for the API
    const updates: { [key: string]: number } = {};
    for (const [resId, value] of Object.entries(cleaningFeeEdits)) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        updates[resId] = numValue;
      }
    }

    if (Object.keys(updates).length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Update Cleaning Fees',
      message: `Update cleaning fees for ${Object.keys(updates).length} reservation(s)? This will recalculate the total cleaning fee.`,
      confirmText: 'Update Fees',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));

        try {
          setSaving(true);
          setError(null);

          await statementsAPI.editStatement(statement.id, {
            reservationCleaningFeeUpdates: updates
          });

          onStatementUpdated();
          onClose();
        } catch (err) {
          setError('Failed to update cleaning fees');
          console.error('Failed to update cleaning fees:', err);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const handleAddCustomReservation = () => {
    if (!statement) return;

    // Validate required fields
    if (!customReservation.guestName || !customReservation.checkInDate || !customReservation.checkOutDate || !customReservation.baseRate || !customReservation.grossPayout) {
      setError('Please fill in all required fields: Guest Name, Check-in Date, Check-out Date, Base Rate, and Gross Payout');
      return;
    }

    const baseRate = parseFloat(customReservation.baseRate);
    const grossPayout = parseFloat(customReservation.grossPayout);
    if (isNaN(baseRate) || baseRate <= 0) {
      setError('Please enter a valid base rate');
      return;
    }
    if (isNaN(grossPayout) || grossPayout <= 0) {
      setError('Please enter a valid gross payout');
      return;
    }

    // Parse optional numeric fields
    const guestFees = parseFloat(customReservation.guestFees) || 0;
    const platformFees = parseFloat(customReservation.platformFees) || 0;
    const tax = parseFloat(customReservation.tax) || 0;
    const pmCommission = parseFloat(customReservation.pmCommission) || 0;
    const guestPaidDamageCoverage = parseFloat(customReservation.guestPaidDamageCoverage) || 0;

    // Show custom confirm dialog
    setConfirmDialog({
      isOpen: true,
      title: 'Add Custom Reservation',
      message: `Add custom reservation for ${customReservation.guestName} with gross payout $${grossPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}?`,
      confirmText: 'Add Reservation',
      variant: 'success',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));

        try {
          setSaving(true);
          setError(null);

          await statementsAPI.editStatement(statement.id, {
            customReservationToAdd: {
              guestName: customReservation.guestName,
              checkInDate: customReservation.checkInDate,
              checkOutDate: customReservation.checkOutDate,
              nights: customReservation.nights ? parseInt(customReservation.nights) : undefined,
              description: customReservation.description || undefined,
              // Financial fields
              baseRate: baseRate,
              guestFees: guestFees,
              platformFees: platformFees,
              tax: tax,
              pmCommission: pmCommission,
              grossPayout: grossPayout,
              // Additional fields
              platform: customReservation.platform,
              guestPaidDamageCoverage: guestPaidDamageCoverage
            }
          });

          // Reset form
          setCustomReservation({
            guestName: '',
            checkInDate: '',
            checkOutDate: '',
            nights: '',
            description: '',
            baseRate: '',
            guestFees: '',
            platformFees: '',
            tax: '',
            pmCommission: '',
            grossPayout: '',
            platform: 'direct',
            guestPaidDamageCoverage: ''
          });
          setShowCustomReservationForm(false);

          onStatementUpdated();
          onClose();
        } catch (err) {
          setError('Failed to add custom reservation');
          console.error('Failed to add custom reservation:', err);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const handleSaveChanges = () => {
    if (!statement || (selectedExpenseIndices.length === 0 && selectedUpsellIndices.length === 0 && selectedHiddenExpenseIndices.length === 0 && selectedHiddenUpsellIndices.length === 0 && selectedLLCoverExpenseIndices.length === 0 && selectedLLCoverUpsellIndices.length === 0 && selectedReservationIdsToRemove.length === 0 && selectedReservationIdsToAdd.length === 0 && selectedCancelledIdsToAdd.length === 0)) {
      return;
    }

    const actions = [];
    if (selectedExpenseIndices.length > 0) {
      actions.push(`hide ${selectedExpenseIndices.length} expense(s)`);
    }
    if (selectedUpsellIndices.length > 0) {
      actions.push(`hide ${selectedUpsellIndices.length} upsell(s)`);
    }
    if (selectedHiddenExpenseIndices.length > 0) {
      actions.push(`restore ${selectedHiddenExpenseIndices.length} expense(s)`);
    }
    if (selectedHiddenUpsellIndices.length > 0) {
      actions.push(`restore ${selectedHiddenUpsellIndices.length} upsell(s)`);
    }
    if (selectedLLCoverExpenseIndices.length > 0) {
      actions.push(`include ${selectedLLCoverExpenseIndices.length} LL Cover expense(s)`);
    }
    if (selectedLLCoverUpsellIndices.length > 0) {
      actions.push(`include ${selectedLLCoverUpsellIndices.length} LL Cover upsell(s)`);
    }
    if (selectedPriorExpenseIndices.length > 0) {
      actions.push(`restore ${selectedPriorExpenseIndices.length} prior statement expense(s)`);
    }
    if (selectedPriorUpsellIndices.length > 0) {
      actions.push(`restore ${selectedPriorUpsellIndices.length} prior statement upsell(s)`);
    }
    if (selectedReservationIdsToRemove.length > 0) {
      actions.push(`remove ${selectedReservationIdsToRemove.length} reservation(s)`);
    }
    if (selectedReservationIdsToAdd.length > 0) {
      actions.push(`add ${selectedReservationIdsToAdd.length} reservation(s)`);
    }
    if (selectedCancelledIdsToAdd.length > 0) {
      actions.push(`add ${selectedCancelledIdsToAdd.length} cancelled reservation(s) with $0 revenue`);
    }

    const confirmMessage = `Are you sure you want to ${actions.join(' and ')}? This will recalculate the statement totals.`;

    // Show custom confirm dialog
    setConfirmDialog({
      isOpen: true,
      title: 'Apply Changes',
      message: confirmMessage,
      confirmText: 'Apply Changes',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));

        try {
          setSaving(true);
          setError(null);

          // Map visible/hidden expense and upsell indices to global indices
          const itemVisibilityUpdates: Array<{ globalIndex: number; hidden: boolean }> = [];

          if (statement.items) {
            let expenseCount = 0;
            let upsellCount = 0;
            let hiddenExpenseCount = 0;
            let hiddenUpsellCount = 0;
            let llCoverExpenseCount = 0;
            let llCoverUpsellCount = 0;
            let priorExpenseCount = 0;
            let priorUpsellCount = 0;

            statement.items.forEach((item, globalIndex) => {
              if (item.type === 'expense') {
                if (item.hidden) {
                  if (item.hiddenReason === 'prior_statement') {
                    // Prior statement duplicate expense
                    if (selectedPriorExpenseIndices.includes(priorExpenseCount)) {
                      itemVisibilityUpdates.push({ globalIndex, hidden: false });
                    }
                    priorExpenseCount++;
                  } else if (item.hiddenReason === 'll_cover') {
                    // LL Cover expense
                    if (selectedLLCoverExpenseIndices.includes(llCoverExpenseCount)) {
                      itemVisibilityUpdates.push({ globalIndex, hidden: false });
                    }
                    llCoverExpenseCount++;
                  } else {
                    // Regular hidden expense
                    if (selectedHiddenExpenseIndices.includes(hiddenExpenseCount)) {
                      itemVisibilityUpdates.push({ globalIndex, hidden: false });
                    }
                    hiddenExpenseCount++;
                  }
                } else {
                  if (selectedExpenseIndices.includes(expenseCount)) {
                    itemVisibilityUpdates.push({ globalIndex, hidden: true });
                  }
                  expenseCount++;
                }
              } else if (item.type === 'upsell') {
                if (item.hidden) {
                  if (item.hiddenReason === 'prior_statement') {
                    // Prior statement duplicate upsell
                    if (selectedPriorUpsellIndices.includes(priorUpsellCount)) {
                      itemVisibilityUpdates.push({ globalIndex, hidden: false });
                    }
                    priorUpsellCount++;
                  } else if (item.hiddenReason === 'll_cover') {
                    // LL Cover upsell
                    if (selectedLLCoverUpsellIndices.includes(llCoverUpsellCount)) {
                      itemVisibilityUpdates.push({ globalIndex, hidden: false });
                    }
                    llCoverUpsellCount++;
                  } else {
                    // Regular hidden upsell
                    if (selectedHiddenUpsellIndices.includes(hiddenUpsellCount)) {
                      itemVisibilityUpdates.push({ globalIndex, hidden: false });
                    }
                    hiddenUpsellCount++;
                  }
                } else {
                  if (selectedUpsellIndices.includes(upsellCount)) {
                    itemVisibilityUpdates.push({ globalIndex, hidden: true });
                  }
                  upsellCount++;
                }
              }
            });
          }

          await statementsAPI.editStatement(statement.id, {
            itemVisibilityUpdates: itemVisibilityUpdates.length > 0 ? itemVisibilityUpdates : undefined,
            reservationIdsToRemove: selectedReservationIdsToRemove.length > 0 ? selectedReservationIdsToRemove : undefined,
            reservationIdsToAdd: selectedReservationIdsToAdd.length > 0 ? selectedReservationIdsToAdd : undefined,
            cancelledReservationIdsToAdd: selectedCancelledIdsToAdd.length > 0 ? selectedCancelledIdsToAdd : undefined
          });

          onStatementUpdated();
          onClose();
        } catch (err) {
          setError('Failed to update statement');
          console.error('Failed to update statement:', err);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const handleClose = () => {
    setStatement(null);
    setSelectedExpenseIndices([]);
    setSelectedUpsellIndices([]);
    setSelectedHiddenExpenseIndices([]);
    setSelectedHiddenUpsellIndices([]);
    setSelectedLLCoverExpenseIndices([]);
    setSelectedLLCoverUpsellIndices([]);
    setSelectedPriorExpenseIndices([]);
    setSelectedPriorUpsellIndices([]);
    setSelectedReservationIdsToRemove([]);
    setSelectedReservationIdsToAdd([]);
    setAvailableReservations([]);
    setShowAvailableSection(false);
    setCancelledReservations([]);
    setShowCancelledSection(false);
    setSelectedCancelledIdsToAdd([]);
    setShowHiddenExpenses(false);
    setShowHiddenUpsells(false);
    setCleaningFeeEdits({});
    setInternalNotes('');
    setNotesModified(false);
    setEditingExpenseIndex(null);
    setEditedExpense(null);
    setEditingUpsellIndex(null);
    setEditedUpsell(null);
    setError(null);
    onClose();
  };

  const handleSaveInternalNotes = async () => {
    if (!statement) return;

    // Get propertyId - for combined statements, use the first property
    const propertyId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
    if (!propertyId) {
      setError('Cannot save notes: no property associated with this statement');
      return;
    }

    try {
      setSavingNotes(true);
      setError(null);

      await listingsAPI.updateListingConfig(propertyId, {
        internalNotes: internalNotes.trim() || null
      });

      setNotesModified(false);
      // Update local statement state with new notes
      setStatement(prev => prev ? { ...prev, internalNotes: internalNotes.trim() || null } : null);
    } catch (err) {
      setError('Failed to save internal notes');
      console.error('Failed to save internal notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  if (!isOpen) return null;

  const expenses = statement?.items?.filter(item => item.type === 'expense' && !item.hidden) || [];
  const hiddenExpenses = statement?.items?.filter(item => item.type === 'expense' && item.hidden && item.hiddenReason !== 'll_cover' && item.hiddenReason !== 'prior_statement') || [];
  const llCoverExpenses = statement?.items?.filter(item => item.type === 'expense' && item.hidden && item.hiddenReason === 'll_cover') || [];
  const priorStatementExpenses = statement?.items?.filter(item => item.type === 'expense' && item.hidden && item.hiddenReason === 'prior_statement') || [];
  const upsells = statement?.items?.filter(item => item.type === 'upsell' && !item.hidden) || [];
  const hiddenUpsells = statement?.items?.filter(item => item.type === 'upsell' && item.hidden && item.hiddenReason !== 'll_cover' && item.hiddenReason !== 'prior_statement') || [];
  const llCoverUpsells = statement?.items?.filter(item => item.type === 'upsell' && item.hidden && item.hiddenReason === 'll_cover') || [];
  const priorStatementUpsells = statement?.items?.filter(item => item.type === 'upsell' && item.hidden && item.hiddenReason === 'prior_statement') || [];
  const reservations = statement?.reservations || [];

  const selectedExpensesTotal = selectedExpenseIndices.reduce((sum, index) => {
    return sum + (expenses[index]?.amount || 0);
  }, 0);

  const selectedUpsellsTotal = selectedUpsellIndices.reduce((sum, index) => {
    return sum + (upsells[index]?.amount || 0);
  }, 0);

  const selectedHiddenExpensesTotal = selectedHiddenExpenseIndices.reduce((sum, index) => {
    return sum + (hiddenExpenses[index]?.amount || 0);
  }, 0);

  const selectedHiddenUpsellsTotal = selectedHiddenUpsellIndices.reduce((sum, index) => {
    return sum + (hiddenUpsells[index]?.amount || 0);
  }, 0);

  const selectedLLCoverExpensesTotal = selectedLLCoverExpenseIndices.reduce((sum, index) => {
    return sum + (llCoverExpenses[index]?.amount || 0);
  }, 0);

  const selectedLLCoverUpsellsTotal = selectedLLCoverUpsellIndices.reduce((sum, index) => {
    return sum + (llCoverUpsells[index]?.amount || 0);
  }, 0);

  const selectedPriorExpensesTotal = selectedPriorExpenseIndices.reduce((sum, index) => {
    return sum + (priorStatementExpenses[index]?.amount || 0);
  }, 0);

  const selectedPriorUpsellsTotal = selectedPriorUpsellIndices.reduce((sum, index) => {
    return sum + (priorStatementUpsells[index]?.amount || 0);
  }, 0);

  const selectedReservationsToRemoveTotal = selectedReservationIdsToRemove.reduce((sum, id) => {
    const res = reservations.find(r => (r.hostifyId || r.id) === id);
    return sum + (res?.grossAmount || res?.clientRevenue || 0);
  }, 0);

  const selectedReservationsToAddTotal = selectedReservationIdsToAdd.reduce((sum, id) => {
    const res = availableReservations.find(r => (r.hostifyId || r.id) === id);
    return sum + (res?.grossAmount || res?.clientRevenue || 0);
  }, 0);

  const netChange = selectedExpensesTotal
    - selectedUpsellsTotal
    - selectedReservationsToRemoveTotal
    + selectedReservationsToAddTotal
    - selectedHiddenExpensesTotal
    + selectedHiddenUpsellsTotal
    - selectedLLCoverExpensesTotal
    + selectedLLCoverUpsellsTotal
    - selectedPriorExpensesTotal
    + selectedPriorUpsellsTotal;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-lg max-w-6xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold">Edit Statement</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-lg">Loading statement...</div>
            </div>
          ) : error ? (
            <div className="text-red-600 text-center py-12">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
              <p>{error}</p>
              <button
                onClick={loadStatement}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : statement ? (
            <>
              {/* Statement Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold text-lg">{statement.ownerName}</h3>
                    <p className="text-gray-600">{statement.propertyName}</p>
                    <p className="text-sm text-gray-500">
                      {statement.weekStartDate} to {statement.weekEndDate}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Current Payout</div>
                    <div className="text-2xl font-bold text-green-600">
                      ${statement.ownerPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-gray-500">
                      Revenue: ${statement.totalRevenue.toLocaleString()} - Expenses: ${statement.totalExpenses.toLocaleString()}
                    </div>
                    {/* Payout Status & Pay Button */}
                    <div className="mt-2 flex flex-col items-end gap-2">
                      {(statement as any).payoutStatus === 'paid' ? (
                        <div className="text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ Paid {(statement as any).paidAt ? new Date((statement as any).paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : ''}
                          </span>
                          <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                            {(statement as any).stripeFee > 0 && (
                              <div>Stripe fee: <span className="font-medium text-gray-700">${(statement as any).stripeFee.toFixed(2)}</span></div>
                            )}
                            {(statement as any).totalTransferAmount > 0 && (
                              <div>Total transferred: <span className="font-medium text-gray-700">${(statement as any).totalTransferAmount.toFixed(2)}</span></div>
                            )}
                            {(statement as any).payoutTransferId && (
                              <div className="font-mono text-[10px] text-gray-400">{(statement as any).payoutTransferId}</div>
                            )}
                          </div>
                        </div>
                      ) : (statement as any).payoutStatus === 'failed' ? (
                        <div className="text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ✗ Failed
                          </span>
                          {(statement as any).payoutError && (
                            <div className="mt-1 text-xs text-red-600 max-w-[250px] truncate" title={(statement as any).payoutError}>
                              {(statement as any).payoutError}
                            </div>
                          )}
                        </div>
                      ) : (statement as any).payoutStatus === 'pending' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⏳ Processing
                        </span>
                      ) : null}
                      {(statement.status === 'final' && (statement as any).payoutStatus !== 'paid' && statement.ownerPayout > 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: 'Pay Owner',
                              message: `Transfer $${statement.ownerPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ${statement.ownerName}?`,
                              confirmText: 'Pay Now',
                              variant: 'success',
                              onConfirm: async () => {
                                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                                try {
                                  setSaving(true);
                                  const { payoutsAPI } = await import('../services/api');
                                  await payoutsAPI.transferToOwner(statement.id);
                                  onStatementUpdated();
                                  loadStatement();
                                } catch (err: any) {
                                  setError(err.response?.data?.error || err.message || 'Failed to transfer payout');
                                } finally {
                                  setSaving(false);
                                }
                              }
                            });
                          }}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <DollarSign className="w-3 h-3" />
                          Pay Owner
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Statement Period & Settings */}
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 pb-5">
                  <div className="flex items-center mb-3">
                    <Calendar className="w-4 h-4 text-blue-600 mr-2" />
                    <p className="text-sm font-medium text-blue-800">Statement Period & Settings</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Start Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        End Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-gray-500">Quick select:</span>
                    <button
                      type="button"
                      onClick={setThisMonth}
                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={setLastMonth}
                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={setThisYear}
                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      This Year
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Calculation Method <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${editCalculationType === 'checkout'
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}>
                        <input
                          type="radio"
                          name="calculationType"
                          value="checkout"
                          checked={editCalculationType === 'checkout'}
                          onChange={() => setEditCalculationType('checkout')}
                          className="mt-0.5 mr-2"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">Check-out Based</div>
                          <div className="text-xs text-gray-500">Reservations that check out during period</div>
                        </div>
                      </label>
                      <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${editCalculationType === 'calendar'
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}>
                        <input
                          type="radio"
                          name="calculationType"
                          value="calendar"
                          checked={editCalculationType === 'calendar'}
                          onChange={() => setEditCalculationType('calendar')}
                          className="mt-0.5 mr-2"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">Calendar Based</div>
                          <div className="text-xs text-gray-500">Prorate reservations by days in period</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleReconfigure}
                    disabled={isReconfiguring || !editStartDate || !editEndDate}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isReconfiguring ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating Statement...
                      </>
                    ) : (
                      'Update Statement'
                    )}
                  </button>
                </div>

                {/* Internal Notes - Editable */}
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 text-amber-600 mr-2" />
                      <p className="text-sm font-medium text-amber-800">
                        Internal Notes
                        {statement?.pmPercentage !== undefined && (
                          <span className="text-blue-600"> - PM {statement.pmPercentage}%</span>
                        )}
                      </p>
                    </div>
                    {notesModified && (
                      <button
                        onClick={handleSaveInternalNotes}
                        disabled={savingNotes}
                        className="flex items-center px-3 py-1 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 transition-colors"
                      >
                        <Save className="w-3 h-3 mr-1" />
                        {savingNotes ? 'Saving...' : 'Save Notes'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-amber-600 mb-2">
                    Private notes about this listing. Visible in the app only, NOT included on PDF statements.
                  </p>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => {
                      setInternalNotes(e.target.value);
                      setNotesModified(true);
                    }}
                    placeholder="Add notes about this listing (owner preferences, special instructions, etc.)"
                    className="w-full px-3 py-2 border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm bg-white"
                    rows={3}
                  />
                </div>
              </div>

              {/* Selection Info */}
              {(selectedExpenseIndices.length > 0 || selectedUpsellIndices.length > 0 || selectedHiddenExpenseIndices.length > 0 || selectedHiddenUpsellIndices.length > 0 || selectedLLCoverExpenseIndices.length > 0 || selectedLLCoverUpsellIndices.length > 0 || selectedPriorExpenseIndices.length > 0 || selectedPriorUpsellIndices.length > 0 || selectedReservationIdsToRemove.length > 0 || selectedReservationIdsToAdd.length > 0 || selectedCancelledIdsToAdd.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="space-y-1">
                        {selectedExpenseIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedExpenseIndices.length} expense(s) selected to hide
                            </h4>
                            <p className="text-sm text-amber-700">
                              Expense reduction: ${selectedExpensesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedUpsellIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedUpsellIndices.length} upsell(s) selected to hide
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue reduction: ${selectedUpsellsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedHiddenExpenseIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedHiddenExpenseIndices.length} hidden expense(s) selected to restore
                            </h4>
                            <p className="text-sm text-amber-700">
                              Expense increase: ${selectedHiddenExpensesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedHiddenUpsellIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedHiddenUpsellIndices.length} hidden upsell(s) selected to restore
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue increase: ${selectedHiddenUpsellsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedLLCoverExpenseIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-purple-800">
                              {selectedLLCoverExpenseIndices.length} LL Cover expense(s) selected to include
                            </h4>
                            <p className="text-sm text-purple-700">
                              Expense increase: ${selectedLLCoverExpensesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedLLCoverUpsellIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-purple-800">
                              {selectedLLCoverUpsellIndices.length} LL Cover upsell(s) selected to include
                            </h4>
                            <p className="text-sm text-purple-700">
                              Revenue increase: ${selectedLLCoverUpsellsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedReservationIdsToRemove.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedReservationIdsToRemove.length} reservation(s) selected for removal
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue reduction: ${selectedReservationsToRemoveTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedReservationIdsToAdd.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedReservationIdsToAdd.length} reservation(s) selected to add
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue increase: ${selectedReservationsToAddTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedPriorExpenseIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-orange-800">
                              {selectedPriorExpenseIndices.length} prior statement expense(s) selected to restore
                            </h4>
                            <p className="text-sm text-orange-700">
                              Expense increase: ${selectedPriorExpensesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedPriorUpsellIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-orange-800">
                              {selectedPriorUpsellIndices.length} prior statement upsell(s) selected to restore
                            </h4>
                            <p className="text-sm text-orange-700">
                              Revenue increase: ${selectedPriorUpsellsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                        {selectedCancelledIdsToAdd.length > 0 && (
                          <>
                            <h4 className="font-medium text-sky-800">
                              {selectedCancelledIdsToAdd.length} cancelled reservation(s) to add
                            </h4>
                            <p className="text-sm text-sky-700">
                              Revenue: $0.00 (informational only)
                            </p>
                          </>
                        )}
                        <p className="text-xs text-amber-600 font-semibold pt-1">
                          Net change: ${netChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveChanges}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Apply Changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* Expenses List */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    Expenses ({expenses.length})
                  </h3>
                  {hiddenExpenses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHiddenExpenses(prev => !prev)}
                      className="text-xs font-medium text-gray-600 hover:text-gray-800"
                    >
                      {showHiddenExpenses ? 'Hide hidden' : `Show hidden (${hiddenExpenses.length})`}
                    </button>
                  )}
                </div>

                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No visible expenses found in this statement
                  </div>
                ) : (
                  <div className="space-y-2">
                    {expenses.slice(0, expensesDisplayCount).map((expense, index) => {
                      const isSelected = selectedExpenseIndices.includes(index);
                      const isEditing = editingExpenseIndex === index;

                      // Editing mode - show form
                      if (isEditing && editedExpense) {
                        return (
                          <div
                            key={index}
                            className="border rounded-lg p-4 bg-blue-50 border-blue-300"
                          >
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                  <input
                                    type="text"
                                    value={editedExpense.description}
                                    onChange={(e) => setEditedExpense({ ...editedExpense, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Description"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                  <input
                                    type="text"
                                    value={editedExpense.category}
                                    onChange={(e) => setEditedExpense({ ...editedExpense, category: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Category"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                  <input
                                    type="date"
                                    value={editedExpense.date}
                                    onChange={(e) => setEditedExpense({ ...editedExpense, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Amount ($)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editedExpense.amount}
                                    onChange={(e) => setEditedExpense({ ...editedExpense, amount: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end space-x-2 pt-2">
                                <button
                                  onClick={handleCancelEditExpense}
                                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveEditedExpense}
                                  disabled={saving}
                                  className="flex items-center px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  {saving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Display mode
                      return (
                        <div
                          key={index}
                          className={`border rounded-lg p-4 cursor-pointer ${isSelected
                            ? 'bg-red-50 border-red-200'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          onClick={() => handleExpenseToggle(index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleExpenseToggle(index)}
                                  className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                                />
                                <div>
                                  <h4 className="font-medium">{expense.description}</h4>
                                  <div className="text-sm text-gray-500">
                                    <span className="capitalize">{expense.category}</span> • {expense.date}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={(e) => handleStartEditExpense(index, expense, e)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Edit expense"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <div className="flex items-center text-red-600 font-semibold">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {showHiddenExpenses && hiddenExpenses.length > 0 && (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Hidden Expenses ({hiddenExpenses.length})
                      </h4>
                      <span className="text-xs text-gray-500">Select to restore</span>
                    </div>
                    <div className="space-y-2">
                      {hiddenExpenses.map((expense, index) => {
                        const isSelected = selectedHiddenExpenseIndices.includes(index);
                        return (
                          <div
                            key={`hidden-expense-${index}`}
                            className={`border rounded-lg p-3 cursor-pointer ${isSelected
                              ? 'bg-amber-50 border-amber-200'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                              }`}
                            onClick={() => handleHiddenExpenseToggle(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleHiddenExpenseToggle(index)}
                                    className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                  />
                                  <div>
                                    <h4 className="font-medium text-gray-800">{expense.description}</h4>
                                    <div className="text-xs text-gray-500">
                                      <span className="capitalize">{expense.category}</span> • {expense.date}
                                      {expense.hiddenReason === 'll_cover' && (
                                        <span className="ml-2 inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                          LL Cover
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-gray-500 font-semibold">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Show More / Show Less buttons for expenses */}
                      {expenses.length > ITEMS_PER_PAGE && (
                        <div className="flex justify-center gap-2 pt-4">
                          {expensesDisplayCount < expenses.length && (
                            <button
                              onClick={() => setExpensesDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, expenses.length))}
                              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                            >
                              Show More ({Math.min(ITEMS_PER_PAGE, expenses.length - expensesDisplayCount)} more)
                            </button>
                          )}
                          {expensesDisplayCount > ITEMS_PER_PAGE && (
                            <button
                              onClick={() => setExpensesDisplayCount(ITEMS_PER_PAGE)}
                              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                            >
                              Show Less
                            </button>
                          )}
                          <span className="px-4 py-2 text-sm text-gray-500">
                            Showing {Math.min(expensesDisplayCount, expenses.length)} of {expenses.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* LL Cover Expenses Section */}
                {llCoverExpenses.length > 0 && (
                  <div className="mt-4 rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white">
                          LL Cover
                        </span>
                        <h4 className="text-sm font-semibold text-purple-900">
                          Company-Covered Expenses ({llCoverExpenses.length})
                        </h4>
                      </div>
                      <span className="text-xs text-purple-700">Select to include in statement</span>
                    </div>
                    <p className="text-xs text-purple-700 mb-3">
                      These expenses are marked as "LL Cover" in SecureStay and are excluded by default. Select to charge to owner.
                    </p>
                    <div className="space-y-2">
                      {llCoverExpenses.map((expense, index) => {
                        const isSelected = selectedLLCoverExpenseIndices.includes(index);
                        return (
                          <div
                            key={`llcover-expense-${index}`}
                            className={`border rounded-lg p-3 cursor-pointer ${isSelected
                              ? 'bg-purple-100 border-purple-400'
                              : 'bg-white border-purple-200 hover:bg-purple-50'
                              }`}
                            onClick={() => handleLLCoverExpenseToggle(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleLLCoverExpenseToggle(index)}
                                    className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                  />
                                  <div>
                                    <h4 className="font-medium text-gray-800">{expense.description}</h4>
                                    <div className="text-xs text-gray-500">
                                      <span className="capitalize">{expense.category}</span> • {expense.date}
                                      {expense.vendor && <span> • {expense.vendor}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-purple-700 font-semibold">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Prior Statement Duplicate Expenses Section */}
                {priorStatementExpenses.length > 0 && (
                  <div className="mt-4 rounded-lg border-2 border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white">
                          Duplicate
                        </span>
                        <h4 className="text-sm font-semibold text-orange-900">
                          Prior Statement Duplicates ({priorStatementExpenses.length})
                        </h4>
                      </div>
                      <span className="text-xs text-orange-700">Select to include in statement</span>
                    </div>
                    <p className="text-xs text-orange-700 mb-3">
                      These expenses were already included in a prior finalized statement and are excluded by default to prevent double-payment. Select to restore if legitimate.
                    </p>
                    <div className="space-y-2">
                      {priorStatementExpenses.map((expense, index) => {
                        const isSelected = selectedPriorExpenseIndices.includes(index);
                        return (
                          <div
                            key={`prior-expense-${index}`}
                            className={`border rounded-lg p-3 cursor-pointer ${isSelected
                              ? 'bg-orange-100 border-orange-400'
                              : 'bg-white border-orange-200 hover:bg-orange-50'
                              }`}
                            onClick={() => handlePriorExpenseToggle(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handlePriorExpenseToggle(index)}
                                    className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                                  />
                                  <div>
                                    <h4 className="font-medium text-gray-800">{expense.description}</h4>
                                    <div className="text-xs text-gray-500">
                                      <span className="capitalize">{expense.category}</span> {expense.date && <>• {expense.date}</>}
                                      {expense.vendor && <span> • {expense.vendor}</span>}
                                    </div>
                                    {expense.priorStatementId && (
                                      <div className="mt-1">
                                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                                          Already in Statement #{expense.priorStatementId} ({expense.priorPeriod})
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-orange-700 font-semibold">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Revenue (Upsells) List */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    Additional Revenue / Upsells ({upsells.length})
                  </h3>
                  {hiddenUpsells.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHiddenUpsells(prev => !prev)}
                      className="text-xs font-medium text-gray-600 hover:text-gray-800"
                    >
                      {showHiddenUpsells ? 'Hide hidden' : `Show hidden (${hiddenUpsells.length})`}
                    </button>
                  )}
                </div>

                {upsells.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No visible additional revenue/upsells in this statement
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upsells.map((upsell, index) => {
                      const isSelected = selectedUpsellIndices.includes(index);
                      const isEditing = editingUpsellIndex === index;

                      // Editing mode - show form
                      if (isEditing && editedUpsell) {
                        return (
                          <div
                            key={index}
                            className="border rounded-lg p-4 bg-green-50 border-green-300"
                          >
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                  <input
                                    type="text"
                                    value={editedUpsell.description}
                                    onChange={(e) => setEditedUpsell({ ...editedUpsell, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder="Description"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                  <input
                                    type="text"
                                    value={editedUpsell.category}
                                    onChange={(e) => setEditedUpsell({ ...editedUpsell, category: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder="Category"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                  <input
                                    type="date"
                                    value={editedUpsell.date}
                                    onChange={(e) => setEditedUpsell({ ...editedUpsell, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Amount ($)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editedUpsell.amount}
                                    onChange={(e) => setEditedUpsell({ ...editedUpsell, amount: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end space-x-2 pt-2">
                                <button
                                  onClick={handleCancelEditUpsell}
                                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveEditedUpsell}
                                  disabled={saving}
                                  className="flex items-center px-3 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  {saving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Display mode
                      return (
                        <div
                          key={index}
                          className={`border rounded-lg p-4 cursor-pointer ${isSelected
                            ? 'bg-red-50 border-red-200'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          onClick={() => handleUpsellToggle(index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleUpsellToggle(index)}
                                  className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                                />
                                <div>
                                  <h4 className="font-medium">{upsell.description}</h4>
                                  <div className="text-sm text-gray-500">
                                    <span className="capitalize">{upsell.category}</span> • {upsell.date}
                                    {upsell.listing && <span className="ml-2">• {upsell.listing}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={(e) => handleStartEditUpsell(index, upsell, e)}
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                title="Edit upsell"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <div className="flex items-center text-green-600 font-semibold">
                                <Plus className="w-4 h-4 mr-1" />
                                {upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {showHiddenUpsells && hiddenUpsells.length > 0 && (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Hidden Upsells ({hiddenUpsells.length})
                      </h4>
                      <span className="text-xs text-gray-500">Select to restore</span>
                    </div>
                    <div className="space-y-2">
                      {hiddenUpsells.map((upsell, index) => {
                        const isSelected = selectedHiddenUpsellIndices.includes(index);
                        return (
                          <div
                            key={`hidden-upsell-${index}`}
                            className={`border rounded-lg p-3 cursor-pointer ${isSelected
                              ? 'bg-amber-50 border-amber-200'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                              }`}
                            onClick={() => handleHiddenUpsellToggle(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleHiddenUpsellToggle(index)}
                                    className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                  />
                                  <div>
                                    <h4 className="font-medium text-gray-800">{upsell.description}</h4>
                                    <div className="text-xs text-gray-500">
                                      <span className="capitalize">{upsell.category}</span> • {upsell.date}
                                      {upsell.listing && <span className="ml-2">• {upsell.listing}</span>}
                                      {upsell.hiddenReason === 'll_cover' && (
                                        <span className="ml-2 inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                          LL Cover
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-gray-500 font-semibold">
                                <Plus className="w-4 h-4 mr-1" />
                                {upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* LL Cover Upsells Section */}
                {llCoverUpsells.length > 0 && (
                  <div className="mt-4 rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white">
                          LL Cover
                        </span>
                        <h4 className="text-sm font-semibold text-purple-900">
                          Company-Covered Upsells ({llCoverUpsells.length})
                        </h4>
                      </div>
                      <span className="text-xs text-purple-700">Select to include in statement</span>
                    </div>
                    <p className="text-xs text-purple-700 mb-3">
                      These upsells are marked as "LL Cover" in SecureStay and are excluded by default. Select to add to owner revenue.
                    </p>
                    <div className="space-y-2">
                      {llCoverUpsells.map((upsell, index) => {
                        const isSelected = selectedLLCoverUpsellIndices.includes(index);
                        return (
                          <div
                            key={`llcover-upsell-${index}`}
                            className={`border rounded-lg p-3 cursor-pointer ${isSelected
                              ? 'bg-purple-100 border-purple-400'
                              : 'bg-white border-purple-200 hover:bg-purple-50'
                              }`}
                            onClick={() => handleLLCoverUpsellToggle(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleLLCoverUpsellToggle(index)}
                                    className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                  />
                                  <div>
                                    <h4 className="font-medium text-gray-800">{upsell.description}</h4>
                                    <div className="text-xs text-gray-500">
                                      <span className="capitalize">{upsell.category}</span> • {upsell.date}
                                      {upsell.listing && <span> • {upsell.listing}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-purple-700 font-semibold">
                                <Plus className="w-4 h-4 mr-1" />
                                {upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Prior Statement Duplicate Upsells Section */}
                {priorStatementUpsells.length > 0 && (
                  <div className="mt-4 rounded-lg border-2 border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white">
                          Duplicate
                        </span>
                        <h4 className="text-sm font-semibold text-orange-900">
                          Prior Statement Duplicate Upsells ({priorStatementUpsells.length})
                        </h4>
                      </div>
                      <span className="text-xs text-orange-700">Select to include in statement</span>
                    </div>
                    <p className="text-xs text-orange-700 mb-3">
                      These upsells were already included in a prior finalized statement. Select to restore if legitimate.
                    </p>
                    <div className="space-y-2">
                      {priorStatementUpsells.map((upsell, index) => {
                        const isSelected = selectedPriorUpsellIndices.includes(index);
                        return (
                          <div
                            key={`prior-upsell-${index}`}
                            className={`border rounded-lg p-3 cursor-pointer ${isSelected
                              ? 'bg-orange-100 border-orange-400'
                              : 'bg-white border-orange-200 hover:bg-orange-50'
                              }`}
                            onClick={() => handlePriorUpsellToggle(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handlePriorUpsellToggle(index)}
                                    className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                                  />
                                  <div>
                                    <h4 className="font-medium text-gray-800">{upsell.description}</h4>
                                    <div className="text-xs text-gray-500">
                                      <span className="capitalize">{upsell.category}</span> {upsell.date && <>• {upsell.date}</>}
                                      {upsell.listing && <span> • {upsell.listing}</span>}
                                    </div>
                                    {upsell.priorStatementId && (
                                      <div className="mt-1">
                                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                                          Already in Statement #{upsell.priorStatementId} ({upsell.priorPeriod})
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-orange-700 font-semibold">
                                <Plus className="w-4 h-4 mr-1" />
                                {upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Current Reservations Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    Current Reservations ({reservations.length})
                    {statement?.cleaningFeePassThrough && (
                      <span className="ml-2 text-sm font-normal text-blue-600">(Cleaning Fee Pass-Through Enabled)</span>
                    )}
                  </h3>
                  {statement?.cleaningFeePassThrough && Object.keys(cleaningFeeEdits).length > 0 && (
                    <button
                      onClick={handleSaveCleaningFees}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Cleaning Fees'}
                    </button>
                  )}
                </div>

                {reservations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No reservations in this statement
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reservations.slice(0, reservationsDisplayCount).map((reservation) => {
                      const resId = reservation.hostifyId || reservation.id;
                      const isSelected = selectedReservationIdsToRemove.includes(resId);
                      const resIdStr = String(resId);
                      const currentCleaningFee = cleaningFeeEdits[resIdStr] !== undefined
                        ? cleaningFeeEdits[resIdStr]
                        : String(reservation.cleaningFee || 0);
                      return (
                        <div
                          key={resId}
                          className={`border rounded-lg p-4 ${isSelected
                            ? 'bg-red-50 border-red-200'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 cursor-pointer" onClick={() => handleReservationRemoveToggle(resId)}>
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleReservationRemoveToggle(resId)}
                                  className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                                />
                                <div>
                                  <h4 className="font-medium">{reservation.guestName}</h4>
                                  <div className="text-sm text-gray-500">
                                    <div className="flex items-center space-x-4">
                                      <span className="flex items-center">
                                        <Calendar className="w-3 h-3 mr-1" />
                                        {reservation.checkInDate} to {reservation.checkOutDate}
                                      </span>
                                      {reservation.status && (
                                        <span className={`px-2 py-1 rounded-full text-xs ${reservation.status === 'cancelled'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-green-100 text-green-800'
                                          }`}>
                                          {reservation.status.toUpperCase()}
                                        </span>
                                      )}
                                      <span className="text-gray-400">
                                        {reservation.source}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              {/* Editable Cleaning Fee (only when pass-through is enabled) */}
                              {statement?.cleaningFeePassThrough && (
                                <div className="flex items-center">
                                  <label className="text-xs text-gray-500 mr-2">Cleaning:</label>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">$</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={currentCleaningFee}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        handleCleaningFeeChange(resIdStr, e.target.value);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-24 pl-6 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center text-green-600 font-semibold">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {(reservation.grossAmount || reservation.clientRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Show More / Show Less buttons for reservations */}
                    {reservations.length > ITEMS_PER_PAGE && (
                      <div className="flex justify-center gap-2 pt-4">
                        {reservationsDisplayCount < reservations.length && (
                          <button
                            onClick={() => setReservationsDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, reservations.length))}
                            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                          >
                            Show More ({Math.min(ITEMS_PER_PAGE, reservations.length - reservationsDisplayCount)} more)
                          </button>
                        )}
                        {reservationsDisplayCount > ITEMS_PER_PAGE && (
                          <button
                            onClick={() => setReservationsDisplayCount(ITEMS_PER_PAGE)}
                            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                          >
                            Show Less
                          </button>
                        )}
                        <span className="px-4 py-2 text-sm text-gray-500">
                          Showing {Math.min(reservationsDisplayCount, reservations.length)} of {reservations.length}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cancelled Reservations Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                    Cancelled Reservations
                  </h3>
                  {!showCancelledSection ? (
                    <button
                      onClick={loadCancelledReservations}
                      disabled={loadingCancelled}
                      className="flex items-center px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50 transition-colors"
                    >
                      {loadingCancelled ? 'Loading...' : 'View Cancelled'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowCancelledSection(false)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Hide
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Cancelled reservations that overlapped with this statement period. These are shown for reference only and don&apos;t affect calculations unless manually added.
                </p>

                {showCancelledSection && (
                  <div>
                    {cancelledReservations.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                        No cancelled reservations found for this period
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cancelledReservations.map((reservation) => {
                          const resId = reservation.hostifyId || reservation.id;
                          const isAlreadyAdded = reservation.alreadyInStatement;
                          const isSelected = selectedCancelledIdsToAdd.includes(resId);
                          return (
                            <div
                              key={resId}
                              className={`border rounded-lg p-4 transition-colors ${isAlreadyAdded
                                ? 'bg-gray-50 border-gray-200 opacity-60'
                                : isSelected
                                  ? 'bg-sky-50 border-sky-200 cursor-pointer'
                                  : 'bg-white border-gray-200 hover:bg-gray-50 cursor-pointer'
                                }`}
                              onClick={() => !isAlreadyAdded && handleCancelledReservationToggle(resId)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3">
                                    {!isAlreadyAdded && (
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleCancelledReservationToggle(resId)}
                                        className="data-[state=checked]:bg-sky-600 data-[state=checked]:border-sky-600"
                                      />
                                    )}
                                    <div>
                                      <h4 className="font-medium flex items-center gap-2">
                                        {reservation.guestName}
                                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                                          CANCELLED
                                        </span>
                                        {isAlreadyAdded && (
                                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
                                            Already in statement
                                          </span>
                                        )}
                                      </h4>
                                      <div className="text-sm text-gray-500">
                                        <div className="flex items-center space-x-4">
                                          <span className="flex items-center">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {reservation.checkInDate} to {reservation.checkOutDate}
                                          </span>
                                          <span className="text-gray-400">
                                            {reservation.source}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center text-gray-500 font-semibold">
                                  <DollarSign className="w-4 h-4 mr-1" />
                                  {(reservation.clientRevenue || reservation.grossAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  <span className="text-xs text-gray-400 ml-1">(original)</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {selectedCancelledIdsToAdd.length > 0 && (
                      <div className="mt-4 p-3 bg-sky-50 rounded-lg border border-sky-200">
                        <p className="text-sm text-sky-800">
                          <strong>{selectedCancelledIdsToAdd.length}</strong> cancelled reservation{selectedCancelledIdsToAdd.length > 1 ? 's' : ''} selected to add.
                          These will be added with $0 revenue when you save.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Available Reservations Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    Available Reservations
                  </h3>
                  {!showAvailableSection ? (
                    <button
                      onClick={loadAvailableReservations}
                      disabled={loadingAvailable}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {loadingAvailable ? 'Loading...' : 'Add Reservations'}
                    </button>
                  ) : (
                    <div className="text-sm text-gray-600">
                      {availableReservations.length} available to add
                    </div>
                  )}
                </div>

                {showAvailableSection && (
                  <div>
                    {availableReservations.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No additional reservations found for this statement period
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableReservations.map((reservation) => {
                          const resId = reservation.hostifyId || reservation.id;
                          const isSelected = selectedReservationIdsToAdd.includes(resId);
                          return (
                            <div
                              key={resId}
                              className={`border rounded-lg p-4 cursor-pointer ${isSelected
                                ? 'bg-green-50 border-green-200'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                                }`}
                              onClick={() => handleReservationAddToggle(resId)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => handleReservationAddToggle(resId)}
                                      className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                    />
                                    <div>
                                      <h4 className="font-medium">{reservation.guestName}</h4>
                                      <div className="text-sm text-gray-500">
                                        <div className="flex items-center space-x-4">
                                          <span className="flex items-center">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {reservation.checkInDate} to {reservation.checkOutDate}
                                          </span>
                                          {reservation.status && (
                                            <span className={`px-2 py-1 rounded-full text-xs ${reservation.status === 'cancelled'
                                              ? 'bg-red-100 text-red-800'
                                              : 'bg-blue-100 text-blue-800'
                                              }`}>
                                              {reservation.status.toUpperCase()}
                                            </span>
                                          )}
                                          <span className="text-gray-400">
                                            {reservation.source}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center text-green-600 font-semibold">
                                  <DollarSign className="w-4 h-4 mr-1" />
                                  {(reservation.grossAmount || reservation.clientRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Custom Reservation Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    Custom Reservation
                  </h3>
                  {!showCustomReservationForm ? (
                    <button
                      onClick={() => setShowCustomReservationForm(true)}
                      className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Custom Reservation
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShowCustomReservationForm(false);
                        setCustomReservation({
                          guestName: '',
                          checkInDate: '',
                          checkOutDate: '',
                          nights: '',
                          description: '',
                          baseRate: '',
                          guestFees: '',
                          platformFees: '',
                          tax: '',
                          pmCommission: '',
                          grossPayout: '',
                          platform: 'direct',
                          guestPaidDamageCoverage: ''
                        });
                      }}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {showCustomReservationForm && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    {/* Basic Info Section */}
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Guest Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customReservation.guestName}
                          onChange={(e) => setCustomReservation({ ...customReservation, guestName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Platform <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={customReservation.platform}
                          onChange={(e) => setCustomReservation({ ...customReservation, platform: e.target.value as 'airbnb' | 'vrbo' | 'direct' | 'booking' | 'other' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                        >
                          <option value="direct">Direct</option>
                          <option value="airbnb">Airbnb</option>
                          <option value="vrbo">Vrbo</option>
                          <option value="booking">Booking.com</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description (optional)
                        </label>
                        <input
                          type="text"
                          value={customReservation.description}
                          onChange={(e) => setCustomReservation({ ...customReservation, description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="Direct booking"
                        />
                      </div>
                    </div>

                    {/* Dates Section */}
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Dates</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Check-in Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={customReservation.checkInDate}
                          onChange={(e) => setCustomReservation({ ...customReservation, checkInDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Check-out Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={customReservation.checkOutDate}
                          onChange={(e) => setCustomReservation({ ...customReservation, checkOutDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nights (auto-calculated)
                        </label>
                        <input
                          type="number"
                          value={customReservation.nights}
                          onChange={(e) => setCustomReservation({ ...customReservation, nights: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="Auto"
                        />
                      </div>
                    </div>

                    {/* Financial Section */}
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Financial Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Base Rate ($) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.baseRate}
                          onChange={(e) => setCustomReservation({ ...customReservation, baseRate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="500.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Guest Fees ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.guestFees}
                          onChange={(e) => setCustomReservation({ ...customReservation, guestFees: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Platform Fees ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.platformFees}
                          onChange={(e) => setCustomReservation({ ...customReservation, platformFees: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tax ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.tax}
                          onChange={(e) => setCustomReservation({ ...customReservation, tax: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          PM Commission ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.pmCommission}
                          onChange={(e) => setCustomReservation({ ...customReservation, pmCommission: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Gross Payout ($) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.grossPayout}
                          onChange={(e) => setCustomReservation({ ...customReservation, grossPayout: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="500.00"
                        />
                      </div>
                    </div>

                    {/* Additional Options */}
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Additional Options</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Guest Paid Damage Coverage ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.guestPaidDamageCoverage}
                          onChange={(e) => setCustomReservation({ ...customReservation, guestPaidDamageCoverage: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleAddCustomReservation}
                        disabled={saving}
                        className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {saving ? 'Adding...' : 'Add Reservation'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50 flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Custom Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default EditStatementModal;
