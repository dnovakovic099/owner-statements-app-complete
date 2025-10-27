# Railway Deployment Guide

## Required Environment Variables

Set these in your Railway dashboard (Settings → Variables):

### Essential Variables
```
NODE_ENV=production
PORT=3003
```

### Hostify API (Required)
```
HOSTIFY_API_URL=https://api-rms.hostify.com
HOSTIFY_API_KEY=CePFsroZu03LA6C5szMsRuA2Eh62rGDS
```

### SecureStay API (if needed)
```
SECURESTAY_API_URL=https://api.securestay.com/v1
SECURESTAY_API_KEY=your_securestay_api_key
```

### QuickBooks OAuth (Required for QuickBooks integration)
```
QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id
QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret
QUICKBOOKS_REDIRECT_URI=https://your-app.railway.app/api/quickbooks/auth/callback
QUICKBOOKS_COMPANY_ID=your_company_id
QUICKBOOKS_ACCESS_TOKEN=your_access_token
QUICKBOOKS_REFRESH_TOKEN=your_refresh_token
```

### Email Configuration (Optional - if using SendGrid)
```
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=statements@yourcompany.com
FROM_NAME=Owner Statements System
```

### Company Details
```
COMPANY_NAME=Luxury Lodging PM
COMPANY_ADDRESS=123 Main St, City, State 12345
COMPANY_PHONE=(555) 123-4567
COMPANY_EMAIL=info@yourcompany.com
```

### Default Fees
```
DEFAULT_TECH_FEE=50.00
DEFAULT_INSURANCE_FEE=25.00
```

## Deployment Steps

1. **Connect GitHub Repository**
   - Go to Railway dashboard
   - Create a new project
   - Connect your GitHub repository

2. **Set Environment Variables**
   - Go to your project → Settings → Variables
   - Add all the environment variables listed above
   - Make sure to use your actual API keys and credentials

3. **Update QuickBooks Redirect URI**
   - After Railway generates your URL (e.g., `https://your-app.railway.app`)
   - Update the `QUICKBOOKS_REDIRECT_URI` environment variable
   - Also update this in your QuickBooks Developer Console

4. **Deploy**
   - Railway will automatically build and deploy when you push to main
   - The build command will install frontend dependencies and build React
   - The start command will run the Node.js server

5. **Verify Deployment**
   - Check the deployment logs in Railway
   - Visit your Railway app URL
   - Test the login (credentials from config/auth.json)

## File Structure on Railway

The deployment will:
- Build the React frontend → `frontend/build/`
- Run the Node.js backend from `src/server.js`
- Serve the React app as static files in production
- Create necessary directories: `data/`, `statements/`, `logs/`, `uploads/`

## Important Notes

1. **Data Persistence**: Railway uses ephemeral storage. Any data saved to local files (`data/`, `statements/`, etc.) will be lost on redeployment. Consider:
   - Using Railway's PostgreSQL database for persistent data
   - Or connecting to an external storage service (AWS S3, etc.)

2. **File Uploads**: Uploaded files will also be lost on redeployment. Consider using cloud storage for production.

3. **Logs**: Logs are available in the Railway dashboard. Local log files will be ephemeral.

4. **Environment Variables**: Never commit `.env` file to git. Always use Railway's environment variables.

## Troubleshooting

### Build Fails
- Check Railway logs for errors
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### App Doesn't Start
- Check that `PORT` environment variable is set
- Verify all required environment variables are configured
- Check for missing directories (should be created automatically)

### QuickBooks OAuth Issues
- Ensure `QUICKBOOKS_REDIRECT_URI` matches your Railway URL
- Update the redirect URI in QuickBooks Developer Console
- Make sure client ID and secret are correct

### API Connection Issues
- Verify `HOSTIFY_API_KEY` is correct
- Check API URLs are set correctly
- Review Railway logs for API error messages

