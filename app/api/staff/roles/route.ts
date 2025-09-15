import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions, STANDARD_PERMISSIONS } from '../../../../lib/permission-middleware'
import { getCurrentUser } from '../../../../lib/auth-server'
import { z } from 'zod'

// Role creation/update schema
const roleSchema = z.object({
  role_name: z.string().min(1).max(100),
  role_description: z.string().optional(),
  role_level: z.number().int().min(1),
  is_system_role: z.boolean().optional(),
  is_active: z.boolean().optional(),
  permissions: z.array(z.string()).optional()
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'role_name', 'role_level', 'is_active', 'is_system_role', 'created_at', 'updated_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// STANDARD_PERMISSIONS imported from permission-middleware

// GET - List roles with filtering and pagination
export const GET = withStaffPermissions('staff.roles')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Sorting with security validation
    const sortBy = searchParams.get('sort_by') || 'role_level';
    const sortOrder = (searchParams.get('sort_order') || 'ASC').toUpperCase();
    
    if (!VALID_SORT_COLUMNS.includes(sortBy)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sort column'
      }, { status: 400 });
    }
    
    if (!VALID_SORT_ORDERS.includes(sortOrder)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sort order'
      }, { status: 400 });
    }
    
    // Filters
    const search = searchParams.get('search') || '';
    const active = searchParams.get('active');
    const systemRole = searchParams.get('system_role');
    const minLevel = searchParams.get('min_level');
    const maxLevel = searchParams.get('max_level');
    const includeUsers = searchParams.get('include_users') === 'true';
    const includePermissions = searchParams.get('include_permissions') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      whereConditions.push(`(role_name ILIKE $${paramCount} OR role_description ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }
    
    if (active !== null && active !== undefined) {
      paramCount++;
      whereConditions.push(`is_active = $${paramCount}`);
      queryParams.push(active === 'true');
    }
    
    if (systemRole !== null && systemRole !== undefined) {
      paramCount++;
      whereConditions.push(`is_system_role = $${paramCount}`);
      queryParams.push(systemRole === 'true');
    }
    
    if (minLevel) {
      paramCount++;
      whereConditions.push(`role_level >= $${paramCount}`);
      queryParams.push(parseInt(minLevel));
    }
    
    if (maxLevel) {
      paramCount++;
      whereConditions.push(`role_level <= $${paramCount}`);
      queryParams.push(parseInt(maxLevel));
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get roles with user counts
    const baseSelect = includePermissions ? 
      'r.*, COALESCE(user_counts.user_count, 0) as user_count' :
      'r.id, r.role_name, r.role_description, r.role_level, r.is_active, r.is_system_role, r.created_at, COALESCE(user_counts.user_count, 0) as user_count';
    
    const query = `
      SELECT ${baseSelect}
      FROM roles r
      LEFT JOIN (
        SELECT role_id, COUNT(*) as user_count
        FROM user_tenants
        WHERE tenant_id = $1
        GROUP BY role_id
      ) user_counts ON r.id = user_counts.role_id
      ${whereClause}
      ORDER BY r.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM roles ${whereClause}`;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get user details for each role if requested
    if (includeUsers) {
      for (const role of result.rows) {
        const usersQuery = `
          SELECT u.id, u.first_name, u.last_name, u.email, ut.status, ut.joined_at
          FROM user_tenants ut
          JOIN users u ON u.id = ut.user_id
          WHERE ut.tenant_id = $1 AND ut.role_id = $2
          ORDER BY u.first_name, u.last_name
        `;
        
        const usersResult = await execute_sql(usersQuery, [tenantId, role.id]);
        role.users = usersResult.rows;
      }
    }
    
    // Get role statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_roles,
        COUNT(*) FILTER (WHERE is_active = true) as active_roles,
        COUNT(*) FILTER (WHERE is_system_role = true) as system_roles,
        AVG(role_level) as avg_role_level,
        MAX(role_level) as max_role_level
      FROM roles
      WHERE tenant_id = $1
    `;
    
    const statsResult = await execute_sql(statsQuery, [tenantId]);
    const stats = statsResult.rows[0];
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      standard_permissions: includePermissions ? STANDARD_PERMISSIONS : undefined,
      statistics: {
        total_roles: parseInt(stats.total_roles || 0),
        active_roles: parseInt(stats.active_roles || 0),
        system_roles: parseInt(stats.system_roles || 0),
        avg_role_level: parseFloat(stats.avg_role_level || 0),
        max_role_level: parseInt(stats.max_role_level || 0)
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch roles',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create new role  
export const POST = withStaffPermissions('staff.roles')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const validatedData = roleSchema.parse(body);
    
    // Check for duplicate role name in tenant
    const duplicateCheck = await execute_sql(`
      SELECT id FROM roles 
      WHERE tenant_id = $1 AND role_name = $2
    `, [tenantId, validatedData.role_name]);
    
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Role name already exists in this tenant'
      }, { status: 409 });
    }
    
    // SECURITY: Prevent non-SuperAdmin users from creating system roles
    if (validatedData.is_system_role) {
      const user = await getCurrentUser();
      if (user?.role !== 'SuperAdmin') {
        return NextResponse.json({
          success: false,
          message: 'Only SuperAdmin can create system roles'
        }, { status: 403 });
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
    
    // Insert new role
    const insertQuery = `
      INSERT INTO roles (
        tenant_id, role_name, role_description, role_level, is_system_role, 
        is_active, permissions, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await execute_sql(insertQuery, [
      tenantId,
      validatedData.role_name,
      validatedData.role_description || null,
      validatedData.role_level,
      validatedData.is_system_role || false,
      validatedData.is_active !== false, // Default to true
      validatedData.permissions ? JSON.stringify(validatedData.permissions) : '[]',
      null // TODO: Get user ID from session
    ]);
    
    const newRole = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Role created successfully',
      data: newRole
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating role:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create role',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});