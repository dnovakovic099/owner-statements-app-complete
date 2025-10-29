/**
 * Service to map between Hostify property IDs and SecureStay listing names
 * This service uses Hostify's nickname or name field to automatically map to SecureStay
 * 
 * SECURITY NOTE: This mapping uses Hostify's nickname/name field
 * which should match SecureStay listing names for automatic mapping
 */

class PropertyMappingService {
    constructor() {
        // Manual override mapping for properties where nickname/name doesn't match SecureStay
        // Only add entries here if the automatic mapping fails
        this.manualOverrides = {
            // St Louis property - Hostify has "St Louis" but SecureStay uses "St Louis (#2E)"
            300017057: "St Louis (#2E)",
        };
        
        // Cache for Hostify listing data to avoid repeated API calls
        this.hostawayListingCache = new Map();
    }
    
    /**
     * Get SecureStay listing name using Hostify's nickname or name
     * @param {number} propertyId - Hostify property ID
     * @returns {Promise<string|null>} - SecureStay listing name or null if not found
     */
    async getSecureStayListingName(propertyId) {
        // Check manual overrides first
        if (this.manualOverrides[propertyId]) {
            return this.manualOverrides[propertyId];
        }
        
        try {
            // Get Hostify listing data
            const listingData = await this.getHostifyListingData(propertyId);
            if (listingData) {
                // Try nickname first, then name
                const listingName = listingData.nickname || listingData.name;
                if (listingName) {
                    console.log(`Auto-mapped property ${propertyId} to SecureStay listing: "${listingName}"`);
                    return listingName;
                }
            }
        } catch (error) {
            console.warn(`Failed to get Hostify listing data for property ${propertyId}:`, error.message);
        }
        
        console.warn(`No SecureStay mapping found for property ${propertyId}`);
        return null;
    }
    
    /**
     * Get Hostify listing data with caching
     * @param {number} propertyId - Hostify property ID
     * @returns {Promise<object|null>} - Hostify listing data
     */
    async getHostifyListingData(propertyId) {
        // Check cache first
        if (this.hostawayListingCache.has(propertyId)) {
            return this.hostawayListingCache.get(propertyId);
        }
        
        try {
            const HostifyService = require('./HostifyService');
            const response = await HostifyService.getProperty(propertyId);
            const listingData = response.success ? response.listing : null;
            
            // Cache the result
            this.hostawayListingCache.set(propertyId, listingData);
            return listingData;
        } catch (error) {
            console.error(`Failed to fetch Hostify listing ${propertyId}:`, error.message);
            return null;
        }
    }
    
    // Backward compatibility alias
    async getHostawayListingData(propertyId) {
        return this.getHostifyListingData(propertyId);
    }
    
    /**
     * Add a manual override mapping
     * @param {number} propertyId - Hostify property ID
     * @param {string} listingName - SecureStay listing name
     */
    addManualOverride(propertyId, listingName) {
        console.warn(`Adding manual override mapping: ${propertyId} -> ${listingName}`);
        this.manualOverrides[propertyId] = listingName;
    }
    
    /**
     * Get mapping status for a property
     * @param {number} propertyId - Hostify property ID
     * @returns {Promise<object>} - Status object with mapping info
     */
    async getMappingStatus(propertyId) {
        const listingName = await this.getSecureStayListingName(propertyId);
        const listingData = await this.getHostifyListingData(propertyId);
        
        return {
            propertyId,
            listingName,
            isValidMapping: listingName !== null,
            isManualOverride: propertyId in this.manualOverrides,
            hostifyNickname: listingData?.nickname || null,
            hostifyName: listingData?.name || null
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
            if (status.hostifyNickname || status.hostifyName) {
                console.log(`  └─ Hostify Nickname: "${status.hostifyNickname || status.hostifyName}"`);
            }
        }
        console.log('===============================');
    }
}

module.exports = new PropertyMappingService();
