'use server';

import { getCurrentUser } from '@/lib/auth-server';
import { logActivity } from '@/lib/user-management';
import { getCredentialsStatus, validateCredentialFormat } from '@/lib/credentials-management';
import { revalidatePath } from 'next/cache';

export async function refreshCredentialsStatusAction() {
  try {
    // Get current user for authorization
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can access credentials' };
    }

    // Get fresh credentials status
    const status = getCredentialsStatus();

    // Log the activity
    await logActivity({
      userId: currentUser.id,
      userEmail: currentUser.email,
      action: 'credentials_status_checked',
      targetType: 'system',
      targetId: 'credentials',
      details: 'Checked credentials status',
    });

    revalidatePath('/admin/credentials');
    return { 
      success: true, 
      status,
      message: 'Credentials status refreshed successfully' 
    };
  } catch (error) {
    console.error('Error refreshing credentials status:', error);
    return { 
      success: false, 
      error: 'An error occurred while refreshing credentials status' 
    };
  }
}

export async function validateCredentialAction(key: string, value: string) {
  try {
    // Get current user for authorization
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user has SuperAdmin permissions
    if (currentUser.role !== 'SuperAdmin') {
      return { success: false, error: 'Only SuperAdmin can validate credentials' };
    }

    // Validate the credential format
    const validation = validateCredentialFormat(key, value);

    // Log the activity (without logging the actual value)
    await logActivity({
      userId: currentUser.id,
      userEmail: currentUser.email,
      action: 'credential_validated',
      targetType: 'system',
      targetId: key,
      details: `Validated credential format for ${key}: ${validation.valid ? 'valid' : 'invalid'}`,
    });

    return { 
      success: true, 
      validation,
      message: validation.valid ? 'Credential format is valid' : validation.error 
    };
  } catch (error) {
    console.error('Error validating credential:', error);
    return { 
      success: false, 
      error: 'An error occurred while validating the credential' 
    };
  }
}