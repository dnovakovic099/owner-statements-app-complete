import React from 'react';
import { X, Plus } from 'lucide-react';
import { CustomReservationFormProps, CustomReservationData } from './types';

const CustomReservationForm: React.FC<CustomReservationFormProps> = ({
  isOpen,
  onClose,
  reservation,
  onChange,
  onSubmit,
  isSubmitting = false
}) => {
  if (!isOpen) return null;

  const platformOptions = [
    { value: 'direct', label: 'Direct Booking' },
    { value: 'airbnb', label: 'Airbnb' },
    { value: 'vrbo', label: 'VRBO' },
    { value: 'booking', label: 'Booking.com' },
    { value: 'other', label: 'Other' }
  ];

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Custom Reservation
        </h4>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Basic Info Section */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Guest Name *</label>
            <input
              type="text"
              value={reservation.guestName}
              onChange={(e) => onChange('guestName', e.target.value)}
              placeholder="Enter guest name"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Platform</label>
            <select
              value={reservation.platform}
              onChange={(e) => onChange('platform', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            >
              {platformOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dates Section */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Check-in Date *</label>
            <input
              type="date"
              value={reservation.checkInDate}
              onChange={(e) => onChange('checkInDate', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Check-out Date *</label>
            <input
              type="date"
              value={reservation.checkOutDate}
              onChange={(e) => onChange('checkOutDate', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nights</label>
            <input
              type="number"
              value={reservation.nights}
              onChange={(e) => onChange('nights', e.target.value)}
              placeholder="Auto-calculated"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-gray-50"
              readOnly
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
          <input
            type="text"
            value={reservation.description}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="e.g., Owner stay, Maintenance block"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Financial Section */}
        <div className="border-t border-gray-200 pt-3">
          <h5 className="text-xs font-medium text-gray-700 mb-2">Financial Details</h5>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Base Rate ($)</label>
              <input
                type="number"
                step="0.01"
                value={reservation.baseRate}
                onChange={(e) => onChange('baseRate', e.target.value)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Guest Fees ($)</label>
              <input
                type="number"
                step="0.01"
                value={reservation.guestFees}
                onChange={(e) => onChange('guestFees', e.target.value)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Platform Fees ($)</label>
              <input
                type="number"
                step="0.01"
                value={reservation.platformFees}
                onChange={(e) => onChange('platformFees', e.target.value)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tax ($)</label>
              <input
                type="number"
                step="0.01"
                value={reservation.tax}
                onChange={(e) => onChange('tax', e.target.value)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">PM Commission ($)</label>
              <input
                type="number"
                step="0.01"
                value={reservation.pmCommission}
                onChange={(e) => onChange('pmCommission', e.target.value)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Gross Payout ($) *</label>
              <input
                type="number"
                step="0.01"
                value={reservation.grossPayout}
                onChange={(e) => onChange('grossPayout', e.target.value)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Additional Options */}
        <div className="border-t border-gray-200 pt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Guest-Paid Damage Coverage ($)</label>
            <input
              type="number"
              step="0.01"
              value={reservation.guestPaidDamageCoverage}
              onChange={(e) => onChange('guestPaidDamageCoverage', e.target.value)}
              placeholder="0.00"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onSubmit}
            disabled={isSubmitting || !reservation.guestName || !reservation.checkInDate || !reservation.checkOutDate}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⟳</span>
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Reservation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomReservationForm;
