# Generate All Owner Statements Feature

## Overview
The "Generate All" feature allows you to automatically create statements for **all owners and their properties** with a single click, using the same date range for all statements.

## How It Works

### Frontend (GenerateModal.tsx)
- **Checkbox**: Located at the top of the Generate Statement modal
- **Label**: "Generate statements for all owners and their properties"
- **Behavior**: 
  - When checked, the Owner and Property dropdowns are hidden/disabled
  - Only date selection and calculation type are required
  - Sends `ownerId: 'all'` to the backend

### Backend (statements-file.js)

The backend processes the "Generate All" request through the `generateAllOwnerStatements` function:

#### Process Flow:
1. **Fetch Data**
   - Gets all owners from Hostify Users API
   - Gets all listings from Hostify Listings API
   
2. **Loop Through Owners**
   - For each owner with "Listing Owner" role
   - Find all properties associated with that owner (using `listingIds`)
   - Filter for active properties only

3. **Generate Statements**
   - For each property owned by each owner:
     - Fetch reservations for the date range
     - Fetch expenses for the date range
     - **Skip if no activity** (no reservations AND no expenses)
     - Calculate totals (revenue, expenses, PM commission, fees, payout)
     - Create and save the statement

4. **Return Results Summary**
   - Count of generated statements
   - Count of skipped properties (no activity)
   - Count of errors
   - Detailed list of each result

### Response Format

```json
{
  "message": "Bulk statement generation completed",
  "summary": {
    "generated": 15,
    "skipped": 3,
    "errors": 0
  },
  "results": {
    "generated": [
      {
        "id": 25,
        "ownerId": 300004594,
        "ownerName": "Angelica Chua",
        "propertyId": 300017561,
        "propertyName": "Downtown Access • Huge Backyard",
        "ownerPayout": 2450.50,
        "totalRevenue": 3500.00,
        "reservationCount": 4,
        "expenseCount": 2
      }
    ],
    "skipped": [
      {
        "ownerId": 300004594,
        "ownerName": "Angelica Chua",
        "propertyId": 300017960,
        "propertyName": "Property with no activity",
        "reason": "No activity in period"
      }
    ],
    "errors": []
  }
}
```

## User Experience

### Modal Display
```
┌─────────────────────────────────────────┐
│ Generate Statement                   ✕  │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ☑ Generate statements for all       │ │
│ │   owners and their properties       │ │
│ │                                     │ │
│ │ This will create a separate         │ │
│ │ statement for each property owned   │ │
│ │ by each owner using the dates       │ │
│ │ selected below.                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Start Date: [2025-10-01]                │
│ End Date:   [2025-10-31]                │
│                                         │
│ Calculation Method:                     │
│ ○ Check-out Based                       │
│ ● Calendar Based                        │
│                                         │
│           [Cancel]  [Generate]          │
└─────────────────────────────────────────┘
```

### Success Message
When generation completes, the user sees:

```
✅ Bulk Generation Complete!

📊 Generated: 15 statement(s)
⏭️  Skipped: 3 (no activity)

[OK]
```

## Use Cases

### Monthly Statements for All Properties
1. Open Generate Statement modal
2. Check "Generate statements for all owners..."
3. Set Start Date: October 1, 2025
4. Set End Date: October 31, 2025
5. Select "Check-out Based" or "Calendar Based"
6. Click Generate
7. System creates statements for all active properties with activity

### Benefits
- **Time Saving**: Generate 10+ statements in seconds instead of manually
- **Consistency**: All statements use the same date range and calculation method
- **Comprehensive**: Covers all owners and their properties automatically
- **Smart Skipping**: Doesn't create statements for properties with no activity
- **Error Handling**: Reports any errors for specific properties

## Technical Details

### Owner-Property Mapping
- Uses Hostify Users API to get owners with "Listing Owner" role
- Each owner has a `listingIds` array containing their property IDs
- Only generates statements for `isActive` properties
- Skips properties with no reservations AND no expenses

### Calculation Types
Both calculation methods are supported:

1. **Check-out Based**: 
   - Includes reservations that check out during the period
   - Simple, straightforward accounting

2. **Calendar Based**:
   - Prorates reservations by days in the period
   - More accurate for mid-month reporting
   - Example: 5-night stay with 3 nights in October = 60% of revenue

### Statement Data
Each generated statement includes:
- Owner information (ID, name)
- Property information (ID, name)
- Date range
- All reservations in period
- All expenses in period
- Revenue breakdown
- Expense breakdown
- PM commission (15% default)
- Tech fees ($50)
- Insurance fees ($25)
- Final owner payout

## Error Handling

### Skipped Properties
Properties are skipped (not errors) if:
- No reservations in the date range
- No expenses in the date range
- Property is inactive

### Actual Errors
Errors occur if:
- Database/file write fails
- Data corruption during calculation
- Network issues during Hostify API calls

Errors are logged and included in the response summary.

## Testing

### To Test Locally:
1. Ensure backend and frontend are running
2. Login to the dashboard
3. Click "Generate Statement" button
4. Check the "Generate All" checkbox
5. Select date range (e.g., October 2025)
6. Choose calculation type
7. Click Generate
8. Wait for completion message
9. Verify statements created in database/files
10. Check statement details for accuracy

### Expected Results:
- Statements created for: Angelica Chua (2 properties), Operations (8 properties)
- Total: ~10 statements if all have activity
- Some may be skipped if no reservations/expenses in the period

## Code Locations

### Frontend
- **Modal Component**: `frontend/src/components/GenerateModal.tsx`
  - Lines 26, 96-120: Checkbox and logic
  - Lines 51-77: Submit handler
  
- **Dashboard Handler**: `frontend/src/components/Dashboard.tsx`
  - Lines 80-109: `handleGenerateStatement` with bulk response handling

- **API Service**: `frontend/src/services/api.ts`
  - Lines 74-95: `generateStatement` with updated type

### Backend
- **Route**: `src/routes/statements-file.js`
  - Line 117-119: Check for "all" owner ID
  - Lines 1705-1912: `generateAllOwnerStatements` function

## Future Enhancements

Potential improvements:
- [ ] Add progress indicator during bulk generation
- [ ] Allow selection of specific owners (multi-select)
- [ ] Email notifications when bulk generation completes
- [ ] Download all generated statements as ZIP
- [ ] Schedule automatic monthly bulk generation
- [ ] Preview summary before generating

