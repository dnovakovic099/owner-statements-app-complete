# Live Data Update - Hostify Integration

## Summary
The application has been updated to pull properties and owners directly from Hostify's live API instead of using cached files.

## Changes Made

### 1. HostifyService.js - Added Users/Owners API Support
- **New Methods:**
  - `getUsers()` - Fetches all users from Hostify
  - `getUser(userId)` - Fetches a specific user by ID
  - `getAllOwners()` - Fetches all users with "Listing Owner" role
  - `transformUser(hostifyUser)` - Transforms Hostify user data to our Owner format

- **User Transformation:**
  - Maps Hostify users to our Owner model
  - Filters for users with "Listing Owner" role
  - Includes listing IDs associated with each owner
  - Only returns active users (`is_active === 1`)

### 2. FileDataService.js - Live API Integration
- **getListings()**: Now pulls directly from Hostify API
  - Fetches all properties with pagination
  - Transforms to our internal format
  - Falls back to cached file if API fails
  
- **getOwners()**: Now pulls directly from Hostify Users API
  - Fetches all listing owners
  - Includes listing associations
  - Falls back to cached file or default owner if API fails

### 3. Route Updates - Owner Mapping
Updated all property routes to properly map properties to their owners:

- **properties-file.js** - `/api/properties-file`
- **dashboard-file.js** - `/api/dashboard-file/properties`
- **quickbooks.js** - `/api/quickbooks/properties`

**Mapping Logic:**
1. Fetch both listings and owners in parallel
2. Create a map of listing IDs to owners using `listingIds` from Hostify users
3. Match each property to its owner
4. Fall back to default owner if no owner found for a listing

## How It Works

### Hostify Users API
The Hostify `/users` endpoint returns users with their associated listings:

```json
{
  "success": true,
  "user": [
    {
      "id": 123,
      "username": "john@somebody.com",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+1-541-754-3010",
      "is_active": 1,
      "roles": ["Listing Owner"],
      "status": "active",
      "listings": [
        { "id": 1000, ... }
      ]
    }
  ]
}
```

### Owner-Property Association
- Each owner has a `listingIds` array containing their property IDs
- Properties are matched to owners using this array
- Properties without an owner are assigned to the first available owner or default owner

## Benefits

✅ **Real-time Data**: Always displays current properties and owners from Hostify
✅ **Automatic Updates**: No need to manually sync - data is fresh on every page load
✅ **Owner Association**: Properties correctly show their actual owners
✅ **Fallback Support**: Falls back to cached data if Hostify API is unavailable
✅ **Multiple Owners**: Supports multiple property owners with proper associations

## Testing

To verify the changes:
1. Start the application: `npm start`
2. Open the dashboard
3. Check the "Owner" filter dropdown - should show actual owners from Hostify
4. Check the "Property" filter dropdown - should show current properties from Hostify
5. Verify properties are associated with correct owners

## Fallback Behavior

If Hostify API is unavailable:
- System falls back to cached files in `/data/`
- If no cached data exists, creates a default owner
- Logs warnings about API failures

## Notes

- Data is fetched fresh on each page load (no caching)
- API calls are made in parallel for performance
- Owners must have "Listing Owner" role in Hostify to appear
- Owners must be active (`is_active === 1`)

