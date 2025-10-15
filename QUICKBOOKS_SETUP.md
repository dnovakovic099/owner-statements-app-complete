# QuickBooks Integration Setup

This document explains how to set up the QuickBooks integration for the Owner Statements App.

## Overview

The QuickBooks integration allows you to:
- Pull transactions from QuickBooks
- Categorize transactions by property and department
- View categorized and uncategorized transactions
- Filter transactions by date range and account type

## Prerequisites

1. **QuickBooks Developer Account**: You need a QuickBooks Developer account to create an app and get API credentials.
2. **QuickBooks Company**: You need access to a QuickBooks company (sandbox or production).

## Setup Steps

### 1. Create QuickBooks App

1. Go to [QuickBooks Developer Portal](https://developer.intuit.com/)
2. Sign in with your Intuit account
3. Create a new app:
   - Choose "QuickBooks Online API"
   - Select "Sandbox" for development or "Production" for live use
   - Note down your Client ID and Client Secret

### 2. Configure Environment Variables

Add the following variables to your `.env` file:

```bash
# QuickBooks API Configuration
QUICKBOOKS_COMPANY_ID=your_quickbooks_company_id
QUICKBOOKS_ACCESS_TOKEN=your_quickbooks_access_token
QUICKBOOKS_REFRESH_TOKEN=your_quickbooks_refresh_token
QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id
QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:3003/api/quickbooks/auth/callback
```

### 3. Get Company ID and Tokens

#### For Sandbox (Development):
1. Go to [QuickBooks Sandbox](https://app.sandbox.qbo.intuit.com/)
2. Sign in with your sandbox company
3. The Company ID is in the URL: `https://app.sandbox.qbo.intuit.com/app/companyinfo?companyId=YOUR_COMPANY_ID`

#### For Production:
1. Go to [QuickBooks Online](https://qbo.intuit.com/)
2. Sign in with your company
3. The Company ID is in the URL: `https://qbo.intuit.com/app/companyinfo?companyId=YOUR_COMPANY_ID`

### 4. OAuth Flow (Getting Access Tokens)

The app includes an OAuth flow to get access tokens:

1. **Get Authorization URL**: Call `GET /api/quickbooks/auth-url`
2. **User Authorization**: Redirect user to the returned URL
3. **Handle Callback**: User will be redirected back with an authorization code
4. **Exchange Code for Tokens**: Call `POST /api/quickbooks/auth/callback` with the code

#### Manual Token Setup (Alternative)

If you prefer to set up tokens manually:

1. Use QuickBooks OAuth 2.0 Playground: https://developer.intuit.com/app/developer/qbo/docs/get-started/start-here/oauth-2.0-playground
2. Follow the OAuth flow to get access and refresh tokens
3. Add the tokens to your environment variables

## Default Departments

The app comes with these default departments for categorization:

- Maintenance
- Cleaning
- Utilities
- Marketing
- Management
- Insurance
- Legal
- Accounting
- Technology
- Other

You can also use departments from your QuickBooks company if they exist.

## API Endpoints

### Transactions
- `GET /api/quickbooks/transactions` - Fetch transactions
- `PUT /api/quickbooks/transactions/:id/categorize` - Categorize a transaction

### Reference Data
- `GET /api/quickbooks/accounts` - Get QuickBooks accounts
- `GET /api/quickbooks/departments` - Get departments (with defaults)
- `GET /api/quickbooks/properties` - Get available properties

### Authentication
- `GET /api/quickbooks/auth-url` - Get OAuth authorization URL
- `POST /api/quickbooks/auth/callback` - Handle OAuth callback

## Usage

1. **Access Transactions Page**: Click the "Transactions" button in the dashboard header
2. **Filter Transactions**: Use the filters to narrow down transactions by date, account type, or categorization status
3. **Categorize Transactions**: Click "Categorize" on any transaction to assign it to a property and department
4. **View Status**: Transactions show their categorization status (Categorized/Uncategorized)

## Troubleshooting

### Common Issues

1. **"QuickBooks access token not configured"**
   - Ensure all QuickBooks environment variables are set
   - Verify tokens are valid and not expired

2. **"Failed to fetch transactions"**
   - Check if Company ID is correct
   - Verify access token has proper permissions
   - Ensure QuickBooks company is accessible

3. **"Failed to categorize transaction"**
   - Verify the transaction ID exists
   - Check if property and department are valid
   - Ensure QuickBooks API permissions include write access

### Token Refresh

Access tokens expire after 1 hour. The app automatically refreshes tokens using the refresh token when needed. If you encounter token issues:

1. Check if refresh token is valid
2. Re-run the OAuth flow if refresh token is expired
3. Update environment variables with new tokens

## Security Notes

- Keep your Client Secret secure and never expose it in client-side code
- Store tokens securely in environment variables
- Use HTTPS in production
- Regularly rotate tokens for security

## Support

For QuickBooks API issues, refer to:
- [QuickBooks Developer Documentation](https://developer.intuit.com/app/developer/qbo/docs)
- [QuickBooks API Reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/transaction)

