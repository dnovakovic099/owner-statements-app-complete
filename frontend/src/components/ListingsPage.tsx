import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Save, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { listingsAPI } from '../services/api';
import { Listing } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface ListingsPageProps {
  onBack: () => void;
}

const ListingsPage: React.FC<ListingsPageProps> = ({ onBack }) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Form state for selected listing
  const [displayName, setDisplayName] = useState('');
  const [isCohostOnAirbnb, setIsCohostOnAirbnb] = useState(false);
  const [pmFeePercentage, setPmFeePercentage] = useState<number>(15);

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    if (selectedListingId) {
      const listing = listings.find(l => l.id === selectedListingId);
      if (listing) {
        setDisplayName(listing.displayName || listing.nickname || listing.name || '');
        setIsCohostOnAirbnb(listing.isCohostOnAirbnb || false);
        setPmFeePercentage(listing.pmFeePercentage || 15);
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
      console.error('Failed to load listings:', err);
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
    setPmFeePercentage(15);
  };

  const handleSave = async () => {
    if (!selectedListingId) return;

    try {
      setSaving(true);
      setSaveMessage(null);

      const config = {
        displayName: displayName.trim() || undefined,
        isCohostOnAirbnb,
        pmFeePercentage,
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <button
                onClick={onBack}
                className="mr-4 p-2 hover:bg-white/10 rounded-md transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">🏠 Manage Listings</h1>
                <p className="text-white/80 text-sm mt-1">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
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
            } border rounded-lg p-4 mb-6 flex items-center`}
          >
            {saveMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-3" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-3" />
            )}
            <span>{saveMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listings List */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Listings ({filteredListings.length})
            </h2>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search listings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Listings Dropdown/List */}
            <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
              {filteredListings.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No listings found
                </p>
              ) : (
                filteredListings.map((listing) => (
                  <button
                    key={listing.id}
                    onClick={() => setSelectedListingId(listing.id)}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      selectedListingId === listing.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium text-gray-900 truncate">
                      {getListingDisplayName(listing)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {listing.id}
                      {listing.city && ` • ${listing.city}`}
                      {listing.isCohostOnAirbnb && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          Co-host
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Listing Details/Edit Form */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
            {!selectedListing ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
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

