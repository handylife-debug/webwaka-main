import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'
import bcrypt from 'bcrypt'

// User creation/update schema
const userSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(100).optional(),
  password: z.string().min(8).optional(), // Only for creation
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  profile_picture_url: z.string().url().optional(),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  metadata: z.record(z.any()).optional()
});

// User tenant assignment schema
const userTenantAssignmentSchema = z.object({
  user_id: z.string().uuid(),
  role_id: z.string().uuid(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
  custom_permissions: z.array(z.string()).optional(),
  restrictions: z.record(z.any()).optional(),
  notes: z.string().optional()
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'first_name', 'last_name', 'email', 'username', 'is_active', 
  'is_verified', 'created_at', 'last_login_at', 'login_count'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List users with filtering, search, and pagination
export const GET = withStaffPermissions('staff.view')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Sorting with security validation
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = (searchParams.get('sort_order') || 'DESC').toUpperCase();
    
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
    const verified = searchParams.get('verified');
    const role = searchParams.get('role') || '';
    const includeDetails = searchParams.get('include_details') === 'true';
    
    // Build WHERE clause for tenant users only
    let whereConditions = ['ut.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      whereConditions.push(`(
        u.first_name ILIKE $${paramCount} OR 
        u.last_name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR 
        u.username ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (active !== null && active !== undefined) {
      paramCount++;
      whereConditions.push(`u.is_active = $${paramCount}`);
      queryParams.push(active === 'true');
    }
    
    if (verified !== null && verified !== undefined) {
      paramCount++;
      whereConditions.push(`u.is_verified = $${paramCount}`);
      queryParams.push(verified === 'true');
    }
    
    if (role) {
      paramCount++;
      whereConditions.push(`r.role_name ILIKE $${paramCount}`);
      queryParams.push(`%${role}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with user-tenant relationship - SECURITY: Never expose u.* to prevent password hash leakage
    const baseSelect = includeDetails ? 
      `u.id, u.email, u.username, u.first_name, u.last_name, u.phone, u.is_active, u.is_verified,
       u.profile_picture_url, u.timezone, u.language, u.last_login_at, u.login_count, 
       u.created_at, u.updated_at, ut.status as tenant_status, ut.joined_at, ut.last_access_at, 
       ut.access_count, ut.custom_permissions, ut.restrictions, ut.notes as tenant_notes,
       r.role_name, r.role_description, r.role_level, r.permissions as role_permissions` :
      `u.id, u.email, u.username, u.first_name, u.last_name, u.is_active, u.is_verified,
       u.last_login_at, u.created_at, ut.status as tenant_status, ut.joined_at,
       r.role_name, r.role_level`;
    
    const query = `
      SELECT ${baseSelect}
      FROM user_tenants ut
      JOIN users u ON u.id = ut.user_id
      JOIN roles r ON r.id = ut.role_id
      ${whereClause}
      ORDER BY u.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM user_tenants ut
      JOIN users u ON u.id = ut.user_id
      JOIN roles r ON r.id = ut.role_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get user statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE u.is_active = true) as active_users,
        COUNT(*) FILTER (WHERE u.is_verified = true) as verified_users,
        COUNT(*) FILTER (WHERE ut.status = 'active') as active_memberships,
        COUNT(DISTINCT r.role_name) as unique_roles
      FROM user_tenants ut
      JOIN users u ON u.id = ut.user_id
      JOIN roles r ON r.id = ut.role_id
      WHERE ut.tenant_id = $1
    `;
    
    const statsResult = await execute_sql(statsQuery, [tenantId]);
    const stats = statsResult.rows[0];
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      statistics: {
        total_users: parseInt(stats.total_users || 0),
        active_users: parseInt(stats.active_users || 0),
        verified_users: parseInt(stats.verified_users || 0),
        active_memberships: parseInt(stats.active_memberships || 0),
        unique_roles: parseInt(stats.unique_roles || 0)
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
    console.error('Error fetching users:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create new user or assign existing user to tenant
export const POST = withStaffPermissions('staff.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a tenant assignment or user creation
    if (body.user_id && body.role_id) {
      return await assignUserToTenant(tenantId, body);
    } else {
      return await createUser(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error in user operation:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to process user operation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function createUser(tenantId: string, body: any) {
  const validatedData = userSchema.parse(body);
  
  // SECURITY: Hash password with bcrypt if provided
  let passwordHash = null;
  if (validatedData.password) {
    const saltRounds = 12; // High security salt rounds
    passwordHash = await bcrypt.hash(validatedData.password, saltRounds);
  }
  
  // SECURITY: Use transaction for atomicity
  return await withTransaction(async (client) => {
    // Check for duplicate email globally
    const duplicateCheck = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [validatedData.email]
    );
    
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Email already exists. Use assign endpoint to add existing user to tenant.'
      }, { status: 409 });
    }
    
    // Check for duplicate username if provided
    if (validatedData.username) {
      const usernameCheck = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [validatedData.username]
      );
      
      if (usernameCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Username already exists'
        }, { status: 409 });
      }
    }
    
    // Create user account
    const insertUserQuery = `
      INSERT INTO users (
        email, username, first_name, last_name, phone, is_active, is_verified,
        profile_picture_url, timezone, language, metadata, password_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, email, username, first_name, last_name, is_active, is_verified, created_at
    `;
    
    const userResult = await client.query(insertUserQuery, [
      validatedData.email,
      validatedData.username || null,
      validatedData.first_name,
      validatedData.last_name,
      validatedData.phone || null,
      validatedData.is_active !== false, // Default to true
      validatedData.is_verified || false,
      validatedData.profile_picture_url || null,
      validatedData.timezone || 'UTC',
      validatedData.language || 'en',
      validatedData.metadata ? JSON.stringify(validatedData.metadata) : '{}',
      passwordHash
    ]);
    
    const newUser = userResult.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: newUser
    }, { status: 201 });
  });
}

async function assignUserToTenant(tenantId: string, body: any) {
  const validatedData = userTenantAssignmentSchema.parse(body);
  
  // SECURITY: Use transaction for atomicity
  return await withTransaction(async (client) => {
  
    // Check if user exists
    const userExists = await client.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [validatedData.user_id]
    );
  
  if (userExists.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'User not found'
    }, { status: 404 });
  }
  
    // Check if role exists and belongs to tenant
    const roleExists = await client.query(
      'SELECT id, role_name FROM roles WHERE id = $1 AND tenant_id = $2',
      [validatedData.role_id, tenantId]
    );
    
    if (roleExists.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Role not found or does not belong to this tenant'
      }, { status: 404 });
    }
    
    // Check if user is already assigned to this tenant
    const existingAssignment = await client.query(
      'SELECT id FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [validatedData.user_id, tenantId]
    );
    
    if (existingAssignment.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'User is already assigned to this tenant'
      }, { status: 409 });
    }
    
    // Create user-tenant assignment
    const insertAssignmentQuery = `
      INSERT INTO user_tenants (
        user_id, tenant_id, role_id, status, custom_permissions, restrictions, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, status, joined_at
    `;
    
    const assignmentResult = await client.query(insertAssignmentQuery, [
      validatedData.user_id,
      tenantId,
      validatedData.role_id,
      validatedData.status || 'active',
      validatedData.custom_permissions ? JSON.stringify(validatedData.custom_permissions) : '[]',
      validatedData.restrictions ? JSON.stringify(validatedData.restrictions) : '{}',
      validatedData.notes || null
    ]);
    
    const assignment = assignmentResult.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'User assigned to tenant successfully',
      data: {
        user: userExists.rows[0],
        role: roleExists.rows[0],
        assignment
      }
    }, { status: 201 });
  });
}