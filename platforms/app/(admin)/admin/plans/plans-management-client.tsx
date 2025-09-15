'use client';

import { useState } from 'react';
import { PlansDataTable } from '@/components/admin/plans-data-table';
import { PlanForm } from '@/components/admin/plan-form';
import { PlanDetailsModalCell } from '@/cells/admin/PlanDetailsModal/src/client';
import { createPlanAction, updatePlanAction, updatePlanStatusAction } from './actions';
import { SubscriptionPlan, CreatePlanData, PlanStatus } from '@/lib/plans-management';

interface PlansManagementClientProps {
  plans: SubscriptionPlan[];
  currentUser: { id: string; email: string; role: string };
}

export function PlansManagementClient({ 
  plans: initialPlans, 
  currentUser 
}: PlansManagementClientProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleCreatePlan = async (data: CreatePlanData) => {
    try {
      // Remove createdBy from client data - server will set it from auth
      const { createdBy, ...planData } = data;
      const result = await createPlanAction(planData as CreatePlanData);
      
      if (result.success) {
        // Add new plan to local state (or refetch)
        setNotification({
          type: 'success',
          message: `Plan "${data.name}" created successfully`
        });
        
        // Refresh the page to get updated data
        window.location.reload();
        
        return { success: true };
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to create plan'
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred';
      setNotification({
        type: 'error',
        message: errorMessage
      });
      return { success: false, error: errorMessage };
    } finally {
      // Clear notification after 4 seconds
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleEditPlan = async (planId: string, data: Partial<CreatePlanData>) => {
    try {
      const result = await updatePlanAction(planId, data);
      
      if (result.success) {
        // Update local state optimistically (exclude features to avoid type conflicts)
        const { features, ...updateData } = data;
        setPlans(prev => 
          prev.map(plan => 
            plan.id === planId 
              ? { ...plan, ...updateData, updatedAt: new Date() }
              : plan
          )
        );
        
        setEditingPlan(null);
        setNotification({
          type: 'success',
          message: 'Plan updated successfully'
        });
        
        return { success: true };
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to update plan'
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred';
      setNotification({
        type: 'error',
        message: errorMessage
      });
      return { success: false, error: errorMessage };
    } finally {
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleStatusChange = async (planId: string, status: PlanStatus) => {
    try {
      const result = await updatePlanStatusAction(planId, status);
      
      if (result.success) {
        // Update local state optimistically
        setPlans(prev => 
          prev.map(plan => 
            plan.id === planId 
              ? { ...plan, status, updatedAt: new Date() }
              : plan
          )
        );
        
        setNotification({
          type: 'success',
          message: result.message || 'Plan status updated successfully'
        });
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to update plan status'
        });
      }
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'An unexpected error occurred'
      });
    } finally {
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleEditClick = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
  };

  const handleViewDetails = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setShowPlanDetails(true);
  };

  const handlePlanUpdate = async (planId: string, updates: any) => {
    try {
      const result = await updatePlanAction(planId, updates);
      
      if (result.success) {
        // Update local state optimistically
        setPlans(prev => 
          prev.map(plan => 
            plan.id === planId 
              ? { ...plan, ...updates, updatedAt: new Date() }
              : plan
          )
        );
        
        setNotification({
          type: 'success',
          message: 'Plan updated successfully'
        });
        
        return { success: true };
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to update plan'
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred';
      setNotification({
        type: 'error',
        message: errorMessage
      });
      return { success: false, error: errorMessage };
    } finally {
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Create/Edit Plan Form */}
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">Subscription Plans</h3>
            <p className="text-sm text-gray-600">
              Manage your pricing plans with features and limits.
            </p>
          </div>
          <div className="flex gap-2">
            {editingPlan && (
              <PlanForm 
                editingPlan={editingPlan}
                onEdit={handleEditPlan}
                onSubmit={handleCreatePlan}
              />
            )}
            {!editingPlan && (
              <PlanForm onSubmit={handleCreatePlan} />
            )}
          </div>
        </div>

        {/* Plans Table */}
        <PlansDataTable 
          plans={plans}
          onStatusChange={handleStatusChange}
          onEdit={handleEditClick}
          onViewDetails={handleViewDetails}
        />
      </div>

      {/* Plan Details Modal */}
      <PlanDetailsModalCell
        isOpen={showPlanDetails}
        onClose={() => setShowPlanDetails(false)}
        plan={selectedPlan}
        onUpdate={handlePlanUpdate}
      />

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg max-w-sm z-50 ${
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