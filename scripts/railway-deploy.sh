#!/bin/bash

# Railway deployment script for Interview Studio Worker
echo "🚂 Starting Railway deployment for Interview Studio Worker..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

# Create new Railway project or link existing one
echo "🔗 Setting up Railway project..."
read -p "Do you want to create a new Railway project? (y/N): " create_new

if [[ $create_new =~ ^[Yy]$ ]]; then
    echo "Creating new Railway project..."
    railway create interview-studio-worker
else
    echo "Linking to existing project..."
    railway link
fi

# Set environment variables
echo "🔧 Setting up environment variables..."
echo "Please configure these environment variables in Railway dashboard:"
echo ""
echo "Required variables:"
echo "- REDIS_URL=rediss://default:password@your-redis-url"
echo "- R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com"
echo "- R2_ACCESS_KEY_ID=your_access_key"
echo "- R2_SECRET_ACCESS_KEY=your_secret_key"
echo "- R2_BUCKET_NAME=interview-studio-exports"
echo "- NEXT_PUBLIC_SUPABASE_URL=your_supabase_url"
echo "- NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key"
echo "- NODE_ENV=production"
echo ""

read -p "Have you set all environment variables in Railway dashboard? (y/N): " env_set

if [[ ! $env_set =~ ^[Yy]$ ]]; then
    echo "❌ Please set environment variables first in Railway dashboard"
    echo "Visit: https://railway.app/dashboard"
    exit 1
fi

# Deploy the worker
echo "🚀 Deploying worker to Railway..."
railway up

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Check deployment status: railway logs"
echo "2. Monitor worker activity: railway logs --follow"
echo "3. Test export functionality in your app"
echo "4. Check Railway dashboard for metrics"