import { Redis } from '@upstash/redis';

// Create Redis instance with fallback for development
export const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN 
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN
    })
  : null;

// Helper function to safely use Redis operations
export async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (!redis) {
    console.warn('Redis not configured, using fallback value');
    return fallback;
  }
  
  try {
    return await operation();
  } catch (error) {
    console.error('Redis operation failed:', error);
    return fallback;
  }
}
