import React, { useState, useEffect, useCallback } from 'react';
import { X, DollarSign, AlertTriangle, Plus, Calendar, FileText, Save } from 'lucide-react';
import { statementsAPI, listingsAPI } from '../services/api';
import { Statement, Reservation } from '../types';

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
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              variant === 'warning' ? 'bg-amber-100' : variant === 'success' ? 'bg-green-100' : 'bg-blue-100'
            }`}>
              <AlertTriangle className={`w-5 h-5 ${
                variant === 'warning' ? 'text-amber-600' : variant === 'success' ? 'text-green-600' : 'text-blue-600'
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
  const [selectedReservationIdsToRemove, setSelectedReservationIdsToRemove] = useState<number[]>([]);
  const [selectedReservationIdsToAdd, setSelectedReservationIdsToAdd] = useState<number[]>([]);
  const [availableReservations, setAvailableReservations] = useState<Reservation[]>([]);
  const [cleaningFeeEdits, setCleaningFeeEdits] = useState<{ [reservationId: string]: string }>({});
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [showAvailableSection, setShowAvailableSection] = useState(false);
  const [showCustomReservationForm, setShowCustomReservationForm] = useState(false);
  const [customReservation, setCustomReservation] = useState({
    guestName: '',
    checkInDate: '',
    checkOutDate: '',
    amount: '',
    nights: '',
    description: ''
  });
  const [error, setError] = useState<string | null>(null);

  // Internal notes state
  const [internalNotes, setInternalNotes] = useState('');
  const [notesModified, setNotesModified] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

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
    onConfirm: () => {}
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
      setSelectedReservationIdsToRemove([]);
      setSelectedReservationIdsToAdd([]);
      setAvailableReservations([]);
      setShowAvailableSection(false);
      setCleaningFeeEdits({});
      setInternalNotes(response.internalNotes || '');
      setNotesModified(false);
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
    setSelectedExpenseIndices(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleUpsellToggle = (index: number) => {
    setSelectedUpsellIndices(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
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
    if (!customReservation.guestName || !customReservation.checkInDate || !customReservation.checkOutDate || !customReservation.amount) {
      setError('Please fill in all required fields: Guest Name, Check-in Date, Check-out Date, and Amount');
      return;
    }

    const amount = parseFloat(customReservation.amount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Show custom confirm dialog
    setConfirmDialog({
      isOpen: true,
      title: 'Add Custom Reservation',
      message: `Add custom reservation for ${customReservation.guestName} with amount $${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}?`,
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
              amount: amount,
              nights: customReservation.nights ? parseInt(customReservation.nights) : undefined,
              description: customReservation.description || undefined
            }
          });

          // Reset form
          setCustomReservation({
            guestName: '',
            checkInDate: '',
            checkOutDate: '',
            amount: '',
            nights: '',
            description: ''
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
    if (!statement || (selectedExpenseIndices.length === 0 && selectedUpsellIndices.length === 0 && selectedReservationIdsToRemove.length === 0 && selectedReservationIdsToAdd.length === 0)) {
      return;
    }

    const actions = [];
    if (selectedExpenseIndices.length > 0) {
      actions.push(`remove ${selectedExpenseIndices.length} expense(s)`);
    }
    if (selectedUpsellIndices.length > 0) {
      actions.push(`remove ${selectedUpsellIndices.length} upsell(s)`);
    }
    if (selectedReservationIdsToRemove.length > 0) {
      actions.push(`remove ${selectedReservationIdsToRemove.length} reservation(s)`);
    }
    if (selectedReservationIdsToAdd.length > 0) {
      actions.push(`add ${selectedReservationIdsToAdd.length} reservation(s)`);
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

          // Map expense and upsell indices to their global item indices
          // We need to find the actual position in statement.items array
          const globalIndicesToRemove: number[] = [];

          if (statement.items) {
            let expenseCount = 0;
            let upsellCount = 0;

            statement.items.forEach((item, globalIndex) => {
              if (item.type === 'expense') {
                if (selectedExpenseIndices.includes(expenseCount)) {
                  globalIndicesToRemove.push(globalIndex);
                }
                expenseCount++;
              } else if (item.type === 'upsell') {
                if (selectedUpsellIndices.includes(upsellCount)) {
                  globalIndicesToRemove.push(globalIndex);
                }
                upsellCount++;
              }
            });
          }

          await statementsAPI.editStatement(statement.id, {
            expenseIdsToRemove: globalIndicesToRemove.length > 0 ? globalIndicesToRemove : undefined,
            reservationIdsToRemove: selectedReservationIdsToRemove.length > 0 ? selectedReservationIdsToRemove : undefined,
            reservationIdsToAdd: selectedReservationIdsToAdd.length > 0 ? selectedReservationIdsToAdd : undefined
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
    setSelectedReservationIdsToRemove([]);
    setSelectedReservationIdsToAdd([]);
    setAvailableReservations([]);
    setShowAvailableSection(false);
    setCleaningFeeEdits({});
    setInternalNotes('');
    setNotesModified(false);
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

  const expenses = statement?.items?.filter(item => item.type === 'expense') || [];
  const upsells = statement?.items?.filter(item => item.type === 'upsell') || [];
  const reservations = statement?.reservations || [];
  
  const selectedExpensesTotal = selectedExpenseIndices.reduce((sum, index) => {
    return sum + (expenses[index]?.amount || 0);
  }, 0);

  const selectedUpsellsTotal = selectedUpsellIndices.reduce((sum, index) => {
    return sum + (upsells[index]?.amount || 0);
  }, 0);

  const selectedReservationsToRemoveTotal = selectedReservationIdsToRemove.reduce((sum, id) => {
    const res = reservations.find(r => (r.hostifyId || r.id) === id);
    return sum + (res?.grossAmount || res?.clientRevenue || 0);
  }, 0);

  const selectedReservationsToAddTotal = selectedReservationIdsToAdd.reduce((sum, id) => {
    const res = availableReservations.find(r => (r.hostifyId || r.id) === id);
    return sum + (res?.grossAmount || res?.clientRevenue || 0);
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
                      ${statement.ownerPayout.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                    <div className="text-xs text-gray-500">
                      Revenue: ${statement.totalRevenue.toLocaleString()} - Expenses: ${statement.totalExpenses.toLocaleString()}
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
                      <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                        editCalculationType === 'checkout'
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
                      <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                        editCalculationType === 'calendar'
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
                      <p className="text-sm font-medium text-amber-800">Internal Notes</p>
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
              {(selectedExpenseIndices.length > 0 || selectedUpsellIndices.length > 0 || selectedReservationIdsToRemove.length > 0 || selectedReservationIdsToAdd.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="space-y-1">
                        {selectedExpenseIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedExpenseIndices.length} expense(s) selected for removal
                            </h4>
                            <p className="text-sm text-amber-700">
                              Expense reduction: ${selectedExpensesTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                          </>
                        )}
                        {selectedUpsellIndices.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedUpsellIndices.length} upsell(s) selected for removal
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue reduction: ${selectedUpsellsTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                          </>
                        )}
                        {selectedReservationIdsToRemove.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedReservationIdsToRemove.length} reservation(s) selected for removal
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue reduction: ${selectedReservationsToRemoveTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                          </>
                        )}
                        {selectedReservationIdsToAdd.length > 0 && (
                          <>
                            <h4 className="font-medium text-amber-800">
                              {selectedReservationIdsToAdd.length} reservation(s) selected to add
                            </h4>
                            <p className="text-sm text-amber-700">
                              Revenue increase: ${selectedReservationsToAddTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                          </>
                        )}
                        <p className="text-xs text-amber-600 font-semibold pt-1">
                          Net change: ${((selectedExpensesTotal - selectedUpsellsTotal - selectedReservationsToRemoveTotal + selectedReservationsToAddTotal)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
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
                <h3 className="text-lg font-semibold mb-4">
                  Expenses ({expenses.length})
                </h3>
                
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No expenses found in this statement
                  </div>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((expense, index) => {
                      const isSelected = selectedExpenseIndices.includes(index);
                      return (
                        <div
                          key={index}
                          className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-red-50 border-red-200' 
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                          onClick={() => handleExpenseToggle(index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleExpenseToggle(index)}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                />
                                <div>
                                  <h4 className="font-medium">{expense.description}</h4>
                                  <div className="text-sm text-gray-500">
                                    <span className="capitalize">{expense.category}</span> • {expense.date}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center text-red-600 font-semibold">
                              <DollarSign className="w-4 h-4 mr-1" />
                              {expense.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Additional Revenue (Upsells) List */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4">
                  Additional Revenue / Upsells ({upsells.length})
                </h3>
                
                {upsells.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No additional revenue/upsells in this statement
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upsells.map((upsell, index) => {
                      const isSelected = selectedUpsellIndices.includes(index);
                      return (
                        <div
                          key={index}
                          className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-red-50 border-red-200' 
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                          onClick={() => handleUpsellToggle(index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleUpsellToggle(index)}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
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
                            <div className="flex items-center text-green-600 font-semibold">
                              <Plus className="w-4 h-4 mr-1" />
                              {upsell.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                    {reservations.map((reservation) => {
                      const resId = reservation.hostifyId || reservation.id;
                      const isSelected = selectedReservationIdsToRemove.includes(resId);
                      const resIdStr = String(resId);
                      const currentCleaningFee = cleaningFeeEdits[resIdStr] !== undefined
                        ? cleaningFeeEdits[resIdStr]
                        : String(reservation.cleaningFee || 0);
                      return (
                        <div
                          key={resId}
                          className={`border rounded-lg p-4 transition-colors ${
                            isSelected
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 cursor-pointer" onClick={() => handleReservationRemoveToggle(resId)}>
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleReservationRemoveToggle(resId)}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
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
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                          reservation.status === 'cancelled'
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
                                {(reservation.grossAmount || reservation.clientRevenue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'bg-green-50 border-green-200' 
                                  : 'bg-white border-gray-200 hover:bg-gray-50'
                              }`}
                              onClick={() => handleReservationAddToggle(resId)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleReservationAddToggle(resId)}
                                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
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
                                            <span className={`px-2 py-1 rounded-full text-xs ${
                                              reservation.status === 'cancelled' 
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
                                  {(reservation.grossAmount || reservation.clientRevenue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
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
                          amount: '',
                          nights: '',
                          description: ''
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Guest Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customReservation.guestName}
                          onChange={(e) => setCustomReservation({...customReservation, guestName: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Amount ($) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={customReservation.amount}
                          onChange={(e) => setCustomReservation({...customReservation, amount: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="500.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Check-in Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={customReservation.checkInDate}
                          onChange={(e) => setCustomReservation({...customReservation, checkInDate: e.target.value})}
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
                          onChange={(e) => setCustomReservation({...customReservation, checkOutDate: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nights (optional)
                        </label>
                        <input
                          type="number"
                          value={customReservation.nights}
                          onChange={(e) => setCustomReservation({...customReservation, nights: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="3"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description (optional)
                        </label>
                        <input
                          type="text"
                          value={customReservation.description}
                          onChange={(e) => setCustomReservation({...customReservation, description: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          placeholder="Direct booking"
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
