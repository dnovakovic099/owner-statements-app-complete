import React, { useState, useEffect } from 'react';
import { Search, Save, RefreshCw, AlertCircle, CheckCircle, Clock, Download, FolderOpen, Plus, Users as UsersIcon, ChevronDown } from 'lucide-react';
import { listingsAPI, tagScheduleAPI, groupsAPI, payoutsAPI } from '../services/api';
import { Listing, ListingGroup } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { useToast } from './ui/toast';
import TagScheduleModal from './TagScheduleModal';
import GroupModal from './GroupModal';

interface NewListing {
  id: number;
  name: string;
  displayName: string;
  nickname: string | null;
  city: string | null;
  state: string | null;
  pmFeePercentage: number | null;
  createdAt: string;
}

interface ListingsPageProps {
  onBack: () => void;
  initialSelectedListingId?: number | null;
  newListings?: NewListing[];
  readListingIds?: number[];
  onMarkAsRead?: (listingId: number) => void;
  onMarkAllAsRead?: () => void;
  onOpenEmailDashboard?: () => void;
  hideSidebar?: boolean;
}

const ListingsPage: React.FC<ListingsPageProps> = ({
  onBack,
  initialSelectedListingId,
  newListings = [],
  readListingIds = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onOpenEmailDashboard,
  hideSidebar = false
}) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(initialSelectedListingId || null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [selectedFrequencyTags, setSelectedFrequencyTags] = useState<string[]>([]);
  const [availableFrequencyTags, setAvailableFrequencyTags] = useState<string[]>([]);
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [cohostFilter, setCohostFilter] = useState<'all' | 'cohost' | 'not-cohost'>('all');
  const [ownerEmailFilter, setOwnerEmailFilter] = useState<'all' | 'has-email' | 'no-email'>('all');
  const [autoSendFilter, setAutoSendFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [payoutFilter, setPayoutFilter] = useState<'all' | 'missing' | 'pending' | 'on_file'>('all');

  // Settings flags filters
  const [passThroughTaxFilter, setPassThroughTaxFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [disregardTaxFilter, setDisregardTaxFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [cleaningFeeFilter, setCleaningFeeFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [guestPaidDamageFilter, setGuestPaidDamageFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [waiveCommissionFilter, setWaiveCommissionFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const [saving, setSaving] = useState(false);
  const [savingOwnerInfo, setSavingOwnerInfo] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();

  // Tag schedule modal states
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleTagName, setScheduleTagName] = useState<string>('');
  const [existingSchedule, setExistingSchedule] = useState<any>(null);
  const [tagSchedules, setTagSchedules] = useState<Record<string, any>>({});

  // Groups states
  const [groups, setGroups] = useState<ListingGroup[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ListingGroup | null>(null);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);

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
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  // Base tags that are always available as suggestions (frequencies + categories)
  const BASE_TAGS = ['WEEKLY', 'BI-WEEKLY', 'MONTHLY', 'QUARTERLY', 'ARBITRAGE', 'OWNED', 'SHARED'];
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerGreeting, setOwnerGreeting] = useState('');
  const [autoSendStatements, setAutoSendStatements] = useState(true);
  const [internalNotes, setInternalNotes] = useState('');
  const [payoutStatus, setPayoutStatus] = useState<'missing' | 'pending' | 'on_file'>('missing');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeOnboardingStatus, setStripeOnboardingStatus] = useState<'missing' | 'pending' | 'verified' | 'requires_action'>('missing');
  const [refreshingPayout, setRefreshingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutLastChecked, setPayoutLastChecked] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const payoutLabel = (status: 'missing' | 'pending' | 'on_file') => {
    switch (status) {
      case 'on_file':
        return 'Verified';
      case 'pending':
        return 'Requested';
      default:
        return 'Not Collected';
    }
  };

  useEffect(() => {
    loadListings(false, undefined, true);
    loadTagSchedules();
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search to reduce API calls
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // Reload listings on filter changes (server-side filtering)
  useEffect(() => {
    const filters = {
      search: debouncedSearch,
      cities: selectedCities,
      tags: selectedFilterTags,
      freqTags: selectedFrequencyTags.filter(t => t !== 'NO TAG'),
      includeNoTag: selectedFrequencyTags.includes('NO TAG'),
      cohost: cohostFilter,
      ownerEmail: ownerEmailFilter,
      autoSend: autoSendFilter,
      passThroughTax: passThroughTaxFilter,
      disregardTax: disregardTaxFilter,
      cleaningFeePassThrough: cleaningFeeFilter,
      guestPaidDamageCoverage: guestPaidDamageFilter,
      waiveCommission: waiveCommissionFilter,
      payoutStatus: payoutFilter !== 'all' ? payoutFilter : undefined
    };
    loadListings(false, filters, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    selectedCities,
    selectedFilterTags,
    selectedFrequencyTags,
    cohostFilter,
    ownerEmailFilter,
    autoSendFilter,
    passThroughTaxFilter,
    disregardTaxFilter,
    cleaningFeeFilter,
    guestPaidDamageFilter,
    waiveCommissionFilter,
    payoutFilter
  ]);

  // Load all tag schedules
  const loadTagSchedules = async () => {
    try {
      const response = await tagScheduleAPI.getSchedules();
      if (response.success && response.schedules) {
        const scheduleMap: Record<string, any> = {};
        response.schedules.forEach((s: any) => {
          scheduleMap[s.tagName] = s;
        });
        setTagSchedules(scheduleMap);
      }
    } catch (error) {
      console.error('Failed to load tag schedules:', error);
    }
  };

  // Open schedule modal for a tag
  const openScheduleModal = async (tagName: string) => {
    setScheduleTagName(tagName);
    try {
      const response = await tagScheduleAPI.getScheduleByTag(tagName);
      setExistingSchedule(response.schedule || null);
    } catch (error) {
      setExistingSchedule(null);
    }
    setIsScheduleModalOpen(true);
  };

  // Save tag schedule
  const handleSaveSchedule = async (schedule: any) => {
    await tagScheduleAPI.saveSchedule(schedule);
    await loadTagSchedules();
    showToast('Schedule saved', 'success');
  };

  // Delete tag schedule
  const handleDeleteSchedule = async () => {
    if (scheduleTagName) {
      await tagScheduleAPI.deleteSchedule(scheduleTagName);
      await loadTagSchedules();
      showToast('Schedule removed', 'success');
    }
  };

  // Load all groups
  const loadGroups = async () => {
    try {
      const response = await groupsAPI.getGroups();
      setGroups(response.groups || []);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  // Open group modal for creating
  const openCreateGroupModal = () => {
    setEditingGroup(null);
    setIsGroupModalOpen(true);
  };

  // Open group modal for editing
  const openEditGroupModal = (group: ListingGroup) => {
    setEditingGroup(group);
    setIsGroupModalOpen(true);
  };

  // Save group (create or update)
  const handleSaveGroup = async (data: {
    id?: number;
    name: string;
    tags: string[];
    listingIds: number[];
  }) => {
    try {
      if (data.id) {
        // Update existing group
        await groupsAPI.updateGroup(data.id, {
          name: data.name,
          tags: data.tags,
        });

        // Handle listing membership changes
        const currentGroup = groups.find(g => g.id === data.id);
        if (currentGroup) {
          const toAdd = data.listingIds.filter(id => !currentGroup.listingIds.includes(id));
          const toRemove = currentGroup.listingIds.filter(id => !data.listingIds.includes(id));

          if (toAdd.length > 0) {
            await groupsAPI.addListingsToGroup(data.id, toAdd);
          }

          for (const listingId of toRemove) {
            await groupsAPI.removeListingFromGroup(data.id, listingId);
          }
        }

        showToast('Group updated successfully', 'success');
      } else {
        // Create new group
        await groupsAPI.createGroup(data);
        showToast('Group created successfully', 'success');
      }

      await loadGroups();
      await loadListings();
    } catch (error) {
      console.error('Failed to save group:', error);
      showToast('Failed to save group', 'error');
      throw error;
    }
  };

  // Remove listing from group
  const handleRemoveFromGroup = async (groupId: number, listingId: number) => {
    try {
      await groupsAPI.removeListingFromGroup(groupId, listingId);
      showToast('Listing removed from group', 'success');
      await loadGroups();
      await loadListings();
    } catch (error) {
      console.error('Failed to remove listing from group:', error);
      showToast('Failed to remove listing from group', 'error');
    }
  };

  // Add listing to existing group
  const handleAddToExistingGroup = async (groupId: number, listingId: number) => {
    try {
      await groupsAPI.addListingsToGroup(groupId, [listingId]);
      showToast('Listing added to group', 'success');
      await loadGroups();
      await loadListings();
    } catch (error) {
      console.error('Failed to add listing to group:', error);
      showToast('Failed to add listing to group', 'error');
    }
  };

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
        setPmFeePercentage(listing.pmFeePercentage ?? 15);
        setTags(listing.tags || []);
        setOwnerEmail(listing.ownerEmail || '');
        setOwnerGreeting(listing.ownerGreeting || '');
        setAutoSendStatements(listing.autoSendStatements !== false);
        setInternalNotes(listing.internalNotes || '');
        setPayoutStatus((listing.payoutStatus as any) || 'missing');
        setPayoutNotes(listing.payoutNotes || '');
        setStripeAccountId((listing.stripeAccountId as any) || null);
        setStripeOnboardingStatus((listing.stripeOnboardingStatus as any) || 'missing');
      }
    } else {
      resetForm();
    }
  }, [selectedListingId, listings]);

  const loadListings = async (force = false, filtersOverride?: any, updateOptions = true) => {
    try {
      setLoading(true);
      setError(null);
      const response = await listingsAPI.getListings(undefined, {
        force,
        filters: filtersOverride
      });
      setListings(response.listings.map((l: Listing) => ({
        ...l,
        payoutStatus: (l as any).payoutStatus || 'missing',
        payoutNotes: l.payoutNotes || '',
        stripeAccountId: (l as any).stripeAccountId || null,
        stripeOnboardingStatus: (l as any).stripeOnboardingStatus || 'missing'
      })));

      if (updateOptions) {
        const allTags = new Set<string>();
        const frequencyTags = new Set<string>();
        const allCities = new Set<string>();

        response.listings.forEach((listing: Listing) => {
          if (listing.tags && listing.tags.length > 0) {
            listing.tags.forEach((tag: string) => {
              const upperTag = tag.toUpperCase();
              frequencyTags.add(upperTag);
              // Keep raw tag too for custom tags
              allTags.add(tag);
            });
          }
          if (listing.city) {
            allCities.add(listing.city);
          }
        });

        setAvailableTags(Array.from(allTags).sort());
        setAvailableFrequencyTags(Array.from(frequencyTags).sort());
        setAvailableCities(Array.from(allCities).sort());
      }
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
      await loadListings(true);
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
    setOwnerEmail('');
    setOwnerGreeting('');
    setAutoSendStatements(true);
    setInternalNotes('');
    setPayoutStatus('missing');
    setPayoutNotes('');
    setStripeAccountId(null);
    setStripeOnboardingStatus('missing');
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
        ownerEmail: ownerEmail.trim() || null,
        ownerGreeting: ownerGreeting.trim() || null,
        autoSendStatements,
        internalNotes: internalNotes.trim() || null,
        payoutStatus,
        payoutNotes: payoutNotes.trim() || null,
        stripeAccountId: stripeAccountId || undefined,
        stripeOnboardingStatus
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

  // Save only owner info (email, greeting, auto-send)
  const handleSaveOwnerInfo = async () => {
    if (!selectedListingId) return;

    try {
      setSavingOwnerInfo(true);
      setSaveMessage(null);

      const config = {
        ownerEmail: ownerEmail.trim() || null,
        ownerGreeting: ownerGreeting.trim() || null,
        autoSendStatements,
      };

      console.log('[FRONTEND] Saving owner info:', config);

      const response = await listingsAPI.updateListingConfig(selectedListingId, config);

      console.log('[FRONTEND] Response:', response);

      // Update the listing in local state
      setListings(prevListings =>
        prevListings.map(listing =>
          listing.id === selectedListingId ? response.listing : listing
        )
      );

      showToast('Owner info saved successfully!', 'success');
    } catch (err) {
      console.error('[FRONTEND] Error saving owner info:', err);
      showToast(err instanceof Error ? err.message : 'Failed to save owner info', 'error');
    } finally {
      setSavingOwnerInfo(false);
    }
  };

  // Generate Stripe onboarding link for payouts
  const handleCreatePayoutLink = async () => {
    if (!selectedListingId) return;
    try {
      const response = await payoutsAPI.createOnboardingLink(selectedListingId);
      const { stripeAccountId: accountId } = response;

      const nextPayoutStatus = payoutStatus === 'on_file' ? 'on_file' : 'pending';

      setStripeAccountId(accountId);
      setStripeOnboardingStatus('pending');
      setPayoutStatus(nextPayoutStatus);

      setListings(prev => prev.map(l => l.id === selectedListingId
        ? { ...l, stripeAccountId: accountId, stripeOnboardingStatus: 'pending', payoutStatus: nextPayoutStatus }
        : l));

      window.open(response.url, '_blank', 'noopener');
      showToast('Onboarding link created', 'success');
    } catch (err) {
      console.error('Failed to create onboarding link:', err);
      showToast(err instanceof Error ? err.message : 'Failed to create onboarding link', 'error');
    }
  };

  // Refresh status from Stripe
  const handleRefreshPayoutStatus = async () => {
    if (!selectedListingId) return;
    try {
      setRefreshingPayout(true);
      setPayoutError(null);
      const response = await payoutsAPI.refreshStatus(selectedListingId);
      const { status, payoutStatus: updatedPayoutStatus } = response;
      setStripeOnboardingStatus(status as any);
      setPayoutStatus(updatedPayoutStatus as any);
      setPayoutLastChecked(new Date().toISOString());

      setListings(prev => prev.map(l => l.id === selectedListingId
        ? { ...l, stripeOnboardingStatus: status as any, payoutStatus: updatedPayoutStatus as any }
        : l));

      showToast('Payout status refreshed', 'success');
    } catch (err) {
      console.error('Failed to refresh payout status:', err);
      setPayoutError(err instanceof Error ? err.message : 'Failed to refresh payout status');
    } finally {
      setRefreshingPayout(false);
    }
  };

  // Filter listings based on all filter criteria
  const filteredListings = listings;

  // Toggle a tag in the filter
  const toggleFilterTag = (tag: string) => {
    setSelectedFilterTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Toggle a frequency tag
  const toggleFrequencyTag = (tag: string) => {
    setSelectedFrequencyTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Toggle a city
  const toggleCity = (city: string) => {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    );
  };

  // Count active filters
  const activeFilterCount =
    selectedFilterTags.length +
    selectedFrequencyTags.length +
    selectedCities.length +
    (cohostFilter !== 'all' ? 1 : 0) +
    (ownerEmailFilter !== 'all' ? 1 : 0) +
    (autoSendFilter !== 'all' ? 1 : 0) +
    (payoutFilter !== 'all' ? 1 : 0) +
    (passThroughTaxFilter !== 'all' ? 1 : 0) +
    (disregardTaxFilter !== 'all' ? 1 : 0) +
    (cleaningFeeFilter !== 'all' ? 1 : 0) +
    (guestPaidDamageFilter !== 'all' ? 1 : 0) +
    (waiveCommissionFilter !== 'all' ? 1 : 0);

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedFilterTags([]);
    setSelectedFrequencyTags([]);
    setSelectedCities([]);
    setCitySearchTerm('');
    setTagSearchTerm('');
    setCohostFilter('all');
    setOwnerEmailFilter('all');
    setAutoSendFilter('all');
    setPayoutFilter('all');
    setPassThroughTaxFilter('all');
    setDisregardTaxFilter('all');
    setCleaningFeeFilter('all');
    setGuestPaidDamageFilter('all');
    setWaiveCommissionFilter('all');
  };

  // Export listings to CSV
  const handleExportCSV = () => {
    const dataToExport = filteredListings.length > 0 ? filteredListings : listings;

    // Define CSV headers - ALL listing fields
    const headers = [
      'ID',
      'Name',
      'Display Name',
      'Nickname',
      'Street',
      'City',
      'State',
      'Country',
      'Full Address',
      'Person Capacity',
      'Bedrooms',
      'Bathrooms',
      'Currency',
      'Price',
      'Cleaning Fee',
      'Check-In Start',
      'Check-In End',
      'Check-Out Time',
      'Min Nights',
      'Max Nights',
      'PM Fee %',
      'Is Co-host on Airbnb',
      'Airbnb Pass-Through Tax',
      'Disregard Tax',
      'Cleaning Fee Pass-Through',
      'Guest Paid Damage Coverage',
      'Include Child Listings',
      'Waive Commission',
      'Waive Commission Until',
      'Default Pet Fee',
      'Tags',
      'Owner Email',
      'Owner Greeting',
      'Payout Status',
      'Payout Notes',
      'Auto-Send Statements',
      'Internal Notes',
      'Is Active',
      'Last Synced At',
      'Created At',
      'Updated At'
    ];

    // Helper to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Convert listings to CSV rows - ALL fields
    const rows = dataToExport.map(listing => [
      listing.id,
      escapeCSV(listing.name),
      escapeCSV(listing.displayName || ''),
      escapeCSV(listing.nickname || ''),
      escapeCSV(listing.street || ''),
      escapeCSV(listing.city || ''),
      escapeCSV(listing.state || ''),
      escapeCSV(listing.country || ''),
      escapeCSV(listing.address || ''),
      listing.personCapacity || '',
      listing.bedroomsNumber || '',
      listing.bathroomsNumber || '',
      listing.currency || '',
      listing.price || '',
      listing.cleaningFee || '',
      listing.checkInTimeStart || '',
      listing.checkInTimeEnd || '',
      listing.checkOutTime || '',
      listing.minNights || '',
      listing.maxNights || '',
      listing.pmFeePercentage ?? '',
      listing.isCohostOnAirbnb ? 'Yes' : 'No',
      listing.airbnbPassThroughTax ? 'Yes' : 'No',
      listing.disregardTax ? 'Yes' : 'No',
      listing.cleaningFeePassThrough ? 'Yes' : 'No',
      listing.guestPaidDamageCoverage ? 'Yes' : 'No',
      listing.includeChildListings ? 'Yes' : 'No',
      listing.waiveCommission ? 'Yes' : 'No',
      listing.waiveCommissionUntil || '',
      listing.defaultPetFee ?? '',
      escapeCSV((listing.tags || []).join(', ')),
      escapeCSV(listing.ownerEmail || ''),
      escapeCSV(listing.ownerGreeting || ''),
      payoutLabel(((listing.payoutStatus as any) || 'missing') as 'missing' | 'pending' | 'on_file'),
      escapeCSV(listing.payoutNotes || ''),
      listing.autoSendStatements !== false ? 'Yes' : 'No',
      escapeCSV(listing.internalNotes || ''),
      listing.isActive ? 'Yes' : 'No',
      listing.lastSyncedAt || listing.syncedAt || '',
      listing.createdAt || '',
      listing.updatedAt || ''
    ].join(','));

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `listings_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${dataToExport.length} listings to CSV`, 'success');
  };

  const selectedListing = listings.find(l => l.id === selectedListingId);
  const getListingDisplayName = (listing: Listing) => {
    return listing.displayName || listing.nickname || listing.name;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-2 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Listings</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">Configure listing names and co-host settings</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-xs sm:text-sm"
            >
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 sm:mr-2 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync from Hostify'}</span>
            </button>
          </div>
        </div>
      </div>

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

        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Listings List - Responsive sidebar */}
          <div className={`${selectedListingId ? 'hidden lg:flex' : 'flex'} w-full lg:w-[380px] flex-shrink-0 bg-white rounded-lg shadow-md p-4 flex-col overflow-hidden`}>
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

            {/* Filters Toggle */}
            <div className="mb-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-900 py-1.5 px-2 rounded-md hover:bg-gray-100"
              >
                <span className="font-medium flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showFilters && (
                <div className="mt-2 p-3 border border-gray-200 rounded-md bg-gray-50 space-y-3 max-h-80 overflow-y-auto">
                  {/* Tag Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tag</label>
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={tagSearchTerm}
                      onChange={(e) => setTagSearchTerm(e.target.value)}
                      className="w-full mb-1.5 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {availableFrequencyTags
                        .filter(tag => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                        .map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleFrequencyTag(tag)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            selectedFrequencyTags.includes(tag)
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                      {'NO TAG'.toLowerCase().includes(tagSearchTerm.toLowerCase()) && (
                        <button
                          onClick={() => toggleFrequencyTag('NO TAG')}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            selectedFrequencyTags.includes('NO TAG')
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          NO TAG
                        </button>
                      )}
                    </div>
                  </div>

                  {/* City Filter */}
                  {availableCities.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">City</label>
                      <input
                        type="text"
                        placeholder="Search cities..."
                        value={citySearchTerm}
                        onChange={(e) => setCitySearchTerm(e.target.value)}
                        className="w-full mb-1.5 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {availableCities
                          .filter(city => city.toLowerCase().includes(citySearchTerm.toLowerCase()))
                          .map(city => (
                          <button
                            key={city}
                            onClick={() => toggleCity(city)}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              selectedCities.includes(city)
                                ? 'bg-green-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Tags */}
                  {availableTags.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tags</label>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {availableTags.map(tag => (
                          <button
                            key={tag}
                            onClick={() => toggleFilterTag(tag)}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              selectedFilterTags.includes(tag)
                                ? 'bg-purple-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Co-host Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Co-host Status</label>
                    <div className="flex gap-1.5">
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'cohost', label: 'Co-host' },
                        { value: 'not-cohost', label: 'Not Co-host' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setCohostFilter(opt.value as typeof cohostFilter)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            cohostFilter === opt.value
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Owner Email Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Owner Email</label>
                    <div className="flex gap-1.5">
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'has-email', label: 'Has Email' },
                        { value: 'no-email', label: 'No Email' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setOwnerEmailFilter(opt.value as typeof ownerEmailFilter)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            ownerEmailFilter === opt.value
                              ? 'bg-orange-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payout Info Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Payout Info</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'missing', label: 'Not Collected' },
                        { value: 'pending', label: 'Requested' },
                        { value: 'on_file', label: 'Verified' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setPayoutFilter(opt.value as typeof payoutFilter)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            payoutFilter === opt.value
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-send Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Auto-send Statements</label>
                    <div className="flex gap-1.5">
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'enabled', label: 'Enabled' },
                        { value: 'disabled', label: 'Disabled' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setAutoSendFilter(opt.value as typeof autoSendFilter)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            autoSendFilter === opt.value
                              ? 'bg-teal-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Settings Filters - 2 per row */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Pass-Through Tax Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Pass-Through Tax</label>
                      <div className="flex gap-1">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'enabled', label: 'On' },
                          { value: 'disabled', label: 'Off' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setPassThroughTaxFilter(opt.value as typeof passThroughTaxFilter)}
                            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                              passThroughTaxFilter === opt.value
                                ? 'bg-amber-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Disregard Tax Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Disregard Tax</label>
                      <div className="flex gap-1">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'enabled', label: 'On' },
                          { value: 'disabled', label: 'Off' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setDisregardTaxFilter(opt.value as typeof disregardTaxFilter)}
                            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                              disregardTaxFilter === opt.value
                                ? 'bg-red-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cleaning Fee Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Cleaning Pass-Thru</label>
                      <div className="flex gap-1">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'enabled', label: 'On' },
                          { value: 'disabled', label: 'Off' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setCleaningFeeFilter(opt.value as typeof cleaningFeeFilter)}
                            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                              cleaningFeeFilter === opt.value
                                ? 'bg-green-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Guest Paid Damage Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Guest Damage</label>
                      <div className="flex gap-1">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'enabled', label: 'On' },
                          { value: 'disabled', label: 'Off' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setGuestPaidDamageFilter(opt.value as typeof guestPaidDamageFilter)}
                            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                              guestPaidDamageFilter === opt.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Waive Commission Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Waive Commission</label>
                      <div className="flex gap-1">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'enabled', label: 'On' },
                          { value: 'disabled', label: 'Off' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setWaiveCommissionFilter(opt.value as typeof waiveCommissionFilter)}
                            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                              waiveCommissionFilter === opt.value
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Clear All */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="w-full mt-2 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
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
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900 truncate text-sm">
                        {getListingDisplayName(listing)}
                      </div>
                      <span
                        className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          (listing.payoutStatus || 'missing') === 'on_file'
                            ? 'bg-emerald-100 text-emerald-800'
                            : (listing.payoutStatus || 'missing') === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {payoutLabel(((listing.payoutStatus as any) || 'missing'))}
                      </span>
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
          <div className={`${selectedListingId ? 'flex' : 'hidden lg:flex'} flex-1 bg-white rounded-lg shadow-md ${selectedListing ? 'flex-col overflow-hidden' : 'overflow-hidden'}`}>
            {!selectedListing ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
                <Search className="w-16 h-16 mb-4 text-gray-300" />
                <p className="text-lg font-medium">Select a listing to edit</p>
                <p className="text-sm mt-2">Choose a listing from the list on the left</p>
              </div>
            ) : (
              <>
                {/* Fixed Header */}
                <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    {/* Back button for mobile */}
                    <button
                      onClick={() => setSelectedListingId(null)}
                      className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-gray-900">Edit Listing</h2>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate max-w-[250px] sm:max-w-none">
                        {selectedListing.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">ID: {selectedListing.id}</p>
                    </div>
                  </div>
                </div>

                {/* Scrollable Form Content */}
                <div className="flex-1 overflow-auto px-4 sm:px-6 py-4 sm:py-6">
                <div className="space-y-4 sm:space-y-6">
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

                  {/* Owner Email */}
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <div className="flex gap-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-teal-900 mb-2">
                          Owner Email
                        </label>
                        <input
                          type="email"
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                          placeholder="owner@example.com"
                          className="w-full border border-teal-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="w-40">
                        <label className="block text-sm font-medium text-teal-900 mb-2">
                          Greeting
                        </label>
                        <input
                          type="text"
                          value={ownerGreeting}
                          onChange={(e) => setOwnerGreeting(e.target.value)}
                          placeholder="e.g., John"
                          className="w-full border border-teal-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <label className="block text-sm font-medium text-teal-900 mb-2">
                          Auto-Send
                        </label>
                        <button
                          type="button"
                          onClick={() => setAutoSendStatements(!autoSendStatements)}
                          className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
                            autoSendStatements ? 'bg-teal-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-8 w-8 transform rounded-full bg-white shadow-md transition-transform ${
                              autoSendStatements ? 'translate-x-11' : 'translate-x-1'
                            }`}
                          />
                          <span className={`absolute text-xs font-medium ${autoSendStatements ? 'left-2 text-white' : 'right-2 text-gray-600'}`}>
                            {autoSendStatements ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                      <button
                        onClick={handleSaveOwnerInfo}
                        disabled={savingOwnerInfo}
                        className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50 h-10"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {savingOwnerInfo ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    <p className="text-xs text-teal-700 mt-2">
                      Email for sending statements. Auto-Send: if ON, statements will be sent automatically.
                    </p>
                  </div>

                  {/* Payout Info */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Payout Info</p>
                          <p className="text-xs text-slate-600">Track Stripe onboarding and our internal marker.</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className="px-3 py-1 text-xs rounded-full border border-slate-200 text-slate-800 bg-slate-50">
                            Stripe: {stripeOnboardingStatus === 'verified' ? 'Verified' : stripeOnboardingStatus === 'pending' ? 'Requested' : 'Not Started'}
                          </span>
                          {stripeAccountId && (
                            <span className="px-3 py-1 text-[11px] rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {stripeAccountId}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                          {[
                            { value: 'missing', label: 'Not Collected' },
                            { value: 'pending', label: 'Requested' },
                            { value: 'on_file', label: 'Verified' }
                          ].map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPayoutStatus(opt.value as typeof payoutStatus)}
                              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                payoutStatus === opt.value
                                  ? 'bg-emerald-600 text-white border-emerald-700'
                                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleCreatePayoutLink}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                        >
                          Generate Stripe Link
                        </button>
                        <button
                          type="button"
                          onClick={handleRefreshPayoutStatus}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                          disabled={!stripeAccountId || refreshingPayout}
                        >
                          {refreshingPayout ? 'Refreshing...' : 'Refresh Status'}
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-emerald-900">
                          Payout Notes
                        </label>
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>
                            Internal-only marker to track whether we have payout details verified for this owner.
                          </span>
                          {payoutLastChecked && (
                            <span className="text-slate-500">
                              Last checked: {new Date(payoutLastChecked).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <textarea
                          value={payoutNotes}
                          onChange={(e) => setPayoutNotes(e.target.value)}
                          rows={3}
                          placeholder="Add context, e.g. 'Waiting for bank form from owner'"
                          className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        {payoutError && (
                          <p className="text-xs text-red-600">
                            {payoutError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-blue-900">
                        Tags
                      </label>
                    </div>
                    <p className="text-xs text-blue-700 mb-3">
                      Add tags to group and filter listings. Click <Clock className="w-3 h-3 inline" /> to set a reminder schedule for a tag.
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
                              onClick={() => openScheduleModal(tag)}
                              className={`ml-1.5 p-0.5 rounded hover:bg-blue-200 transition-colors ${
                                tagSchedules[tag] ? 'text-green-600' : 'text-blue-500'
                              }`}
                              type="button"
                              title={tagSchedules[tag] ? 'Edit schedule' : 'Set reminder'}
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                              className="ml-1 text-blue-600 hover:text-blue-800"
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Add New Tag with Autocomplete */}
                    <div className="flex space-x-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => {
                            setNewTag(e.target.value);
                            setShowTagSuggestions(true);
                          }}
                          onFocus={() => setShowTagSuggestions(true)}
                          onBlur={() => {
                            // Delay to allow click on suggestion
                            setTimeout(() => setShowTagSuggestions(false), 200);
                          }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmedTag = newTag.trim().toUpperCase();
                              if (trimmedTag && !tags.includes(trimmedTag)) {
                                setTags([...tags, trimmedTag]);
                                setNewTag('');
                                setShowTagSuggestions(false);
                              }
                            }
                          }}
                          placeholder="Add a tag..."
                          className="w-full border border-blue-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {/* Tag Suggestions Dropdown */}
                        {showTagSuggestions && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {/* Combine base tags + all tags from listings (dynamic) */}
                            {Array.from(new Set([...BASE_TAGS, ...availableTags]))
                              .filter(tag =>
                                !tags.includes(tag) &&
                                tag.toLowerCase().includes(newTag.toLowerCase())
                              )
                              .slice(0, 10)
                              .map((tag, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    if (!tags.includes(tag)) {
                                      setTags([...tags, tag]);
                                      setNewTag('');
                                      setShowTagSuggestions(false);
                                    }
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                                >
                                  <span>{tag}</span>
                                  {availableFrequencyTags.includes(tag) && (
                                    <span className="text-xs text-green-600">has schedule</span>
                                  )}
                                </button>
                              ))}
                            {Array.from(new Set([...BASE_TAGS, ...availableTags]))
                              .filter(tag =>
                                !tags.includes(tag) &&
                                tag.toLowerCase().includes(newTag.toLowerCase())
                              ).length === 0 && newTag.trim() && (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                Press Enter to add "{newTag.trim().toUpperCase()}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const trimmedTag = newTag.trim().toUpperCase();
                          if (trimmedTag && !tags.includes(trimmedTag)) {
                            setTags([...tags, trimmedTag]);
                            setNewTag('');
                            setShowTagSuggestions(false);
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Internal Notes */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-amber-800 mb-1">Internal Notes</h3>
                    <p className="text-xs text-amber-600 mb-3">
                      Private notes about this listing. Visible in the app only, NOT included on PDF statements.
                    </p>
                    <textarea
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Add notes about this listing (owner preferences, special instructions, etc.)"
                      className="w-full px-3 py-2 border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                      rows={3}
                    />
                  </div>

                  {/* Group Management */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-purple-700" />
                        <h3 className="text-sm font-medium text-purple-900">Listing Group</h3>
                      </div>
                    </div>
                    <p className="text-xs text-purple-700 mb-3">
                      Groups combine multiple listings into a single statement
                    </p>

                    {selectedListing.group ? (
                      <div className="space-y-3">
                        {/* Current Group Info */}
                        <div className="bg-white rounded-md p-3 border border-purple-200">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-medium text-purple-900">{selectedListing.group.name}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {selectedListing.group.tags?.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          {selectedListing.group.listingIds && selectedListing.group.listingIds.length > 1 && (
                            <div className="text-xs text-purple-700 mt-2">
                              <UsersIcon className="w-3 h-3 inline mr-1" />
                              Also includes:{' '}
                              {listings
                                .filter(l =>
                                  selectedListing.group?.listingIds?.includes(l.id) &&
                                  l.id !== selectedListing.id
                                )
                                .map(l => l.displayName || l.nickname || l.name)
                                .join(', ')}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditGroupModal(selectedListing.group!)}
                            className="flex-1 px-3 py-2 text-sm font-medium text-purple-700 bg-white border border-purple-300 rounded-md hover:bg-purple-50 transition-colors"
                          >
                            Edit Group
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedListing.group?.id && window.confirm('Remove this listing from the group?')) {
                                handleRemoveFromGroup(selectedListing.group.id, selectedListing.id);
                              }
                            }}
                            className="flex-1 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                          >
                            Remove from Group
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-purple-700 bg-white rounded-md p-3 border border-purple-200">
                          No group assigned
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={openCreateGroupModal}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Create New Group
                          </button>
                          {groups.length > 0 && (
                            <div className="relative flex-1">
                              <button
                                type="button"
                                onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-purple-300 rounded-md bg-white hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
                              >
                                <span className="text-gray-700">Add to Existing Group</span>
                                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isGroupDropdownOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {isGroupDropdownOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setIsGroupDropdownOpen(false)}
                                  />
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                                    {groups.map(group => (
                                      <button
                                        key={group.id}
                                        type="button"
                                        onClick={() => {
                                          handleAddToExistingGroup(group.id, selectedListing.id);
                                          setIsGroupDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 transition-colors flex items-center justify-between"
                                      >
                                        <span className="font-medium text-gray-900">{group.name}</span>
                                        <span className="text-xs text-purple-600">{group.tags?.join(', ')}</span>
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tag Schedule Modal */}
      <TagScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        tagName={scheduleTagName}
        existingSchedule={existingSchedule}
        onSave={handleSaveSchedule}
        onDelete={existingSchedule ? handleDeleteSchedule : undefined}
      />

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false);
          setEditingGroup(null);
        }}
        group={editingGroup}
        onSave={handleSaveGroup}
        allListings={listings}
        allGroups={groups}
      />
    </div>
  );
};

export default ListingsPage;
