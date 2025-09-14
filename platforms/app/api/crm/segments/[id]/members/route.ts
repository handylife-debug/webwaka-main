import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../../lib/permission-middleware'
import { z } from 'zod'

// Schema for adding/removing segment members
const segmentMemberSchema = z.object({
  customer_ids: z.array(z.string().uuid()),
  action: z.enum(['add', 'remove']).optional()
});

// Schema for bulk member operations
const bulkMemberSchema = z.object({
  action: z.enum(['add_by_criteria', 'remove_all', 'remove_inactive']),
  criteria: z.object({
    // Purchase-based criteria for add_by_criteria
    min_total_purchases: z.number().min(0).optional(),
    max_total_purchases: z.number().min(0).optional(),
    min_order_count: z.number().min(0).optional(),
    customer_status: z.array(z.enum(['active', 'inactive', 'suspended', 'vip'])).optional(),
    customer_type: z.array(z.enum(['individual', 'business', 'wholesale', 'retail'])).optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});

// GET - List segment members with filtering
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const segmentId = params.id;
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Filters
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const type = searchParams.get('type') || '';
    const active = searchParams.get('active');
    
    // Check if segment exists
    const segmentExists = await execute_sql(`
      SELECT id FROM customer_segments WHERE tenant_id = $1 AND id = $2
    `, [tenantId, segmentId]);
    
    if (segmentExists.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Segment not found'
      }, { status: 404 });
    }
    
    // Build WHERE clause for member filtering
    let whereConditions = ['csm.tenant_id = $1', 'csm.segment_id = $2'];
    let queryParams: any[] = [tenantId, segmentId];
    let paramCount = 2;
    
    if (active !== null && active !== undefined) {
      paramCount++;
      whereConditions.push(`csm.is_active = $${paramCount}`);
      queryParams.push(active === 'true');
    } else {
      // Default to active members only
      whereConditions.push('csm.is_active = true');
    }
    
    if (search) {
      paramCount++;
      whereConditions.push(`(
        c.first_name ILIKE $${paramCount} OR 
        c.last_name ILIKE $${paramCount} OR 
        c.email ILIKE $${paramCount} OR 
        c.customer_code ILIKE $${paramCount} OR
        c.company_name ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`c.customer_status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (type) {
      paramCount++;
      whereConditions.push(`c.customer_type = $${paramCount}`);
      queryParams.push(type);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get segment members with customer details
    const query = `
      SELECT 
        c.id, c.customer_code, c.first_name, c.last_name, c.email,
        c.phone, c.mobile, c.company_name, c.customer_status, c.customer_type,
        c.total_purchases, c.total_orders, c.average_order_value, c.loyalty_points,
        c.first_purchase_date, c.last_purchase_date, c.preferred_contact_method,
        c.marketing_consent, c.tags,
        csm.added_date, csm.is_active as is_member_active,
        csm.id as membership_id
      FROM customer_segment_members csm
      JOIN customers c ON c.id = csm.customer_id
      WHERE ${whereClause}
      ORDER BY csm.added_date DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_segment_members csm
      JOIN customers c ON c.id = csm.customer_id
      WHERE ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get segment statistics
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE csm.is_active = true) as active_members,
        COUNT(*) as total_members,
        AVG(c.total_purchases) FILTER (WHERE csm.is_active = true) as avg_member_purchases,
        SUM(c.total_purchases) FILTER (WHERE csm.is_active = true) as total_member_purchases,
        AVG(c.loyalty_points) FILTER (WHERE csm.is_active = true) as avg_member_loyalty_points
      FROM customer_segment_members csm
      JOIN customers c ON c.id = csm.customer_id
      WHERE csm.tenant_id = $1 AND csm.segment_id = $2
    `;
    
    const statsResult = await execute_sql(statsQuery, [tenantId, segmentId]);
    const stats = statsResult.rows[0];
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      statistics: {
        active_members: parseInt(stats.active_members || 0),
        total_members: parseInt(stats.total_members || 0),
        avg_member_purchases: parseFloat(stats.avg_member_purchases || 0),
        total_member_purchases: parseFloat(stats.total_member_purchases || 0),
        avg_member_loyalty_points: parseFloat(stats.avg_member_loyalty_points || 0)
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
    console.error('Error fetching segment members:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch segment members',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Add or remove customers from segment
export const POST = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const segmentId = params.id;
    const body = await request.json();
    
    // Check if this is a bulk operation or individual member operation
    if (body.action && ['add_by_criteria', 'remove_all', 'remove_inactive'].includes(body.action)) {
      return await handleBulkMemberOperation(tenantId, segmentId, body);
    } else {
      return await handleIndividualMemberOperation(tenantId, segmentId, body);
    }
    
  } catch (error) {
    console.error('Error managing segment members:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to manage segment members',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleIndividualMemberOperation(tenantId: string, segmentId: string, body: any) {
  const validatedData = segmentMemberSchema.parse(body);
  const action = validatedData.action || 'add';
  
  // Check if segment exists
  const segmentExists = await execute_sql(`
    SELECT id, segment_type FROM customer_segments WHERE tenant_id = $1 AND id = $2
  `, [tenantId, segmentId]);
  
  if (segmentExists.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Segment not found'
    }, { status: 404 });
  }
  
  // Check if all customers exist and belong to this tenant
  const customerCheck = await execute_sql(`
    SELECT id FROM customers 
    WHERE tenant_id = $1 AND id = ANY($2)
  `, [tenantId, validatedData.customer_ids]);
  
  if (customerCheck.rows.length !== validatedData.customer_ids.length) {
    return NextResponse.json({
      success: false,
      message: 'One or more customers not found or do not belong to this tenant'
    }, { status: 400 });
  }
  
  let result;
  let affectedCount = 0;
  
  if (action === 'add') {
    // Add customers to segment
    const insertQuery = `
      INSERT INTO customer_segment_members (tenant_id, customer_id, segment_id, added_date, is_active)
      SELECT $1, unnest($3::uuid[]), $2, CURRENT_DATE, true
      ON CONFLICT (tenant_id, customer_id, segment_id) DO UPDATE SET
        is_active = true,
        added_date = CURRENT_DATE
      RETURNING id
    `;
    
    result = await execute_sql(insertQuery, [tenantId, segmentId, validatedData.customer_ids]);
    affectedCount = result.rows.length;
    
  } else if (action === 'remove') {
    // Remove customers from segment (soft delete)
    const updateQuery = `
      UPDATE customer_segment_members 
      SET is_active = false
      WHERE tenant_id = $1 AND segment_id = $2 AND customer_id = ANY($3)
      RETURNING id
    `;
    
    result = await execute_sql(updateQuery, [tenantId, segmentId, validatedData.customer_ids]);
    affectedCount = result.rows.length;
  }
  
  // Update segment customer count
  await updateSegmentCount(tenantId, segmentId);
  
  return NextResponse.json({
    success: true,
    message: `Successfully ${action === 'add' ? 'added' : 'removed'} ${affectedCount} customers ${action === 'add' ? 'to' : 'from'} segment`,
    data: {
      action,
      affected_customers: affectedCount,
      customer_ids: validatedData.customer_ids
    }
  });
}

async function handleBulkMemberOperation(tenantId: string, segmentId: string, body: any) {
  const validatedData = bulkMemberSchema.parse(body);
  
  // Check if segment exists
  const segmentExists = await execute_sql(`
    SELECT id, segment_type FROM customer_segments WHERE tenant_id = $1 AND id = $2
  `, [tenantId, segmentId]);
  
  if (segmentExists.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Segment not found'
    }, { status: 404 });
  }
  
  let result;
  let affectedCount = 0;
  
  switch (validatedData.action) {
    case 'add_by_criteria':
      if (!validatedData.criteria) {
        return NextResponse.json({
          success: false,
          message: 'Criteria required for add_by_criteria action'
        }, { status: 400 });
      }
      
      // Build dynamic WHERE clause based on criteria
      const conditions: string[] = ['c.tenant_id = $1', `c.customer_status = 'active'`];
      const params: any[] = [tenantId];
      let paramCount = 1;
      
      if (validatedData.criteria.min_total_purchases !== undefined) {
        paramCount++;
        conditions.push(`c.total_purchases >= $${paramCount}`);
        params.push(validatedData.criteria.min_total_purchases);
      }
      
      if (validatedData.criteria.max_total_purchases !== undefined) {
        paramCount++;
        conditions.push(`c.total_purchases <= $${paramCount}`);
        params.push(validatedData.criteria.max_total_purchases);
      }
      
      if (validatedData.criteria.min_order_count !== undefined) {
        paramCount++;
        conditions.push(`c.total_orders >= $${paramCount}`);
        params.push(validatedData.criteria.min_order_count);
      }
      
      if (validatedData.criteria.customer_status && validatedData.criteria.customer_status.length > 0) {
        paramCount++;
        conditions.push(`c.customer_status = ANY($${paramCount})`);
        params.push(validatedData.criteria.customer_status);
      }
      
      if (validatedData.criteria.customer_type && validatedData.criteria.customer_type.length > 0) {
        paramCount++;
        conditions.push(`c.customer_type = ANY($${paramCount})`);
        params.push(validatedData.criteria.customer_type);
      }
      
      if (validatedData.criteria.tags && validatedData.criteria.tags.length > 0) {
        paramCount++;
        conditions.push(`c.tags && $${paramCount}`);
        params.push(validatedData.criteria.tags);
      }
      
      const whereClause = conditions.join(' AND ');
      
      const addByCriteriaQuery = `
        INSERT INTO customer_segment_members (tenant_id, customer_id, segment_id, added_date, is_active)
        SELECT c.tenant_id, c.id, $2, CURRENT_DATE, true
        FROM customers c
        WHERE ${whereClause}
        ON CONFLICT (tenant_id, customer_id, segment_id) DO UPDATE SET
          is_active = true,
          added_date = CURRENT_DATE
        RETURNING id
      `;
      
      result = await execute_sql(addByCriteriaQuery, [segmentId, ...params]);
      affectedCount = result.rows.length;
      break;
      
    case 'remove_all':
      const removeAllQuery = `
        UPDATE customer_segment_members 
        SET is_active = false
        WHERE tenant_id = $1 AND segment_id = $2 AND is_active = true
        RETURNING id
      `;
      
      result = await execute_sql(removeAllQuery, [tenantId, segmentId]);
      affectedCount = result.rows.length;
      break;
      
    case 'remove_inactive':
      const removeInactiveQuery = `
        UPDATE customer_segment_members csm
        SET is_active = false
        FROM customers c
        WHERE csm.customer_id = c.id 
          AND csm.tenant_id = $1 
          AND csm.segment_id = $2 
          AND csm.is_active = true
          AND c.customer_status IN ('inactive', 'suspended')
        RETURNING csm.id
      `;
      
      result = await execute_sql(removeInactiveQuery, [tenantId, segmentId]);
      affectedCount = result.rows.length;
      break;
  }
  
  // Update segment customer count
  await updateSegmentCount(tenantId, segmentId);
  
  return NextResponse.json({
    success: true,
    message: `Bulk operation ${validatedData.action} completed successfully`,
    data: {
      action: validatedData.action,
      affected_customers: affectedCount
    }
  });
}

async function updateSegmentCount(tenantId: string, segmentId: string) {
  const countResult = await execute_sql(`
    SELECT COUNT(*) as count FROM customer_segment_members 
    WHERE tenant_id = $1 AND segment_id = $2 AND is_active = true
  `, [tenantId, segmentId]);
  
  await execute_sql(`
    UPDATE customer_segments 
    SET customer_count = $3, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = $1 AND id = $2
  `, [tenantId, segmentId, parseInt(countResult.rows[0].count)]);
}