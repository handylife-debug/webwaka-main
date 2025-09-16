'use server';

import { cookies } from 'next/headers';
import { getAuthenticatedUser as getSecureAuthenticatedUser, getSecureTenantId as getSecureTenant } from '@/lib/auth-secure';
import type { User } from '@/lib/auth';

// Secure server-side authentication using NEW secure auth system
export async function getAuthenticatedUser(): Promise<User | null> {
  return await getSecureAuthenticatedUser();
}

// Get tenant ID from authenticated user (SECURE - from JWT, not headers)
export async function getSecureTenantId(): Promise<string> {
  return await getSecureTenant();
}

// Check if user has required role
export function hasRequiredRole(user: User | null, requiredRole: string): boolean {
  if (!user) return false;
  
  const roleHierarchy: Record<string, number> = {
    'User': 1,
    'Partner': 2,
    'Admin': 3,
    'SuperAdmin': 4,
  };
  
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole as keyof typeof roleHierarchy];
}

// Check vendor ownership using existing database structure
export async function checkVendorOwnership(user: User, vendorId: string, tenantId: string): Promise<boolean> {
  try {
    // Admin can access any vendor
    if (hasRequiredRole(user, 'Admin')) {
      return true;
    }

    // For Partner role, check if they own this vendor profile
    if (user.role === 'Partner') {
      const { execute_sql } = await import('@/lib/database');
      
      // Check against vendor_profiles table since partner_applications doesn't exist
      const vendorCheck = await execute_sql(
        'SELECT id FROM vendor_profiles WHERE id = $1 AND tenant_id = $2',
        [vendorId, tenantId]
      );
      
      // For now, allow partners to access any vendor in their tenant
      // This should be enhanced to check user-vendor relationship
      return vendorCheck.rows.length > 0;
    }

    return false;
  } catch (error) {
    console.error('Error checking vendor ownership:', error);
    return false;
  }
}