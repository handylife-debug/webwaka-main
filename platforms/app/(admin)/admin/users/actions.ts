'use server';

import { updateAdminUser, AdminRole, UserStatus, logActivity } from '@/lib/user-management';
import { sendUserInvitation } from '@/lib/user-invitations';
import { getCurrentUser } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export async function sendUserInvitationAction(email: string, role: AdminRole) {
  try {
    // Get current user for logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can invite new users' };
    }

    // Send invitation
    const result = await sendUserInvitation(
      email, 
      role, 
      currentUser.id, 
      currentUser.email
    );

    if (result.success) {
      revalidatePath('/admin/users');
      return { 
        success: true, 
        message: `Invitation sent successfully to ${email}` 
      };
    } else {
      return { 
        success: false, 
        error: result.error || 'Failed to send invitation' 
      };
    }
  } catch (error) {
    console.error('Error sending user invitation:', error);
    return { 
      success: false, 
      error: 'An error occurred while sending the invitation' 
    };
  }
}

export async function updateUserStatusAction(userId: string, status: UserStatus) {
  try {
    // Get current user for logging
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can modify user status' };
    }

    // Update user status
    const success = await updateAdminUser(userId, { status });
    
    if (success) {
      // Log the activity
      await logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'user_status_changed',
        targetType: 'user',
        targetId: userId,
        details: `Changed user status to ${status}`,
      });

      revalidatePath('/admin/users');
      return { 
        success: true, 
        message: `User status updated to ${status}` 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to update user status' 
      };
    }
  } catch (error) {
    console.error('Error updating user status:', error);
    return { 
      success: false, 
      error: 'An error occurred while updating user status' 
    };
  }
}