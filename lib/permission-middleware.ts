import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from './auth-server';
import { hasRequiredRole, type UserRole } from './auth';
import { execute_sql } from './database';
import { getTenantContext } from './tenant-context';

// Standard permission definitions for the Staff Management system
export const STANDARD_PERMISSIONS = {
  // Customer Management
  'customers.view': 'View customer information',
  'customers.create': 'Create new customers',
  'customers.edit': 'Edit customer information',
  'customers.delete': 'Delete customers',
  'customers.communicate': 'Send emails/SMS to customers',
  
  // Sales & Transactions
  'sales.view': 'View sales transactions',
  'sales.create': 'Process sales transactions',
  'sales.edit': 'Edit sales transactions',
  'sales.void': 'Void sales transactions',
  'sales.refund': 'Process refunds',
  'sales.reports': 'View sales reports',
  
  // Inventory Management
  'inventory.view': 'View inventory',
  'inventory.create': 'Add new products',
  'inventory.edit': 'Edit product information',
  'inventory.delete': 'Delete products',
  'inventory.adjust': 'Adjust inventory levels',
  'inventory.reports': 'View inventory reports',
  
  // Staff Management
  'staff.view': 'View staff information',
  'staff.create': 'Create new staff accounts',
  'staff.edit': 'Edit staff information',
  'staff.delete': 'Delete staff accounts',
  'staff.roles': 'Manage roles and permissions',
  
  // Employee Management
  'employees.view': 'View employee information',
  'employees.create': 'Create new employees',
  'employees.edit': 'Edit employee information',
  'employees.delete': 'Delete employees',
  'employees.attendance': 'Manage attendance records',
  'employees.payroll': 'View payroll information',
  
  // System Administration
  'system.settings': 'Manage system settings',
  'system.backup': 'Create system backups',
  'system.users': 'Manage user accounts',
  'system.audit': 'View audit logs',
  'system.integrations': 'Manage integrations',
  
  // Reports & Analytics
  'reports.view': 'View all reports',
  'reports.export': 'Export reports',
  'reports.financial': 'View financial reports',
  'reports.custom': 'Create custom reports',
  
  // Partner Management
  'partners.view': 'View partner information',
  'partners.create': 'Create new partners',
  'partners.edit': 'Edit partner information',
  'partners.delete': 'Delete partners',
  'partners.commissions': 'Manage partner commissions'
} as const;

export type Permission = keyof typeof STANDARD_PERMISSIONS;

interface UserPermissions {
  rolePermissions: Permission[];
  customPermissions: Permission[];
  allPermissions: Permission[];
}

/**
 * Get user's effective permissions from role and custom permissions
 * SECURITY-CRITICAL: Always validates against actual database records
 */
export async function getUserPermissions(
  userId: string, 
  tenantId: string
): Promise<UserPermissions> {
  try {
    const query = `
      SELECT 
        r.permissions as role_permissions,
        ut.custom_permissions,
        ut.status as membership_status
      FROM user_tenants ut
      JOIN roles r ON r.id = ut.role_id
      WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND ut.status = 'active'
    `;
    
    const result = await execute_sql(query, [userId, tenantId]);
    
    if (result.rows.length === 0) {
      console.warn(`No active membership found for user ${userId} in tenant ${tenantId}`);
      return {
        rolePermissions: [],
        customPermissions: [],
        allPermissions: []
      };
    }
    
    const userTenant = result.rows[0];
    
    // Parse permissions from database
    const rolePermissions: Permission[] = userTenant.role_permissions 
      ? JSON.parse(userTenant.role_permissions) 
      : [];
    
    const customPermissions: Permission[] = userTenant.custom_permissions 
      ? JSON.parse(userTenant.custom_permissions) 
      : [];
    
    // Combine and deduplicate permissions
    const allPermissions = Array.from(
      new Set([...rolePermissions, ...customPermissions])
    ) as Permission[];
    
    return {
      rolePermissions,
      customPermissions,
      allPermissions
    };
    
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return {
      rolePermissions: [],
      customPermissions: [],
      allPermissions: []
    };
  }
}

/**
 * Check if user has required permission
 * SECURITY-CRITICAL: Validates permission against database
 */
export async function hasPermission(
  userId: string, 
  tenantId: string, 
  requiredPermission: Permission
): Promise<boolean> {
  try {
    // SuperAdmin bypass - but still check user exists
    const user = await getCurrentUser();
    if (user?.role === 'SuperAdmin') {
      console.log(`✅ SuperAdmin permission granted: ${requiredPermission}`);
      return true;
    }
    
    const userPermissions = await getUserPermissions(userId, tenantId);
    const hasPermission = userPermissions.allPermissions.includes(requiredPermission);
    
    if (hasPermission) {
      console.log(`✅ Permission granted: User ${userId} has ${requiredPermission} in tenant ${tenantId}`);
    } else {
      console.warn(`❌ Permission denied: User ${userId} lacks ${requiredPermission} in tenant ${tenantId}`);
      console.warn(`User permissions: ${JSON.stringify(userPermissions.allPermissions)}`);
    }
    
    return hasPermission;
    
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check if user has ANY of the required permissions (OR logic)
 */
export async function hasAnyPermission(
  userId: string, 
  tenantId: string, 
  requiredPermissions: Permission[]
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (user?.role === 'SuperAdmin') {
      return true;
    }
    
    const userPermissions = await getUserPermissions(userId, tenantId);
    const hasAny = requiredPermissions.some(perm => 
      userPermissions.allPermissions.includes(perm)
    );
    
    if (!hasAny) {
      console.warn(`❌ Permission denied: User ${userId} lacks any of ${JSON.stringify(requiredPermissions)} in tenant ${tenantId}`);
    }
    
    return hasAny;
    
  } catch (error) {
    console.error('Error checking any permission:', error);
    return false;
  }
}

/**
 * Check if user has ALL of the required permissions (AND logic)
 */
export async function hasAllPermissions(
  userId: string, 
  tenantId: string, 
  requiredPermissions: Permission[]
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (user?.role === 'SuperAdmin') {
      return true;
    }
    
    const userPermissions = await getUserPermissions(userId, tenantId);
    const hasAll = requiredPermissions.every(perm => 
      userPermissions.allPermissions.includes(perm)
    );
    
    if (!hasAll) {
      const missing = requiredPermissions.filter(perm => 
        !userPermissions.allPermissions.includes(perm)
      );
      console.warn(`❌ Permission denied: User ${userId} missing permissions ${JSON.stringify(missing)} in tenant ${tenantId}`);
    }
    
    return hasAll;
    
  } catch (error) {
    console.error('Error checking all permissions:', error);
    return false;
  }
}

/**
 * Permission-based authentication middleware
 * Validates that user has required permissions before allowing access
 */
export function withPermissions(
  requiredPermissions: Permission | Permission[],
  options: {
    requireAll?: boolean; // true = AND logic, false = OR logic (default)
    bypassRoles?: UserRole[]; // Roles that bypass permission checks
  } = {}
) {
  return function(
    handler: (request: NextRequest, context?: any) => Promise<NextResponse>
  ) {
    return async (request: NextRequest, context?: any) => {
      try {
        // Get authenticated user
        const user = await getCurrentUser();
        if (!user) {
          console.warn(`❌ Permission check failed: No authenticated user for ${request.method} ${request.url}`);
          return NextResponse.json({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }, { status: 401 });
        }
        
        // Get tenant context
        const { tenantId } = await getTenantContext(request);
        
        // Check bypass roles
        if (options.bypassRoles?.includes(user.role)) {
          console.log(`✅ Permission bypassed: User ${user.id} (${user.role}) has bypass role`);
          return handler(request, { user, tenantId, ...context });
        }
        
        // Normalize required permissions to array
        const permissions = Array.isArray(requiredPermissions) 
          ? requiredPermissions 
          : [requiredPermissions];
        
        // Check permissions based on logic type
        const hasAccess = options.requireAll
          ? await hasAllPermissions(user.id, tenantId, permissions)
          : await hasAnyPermission(user.id, tenantId, permissions);
        
        if (!hasAccess) {
          const permissionList = permissions.join(', ');
          const logic = options.requireAll ? 'ALL' : 'ANY';
          
          console.warn(`❌ Permission denied: User ${user.id} (${user.role}) lacks required permissions (${logic}: ${permissionList}) for ${request.method} ${request.url}`);
          
          return NextResponse.json({
            success: false,
            error: `Access denied. Required permissions (${logic}): ${permissionList}`,
            code: 'INSUFFICIENT_PERMISSIONS',
            details: {
              requiredPermissions: permissions,
              requireAll: options.requireAll || false
            }
          }, { status: 403 });
        }
        
        console.log(`✅ Permission check passed: User ${user.id} accessing ${request.method} ${request.url}`);
        
        // Add permission context for handler
        return handler(request, { 
          user, 
          tenantId,
          permissions: await getUserPermissions(user.id, tenantId),
          ...context 
        });
        
      } catch (error) {
        console.error('Permission middleware error:', error);
        return NextResponse.json({
          success: false,
          error: 'Permission service error',
          code: 'PERMISSION_ERROR'
        }, { status: 500 });
      }
    };
  };
}

/**
 * Enhanced tenant access validation with permission checks
 * SECURITY-CRITICAL: Validates both tenant access and permissions
 */
export async function validateTenantAccessWithPermissions(
  tenantId: string,
  requiredPermissions: Permission | Permission[],
  options: {
    requireAll?: boolean;
    bypassRoles?: UserRole[];
  } = {},
  request?: NextRequest
): Promise<{ 
  hasAccess: boolean; 
  user?: any; 
  error?: string;
  permissions?: UserPermissions;
}> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return {
        hasAccess: false,
        error: 'Authentication required'
      };
    }
    
    // Check bypass roles
    if (options.bypassRoles?.includes(user.role)) {
      return {
        hasAccess: true,
        user,
        permissions: await getUserPermissions(user.id, tenantId)
      };
    }
    
    // Check tenant access first
    const { validateTenantAccess } = await import('./tenant-context');
    const tenantAccess = await validateTenantAccess(tenantId, request);
    
    if (!tenantAccess) {
      return {
        hasAccess: false,
        user,
        error: 'Tenant access denied'
      };
    }
    
    // Check permissions
    const permissions = Array.isArray(requiredPermissions) 
      ? requiredPermissions 
      : [requiredPermissions];
    
    const hasPermissionAccess = options.requireAll
      ? await hasAllPermissions(user.id, tenantId, permissions)
      : await hasAnyPermission(user.id, tenantId, permissions);
    
    if (!hasPermissionAccess) {
      const logic = options.requireAll ? 'ALL' : 'ANY';
      return {
        hasAccess: false,
        user,
        error: `Insufficient permissions. Required (${logic}): ${permissions.join(', ')}`
      };
    }
    
    return {
      hasAccess: true,
      user,
      permissions: await getUserPermissions(user.id, tenantId)
    };
    
  } catch (error) {
    console.error('Error validating tenant access with permissions:', error);
    return {
      hasAccess: false,
      error: 'Validation service error'
    };
  }
}

/**
 * Convenience middleware for staff management operations
 */
export const withStaffPermissions = (permissions: Permission | Permission[], options = {}) =>
  withPermissions(permissions, { bypassRoles: ['SuperAdmin'], ...options });

/**
 * Validate if a role is a system role that should be protected
 */
export async function isSystemRole(roleId: string, tenantId: string): Promise<boolean> {
  try {
    const result = await execute_sql(
      'SELECT is_system_role FROM roles WHERE id = $1 AND tenant_id = $2',
      [roleId, tenantId]
    );
    
    return result.rows.length > 0 && result.rows[0].is_system_role === true;
  } catch (error) {
    console.error('Error checking if role is system role:', error);
    return false;
  }
}

/**
 * Check if operation is allowed on system roles
 */
export async function validateSystemRoleOperation(
  roleId: string,
  tenantId: string,
  operation: 'edit' | 'delete'
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const isSystem = await isSystemRole(roleId, tenantId);
    
    if (isSystem) {
      const user = await getCurrentUser();
      
      // Only SuperAdmin can edit system roles, no one can delete them
      if (operation === 'delete') {
        return {
          allowed: false,
          error: 'System roles cannot be deleted'
        };
      }
      
      if (operation === 'edit' && user?.role !== 'SuperAdmin') {
        return {
          allowed: false,
          error: 'Only SuperAdmin can modify system roles'
        };
      }
    }
    
    return { allowed: true };
    
  } catch (error) {
    console.error('Error validating system role operation:', error);
    return {
      allowed: false,
      error: 'System role validation error'
    };
  }
}