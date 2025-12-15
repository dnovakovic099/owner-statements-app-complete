import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Save, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { listingsAPI } from '../services/api';
import { Listing } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface ListingsPageProps {
  onBack: () => void;
  initialSelectedListingId?: number | null;
}

const ListingsPage: React.FC<ListingsPageProps> = ({ onBack, initialSelectedListingId }) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(initialSelectedListingId || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Form state for selected listing
  const [displayName, setDisplayName] = useState('');
  const [isCohostOnAirbnb, setIsCohostOnAirbnb] = useState(false);
  const [airbnbPassThroughTax, setAirbnbPassThroughTax] = useState(false);
  const [disregardTax, setDisregardTax] = useState(false);
  const [cleaningFeePassThrough, setCleaningFeePassThrough] = useState(false);
  const [guestPaidDamageCoverage, setGuestPaidDamageCoverage] = useState(false);
  const [waiveCommission, setWaiveCommission] = useState(false);
  const [waiveCommissionUntil, setWaiveCommissionUntil] = useState<string>('');
  const [pmFeePercentage, setPmFeePercentage] = useState<number>(15);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    if (selectedListingId) {
      const listing = listings.find(l => l.id === selectedListingId);
      if (listing) {
        setDisplayName(listing.displayName || listing.nickname || listing.name || '');
        setIsCohostOnAirbnb(listing.isCohostOnAirbnb || false);
        setAirbnbPassThroughTax(listing.airbnbPassThroughTax || false);
        setDisregardTax(listing.disregardTax || false);
        setCleaningFeePassThrough(listing.cleaningFeePassThrough || false);
        setGuestPaidDamageCoverage(listing.guestPaidDamageCoverage || false);
        setWaiveCommission(listing.waiveCommission || false);
        setWaiveCommissionUntil(listing.waiveCommissionUntil || '');
        setPmFeePercentage(listing.pmFeePercentage || 15);
        setTags(listing.tags || []);
      }
    } else {
      resetForm();
    }
  }, [selectedListingId, listings]);

  const loadListings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listingsAPI.getListings();
      setListings(response.listings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSaveMessage(null);
      const response = await listingsAPI.syncListings();
      setSaveMessage({ 
        type: 'success', 
        text: `Synced ${response.synced} listings from Hostify` 
      });
      await loadListings();
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err) {
      setSaveMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to sync listings' 
      });
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    setDisplayName('');
    setIsCohostOnAirbnb(false);
    setAirbnbPassThroughTax(false);
    setDisregardTax(false);
    setCleaningFeePassThrough(false);
    setWaiveCommission(false);
    setWaiveCommissionUntil('');
    setPmFeePercentage(15);
    setTags([]);
    setNewTag('');
  };

  const handleSave = async () => {
    if (!selectedListingId) return;

    try {
      setSaving(true);
      setSaveMessage(null);

      const config = {
        displayName: displayName.trim() || undefined,
        isCohostOnAirbnb,
        airbnbPassThroughTax,
        disregardTax,
        cleaningFeePassThrough,
        guestPaidDamageCoverage,
        waiveCommission,
        waiveCommissionUntil: waiveCommissionUntil || null,
        pmFeePercentage,
        tags,
      };

      const response = await listingsAPI.updateListingConfig(selectedListingId, config);
      
      // Update the listing in local state
      setListings(prevListings =>
        prevListings.map(listing =>
          listing.id === selectedListingId ? response.listing : listing
        )
      );

      setSaveMessage({ type: 'success', text: 'Listing updated successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update listing',
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter listings based on search term
  const filteredListings = listings.filter(listing => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      listing.name.toLowerCase().includes(searchLower) ||
      listing.displayName?.toLowerCase().includes(searchLower) ||
      listing.nickname?.toLowerCase().includes(searchLower) ||
      listing.id.toString().includes(searchLower) ||
      listing.city?.toLowerCase().includes(searchLower)
    );
  });

  const selectedListing = listings.find(l => l.id === selectedListingId);
  const getListingDisplayName = (listing: Listing) => {
    return listing.displayName || listing.nickname || listing.name;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white flex-shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <button
                onClick={onBack}
                className="mr-4 p-2 hover:bg-white/10 rounded-md transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold">Manage Listings</h1>
                <p className="text-white/80 text-sm">
                  Configure listing names and co-host settings
                </p>
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center px-4 py-2 bg-green-500/20 border border-green-300/30 rounded-md hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Hostify'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 flex flex-col overflow-hidden">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex items-start flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-semibold">Error Loading Listings</h3>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Save Message */}
        {saveMessage && (
          <div
            className={`${
              saveMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            } border rounded-lg p-3 mb-3 flex items-center flex-shrink-0`}
          >
            {saveMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-3" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-3" />
            )}
            <span>{saveMessage.text}</span>
          </div>
        )}

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Listings List - Fixed width sidebar */}
          <div className="w-[380px] flex-shrink-0 bg-white rounded-lg shadow-md p-4 flex flex-col">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Listings ({filteredListings.length})
            </h2>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search listings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Listings List - Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredListings.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No listings found
                </p>
              ) : (
                filteredListings.map((listing) => (
                  <button
                    key={listing.id}
                    onClick={() => setSelectedListingId(listing.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                      selectedListingId === listing.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 truncate text-sm">
                      {getListingDisplayName(listing)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ID: {listing.id}
                      {listing.city && ` • ${listing.city}`}
                      {listing.isCohostOnAirbnb && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          Co-host
                        </span>
                      )}
                    </div>
                    {listing.tags && listing.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {listing.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Listing Details/Edit Form - Fills remaining space */}
          <div className="flex-1 bg-white rounded-lg shadow-md p-6 overflow-y-auto">
            {!selectedListing ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Search className="w-16 h-16 mb-4 text-gray-300" />
                <p className="text-lg font-medium">Select a listing to edit</p>
                <p className="text-sm mt-2">Choose a listing from the list on the left</p>
              </div>
            ) : (
              <div>
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900">Edit Listing</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Original Name: {selectedListing.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">ID: {selectedListing.id}</p>
                </div>

                <div className="space-y-6">
                  {/* Display Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter custom display name (optional)"
                      className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      This name will be used in dropdowns and the UI. The original name "{selectedListing.name}" 
                      will be preserved for mapping purposes.
                    </p>
                  </div>

                  {/* Co-host on Airbnb */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="cohost"
                        checked={isCohostOnAirbnb}
                        onChange={(e) => setIsCohostOnAirbnb(e.target.checked)}
                        className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <label
                          htmlFor="cohost"
                          className="text-sm font-medium text-purple-900 cursor-pointer"
                        >
                          Co-host on Airbnb
                        </label>
                        <p className="text-xs text-purple-700 mt-1">
                          When enabled, Airbnb revenue will be <strong>excluded</strong> from statement calculations.
                          The client receives all payments directly, so only PM commission will be calculated.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Airbnb Pass-Through Tax */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="passThroughTax"
                        checked={airbnbPassThroughTax}
                        onChange={(e) => setAirbnbPassThroughTax(e.target.checked)}
                        className="mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <label
                          htmlFor="passThroughTax"
                          className="text-sm font-medium text-amber-900 cursor-pointer"
                        >
                          Airbnb Pass-Through Tax
                        </label>
                        <p className="text-xs text-amber-700 mt-1">
                          Enable this if Airbnb collects the tax but does <strong>not remit</strong> it (passes it to you).
                          When enabled, tax will be <strong>added</strong> to the gross payout for Airbnb bookings.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Disregard Tax (Company Remits) */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="disregardTax"
                        checked={disregardTax}
                        onChange={(e) => setDisregardTax(e.target.checked)}
                        className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <label
                          htmlFor="disregardTax"
                          className="text-sm font-medium text-red-900 cursor-pointer"
                        >
                          Disregard Tax (Company Remits)
                        </label>
                        <p className="text-xs text-red-700 mt-1">
                          Enable this for clients where the company has agreed to remit the tax on their behalf.
                          When enabled, tax will <strong>never be added</strong> to the gross payout.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cleaning Fee Pass-Through */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="cleaningFeePassThrough"
                        checked={cleaningFeePassThrough}
                        onChange={(e) => setCleaningFeePassThrough(e.target.checked)}
                        className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <label
                          htmlFor="cleaningFeePassThrough"
                          className="text-sm font-medium text-green-900 cursor-pointer"
                        >
                          Cleaning Fee Pass-Through
                        </label>
                        <p className="text-xs text-green-700 mt-1">
                          When enabled, the <strong>guest-paid cleaning fee</strong> from each reservation is charged to the owner
                          instead of actual cleaning expenses. Any expenses categorized as "Cleaning" will be hidden from statements.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Guest Paid Damage Coverage */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="guestPaidDamageCoverage"
                        checked={guestPaidDamageCoverage}
                        onChange={(e) => setGuestPaidDamageCoverage(e.target.checked)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <label
                          htmlFor="guestPaidDamageCoverage"
                          className="text-sm font-medium text-blue-900 cursor-pointer"
                        >
                          Guest Paid Damage Coverage
                        </label>
                        <p className="text-xs text-blue-700 mt-1">
                          When enabled, a <strong>Guest Paid Damage Coverage</strong> column will appear on statements showing
                          the resort fee amount collected from each guest. This is an informational column displayed in blue.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Waive PM Commission */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="waiveCommission"
                        checked={waiveCommission}
                        onChange={(e) => setWaiveCommission(e.target.checked)}
                        className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div className="ml-3 flex-1">
                        <label
                          htmlFor="waiveCommission"
                          className="text-sm font-medium text-indigo-900 cursor-pointer"
                        >
                          Waive PM Commission
                        </label>
                        <p className="text-xs text-indigo-700 mt-1">
                          When enabled, the PM commission will still be <strong>displayed</strong> on statements but will <strong>not be deducted</strong> from the payout.
                          Use this for promotional periods where you want owners to see what they would normally pay.
                        </p>

                        {waiveCommission && (
                          <div className="mt-3 p-3 bg-indigo-100 rounded-md">
                            <label className="block text-xs font-medium text-indigo-800 mb-1">
                              Waive Until (inclusive)
                            </label>
                            <input
                              type="date"
                              value={waiveCommissionUntil}
                              onChange={(e) => setWaiveCommissionUntil(e.target.value)}
                              className="w-48 border border-indigo-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-indigo-600 mt-1">
                              {waiveCommissionUntil
                                ? `Commission waived for reservations until ${new Date(waiveCommissionUntil + 'T00:00:00').toLocaleDateString()}`
                                : 'Leave empty for indefinite waiver'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PM Fee Percentage */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Property Management Fee (%)
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="number"
                        value={pmFeePercentage}
                        onChange={(e) => setPmFeePercentage(parseFloat(e.target.value))}
                        min="0"
                        max="100"
                        step="0.01"
                        className="w-32 border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-600">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      The percentage charged for property management services (e.g., 15% = 15.00)
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-blue-900 mb-2">
                      Tags
                    </label>
                    <p className="text-xs text-blue-700 mb-3">
                      Add tags to group and filter listings. Use tags like "Downtown", "Luxury", "Pet-Friendly", etc.
                    </p>
                    
                    {/* Existing Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                          >
                            {tag}
                            <button
                              onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                              className="ml-2 text-blue-600 hover:text-blue-800"
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Add New Tag */}
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmedTag = newTag.trim();
                            if (trimmedTag && !tags.includes(trimmedTag)) {
                              setTags([...tags, trimmedTag]);
                              setNewTag('');
                            }
                          }
                        }}
                        placeholder="Add a tag..."
                        className="flex-1 border border-blue-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmedTag = newTag.trim();
                          if (trimmedTag && !tags.includes(trimmedTag)) {
                            setTags([...tags, trimmedTag]);
                            setNewTag('');
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Location Info */}
                  {(selectedListing.street || selectedListing.city || selectedListing.state) && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Location</h3>
                      <p className="text-sm text-gray-600">
                        {[selectedListing.street, selectedListing.city, selectedListing.state, selectedListing.country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingsPage;

