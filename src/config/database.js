const { Sequelize } = require('sequelize');

// Railway provides DATABASE_URL automatically when PostgreSQL is provisioned
// For local development, use SQLite
const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

let sequelize;

if (databaseUrl) {
    // Production: Use PostgreSQL from Railway
    console.log('🔧 Connecting to PostgreSQL database...');
    sequelize = new Sequelize(databaseUrl, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Railway uses self-signed certificates
            }
        },
        logging: false, // Set to console.log to see SQL queries
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    });
} else {
    // Local development: Use SQLite
    console.log('🔧 Using SQLite database for local development...');
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite',
        logging: false
    });
}

// Test connection
sequelize.authenticate()
    .then(() => {
        console.log('✅ Database connection established successfully');
    })
    .catch(err => {
        console.error('❌ Unable to connect to database:', err.message);
    });

module.exports = sequelize;

