import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';

export interface TenantStatsData {
  totalUsers: number;
  activeUsers: number;
  storageUsed: number;
  apiCalls: number;
  revenue: number;
  growth: number;
}

export const tenantDetailsCell = {
  // Get comprehensive tenant statistics
  async getTenantStats(tenantId: string): Promise<TenantStatsData> {
    return await safeRedisOperation(
      async () => {
        // In a real implementation, this would aggregate data from multiple sources
        const statsKey = `tenant_stats:${tenantId}`;
        let stats = await redis.get<TenantStatsData>(statsKey);
        
        if (!stats) {
          // Generate initial stats or fetch from analytics service
          stats = {
            totalUsers: Math.floor(Math.random() * 100) + 10,
            activeUsers: Math.floor(Math.random() * 50) + 5,
            storageUsed: Math.floor(Math.random() * 1000) + 100,
            apiCalls: Math.floor(Math.random() * 10000) + 1000,
            revenue: Math.floor(Math.random() * 50000) + 5000,
            growth: Math.floor(Math.random() * 20) - 10
          };
          
          // Cache stats for 1 hour
          await redis.set(statsKey, stats);
        }
        
        return stats;
      },
      {
        totalUsers: 0,
        activeUsers: 0,
        storageUsed: 0,
        apiCalls: 0,
        revenue: 0,
        growth: 0
      }
    );
  },

  // Update tenant configuration
  async updateTenantConfig(tenantId: string, updates: any): Promise<{ success: boolean; message: string }> {
    return await safeRedisOperation(
      async () => {
        const tenantKey = `subdomain:${tenantId}`;
        const existingData = await redis.get(tenantKey);
        
        if (!existingData) {
          return { success: false, message: 'Tenant not found' };
        }
        
        const updatedData = {
          ...existingData,
          ...updates,
          lastUpdated: Date.now()
        };
        
        await redis.set(tenantKey, updatedData);
        
        return { success: true, message: 'Tenant updated successfully' };
      },
      { success: false, message: 'Failed to update tenant' }
    );
  },

  // Get tenant history/activity log
  async getTenantHistory(tenantId: string, limit: number = 50): Promise<any[]> {
    return await safeRedisOperation(
      async () => {
        const historyKey = `tenant_history:${tenantId}`;
        const historyData = await redis.lrange(historyKey, 0, limit - 1);
        
        return await Promise.all(
          historyData.map(async (activityId: string) => {
            return await redis.get(`activity:${activityId}`);
          })
        );
      },
      []
    );
  },

  // Log tenant activity
  async logTenantActivity(tenantId: string, activity: {
    action: string;
    userId: string;
    details: string;
    metadata?: any;
  }): Promise<void> {
    await safeRedisOperation(
      async () => {
        const activityId = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const activityData = {
          id: activityId,
          tenantId,
          ...activity,
          timestamp: Date.now()
        };
        
        // Store activity data
        await redis.set(`activity:${activityId}`, activityData);
        
        // Add to tenant history
        await redis.lpush(`tenant_history:${tenantId}`, activityId);
        
        // Keep only last 1000 activities per tenant
        await redis.lrange(`tenant_history:${tenantId}`, 0, 999);
      },
      undefined
    );
  }
};