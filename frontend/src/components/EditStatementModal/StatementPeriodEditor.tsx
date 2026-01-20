import React from 'react';
import { Calendar } from 'lucide-react';
import { StatementPeriodEditorProps } from './types';

const StatementPeriodEditor: React.FC<StatementPeriodEditorProps> = ({
  startDate,
  endDate,
  calculationType,
  onStartDateChange,
  onEndDateChange,
  onCalculationTypeChange,
  onThisMonth,
  onLastMonth,
  onReconfigure,
  isReconfiguring
}) => {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Statement Period & Settings
        </h4>
        <div className="flex gap-2">
          <button
            onClick={onThisMonth}
            className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
          >
            This Month
          </button>
          <button
            onClick={onLastMonth}
            className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
          >
            Last Month
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Start Date */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Calculation Type */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Calculation Type</label>
          <select
            value={calculationType}
            onChange={(e) => onCalculationTypeChange(e.target.value as 'checkout' | 'calendar')}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="checkout">Checkout-based</option>
            <option value="calendar">Calendar-based</option>
          </select>
        </div>
      </div>

      {/* Reconfigure Button */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={onReconfigure}
          disabled={isReconfiguring}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {isReconfiguring ? (
            <>
              <span className="animate-spin">⟳</span>
              Reconfiguring...
            </>
          ) : (
            'Reconfigure Statement'
          )}
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Changing the period or calculation type will recalculate all reservations and expenses.
      </p>
    </div>
  );
};

export default StatementPeriodEditor;
