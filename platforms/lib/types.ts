// Client-safe types and constants that can be imported by client components
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