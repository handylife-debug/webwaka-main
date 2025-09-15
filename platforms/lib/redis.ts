// Use Replit's built-in Key-Value store instead of Upstash Redis
import Database from '@replit/database';

// Create Database instance using Replit's built-in KV store
export const redis = new Database();

// Helper function to safely use Database operations
export async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation failed:', error);
    return fallback;
  }
}
