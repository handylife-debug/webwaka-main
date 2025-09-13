// Client-safe authentication and authorization utilities
// Server-side authentication is handled in auth-server.ts

export type UserRole = 'SuperAdmin' | 'Admin' | 'User';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// Mock user store - replace with your actual auth provider
const mockUsers: Record<string, User> = {
  'superadmin@example.com': {
    id: '1',
    email: 'superadmin@example.com',
    name: 'Super Admin',
    role: 'SuperAdmin',
  },
};

export async function validateUser(email: string, password: string): Promise<User | null> {
  // Mock validation - replace with real authentication
  if (email in mockUsers && password === 'admin123') {
    return mockUsers[email];
  }
  return null;
}

export function hasRequiredRole(user: User | null, requiredRole: UserRole): boolean {
  if (!user) return false;
  
  const roleHierarchy: Record<UserRole, number> = {
    'User': 1,
    'Admin': 2,
    'SuperAdmin': 3,
  };
  
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

// Client-side authentication check (for components that can't use async)
export function getCurrentUserSync(): User | null {
  if (typeof window === 'undefined') {
    // Server-side: always return null for security
    return null;
  }
  
  // Client-side: check localStorage as fallback
  try {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      return JSON.parse(storedUser);
    }
  } catch (error) {
    console.error('Error parsing stored user:', error);
  }
  
  return null;
}

export function setCurrentUser(user: User | null): void {
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
      // Set auth cookie for server-side authentication
      document.cookie = `auth_token=superadmin_token_123; path=/; max-age=86400; SameSite=Strict`;
    } else {
      localStorage.removeItem('currentUser');
      // Clear auth cookie
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }
}

export function logout(): void {
  setCurrentUser(null);
}