import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Tag, Check, ChevronDown } from 'lucide-react';
import { Owner, Property, Listing } from '../types';
import { listingsAPI } from '../services/api';
import { useToast } from './ui/toast';

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
  const [, setListings] = useState<Listing[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Progress tracking for multi-property generation
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });

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
      // If "default" owner is selected, show ALL properties
      if (ownerId === 'default') {
        setFilteredProperties(properties);
      } else {
        const ownerProperties = properties.filter(p => p.ownerId.toString() === ownerId);
        setFilteredProperties(ownerProperties);
      }
    } else {
      setFilteredProperties([]);
    }
    setSelectedPropertyIds([]); // Reset property selection when owner changes
    setPropertySearch(''); // Reset search when owner changes
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
    // Set default dates for current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
    
    // Load listings to get tags
    loadListings();
  }, []);
  
  const loadListings = async () => {
    try {
      const response = await listingsAPI.getListings();
      setListings(response.listings);
      
      // Extract unique tags from all listings
      const allTags = new Set<string>();
      response.listings.forEach((listing: Listing) => {
        if (listing.tags && listing.tags.length > 0) {
          listing.tags.forEach(tag => allTags.add(tag));
        }
      });
      const tagsArray = Array.from(allTags).sort();
      console.log('Available tags loaded:', tagsArray);
      setAvailableTags(tagsArray);
    } catch (error) {
      console.error('Failed to load listings:', error);
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

      // Generate separate statement for each selected property with progress
      if (selectedPropertyIds.length > 0) {
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
            // Continue with next property even if one fails
          }
        }
      } else {
        // No specific properties selected - generate for all or by tag
        setGenerationProgress({ current: 0, total: 1 });
        await onGenerate({
          ownerId: generateAll ? 'all' : ownerId,
          tag: selectedTag || undefined,
          startDate,
          endDate,
          calculationType,
        });
      }

      // Reset form and close modal on success
      setOwnerId('');
      setSelectedPropertyIds([]);
      setSelectedTag('');
      setGenerateAll(false);
      setPropertySearch('');
      setGenerationProgress({ current: 0, total: 0 });
      setIsGenerating(false);
      onClose();
    } catch (error) {
      console.error('Error generating statement:', error);
      setGenerationProgress({ current: 0, total: 0 });
      setIsGenerating(false);
      // Don't close modal on error so user can try again
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Generate Statement</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Generate All Checkbox */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={generateAll}
                onChange={(e) => {
                  setGenerateAll(e.target.checked);
                  if (e.target.checked) {
                    setOwnerId('');
                    setSelectedPropertyIds([]);
                  }
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-3 text-sm font-medium text-gray-900">
                Generate statements for all owners and their properties
              </span>
            </label>
            {generateAll && (
              <p className="mt-2 text-xs text-blue-700">
                This will create a separate statement for each property owned by each owner using the dates selected below.
              </p>
            )}
          </div>

          {!generateAll && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Owner *
                </label>
                <div className="relative" ref={ownerDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span className={ownerId ? 'text-gray-900' : 'text-gray-500'}>
                      {ownerId
                        ? owners.find(o => o.id.toString() === ownerId)?.name || 'Select Owner'
                        : 'Select Owner'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Custom Owner Dropdown */}
                  {isOwnerDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-hidden">
                      {/* Search Input */}
                      <div className="p-2 border-b border-gray-200">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <input
                            type="text"
                            placeholder="Search owners..."
                            value={ownerSearch}
                            onChange={(e) => setOwnerSearch(e.target.value)}
                            className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* Owner List */}
                      <div className="max-h-48 overflow-y-auto">
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
                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between border-b border-gray-100 last:border-b-0 ${
                                ownerId === owner.id.toString() ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                              }`}
                            >
                              <span className="text-sm">{owner.name}</span>
                              {ownerId === owner.id.toString() && <Check className="w-4 h-4 text-blue-600" />}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Properties (Optional - Select multiple)
                </label>
                <div className="space-y-2">
                  {/* Search Input - Only show if owner is selected and has properties */}
                  {ownerId && filteredProperties.length > 0 && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          placeholder="Search properties..."
                          value={propertySearch}
                          onChange={(e) => setPropertySearch(e.target.value)}
                          className="w-full border border-gray-300 rounded-md pl-10 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {propertySearch && (
                          <button
                            onClick={() => setPropertySearch('')}
                            type="button"
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                          >
                            X
                          </button>
                        )}
                      </div>

                      {/* Select All / Clear buttons */}
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={selectAllProperties}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Select All ({searchFilteredProperties.length})
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          type="button"
                          onClick={clearPropertySelection}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          Clear Selection
                        </button>
                        {selectedPropertyIds.length > 0 && (
                          <span className="ml-auto text-blue-600 font-medium">
                            {selectedPropertyIds.length} selected
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Property List with checkboxes */}
                  {ownerId ? (
                    <div className="border border-gray-300 rounded-md max-h-40 overflow-y-auto">
                      {searchFilteredProperties.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 italic">
                          {propertySearch ? `No properties found matching "${propertySearch}"` : 'No properties available'}
                        </div>
                      ) : (
                        searchFilteredProperties.map((property) => (
                          <label
                            key={property.id}
                            className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                              selectedPropertyIds.includes(property.id.toString()) ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center ${
                              selectedPropertyIds.includes(property.id.toString())
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-300'
                            }`}>
                              {selectedPropertyIds.includes(property.id.toString()) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <span className="text-sm text-gray-700 truncate">
                              {property.nickname || property.name}
                            </span>
                            <span className="ml-auto text-xs text-gray-400">
                              ID: {property.id}
                            </span>
                            <input
                              type="checkbox"
                              checked={selectedPropertyIds.includes(property.id.toString())}
                              onChange={() => togglePropertySelection(property.id.toString())}
                              className="sr-only"
                            />
                          </label>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-500 bg-gray-50">
                      Select an owner first
                    </div>
                  )}

                  {selectedPropertyIds.length === 0 && ownerId && (
                    <p className="text-xs text-gray-500">
                      Leave empty to generate for all properties
                    </p>
                  )}
                </div>
              </div>

              {/* Tag Filter */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <label className="flex items-center text-sm font-medium text-blue-900 mb-2">
                  <Tag className="w-4 h-4 mr-2" />
                  Filter by Tag (Optional)
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => {
                    setSelectedTag(e.target.value);
                    // Clear property selection when tag is selected
                    if (e.target.value) {
                      setSelectedPropertyIds([]);
                    }
                  }}
                  className="w-full border border-blue-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  disabled={!ownerId}
                >
                  <option value="">
                    {availableTags.length === 0 ? 'No tags available' : 'All Tags'}
                  </option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                {selectedTag && (
                  <p className="text-xs text-blue-700 mt-2">
                    Will generate statements for all properties with the "{selectedTag}" tag
                  </p>
                )}
                {availableTags.length === 0 && (
                  <p className="text-xs text-blue-700 mt-2">
                    No tags found. You can add tags to listings in the Listings page.
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date *
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Calculation Method *
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="calculationType"
                  value="checkout"
                  checked={calculationType === 'checkout'}
                  onChange={(e) => setCalculationType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">
                  <strong>Check-out Based</strong> - Include reservations that check out during the period
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="calculationType"
                  value="calendar"
                  checked={calculationType === 'calendar'}
                  onChange={(e) => setCalculationType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">
                  <strong>Calendar Based</strong> - Prorate reservations by days in the period
                </span>
              </label>
            </div>
            {calculationType === 'calendar' && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                <strong>Note:</strong> Reservations will be prorated based on how many days fall within the selected period. 
                For example, a 3-night stay with 2 nights in the period will contribute 2/3 of its revenue.
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate</span>
              )}
            </button>
          </div>
        </form>

        {/* Loading Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white bg-opacity-95 flex flex-col items-center justify-center rounded-lg">
            <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg font-semibold text-gray-900 mb-1">
              {generateAll ? 'Generating Statements for All Owners...' : 'Generating Statement...'}
            </p>
            {generationProgress.total > 1 ? (
              <>
                <p className="text-sm text-blue-600 font-medium mb-2">
                  {generationProgress.current} of {generationProgress.total} statements
                </p>
                {/* Progress bar */}
                <div className="w-48 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                  ></div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                This may take a few moments
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GenerateModal;
