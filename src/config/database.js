const { Sequelize } = require('sequelize');

// Railway provides DATABASE_URL automatically when PostgreSQL is provisioned
// For local development, use SQLite
const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

let sequelize;

if (databaseUrl && databaseUrl.startsWith('postgres')) {
    // PostgreSQL connection
    // Mask the password in the URL for logging
    const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`[DB] Connecting to PostgreSQL database: ${maskedUrl}`);

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
    console.log(`[DB] Connecting to SQLite database: ${sqlitePath}`);
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: sqlitePath,
        logging: false
    });
} else {
    // Fallback: Use default SQLite location
    console.log('[DB] Using default SQLite database: ./database.sqlite');
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite',
        logging: false
    });
}

// Test connection
sequelize.authenticate()
    .then(() => {
        console.log('[DB] Connection established successfully');
    })
    .catch(err => {
        console.error('[DB] Error: Unable to connect to database:', err.message);
    });

module.exports = sequelize;

