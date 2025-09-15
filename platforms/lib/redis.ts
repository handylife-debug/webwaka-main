// Use Replit's built-in Key-Value store instead of Upstash Redis
import Database from '@replit/database';

// Create Database instance using Replit's built-in KV store
const db = new Database();

// Typed Redis adapter that provides the expected API
export const redis = {
  get: async <T = any>(key: string): Promise<T | null> => {
    const v = await db.get(key);
    return (v === undefined || v === null) ? null : (v as T);
  },
  set: async (key: string, value: unknown, options?: { ex?: number }): Promise<void> => {
    await db.set(key, value);
    // Note: Replit Database doesn't support TTL, so we ignore the options for now
    // In a production app, you'd want to implement TTL with a cleanup mechanism
  },
  list: async (prefix?: string): Promise<string[]> => {
    const result = await db.list(prefix);
    return Array.isArray(result) ? result : [];
  },
  keys: async (pattern: string): Promise<string[]> => {
    // Use list method for pattern matching since Database doesn't have keys
    const prefix = pattern.replace('*', '');
    return await redis.list(prefix);
  },
  delete: async (key: string): Promise<void> => {
    await db.delete(key);
  },
  del: async (key: string): Promise<number> => {
    await db.delete(key);
    return 1; // Return 1 to indicate successful deletion
  },
  mget: async <T = any>(...keys: string[]): Promise<(T | null)[]> => {
    return Promise.all(keys.map(key => redis.get<T>(key)));
  },
  lpush: async (key: string, ...values: string[]): Promise<number> => {
    // Since Database doesn't support lists, we'll simulate with a simple array stored as JSON
    const existing = await redis.get<string[]>(key) || [];
    const updated = [...values, ...existing];
    await redis.set(key, updated);
    return updated.length;
  },
  lrange: async (key: string, start: number, stop: number): Promise<string[]> => {
    const list = await redis.get<string[]>(key) || [];
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  },
};

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
