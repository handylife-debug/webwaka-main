'use client';

import { useState } from 'react';
import { TenantTableEnhancedCell } from '@/cells/admin/TenantTableEnhanced/src/client';
import { TenantDetailsCell } from '@/cells/admin/TenantDetails/src/client';
import { TenantFeatureToggleCell } from '@/cells/admin/TenantFeatureToggle/src/client';
import { updateTenantStatusAction } from './actions';
import { toggleTenantFeatureAction, updateTenantAction } from './feature-actions';
import { EnhancedTenant, TenantStatus } from '@/lib/enhanced-subdomains';

interface TenantManagementClientProps {
  tenants: EnhancedTenant[];
}

export function TenantManagementClient({ tenants: initialTenants }: TenantManagementClientProps) {
  const [tenants, setTenants] = useState(initialTenants);
  const [selectedTenant, setSelectedTenant] = useState<EnhancedTenant | null>(null);
  const [showTenantDetails, setShowTenantDetails] = useState(false);
  const [showFeatureToggle, setShowFeatureToggle] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleStatusChange = async (subdomain: string, status: TenantStatus) => {
    try {
      const result = await updateTenantStatusAction(subdomain, status);
      
      if (result.success) {
        // Update local state optimistically
        setTenants(prev => 
          prev.map(tenant => 
            tenant.subdomain === subdomain 
              ? { ...tenant, status }
              : tenant
          )
        );
        
        setNotification({
          type: 'success',
          message: result.message || 'Status updated successfully'
        });
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to update status'
        });
      }
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'An unexpected error occurred'
      });
    }

    // Clear notification after 3 seconds
    setTimeout(() => setNotification(null), 3000);
  };

  const handleViewDetails = (tenant: EnhancedTenant) => {
    setSelectedTenant(tenant);
    setShowTenantDetails(true);
  };

  const handleConfigureFeatures = (tenant: EnhancedTenant) => {
    setSelectedTenant(tenant);
    setShowFeatureToggle(true);
  };

  const handleFeatureToggle = async (featureId: string, enabled: boolean, config?: any) => {
    if (!selectedTenant) return;
    
    try {
      const result = await toggleTenantFeatureAction(
        selectedTenant.subdomain,
        featureId,
        enabled,
        config
      );
      
      if (result.success) {
        setNotification({
          type: 'success',
          message: `Feature ${enabled ? 'enabled' : 'disabled'} successfully`
        });
      } else {
        setNotification({
          type: 'error',
          message: result.message || 'Failed to toggle feature'
        });
      }
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'An unexpected error occurred while toggling feature'
      });
    } finally {
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleTenantUpdate = async (tenantId: string, updates: any) => {
    try {
      const result = await updateTenantAction(tenantId, updates);
      
      if (result.success) {
        // Update local state optimistically
        setTenants(prev => 
          prev.map(tenant => 
            tenant.subdomain === tenantId 
              ? { ...tenant, ...updates }
              : tenant
          )
        );
        
        setNotification({
          type: 'success',
          message: 'Tenant updated successfully'
        });
      } else {
        setNotification({
          type: 'error',
          message: result.message || 'Failed to update tenant'
        });
      }
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'An unexpected error occurred while updating tenant'
      });
    } finally {
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    }
  };

  return (
    <>
      <div className="p-6">
        <TenantTableEnhancedCell 
          tenants={tenants} 
          onStatusChange={handleStatusChange}
          onViewDetails={handleViewDetails}
          onConfigureFeatures={handleConfigureFeatures}
        />
      </div>

      {/* Tenant Details Modal */}
      <TenantDetailsCell
        isOpen={showTenantDetails}
        onClose={() => setShowTenantDetails(false)}
        tenant={selectedTenant ? {
          subdomain: selectedTenant.subdomain,
          tenantName: selectedTenant.tenantName,
          emoji: selectedTenant.emoji,
          subscriptionPlan: selectedTenant.subscriptionPlan,
          status: selectedTenant.status,
          createdAt: typeof selectedTenant.createdAt === 'number' ? selectedTenant.createdAt : Date.now(),
          lastActive: typeof selectedTenant.lastActive === 'number' ? selectedTenant.lastActive : undefined,
          features: selectedTenant.features || []
        } : null}
        onUpdate={handleTenantUpdate}
      />

      {/* Feature Toggle Modal */}
      <TenantFeatureToggleCell
        isOpen={showFeatureToggle}
        onClose={() => setShowFeatureToggle(false)}
        tenantId={selectedTenant?.subdomain || ''}
        tenantName={selectedTenant?.tenantName || ''}
        onFeatureToggle={handleFeatureToggle}
      />

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg max-w-sm ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">
                {notification.type === 'success' ? 'Success' : 'Error'}
              </h3>
              <div className="text-sm mt-1">{notification.message}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}