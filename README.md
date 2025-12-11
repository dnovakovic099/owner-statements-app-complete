# Owner Statements Automation System

A comprehensive web application for automating property management owner statements with integrations to Hostaway PMS and SecureStay expense management.

## Features

### 🏠 Core Functionality
- **Automated Statement Generation**: Tuesday-Monday weekly payout cycles
- **Multi-Property Support**: Handle multiple properties per owner
- **Business Rules Engine**: Configurable PM commissions, co-hosting, prorations
- **Expense Management**: Multiple expense categories with automated imports

### 🔌 Integrations
- **Hostaway API**: Automatic reservation import and synchronization
- **SecureStay API**: Cleaning fees, maintenance, upsells import
- **CSV Upload**: Manual expense entry via spreadsheet upload
- **Email Delivery**: Automated PDF statement distribution

### 📊 Dashboard Features
- **Real-time Analytics**: Revenue tracking, owner summaries
- **Advanced Filtering**: By owner, property, status, date range
- **Statement Management**: Draft, generate, send, track status
- **Manual Adjustments**: Chargebacks, refunds, one-off expenses

## Quick Start

### 1. Installation
```bash
# Clone or download the application
cd owner-statements-app

# Install dependencies
npm install

# Copy environment configuration
cp config/environment.example .env
```

### 2. Configuration
Edit `.env` file with your API credentials:
```env
# Hostaway API
HOSTAWAY_CLIENT_ID=your_client_id
HOSTAWAY_CLIENT_SECRET=your_client_secret

# SecureStay API
SECURESTAY_API_KEY=your_api_key

# SendGrid Email
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=statements@yourcompany.com
```

### 3. Database Setup
```bash
# Initialize database with sample data
npm run init-db

# OR reset database (deletes all data)
npm run reset-db
```

### 4. Start Application
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

Visit `http://localhost:3003` to access the dashboard.

## Application Structure

```
owner-statements-app/
├── src/
│   ├── controllers/          # Request handlers
│   ├── models/              # Database models (Sequelize)
│   ├── routes/              # API endpoints
│   ├── services/            # Business logic & integrations
│   ├── middleware/          # Custom middleware
│   ├── utils/               # Helper functions
│   └── server.js            # Main application entry
├── public/                  # Frontend assets
│   ├── js/dashboard.js      # Dashboard JavaScript
│   └── index.html           # Main UI
├── config/                  # Configuration files
├── database/                # SQLite database storage
├── statements/              # Generated PDF statements
├── scripts/                 # Database utilities
└── logs/                    # Application logs
```

## API Endpoints

### Dashboard
- `GET /api/dashboard` - Main dashboard statistics
- `GET /api/dashboard/properties` - Properties with owner info
- `GET /api/dashboard/owners` - Owners with property counts
- `GET /api/dashboard/week/:date` - Week-specific data

### Reservations
- `GET /api/reservations` - List reservations with filters
- `POST /api/reservations/sync` - Sync from Hostaway API
- `POST /api/reservations/sync-week` - Sync specific payout week
- `PUT /api/reservations/:id` - Update reservation
- `DELETE /api/reservations/:id` - Delete reservation

### Expenses
- `GET /api/expenses` - List expenses with filters
- `POST /api/expenses/sync` - Sync from SecureStay API
- `POST /api/expenses/upload-csv` - Upload CSV file
- `POST /api/expenses` - Create manual expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Statements
- `GET /api/statements` - List statements with filters
- `GET /api/statements/:id` - Statement details with items
- `POST /api/statements/generate` - Generate new statement
- `PUT /api/statements/:id/adjustments` - Add manual adjustments
- `PUT /api/statements/:id/status` - Update statement status

### Properties & Owners
- `GET /api/properties` - List properties
- `POST /api/properties` - Create property
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Deactivate property

## Business Rules

### Weekly Payout Cycle
- **Tuesday to Monday**: Statements include reservations with checkout dates in this range
- **Automatic Calculation**: Revenue, expenses, commissions, fees calculated per property
- **Proration Support**: Long stays (28+ nights) with configurable percentage

### Commission Structure
- **Configurable Rates**: 10%, 15%, 20%, 25% per property or owner default
- **Co-hosting Support**: Percentage splits and fixed fee deductions
- **Tech Fees**: Monthly fees prorated weekly (default $50/month)
- **Insurance Fees**: Monthly fees prorated weekly (default $25/month)

### Expense Categories
- **Cleaning**: Post-checkout cleaning services
- **Maintenance**: Repairs, supplies, HVAC, etc.
- **Upsells**: Guest add-ons and upgrades
- **Tech Fee**: Monthly technology platform fee
- **Insurance**: Property insurance coverage
- **Chargebacks**: Payment disputes and reversals
- **Refunds**: Guest refunds and cancellations
- **Other**: Miscellaneous expenses

## CSV Upload Format

For manual expense uploads, use this CSV format:
```csv
propertyName,type,description,amount,date,vendor,invoiceNumber,category,notes
"Downtown Condo","cleaning","Post-checkout cleaning",125.00,"2024-01-15","CleanPro","INV-001","cleaning","Standard cleaning"
"Beach Villa","maintenance","HVAC repair",350.00,"2024-01-16","ABC Repair","MNT-456","maintenance","Emergency repair"
```

## Database Schema

### Core Tables
- **owners**: Property owner information and default settings
- **properties**: Property details with owner relationships
- **reservations**: Booking data from Hostaway integration
- **expenses**: All expense records from various sources
- **statements**: Generated owner statements
- **statement_items**: Detailed line items for each statement

### Key Relationships
- Owner → Properties (1:many)
- Property → Reservations (1:many)
- Property → Expenses (1:many)
- Owner → Statements (1:many)
- Statement → Statement Items (1:many)

## Development

### Database Migrations

**Important:** Automatic schema changes (`alter: true`) are disabled in production to prevent unintended data modifications. Schema changes must be done via manual migrations.

**When adding new columns to models:**

1. Update the Sequelize model in `src/models/` (e.g., `Listing.js`)
2. Create a migration SQL file in `migrations/` folder
3. Run the migration manually on the production database

**Example migration:**
```sql
-- migrations/add_new_field.sql
ALTER TABLE listings ADD COLUMN IF NOT EXISTS new_field TEXT;
```

**Running migrations:**
```bash
# For PostgreSQL (production)
psql $DATABASE_URL -f migrations/add_new_field.sql

# For SQLite (local development)
sqlite3 database/owner_statements.db < migrations/add_new_field.sql
```

**Note:** The `{ force: false }` sync option only creates tables if they don't exist - it will NOT modify existing tables or columns.

### Adding New Expense Sources
1. Create service in `src/services/` (e.g., `NewServiceAPI.js`)
2. Add transformation logic for expense data format
3. Create sync endpoint in `src/routes/expenses.js`
4. Add UI button and handler in `public/js/dashboard.js`

### Customizing Business Rules
Edit `src/services/BusinessRulesService.js`:
- Modify commission calculation logic
- Add new proration rules
- Customize fee calculations
- Adjust payout week logic

### Adding Statement Fields
1. Update database model in `src/models/Statement.js`
2. Modify calculation logic in `BusinessRulesService.js`
3. Update API responses in statement routes
4. Add UI fields in dashboard

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Reset database
npm run reset-db
```

**API Integration Failures**
- Check API credentials in `.env`
- Verify network connectivity
- Review API rate limits

**Missing Dependencies**
```bash
# Reinstall packages
rm -rf node_modules package-lock.json
npm install
```

### Logs
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Console output for real-time debugging

## Production Deployment

### Environment Setup
1. Set `NODE_ENV=production` in environment
2. Configure production database (PostgreSQL recommended)
3. Set up SSL certificates for HTTPS
4. Configure email delivery service
5. Set up automated backups

### Security Considerations
- Store API keys in secure environment variables
- Enable HTTPS for all communications
- Implement rate limiting for API endpoints
- Regular security updates for dependencies

## Support

For technical support or feature requests:
1. Check application logs for error details
2. Verify API integrations are working
3. Test with sample data using `npm run reset-db`
4. Review configuration in `.env` file

## License

ISC License - Internal use for property management operations.
# Database connection configured
