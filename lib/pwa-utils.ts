/**
 * MOD-501-3: PWA Utilities - DEPRECATED
 * 
 * This file has been deprecated and split into:
 * - pwa-utils-client.ts - For client-side usage (React components)
 * - pwa-utils-server.ts - For server-side usage (API routes)
 * 
 * Please update your imports to use the appropriate version.
 */

// Re-export client utilities for backward compatibility
export * from './pwa-utils-client';

// Note: Server utilities must be imported directly from pwa-utils-server.ts
// to maintain proper client/server boundary separation.