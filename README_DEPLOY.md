# Production Deployment Guide

## Vercel Deployment

### Prerequisites
1. Vercel account
2. GitHub repository connected
3. Environment variables set

### Frontend Deployment (Vercel)

1. **Connect Repository to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Import your GitHub repository
   - Vercel will auto-detect Vite configuration

2. **Environment Variables**
   - In Vercel project settings, add:
     ```
     VITE_API_URL=https://your-api-server-url.com
     ```
   - Replace with your actual API server URL

3. **Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Framework Preset: Vite

4. **Deploy**
   - Push to main branch or click "Deploy" in Vercel dashboard

### API Server Deployment Options

#### Option 1: Vercel Serverless Functions (Recommended for small scale)

Create `api/tourists.js`:
```javascript
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'tourists.db');

export default async function handler(req, res) {
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    const { year, month } = req.query;
    // ... your API logic
  } finally {
    db.close();
  }
}
```

**Note**: Vercel Functions have limitations:
- 10s timeout (Hobby plan)
- 50MB function size limit
- SQLite file needs to be in function bundle

#### Option 2: Separate Server (Railway, Render, etc.)

1. **Deploy to Railway/Render**
   - Create new project
   - Connect GitHub repo
   - Set environment variables:
     ```
     PORT=3001
     NODE_ENV=production
     ```
   - Deploy `server/index.js`

2. **Update Frontend Environment Variable**
   - In Vercel, update `VITE_API_URL` to your Railway/Render URL

#### Option 3: Vercel API Routes (Alternative)

If using Vercel Functions, create:
- `api/tourists/route.js` for `/api/tourists`
- `api/tourists/stats/route.js` for `/api/tourists/stats`

## Environment Variables

### Frontend (.env.production)
```
VITE_API_URL=https://your-api-server.com
```

### API Server
```
PORT=3001
NODE_ENV=production
```

## Build Optimization

Production build includes:
- ✅ Minified code
- ✅ Tree shaking
- ✅ Code splitting
- ✅ No sourcemaps (faster builds)
- ✅ Console.log removed

## Checklist Before Deployment

- [ ] Environment variables set in Vercel
- [ ] API server deployed and accessible
- [ ] `VITE_API_URL` points to production API
- [ ] Test production build locally: `npm run build && npm run preview`
- [ ] Database file accessible (if using Vercel Functions)
- [ ] CORS configured correctly
- [ ] Error handling tested

## Troubleshooting

### CORS Errors
- Ensure API server has CORS enabled
- Check `VITE_API_URL` is correct
- Verify API server is accessible

### API Not Found
- Check `VITE_API_URL` environment variable
- Verify API server is running
- Check network tab for actual request URL

### Database Errors
- Ensure `tourists.db` is in correct location
- Check file permissions
- For Vercel Functions, database must be in function bundle
