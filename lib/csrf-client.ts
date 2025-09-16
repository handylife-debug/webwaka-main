// Client-side CSRF token management
'use client';

let cachedCSRFToken: string | null = null;

export async function getCSRFToken(): Promise<string> {
  if (cachedCSRFToken) {
    return cachedCSRFToken;
  }

  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      cachedCSRFToken = data.csrfToken;
      return cachedCSRFToken!;
    } else {
      throw new Error('Failed to get CSRF token');
    }
  } catch (error) {
    console.error('Error getting CSRF token:', error);
    throw error;
  }
}

export async function makeSecureAPICall(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const csrfToken = await getCSRFToken();
  
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    ...options.headers,
  };

  return fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });
}

// Clear cached token on logout or auth errors
export function clearCSRFToken(): void {
  cachedCSRFToken = null;
}