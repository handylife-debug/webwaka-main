import 'server-only';
import { cookies } from 'next/headers';
import type { User } from './auth';

const AUTH_COOKIE_NAME = 'admin-auth';

// Mock user store - replace with your actual auth provider
const mockUsers: Record<string, User> = {
  'superadmin@example.com': {
    id: '1',
    email: 'superadmin@example.com',
    name: 'Super Admin',
    role: 'SuperAdmin',
  },
};

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('auth_token');
    
    if (!authToken?.value) {
      return null;
    }
    
    // In a real app, verify JWT token here
    // For demo, check if it matches our expected token
    if (authToken.value === 'superadmin_token_123') {
      return mockUsers['superadmin@example.com'];
    }
    
    return null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}