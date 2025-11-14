import React, { useState, useEffect, useCallback } from 'react';
import { X, DollarSign, AlertTriangle, Plus, Calendar } from 'lucide-react';
import { statementsAPI } from '../services/api';
import { Statement, Reservation } from '../types';

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
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [showAvailableSection, setShowAvailableSection] = useState(false);
  const [showCustomReservationForm, setShowCustomReservationForm] = useState(false);
  const [showCustomExpenseForm, setShowCustomExpenseForm] = useState(false);
  const [showCustomUpsellForm, setShowCustomUpsellForm] = useState(false);
  const [customReservation, setCustomReservation] = useState({
    guestName: '',
    checkInDate: '',
    checkOutDate: '',
    amount: '',
    nights: '',
    description: ''
  });
  const [customExpense, setCustomExpense] = useState({
    description: '',
    amount: '',
    date: '',
    category: 'expense'
  });
  const [customUpsell, setCustomUpsell] = useState({
    description: '',
    amount: '',
    date: '',
    category: 'upsell'
  });
  const [error, setError] = useState<string | null>(null);

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
      setShowCustomExpenseForm(false);
      setShowCustomUpsellForm(false);
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

  const handleAddCustomReservation = async () => {
    if (!statement) return;

    // Validate required fields
    if (!customReservation.guestName || !customReservation.checkInDate || !customReservation.checkOutDate || !customReservation.amount) {
      alert('Please fill in all required fields: Guest Name, Check-in Date, Check-out Date, and Amount');
      return;
    }

    const amount = parseFloat(customReservation.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!window.confirm(`Add custom reservation for ${customReservation.guestName} with amount $${amount}?`)) {
      return;
    }

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

      alert('✅ Custom reservation added successfully');
      
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
  };

  const handleSaveChanges = async () => {
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
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

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

      alert('✅ Statement updated successfully');
      onStatementUpdated();
      onClose();
    } catch (err) {
      setError('Failed to update statement');
      console.error('Failed to update statement:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStatement(null);
    setSelectedExpenseIndices([]);
    setSelectedUpsellIndices([]);
    setSelectedReservationIdsToRemove([]);
    setSelectedReservationIdsToAdd([]);
    setAvailableReservations([]);
    setShowAvailableSection(false);
    setShowCustomExpenseForm(false);
    setShowCustomUpsellForm(false);
    setError(null);
    onClose();
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
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Edit Statement</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
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
                <h3 className="text-lg font-semibold mb-4">
                  Current Reservations ({reservations.length})
                </h3>
                
                {reservations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No reservations in this statement
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reservations.map((reservation) => {
                      const resId = reservation.hostifyId || reservation.id;
                      const isSelected = selectedReservationIdsToRemove.includes(resId);
                      return (
                        <div
                          key={resId}
                          className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-red-50 border-red-200' 
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                          onClick={() => handleReservationRemoveToggle(resId)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
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
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditStatementModal;
