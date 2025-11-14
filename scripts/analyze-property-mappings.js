/**
 * Script to analyze property mapping gaps between Hostify and SecureStay
 * 
 * This script:
 * 1. Fetches all properties from Hostify
 * 2. Fetches all expenses from SecureStay (recent period)
 * 3. Identifies SecureStay listings that don't map to any Hostify property
 * 4. Suggests potential matches based on name similarity
 */

const HostifyService = require('../src/services/HostifyService');
const SecureStayService = require('../src/services/SecureStayService');
const PropertyMappingService = require('../src/services/PropertyMappingService');

// Simple string similarity function (Levenshtein distance)
function similarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

async function analyzePropertyMappings() {
    console.log('🔍 PROPERTY MAPPING ANALYSIS\n');
    console.log('=' .repeat(80));
    
    try {
        // 1. Fetch all Hostify properties
        console.log('\n📋 Step 1: Fetching all properties from Hostify...\n');
        const hostifyResponse = await HostifyService.getAllProperties();
        const hostifyProperties = hostifyResponse.result || [];
        
        console.log(`✅ Found ${hostifyProperties.length} Hostify properties\n`);
        
        // Create a map of Hostify properties
        const hostifyMap = new Map();
        const hostifyNames = [];
        
        for (const prop of hostifyProperties) {
            const nickname = prop.nickname || prop.name || `Property ${prop.id}`;
            hostifyMap.set(prop.id, {
                id: prop.id,
                name: prop.name,
                nickname: nickname,
                displayName: nickname
            });
            hostifyNames.push({
                id: prop.id,
                name: nickname.toLowerCase()
            });
        }
        
        // 2. Fetch recent expenses from SecureStay
        console.log('💰 Step 2: Fetching expenses from SecureStay (last 6 months)...\n');
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const expenses = await SecureStayService.getAllExpensesAndExtras(startDateStr, endDateStr, null);
        
        console.log(`✅ Found ${expenses.length} expenses/extras from SecureStay\n`);
        
        // 3. Get unique SecureStay listing names
        const secureStayListings = new Map();
        
        for (const expense of expenses) {
            if (expense.listing) {
                if (!secureStayListings.has(expense.listing)) {
                    secureStayListings.set(expense.listing, {
                        name: expense.listing,
                        listingId: expense.secureStayListingId,
                        expenseCount: 0
                    });
                }
                secureStayListings.get(expense.listing).expenseCount++;
            }
        }
        
        console.log(`📊 Found ${secureStayListings.size} unique SecureStay listings\n`);
        console.log('=' .repeat(80));
        
        // 4. Load database mappings once
        console.log('\n🔗 Step 3: Loading database mappings...\n');
        
        await PropertyMappingService.loadDatabaseMappings();
        const dbMappings = PropertyMappingService.dbMappingsCache;
        
        console.log(`✅ Loaded ${dbMappings.size} database mappings\n`);
        
        // Create reverse lookup: SecureStay name -> Hostify ID
        const reverseDbMappings = new Map();
        for (const [hostifyId, mapping] of dbMappings) {
            reverseDbMappings.set(mapping.listingName.toLowerCase().trim(), hostifyId);
        }
        
        // 5. Check mappings for each SecureStay listing
        console.log('🔗 Step 4: Checking mappings...\n');
        
        const unmappedListings = [];
        const mappedListings = [];
        
        for (const [listingName, listingData] of secureStayListings) {
            let matched = false;
            let matchedProperty = null;
            let matchType = 'none';
            
            const listingLower = listingName.toLowerCase().trim();
            
            // 1. Check database mappings first
            if (reverseDbMappings.has(listingLower)) {
                const hostifyId = reverseDbMappings.get(listingLower);
                matchedProperty = hostifyMap.get(hostifyId);
                matched = true;
                matchType = 'database';
            }
            
            // 2. Check exact match with Hostify names (case-insensitive)
            if (!matched) {
                for (const hostifyProp of hostifyNames) {
                    if (hostifyProp.name === listingLower) {
                        matched = true;
                        matchedProperty = hostifyMap.get(hostifyProp.id);
                        matchType = 'exact';
                        break;
                    }
                }
            }
            
            if (matched) {
                mappedListings.push({
                    secureStayName: listingName,
                    hostifyProperty: matchedProperty,
                    expenseCount: listingData.expenseCount,
                    matchType: matchType
                });
            } else {
                // Find potential matches based on similarity
                const potentialMatches = [];
                
                for (const hostifyProp of hostifyNames) {
                    const sim = similarity(listingLower, hostifyProp.name);
                    if (sim > 0.5) { // 50% similarity threshold
                        potentialMatches.push({
                            id: hostifyProp.id,
                            name: hostifyMap.get(hostifyProp.id).displayName,
                            similarity: sim
                        });
                    }
                }
                
                potentialMatches.sort((a, b) => b.similarity - a.similarity);
                
                unmappedListings.push({
                    secureStayName: listingName,
                    secureStayListingId: listingData.listingId,
                    expenseCount: listingData.expenseCount,
                    potentialMatches: potentialMatches.slice(0, 3) // Top 3 matches
                });
            }
        }
        
        // 5. Print results
        console.log('=' .repeat(80));
        console.log('\n✅ SUCCESSFULLY MAPPED LISTINGS:\n');
        console.log(`Total: ${mappedListings.length} listings\n`);
        
        for (const mapped of mappedListings) {
            const matchIcon = mapped.matchType === 'database' ? '🔧' : '✓';
            const matchLabel = mapped.matchType === 'database' ? 'DB MAPPING' : 'AUTO';
            console.log(`  ${matchIcon} "${mapped.secureStayName}" [${matchLabel}]`);
            console.log(`    → Hostify: ${mapped.hostifyProperty.displayName} (ID: ${mapped.hostifyProperty.id})`);
            console.log(`    → ${mapped.expenseCount} expense(s)\n`);
        }
        
        console.log('=' .repeat(80));
        console.log('\n⚠️  UNMAPPED LISTINGS (NEED ATTENTION):\n');
        console.log(`Total: ${unmappedListings.length} listings\n`);
        
        if (unmappedListings.length === 0) {
            console.log('  🎉 No unmapped listings! All SecureStay listings have Hostify matches.\n');
        } else {
            for (const unmapped of unmappedListings) {
                console.log(`  ❌ "${unmapped.secureStayName}"`);
                console.log(`     SecureStay ID: ${unmapped.secureStayListingId || 'N/A'}`);
                console.log(`     ${unmapped.expenseCount} expense(s) will be SKIPPED`);
                
                if (unmapped.potentialMatches.length > 0) {
                    console.log(`     Potential Hostify matches:`);
                    for (const match of unmapped.potentialMatches) {
                        console.log(`       • "${match.name}" (ID: ${match.id}) - ${(match.similarity * 100).toFixed(0)}% similar`);
                    }
                } else {
                    console.log(`     ⚠️  No similar Hostify properties found`);
                }
                console.log('');
            }
            
            console.log('=' .repeat(80));
            console.log('\n📝 RECOMMENDED ACTIONS:\n');
            console.log('1. Review the unmapped listings above');
            console.log('2. For each unmapped listing, either:');
            console.log('   a) Confirm one of the suggested Hostify matches');
            console.log('   b) Manually select the correct Hostify property');
            console.log('   c) Ignore if the listing is no longer active\n');
            console.log('3. Once confirmed, the mapping will be saved to the database');
            console.log('4. Future statements will automatically use the saved mappings\n');
        }
        
        console.log('=' .repeat(80));
        console.log('\n📊 SUMMARY:\n');
        console.log(`  Hostify Properties: ${hostifyProperties.length}`);
        console.log(`  SecureStay Listings: ${secureStayListings.size}`);
        console.log(`  Mapped: ${mappedListings.length}`);
        console.log(`  Unmapped: ${unmappedListings.length}`);
        console.log(`  Total Expenses: ${expenses.length}`);
        
        const unmappedExpenseCount = unmappedListings.reduce((sum, u) => sum + u.expenseCount, 0);
        console.log(`  Expenses at risk: ${unmappedExpenseCount}`);
        console.log('');
        
        if (unmappedListings.length > 0) {
            console.log('⚠️  WARNING: Some expenses will be missing from statements until mappings are created!\n');
        }
        
    } catch (error) {
        console.error('❌ Error during analysis:', error);
        console.error(error.stack);
    }
}

// Run the analysis
analyzePropertyMappings()
    .then(() => {
        console.log('✅ Analysis complete!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });

