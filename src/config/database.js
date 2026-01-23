const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Railway provides DATABASE_URL automatically when PostgreSQL is provisioned
// For local development, use SQLite
const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

let sequelize;

if (databaseUrl && databaseUrl.startsWith('postgres')) {
    // PostgreSQL connection
    // PostgreSQL connection
    const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    logger.info('Connecting to PostgreSQL database', { context: 'DB' });

    // Check if connecting to localhost (no SSL needed)
    const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

    const dialectOptions = isLocalhost ? {} : {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    };

    sequelize = new Sequelize(databaseUrl, {
        dialect: 'postgres',
        dialectOptions,
        logging: false, // Set to console.log to see SQL queries
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    });
} else if (databaseUrl && databaseUrl.startsWith('sqlite')) {
    // SQLite from DATABASE_URL
    const sqlitePath = databaseUrl.replace('sqlite:', '');
    logger.info('Connecting to SQLite database', { context: 'DB', path: sqlitePath });
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: sqlitePath,
        logging: false
    });
} else {
    // Fallback: Use default SQLite location
    logger.info('Using default SQLite database', { context: 'DB', path: './database.sqlite' });
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite',
        logging: false
    });
}

// Test connection
sequelize.authenticate()
    .then(() => {
        logger.info('Connection established successfully', { context: 'DB' });
    })
    .catch(err => {
        logger.error('Unable to connect to database', { context: 'DB', error: err.message });
    });

module.exports = sequelize;

