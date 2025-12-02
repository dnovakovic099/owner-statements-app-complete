import React, { useState, useEffect, useRef } from 'react';
import { Search, Tag, Check, ChevronDown, Calendar, Building2, Users, Loader2, X } from 'lucide-react';
import { Owner, Property, Listing } from '../types';
import { listingsAPI } from '../services/api';
import { useToast } from './ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface GenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: { ownerId: string; propertyId?: string; propertyIds?: string[]; tag?: string; startDate: string; endDate: string; calculationType: string }) => Promise<void>;
  owners: Owner[];
  properties: Property[];
}

const GenerateModal: React.FC<GenerateModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  owners,
  properties,
}) => {
  const { showToast } = useToast();
  const [ownerId, setOwnerId] = useState('');
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [calculationType, setCalculationType] = useState('checkout');
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [generateAll, setGenerateAll] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Progress tracking for multi-property generation
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });

  // Combined statement toggle - when true, generate ONE statement for all selected properties
  const [generateCombined, setGenerateCombined] = useState(true);

  // Owner dropdown state
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  // Close owner dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setIsOwnerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter owners based on search
  const filteredOwners = owners.filter((owner) => {
    if (!ownerSearch) return true;
    return owner.name.toLowerCase().includes(ownerSearch.toLowerCase());
  });

  useEffect(() => {
    if (ownerId) {
      if (ownerId === 'default') {
        setFilteredProperties(properties);
      } else {
        const ownerProperties = properties.filter(p => p.ownerId.toString() === ownerId);
        setFilteredProperties(ownerProperties);
      }
    } else {
      setFilteredProperties([]);
    }
    setSelectedPropertyIds([]);
    setPropertySearch('');
  }, [ownerId, properties]);

  // Filter properties based on search
  const searchFilteredProperties = filteredProperties.filter((property) => {
    if (!propertySearch) return true;
    const searchLower = propertySearch.toLowerCase();
    return (
      property.name.toLowerCase().includes(searchLower) ||
      property.nickname?.toLowerCase().includes(searchLower) ||
      property.id.toString().includes(searchLower)
    );
  });

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);

    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      const response = await listingsAPI.getListings();
      // Extract unique tags from listings
      const allTags = new Set<string>();
      response.listings.forEach((listing: Listing) => {
        if (listing.tags && listing.tags.length > 0) {
          listing.tags.forEach(tag => allTags.add(tag));
        }
      });
      setAvailableTags(Array.from(allTags).sort());
    } catch {
      // Tags will remain empty if listings fail to load
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!generateAll && !ownerId) {
      showToast('Please select an owner', 'error');
      return;
    }

    if (!startDate || !endDate) {
      showToast('Please select start date and end date', 'error');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showToast('Start date must be before end date', 'error');
      return;
    }

    try {
      setIsGenerating(true);

      if (selectedPropertyIds.length > 0) {
        if (generateCombined && selectedPropertyIds.length > 1) {
          setGenerationProgress({ current: 0, total: 1 });
          await onGenerate({
            ownerId: generateAll ? 'all' : ownerId,
            propertyIds: selectedPropertyIds,
            tag: selectedTag || undefined,
            startDate,
            endDate,
            calculationType,
          });
        } else {
          const total = selectedPropertyIds.length;
          setGenerationProgress({ current: 0, total });

          for (let i = 0; i < selectedPropertyIds.length; i++) {
            const propId = selectedPropertyIds[i];
            setGenerationProgress({ current: i + 1, total });

            try {
              await onGenerate({
                ownerId: generateAll ? 'all' : ownerId,
                propertyId: propId,
                tag: selectedTag || undefined,
                startDate,
                endDate,
                calculationType,
              });
            } catch (err) {
              console.error(`Error generating statement for property ${propId}:`, err);
            }
          }
        }
      } else {
        setGenerationProgress({ current: 0, total: 1 });
        await onGenerate({
          ownerId: generateAll ? 'all' : ownerId,
          tag: selectedTag || undefined,
          startDate,
          endDate,
          calculationType,
        });
      }

      setOwnerId('');
      setSelectedPropertyIds([]);
      setSelectedTag('');
      setGenerateAll(false);
      setGenerateCombined(true);
      setPropertySearch('');
      setGenerationProgress({ current: 0, total: 0 });
      setIsGenerating(false);
      onClose();
    } catch (error) {
      console.error('Error generating statement:', error);
      setGenerationProgress({ current: 0, total: 0 });
      setIsGenerating(false);
    }
  };

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds(prev => {
      if (prev.includes(propertyId)) {
        return prev.filter(id => id !== propertyId);
      } else {
        return [...prev, propertyId];
      }
    });
  };

  const selectAllProperties = () => {
    const allIds = searchFilteredProperties.map(p => p.id.toString());
    setSelectedPropertyIds(allIds);
  };

  const clearPropertySelection = () => {
    setSelectedPropertyIds([]);
  };

  const setQuickDate = (type: 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const today = new Date();
    let firstDay: Date, lastDay: Date;

    switch (type) {
      case 'thisMonth':
        firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisYear':
        firstDay = new Date(today.getFullYear(), 0, 1);
        lastDay = new Date(today.getFullYear(), 11, 31);
        break;
    }

    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden" hideCloseButton>
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 rounded-lg p-2">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-semibold text-white">
                Generate Owner Statement
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Generate All Banner */}
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="generateAll"
                checked={generateAll}
                onCheckedChange={(checked: boolean | 'indeterminate') => {
                  setGenerateAll(checked === true);
                  if (checked) {
                    setOwnerId('');
                    setSelectedPropertyIds([]);
                  }
                }}
              />
              <Label htmlFor="generateAll" className="cursor-pointer text-sm font-medium text-gray-900">
                Generate statements for all owners and their properties
              </Label>
              {generateAll && (
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  Bulk Mode
                </span>
              )}
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-220px)]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT COLUMN - Owner & Properties */}
              <div className="space-y-5">
                <div className="flex items-center space-x-2 text-gray-700 font-medium border-b pb-2">
                  <Users className="w-4 h-4" />
                  <span>Owner & Properties</span>
                </div>

                {!generateAll ? (
                  <>
                    {/* Owner Selection */}
                    <div className="space-y-2">
                      <Label>Owner <span className="text-red-500">*</span></Label>
                      <div className="relative" ref={ownerDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
                          className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <span className={ownerId ? 'text-gray-900' : 'text-gray-500'}>
                            {ownerId
                              ? owners.find(o => o.id.toString() === ownerId)?.name || 'Select Owner'
                              : 'Select Owner'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isOwnerDropdownOpen && (
                          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                            <div className="p-2 border-b">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                  placeholder="Search owners..."
                                  value={ownerSearch}
                                  onChange={(e) => setOwnerSearch(e.target.value)}
                                  className="pl-10"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            <ScrollArea className="max-h-48">
                              {filteredOwners.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                                  No owners found
                                </div>
                              ) : (
                                filteredOwners.map((owner) => (
                                  <div
                                    key={owner.id}
                                    onClick={() => {
                                      setOwnerId(owner.id.toString());
                                      setIsOwnerDropdownOpen(false);
                                      setOwnerSearch('');
                                    }}
                                    className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between ${
                                      ownerId === owner.id.toString() ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                                    }`}
                                  >
                                    <span className="text-sm">{owner.name}</span>
                                    {ownerId === owner.id.toString() && <Check className="w-4 h-4 text-blue-600" />}
                                  </div>
                                ))
                              )}
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Property Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center space-x-1">
                          <Building2 className="w-4 h-4" />
                          <span>Properties</span>
                          <span className="text-gray-400 font-normal">(Select multiple)</span>
                        </Label>
                        {selectedPropertyIds.length > 0 && (
                          <span className="text-blue-600 text-xs font-medium bg-blue-50 px-2 py-0.5 rounded-full">
                            {selectedPropertyIds.length} selected
                          </span>
                        )}
                      </div>

                      {ownerId && filteredProperties.length > 0 && (
                        <>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="Search properties..."
                              value={propertySearch}
                              onChange={(e) => setPropertySearch(e.target.value)}
                              className="pl-10"
                            />
                          </div>
                          <div className="flex gap-2 text-xs">
                            <button type="button" onClick={selectAllProperties} className="text-blue-600 hover:text-blue-800 font-medium">
                              Select All ({searchFilteredProperties.length})
                            </button>
                            <span className="text-gray-300">|</span>
                            <button type="button" onClick={clearPropertySelection} className="text-gray-600 hover:text-gray-800">
                              Clear
                            </button>
                          </div>
                        </>
                      )}

                      {ownerId ? (
                        <ScrollArea className="h-48 border rounded-md">
                          {searchFilteredProperties.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-gray-500 text-center">
                              {propertySearch ? `No properties found matching "${propertySearch}"` : 'No properties available'}
                            </div>
                          ) : (
                            <div className="p-1">
                              {searchFilteredProperties.map((property) => (
                                <label
                                  key={property.id}
                                  className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 rounded-md transition-colors ${
                                    selectedPropertyIds.includes(property.id.toString()) ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedPropertyIds.includes(property.id.toString())}
                                    onCheckedChange={() => togglePropertySelection(property.id.toString())}
                                    className="mr-3"
                                  />
                                  <span className="text-sm text-gray-700 truncate flex-1">
                                    {property.nickname || property.name}
                                  </span>
                                  <span className="ml-2 text-xs text-gray-400">#{property.id}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      ) : (
                        <div className="border rounded-md px-3 py-4 text-sm text-gray-500 bg-gray-50 text-center">
                          Select an owner first to see their properties
                        </div>
                      )}

                      {selectedPropertyIds.length === 0 && ownerId && (
                        <p className="text-xs text-gray-500">Leave empty to generate for all properties</p>
                      )}

                      {selectedPropertyIds.length > 1 && (
                        <div className="bg-green-50 border border-green-200 rounded-md p-3">
                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id="generateCombined"
                              checked={generateCombined}
                              onCheckedChange={(checked: boolean | 'indeterminate') => setGenerateCombined(checked === true)}
                              className="mt-0.5"
                            />
                            <div>
                              <Label htmlFor="generateCombined" className="cursor-pointer text-sm font-medium text-green-900">
                                Generate combined statement
                              </Label>
                              <p className="text-xs text-green-700 mt-0.5">
                                {generateCombined
                                  ? `Create ONE statement for all ${selectedPropertyIds.length} properties`
                                  : `Create ${selectedPropertyIds.length} separate statements`}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tag Filter */}
                    <div className="bg-gray-50 border rounded-md p-3 space-y-2">
                      <Label className="flex items-center">
                        <Tag className="w-4 h-4 mr-2" />
                        Filter by Tag <span className="text-gray-400 font-normal ml-1">(Optional)</span>
                      </Label>
                      <Select
                        value={selectedTag}
                        onValueChange={(value: string) => {
                          setSelectedTag(value === 'all' ? '' : value);
                          if (value && value !== 'all') {
                            setSelectedPropertyIds([]);
                          }
                        }}
                        disabled={!ownerId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={availableTags.length === 0 ? 'No tags available' : 'All Tags'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Tags</SelectItem>
                          {availableTags.map((tag) => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
                    <div className="text-blue-600 font-medium mb-1">Bulk Generation Mode</div>
                    <p className="text-sm text-blue-700">
                      A separate statement will be generated for each property owned by each owner.
                    </p>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN - Date Range & Calculation */}
              <div className="space-y-5">
                <div className="flex items-center space-x-2 text-gray-700 font-medium border-b pb-2">
                  <Calendar className="w-4 h-4" />
                  <span>Statement Period & Settings</span>
                </div>

                {/* Date Range */}
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Start Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        max={endDate && endDate < new Date().toISOString().split('T')[0] ? endDate : new Date().toISOString().split('T')[0]}
                        required
                        className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        End Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate || undefined}
                        max={new Date().toISOString().split('T')[0]}
                        required
                        className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Quick Date Presets */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 mr-1">Quick select:</span>
                    <button
                      type="button"
                      onClick={() => setQuickDate('thisMonth')}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate('lastMonth')}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate('thisYear')}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      This Year
                    </button>
                  </div>
                </div>

                {/* Calculation Method */}
                <div className="space-y-3">
                  <Label>Calculation Method <span className="text-red-500">*</span></Label>
                  <div className="space-y-2">
                    <label className={`flex items-start p-3 border rounded-md cursor-pointer transition-all ${
                      calculationType === 'checkout'
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="calculationType"
                        value="checkout"
                        checked={calculationType === 'checkout'}
                        onChange={(e) => setCalculationType(e.target.value)}
                        className="mt-0.5 mr-3"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Check-out Based</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Include reservations that check out during the period
                        </div>
                      </div>
                    </label>
                    <label className={`flex items-start p-3 border rounded-md cursor-pointer transition-all ${
                      calculationType === 'calendar'
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="calculationType"
                        value="calendar"
                        checked={calculationType === 'calendar'}
                        onChange={(e) => setCalculationType(e.target.value)}
                        className="mt-0.5 mr-3"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Calendar Based</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Prorate reservations by days in the period
                        </div>
                      </div>
                    </label>
                  </div>
                  {calculationType === 'calendar' && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                      <strong>Note:</strong> Revenue will be prorated. A 3-night stay with 2 nights in the period = 2/3 of revenue.
                    </div>
                  )}
                </div>

                {/* Summary Box */}
                {!generateAll && ownerId && (
                  <div className="bg-gray-50 border rounded-md p-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Summary</div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div className="flex justify-between">
                        <span>Owner:</span>
                        <span className="font-medium">{owners.find(o => o.id.toString() === ownerId)?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Properties:</span>
                        <span className="font-medium">
                          {selectedPropertyIds.length === 0
                            ? `All (${filteredProperties.length})`
                            : selectedPropertyIds.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Period:</span>
                        <span className="font-medium">{startDate} to {endDate}</span>
                      </div>
                      {selectedPropertyIds.length > 1 && (
                        <div className="flex justify-between">
                          <span>Output:</span>
                          <span className="font-medium text-green-600">
                            {generateCombined ? '1 Combined Statement' : `${selectedPropertyIds.length} Separate Statements`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 bg-gray-50 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isGenerating}>
              Cancel
            </Button>
            <Button type="submit" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Statement'
              )}
            </Button>
          </DialogFooter>
        </form>

        {/* Loading Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center z-50">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-4" />
            <p className="text-lg font-semibold text-gray-900 mb-1">
              {generateAll
                ? 'Generating Statements for All Owners...'
                : generateCombined && selectedPropertyIds.length > 1
                  ? `Generating Combined Statement for ${selectedPropertyIds.length} Properties...`
                  : 'Generating Statement...'}
            </p>
            {generationProgress.total > 1 ? (
              <>
                <p className="text-sm text-blue-600 font-medium mb-2">
                  {generationProgress.current} of {generationProgress.total} statements
                </p>
                <div className="w-64 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">This may take a few moments</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GenerateModal;
