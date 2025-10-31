import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { Owner, Property } from '../types';

interface GenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: { ownerId: string; propertyId?: string; startDate: string; endDate: string; calculationType: string }) => void;
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
  const [ownerId, setOwnerId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [calculationType, setCalculationType] = useState('checkout');
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [generateAll, setGenerateAll] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');

  useEffect(() => {
    if (ownerId) {
      const ownerProperties = properties.filter(p => p.ownerId.toString() === ownerId);
      setFilteredProperties(ownerProperties);
    } else {
      setFilteredProperties([]);
    }
    setPropertyId(''); // Reset property selection when owner changes
    setPropertySearch(''); // Reset search when owner changes
  }, [ownerId, properties]);

  // Filter properties based on search
  const searchFilteredProperties = filteredProperties.filter((property) => {
    if (!propertySearch) return true;
    const searchLower = propertySearch.toLowerCase();
    return (
      property.name.toLowerCase().includes(searchLower) ||
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
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!generateAll && !ownerId) {
      alert('Please select an owner');
      return;
    }

    if (!startDate || !endDate) {
      alert('Please select start date and end date');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date must be before end date');
      return;
    }

    onGenerate({
      ownerId: generateAll ? 'all' : ownerId,
      propertyId: propertyId || undefined,
      startDate,
      endDate,
      calculationType,
    });

    // Reset form
    setOwnerId('');
    setPropertyId('');
    setGenerateAll(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
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
                    setPropertyId('');
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
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!generateAll}
                >
                  <option value="">Select Owner</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Property (Optional)
                </label>
                <div className="space-y-2">
                  {/* Search Input - Only show if owner is selected and has properties */}
                  {ownerId && filteredProperties.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search properties by name or ID..."
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
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Property Dropdown */}
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!ownerId}
                  >
                    <option value="">
                      {ownerId 
                        ? `All Properties (${searchFilteredProperties.length})` 
                        : 'Select an owner first'}
                    </option>
                    {searchFilteredProperties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} (ID: {property.id})
                      </option>
                    ))}
                  </select>
                  
                  {/* No results message */}
                  {ownerId && propertySearch && searchFilteredProperties.length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      No properties found matching "{propertySearch}"
                    </p>
                  )}
                </div>
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
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Generate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GenerateModal;
