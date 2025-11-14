/**
 * Script to automatically create property mappings
 * - Auto-maps listings with 95%+ similarity
 * - Asks user for confirmation on uncertain matches
 */

const HostifyService = require('../src/services/HostifyService');
const SecureStayService = require('../src/services/SecureStayService');
const PropertyMappingService = require('../src/services/PropertyMappingService');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// Simple string similarity function
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

async function autoCreateMappings() {
    console.log('🔧 AUTO-CREATING PROPERTY MAPPINGS\n');
    console.log('=' .repeat(80));
    
    try {
        // 1. Fetch data
        console.log('\n📋 Fetching Hostify properties...\n');
        const hostifyResponse = await HostifyService.getAllProperties();
        const hostifyProperties = hostifyResponse.result || [];
        
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
                name: nickname.toLowerCase().trim()
            });
        }
        
        console.log(`✅ Found ${hostifyProperties.length} Hostify properties\n`);
        
        // 2. Fetch expenses
        console.log('💰 Fetching SecureStay expenses (last 6 months)...\n');
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const expenses = await SecureStayService.getAllExpensesAndExtras(startDateStr, endDateStr, null);
        
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
        
        console.log(`✅ Found ${secureStayListings.size} unique SecureStay listings\n`);
        
        // 3. Load existing database mappings
        await PropertyMappingService.loadDatabaseMappings();
        const dbMappings = PropertyMappingService.dbMappingsCache;
        
        console.log(`📚 Loaded ${dbMappings.size} existing database mappings\n`);
        console.log('=' .repeat(80));
        
        // Create reverse lookup
        const reverseDbMappings = new Map();
        for (const [hostifyId, mapping] of dbMappings) {
            reverseDbMappings.set(mapping.listingName.toLowerCase().trim(), hostifyId);
        }
        
        // 4. Find unmapped listings
        const unmappedListings = [];
        
        for (const [listingName, listingData] of secureStayListings) {
            const listingLower = listingName.toLowerCase().trim();
            
            // Check if already mapped (database or exact match)
            let alreadyMapped = false;
            
            if (reverseDbMappings.has(listingLower)) {
                alreadyMapped = true;
            } else {
                for (const hostifyProp of hostifyNames) {
                    if (hostifyProp.name === listingLower) {
                        alreadyMapped = true;
                        break;
                    }
                }
            }
            
            if (!alreadyMapped) {
                // Find best match
                let bestMatch = null;
                let bestSimilarity = 0;
                
                for (const hostifyProp of hostifyNames) {
                    const sim = similarity(listingLower, hostifyProp.name);
                    if (sim > bestSimilarity) {
                        bestSimilarity = sim;
                        bestMatch = {
                            id: hostifyProp.id,
                            name: hostifyMap.get(hostifyProp.id).displayName,
                            similarity: sim
                        };
                    }
                }
                
                unmappedListings.push({
                    secureStayName: listingName,
                    secureStayListingId: listingData.listingId,
                    expenseCount: listingData.expenseCount,
                    bestMatch: bestMatch
                });
            }
        }
        
        console.log(`\n🔍 Found ${unmappedListings.length} unmapped listings\n`);
        console.log('=' .repeat(80));
        
        // 5. Process mappings
        const autoMapped = [];
        const needsConfirmation = [];
        
        for (const unmapped of unmappedListings) {
            if (unmapped.bestMatch && unmapped.bestMatch.similarity >= 0.95) {
                autoMapped.push(unmapped);
            } else {
                needsConfirmation.push(unmapped);
            }
        }
        
        console.log(`\n✅ ${autoMapped.length} listings can be auto-mapped (95%+ confidence)`);
        console.log(`⚠️  ${needsConfirmation.length} listings need manual confirmation\n`);
        console.log('=' .repeat(80));
        
        // 6. Auto-create high-confidence mappings
        if (autoMapped.length > 0) {
            console.log('\n🤖 AUTO-MAPPING HIGH-CONFIDENCE MATCHES:\n');
            
            for (const unmapped of autoMapped) {
                console.log(`  ✓ "${unmapped.secureStayName}"`);
                console.log(`    → "${unmapped.bestMatch.name}" (${(unmapped.bestMatch.similarity * 100).toFixed(1)}% match)`);
                console.log(`    → ${unmapped.expenseCount} expense(s)\n`);
                
                await PropertyMappingService.saveMapping(
                    unmapped.bestMatch.id,
                    unmapped.secureStayName,
                    {
                        hostifyPropertyName: unmapped.bestMatch.name,
                        secureStayListingId: unmapped.secureStayListingId,
                        mappingType: 'manual',
                        notes: `Auto-created by script (${(unmapped.bestMatch.similarity * 100).toFixed(1)}% similarity)`,
                        createdBy: 'auto-mapping-script'
                    }
                );
            }
        }
        
        // 7. Ask user for confirmation on uncertain matches
        if (needsConfirmation.length > 0) {
            console.log('\n⚠️  UNCERTAIN MATCHES - NEED YOUR CONFIRMATION:\n');
            console.log('=' .repeat(80));
            
            for (const unmapped of needsConfirmation) {
                console.log(`\n📍 SecureStay: "${unmapped.secureStayName}"`);
                console.log(`   Expenses: ${unmapped.expenseCount}`);
                
                if (unmapped.bestMatch) {
                    console.log(`   Best match: "${unmapped.bestMatch.name}" (${(unmapped.bestMatch.similarity * 100).toFixed(1)}% similar)`);
                    console.log(`   Hostify ID: ${unmapped.bestMatch.id}\n`);
                    
                    const answer = await question('   Map to this property? (y/n/skip): ');
                    
                    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                        await PropertyMappingService.saveMapping(
                            unmapped.bestMatch.id,
                            unmapped.secureStayName,
                            {
                                hostifyPropertyName: unmapped.bestMatch.name,
                                secureStayListingId: unmapped.secureStayListingId,
                                mappingType: 'manual',
                                notes: `Manually confirmed (${(unmapped.bestMatch.similarity * 100).toFixed(1)}% similarity)`,
                                createdBy: 'manual-confirmation'
                            }
                        );
                        console.log('   ✅ Mapping created!\n');
                    } else if (answer.toLowerCase() === 'skip' || answer.toLowerCase() === 's') {
                        console.log('   ⏭️  Skipped\n');
                    } else {
                        console.log('   ❌ Not mapped\n');
                    }
                } else {
                    console.log('   ⚠️  No similar Hostify properties found');
                    console.log('   This listing will be skipped in statements.\n');
                    
                    const answer = await question('   Press Enter to continue...');
                }
            }
        }
        
        console.log('\n' + '=' .repeat(80));
        console.log('\n✅ MAPPING COMPLETE!\n');
        console.log(`  Auto-mapped: ${autoMapped.length}`);
        console.log(`  Total unmapped processed: ${unmappedListings.length}`);
        console.log('');
        
    } catch (error) {
        console.error('❌ Error:', error);
        console.error(error.stack);
    } finally {
        rl.close();
    }
}

// Run the script
autoCreateMappings()
    .then(() => {
        console.log('✅ Done!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });

