# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Owner Statements Automation System - a property management web application for generating owner statements with integrations to Hostaway/Hostify PMS and SecureStay expense management.

## Development Commands

```bash
# Backend
npm install          # Install backend dependencies
npm run dev          # Start backend with nodemon (port 3003)
npm start            # Start backend in production mode

# Frontend (React + TypeScript)
cd frontend && npm install    # Install frontend dependencies
cd frontend && npm start      # Start React dev server (port 3000, proxies to 3003)
cd frontend && npm run build  # Build for production
cd frontend && npm test       # Run React tests

# Full stack development
npm run build        # Install frontend deps and build

# Database
npm run init-db      # Initialize database with sample data
npm run reset-db     # Reset database (deletes all data)
npm run import-listings  # Import listings to database
```

## Architecture

### Backend (Express.js + Sequelize)
- **Entry point**: `src/server.js` - Express server with basic auth middleware
- **Database**: SQLite locally, PostgreSQL on Railway (auto-detected via DATABASE_URL)
- **Models** (`src/models/`): Statement, UploadedExpense, Listing (Sequelize)
- **Routes** (`src/routes/`): File-based data routes (`*-file.js`) for dashboard, reservations, statements, properties
- **Services** (`src/services/`):
  - `BusinessRulesService.js` - Core payout calculation logic (Tuesday-Monday weekly cycles)
  - `HostifyService.js` / `HostawayService.js` - PMS integrations
  - `SecureStayService.js` - Expense import
  - `QuickBooksService.js` - Accounting integration
  - `FileDataService.js` - JSON file-based data storage

### Frontend (React 19 + TypeScript + Tailwind)
- **Entry**: `frontend/src/App.tsx` - Auth wrapper with Dashboard/Login routing
- **Components** (`frontend/src/components/`): Dashboard, StatementsTable, GenerateModal, ListingsPage, etc.
- **API client**: `frontend/src/services/api.ts` - Axios-based API with basic auth
- **Types**: `frontend/src/types/index.ts` - TypeScript interfaces for all entities

### Data Flow
1. Properties/Listings sync from Hostify API on server startup
2. Reservations pulled from Hostify based on checkout dates
3. Expenses imported from SecureStay or CSV uploads
4. Statements generated per owner/property for Tuesday-Monday payout weeks
5. PDFs generated via Puppeteer and can be emailed via SendGrid

## Key Business Logic

### Payout Week Calculation (`BusinessRulesService.js`)
- Statements follow Tuesday-Monday weekly cycles
- Reservations included based on **checkout date** falling within the week
- PM commission calculated per property (configurable percentage)
- Tech fees and insurance fees prorated weekly from monthly amounts

### Statement Generation
- Can generate for single property or all properties for an owner
- Supports tag-based filtering (properties grouped by tags)
- Two calculation types: "checkout" (checkout in period) or "calendar" (nights in period)

## Environment Variables

Required in `.env`:
- `HOSTIFY_API_KEY` - Hostify PMS API access
- `SECURESTAY_API_KEY` - SecureStay expense integration
- `SENDGRID_API_KEY` - Email delivery
- `QUICKBOOKS_*` - QuickBooks OAuth tokens (auto-populated after auth flow)

## File-Based Data Storage

Property and owner data stored in `data/` directory as JSON files, separate from database models. This hybrid approach allows quick edits without migrations.
