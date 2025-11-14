# Listings Management Feature

## Overview
Added a new **Listings** screen that replaces the Transactions button in the main navigation. This allows users to manage listing display names and configure Airbnb co-host settings.

## Features Implemented

### 1. Database Model Updates (`src/models/Listing.js`)
- Added `displayName` field: Custom name that appears in dropdowns and UI
- Added `isCohostOnAirbnb` field: Boolean flag for co-host status
- Original `name` field preserved for mapping purposes

### 2. Backend API (`src/routes/listings.js`)
New endpoints added:
- `PUT /api/listings/:id/display-name` - Update display name only
- `PUT /api/listings/:id/cohost-status` - Update co-host status only  
- `PUT /api/listings/:id/config` - Update display name, co-host status, and PM fee together

### 3. Backend Service (`src/services/ListingService.js`)
New methods:
- `updateDisplayName(listingId, displayName)` - Update display name
- `updateCohostStatus(listingId, isCohostOnAirbnb)` - Update co-host status
- `updateListingConfig(listingId, config)` - Update multiple fields at once
- `getDisplayName(listing)` - Helper to get the display name (displayName → nickname → name)

### 4. Statement Calculation Logic (`src/routes/statements-file.js`)
**Co-host Revenue Handling:**
- When `isCohostOnAirbnb` is `true`, the Gross Payout calculation changes to: `-pmCommission`
- Reasoning: Client receives all Airbnb revenue directly, so only PM commission is deducted
- Revenue and expenses are still shown on the statement normally
- This applies to both single statement generation and bulk background generation

### 5. Frontend Components

#### ListingsPage Component (`frontend/src/components/ListingsPage.tsx`)
New screen featuring:
- **Listings List**: Searchable list of all listings with visual indicators for co-host status
- **Edit Form**: 
  - Display Name input (changes how listing appears in dropdowns)
  - Co-host on Airbnb checkbox (explained with clear messaging)
  - PM Fee Percentage input
  - Location information display
- **Sync Button**: Syncs latest listings from Hostify
- Search functionality to filter listings by name, ID, or city

#### Dashboard Updates (`frontend/src/components/Dashboard.tsx`)
- Replaced "Transactions" button with "Listings" button
- Navigation switches between Dashboard and Listings screens

### 6. Frontend API (`frontend/src/services/api.ts`)
New `listingsAPI` methods:
- `getListings()` - Fetch all listings
- `getListing(id)` - Fetch single listing
- `updateListingConfig(id, config)` - Update listing configuration
- `updateDisplayName(id, displayName)` - Update display name
- `updateCohostStatus(id, isCohostOnAirbnb)` - Update co-host status
- `updatePmFee(id, pmFeePercentage)` - Update PM fee
- `syncListings()` - Sync from Hostify

### 7. TypeScript Types (`frontend/src/types/index.ts`)
Updated `Listing` interface with new fields:
- `displayName?: string | null`
- `isCohostOnAirbnb: boolean`
- Made most fields optional to match backend structure

## How It Works

### Display Name
- Users can set a custom display name for any listing
- This display name appears in all dropdowns and UI elements
- The original name from Hostify is preserved for mapping/sync purposes
- If no display name is set, falls back to nickname, then to original name

### Co-host on Airbnb
When a listing is marked as "Co-host on Airbnb":
1. Statement still shows all Airbnb revenue and expenses normally
2. **Gross Payout** becomes: `-PM Commission` only
3. This reflects that the client receives all Airbnb money directly
4. The statement essentially shows how much they owe the PM company

## Database Migration
The database schema will automatically update when the server starts (via Sequelize sync).

New columns added to `listings` table:
- `display_name` (VARCHAR, nullable)
- `is_cohost_on_airbnb` (BOOLEAN, default: false)

## Usage

1. Navigate to the Listings screen via the "Listings" button in the header
2. Search or browse to find the listing to configure
3. Click on a listing to edit its settings
4. Update the display name, co-host status, and/or PM fee
5. Click "Save Changes"

The changes take effect immediately on the next statement generation.

## Files Modified
- `src/models/Listing.js` - Added display_name and is_cohost_on_airbnb fields
- `src/services/ListingService.js` - Added update methods
- `src/routes/listings.js` - Added update endpoints
- `src/routes/statements-file.js` - Modified owner payout calculation for co-hosts
- `frontend/src/components/ListingsPage.tsx` - New component
- `frontend/src/components/Dashboard.tsx` - Navigation changes
- `frontend/src/services/api.ts` - Added listings API methods
- `frontend/src/types/index.ts` - Updated Listing interface

