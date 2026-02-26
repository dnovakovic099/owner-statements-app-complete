import React, { useState, useEffect, useMemo } from 'react';
import { FolderOpen, AlertTriangle, Search } from 'lucide-react';
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
import { Listing, ListingGroup } from '../types/index';

interface GroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group?: ListingGroup | null;
  onSave: (data: {
    id?: number;
    name: string;
    tags: string[];
    listingIds: number[];
    calculationType: 'checkout' | 'calendar';
    stripeAccountId?: string | null;
  }) => Promise<void>;
  allListings: Listing[];
  allGroups: ListingGroup[];
}

const GroupModal: React.FC<GroupModalProps> = ({
  isOpen,
  onClose,
  group,
  onSave,
  allListings,
  allGroups,
}) => {
  const [name, setName] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedListingIds, setSelectedListingIds] = useState<number[]>([]);
  const [calculationType, setCalculationType] = useState<'checkout' | 'calendar'>('checkout');
  const [stripeAccountId, setStripeAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; tags?: string; listings?: string }>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Base schedule tags for groups
  const availableTags = ['WEEKLY', 'BI-WEEKLY', 'MONTHLY'];

  // Filter listings based on search query
  const filteredListings = useMemo(() => {
    if (!searchQuery.trim()) return allListings;
    const query = searchQuery.toLowerCase();
    return allListings.filter(listing => {
      const displayName = (listing.displayName || listing.nickname || listing.name || '').toLowerCase();
      const city = (listing.city || '').toLowerCase();
      const id = String(listing.id);
      return displayName.includes(query) || city.includes(query) || id.includes(query);
    });
  }, [allListings, searchQuery]);

  // Initialize form when modal opens or group changes
  useEffect(() => {
    if (isOpen) {
      if (group) {
        setName(group.name);
        setSelectedTags(group.tags || []);
        setSelectedListingIds(group.listingIds || []);
        setCalculationType(group.calculationType || 'checkout');
        setStripeAccountId(group.stripeAccountId || '');
      } else {
        setName('');
        setSelectedTags([]);
        setSelectedListingIds([]);
        setCalculationType('checkout');
        setStripeAccountId('');
      }
      setErrors({});
      setSearchQuery('');
    }
  }, [isOpen, group]);

  // Check if a listing is in another group
  const getListingGroup = (listingId: number): ListingGroup | null => {
    // Don't show warning for the current group being edited
    const otherGroups = group ? allGroups.filter(g => g.id !== group.id) : allGroups;
    return otherGroups.find(g => g.listingIds?.includes(listingId)) || null;
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    setErrors(prev => ({ ...prev, tags: undefined }));
  };

  const toggleListing = (listingId: number) => {
    setSelectedListingIds(prev =>
      prev.includes(listingId) ? prev.filter(id => id !== listingId) : [...prev, listingId]
    );
    setErrors(prev => ({ ...prev, listings: undefined }));
  };

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'Group name is required';
    }

    if (selectedTags.length === 0) {
      newErrors.tags = 'Select at least one schedule tag';
    }

    if (selectedListingIds.length === 0) {
      newErrors.listings = 'Select at least one listing';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      await onSave({
        id: group?.id,
        name: name.trim(),
        tags: selectedTags,
        listingIds: selectedListingIds,
        calculationType,
        stripeAccountId: stripeAccountId.trim() || null,
      });
      onClose();
    } catch (error) {
      console.error('Error saving group:', error);
    } finally {
      setSaving(false);
    }
  };

  const getListingDisplayName = (listing: Listing) => {
    return listing.displayName || listing.nickname || listing.name;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] p-0 gap-0 overflow-hidden" hideCloseButton>
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-purple-700">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 rounded-lg p-2">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <DialogTitle className="text-lg font-semibold text-white">
              {group ? 'Edit Listing Group' : 'Create Listing Group'}
            </DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Body */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)] space-y-5">
            {/* Group Name */}
            <div>
              <Label htmlFor="groupName" className="text-sm font-medium text-gray-700">
                Group Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="groupName"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors(prev => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g., Smith Properties"
                className={`mt-1 ${errors.name ? 'border-red-500' : ''}`}
              />
              {errors.name && (
                <p className="text-xs text-red-600 mt-1">{errors.name}</p>
              )}
            </div>

            {/* Schedule Tags */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Schedule Tags <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-gray-500 mb-3">
                Select one or more tags to determine when statements are generated for this group
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {errors.tags && (
                <p className="text-xs text-red-600 mt-2">{errors.tags}</p>
              )}
            </div>

            {/* Calculation Method */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Calculation Method
              </Label>
              <div className="space-y-2">
                <label
                  className={`flex items-start p-3 rounded-md border cursor-pointer transition-colors ${
                    calculationType === 'checkout'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setCalculationType('checkout')}
                >
                  <input
                    type="radio"
                    name="calculationType"
                    checked={calculationType === 'checkout'}
                    onChange={() => setCalculationType('checkout')}
                    className="mt-0.5 mr-3"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Check-out Based</div>
                    <div className="text-xs text-gray-500">Include reservations that check out during period</div>
                  </div>
                </label>
                <label
                  className={`flex items-start p-3 rounded-md border cursor-pointer transition-colors ${
                    calculationType === 'calendar'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setCalculationType('calendar')}
                >
                  <input
                    type="radio"
                    name="calculationType"
                    checked={calculationType === 'calendar'}
                    onChange={() => setCalculationType('calendar')}
                    className="mt-0.5 mr-3"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Calendar Based</div>
                    <div className="text-xs text-gray-500">Prorate reservations by days in period</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Stripe Account ID */}
            <div>
              <Label htmlFor="stripeAccountId" className="text-sm font-medium text-gray-700">
                Stripe Account ID
              </Label>
              <p className="text-xs text-gray-500 mb-2">
                Stripe Connect account for this group's owner. Overrides individual listing Stripe IDs.
              </p>
              <Input
                id="stripeAccountId"
                value={stripeAccountId}
                onChange={(e) => setStripeAccountId(e.target.value)}
                placeholder="acct_..."
                className="mt-1 font-mono text-sm"
              />
            </div>

            {/* Listings Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-gray-700">
                  Listings <span className="text-red-500">*</span>
                </Label>
                <span className="text-xs text-gray-500">
                  {selectedListingIds.length} selected
                </span>
              </div>
              {/* Search Input */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search listings by name, city, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-64 border rounded-md bg-gray-50">
                <div className="p-2 space-y-1">
                  {filteredListings.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      {searchQuery ? 'No listings match your search' : 'No listings available'}
                    </div>
                  ) : (
                    filteredListings.map(listing => {
                      const existingGroup = getListingGroup(listing.id);
                      const isSelected = selectedListingIds.includes(listing.id);

                      return (
                        <div key={listing.id}>
                          <label
                            className={`flex items-start p-2 rounded-md cursor-pointer hover:bg-white transition-colors ${
                              isSelected ? 'bg-purple-50' : ''
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleListing(listing.id)}
                              className="mt-0.5 mr-3"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {getListingDisplayName(listing)}
                              </div>
                              <div className="text-xs text-gray-500">
                                ID: {listing.id}
                                {listing.city && ` • ${listing.city}`}
                              </div>
                              {listing.tags && listing.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
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
                            </div>
                          </label>
                          {existingGroup && isSelected && (
                            <div className="ml-8 mt-1 mb-2 flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>
                                This will move the listing from <strong>{existingGroup.name}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              {errors.listings && (
                <p className="text-xs text-red-600 mt-2">{errors.listings}</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 bg-gray-50 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? 'Saving...' : group ? 'Update Group' : 'Create Group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default GroupModal;
