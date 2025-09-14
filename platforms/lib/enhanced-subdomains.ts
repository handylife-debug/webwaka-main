import { redis } from '@/lib/redis';

export type SubscriptionPlan = 'Free' | 'Pro' | 'Enterprise';
export type TenantStatus = 'Active' | 'Suspended' | 'Pending' | 'Inactive';

export interface EnhancedTenant {
  subdomain: string;
  tenantName: string;
  emoji: string;
  subscriptionPlan: SubscriptionPlan;
  status: TenantStatus;
  createdAt: number;
  lastActive?: number;
  features?: string[];
}

// Enhanced subdomain data structure
type EnhancedSubdomainData = {
  emoji: string;
  tenantName: string;
  subscriptionPlan: SubscriptionPlan;
  status: TenantStatus;
  createdAt: number;
  lastActive?: number;
  features?: string[];
};

export function isValidIcon(str: string) {
  if (str.length > 10) {
    return false;
  }

  try {
    const emojiPattern = /[\p{Emoji}]/u;
    if (emojiPattern.test(str)) {
      return true;
    }
  } catch (error) {
    console.warn('Emoji regex validation failed, using fallback validation', error);
  }

  return str.length >= 1 && str.length <= 10;
}

export async function getEnhancedSubdomainData(subdomain: string): Promise<EnhancedTenant | null> {
  try {
    const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const data = await redis.get<EnhancedSubdomainData>(`subdomain:${sanitizedSubdomain}`);
    
    if (!data) return null;
    
    return {
      subdomain: sanitizedSubdomain,
      tenantName: data.tenantName || sanitizedSubdomain,
      emoji: data.emoji || '❓',
      subscriptionPlan: data.subscriptionPlan || 'Free',
      status: data.status || 'Active',
      createdAt: data.createdAt || Date.now(),
      lastActive: data.lastActive,
      features: data.features || [],
    };
  } catch (error) {
    console.error('Error fetching enhanced subdomain data:', error);
    return null;
  }
}

export async function getAllEnhancedSubdomains(): Promise<EnhancedTenant[]> {
  try {
    const keys = await redis.keys('subdomain:*');

    if (!keys.length) {
      return [];
    }

    const values = await redis.mget<EnhancedSubdomainData[]>(...keys);

    return keys.map((key, index) => {
      const subdomain = key.replace('subdomain:', '');
      const data = values[index];

      return {
        subdomain,
        tenantName: data?.tenantName || generateTenantName(subdomain),
        emoji: data?.emoji || '❓',
        subscriptionPlan: data?.subscriptionPlan || 'Free',
        status: data?.status || 'Active',
        createdAt: data?.createdAt || Date.now(),
        lastActive: data?.lastActive,
        features: data?.features || [],
      };
    });
  } catch (error) {
    console.error('Error fetching all enhanced subdomains:', error);
    return [];
  }
}

export async function updateTenantStatus(subdomain: string, status: TenantStatus): Promise<boolean> {
  try {
    const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existing = await redis.get<EnhancedSubdomainData>(`subdomain:${sanitizedSubdomain}`);
    
    if (!existing) return false;
    
    const updated = {
      ...existing,
      status,
      lastActive: Date.now(),
    };
    
    await redis.set(`subdomain:${sanitizedSubdomain}`, updated);
    return true;
  } catch (error) {
    console.error('Error updating tenant status:', error);
    return false;
  }
}

export async function updateTenantPlan(subdomain: string, plan: SubscriptionPlan): Promise<boolean> {
  try {
    const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existing = await redis.get<EnhancedSubdomainData>(`subdomain:${sanitizedSubdomain}`);
    
    if (!existing) return false;
    
    const updated = {
      ...existing,
      subscriptionPlan: plan,
      lastActive: Date.now(),
    };
    
    await redis.set(`subdomain:${sanitizedSubdomain}`, updated);
    return true;
  } catch (error) {
    console.error('Error updating tenant plan:', error);
    return false;
  }
}

// Helper function to generate a readable tenant name from subdomain
function generateTenantName(subdomain: string): string {
  return subdomain
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}