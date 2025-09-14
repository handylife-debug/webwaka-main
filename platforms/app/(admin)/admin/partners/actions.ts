'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-logger';
import { 
  createPartnerLevel, 
  updatePartnerLevel, 
  deletePartnerLevel,
  updatePartnerLevelStatus,
  CreatePartnerLevelData,
  UpdatePartnerLevelData,
  PartnerLevelStatus,
  initializePartnerTables
} from '@/lib/partner-management';

export async function createPartnerLevelAction(levelData: CreatePartnerLevelData) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can create partner levels' };
    }

    // Initialize partner tables if needed
    await initializePartnerTables();

    // Validate partner level data server-side
    if (!levelData.level_name || levelData.level_name.trim().length === 0) {
      return { success: false, error: 'Level name is required' };
    }
    if (!levelData.level_code || levelData.level_code.trim().length === 0) {
      return { success: false, error: 'Level code is required' };
    }
    if (levelData.default_commission_rate < 0 || levelData.default_commission_rate > 1) {
      return { success: false, error: 'Commission rate must be between 0% and 100%' };
    }
    if (levelData.max_referral_depth < 1) {
      return { success: false, error: 'Maximum referral depth must be at least 1' };
    }
    if (levelData.level_order < 1) {
      return { success: false, error: 'Level order must be at least 1' };
    }

    // Create the partner level (ignore client-provided createdBy)
    const levelId = await createPartnerLevel({
      ...levelData,
      createdBy: currentUser.id, // Always use server-authenticated user
      level_name: levelData.level_name.trim(),
      level_code: levelData.level_code.trim().toUpperCase()
    });

    // Log the activity
    await logActivity({
      userId: currentUser.id,
      userEmail: currentUser.email,
      action: 'partner_level_created',
      targetType: 'system',
      targetId: levelId,
      details: `Created partner level: ${levelData.level_name} (${levelData.level_code}) - ${levelData.default_commission_rate * 100}% commission, ${levelData.max_referral_depth} levels deep`,
    });

    revalidatePath('/admin/partners');
    return { 
      success: true, 
      message: `Partner level "${levelData.level_name}" created successfully`,
      levelId 
    };
  } catch (error: any) {
    console.error('Error creating partner level:', error);
    return { 
      success: false, 
      error: error.message || 'An error occurred while creating the partner level' 
    };
  }
}

export async function updatePartnerLevelAction(levelId: string, updates: UpdatePartnerLevelData) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can update partner levels' };
    }

    // Validate updates
    if (updates.default_commission_rate !== undefined && 
        (updates.default_commission_rate < 0 || updates.default_commission_rate > 1)) {
      return { success: false, error: 'Commission rate must be between 0% and 100%' };
    }
    if (updates.max_referral_depth !== undefined && updates.max_referral_depth < 1) {
      return { success: false, error: 'Maximum referral depth must be at least 1' };
    }
    if (updates.level_order !== undefined && updates.level_order < 1) {
      return { success: false, error: 'Level order must be at least 1' };
    }

    // Update the partner level
    const success = await updatePartnerLevel(levelId, {
      ...updates,
      updatedBy: currentUser.id,
      level_name: updates.level_name?.trim(),
      level_code: updates.level_code?.trim().toUpperCase()
    });
    
    if (success) {
      // Log the activity
      await logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'partner_level_updated',
        targetType: 'system',
        targetId: levelId,
        details: `Updated partner level: ${updates.level_name || 'level'} - ${Object.keys(updates).join(', ')}`,
      });

      revalidatePath('/admin/partners');
      return { 
        success: true, 
        message: 'Partner level updated successfully' 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to update partner level' 
      };
    }
  } catch (error: any) {
    console.error('Error updating partner level:', error);
    return { 
      success: false, 
      error: error.message || 'An error occurred while updating the partner level' 
    };
  }
}

export async function updatePartnerLevelStatusAction(levelId: string, status: PartnerLevelStatus) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can modify partner level status' };
    }

    // Update partner level status
    const success = await updatePartnerLevelStatus(levelId, status);
    
    if (success) {
      // Log the activity
      await logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'partner_level_status_changed',
        targetType: 'system',
        targetId: levelId,
        details: `Changed partner level status to ${status}`,
      });

      revalidatePath('/admin/partners');
      return { 
        success: true, 
        message: `Partner level status updated to ${status}` 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to update partner level status' 
      };
    }
  } catch (error: any) {
    console.error('Error updating partner level status:', error);
    return { 
      success: false, 
      error: error.message || 'An error occurred while updating partner level status' 
    };
  }
}

export async function deletePartnerLevelAction(levelId: string) {
  try {
    // Get current user for authorization and logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can delete partner levels' };
    }

    // Delete the partner level
    const success = await deletePartnerLevel(levelId);
    
    if (success) {
      // Log the activity
      await logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'partner_level_deleted',
        targetType: 'system',
        targetId: levelId,
        details: 'Deleted partner level',
      });

      revalidatePath('/admin/partners');
      return { 
        success: true, 
        message: 'Partner level deleted successfully' 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to delete partner level' 
      };
    }
  } catch (error: any) {
    console.error('Error deleting partner level:', error);
    return { 
      success: false, 
      error: error.message || 'An error occurred while deleting the partner level' 
    };
  }
}