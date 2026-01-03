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

const PRESET_OPTIONS: { key: Preset; label: string; shortLabel?: string }[] = [
  { key: 'last-30-days', label: 'Last 30 days', shortLabel: 'L30D' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-quarter', label: 'This quarter', shortLabel: 'This Q' },
  { key: 'last-quarter', label: 'Last quarter', shortLabel: 'Last Q' },
  { key: 'last-3-months', label: 'Last 3 months', shortLabel: 'L3M' },
  { key: 'last-6-months', label: 'Last 6 months', shortLabel: 'L6M' },
  { key: 'this-year', label: 'This year' },
  { key: 'last-year', label: 'Last year' },
];

// Quick access buttons shown in the pill bar
const QUICK_PRESETS: Preset[] = ['this-month', 'last-month', 'last-3-months', 'last-6-months', 'this-year'];

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ dateRange, onDateRangeChange }) => {
  const [activePreset, setActivePreset] = React.useState<Preset>('this-month');
  const [isCustomOpen, setIsCustomOpen] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

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
          startDate: thirtyDaysAgo.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      case 'this-month':
        return {
          startDate: new Date(year, month, 1).toISOString().split('T')[0],
          endDate: new Date(year, month + 1, 0).toISOString().split('T')[0],
        };
      case 'last-month':
        return {
          startDate: new Date(year, month - 1, 1).toISOString().split('T')[0],
          endDate: new Date(year, month, 0).toISOString().split('T')[0],
        };
      case 'this-quarter':
        return {
          startDate: new Date(year, quarter * 3, 1).toISOString().split('T')[0],
          endDate: new Date(year, (quarter + 1) * 3, 0).toISOString().split('T')[0],
        };
      case 'last-quarter':
        const lastQuarter = quarter === 0 ? 3 : quarter - 1;
        const lastQuarterYear = quarter === 0 ? year - 1 : year;
        return {
          startDate: new Date(lastQuarterYear, lastQuarter * 3, 1).toISOString().split('T')[0],
          endDate: new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0).toISOString().split('T')[0],
        };
      case 'last-3-months':
        return {
          startDate: new Date(year, month - 2, 1).toISOString().split('T')[0],
          endDate: new Date(year, month + 1, 0).toISOString().split('T')[0],
        };
      case 'last-6-months':
        return {
          startDate: new Date(year, month - 5, 1).toISOString().split('T')[0],
          endDate: new Date(year, month + 1, 0).toISOString().split('T')[0],
        };
      case 'this-year':
        return {
          startDate: new Date(year, 0, 1).toISOString().split('T')[0],
          endDate: new Date(year, 11, 31).toISOString().split('T')[0],
        };
      case 'last-year':
        return {
          startDate: new Date(year - 1, 0, 1).toISOString().split('T')[0],
          endDate: new Date(year - 1, 11, 31).toISOString().split('T')[0],
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
    // Set default to this month on mount
    const defaultRange = getPresetDates('this-month');
    onDateRangeChange(defaultRange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 max-w-full">
      {/* Compact pill buttons for quick presets */}
      <div className="hidden sm:flex items-center gap-1.5">
        {QUICK_PRESETS.map((presetKey) => {
          const preset = PRESET_OPTIONS.find(p => p.key === presetKey);
          if (!preset) return null;
          return (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap
                border
                ${activePreset === preset.key
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }
              `}
            >
              {preset.shortLabel || preset.label}
            </button>
          );
        })}

        {/* Custom dropdown with date pickers */}
        <DropdownMenu open={isCustomOpen} onOpenChange={setIsCustomOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={`
                px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap
                inline-flex items-center gap-1.5 border
                ${activePreset === 'custom'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }
              `}
            >
              <Calendar className="w-3.5 h-3.5" />
              Custom
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 p-4"
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('input[type="date"]')) {
                e.preventDefault();
              }
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Calendar className="w-4 h-4 text-blue-500" />
                Custom Date Range
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

              <DropdownMenuSeparator />

              {/* Quick select options */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 mb-2">Quick Select</p>
                <div className="grid grid-cols-2 gap-1">
                  {PRESET_OPTIONS.filter(p => !QUICK_PRESETS.includes(p.key)).map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => handlePresetClick(preset.key)}
                      className={`
                        flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left
                        ${activePreset === preset.key
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                        }
                      `}
                    >
                      {activePreset === preset.key && <Check className="w-3 h-3" />}
                      <span className={activePreset === preset.key ? '' : 'ml-5'}>{preset.label}</span>
                    </button>
                  ))}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: Single dropdown with all options */}
      <div className="sm:hidden">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="
                px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap
                inline-flex items-center gap-1.5 border bg-white text-gray-700
                border-gray-200 hover:bg-gray-50 hover:border-gray-300
              "
            >
              <Calendar className="w-3.5 h-3.5" />
              {getActiveLabel()}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {PRESET_OPTIONS.map((preset) => (
              <DropdownMenuItem
                key={preset.key}
                onClick={() => handlePresetClick(preset.key)}
                className="flex items-center gap-2"
              >
                {activePreset === preset.key && <Check className="w-4 h-4 text-green-600" />}
                <span className={activePreset === preset.key ? 'font-medium' : 'ml-6'}>
                  {preset.label}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setIsDropdownOpen(false);
                setIsCustomOpen(true);
              }}
              className="flex items-center gap-2"
            >
              {activePreset === 'custom' && <Check className="w-4 h-4 text-green-600" />}
              <span className={activePreset === 'custom' ? 'font-medium' : 'ml-6'}>
                Custom range...
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default DateRangeFilter;
