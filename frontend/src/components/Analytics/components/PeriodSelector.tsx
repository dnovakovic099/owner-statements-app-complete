import React from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { cn } from '../../../lib/utils';

export interface PeriodConfig {
  startDate: string;
  endDate: string;
  comparisonType: 'previous-period' | 'same-period-last-year' | 'custom-range';
  comparisonStartDate?: string;
  comparisonEndDate?: string;
}

interface PeriodSelectorProps {
  onPeriodChange: (period: PeriodConfig) => void;
  className?: string;
}

type PresetType = 'this-week' | 'this-month' | 'this-quarter' | 'ytd' | 'custom';
type ComparisonType = 'previous-period' | 'same-period-last-year' | 'custom-range';

const PRESET_OPTIONS: { key: PresetType; label: string }[] = [
  { key: 'this-week', label: 'This Week' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-quarter', label: 'This Quarter' },
  { key: 'ytd', label: 'YTD' },
  { key: 'custom', label: 'Custom' },
];

const COMPARISON_OPTIONS: { key: ComparisonType; label: string }[] = [
  { key: 'previous-period', label: 'vs Previous Period' },
  { key: 'same-period-last-year', label: 'vs Same Period Last Year' },
  { key: 'custom-range', label: 'vs Custom Range' },
];

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ onPeriodChange, className }) => {
  const [activePreset, setActivePreset] = React.useState<PresetType>('this-month');
  const [comparisonType, setComparisonType] = React.useState<ComparisonType>('previous-period');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [comparisonStartDate, setComparisonStartDate] = React.useState('');
  const [comparisonEndDate, setComparisonEndDate] = React.useState('');

  // Format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Get the start of the week (Sunday)
  const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Get the end of the week (Saturday)
  const getEndOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() + (6 - day);
    return new Date(d.setDate(diff));
  };

  // Calculate dates based on preset
  const getPresetDates = (preset: PresetType): { start: string; end: string } => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const quarter = Math.floor(month / 3);

    switch (preset) {
      case 'this-week':
        return {
          start: formatLocalDate(getStartOfWeek(today)),
          end: formatLocalDate(getEndOfWeek(today)),
        };
      case 'this-month':
        return {
          start: formatLocalDate(new Date(year, month, 1)),
          end: formatLocalDate(new Date(year, month + 1, 0)),
        };
      case 'this-quarter':
        return {
          start: formatLocalDate(new Date(year, quarter * 3, 1)),
          end: formatLocalDate(new Date(year, (quarter + 1) * 3, 0)),
        };
      case 'ytd':
        return {
          start: formatLocalDate(new Date(year, 0, 1)),
          end: formatLocalDate(today),
        };
      default:
        return { start: startDate, end: endDate };
    }
  };

  // Calculate comparison dates based on primary period and comparison type
  const calculateComparisonDates = (
    primaryStart: string,
    primaryEnd: string,
    compType: ComparisonType
  ): { start: string; end: string } => {
    if (compType === 'custom-range') {
      return { start: comparisonStartDate, end: comparisonEndDate };
    }

    const start = new Date(primaryStart + 'T00:00:00');
    const end = new Date(primaryEnd + 'T00:00:00');
    const durationMs = end.getTime() - start.getTime();

    if (compType === 'previous-period') {
      // Go back by the same duration
      const compEnd = new Date(start.getTime() - 86400000); // Day before primary start
      const compStart = new Date(compEnd.getTime() - durationMs);
      return {
        start: formatLocalDate(compStart),
        end: formatLocalDate(compEnd),
      };
    }

    if (compType === 'same-period-last-year') {
      // Same dates, one year earlier
      const compStart = new Date(start);
      compStart.setFullYear(start.getFullYear() - 1);
      const compEnd = new Date(end);
      compEnd.setFullYear(end.getFullYear() - 1);
      return {
        start: formatLocalDate(compStart),
        end: formatLocalDate(compEnd),
      };
    }

    return { start: '', end: '' };
  };

  // Emit period configuration whenever relevant state changes
  React.useEffect(() => {
    if (startDate && endDate) {
      const compDates = calculateComparisonDates(startDate, endDate, comparisonType);
      const config: PeriodConfig = {
        startDate,
        endDate,
        comparisonType,
        comparisonStartDate: compDates.start,
        comparisonEndDate: compDates.end,
      };
      onPeriodChange(config);
    }
  }, [startDate, endDate, comparisonType, comparisonStartDate, comparisonEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize with default preset
  React.useEffect(() => {
    const dates = getPresetDates('this-month');
    setStartDate(dates.start);
    setEndDate(dates.end);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle preset button click
  const handlePresetClick = (preset: PresetType) => {
    setActivePreset(preset);
    if (preset !== 'custom') {
      const dates = getPresetDates(preset);
      setStartDate(dates.start);
      setEndDate(dates.end);
    }
  };

  // Handle custom date changes
  const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
    setActivePreset('custom');
    if (field === 'start') {
      setStartDate(value);
    } else {
      setEndDate(value);
    }
  };

  // Handle comparison type change
  const handleComparisonTypeChange = (value: ComparisonType) => {
    setComparisonType(value);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Period Presets */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Period
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg border transition-all',
                activePreset === preset.key
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range */}
      {activePreset === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />
              Start Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => handleCustomDateChange('start', e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />
              End Date
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => handleCustomDateChange('end', e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Comparison Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Compare To
        </label>
        <Select value={comparisonType} onValueChange={handleComparisonTypeChange}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select comparison" />
          </SelectTrigger>
          <SelectContent>
            {COMPARISON_OPTIONS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Custom Comparison Range */}
      {comparisonType === 'custom-range' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div>
            <label className="block text-xs font-medium text-amber-900 mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />
              Comparison Start Date
            </label>
            <Input
              type="date"
              value={comparisonStartDate}
              onChange={(e) => setComparisonStartDate(e.target.value)}
              className="w-full bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-amber-900 mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />
              Comparison End Date
            </label>
            <Input
              type="date"
              value={comparisonEndDate}
              onChange={(e) => setComparisonEndDate(e.target.value)}
              className="w-full bg-white"
            />
          </div>
        </div>
      )}

      {/* Summary Display */}
      {startDate && endDate && (
        <div className="text-xs text-gray-600 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="font-medium text-blue-900 mb-1">Selected Period:</div>
          <div>
            {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            {' - '}
            {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          {comparisonType !== 'custom-range' && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <span className="font-medium text-blue-900">
                {COMPARISON_OPTIONS.find((o) => o.key === comparisonType)?.label}
              </span>
            </div>
          )}
          {comparisonType === 'custom-range' && comparisonStartDate && comparisonEndDate && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <div className="font-medium text-blue-900 mb-1">vs Custom Range:</div>
              <div>
                {new Date(comparisonStartDate + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {' - '}
                {new Date(comparisonEndDate + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PeriodSelector;
