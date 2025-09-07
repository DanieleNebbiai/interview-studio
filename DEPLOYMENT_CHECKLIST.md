# Interview Studio Export System - Deployment Checklist

## ✅ Pre-Deployment Setup

### 1. Redis Cloud Setup
- [ ] Create Redis Cloud account
- [ ] Create database instance
- [ ] Copy connection string (REDIS_URL)
- [ ] Test connection locally

### 2. Cloudflare R2 Setup  
- [ ] Create Cloudflare account
- [ ] Set up R2 Object Storage
- [ ] Create `interview-studio-exports` bucket
- [ ] Generate API tokens (Access Key ID + Secret)
- [ ] Configure bucket permissions for public read
- [ ] Get R2 endpoint URL

### 3. Environment Configuration
- [ ] Copy `.env.example` to `.env.local`
- [ ] Fill in Redis URL
- [ ] Fill in R2 credentials and endpoint
- [ ] Verify Supabase configuration
- [ ] Test environment locally with `npm run dev`

## ✅ Railway Worker Deployment

### 1. Railway Setup
- [ ] Create Railway account
- [ ] Install Railway CLI: `npm install -g @railway/cli`  
- [ ] Login: `railway login`
- [ ] Run deployment script: `./scripts/railway-deploy.sh`

### 2. Railway Configuration
- [ ] Set all environment variables in Railway dashboard
- [ ] Configure `railway.toml` with correct settings
- [ ] Set worker start command: `npm run worker`
- [ ] Enable health checks on port 3001

### 3. Deployment Verification
- [ ] Check Railway deployment logs
- [ ] Verify worker is processing jobs
- [ ] Test health check endpoint
- [ ] Monitor Redis queue status

## ✅ Production Testing

### 1. End-to-End Export Test
- [ ] Create test recording session
- [ ] Navigate to editor page
- [ ] Click "Esporta Video" button
- [ ] Configure export settings
- [ ] Start export and monitor progress
- [ ] Verify download works correctly

### 2. System Monitoring
- [ ] Check Railway worker logs for errors
- [ ] Monitor Redis queue metrics
- [ ] Verify R2 storage usage
- [ ] Test concurrent export scenarios

### 3. Performance Validation
- [ ] Test with multiple video files
- [ ] Test with long duration videos (30+ min)
- [ ] Verify subtitle generation works
- [ ] Test different export formats/qualities

## ✅ Production Deployment

### 1. Next.js Application
- [ ] Deploy main application to production (Vercel/Railway)
- [ ] Set production environment variables
- [ ] Verify API endpoints work in production
- [ ] Test export functionality end-to-end

### 2. Monitoring & Maintenance
- [ ] Set up logging/monitoring for worker
- [ ] Configure alerts for export failures
- [ ] Monitor R2 storage costs
- [ ] Set up Redis monitoring

## 🚨 Troubleshooting

### Common Issues:

**Export stuck in "Queued" status:**
- Check Railway worker logs
- Verify Redis connection
- Restart Railway worker service

**"Failed to download video" errors:**
- Verify video URLs are publicly accessible
- Check network connectivity from Railway worker
- Verify Supabase storage permissions

**Upload to R2 fails:**
- Double-check R2 credentials
- Verify bucket exists and permissions
- Check R2 endpoint URL format

**FFmpeg processing errors:**
- Check video format compatibility
- Monitor Railway worker memory usage
- Verify all input videos are valid

## 📊 Success Metrics

- [ ] Export completion rate > 95%
- [ ] Average export time < 5 minutes for 30min video
- [ ] Zero data loss during processing
- [ ] Proper cleanup of temporary files
- [ ] Successful concurrent user handling

## 🔧 Maintenance Tasks

### Weekly:
- [ ] Review Railway worker logs
- [ ] Check R2 storage usage and costs
- [ ] Monitor Redis memory usage
- [ ] Review failed export jobs

### Monthly:
- [ ] Update dependencies
- [ ] Review and optimize FFmpeg settings
- [ ] Analyze export performance metrics
- [ ] Plan for scaling if needed

---

## Quick Commands

```bash
# Deploy worker to Railway
./scripts/railway-deploy.sh

# Check worker status
railway logs

# Monitor worker in real-time
railway logs --follow

# Test export locally
npm run worker

# Check Redis connection
redis-cli -u $REDIS_URL ping
```

## Support Contacts

- Railway Support: https://help.railway.app
- Cloudflare R2 Docs: https://developers.cloudflare.com/r2/
- Redis Cloud Support: https://redis.com/company/support/