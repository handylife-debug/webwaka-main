import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from './auth-server';
import { hasRequiredRole, type UserRole } from './auth';

/**
 * Authentication middleware for API routes
 * Validates user authentication and role-based access control
 */
export async function withAuth(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>,
  options: {
    requiredRole?: UserRole
    allowUnauthenticated?: boolean
  } = {}
) {
  return async (request: NextRequest, context?: any) => {
    try {
      // Get current authenticated user
      const user = await getCurrentUser()
      
      // Check if authentication is required
      if (!options.allowUnauthenticated && !user) {
        console.warn(`Authentication required for ${request.method} ${request.url}`)
        return NextResponse.json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }, { status: 401 })
      }
      
      // Check role-based access control
      if (options.requiredRole && !hasRequiredRole(user, options.requiredRole)) {
        console.warn(`Access denied: User ${user?.id} (${user?.role}) lacks required role ${options.requiredRole} for ${request.method} ${request.url}`)
        return NextResponse.json({
          success: false,
          error: `Access denied. Required role: ${options.requiredRole}`,
          code: 'INSUFFICIENT_ROLE'
        }, { status: 403 })
      }
      
      // Add user to request context for handler
      if (user) {
        console.log(`✅ Authenticated request: User ${user.id} (${user.role}) accessing ${request.method} ${request.url}`)
        // Add user to headers for downstream handlers
        const headers = new Headers(request.headers)
        headers.set('x-user-id', user.id)
        headers.set('x-user-role', user.role)
        headers.set('x-user-email', user.email)
        
        const newRequest = new NextRequest(request.url, {
          method: request.method,
          headers,
          body: request.body
        })
        
        return handler(newRequest, { user, ...context })
      }
      
      return handler(request, context)
      
    } catch (error) {
      console.error('Authentication middleware error:', error)
      return NextResponse.json({
        success: false,
        error: 'Authentication service error',
        code: 'AUTH_ERROR'
      }, { status: 500 })
    }
  }
}

/**
 * Inventory access middleware - requires authentication for inventory operations
 */
export function withInventoryAccess(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(handler, {
    requiredRole: 'User' // Minimum role required for inventory access
  })
}

/**
 * Admin access middleware - requires Admin or SuperAdmin role
 */
export function withAdminAccess(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(handler, {
    requiredRole: 'Admin'
  })
}

/**
 * SuperAdmin access middleware - requires SuperAdmin role
 */
export function withSuperAdminAccess(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(handler, {
    requiredRole: 'SuperAdmin'
  })
}

/**
 * Partner access middleware - requires Partner role or higher
 */
export function withPartnerAccess(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(handler, {
    requiredRole: 'Partner'
  })
}

/**
 * Enhanced tenant access validation with user context
 * This replaces the basic validateTenantAccess for critical operations
 */
export async function validateTenantAccessWithRole(
  tenantId: string,
  requiredRole?: UserRole,
  request?: NextRequest
): Promise<{ hasAccess: boolean; user?: any; error?: string }> {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return {
        hasAccess: false,
        error: 'Authentication required'
      }
    }
    
    // Check role requirements
    if (requiredRole && !hasRequiredRole(user, requiredRole)) {
      return {
        hasAccess: false,
        user,
        error: `Insufficient role. Required: ${requiredRole}, User has: ${user.role}`
      }
    }
    
    // Import tenant validation (avoiding circular import)
    const { validateTenantAccess } = await import('./tenant-context')
    const tenantAccess = await validateTenantAccess(tenantId, request)
    
    if (!tenantAccess) {
      return {
        hasAccess: false,
        user,
        error: 'Tenant access denied'
      }
    }
    
    return {
      hasAccess: true,
      user
    }
    
  } catch (error) {
    console.error('Error validating tenant access with role:', error)
    return {
      hasAccess: false,
      error: 'Validation service error'
    }
  }
}

/**
 * Type-safe request handler with authentication context
 */
export type AuthenticatedRequestHandler = (
  request: NextRequest,
  context: { user: any }
) => Promise<NextResponse>

/**
 * Wrapper for authenticated API routes with automatic user context
 */
export function createAuthenticatedRoute(
  handler: AuthenticatedRequestHandler,
  options: {
    requiredRole?: UserRole
  } = {}
) {
  return withAuth(async (request: NextRequest, context: any) => {
    return handler(request, context)
  }, options)
}