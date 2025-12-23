/**
 * Seed the LL admin user (system user - cannot be deleted)
 * Run with: node src/scripts/seed-admin-user.js
 */

require('dotenv').config();
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

async function seedAdminUser() {
    console.log('Seeding admin user...');

    try {
        await sequelize.authenticate();
        console.log('Database connection established');

        // First ensure the is_system_user column exists
        try {
            await sequelize.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_user BOOLEAN NOT NULL DEFAULT false;
            `);
            console.log('Ensured is_system_user column exists');
        } catch (err) {
            // Column might already exist
            console.log('is_system_user column check complete');
        }

        // Check if LL user already exists
        const [existing] = await sequelize.query(`
            SELECT id FROM users WHERE username = 'LL' LIMIT 1;
        `);

        if (existing.length > 0) {
            // Update existing user to be system user
            await sequelize.query(`
                UPDATE users
                SET is_system_user = true, role = 'admin', is_active = true
                WHERE username = 'LL';
            `);
            console.log('Updated existing LL user to system admin');
        } else {
            // Create new LL user
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('bnb547!', salt);

            await sequelize.query(`
                INSERT INTO users (username, email, password, role, invite_accepted, is_active, is_system_user, created_at, updated_at)
                VALUES ('LL', 'admin@luxurylodgingpm.com', :password, 'admin', true, true, true, NOW(), NOW());
            `, {
                replacements: { password: hashedPassword }
            });
            console.log('Created LL system admin user');
        }

        console.log('Admin user seeded successfully');
    } catch (error) {
        console.error('Seed failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

seedAdminUser();
