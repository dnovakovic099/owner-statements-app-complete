import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Calendar, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

type Preset = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'this-year' | 'custom';

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ dateRange, onDateRangeChange }) => {
  const [activePreset, setActivePreset] = React.useState<Preset>('this-month');
  const [isCustomOpen, setIsCustomOpen] = React.useState(false);

  const getPresetDates = (preset: Preset): DateRange => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    switch (preset) {
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

  React.useEffect(() => {
    // Set default to this month on mount
    const defaultRange = getPresetDates('this-month');
    onDateRangeChange(defaultRange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 max-w-full">
      {/* Compact pill buttons for presets */}
      <div className="flex items-center gap-1.5">
        {[
          { key: 'this-month', label: 'This Month' },
          { key: 'last-month', label: 'Last Month' },
          { key: 'last-3-months', label: 'L3M' },
          { key: 'last-6-months', label: 'L6M' },
          { key: 'this-year', label: 'This Year' },
        ].map((preset) => (
          <button
            key={preset.key}
            onClick={() => handlePresetClick(preset.key as Preset)}
            className={`
              px-2.5 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap
              ${activePreset === preset.key && activePreset !== 'custom'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            {preset.label}
          </button>
        ))}

        {/* Custom date range dropdown */}
        <DropdownMenu open={isCustomOpen} onOpenChange={setIsCustomOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={`
                px-2.5 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap
                inline-flex items-center gap-1
                ${activePreset === 'custom'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              <Calendar className="w-3 h-3" />
              Custom
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 p-4"
            onInteractOutside={(e) => {
              // Prevent closing when clicking on date inputs
              const target = e.target as HTMLElement;
              if (target.closest('input[type="date"]')) {
                e.preventDefault();
              }
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Calendar className="w-4 h-4 text-gray-500" />
                Custom Date Range
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => handleDateChange('startDate', e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    End Date
                  </label>
                  <Input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleDateChange('endDate', e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => setIsCustomOpen(false)}
                  className="text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default DateRangeFilter;
