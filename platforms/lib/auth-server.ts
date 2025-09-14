import 'server-only';
import { cookies } from 'next/headers';
import type { User } from './auth';
import { getUserFromToken } from './auth';

const AUTH_COOKIE_NAME = 'auth_token';

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get(AUTH_COOKIE_NAME);
    
    if (!authToken?.value) {
      return null;
    }
    
    // Use the new token validation system
    const user = getUserFromToken(authToken.value);
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}