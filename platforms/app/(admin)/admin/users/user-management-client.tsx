'use client';

import { useState } from 'react';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { UserInvitationForm } from '@/components/admin/user-invitation-form';
import { sendUserInvitationAction, updateUserStatusAction } from './actions';
import { AdminUser, AdminRole, UserStatus, ActivityLog } from '@/lib/user-management';

interface UserManagementClientProps {
  users: AdminUser[];
  activities: ActivityLog[];
}

export function UserManagementClient({ 
  users: initialUsers, 
  activities 
}: UserManagementClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleInviteUser = async (email: string, role: AdminRole) => {
    try {
      const result = await sendUserInvitationAction(email, role);
      
      if (result.success) {
        setNotification({
          type: 'success',
          message: `Invitation sent successfully to ${email}`
        });
        return { success: true };
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to send invitation'
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

  const handleStatusChange = async (userId: string, status: UserStatus) => {
    try {
      const result = await updateUserStatusAction(userId, status);
      
      if (result.success) {
        // Update local state optimistically
        setUsers(prev => 
          prev.map(user => 
            user.id === userId 
              ? { ...user, status }
              : user
          )
        );
        
        setNotification({
          type: 'success',
          message: result.message || 'User status updated successfully'
        });
      } else {
        setNotification({
          type: 'error',
          message: result.error || 'Failed to update user status'
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

  const handleViewDetails = (user: AdminUser) => {
    // In a real application, this would open a detailed user modal
    alert(`User Details:\n\nName: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}\nStatus: ${user.status}\nInvited By: ${user.invitedBy}\nCreated: ${new Date(user.createdAt).toLocaleDateString()}`);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Invitation Form */}
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">Administrative Users</h3>
            <p className="text-sm text-gray-600">
              Manage platform administrators and their access levels.
            </p>
          </div>
          <UserInvitationForm onInvite={handleInviteUser} />
        </div>

        {/* Users Table */}
        <AdminUsersTable 
          users={users}
          onStatusChange={handleStatusChange}
          onViewDetails={handleViewDetails}
        />
      </div>

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