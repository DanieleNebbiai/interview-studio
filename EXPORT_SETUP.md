# Video Export System Setup Guide

This guide will help you set up the complete video export system for Interview Studio.

## Prerequisites

- Node.js 18+
- Redis server (local or cloud)
- Cloudflare R2 or AWS S3 account
- Railway account (for worker deployment)

## 1. Redis Setup (Job Queue)

### Option A: Redis Cloud (Recommended for production)
1. Go to [Redis Cloud](https://redis.com/try-free/)
2. Create a free account and database
3. Copy the connection string (format: `rediss://default:password@redis-xxxxx.c1.cloud.redislabs.com:12345`)

### Option B: Local Redis (Development)
```bash
# Install Redis locally
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis
```

## 2. Cloudflare R2 Setup (Video Storage)

1. **Create R2 Bucket**:
   - Go to Cloudflare Dashboard > R2 Object Storage
   - Create bucket named `interview-studio-exports`
   - Enable public access for download URLs

2. **Create API Token**:
   - Go to "My Profile" > "API Tokens"
   - Create token with R2 permissions
   - Save the Access Key ID and Secret Access Key

3. **Get R2 Endpoint**:
   - Format: `https://<account-id>.r2.cloudflarestorage.com`
   - Find your account ID in the Cloudflare dashboard

## 3. Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### Required Variables:
```env
# Redis (from step 1)
REDIS_URL=rediss://default:password@redis-xxxxx.c1.cloud.redislabs.com:12345

# Cloudflare R2 (from step 2)  
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=interview-studio-exports

# Your existing Supabase config
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 4. Railway Worker Deployment

### Create Railway Project:
1. Go to [Railway](https://railway.app) and create account
2. Create new project from GitHub repo
3. Add environment variables in Railway dashboard

### Railway Configuration:
```toml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run worker"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10

[[services]]
name = "worker"
```

### Deploy Commands:
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

## 5. Local Development Testing

### Start the worker locally:
```bash
npm run worker
```

### Test export functionality:
1. Go to your editor page
2. Click "Esporta Video" 
3. Check worker logs for processing progress
4. Verify video appears in R2 bucket

## 6. Production Deployment Checklist

- [ ] Redis Cloud database configured
- [ ] R2 bucket created with correct permissions
- [ ] Environment variables set in production
- [ ] Railway worker deployed and running
- [ ] Test export end-to-end
- [ ] Monitor worker logs for errors

## Troubleshooting

### Common Issues:

**Export hangs at "Queued":**
- Check Redis connection
- Verify worker is running
- Check worker logs

**"Failed to download video" errors:**
- Verify video URLs are accessible
- Check network connectivity from worker
- Ensure sufficient disk space in /tmp

**Upload to R2 fails:**
- Verify R2 credentials
- Check bucket permissions
- Ensure bucket exists

**FFmpeg errors:**
- Worker needs FFmpeg installed (Railway includes it)
- Check video format compatibility
- Monitor memory usage

## Commands

```bash
# Start development server
npm run dev

# Start worker process
npm run worker

# Test Redis connection
npm run test:redis

# Check export job status
npm run debug:jobs
```

## Architecture Overview

```
[Frontend] → [Next.js API] → [Redis Queue] → [Railway Worker] → [R2 Storage]
    ↓              ↓              ↓              ↓              ↓
  Export UI    Create Job     Queue Job    Process Video   Store Result
                                              (FFmpeg)        
```

## Support

If you encounter issues:
1. Check worker logs in Railway dashboard
2. Verify all environment variables are set
3. Test individual components (Redis, R2, worker)
4. Monitor browser network tab for API errors