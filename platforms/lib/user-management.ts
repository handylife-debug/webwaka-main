import { redis } from '@/lib/redis';

export type AdminRole = 'SuperAdmin' | 'Admin' | 'SupportStaff' | 'FinanceAdmin' | 'ContentModerator';
export type UserStatus = 'Active' | 'Pending' | 'Suspended' | 'Inactive';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: UserStatus;
  createdAt: number;
  lastActive?: number;
  invitedBy: string;
  inviteToken?: string;
  inviteExpiresAt?: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  targetType?: 'user' | 'tenant' | 'system';
  targetId?: string;
  details: string;
  timestamp: number;
  ipAddress?: string;
}

// Role hierarchy for permission checks
export const roleHierarchy: Record<AdminRole, number> = {
  'SuperAdmin': 5,
  'Admin': 4,
  'FinanceAdmin': 3,
  'SupportStaff': 2,
  'ContentModerator': 1,
};

// Role descriptions for UI
export const roleDescriptions: Record<AdminRole, string> = {
  'SuperAdmin': 'Full system access and user management',
  'Admin': 'Platform administration and tenant management',
  'FinanceAdmin': 'Financial data and billing management',
  'SupportStaff': 'Customer support and issue resolution',
  'ContentModerator': 'Content review and moderation',
};

export function hasPermission(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export async function getAllAdminUsers(): Promise<AdminUser[]> {
  try {
    const keys = await redis.keys('admin_user:*');

    if (!keys.length) {
      return [];
    }

    const values = await redis.mget<AdminUser[]>(...keys);

    return keys.map((key, index) => {
      const userId = key.replace('admin_user:', '');
      const data = values[index];

      if (!data) {
        return null;
      }

      return {
        ...data,
        id: userId,
      };
    }).filter((user): user is AdminUser => user !== null);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return [];
  }
}

export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  try {
    const data = await redis.get<AdminUser>(`admin_user:${userId}`);
    return data ? { ...data, id: userId } : null;
  } catch (error) {
    console.error('Error fetching admin user:', error);
    return null;
  }
}

export async function createAdminUser(user: Omit<AdminUser, 'id' | 'createdAt'>): Promise<string> {
  try {
    const userId = generateUserId();
    const userData: AdminUser = {
      ...user,
      id: userId,
      createdAt: Date.now(),
    };

    await redis.set(`admin_user:${userId}`, userData);
    return userId;
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw new Error('Failed to create admin user');
  }
}

export async function updateAdminUser(userId: string, updates: Partial<AdminUser>): Promise<boolean> {
  try {
    const existing = await getAdminUser(userId);
    if (!existing) return false;

    const updated = {
      ...existing,
      ...updates,
      lastActive: Date.now(),
    };

    await redis.set(`admin_user:${userId}`, updated);
    return true;
  } catch (error) {
    console.error('Error updating admin user:', error);
    return false;
  }
}

export async function deleteAdminUser(userId: string): Promise<boolean> {
  try {
    const result = await redis.del(`admin_user:${userId}`);
    return result > 0;
  } catch (error) {
    console.error('Error deleting admin user:', error);
    return false;
  }
}

export async function logActivity(activity: Omit<ActivityLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    const activityId = generateActivityId();
    const activityData: ActivityLog = {
      ...activity,
      id: activityId,
      timestamp: Date.now(),
    };

    await redis.set(`activity:${activityId}`, activityData);
    
    // Also add to a list for easy retrieval by timestamp
    await redis.lpush('activity_log', activityId);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

export async function getActivityLog(limit: number = 50, offset: number = 0): Promise<ActivityLog[]> {
  try {
    // Get activity IDs from list (newest first)
    const activityIds = await redis.lrange('activity_log', offset, offset + limit - 1);
    
    if (!activityIds.length) {
      return [];
    }

    const activities = await redis.mget<ActivityLog[]>(...activityIds.map((id: string) => `activity:${id}`));
    
    return activities.filter(Boolean) as ActivityLog[];
  } catch (error) {
    console.error('Error fetching activity log:', error);
    return [];
  }
}

export async function generateInviteToken(email: string, role: AdminRole, invitedBy: string): Promise<string> {
  try {
    const token = generateSecureToken();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    const inviteData = {
      email,
      role,
      invitedBy,
      token,
      expiresAt,
      createdAt: Date.now(),
    };

    await redis.set(`invite:${token}`, inviteData, { ex: 7 * 24 * 60 * 60 }); // 7 days TTL
    
    return token;
  } catch (error) {
    console.error('Error generating invite token:', error);
    throw new Error('Failed to generate invite token');
  }
}

export async function validateInviteToken(token: string): Promise<{
  email: string;
  role: AdminRole;
  invitedBy: string;
} | null> {
  try {
    const inviteData = await redis.get<{
      email: string;
      role: AdminRole;
      invitedBy: string;
      expiresAt: number;
    }>(`invite:${token}`);

    if (!inviteData || inviteData.expiresAt < Date.now()) {
      return null;
    }

    return {
      email: inviteData.email,
      role: inviteData.role,
      invitedBy: inviteData.invitedBy,
    };
  } catch (error) {
    console.error('Error validating invite token:', error);
    return null;
  }
}

function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateActivityId(): string {
  return `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSecureToken(): string {
  return `invite_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
}