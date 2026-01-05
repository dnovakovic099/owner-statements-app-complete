import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

type Preset =
  | 'last-30-days'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'
  | 'last-year'
  | 'custom';

// QuickBooks-style preset options - grouped by "This" and "Last"
const PRESET_OPTIONS: { key: Preset; label: string; shortLabel?: string; group?: 'this' | 'last' | 'other' }[] = [
  { key: 'last-30-days', label: 'Last 30 days', shortLabel: 'L30D', group: 'other' },
  { key: 'this-month', label: 'This month', group: 'this' },
  { key: 'this-quarter', label: 'This quarter', shortLabel: 'This Q', group: 'this' },
  { key: 'this-year', label: 'This year', group: 'this' },
  { key: 'last-month', label: 'Last month', group: 'last' },
  { key: 'last-quarter', label: 'Last quarter', shortLabel: 'Last Q', group: 'last' },
  { key: 'last-year', label: 'Last year', group: 'last' },
  { key: 'last-3-months', label: 'Last 3 months', shortLabel: 'L3M', group: 'other' },
  { key: 'last-6-months', label: 'Last 6 months', shortLabel: 'L6M', group: 'other' },
];

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ dateRange, onDateRangeChange }) => {
  const [activePreset, setActivePreset] = React.useState<Preset>('last-month');
  const [isCustomOpen, setIsCustomOpen] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  // Format date as YYYY-MM-DD in local timezone (not UTC)
  const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getPresetDates = (preset: Preset): DateRange => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const quarter = Math.floor(month / 3);

    switch (preset) {
      case 'last-30-days':
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        return {
          startDate: formatLocalDate(thirtyDaysAgo),
          endDate: formatLocalDate(today),
        };
      case 'this-month':
        return {
          startDate: formatLocalDate(new Date(year, month, 1)),
          endDate: formatLocalDate(new Date(year, month + 1, 0)),
        };
      case 'last-month':
        return {
          startDate: formatLocalDate(new Date(year, month - 1, 1)),
          endDate: formatLocalDate(new Date(year, month, 0)),
        };
      case 'this-quarter':
        return {
          startDate: formatLocalDate(new Date(year, quarter * 3, 1)),
          endDate: formatLocalDate(new Date(year, (quarter + 1) * 3, 0)),
        };
      case 'last-quarter':
        const lastQuarter = quarter === 0 ? 3 : quarter - 1;
        const lastQuarterYear = quarter === 0 ? year - 1 : year;
        return {
          startDate: formatLocalDate(new Date(lastQuarterYear, lastQuarter * 3, 1)),
          endDate: formatLocalDate(new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0)),
        };
      case 'last-3-months':
        return {
          startDate: formatLocalDate(new Date(year, month - 2, 1)),
          endDate: formatLocalDate(new Date(year, month + 1, 0)),
        };
      case 'last-6-months':
        return {
          startDate: formatLocalDate(new Date(year, month - 5, 1)),
          endDate: formatLocalDate(new Date(year, month + 1, 0)),
        };
      case 'this-year':
        return {
          startDate: formatLocalDate(new Date(year, 0, 1)),
          endDate: formatLocalDate(new Date(year, 11, 31)),
        };
      case 'last-year':
        return {
          startDate: formatLocalDate(new Date(year - 1, 0, 1)),
          endDate: formatLocalDate(new Date(year - 1, 11, 31)),
        };
      default:
        return dateRange;
    }
  };

  const handlePresetClick = (preset: Preset) => {
    setActivePreset(preset);
    if (preset !== 'custom') {
      const newRange = getPresetDates(preset);
      onDateRangeChange(newRange);
      setIsCustomOpen(false);
      setIsDropdownOpen(false);
    } else {
      setIsCustomOpen(true);
    }
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setActivePreset('custom');
    onDateRangeChange({
      ...dateRange,
      [field]: value,
    });
  };

  const getActiveLabel = () => {
    if (activePreset === 'custom') {
      return 'Custom';
    }
    const option = PRESET_OPTIONS.find(o => o.key === activePreset);
    return option?.label || 'Select';
  };

  React.useEffect(() => {
    // Set default to last month on mount (most likely to have complete data)
    const defaultRange = getPresetDates('last-month');
    onDateRangeChange(defaultRange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 max-w-full">
      {/* QuickBooks-style dropdown */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="
              px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap
              inline-flex items-center gap-2 border bg-white text-gray-700
              border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm
            "
          >
            {getActiveLabel()}
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 py-1">
          {/* Last 30 days - top option */}
          <DropdownMenuItem
            onClick={() => handlePresetClick('last-30-days')}
            className="flex items-center gap-2 py-2.5 px-3 cursor-pointer"
          >
            {activePreset === 'last-30-days' ? (
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
            ) : (
              <span className="w-4" />
            )}
            <span className={activePreset === 'last-30-days' ? 'font-medium' : ''}>
              Last 30 days
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          {/* "This" period options */}
          {PRESET_OPTIONS.filter(p => p.group === 'this').map((preset) => (
            <DropdownMenuItem
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className="flex items-center gap-2 py-2.5 px-3 cursor-pointer"
            >
              {activePreset === preset.key ? (
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : (
                <span className="w-4" />
              )}
              <span className={activePreset === preset.key ? 'font-medium' : ''}>
                {preset.label}
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator className="my-1" />

          {/* "Last" period options */}
          {PRESET_OPTIONS.filter(p => p.group === 'last').map((preset) => (
            <DropdownMenuItem
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className="flex items-center gap-2 py-2.5 px-3 cursor-pointer"
            >
              {activePreset === preset.key ? (
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : (
                <span className="w-4" />
              )}
              <span className={activePreset === preset.key ? 'font-medium' : ''}>
                {preset.label}
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator className="my-1" />

          {/* Custom option */}
          <DropdownMenuItem
            onClick={() => {
              setIsDropdownOpen(false);
              setIsCustomOpen(true);
              setActivePreset('custom');
            }}
            className="flex items-center gap-2 py-2.5 px-3 cursor-pointer"
          >
            {activePreset === 'custom' ? (
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
            ) : (
              <span className="w-4" />
            )}
            <span className={activePreset === 'custom' ? 'font-medium' : ''}>
              Custom range
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom date range popover */}
      {isCustomOpen && (
        <div className="relative">
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsCustomOpen(false)}
          />
          <div className="absolute top-0 left-0 z-50 w-80 p-4 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  Custom Date Range
                </div>
                <button
                  onClick={() => setIsCustomOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => handleDateChange('startDate', e.target.value)}
                    className="w-full h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    End Date
                  </label>
                  <Input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleDateChange('endDate', e.target.value)}
                    className="w-full h-9 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => setIsCustomOpen(false)}
                  className="text-xs px-4"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show date range text */}
      {dateRange.startDate && dateRange.endDate && (
        <span className="text-sm text-gray-500 hidden sm:inline">
          {new Date(dateRange.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' - '}
          {new Date(dateRange.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      )}
    </div>
  );
};

export default DateRangeFilter;
