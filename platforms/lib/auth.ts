// Simple authentication and authorization system for SuperAdmin
// In a real application, this would integrate with NextAuth.js or similar

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

export function getCurrentUser(): User | null {
  // Mock current user - in real app, get from session/cookies
  // For demo purposes, return SuperAdmin user
  if (typeof window !== 'undefined') {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      return JSON.parse(storedUser);
    }
  }
  
  // Default to SuperAdmin for development
  return mockUsers['superadmin@example.com'];
}

export function setCurrentUser(user: User | null): void {
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
  }
}

export function logout(): void {
  setCurrentUser(null);
}