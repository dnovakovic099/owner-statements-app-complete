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

### Listings Management
- Property details and owner assignments
- Configurable PM fee percentages per property
- Owner contact information and payment details

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
│   │   ├── Statement.js     # Generated statements
│   │   ├── User.js          # User accounts
│   │   └── QuickBooksToken.js
│   ├── routes/              # Express API routes
│   │   ├── statements-file.js
│   │   ├── financials.js    # QuickBooks financial data
│   │   ├── quickbooks.js    # QB OAuth & API
│   │   ├── listings.js
│   │   └── auth.js
│   ├── services/            # Business logic
│   │   ├── QuickBooksService.js
│   │   ├── HostifyService.js
│   │   ├── SecureStayService.js
│   │   └── StatementService.js
│   └── server.js            # Express app entry point
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Dashboard.tsx
│       │   ├── FinancialDashboard/  # Financial analytics
│       │   ├── StatementsTable.tsx
│       │   ├── EditStatementModal.tsx  # Edit with LL Cover toggle
│       │   ├── ListingsPage.tsx
│       │   └── GenerateModal.tsx
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

### QuickBooks

```bash
GET  /api/quickbooks/status       # Connection status
GET  /api/quickbooks/auth-url     # Get OAuth URL
GET  /api/quickbooks/auth/callback  # OAuth callback
```

## Database Schema

### Key Tables

- **listings** - Properties with owner info, PM fees, addresses
- **statements** - Generated owner statements
- **users** - User accounts for authentication
- **quickbooks_tokens** - OAuth tokens for QB connection

### Relationships

```text
listings (1) ──── (many) statements
users (1) ──── (many) statements (createdBy)
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
