/**
 * Service to map between Hostify property IDs and SecureStay listing names
 * This service uses Hostify's nickname or name field to automatically map to SecureStay
 * 
 * SECURITY NOTE: This mapping uses Hostify's nickname/name field
 * which should match SecureStay listing names for automatic mapping
 */

const PropertyMapping = require('../models/PropertyMapping');

class PropertyMappingService {
    constructor() {
        // Legacy manual overrides (will be migrated to database on first use)
        this.legacyOverrides = {
            // St Louis property - Hostify has "St Louis" but SecureStay uses "St Louis (#2E)"
            300017057: "St Louis (#2E)",
            // 101st property - Hostify has "101st - Kurush" but SecureStay uses "101st full house - Kurush"
            300017826: "101st full house - Kurush",
        };
        
        // Cache for Hostify listing data to avoid repeated API calls
        this.hostawayListingCache = new Map();
        
        // Cache for database mappings
        this.dbMappingsCache = new Map();
        this.dbCacheExpiry = null;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        
        // Migrate legacy overrides to database on initialization
        this.migrateLegacyOverrides();
    }
    
    /**
     * Migrate legacy in-memory overrides to database
     */
    async migrateLegacyOverrides() {
        try {
            for (const [propertyId, listingName] of Object.entries(this.legacyOverrides)) {
                const existing = await PropertyMapping.findOne({
                    where: { hostifyPropertyId: parseInt(propertyId) }
                });
                
                if (!existing) {
                    await PropertyMapping.create({
                        hostifyPropertyId: parseInt(propertyId),
                        secureStayListingName: listingName,
                        mappingType: 'manual',
                        notes: 'Migrated from legacy overrides'
                    });
                    console.log(`✅ Migrated legacy mapping: ${propertyId} → ${listingName}`);
                }
            }
        } catch (error) {
            console.warn('⚠️  Could not migrate legacy overrides:', error.message);
        }
    }
    
    /**
     * Load all active mappings from database into cache
     */
    async loadDatabaseMappings() {
        try {
            const now = Date.now();
            // Return cached mappings if still valid
            if (this.dbCacheExpiry && now < this.dbCacheExpiry) {
                return;
            }
            
            const mappings = await PropertyMapping.findAll({
                where: { isActive: true }
            });
            
            this.dbMappingsCache.clear();
            for (const mapping of mappings) {
                this.dbMappingsCache.set(
                    mapping.hostifyPropertyId,
                    {
                        listingName: mapping.secureStayListingName,
                        listingId: mapping.secureStayListingId,
                        type: mapping.mappingType
                    }
                );
            }
            
            this.dbCacheExpiry = now + this.CACHE_TTL;
            console.log(`✅ Loaded ${mappings.length} property mappings from database`);
        } catch (error) {
            console.warn('⚠️  Could not load database mappings:', error.message);
        }
    }
    
    /**
     * Save a new property mapping to database
     * @param {number} hostifyPropertyId - Hostify property ID
     * @param {string} secureStayListingName - SecureStay listing name
     * @param {object} options - Additional options (hostifyPropertyName, secureStayListingId, notes, etc.)
     * @returns {Promise<object>} - Created mapping
     */
    async saveMapping(hostifyPropertyId, secureStayListingName, options = {}) {
        try {
            const mapping = await PropertyMapping.upsert({
                hostifyPropertyId: parseInt(hostifyPropertyId),
                secureStayListingName,
                hostifyPropertyName: options.hostifyPropertyName || null,
                secureStayListingId: options.secureStayListingId || null,
                mappingType: options.mappingType || 'manual',
                notes: options.notes || null,
                createdBy: options.createdBy || 'system',
                lastVerified: new Date(),
                isActive: true
            });
            
            // Invalidate cache
            this.dbCacheExpiry = null;
            
            console.log(`✅ Saved property mapping: ${hostifyPropertyId} → ${secureStayListingName}`);
            return mapping[0];
        } catch (error) {
            console.error(`❌ Error saving property mapping:`, error);
            throw error;
        }
    }
    
    /**
     * Get all active mappings from database
     * @returns {Promise<Array>} - Array of mappings
     */
    async getAllMappings() {
        try {
            return await PropertyMapping.findAll({
                where: { isActive: true },
                order: [['hostify_property_name', 'ASC']]
            });
        } catch (error) {
            console.error('❌ Error fetching mappings:', error);
            return [];
        }
    }
    
    /**
     * Delete a property mapping
     * @param {number} hostifyPropertyId - Hostify property ID
     * @returns {Promise<boolean>} - Success status
     */
    async deleteMapping(hostifyPropertyId) {
        try {
            await PropertyMapping.update(
                { isActive: false },
                { where: { hostifyPropertyId: parseInt(hostifyPropertyId) } }
            );
            
            // Invalidate cache
            this.dbCacheExpiry = null;
            
            console.log(`✅ Deleted property mapping for ${hostifyPropertyId}`);
            return true;
        } catch (error) {
            console.error(`❌ Error deleting property mapping:`, error);
            return false;
        }
    }
    
    /**
     * Get SecureStay listing name using Hostify's nickname or name
     * @param {number} propertyId - Hostify property ID
     * @returns {Promise<string|null>} - SecureStay listing name or null if not found
     */
    async getSecureStayListingName(propertyId) {
        // Load database mappings if not cached
        await this.loadDatabaseMappings();
        
        // Check database mappings first
        if (this.dbMappingsCache.has(propertyId)) {
            const mapping = this.dbMappingsCache.get(propertyId);
            console.log(`✅ Found database mapping for property ${propertyId}: "${mapping.listingName}" (${mapping.type})`);
            return mapping.listingName;
        }
        
        try {
            // Get Hostify listing data for auto-mapping
            const listingData = await this.getHostifyListingData(propertyId);
            if (listingData) {
                // Try nickname first, then name
                const listingName = listingData.nickname || listingData.name;
                if (listingName) {
                    console.log(`🤖 Auto-mapped property ${propertyId} to SecureStay listing: "${listingName}"`);
                    return listingName;
                }
            }
        } catch (error) {
            console.warn(`Failed to get Hostify listing data for property ${propertyId}:`, error.message);
        }
        
        console.warn(`⚠️  No SecureStay mapping found for property ${propertyId}`);
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
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Created mapping
     */
    async addManualOverride(propertyId, listingName, options = {}) {
        console.log(`➕ Adding manual override mapping: ${propertyId} → ${listingName}`);
        return await this.saveMapping(propertyId, listingName, {
            ...options,
            mappingType: 'manual'
        });
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
