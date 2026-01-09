# Owner Statements App

A full-stack property management application for generating owner statements, tracking financials, and managing vacation rental properties. Built for property managers who need to automate owner payouts and expense tracking.

## Overview

This system automates the process of:
1. Pulling reservation data from Hostify RMS (property management system)
2. Syncing expense/income data from QuickBooks Online
3. Generating owner statements with calculated payouts
4. Emailing PDF statements to property owners

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Node.js 18+, Express 5, Sequelize ORM |
| Frontend | React 19, TypeScript, Tailwind CSS, Radix UI |
| Database | PostgreSQL (production), SQLite (development) |
| Charts | Recharts, D3.js |
| PDF | Puppeteer, PDFKit |
| Email | SendGrid, Nodemailer |
| Auth | JWT tokens, bcrypt |

## Core Features

### Statement Generation
- Weekly (Tuesday-Monday) or monthly payout cycles
- Automatic calculation of PM fees, tech fees, insurance
- Support for multi-property owners
- PDF generation with detailed line items

### Financial Dashboard
- Real-time expense/income breakdown by category
- Period-over-period comparisons
- Drill-down to individual transactions
- Data pulled directly from QuickBooks

### Integrations
- **Hostify RMS** - Reservations, listings, property data
- **QuickBooks Online** - Expenses, income, P&L reports
- **SecureStay** - Expense tracking with LL Cover support
- **SendGrid/SMTP** - Email delivery

### Edit Statement
- Hide/show individual expenses and upsells
- **LL Cover Toggle** - Company-covered expenses excluded by default, can be included per statement
- Add/remove reservations from statement period
- Edit expense amounts and categories inline
- Cleaning fee pass-through configuration

### Listing Groups
- Group multiple listings for combined statements
- Assign schedule tags (WEEKLY, BI-WEEKLY A/B, MONTHLY)
- Auto-generate draft statements at 8:00 AM EST when schedules trigger
- Group-level calculation type (checkout/calendar)
- One listing can belong to only one group

### Auto-Generation
- Automatic draft statement generation based on tag schedules
- Groups AND individual tagged listings are processed
- Duplicate prevention (won't create if statement already exists)
- Uses same calculation logic as manual generation
- All auto-generated statements saved as "draft" for review

### Listings Management
- Property details and owner assignments
- Configurable PM fee percentages per property
- Owner contact information and payment details
- Assign listings to groups for combined statements

## Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 14+ (production) or SQLite (local dev)
- QuickBooks Online account (for financial data)
- Hostify RMS account (for reservation data)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd owner-statements-app-complete

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Create environment file
cp config/environment.example .env
```

### Environment Configuration

Edit `.env` with your credentials:

```env
# Application
PORT=3003
NODE_ENV=development
APP_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret_here

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/owner_statements_local

# Hostify RMS API
HOSTIFY_API_URL=https://api-rms.hostify.com
HOSTIFY_API_KEY=your_hostify_api_key

# QuickBooks Online
QUICKBOOKS_CLIENT_ID=your_qb_client_id
QUICKBOOKS_CLIENT_SECRET=your_qb_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:3003/api/quickbooks/auth/callback
QUICKBOOKS_USE_SANDBOX=false

# SecureStay (Expense Management)
SECURESTAY_API_KEY=your_securestay_api_key

# Email
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=statements@yourcompany.com
FROM_NAME=Property Management
```

### Database Setup

```bash
# Initialize database with schema
npm run init-db

# Import listings from Hostify (optional)
npm run import-listings
```

### Running the Application

```bash
# Terminal 1 - Backend API (port 3003)
npm run dev

# Terminal 2 - Frontend React app (port 3000)
cd frontend && npm start
```

Open `http://localhost:3000` in your browser.

## Project Structure

```text
owner-statements-app-complete/
├── src/
│   ├── models/              # Sequelize database models
│   │   ├── Listing.js       # Properties/listings
│   │   ├── ListingGroup.js  # Listing groups for combined statements
│   │   ├── Statement.js     # Generated statements
│   │   ├── ActivityLog.js   # Audit logging
│   │   ├── User.js          # User accounts
│   │   └── QuickBooksToken.js
│   ├── routes/              # Express API routes
│   │   ├── statements-file.js
│   │   ├── financials.js    # QuickBooks financial data
│   │   ├── quickbooks.js    # QB OAuth & API
│   │   ├── listings.js
│   │   ├── groups.js        # Listing groups API
│   │   └── auth.js
│   ├── services/            # Business logic
│   │   ├── QuickBooksService.js
│   │   ├── HostifyService.js
│   │   ├── SecureStayService.js
│   │   ├── StatementService.js           # Auto-generation
│   │   ├── StatementCalculationService.js # Shared calculation logic
│   │   ├── ListingGroupService.js        # Group management
│   │   └── TagScheduleService.js         # Schedule-based auto-generation
│   └── server.js            # Express app entry point
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Dashboard.tsx
│       │   ├── FinancialDashboard/  # Financial analytics
│       │   ├── StatementsTable.tsx
│       │   ├── EditStatementModal.tsx  # Edit with LL Cover toggle
│       │   ├── ListingsPage.tsx       # Listings with group management
│       │   ├── GroupModal.tsx         # Create/edit listing groups
│       │   └── GenerateModal.tsx      # Generate with group selection
│       ├── services/
│       │   └── api.ts       # API client
│       └── App.tsx
├── config/
│   └── environment.example
├── scripts/                 # Database utilities
├── statements/              # Generated PDF files
└── package.json
```

## API Reference

### Authentication

```bash
POST /api/auth/login
Body: { "username": "admin", "password": "..." }
Returns: { "token": "jwt_token", "user": {...} }
```

### Statements

```bash
GET  /api/statements              # List all statements
GET  /api/statements/:id          # Get statement details
POST /api/statements/generate     # Generate new statement
Body: {
  "propertyId": "123",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "calculationType": "calendar"
}
```

### Financials (QuickBooks)

```bash
GET /api/financials/summary?startDate=2025-01-01&endDate=2025-01-31
GET /api/financials/by-category?startDate=...&endDate=...
GET /api/financials/transactions?category=Utilities&startDate=...&endDate=...
GET /api/financials/comparison?startDate=...&endDate=...
```

### Listings

```bash
GET  /api/listings                # List all properties
PUT  /api/listings/:id            # Update property
POST /api/listings/sync           # Sync from Hostify
```

### Listing Groups

```bash
GET    /api/groups                    # List all groups
GET    /api/groups?tag=WEEKLY         # Filter groups by tag
GET    /api/groups/:id                # Get group with members
POST   /api/groups                    # Create new group
Body: {
  "name": "Weekly Properties",
  "tags": ["WEEKLY"],
  "listingIds": [1, 2, 3],
  "calculationType": "checkout"
}
PUT    /api/groups/:id                # Update group
DELETE /api/groups/:id                # Delete group (ungroups listings)
POST   /api/groups/:id/listings       # Add listings to group
Body: { "listingIds": [4, 5] }
DELETE /api/groups/:id/listings/:listingId  # Remove listing from group
```

### QuickBooks

```bash
GET  /api/quickbooks/status       # Connection status
GET  /api/quickbooks/auth-url     # Get OAuth URL
GET  /api/quickbooks/auth/callback  # OAuth callback
```

## Database Schema

### Key Tables

- **listings** - Properties with owner info, PM fees, addresses
- **listing_groups** - Groups for combined statements with schedule tags
- **statements** - Generated owner statements (includes group metadata)
- **activity_logs** - Audit trail for all actions including auto-generation
- **tag_schedules** - Schedule configuration for each tag
- **tag_notifications** - Notifications when schedules trigger
- **users** - User accounts for authentication
- **quickbooks_tokens** - OAuth tokens for QB connection

### Relationships

```text
listing_groups (1) ──── (many) listings
listings (1) ──── (many) statements
listing_groups (1) ──── (many) statements (via groupId)
users (1) ──── (many) statements (createdBy)
```

### Listing Groups Migration

```sql
-- Run: psql $DATABASE_URL -f migrations/listing-groups-postgresql.sql
CREATE TABLE IF NOT EXISTS listing_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    tags TEXT,
    calculation_type VARCHAR(20) DEFAULT 'checkout',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS group_id INTEGER
    REFERENCES listing_groups(id) ON DELETE SET NULL;

ALTER TABLE statements ADD COLUMN IF NOT EXISTS group_id INTEGER;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS group_tags TEXT;
```

## Development

### Running Tests

```bash
npm run test           # Run main test suite
npm run test:all       # Run all test suites
npm run test:jest      # Run Jest tests
```

### Adding New Features

1. **New API Route**: Add to `src/routes/`, register in `server.js`
2. **New Model**: Add to `src/models/`, import in `server.js`
3. **New Component**: Add to `frontend/src/components/`

### Code Style

- Backend: CommonJS modules, async/await
- Frontend: TypeScript, functional components, hooks

## Deployment

### Railway (Recommended)

1. Connect GitHub repository to Railway
2. Add PostgreSQL database service
3. Configure environment variables:

```text
DATABASE_URL          = (auto-set by Railway Postgres)
APP_URL               = https://your-app.up.railway.app
NODE_ENV              = production
QUICKBOOKS_REDIRECT_URI = https://your-app.up.railway.app/api/quickbooks/auth/callback
JWT_SECRET            = (generate secure random string)
... (all other env vars)
```

4. Deploy - Railway auto-detects Node.js and runs `npm start`

### Build Commands

```bash
npm run build          # Build frontend for production
npm start              # Start production server
```

## LL Cover Feature

Expenses marked as "LL Cover" in SecureStay are company-covered costs that should not be charged to property owners by default.

### How It Works

1. **Automatic Detection** - When generating statements, expenses with `llCover: true` from SecureStay are automatically marked as hidden
2. **Edit Statement** - A purple "LL Cover" section appears showing all company-covered expenses/upsells
3. **Toggle to Include** - Check the box next to any LL Cover item to include it in the owner's statement
4. **Recalculates Totals** - Statement totals update automatically when LL Cover items are toggled

### Use Cases

- Cleaning costs covered by company during vacancy
- Maintenance items absorbed by property manager
- One-time owner credits or adjustments

## Listing Groups Feature

Group multiple listings together to generate combined statements automatically.

### How It Works

1. **Create Group** - In Listings page, select listings and create a group with a name and schedule tag
2. **Assign Schedule** - Choose WEEKLY, BI-WEEKLY A, BI-WEEKLY B, or MONTHLY
3. **Set Calculation Type** - Choose checkout-based or calendar-based
4. **Auto-Generation** - At 8:00 AM EST when the schedule triggers, draft statements are created automatically

### Schedule Tags

| Tag | Frequency | Date Range |
|-----|-----------|------------|
| WEEKLY | Every week | Monday to Monday (7 days) |
| BI-WEEKLY A | Every 2 weeks (odd) | Monday to Monday (14 days) |
| BI-WEEKLY B | Every 2 weeks (even) | Monday to Monday (14 days) |
| MONTHLY | Every month | 1st to last day of previous month |

### Auto-Generation Rules

- **Groups with tag** - Combined statement for all listings in the group
- **Individual listings with tag** (not in any group) - Individual statement per listing
- **Duplicates prevented** - Won't create if statement exists for same period
- **Always draft** - Auto-generated statements are never finalized or sent automatically
- **Audit logged** - All auto-generations recorded with "System" as user

### Manual Generation with Groups

When generating statements manually:
1. Select a group from the dropdown (appears alongside individual properties)
2. Dates auto-fill based on the group's tag
3. Calculation type auto-fills from group settings
4. Statement is created as combined for all group members

## Troubleshooting

### QuickBooks Connection Issues

1. Verify `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`
2. Ensure redirect URI matches exactly in QB Developer Portal
3. Check `QUICKBOOKS_USE_SANDBOX` matches your QB account type

### Database Connection

```bash
# Reset local database
npm run reset-db

# Check PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1"
```

### Common Errors

| Error | Solution |
| ----- | -------- |
| `ECONNREFUSED` | Database not running |
| `401 Unauthorized` | Invalid/expired JWT token |
| `QuickBooks token expired` | Reconnect in Settings page |

## License

ISC License
