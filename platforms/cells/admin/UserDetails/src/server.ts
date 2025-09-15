import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { AdminUser, AdminRole, UserStatus } from '@/lib/types';

export interface UserActivity {
  id: string;
  userId: string;
  action: string;
  description: string;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export interface UserPermission {
  id: string;
  name: string;
  description: string;
  granted: boolean;
  category: string;
  role?: AdminRole;
}

export const userDetailsCell = {
  // Get comprehensive user details
  async getUserDetails(userId: string): Promise<{
    user: AdminUser | null;
    activities: UserActivity[];
    permissions: UserPermission[];
  }> {
    return await safeRedisOperation(
      async () => {
        // Get user data
        const userKey = `admin_user:${userId}`;
        const user = await redis.get<AdminUser>(userKey);
        
        if (!user) {
          return { user: null, activities: [], permissions: [] };
        }

        // Get user activities
        const activities = await this.getUserActivity(userId, 50);
        
        // Get user permissions based on role
        const permissions = await this.getUserPermissions(user.role);

        return {
          user,
          activities,
          permissions
        };
      },
      { user: null, activities: [], permissions: [] }
    );
  },

  // Update user profile
  async updateUserProfile(
    userId: string, 
    updates: Partial<AdminUser>,
    updatedBy?: string
  ): Promise<{ success: boolean; message: string }> {
    return await safeRedisOperation(
      async () => {
        const userKey = `admin_user:${userId}`;
        const existingUser = await redis.get<AdminUser>(userKey);
        
        if (!existingUser) {
          return { success: false, message: 'User not found' };
        }

        // Validate updates
        if (updates.email && updates.email !== existingUser.email) {
          // Check if email is already in use
          const existingEmailUser = await this.getUserByEmail(updates.email);
          if (existingEmailUser && existingEmailUser.id !== userId) {
            return { success: false, message: 'Email address is already in use' };
          }
        }

        const updatedUser: AdminUser = {
          ...existingUser,
          ...updates
        };

        await redis.set(userKey, updatedUser);

        // Log the activity
        await this.logUserActivity(userId, 'PROFILE_UPDATED', 'User profile updated', {
          updates: Object.keys(updates),
          updatedBy
        });

        return { success: true, message: 'User profile updated successfully' };
      },
      { success: false, message: 'Failed to update user profile' }
    );
  },

  // Get user activity log
  async getUserActivity(userId: string, limit: number = 50): Promise<UserActivity[]> {
    return await safeRedisOperation(
      async () => {
        const activityKey = `user_activity:${userId}`;
        const activityIds = await redis.lrange(activityKey, 0, limit - 1);
        
        const activities = await Promise.all(
          activityIds.map(async (activityId: string) => {
            return await redis.get<UserActivity>(`activity:${activityId}`);
          })
        );

        return activities.filter(Boolean) as UserActivity[];
      },
      []
    );
  },

  // Log user activity
  async logUserActivity(
    userId: string,
    action: string,
    description: string,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await safeRedisOperation(
      async () => {
        const activityId = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const activity: UserActivity = {
          id: activityId,
          userId,
          action,
          description,
          timestamp: Date.now(),
          ipAddress,
          userAgent,
          metadata
        };

        // Store activity data
        await redis.set(`activity:${activityId}`, activity);

        // Add to user activity list
        await redis.lpush(`user_activity:${userId}`, activityId);

        // Keep only last 1000 activities per user - note: ltrim not available in current redis interface
      },
      undefined
    );
  },

  // Get user permissions based on role
  async getUserPermissions(role: AdminRole): Promise<UserPermission[]> {
    const allPermissions: UserPermission[] = [
      {
        id: 'view_tenants',
        name: 'View Tenants',
        description: 'Access to view tenant list and details',
        granted: true,
        category: 'Tenants'
      },
      {
        id: 'manage_tenants',
        name: 'Manage Tenants',
        description: 'Create, update, and delete tenants',
        granted: role === 'SuperAdmin' || role === 'Admin',
        category: 'Tenants'
      },
      {
        id: 'delete_tenants',
        name: 'Delete Tenants',
        description: 'Permanently delete tenants',
        granted: role === 'SuperAdmin',
        category: 'Tenants'
      },
      {
        id: 'view_users',
        name: 'View Users',
        description: 'Access to view user list and details',
        granted: true,
        category: 'Users'
      },
      {
        id: 'manage_users',
        name: 'Manage Users',
        description: 'Create, update, and delete users',
        granted: role === 'SuperAdmin',
        category: 'Users'
      },
      {
        id: 'view_analytics',
        name: 'View Analytics',
        description: 'Access to analytics and reports',
        granted: true,
        category: 'Analytics'
      },
      {
        id: 'export_data',
        name: 'Export Data',
        description: 'Export system data and reports',
        granted: role === 'SuperAdmin' || role === 'Admin',
        category: 'Analytics'
      },
      {
        id: 'manage_plans',
        name: 'Manage Plans',
        description: 'Create and modify subscription plans',
        granted: role === 'SuperAdmin',
        category: 'Billing'
      },
      {
        id: 'view_credentials',
        name: 'View Credentials',
        description: 'Access to view API credentials status',
        granted: role === 'SuperAdmin',
        category: 'Security'
      },
      {
        id: 'manage_credentials',
        name: 'Manage Credentials',
        description: 'Update and manage API credentials',
        granted: role === 'SuperAdmin',
        category: 'Security'
      },
      {
        id: 'system_settings',
        name: 'System Settings',
        description: 'Access to system configuration',
        granted: role === 'SuperAdmin',
        category: 'System'
      }
    ];

    return allPermissions;
  },

  // Update user status
  async updateUserStatus(
    userId: string, 
    status: UserStatus,
    updatedBy?: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    return await safeRedisOperation(
      async () => {
        const userKey = `admin_user:${userId}`;
        const user = await redis.get<AdminUser>(userKey);
        
        if (!user) {
          return { success: false, message: 'User not found' };
        }

        const updatedUser: AdminUser = {
          ...user,
          status
        };

        await redis.set(userKey, updatedUser);

        // Log the activity
        await this.logUserActivity(
          userId, 
          'STATUS_CHANGED', 
          `User status changed to ${status}`,
          { 
            previousStatus: user.status,
            newStatus: status,
            updatedBy,
            reason
          }
        );

        return { 
          success: true, 
          message: `User status updated to ${status}` 
        };
      },
      { success: false, message: 'Failed to update user status' }
    );
  },

  // Get user by email
  async getUserByEmail(email: string): Promise<AdminUser | null> {
    return await safeRedisOperation(
      async () => {
        // This is simplified - in a real system, you'd have an email index
        const userKeys = await redis.keys('admin_user:*');
        
        for (const key of userKeys) {
          const user = await redis.get<AdminUser>(key);
          if (user && user.email === email) {
            return user;
          }
        }
        
        return null;
      },
      null
    );
  },

  // Reset user password
  async resetUserPassword(userId: string, resetBy?: string): Promise<{ success: boolean; message: string; tempPassword?: string }> {
    return await safeRedisOperation(
      async () => {
        const userKey = `admin_user:${userId}`;
        const user = await redis.get<AdminUser>(userKey);
        
        if (!user) {
          return { success: false, message: 'User not found' };
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        
        // In a real system, you'd hash the password and store it
        const updatedUser = {
          ...user,
          tempPassword: tempPassword, // This would be hashed
          mustChangePassword: true,
          updatedAt: Date.now(),
          updatedBy: resetBy || 'system'
        };

        await redis.set(userKey, updatedUser);

        // Log the activity
        await this.logUserActivity(
          userId,
          'PASSWORD_RESET',
          'Password was reset by administrator',
          { resetBy }
        );

        return {
          success: true,
          message: 'Password reset successfully',
          tempPassword
        };
      },
      { success: false, message: 'Failed to reset password' }
    );
  }
};