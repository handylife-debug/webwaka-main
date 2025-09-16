import { type NextRequest, NextResponse } from 'next/server';
import { rootDomain } from '@/lib/utils';

function extractSubdomain(request: NextRequest): string | null {
  const url = request.url;
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];

  // Local development environment
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // Try to extract subdomain from the full URL
    const fullUrlMatch = url.match(/http:\/\/([^.]+)\.localhost/);
    if (fullUrlMatch && fullUrlMatch[1]) {
      return fullUrlMatch[1];
    }

    // Fallback to host header approach
    if (hostname.includes('.localhost')) {
      return hostname.split('.')[0];
    }

    return null;
  }

  // Production environment
  const rootDomainFormatted = rootDomain.split(':')[0];

  // Handle preview deployment URLs (tenant---branch-name.vercel.app)
  if (hostname.includes('---') && hostname.endsWith('.vercel.app')) {
    const parts = hostname.split('---');
    return parts.length > 0 ? parts[0] : null;
  }

  // Regular subdomain detection
  const isSubdomain =
    hostname !== rootDomainFormatted &&
    hostname !== `www.${rootDomainFormatted}` &&
    hostname.endsWith(`.${rootDomainFormatted}`);

  return isSubdomain ? hostname.replace(`.${rootDomainFormatted}`, '') : null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const subdomain = extractSubdomain(request);

  // CSRF Protection for mutating operations on API routes
  if (request.method !== 'GET' && request.method !== 'HEAD' && pathname.startsWith('/api/')) {
    const csrfToken = request.headers.get('x-csrf-token');
    
    if (!csrfToken) {
      return NextResponse.json(
        { success: false, message: 'CSRF token required' },
        { status: 403 }
      );
    }

    try {
      const { validateCSRFToken } = await import('@/lib/auth-secure');
      const isValidCSRF = await validateCSRFToken(csrfToken);
      
      if (!isValidCSRF) {
        return NextResponse.json(
          { success: false, message: 'Invalid CSRF token' },
          { status: 403 }
        );
      }
    } catch (error) {
      console.error('CSRF validation error:', error);
      return NextResponse.json(
        { success: false, message: 'CSRF validation failed' },
        { status: 403 }
      );
    }
  }

  if (subdomain) {
    // Block access to admin page from subdomains
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // For the root path on a subdomain, rewrite to the subdomain page
    if (pathname === '/') {
      return NextResponse.rewrite(new URL(`/s/${subdomain}`, request.url));
    }
  }

  // SuperAdmin route protection - check if trying to access admin routes
  if (pathname.startsWith('/admin') && !subdomain) {
    // Enhanced auth checking with secure authentication
    try {
      const { getAuthenticatedUser } = await import('@/lib/auth-secure');
      const user = await getAuthenticatedUser();
      
      if (!user || (user.role !== 'Admin' && user.role !== 'SuperAdmin')) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    } catch (error) {
      console.error('Auth check error in middleware:', error);
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Add CSRF token to response headers for authenticated users on API routes
  if (pathname.startsWith('/api/')) {
    try {
      const { getAuthenticatedUser, generateCSRFToken } = await import('@/lib/auth-secure');
      const user = await getAuthenticatedUser();
      if (user) {
        const csrfToken = await generateCSRFToken();
        const response = NextResponse.next();
        response.headers.set('X-CSRF-Token', csrfToken);
        return response;
      }
    } catch (error) {
      // Continue without CSRF token if there's an error
      console.error('Error generating CSRF token:', error);
    }
  }

  // On the root domain, allow normal access
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths including API routes for CSRF protection
     * Exclude Next.js internals and static files
     */
    '/((?!_next|[\\w-]+\\.\\w+).*)'
  ]
};
