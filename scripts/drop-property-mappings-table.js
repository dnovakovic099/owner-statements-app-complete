/**
 * Script to drop the property_mappings table from PostgreSQL
 * Run this once on Railway to clean up the old table
 */

const { sequelize } = require('../src/models');

async function dropPropertyMappingsTable() {
    try {
        console.log('🗑️  Dropping property_mappings table...\n');
        
        // Drop the table if it exists
        await sequelize.query('DROP TABLE IF EXISTS "property_mappings" CASCADE;');
        console.log('✅ Dropped property_mappings table');
        
        // Drop the enum type if it exists
        await sequelize.query('DROP TYPE IF EXISTS "public"."enum_property_mappings_mapping_type" CASCADE;');
        console.log('✅ Dropped enum_property_mappings_mapping_type enum type');
        
        console.log('\n✅ Cleanup complete!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await sequelize.close();
    }
}

dropPropertyMappingsTable()
    .then(() => {
        console.log('✅ Done!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });


