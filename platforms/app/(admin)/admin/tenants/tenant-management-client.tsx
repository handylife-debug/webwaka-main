'use client';

import { useState } from 'react';
import { TenantDataTable } from '@/components/admin/tenant-data-table';
import { updateTenantStatusAction } from './actions';
import { EnhancedTenant, TenantStatus } from '@/lib/enhanced-subdomains';

interface TenantManagementClientProps {
  tenants: EnhancedTenant[];
}

export function TenantManagementClient({ tenants: initialTenants }: TenantManagementClientProps) {
  const [tenants, setTenants] = useState(initialTenants);
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

  return (
    <>
      <div className="p-6">
        <TenantDataTable 
          tenants={tenants} 
          onStatusChange={handleStatusChange}
        />
      </div>

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