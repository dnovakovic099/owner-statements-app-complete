# Database Migration Guide

This guide documents the migration from file-based storage to PostgreSQL database for Railway deployment.

## Overview

The application now uses:
- **PostgreSQL** on Railway (production)
- **SQLite** for local development (no setup needed)

All statements and uploaded expenses are now stored in the database instead of JSON files.

## What Changed

### 1. Database Configuration
**File**: `src/config/database.js`
- Auto-detects `DATABASE_URL` for PostgreSQL (Railway provides this automatically)
- Falls back to SQLite (`database.sqlite`) for local development
- Handles SSL certificates for Railway's PostgreSQL

### 2. Database Models
**Files**: 
- `src/models/Statement.js` - Stores all generated statements
- `src/models/UploadedExpense.js` - Stores manually uploaded expenses
- `src/models/index.js` - Exports models and database sync function

### 3. Database Service
**File**: `src/services/DatabaseService.js`
- All CRUD operations for statements and expenses
- Replaces file read/write operations
- Supports filtering and searching

### 4. Updated Services
- **`FileDataService.js`**: Now uses DatabaseService for statements
- **`ExpenseUploadService.js`**: Now saves to database instead of JSON files

### 5. Frontend Improvements
- **`GenerateModal.tsx`**: 
  - Shows loading spinner while generating
  - Automatically closes modal after successful generation
  - Displays "Generating..." message with animation

## Local Development

### First Time Setup
1. Install dependencies (already done):
   ```bash
   npm install sequelize sqlite3 pg pg-hstore
   ```

2. Start the server:
   ```bash
   npm start
   ```

   The database will auto-initialize on first run.

### Testing
- Database file is created at: `database.sqlite`
- It's automatically ignored by git (added to `.gitignore`)
- Delete `database.sqlite` to start fresh anytime

## Railway Deployment

### Automatic Setup
1. **Add PostgreSQL to Railway**:
   - Go to your Railway project
   - Click "New" → "Database" → "PostgreSQL"
   - Railway automatically sets `DATABASE_URL` environment variable

2. **Deploy**:
   ```bash
   git push origin main
   ```
   
   Railway will:
   - Detect the PostgreSQL database
   - Run migrations automatically
   - Connect your app to the database

### Manual Migration (Optional)
If you have existing data in JSON files on Railway, run:
```bash
node scripts/migrate-to-database.js
```

This script:
- Reads all statement files from `statements/` directory
- Reads all uploaded expenses from `uploads/expenses/` directory
- Imports them into the database
- Skips duplicates automatically

## Database Schema

### Statements Table
```sql
CREATE TABLE statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  property_id INTEGER,
  property_name VARCHAR(255),
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  calculation_type VARCHAR(50) DEFAULT 'checkout',
  total_revenue DECIMAL(10,2) DEFAULT 0,
  total_expenses DECIMAL(10,2) DEFAULT 0,
  pm_commission DECIMAL(10,2) DEFAULT 0,
  pm_percentage DECIMAL(5,2) DEFAULT 15,
  tech_fees DECIMAL(10,2) DEFAULT 0,
  insurance_fees DECIMAL(10,2) DEFAULT 0,
  adjustments DECIMAL(10,2) DEFAULT 0,
  owner_payout DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'draft',
  sent_at TIMESTAMP,
  reservations JSON,
  expenses JSON,
  items JSON,
  duplicate_warnings JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Uploaded Expenses Table
```sql
CREATE TABLE uploaded_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER,
  type VARCHAR(50) DEFAULT 'other',
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  date DATE NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  source_id VARCHAR(255),
  invoice_number VARCHAR(255),
  vendor VARCHAR(255),
  category VARCHAR(255),
  notes TEXT,
  listing VARCHAR(255),
  upload_filename VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Changes

### Statements API
- `POST /api/statements/generate` - Now saves to database
- `GET /api/statements` - Fetches from database with filtering
- `DELETE /api/statements/:id` - Deletes from database
- `PUT /api/statements/:id` - Updates in database

### Expenses API
- `POST /api/expenses/upload` - Now saves to database
- `GET /api/expenses/uploaded` - Fetches from database

## Benefits

✅ **Scalability**: Database handles large datasets better than files
✅ **Performance**: Faster queries with indexes
✅ **Reliability**: ACID compliance, no file corruption
✅ **Railway Ready**: Native PostgreSQL support
✅ **Search & Filter**: Advanced queries available
✅ **Concurrent Access**: Multiple users can access simultaneously
✅ **Backups**: Railway provides automatic database backups

## Troubleshooting

### Local Development Issues

**Database locked error**:
- Stop any running instances of the server
- Delete `database.sqlite` and restart

**Schema errors**:
```bash
rm database.sqlite
npm start
```

### Railway Issues

**Connection errors**:
- Verify PostgreSQL is added to your project
- Check `DATABASE_URL` is set in environment variables

**Migration needed**:
- Run the migration script in Railway console:
  ```bash
  node scripts/migrate-to-database.js
  ```

## Rollback (If Needed)

The old JSON files are preserved. To rollback:
1. Revert the database changes via git
2. Old file-based system will work as before

## Questions?

- Database files are in: `src/models/`
- Database service: `src/services/DatabaseService.js`
- Migration script: `scripts/migrate-to-database.js`

