// Client-safe authentication and authorization utilities
// Server-side authentication is handled in auth-server.ts

export type UserRole = 'SuperAdmin' | 'Admin' | 'Partner' | 'User';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenant_id: string; // Critical: Proper tenant isolation
}

// Mock user store - replace with your actual auth provider
const mockUsers: Record<string, User> = {
  'superadmin@example.com': {
    id: '1',
    email: 'superadmin@example.com',
    name: 'Super Admin',
    role: 'SuperAdmin',
    tenant_id: 'main-tenant-uuid', // SuperAdmin belongs to main tenant
  },
  'partner@example.com': {
    id: '2',
    email: 'partner@example.com',
    name: 'Partner User',
    role: 'Partner',
    tenant_id: 'main-tenant-uuid', // Default to main tenant for now
  },
  'admin@example.com': {
    id: '3',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'Admin',
    tenant_id: 'main-tenant-uuid', // Default to main tenant for now
  },
};

// Session store to track valid tokens - in production use Redis or database
const sessionStore: Record<string, { user: User; expires: number }> = {};

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
    'Partner': 2,
    'Admin': 3,
    'SuperAdmin': 4,
  };
  
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

// Generate a secure session token for the user
function generateSessionToken(user: User): string {
  // In production, use crypto.randomUUID() or JWT with proper signing
  // For now, create a pseudo-secure token based on user data
  const timestamp = Date.now();
  const userHash = btoa(`${user.id}:${user.email}:${user.role}:${timestamp}`);
  return `session_${userHash}_${timestamp}`;
}

// Extract user data from session token
export function getUserFromToken(token: string): User | null {
  try {
    // Check if token exists in session store and hasn't expired
    const session = sessionStore[token];
    if (session && session.expires > Date.now()) {
      return session.user;
    }
    
    // If not in store, try to decode (for backward compatibility during transition)
    if (token.startsWith('session_')) {
      const parts = token.split('_');
      if (parts.length >= 3) {
        const userHash = parts[1];
        const timestamp = parseInt(parts[2]);
        
        // Check if token is not expired (24 hours)
        if (Date.now() - timestamp < 86400000) {
          try {
            const decoded = atob(userHash);
            const [userId, email, role] = decoded.split(':');
            
            // Find user in mock store
            const user = Object.values(mockUsers).find(u => u.id === userId && u.email === email && u.role === role);
            if (user) {
              // Add to session store for future lookups
              sessionStore[token] = { user, expires: timestamp + 86400000 };
              return user;
            }
          } catch (decodeError) {
            console.error('Error decoding token:', decodeError);
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error validating token:', error);
    return null;
  }
}

// Store session for a user (called when setting current user)
export function storeUserSession(token: string, user: User): void {
  sessionStore[token] = {
    user,
    expires: Date.now() + 86400000 // 24 hours
  };
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
      // Generate unique session token for this user
      const sessionToken = generateSessionToken(user);
      // Store session server-side
      storeUserSession(sessionToken, user);
      document.cookie = `auth_token=${sessionToken}; path=/; max-age=86400; SameSite=Strict`;
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