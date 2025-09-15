import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { EnhancedTenant, TenantStatus } from '@/lib/enhanced-subdomains';

export interface BulkActionResult {
  success: boolean;
  message: string;
  affectedCount: number;
  errors?: string[];
}

export const tenantTableEnhancedCell = {
  // Perform bulk actions on multiple tenants
  async bulkAction(
    action: string,
    tenantIds: string[],
    params?: any
  ): Promise<BulkActionResult> {
    return await safeRedisOperation(
      async () => {
        let affectedCount = 0;
        const errors: string[] = [];

        switch (action) {
          case 'updateStatus':
            for (const tenantId of tenantIds) {
              try {
                const tenantKey = `subdomain:${tenantId}`;
                const existingData = await redis.get(tenantKey);
                
                if (existingData) {
                  const updatedData = {
                    ...existingData,
                    status: params.status,
                    lastUpdated: Date.now()
                  };
                  await redis.set(tenantKey, updatedData);
                  affectedCount++;
                } else {
                  errors.push(`Tenant ${tenantId} not found`);
                }
              } catch (error) {
                errors.push(`Failed to update ${tenantId}: ${error}`);
              }
            }
            break;

          case 'updatePlan':
            for (const tenantId of tenantIds) {
              try {
                const tenantKey = `subdomain:${tenantId}`;
                const existingData = await redis.get(tenantKey);
                
                if (existingData) {
                  const updatedData = {
                    ...existingData,
                    subscriptionPlan: params.plan,
                    lastUpdated: Date.now()
                  };
                  await redis.set(tenantKey, updatedData);
                  affectedCount++;
                } else {
                  errors.push(`Tenant ${tenantId} not found`);
                }
              } catch (error) {
                errors.push(`Failed to update plan for ${tenantId}: ${error}`);
              }
            }
            break;

          case 'delete':
            for (const tenantId of tenantIds) {
              try {
                const tenantKey = `subdomain:${tenantId}`;
                await redis.delete(tenantKey);
                
                // Also clean up related data
                await redis.delete(`tenant_features:${tenantId}`);
                await redis.delete(`tenant_stats:${tenantId}`);
                await redis.delete(`tenant_history:${tenantId}`);
                
                affectedCount++;
              } catch (error) {
                errors.push(`Failed to delete ${tenantId}: ${error}`);
              }
            }
            break;

          default:
            return {
              success: false,
              message: `Unknown bulk action: ${action}`,
              affectedCount: 0
            };
        }

        const hasErrors = errors.length > 0;
        return {
          success: !hasErrors || affectedCount > 0,
          message: hasErrors 
            ? `Completed with ${errors.length} errors. ${affectedCount} tenants affected.`
            : `Successfully ${action} ${affectedCount} tenants`,
          affectedCount,
          errors: hasErrors ? errors : undefined
        };
      },
      {
        success: false,
        message: 'Failed to perform bulk action',
        affectedCount: 0
      }
    );
  },

  // Search tenants with advanced filtering
  async searchTenants(
    query: string,
    filters?: {
      status?: TenantStatus;
      plan?: string;
      dateRange?: string;
    },
    pagination?: {
      page: number;
      limit: number;
    }
  ): Promise<{ tenants: EnhancedTenant[]; total: number }> {
    return await safeRedisOperation(
      async () => {
        // Get all tenant keys
        const keys = await redis.list('subdomain:');
        
        if (!keys.length) {
          return { tenants: [], total: 0 };
        }

        // Fetch all tenant data
        const tenantsData = await Promise.all(
          keys.map(async (key) => {
            const data = await redis.get(key);
            const subdomain = key.replace('subdomain:', '');
            return {
              subdomain,
              tenantName: data?.tenantName || subdomain,
              emoji: data?.emoji || '❓',
              subscriptionPlan: data?.subscriptionPlan || 'Free',
              status: data?.status || 'Active',
              createdAt: data?.createdAt || Date.now(),
              lastActive: data?.lastActive,
              features: data?.features || [],
            };
          })
        );

        // Apply filters
        let filteredTenants = tenantsData;

        // Text search
        if (query) {
          const searchLower = query.toLowerCase();
          filteredTenants = filteredTenants.filter(tenant =>
            tenant.tenantName.toLowerCase().includes(searchLower) ||
            tenant.subdomain.toLowerCase().includes(searchLower)
          );
        }

        // Status filter
        if (filters?.status) {
          filteredTenants = filteredTenants.filter(tenant => 
            tenant.status === filters.status
          );
        }

        // Plan filter
        if (filters?.plan) {
          filteredTenants = filteredTenants.filter(tenant => 
            tenant.subscriptionPlan === filters.plan
          );
        }

        // Date range filter
        if (filters?.dateRange) {
          const now = Date.now();
          filteredTenants = filteredTenants.filter(tenant => {
            switch (filters.dateRange) {
              case 'today':
                return now - tenant.createdAt < 24 * 60 * 60 * 1000;
              case 'week':
                return now - tenant.createdAt < 7 * 24 * 60 * 60 * 1000;
              case 'month':
                return now - tenant.createdAt < 30 * 24 * 60 * 60 * 1000;
              default:
                return true;
            }
          });
        }

        const total = filteredTenants.length;

        // Apply pagination
        if (pagination) {
          const start = (pagination.page - 1) * pagination.limit;
          filteredTenants = filteredTenants.slice(start, start + pagination.limit);
        }

        return {
          tenants: filteredTenants,
          total
        };
      },
      { tenants: [], total: 0 }
    );
  },

  // Export tenant data
  async exportData(
    format: 'csv' | 'json' = 'csv',
    filters?: any
  ): Promise<{ success: boolean; data?: string; filename?: string }> {
    return await safeRedisOperation(
      async () => {
        const { tenants } = await this.searchTenants('', filters);
        
        if (format === 'csv') {
          const headers = ['Tenant Name', 'Subdomain', 'Plan', 'Status', 'Created', 'Last Active'];
          const rows = tenants.map(tenant => [
            tenant.tenantName,
            tenant.subdomain,
            tenant.subscriptionPlan,
            tenant.status,
            new Date(tenant.createdAt).toISOString(),
            tenant.lastActive ? new Date(tenant.lastActive).toISOString() : 'Never'
          ]);
          
          const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
          
          return {
            success: true,
            data: csvContent,
            filename: `tenants-export-${new Date().toISOString().split('T')[0]}.csv`
          };
        } else {
          return {
            success: true,
            data: JSON.stringify(tenants, null, 2),
            filename: `tenants-export-${new Date().toISOString().split('T')[0]}.json`
          };
        }
      },
      {
        success: false
      }
    );
  },

  // Get tenant analytics for the table
  async getTableAnalytics(): Promise<{
    totalTenants: number;
    byStatus: Record<string, number>;
    byPlan: Record<string, number>;
    recentGrowth: number;
  }> {
    return await safeRedisOperation(
      async () => {
        const { tenants } = await this.searchTenants('');
        
        const byStatus: Record<string, number> = {};
        const byPlan: Record<string, number> = {};
        
        tenants.forEach(tenant => {
          byStatus[tenant.status] = (byStatus[tenant.status] || 0) + 1;
          byPlan[tenant.subscriptionPlan] = (byPlan[tenant.subscriptionPlan] || 0) + 1;
        });

        // Calculate recent growth (tenants created in last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentTenants = tenants.filter(t => t.createdAt > thirtyDaysAgo);
        const recentGrowth = tenants.length > 0 ? (recentTenants.length / tenants.length) * 100 : 0;

        return {
          totalTenants: tenants.length,
          byStatus,
          byPlan,
          recentGrowth
        };
      },
      {
        totalTenants: 0,
        byStatus: {},
        byPlan: {},
        recentGrowth: 0
      }
    );
  }
};