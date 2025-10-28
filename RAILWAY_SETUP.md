# Railway Deployment Setup Guide

## 📋 Prerequisites

- GitHub repository: `https://github.com/dnovakovic099/owner-statements-app-complete`
- Railway account: [railway.app](https://railway.app)
- Hostify API Key: `CePFsroZu03LA6C5szMsRuA2Eh62rGDS`

## 🚀 Step 1: Create New Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose: `dnovakovic099/owner-statements-app-complete`
5. Railway will automatically detect the project and start initial deployment

## ⚙️ Step 2: Configure Environment Variables

Go to your Railway project → **Settings** → **Variables** and add these:

### Core Configuration (Required)
```bash
NODE_ENV=production
PORT=3003
```

### Puppeteer/PDF Generation (Required for statement downloads)
```bash
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Hostify API (Required)
```bash
HOSTIFY_API_URL=https://api-rms.hostify.com
HOSTIFY_API_KEY=CePFsroZu03LA6C5szMsRuA2Eh62rGDS
```

### Company Information
```bash
COMPANY_NAME=Luxury Lodging PM
COMPANY_ADDRESS=123 Main St, City, State 12345
COMPANY_PHONE=(555) 123-4567
COMPANY_EMAIL=info@luxurylodging.com
```

### Default Fees
```bash
DEFAULT_TECH_FEE=50.00
DEFAULT_INSURANCE_FEE=25.00
```

### QuickBooks OAuth (Get these from QuickBooks Developer Portal)
```bash
QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret_here
QUICKBOOKS_REDIRECT_URI=https://your-app-name.up.railway.app/api/quickbooks/auth/callback
```

**Note:** After Railway gives you your app URL (e.g., `https://courteous-amazement-production.up.railway.app`), update the `QUICKBOOKS_REDIRECT_URI` with your actual URL.

### Optional: Email Configuration (SendGrid)
```bash
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=statements@luxurylodging.com
FROM_NAME=Luxury Lodging Owner Statements
```

### Optional: SecureStay API
```bash
SECURESTAY_API_URL=https://api.securestay.com/v1
SECURESTAY_API_KEY=your_securestay_api_key
```

## 🔧 Step 3: Update QuickBooks Developer Console

After Railway deploys your app:

1. Get your Railway app URL from the Railway dashboard
2. Go to [QuickBooks Developer Portal](https://developer.intuit.com)
3. Select your app
4. Go to **Keys & OAuth**
5. Add your Railway URL to **Redirect URIs**:
   ```
   https://your-app-name.up.railway.app/api/quickbooks/auth/callback
   ```
6. Save changes

## 📊 Step 4: Verify Deployment

1. **Check Deployment Logs**
   - Go to your Railway project
   - Click on the deployment
   - Review build and deploy logs
   - Look for: `🚀 Owner Statements Server running on port 3003`

2. **Test the Application**
   - Visit your Railway URL
   - You should see the login page
   - Login credentials are in `config/auth.json`:
     - Username: `LL`
     - Password: `bnb547!`

3. **Test API Endpoints**
   ```bash
   # Check if server is running
   curl https://your-app-name.up.railway.app/api/auth/validate
   ```

## 🔄 Step 5: Initial Data Setup

After successful deployment:

1. **Sync Properties from Hostify**
   - Login to the app
   - Go to Dashboard
   - Click "Sync Properties"
   - This will fetch all listings from Hostify

2. **Sync Reservations**
   - Click "Sync Reservations"
   - Select date range (e.g., last 90 days)
   - This will fetch all reservation data with financials

3. **Configure Owners**
   - The app uses `data/owners.json` for owner information
   - You may need to manually map properties to owners

## 📁 Important: Data Persistence

⚠️ **Railway uses ephemeral storage** - any data saved to local files will be lost on redeployment!

### Current File-Based Data
- `data/listings.json` - Property listings
- `data/reservations.json` - Reservation data
- `data/owners.json` - Owner information
- `statements/` - Generated statements
- `uploads/` - Uploaded expense files

### Options for Production:

**Option A: PostgreSQL Database (Recommended)**
1. Add PostgreSQL to Railway project
2. Update the app to use database instead of JSON files
3. Data will persist across deployments

**Option B: External Storage**
1. Use AWS S3 or similar for file storage
2. Store JSON data in cloud storage
3. Update app to read/write from cloud storage

**Option C: Accept Data Loss**
- Understand that data will be lost on each deployment
- Re-sync from Hostify after each deploy
- Use for development/testing only

## 🐛 Troubleshooting

### Build Fails

**Check logs for:**
- `npm run build` errors
- TypeScript/ESLint errors in frontend
- Missing dependencies

**Solutions:**
- Review Railway build logs
- Fix any code errors
- Ensure `package.json` has all dependencies
- Push fixes to GitHub (Railway auto-deploys)

### App Won't Start

**Check logs for:**
- Port binding issues
- Missing environment variables
- Runtime errors

**Solutions:**
- Ensure `PORT=3003` is set in Railway variables
- Verify all required env variables are configured
- Check that `NODE_ENV=production` is set

### Can't Login

**Check:**
- `config/auth.json` exists in repository
- Default credentials: `LL` / `bnb547!`

**Solution:**
- Verify file exists in repo
- Check Railway logs for auth config loading errors

### QuickBooks OAuth Fails

**Check:**
- `QUICKBOOKS_REDIRECT_URI` matches your Railway URL exactly
- Redirect URI is added in QuickBooks Developer Console
- Client ID and Secret are correct

**Solution:**
- Update environment variable with correct Railway URL
- Ensure QuickBooks Developer Console has matching redirect URI
- Restart Railway deployment after changes

### Hostify API Errors

**Check:**
- `HOSTIFY_API_KEY` is correct
- `HOSTIFY_API_URL=https://api-rms.hostify.com`
- Railway logs for API error messages

**Solution:**
- Verify API key is correct
- Test API key with curl:
  ```bash
  curl -H "x-api-key: CePFsroZu03LA6C5szMsRuA2Eh62rGDS" \
       https://api-rms.hostify.com/listings
  ```

### Frontend Not Loading

**Check:**
- Build completed successfully
- `frontend/build/` directory was created
- Railway logs show build output

**Solution:**
- Ensure `npm run build` succeeds locally
- Fix any frontend build errors
- Push fixes to trigger new deployment

## 🔄 Redeploying

Railway automatically redeploys when you push to GitHub:

```bash
# Make changes locally
git add .
git commit -m "Your changes"
git push origin main

# Railway will automatically detect and redeploy
```

## 📝 Quick Reference

**Railway Project:** `courteous-amazement` (production)

**GitHub Repo:** `dnovakovic099/owner-statements-app-complete`

**Branch:** `main`

**Build Command:** `npm run build`
- Installs backend dependencies
- Installs frontend dependencies
- Builds React app to `frontend/build/`

**Start Command:** `npm start`
- Runs `node src/server.js`
- Serves React build in production mode
- API available at `/api/*`

**Default Port:** `3003` (Railway will map this to public URL)

## 🎯 Post-Deployment Checklist

- [ ] Railway deployment successful
- [ ] App URL accessible
- [ ] Login works with default credentials
- [ ] Environment variables all set
- [ ] QuickBooks redirect URI updated
- [ ] Properties sync from Hostify works
- [ ] Reservations sync from Hostify works
- [ ] Statement generation works
- [ ] QuickBooks OAuth connection works (if configured)

## 🔐 Security Notes

1. **Change default password** in `config/auth.json` for production
2. **Never commit** `.env` file to GitHub
3. **Use Railway's environment variables** for all secrets
4. **Keep API keys secure** - don't share in public repos
5. **Monitor Railway logs** for suspicious activity

## 📞 Support

- Railway Docs: [docs.railway.app](https://docs.railway.app)
- Hostify API Docs: [api-docs.hostify.com](https://api-docs.hostify.com)
- QuickBooks API Docs: [developer.intuit.com](https://developer.intuit.com)

---

**Last Updated:** October 27, 2025
**App Version:** 1.0.0

