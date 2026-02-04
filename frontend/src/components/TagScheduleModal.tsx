import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar } from 'lucide-react';

interface TagSchedule {
  tagName: string;
  isEnabled: boolean;
  frequencyType: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  biweeklyWeek?: 'A' | 'B';
  calculationType?: 'checkout' | 'calendar';
  nextScheduledAt?: string;
}

interface TagScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagName: string;
  existingSchedule?: TagSchedule | null;
  onSave: (schedule: Omit<TagSchedule, 'nextScheduledAt'>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TagScheduleModal: React.FC<TagScheduleModalProps> = ({
  isOpen,
  onClose,
  tagName,
  existingSchedule,
  onSave,
  onDelete
}) => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [frequencyType, setFrequencyType] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(5); // Friday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [biweeklyWeek, setBiweeklyWeek] = useState<'A' | 'B'>('A');
  const [calculationType, setCalculationType] = useState<'checkout' | 'calendar'>('checkout');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (existingSchedule) {
      setIsEnabled(existingSchedule.isEnabled);
      setFrequencyType(existingSchedule.frequencyType);
      if (existingSchedule.dayOfWeek !== undefined) setDayOfWeek(existingSchedule.dayOfWeek);
      if (existingSchedule.dayOfMonth !== undefined) setDayOfMonth(existingSchedule.dayOfMonth);
      setTimeOfDay(existingSchedule.timeOfDay || '09:00');
      if (existingSchedule.biweeklyWeek) setBiweeklyWeek(existingSchedule.biweeklyWeek);
      setCalculationType(existingSchedule.calculationType || 'checkout');
    } else {
      setIsEnabled(true);
      setFrequencyType('weekly');
      setDayOfWeek(5);
      setDayOfMonth(1);
      setTimeOfDay('09:00');
      setBiweeklyWeek('A');
      setCalculationType('checkout');
    }
  }, [existingSchedule, isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        tagName,
        isEnabled,
        frequencyType,
        dayOfWeek: frequencyType !== 'monthly' ? dayOfWeek : undefined,
        dayOfMonth: frequencyType === 'monthly' ? dayOfMonth : undefined,
        timeOfDay,
        biweeklyWeek: frequencyType === 'biweekly' ? biweeklyWeek : undefined,
        calculationType
      });
      onClose();
    } catch (error) {
      console.error('Failed to save schedule:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    } finally {
      setDeleting(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const getSummary = () => {
    const time = formatTime(timeOfDay);
    if (frequencyType === 'weekly') return `Every ${DAYS_OF_WEEK[dayOfWeek]} at ${time}`;
    if (frequencyType === 'biweekly') return `Every other ${DAYS_OF_WEEK[dayOfWeek]} at ${time}`;
    return `${getOrdinal(dayOfMonth)} of each month at ${time}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Schedule Reminder</h2>
              <p className="text-sm text-gray-500">{tagName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable Reminder</span>
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {isEnabled && (
            <>
              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                <div className="flex gap-2">
                  {[
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'biweekly', label: 'Bi-weekly' },
                    { value: 'monthly', label: 'Monthly' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFrequencyType(opt.value as any)}
                      className={`flex-1 py-2 text-sm font-medium rounded-md border transition-colors ${
                        frequencyType === opt.value
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day Selection */}
              {frequencyType !== 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
                  <div className="flex gap-1">
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <button
                        key={idx}
                        onClick={() => setDayOfWeek(idx)}
                        className={`flex-1 py-2 text-xs font-medium rounded border transition-colors ${
                          dayOfWeek === idx
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bi-weekly Week */}
              {frequencyType === 'biweekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Week</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'A', label: 'Odd weeks' },
                      { value: 'B', label: 'Even weeks' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setBiweeklyWeek(opt.value as 'A' | 'B')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md border transition-colors ${
                          biweeklyWeek === opt.value
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Day */}
              {frequencyType === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day of Month</label>
                  <select
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>{getOrdinal(day)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Calculation Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Calculation Type</label>
                <div className="flex gap-2">
                  {[
                    { value: 'checkout', label: 'Checkout', desc: 'Full amount on checkout date' },
                    { value: 'calendar', label: 'Calendar', desc: 'Pro-rated by nights' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setCalculationType(opt.value as 'checkout' | 'calendar')}
                      className={`flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                        calculationType === opt.value
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {calculationType === 'checkout'
                    ? 'Revenue counted when guest checks out within the period'
                    : 'Revenue pro-rated based on nights within the period'}
                </p>
              </div>

              {/* Summary */}
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-md">
                <Calendar className="w-4 h-4 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-700">{getSummary()}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Draft statements auto-generated using each listing's last calculation type (or this default if none).
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50">
          <div>
            {existingSchedule && onDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {deleting ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TagScheduleModal;
