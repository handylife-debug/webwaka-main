'use server';

import { createPlan, updatePlan, CreatePlanData, PlanStatus } from '@/lib/plans-management';
import { getCurrentUser } from '@/lib/auth-server';
import { logActivity } from '@/lib/user-management';
import { revalidatePath } from 'next/cache';

export async function createPlanAction(planData: CreatePlanData) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can create plans' };
    }

    // Create the plan
    const planId = await createPlan({
      ...planData,
      createdBy: currentUser.id
    });

    // Log the activity
    await logActivity({
      userId: currentUser.id,
      userEmail: currentUser.email,
      action: 'plan_created',
      targetType: 'system',
      targetId: planId,
      details: `Created subscription plan: ${planData.name} (₦${planData.price}/${planData.interval})`,
    });

    revalidatePath('/admin/plans');
    return { 
      success: true, 
      message: `Plan "${planData.name}" created successfully`,
      planId 
    };
  } catch (error) {
    console.error('Error creating plan:', error);
    return { 
      success: false, 
      error: 'An error occurred while creating the plan' 
    };
  }
}

export async function updatePlanAction(planId: string, updates: Partial<CreatePlanData>) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can update plans' };
    }

    // Update the plan
    const success = await updatePlan(planId, updates);
    
    if (success) {
      // Log the activity
      await logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'plan_updated',
        targetType: 'system',
        targetId: planId,
        details: `Updated subscription plan: ${updates.name || 'plan'} - ${Object.keys(updates).join(', ')}`,
      });

      revalidatePath('/admin/plans');
      return { 
        success: true, 
        message: 'Plan updated successfully' 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to update plan' 
      };
    }
  } catch (error) {
    console.error('Error updating plan:', error);
    return { 
      success: false, 
      error: 'An error occurred while updating the plan' 
    };
  }
}

export async function updatePlanStatusAction(planId: string, status: PlanStatus) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can modify plan status' };
    }

    // Update plan status
    const success = await updatePlan(planId, { status });
    
    if (success) {
      // Log the activity
      await logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'plan_status_changed',
        targetType: 'system',
        targetId: planId,
        details: `Changed plan status to ${status}`,
      });

      revalidatePath('/admin/plans');
      return { 
        success: true, 
        message: `Plan status updated to ${status}` 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to update plan status' 
      };
    }
  } catch (error) {
    console.error('Error updating plan status:', error);
    return { 
      success: false, 
      error: 'An error occurred while updating plan status' 
    };
  }
}