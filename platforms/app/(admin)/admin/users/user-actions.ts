'use server';

import { userDetailsCell } from '@/cells/admin/UserDetails/src/server';

export async function updateUserAction(
  userId: string,
  updates: any
) {
  try {
    const result = await userDetailsCell.updateUserProfile(userId, updates);
    return result;
  } catch (error) {
    console.error('Failed to update user:', error);
    return {
      success: false,
      message: 'Failed to update user'
    };
  }
}

export async function updateUserStatusExtendedAction(
  userId: string,
  status: string,
  updatedBy?: string,
  reason?: string
) {
  try {
    const result = await userDetailsCell.updateUserStatus(userId, status as any, updatedBy, reason);
    return result;
  } catch (error) {
    console.error('Failed to update user status:', error);
    return {
      success: false,
      message: 'Failed to update user status'
    };
  }
}