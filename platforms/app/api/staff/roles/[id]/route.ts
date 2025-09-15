import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions, validateSystemRoleOperation, isSystemRole } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Role update schema (all fields optional)
const roleUpdateSchema = z.object({
  role_name: z.string().min(1).max(100).optional(),
  role_description: z.string().optional(),
  role_level: z.number().int().min(1).optional(),
  is_system_role: z.boolean().optional(),
  is_active: z.boolean().optional(),
  permissions: z.array(z.string()).optional()
});

// Standard permission categories (same as in main roles route)
const STANDARD_PERMISSIONS = {
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
};

// GET - Get specific role details with users
export const GET = withStaffPermissions('staff.roles')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const roleId = params.id;
    const { searchParams } = new URL(request.url);
    const includeUsers = searchParams.get('include_users') === 'true';
    const includePermissionDetails = searchParams.get('include_permission_details') === 'true';
    
    // Get role details
    const roleQuery = `
      SELECT 
        r.*,
        COALESCE(user_counts.total_users, 0) as total_users,
        COALESCE(user_counts.active_users, 0) as active_users
      FROM roles r
      LEFT JOIN (
        SELECT 
          role_id,
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE status = 'active') as active_users
        FROM user_tenants
        WHERE tenant_id = $1
        GROUP BY role_id
      ) user_counts ON r.id = user_counts.role_id
      WHERE r.tenant_id = $1 AND r.id = $2
    `;
    
    const roleResult = await execute_sql(roleQuery, [tenantId, roleId]);
    
    if (roleResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Role not found'
      }, { status: 404 });
    }
    
    const role = roleResult.rows[0];
    
    // Get users assigned to this role if requested
    let users = null;
    if (includeUsers) {
      const usersQuery = `
        SELECT 
          u.id, u.first_name, u.last_name, u.email, u.is_active, u.last_login_at,
          ut.status as membership_status, ut.joined_at, ut.last_access_at,
          ut.custom_permissions, ut.restrictions
        FROM user_tenants ut
        JOIN users u ON u.id = ut.user_id
        WHERE ut.tenant_id = $1 AND ut.role_id = $2
        ORDER BY u.first_name, u.last_name
      `;
      
      const usersResult = await execute_sql(usersQuery, [tenantId, roleId]);
      users = usersResult.rows;
    }
    
    // Add permission details if requested
    let permissionDetails = null;
    if (includePermissionDetails && role.permissions) {
      const rolePermissions = JSON.parse(role.permissions || '[]');
      permissionDetails = {
        assigned_permissions: rolePermissions.map((perm: string) => ({
          key: perm,
          description: STANDARD_PERMISSIONS[perm as keyof typeof STANDARD_PERMISSIONS] || 'Custom permission'
        })),
        available_permissions: Object.entries(STANDARD_PERMISSIONS).map(([key, description]) => ({
          key,
          description,
          assigned: rolePermissions.includes(key)
        })),
        permission_summary: {
          total_available: Object.keys(STANDARD_PERMISSIONS).length,
          total_assigned: rolePermissions.length,
          coverage_percentage: Math.round((rolePermissions.length / Object.keys(STANDARD_PERMISSIONS).length) * 100)
        }
      };
    }
    
    return NextResponse.json({
      success: true,
      data: {
        role,
        users,
        permission_details: permissionDetails
      }
    });
    
  } catch (error) {
    console.error('Error fetching role details:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch role details',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update role details
export const PUT = withStaffPermissions('staff.roles')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const roleId = params.id;
    const body = await request.json();
    const validatedData = roleUpdateSchema.parse(body);
    
    // Check if role exists and belongs to tenant
    const existingRole = await execute_sql(`
      SELECT id, role_name, is_system_role FROM roles 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, roleId]);
    
    if (existingRole.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Role not found'
      }, { status: 404 });
    }
    
    const roleInfo = existingRole.rows[0];
    
    // SECURITY: Enhanced system role protection
    const systemRoleCheck = await validateSystemRoleOperation(roleId, tenantId, 'edit');
    if (!systemRoleCheck.allowed) {
      return NextResponse.json({
        success: false,
        message: systemRoleCheck.error || 'Cannot modify system roles'
      }, { status: 403 });
    }
    
    // Additional system role validations
    if (roleInfo.is_system_role) {
      // Prevent changing system role status
      if (validatedData.is_system_role === false) {
        return NextResponse.json({
          success: false,
          message: 'Cannot change system role status'
        }, { status: 403 });
      }
    }
    
    // Check for duplicate role name (excluding current role)
    if (validatedData.role_name) {
      const duplicateCheck = await execute_sql(`
        SELECT id FROM roles 
        WHERE tenant_id = $1 AND id != $2 AND role_name = $3
      `, [tenantId, roleId, validatedData.role_name]);
      
      if (duplicateCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Role name already exists'
        }, { status: 409 });
      }
    }
    
    // Validate permissions against standard permissions
    if (validatedData.permissions && validatedData.permissions.length > 0) {
      const invalidPermissions = validatedData.permissions.filter(
        perm => !Object.keys(STANDARD_PERMISSIONS).includes(perm)
      );
      
      if (invalidPermissions.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Invalid permissions detected',
          invalid_permissions: invalidPermissions,
          valid_permissions: Object.keys(STANDARD_PERMISSIONS)
        }, { status: 400 });
      }
    }
    
    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [tenantId, roleId];
    let paramCount = 2;
    
    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        if (key === 'permissions') {
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(JSON.stringify(value));
        } else {
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(value);
        }
      }
    });
    
    if (updateFields.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No fields to update'
      }, { status: 400 });
    }
    
    // Add updated_at field
    paramCount++;
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date().toISOString());
    
    const updateQuery = `
      UPDATE roles 
      SET ${updateFields.join(', ')}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
    
    const result = await execute_sql(updateQuery, updateValues);
    const updatedRole = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Role updated successfully',
      data: updatedRole
    });
    
  } catch (error) {
    console.error('Error updating role:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update role',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete role (with safety checks)
export const DELETE = withStaffPermissions('staff.roles')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const roleId = params.id;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    // SECURITY: Check if this is a system role - system roles cannot be deleted
    const systemRoleCheck = await validateSystemRoleOperation(roleId, tenantId, 'delete');
    if (!systemRoleCheck.allowed) {
      return NextResponse.json({
        success: false,
        message: systemRoleCheck.error || 'System roles cannot be deleted'
      }, { status: 403 });
    }
    
    // Check if role exists and belongs to tenant
    const existingRole = await execute_sql(`
      SELECT id, role_name, is_system_role FROM roles 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, roleId]);
    
    if (existingRole.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Role not found'
      }, { status: 404 });
    }
    
    const roleInfo = existingRole.rows[0];
    
    // Prevent deletion of system roles
    if (roleInfo.is_system_role) {
      return NextResponse.json({
        success: false,
        message: 'Cannot delete system roles'
      }, { status: 403 });
    }
    
    // Check if role has assigned users
    const assignedUsers = await execute_sql(`
      SELECT COUNT(*) as user_count FROM user_tenants 
      WHERE tenant_id = $1 AND role_id = $2
    `, [tenantId, roleId]);
    
    const userCount = parseInt(assignedUsers.rows[0].user_count);
    
    if (userCount > 0 && !force) {
      return NextResponse.json({
        success: false,
        message: `Cannot delete role with ${userCount} assigned users. Use force=true to reassign users to default role and delete.`,
        assigned_users: userCount
      }, { status: 409 });
    }
    
    // If forcing deletion with assigned users, reassign them to a default role
    if (userCount > 0 && force) {
      // Find a suitable default role (lowest level, non-system role)
      const defaultRole = await execute_sql(`
        SELECT id FROM roles 
        WHERE tenant_id = $1 AND is_system_role = false AND is_active = true AND id != $2
        ORDER BY role_level ASC 
        LIMIT 1
      `, [tenantId, roleId]);
      
      if (defaultRole.rows.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'Cannot delete role: no alternative role available for reassignment'
        }, { status: 409 });
      }
      
      // Reassign users to default role
      await execute_sql(`
        UPDATE user_tenants 
        SET role_id = $3, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND role_id = $2
      `, [tenantId, roleId, defaultRole.rows[0].id]);
    }
    
    // Delete the role
    const result = await execute_sql(`
      DELETE FROM roles 
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, role_name
    `, [tenantId, roleId]);
    
    return NextResponse.json({
      success: true,
      message: `Role deleted successfully${userCount > 0 ? ` (${userCount} users reassigned)` : ''}`,
      data: {
        deleted_role: result.rows[0],
        reassigned_users: userCount
      }
    });
    
  } catch (error) {
    console.error('Error deleting role:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete role',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});