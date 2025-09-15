'use server';

import { tenantFeatureToggleCell } from '@/cells/admin/TenantFeatureToggle/src/server';
import { tenantDetailsCell } from '@/cells/admin/TenantDetails/src/server';

export async function toggleTenantFeatureAction(
  tenantId: string,
  featureId: string,
  enabled: boolean,
  config?: any
) {
  try {
    const result = await tenantFeatureToggleCell.toggleFeature(
      tenantId,
      featureId,
      enabled,
      config
    );
    
    return result;
  } catch (error) {
    console.error('Failed to toggle feature:', error);
    return {
      success: false,
      message: 'Failed to toggle feature',
      updatedFeatures: []
    };
  }
}

export async function updateTenantAction(
  tenantId: string,
  updates: any
) {
  try {
    const result = await tenantDetailsCell.updateTenantConfig(tenantId, updates);
    return result;
  } catch (error) {
    console.error('Failed to update tenant:', error);
    return {
      success: false,
      message: 'Failed to update tenant'
    };
  }
}