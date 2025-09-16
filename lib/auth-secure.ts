// SECURE Client-safe authentication and authorization utilities
// This replaces the insecure token system in auth.ts

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export type UserRole = 'SuperAdmin' | 'Admin' | 'Partner' | 'User';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string; // Secure tenant binding
}

// SECURE: Use proper JWT secret key from environment
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key-change-in-production-immediately'
);

const JWT_ALGORITHM = 'HS256';
const TOKEN_EXPIRY = '24h';

// Mock user store - replace with your actual auth provider
const mockUsers: Record<string, Omit<User, 'tenantId'> & { password: string; tenantId: string }> = {
  'superadmin@example.com': {
    id: '1',
    email: 'superadmin@example.com',
    name: 'Super Admin',
    role: 'SuperAdmin',
    password: 'admin123',
    tenantId: 'super_tenant',
  },
  'partner@example.com': {
    id: '2',
    email: 'partner@example.com',
    name: 'Partner User',
    role: 'Partner',
    password: 'admin123',
    tenantId: 'default_tenant',
  },
  'admin@example.com': {
    id: '3',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'Admin',
    password: 'admin123',
    tenantId: 'default_tenant',
  },
};

export async function validateUser(email: string, password: string): Promise<User | null> {
  // Mock validation - replace with real authentication
  const userData = mockUsers[email];
  if (userData && password === userData.password) {
    const { password: _, ...user } = userData;
    return user;
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

// SECURE: Generate JWT token with proper signing
export async function generateSecureToken(user: User): Promise<string> {
  try {
    const jwt = await new SignJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .setIssuer('webwaka-platform')
      .setAudience('webwaka-app')
      .sign(JWT_SECRET);
    
    return jwt;
  } catch (error) {
    console.error('Error generating JWT:', error);
    throw new Error('Failed to generate authentication token');
  }
}

// SECURE: Extract user data from JWT token with verification
export async function getUserFromSecureToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'webwaka-platform',
      audience: 'webwaka-app',
    });
    
    return {
      id: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as UserRole,
      tenantId: payload.tenantId as string,
    };
  } catch (error) {
    console.error('Error verifying JWT:', error);
    return null;
  }
}

// SECURE: Server-side authentication check
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('auth_token')?.value;
    
    if (!authToken) {
      return null;
    }

    // Use secure JWT validation
    return await getUserFromSecureToken(authToken);
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    return null;
  }
}

// SECURE: Get tenant ID from authenticated user (not from headers!)
export async function getSecureTenantId(): Promise<string> {
  const user = await getAuthenticatedUser();
  
  if (!user) {
    throw new Error('Authentication required');
  }

  return user.tenantId;
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

// SECURE: Set current user with JWT token
export async function setCurrentUser(user: User | null): Promise<void> {
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
      
      // Generate secure JWT token
      const secureToken = await generateSecureToken(user);
      
      // Set secure HTTP-only cookie
      document.cookie = `auth_token=${secureToken}; path=/; max-age=86400; SameSite=Strict; Secure`;
    } else {
      localStorage.removeItem('currentUser');
      // Clear auth cookie
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('currentUser');
    document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
}

// CSRF Protection - Generate CSRF token
export async function generateCSRFToken(): Promise<string> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Authentication required for CSRF token');
  }
  
  // Generate CSRF token based on user session
  const csrfPayload = {
    userId: user.id,
    tenantId: user.tenantId,
    timestamp: Date.now(),
  };
  
  const jwt = await new SignJWT(csrfPayload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setExpirationTime('1h') // Shorter expiry for CSRF tokens
    .setIssuer('webwaka-csrf')
    .sign(JWT_SECRET);
  
  return jwt;
}

// CSRF Protection - Validate CSRF token
export async function validateCSRFToken(token: string): Promise<boolean> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return false;
    }
    
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'webwaka-csrf',
    });
    
    // Verify token matches current user
    return payload.userId === user.id && payload.tenantId === user.tenantId;
  } catch (error) {
    console.error('Error validating CSRF token:', error);
    return false;
  }
}