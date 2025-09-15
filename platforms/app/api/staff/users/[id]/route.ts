import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'
import bcrypt from 'bcrypt'

// User update schema (all fields optional)
const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(100).optional(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  profile_picture_url: z.string().url().optional(),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  metadata: z.record(z.any()).optional()
});

// User-tenant relationship update schema
const userTenantUpdateSchema = z.object({
  role_id: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
  custom_permissions: z.array(z.string()).optional(),
  restrictions: z.record(z.any()).optional(),
  notes: z.string().optional()
});

// GET - Get specific user details with tenant relationship
export const GET = withStaffPermissions('staff.view')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const userId = params.id;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('include_history') === 'true';
    const includeEmployee = searchParams.get('include_employee') === 'true';
    
    // Get user details with tenant relationship
    const userQuery = `
      SELECT 
        u.*,
        ut.status as tenant_status, ut.joined_at, ut.last_access_at, ut.access_count,
        ut.custom_permissions, ut.restrictions, ut.notes as tenant_notes,
        ut.invitation_token, ut.invitation_expires_at, ut.invited_by,
        r.id as role_id, r.role_name, r.role_description, r.role_level, 
        r.permissions as role_permissions, r.is_system_role
      FROM user_tenants ut
      JOIN users u ON u.id = ut.user_id
      JOIN roles r ON r.id = ut.role_id
      WHERE ut.tenant_id = $1 AND ut.user_id = $2
    `;
    
    const userResult = await execute_sql(userQuery, [tenantId, userId]);
    
    if (userResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'User not found or not assigned to this tenant'
      }, { status: 404 });
    }
    
    const user = userResult.rows[0];
    
    // Remove sensitive data from response
    delete user.password_hash;
    delete user.password_reset_token;
    delete user.verification_token;
    
    let loginHistory = null;
    let employee = null;
    
    // Get login history if requested
    if (includeHistory) {
      // In a real implementation, you'd have a login_history table
      // For now, we'll just include the basic login info
      loginHistory = {
        last_login_at: user.last_login_at,
        login_count: user.login_count,
        failed_login_attempts: user.failed_login_attempts,
        locked_until: user.locked_until
      };
    }
    
    // Get employee details if requested and linked
    if (includeEmployee) {
      const employeeQuery = `
        SELECT 
          id, employee_code, department, position_title, hire_date, 
          employment_status, employee_type, base_salary, hourly_rate,
          work_schedule, work_hours_per_week
        FROM employees 
        WHERE tenant_id = $1 AND user_id = $2 AND employment_status != 'terminated'
      `;
      
      const employeeResult = await execute_sql(employeeQuery, [tenantId, userId]);
      employee = employeeResult.rows[0] || null;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        user,
        login_history: loginHistory,
        employee
      }
    });
    
  } catch (error) {
    console.error('Error fetching user details:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch user details',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update user information or tenant relationship
export const PUT = withStaffPermissions('staff.edit')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const userId = params.id;
    const body = await request.json();
    
    // Check if user exists and is assigned to tenant
    const existingUser = await execute_sql(`
      SELECT ut.id as ut_id, u.id as user_id, u.email, u.username
      FROM user_tenants ut
      JOIN users u ON u.id = ut.user_id
      WHERE ut.tenant_id = $1 AND ut.user_id = $2
    `, [tenantId, userId]);
    
    if (existingUser.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'User not found or not assigned to this tenant'
      }, { status: 404 });
    }
    
    // Determine update type based on body content
    const isUserUpdate = Object.keys(body).some(key => 
      ['email', 'username', 'first_name', 'last_name', 'phone', 'is_active', 
       'is_verified', 'profile_picture_url', 'timezone', 'language', 'metadata'].includes(key)
    );
    
    const isTenantUpdate = Object.keys(body).some(key => 
      ['role_id', 'status', 'custom_permissions', 'restrictions', 'notes'].includes(key)
    );
    
    let updatedUser = null;
    let updatedRelationship = null;
    
    // Update user information
    if (isUserUpdate) {
      const validatedUserData = userUpdateSchema.parse(body);
      
      // Check for duplicate email (excluding current user)
      if (validatedUserData.email) {
        const duplicateCheck = await execute_sql(`
          SELECT id FROM users WHERE email = $1 AND id != $2
        `, [validatedUserData.email, userId]);
        
        if (duplicateCheck.rows.length > 0) {
          return NextResponse.json({
            success: false,
            message: 'Email already exists'
          }, { status: 409 });
        }
      }
      
      // Check for duplicate username (excluding current user)
      if (validatedUserData.username) {
        const usernameCheck = await execute_sql(`
          SELECT id FROM users WHERE username = $1 AND id != $2
        `, [validatedUserData.username, userId]);
        
        if (usernameCheck.rows.length > 0) {
          return NextResponse.json({
            success: false,
            message: 'Username already exists'
          }, { status: 409 });
        }
      }
      
      // Build dynamic update query for users table
      const userUpdateFields: string[] = [];
      const userUpdateValues: any[] = [userId];
      let userParamCount = 1;
      
      Object.entries(validatedUserData).forEach(([key, value]) => {
        if (value !== undefined) {
          userParamCount++;
          if (key === 'metadata') {
            userUpdateFields.push(`${key} = $${userParamCount}`);
            userUpdateValues.push(JSON.stringify(value));
          } else {
            userUpdateFields.push(`${key} = $${userParamCount}`);
            userUpdateValues.push(value);
          }
        }
      });
      
      if (userUpdateFields.length > 0) {
        // Add updated_at field
        userParamCount++;
        userUpdateFields.push(`updated_at = $${userParamCount}`);
        userUpdateValues.push(new Date().toISOString());
        
        const userUpdateQuery = `
          UPDATE users 
          SET ${userUpdateFields.join(', ')}
          WHERE id = $1
          RETURNING id, email, username, first_name, last_name, is_active, is_verified, updated_at
        `;
        
        const userResult = await execute_sql(userUpdateQuery, userUpdateValues);
        updatedUser = userResult.rows[0];
      }
    }
    
    // Update tenant relationship
    if (isTenantUpdate) {
      const validatedTenantData = userTenantUpdateSchema.parse(body);
      
      // Check if new role exists and belongs to tenant
      if (validatedTenantData.role_id) {
        const roleExists = await execute_sql(`
          SELECT id, role_name FROM roles WHERE id = $1 AND tenant_id = $2
        `, [validatedTenantData.role_id, tenantId]);
        
        if (roleExists.rows.length === 0) {
          return NextResponse.json({
            success: false,
            message: 'Role not found or does not belong to this tenant'
          }, { status: 404 });
        }
      }
      
      // Build dynamic update query for user_tenants table
      const tenantUpdateFields: string[] = [];
      const tenantUpdateValues: any[] = [tenantId, userId];
      let tenantParamCount = 2;
      
      Object.entries(validatedTenantData).forEach(([key, value]) => {
        if (value !== undefined) {
          tenantParamCount++;
          if (key === 'custom_permissions') {
            tenantUpdateFields.push(`${key} = $${tenantParamCount}`);
            tenantUpdateValues.push(JSON.stringify(value));
          } else if (key === 'restrictions') {
            tenantUpdateFields.push(`${key} = $${tenantParamCount}`);
            tenantUpdateValues.push(JSON.stringify(value));
          } else {
            tenantUpdateFields.push(`${key} = $${tenantParamCount}`);
            tenantUpdateValues.push(value);
          }
        }
      });
      
      if (tenantUpdateFields.length > 0) {
        // Add updated_at field
        tenantParamCount++;
        tenantUpdateFields.push(`updated_at = $${tenantParamCount}`);
        tenantUpdateValues.push(new Date().toISOString());
        
        const tenantUpdateQuery = `
          UPDATE user_tenants 
          SET ${tenantUpdateFields.join(', ')}
          WHERE tenant_id = $1 AND user_id = $2
          RETURNING id, status, custom_permissions, restrictions, notes, updated_at
        `;
        
        const tenantResult = await execute_sql(tenantUpdateQuery, tenantUpdateValues);
        updatedRelationship = tenantResult.rows[0];
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: updatedUser,
        tenant_relationship: updatedRelationship
      }
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update user',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Remove user from tenant (soft delete of relationship)
export const DELETE = withStaffPermissions('staff.delete')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const userId = params.id;
    const { searchParams } = new URL(request.url);
    const permanentDelete = searchParams.get('permanent') === 'true';
    
    // Check if user exists and is assigned to tenant
    const existingUser = await execute_sql(`
      SELECT ut.id as ut_id, u.first_name, u.last_name, u.email, r.role_name
      FROM user_tenants ut
      JOIN users u ON u.id = ut.user_id
      JOIN roles r ON r.id = ut.role_id
      WHERE ut.tenant_id = $1 AND ut.user_id = $2
    `, [tenantId, userId]);
    
    if (existingUser.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'User not found or not assigned to this tenant'
      }, { status: 404 });
    }
    
    const userInfo = existingUser.rows[0];
    
    if (permanentDelete) {
      // Permanently delete user-tenant relationship
      await execute_sql(`
        DELETE FROM user_tenants 
        WHERE tenant_id = $1 AND user_id = $2
      `, [tenantId, userId]);
      
      return NextResponse.json({
        success: true,
        message: 'User permanently removed from tenant',
        data: userInfo
      });
      
    } else {
      // Soft delete - mark as inactive
      const result = await execute_sql(`
        UPDATE user_tenants 
        SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND user_id = $2
        RETURNING id, status, updated_at
      `, [tenantId, userId]);
      
      return NextResponse.json({
        success: true,
        message: 'User deactivated from tenant',
        data: {
          user_info: userInfo,
          updated_relationship: result.rows[0]
        }
      });
    }
    
  } catch (error) {
    console.error('Error removing user:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to remove user',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});