# PM Fee Management System

## Overview

The PM Fee Management System stores Property Management fee percentages for each listing in the database. This allows custom PM fees per property that persist across deployments.

---

## Database Schema

### `listings` Table

```sql
CREATE TABLE listings (
  id INTEGER PRIMARY KEY,               -- Hostify listing ID
  name VARCHAR(255) NOT NULL,
  nickname VARCHAR(255),
  street VARCHAR(255),
  city VARCHAR(255),
  state VARCHAR(255),
  country VARCHAR(255),
  pm_fee_percentage DECIMAL(5,2),       -- PM fee (e.g., 15.00 for 15%)
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## How It Works

### 1. **On Server Startup**
- ✅ Auto-syncs all listings from Hostify
- ✅ Updates listing info (name, location, etc.)
- ✅ **Preserves existing PM fees** (doesn't overwrite)
- ✅ New listings get default 15% PM fee

### 2. **PM Fee Storage**
- PM fees are stored in `data/all-listings-*.csv`
- Format: `ID,Name,Internal Name,PM %`
- Example:
  ```csv
  300017057,Private Gym • 2BR,St Louis,15.00%
  300017554,Outdoor Kitchen,Alan,10.00%
  ```

### 3. **Import Process**
```bash
# Local development
npm run import-listings

# On Railway (automatic)
# Runs before server starts via railway.json
```

---

## API Endpoints

### GET `/api/listings`
Get all listings with PM fees
```bash
curl http://localhost:3003/api/listings
```

### GET `/api/listings/:id`
Get single listing with PM fee
```bash
curl http://localhost:3003/api/listings/300017057
```

### GET `/api/listings/status/missing-pm-fees`
Get listings without PM fees set
```bash
curl http://localhost:3003/api/listings/status/missing-pm-fees
```

### PUT `/api/listings/:id/pm-fee`
Update PM fee for a listing
```bash
curl -X PUT http://localhost:3003/api/listings/300017057/pm-fee \
  -H "Content-Type: application/json" \
  -d '{"pmFeePercentage": 12.5}'
```

### POST `/api/listings/bulk-update-pm-fees`
Bulk update PM fees
```bash
curl -X POST http://localhost:3003/api/listings/bulk-update-pm-fees \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"listingId": 300017057, "pmFeePercentage": 12.5},
      {"listingId": 300017554, "pmFeePercentage": 10.0}
    ]
  }'
```

### POST `/api/listings/sync`
Manually sync listings from Hostify
```bash
curl -X POST http://localhost:3003/api/listings/sync
```

---

## Local Development

### 1. **Add Listings CSV**
Place your CSV file in `data/` directory:
```
data/all-listings-YYYY-MM-DD.csv
```

### 2. **Update Import Script**
If filename changes, update in:
```javascript
// scripts/import-listings-to-db.js
const csvFile = path.join(__dirname, '../data/YOUR_FILE.csv');
```

### 3. **Run Import**
```bash
npm run import-listings
```

### 4. **Start Server**
```bash
npm start
```

Server will auto-sync listings from Hostify on startup.

---

## Railway Deployment

### **Automatic Process**

Railway automatically runs the import on every deployment via `railway.json`:

```json
{
  "deploy": {
    "startCommand": "npm run import-listings && npm start"
  }
}
```

**Flow:**
1. Railway detects git push
2. Builds app
3. Runs `npm run import-listings` (loads PM fees from CSV)
4. Runs `npm start` (starts server, syncs from Hostify)
5. ✅ PM fees preserved, listing info updated

### **Requirements**
- ✅ `data/all-listings-*.csv` committed to git
- ✅ PostgreSQL database provisioned in Railway
- ✅ `DATABASE_URL` environment variable set automatically

---

## Updating PM Fees

### **Method 1: Update CSV File**
1. Edit `data/all-listings-*.csv`
2. Change PM % column values
3. Commit changes:
   ```bash
   git add data/
   git commit -m "Update PM fees"
   git push origin main
   ```
4. Railway redeploys and imports new fees

### **Method 2: Use API**
```bash
# Update single listing
curl -X PUT https://your-app.railway.app/api/listings/300017057/pm-fee \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic YOUR_AUTH" \
  -d '{"pmFeePercentage": 12.5}'

# Bulk update
curl -X POST https://your-app.railway.app/api/listings/bulk-update-pm-fees \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic YOUR_AUTH" \
  -d '{"updates": [...]}'
```

---

## Statement Generation

### **How PM Fees Are Used**

When generating statements, the system:

1. ✅ Fetches listing from database
2. ✅ Uses `pm_fee_percentage` from database
3. ✅ Falls back to 15% if not set
4. ✅ Calculates: `pmCommission = totalRevenue * (pmFeePercentage / 100)`

**Example:**
```javascript
// Listing 300017057 has PM fee of 12.5%
const listing = await ListingService.getListingWithPmFee(300017057);
const pmFee = listing.pmFeePercentage; // 12.5

// Calculate commission
const totalRevenue = 5000;
const pmCommission = totalRevenue * (pmFee / 100); // $625
```

---

## Scripts

### `npm run import-listings`
Imports listings from CSV to database
- Reads `data/all-listings-*.csv`
- Creates/updates listings
- Sets PM fees from CSV
- Preserves existing PM fees if not in CSV

### `npm run migrate-db`
Migrates existing statement/expense data to database
- Run once after switching to database storage

---

## Troubleshooting

### PM fees not updating
**Check:**
1. CSV format is correct: `ID,Name,Internal Name,PM %`
2. PM % column has values like `15.00%` (with % sign)
3. Import script completed successfully
4. Database connection working

### Listings not syncing from Hostify
**Check server logs:**
```bash
# Railway: View logs in dashboard
# Local: tail -f /tmp/backend.log
```

Look for:
```
✅ Synced XXX listings from Hostify
```

### Import fails on Railway
**Check:**
1. CSV file is committed to git
2. File path in `railway.json` is correct
3. PostgreSQL database is provisioned
4. `DATABASE_URL` exists in variables

---

## Benefits

✅ **Custom PM fees per property**
✅ **Persists across deployments**
✅ **Auto-syncs listing info from Hostify**
✅ **API for programmatic updates**
✅ **Bulk update support**
✅ **No data loss on redeploy**

---

## Future Enhancements

- 🔲 Frontend UI for managing PM fees
- 🔲 PM fee history/audit log
- 🔲 Owner-specific PM fee overrides
- 🔲 Date-based PM fee changes
- 🔲 Webhook to auto-sync on Hostify changes

