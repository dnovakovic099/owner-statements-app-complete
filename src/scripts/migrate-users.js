/**
 * Migration script to create the users table
 * Run with: node src/scripts/migrate-users.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function migrate() {
    console.log('Starting users table migration...');

    try {
        // Check connection
        await sequelize.authenticate();
        console.log('Database connection established');

        // Check if table exists using QueryInterface
        const queryInterface = sequelize.getQueryInterface();
        const tables = await queryInterface.showAllTables();

        if (tables.includes('users')) {
            console.log('Users table already exists, skipping creation');
        } else {
            // Create users table
            await sequelize.query(`
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) NOT NULL UNIQUE,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password VARCHAR(255),
                    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
                    invite_token VARCHAR(64),
                    invite_expires TIMESTAMP,
                    invite_accepted BOOLEAN NOT NULL DEFAULT false,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    last_login TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('Users table created successfully');

            // Create indexes
            await sequelize.query(`
                CREATE INDEX IF NOT EXISTS users_invite_token_idx ON users(invite_token);
            `);
            console.log('Indexes created');
        }

        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
