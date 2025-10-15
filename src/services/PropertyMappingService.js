/**
 * Service to map between Hostaway property IDs and SecureStay listing names
 * This service uses Hostaway's internalListingName field to automatically map to SecureStay
 * 
 * SECURITY NOTE: This mapping uses Hostaway's internalListingName field
 * which should match SecureStay listing names for automatic mapping
 */

class PropertyMappingService {
    constructor() {
        // Manual override mapping for properties where internalListingName doesn't match SecureStay
        // Only add entries here if the automatic mapping fails
        this.manualOverrides = {
            // Example: 170031: "CustomSecureStayName", // if internalListingName doesn't match
        };
        
        // Cache for Hostaway listing data to avoid repeated API calls
        this.hostawayListingCache = new Map();
    }
    
    /**
     * Get SecureStay listing name using Hostaway's internalListingName
     * @param {number} propertyId - Hostaway property ID
     * @returns {Promise<string|null>} - SecureStay listing name or null if not found
     */
    async getSecureStayListingName(propertyId) {
        // Check manual overrides first
        if (this.manualOverrides[propertyId]) {
            return this.manualOverrides[propertyId];
        }
        
        try {
            // Get Hostaway listing data
            const listingData = await this.getHostawayListingData(propertyId);
            if (listingData && listingData.internalListingName) {
                console.log(`Auto-mapped property ${propertyId} to SecureStay listing: "${listingData.internalListingName}"`);
                return listingData.internalListingName;
            }
        } catch (error) {
            console.warn(`Failed to get Hostaway listing data for property ${propertyId}:`, error.message);
        }
        
        console.warn(`No SecureStay mapping found for property ${propertyId}`);
        return null;
    }
    
    /**
     * Get Hostaway listing data with caching
     * @param {number} propertyId - Hostaway property ID
     * @returns {Promise<object|null>} - Hostaway listing data
     */
    async getHostawayListingData(propertyId) {
        // Check cache first
        if (this.hostawayListingCache.has(propertyId)) {
            return this.hostawayListingCache.get(propertyId);
        }
        
        try {
            const HostawayService = require('./HostawayService');
            const response = await HostawayService.makeRequest(`/listings/${propertyId}`);
            const listingData = response.result;
            
            // Cache the result
            this.hostawayListingCache.set(propertyId, listingData);
            return listingData;
        } catch (error) {
            console.error(`Failed to fetch Hostaway listing ${propertyId}:`, error.message);
            return null;
        }
    }
    
    /**
     * Add a manual override mapping
     * @param {number} propertyId - Hostaway property ID
     * @param {string} listingName - SecureStay listing name
     */
    addManualOverride(propertyId, listingName) {
        console.warn(`Adding manual override mapping: ${propertyId} -> ${listingName}`);
        this.manualOverrides[propertyId] = listingName;
    }
    
    /**
     * Get mapping status for a property
     * @param {number} propertyId - Hostaway property ID
     * @returns {Promise<object>} - Status object with mapping info
     */
    async getMappingStatus(propertyId) {
        const listingName = await this.getSecureStayListingName(propertyId);
        const listingData = await this.getHostawayListingData(propertyId);
        
        return {
            propertyId,
            listingName,
            isValidMapping: listingName !== null,
            isManualOverride: propertyId in this.manualOverrides,
            hostawayInternalName: listingData?.internalListingName || null,
            hostawayName: listingData?.name || null
        };
    }
    
    /**
     * Log mapping status for debugging
     * @param {number[]} propertyIds - Array of property IDs to check
     */
    async logMappingStatus(propertyIds = []) {
        console.log('=== Property Mapping Status ===');
        for (const propertyId of propertyIds) {
            const status = await this.getMappingStatus(propertyId);
            const mappingType = status.isManualOverride ? '🔧 MANUAL' : '🤖 AUTO';
            const statusIcon = status.isValidMapping ? '✅ MAPPED' : '⚠️  NO MAPPING';
            console.log(`Property ${propertyId}: "${status.listingName || 'NO MAPPING'}" ${mappingType} ${statusIcon}`);
            if (status.hostawayInternalName) {
                console.log(`  └─ Hostaway Internal: "${status.hostawayInternalName}"`);
            }
        }
        console.log('===============================');
    }
}

module.exports = new PropertyMappingService();
