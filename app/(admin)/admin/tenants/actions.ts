'use server';

import { updateTenantStatus, TenantStatus } from '@/lib/enhanced-subdomains';
import { revalidatePath } from 'next/cache';

export async function updateTenantStatusAction(subdomain: string, status: TenantStatus) {
  try {
    const success = await updateTenantStatus(subdomain, status);
    
    if (success) {
      revalidatePath('/admin/tenants');
      return { success: true, message: `Tenant ${subdomain} status updated to ${status}` };
    } else {
      return { success: false, error: 'Failed to update tenant status' };
    }
  } catch (error) {
    console.error('Error updating tenant status:', error);
    return { success: false, error: 'An error occurred while updating tenant status' };
  }
}