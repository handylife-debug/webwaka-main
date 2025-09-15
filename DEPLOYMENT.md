# Deployment Configuration

## Vercel Deployment Setup

For proper deployment on Vercel:

1. **Project Root Configuration**: 
   - Set the Root Directory to `platforms` in Vercel Project Settings
   - This allows Vercel to auto-detect the Next.js app correctly

2. **Build Configuration**:
   - Install Command: `pnpm install` (auto-detected)
   - Build Command: `pnpm build` (auto-detected)  
   - Output Directory: Auto-detected by Vercel for Next.js

3. **Environment Variables**:
   - Configure `KV_REST_API_URL` and `KV_REST_API_TOKEN` for Redis if needed
   - The app gracefully falls back when Redis isn't configured

## Why No vercel.json?

This Next.js application uses App Router and is designed to work with Vercel's auto-detection. A custom vercel.json file with rewrites would interfere with Next.js routing and static asset resolution.

## Replit Environment

The app is configured to work in Replit development environment with:
- Proper CORS handling via `allowedDevOrigins`
- Port 5000 binding for frontend access
- Graceful Redis fallback when environment variables aren't set