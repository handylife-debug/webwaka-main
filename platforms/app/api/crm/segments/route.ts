import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

// Customer segment validation schema
const segmentSchema = z.object({
  segment_name: z.string().min(1).max(100),
  segment_description: z.string().optional(),
  segment_type: z.enum(['automatic', 'manual', 'custom']).optional(),
  criteria: z.object({
    // Purchase-based criteria
    min_total_purchases: z.number().min(0).optional(),
    max_total_purchases: z.number().min(0).optional(),
    min_order_count: z.number().min(0).optional(),
    max_order_count: z.number().min(0).optional(),
    min_average_order_value: z.number().min(0).optional(),
    max_average_order_value: z.number().min(0).optional(),
    min_loyalty_points: z.number().min(0).optional(),
    max_loyalty_points: z.number().min(0).optional(),
    
    // Status-based criteria
    customer_status: z.array(z.enum(['active', 'inactive', 'suspended', 'vip'])).optional(),
    customer_type: z.array(z.enum(['individual', 'business', 'wholesale', 'retail'])).optional(),
    preferred_contact_method: z.array(z.enum(['email', 'sms', 'phone', 'mail'])).optional(),
    marketing_consent: z.boolean().optional(),
    
    // Date-based criteria
    first_purchase_before: z.string().optional(), // ISO date
    first_purchase_after: z.string().optional(),
    last_purchase_before: z.string().optional(),
    last_purchase_after: z.string().optional(),
    created_before: z.string().optional(),
    created_after: z.string().optional(),
    
    // Location-based criteria
    billing_states: z.array(z.string()).optional(),
    billing_countries: z.array(z.string()).optional(),
    shipping_states: z.array(z.string()).optional(),
    shipping_countries: z.array(z.string()).optional(),
    
    // Business criteria
    has_company: z.boolean().optional(),
    has_tax_id: z.boolean().optional(),
    
    // Tag-based criteria
    has_tags: z.array(z.string()).optional(),
    exclude_tags: z.array(z.string()).optional()
  }).optional(),
  is_active: z.boolean().optional()
});

// GET - List customer segments with customer counts
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Filters
    const type = searchParams.get('type') || '';
    const active = searchParams.get('active');
    const search = searchParams.get('search') || '';
    
    // Build WHERE clause
    let whereConditions = ['tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (type) {
      paramCount++;
      whereConditions.push(`segment_type = $${paramCount}`);
      queryParams.push(type);
    }
    
    if (active !== null && active !== undefined) {
      paramCount++;
      whereConditions.push(`is_active = $${paramCount}`);
      queryParams.push(active === 'true');
    }
    
    if (search) {
      paramCount++;
      whereConditions.push(`(segment_name ILIKE $${paramCount} OR segment_description ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get segments with member counts
    const query = `
      SELECT 
        s.*,
        COALESCE(member_counts.active_members, 0) as active_members,
        COALESCE(member_counts.total_members, 0) as total_members
      FROM customer_segments s
      LEFT JOIN (
        SELECT 
          segment_id,
          COUNT(*) FILTER (WHERE is_active = true) as active_members,
          COUNT(*) as total_members
        FROM customer_segment_members
        WHERE tenant_id = $1
        GROUP BY segment_id
      ) member_counts ON s.id = member_counts.segment_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM customer_segments ${whereClause}`;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset params
    const total = parseInt(countResult.rows[0].total);
    
    return NextResponse.json({
      success: true,
      data: result.rows,
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
    console.error('Error fetching customer segments:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customer segments',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Create new customer segment
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const validatedData = segmentSchema.parse(body);
    
    // Check for duplicate segment name
    const duplicateCheck = await execute_sql(`
      SELECT id FROM customer_segments 
      WHERE tenant_id = $1 AND segment_name = $2
    `, [tenantId, validatedData.segment_name]);
    
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Segment name already exists'
      }, { status: 409 });
    }
    
    // Insert new segment
    const insertQuery = `
      INSERT INTO customer_segments (
        tenant_id, segment_name, segment_description, segment_type,
        criteria, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await execute_sql(insertQuery, [
      tenantId,
      validatedData.segment_name,
      validatedData.segment_description || null,
      validatedData.segment_type || 'custom',
      validatedData.criteria ? JSON.stringify(validatedData.criteria) : '{}',
      validatedData.is_active !== false, // Default to true
      null // TODO: Get user ID from session
    ]);
    
    const newSegment = result.rows[0];
    
    // If criteria is provided and segment type is automatic, populate members
    if (validatedData.criteria && validatedData.segment_type === 'automatic') {
      await populateAutomaticSegment(tenantId, newSegment.id, validatedData.criteria);
      
      // Get updated member count
      const memberCount = await execute_sql(`
        SELECT COUNT(*) as count FROM customer_segment_members 
        WHERE tenant_id = $1 AND segment_id = $2 AND is_active = true
      `, [tenantId, newSegment.id]);
      
      newSegment.member_count = parseInt(memberCount.rows[0].count);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Customer segment created successfully',
      data: newSegment
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating customer segment:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create customer segment',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function populateAutomaticSegment(tenantId: string, segmentId: string, criteria: any) {
  try {
    // Build dynamic WHERE clause based on criteria
    const conditions: string[] = ['c.tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramCount = 1;
    
    // Purchase-based criteria
    if (criteria.min_total_purchases !== undefined) {
      paramCount++;
      conditions.push(`c.total_purchases >= $${paramCount}`);
      params.push(criteria.min_total_purchases);
    }
    
    if (criteria.max_total_purchases !== undefined) {
      paramCount++;
      conditions.push(`c.total_purchases <= $${paramCount}`);
      params.push(criteria.max_total_purchases);
    }
    
    if (criteria.min_order_count !== undefined) {
      paramCount++;
      conditions.push(`c.total_orders >= $${paramCount}`);
      params.push(criteria.min_order_count);
    }
    
    if (criteria.max_order_count !== undefined) {
      paramCount++;
      conditions.push(`c.total_orders <= $${paramCount}`);
      params.push(criteria.max_order_count);
    }
    
    if (criteria.min_average_order_value !== undefined) {
      paramCount++;
      conditions.push(`c.average_order_value >= $${paramCount}`);
      params.push(criteria.min_average_order_value);
    }
    
    if (criteria.max_average_order_value !== undefined) {
      paramCount++;
      conditions.push(`c.average_order_value <= $${paramCount}`);
      params.push(criteria.max_average_order_value);
    }
    
    if (criteria.min_loyalty_points !== undefined) {
      paramCount++;
      conditions.push(`c.loyalty_points >= $${paramCount}`);
      params.push(criteria.min_loyalty_points);
    }
    
    if (criteria.max_loyalty_points !== undefined) {
      paramCount++;
      conditions.push(`c.loyalty_points <= $${paramCount}`);
      params.push(criteria.max_loyalty_points);
    }
    
    // Status-based criteria
    if (criteria.customer_status && criteria.customer_status.length > 0) {
      paramCount++;
      conditions.push(`c.customer_status = ANY($${paramCount})`);
      params.push(criteria.customer_status);
    }
    
    if (criteria.customer_type && criteria.customer_type.length > 0) {
      paramCount++;
      conditions.push(`c.customer_type = ANY($${paramCount})`);
      params.push(criteria.customer_type);
    }
    
    if (criteria.preferred_contact_method && criteria.preferred_contact_method.length > 0) {
      paramCount++;
      conditions.push(`c.preferred_contact_method = ANY($${paramCount})`);
      params.push(criteria.preferred_contact_method);
    }
    
    if (criteria.marketing_consent !== undefined) {
      paramCount++;
      conditions.push(`c.marketing_consent = $${paramCount}`);
      params.push(criteria.marketing_consent);
    }
    
    // Date-based criteria
    if (criteria.first_purchase_after) {
      paramCount++;
      conditions.push(`c.first_purchase_date >= $${paramCount}`);
      params.push(criteria.first_purchase_after);
    }
    
    if (criteria.first_purchase_before) {
      paramCount++;
      conditions.push(`c.first_purchase_date <= $${paramCount}`);
      params.push(criteria.first_purchase_before);
    }
    
    if (criteria.last_purchase_after) {
      paramCount++;
      conditions.push(`c.last_purchase_date >= $${paramCount}`);
      params.push(criteria.last_purchase_after);
    }
    
    if (criteria.last_purchase_before) {
      paramCount++;
      conditions.push(`c.last_purchase_date <= $${paramCount}`);
      params.push(criteria.last_purchase_before);
    }
    
    if (criteria.created_after) {
      paramCount++;
      conditions.push(`c.created_at >= $${paramCount}`);
      params.push(criteria.created_after);
    }
    
    if (criteria.created_before) {
      paramCount++;
      conditions.push(`c.created_at <= $${paramCount}`);
      params.push(criteria.created_before);
    }
    
    // Location-based criteria
    if (criteria.billing_states && criteria.billing_states.length > 0) {
      paramCount++;
      conditions.push(`c.billing_state = ANY($${paramCount})`);
      params.push(criteria.billing_states);
    }
    
    if (criteria.billing_countries && criteria.billing_countries.length > 0) {
      paramCount++;
      conditions.push(`c.billing_country = ANY($${paramCount})`);
      params.push(criteria.billing_countries);
    }
    
    if (criteria.shipping_states && criteria.shipping_states.length > 0) {
      paramCount++;
      conditions.push(`c.shipping_state = ANY($${paramCount})`);
      params.push(criteria.shipping_states);
    }
    
    if (criteria.shipping_countries && criteria.shipping_countries.length > 0) {
      paramCount++;
      conditions.push(`c.shipping_country = ANY($${paramCount})`);
      params.push(criteria.shipping_countries);
    }
    
    // Business criteria
    if (criteria.has_company !== undefined) {
      if (criteria.has_company) {
        conditions.push(`c.company_name IS NOT NULL AND c.company_name != ''`);
      } else {
        conditions.push(`(c.company_name IS NULL OR c.company_name = '')`);
      }
    }
    
    if (criteria.has_tax_id !== undefined) {
      if (criteria.has_tax_id) {
        conditions.push(`c.tax_id IS NOT NULL AND c.tax_id != ''`);
      } else {
        conditions.push(`(c.tax_id IS NULL OR c.tax_id = '')`);
      }
    }
    
    // Tag-based criteria
    if (criteria.has_tags && criteria.has_tags.length > 0) {
      paramCount++;
      conditions.push(`c.tags && $${paramCount}`);
      params.push(criteria.has_tags);
    }
    
    if (criteria.exclude_tags && criteria.exclude_tags.length > 0) {
      paramCount++;
      conditions.push(`NOT (c.tags && $${paramCount})`);
      params.push(criteria.exclude_tags);
    }
    
    // Only include active customers for automatic segments
    conditions.push(`c.customer_status = 'active'`);
    
    const whereClause = conditions.join(' AND ');
    
    // Insert matching customers into segment
    const insertMembersQuery = `
      INSERT INTO customer_segment_members (tenant_id, customer_id, segment_id, added_date, is_active)
      SELECT c.tenant_id, c.id, $2, CURRENT_DATE, true
      FROM customers c
      WHERE ${whereClause}
      ON CONFLICT (tenant_id, customer_id, segment_id) DO UPDATE SET
        is_active = true,
        added_date = CURRENT_DATE
    `;
    
    await execute_sql(insertMembersQuery, [segmentId, ...params]);
    
    // Update segment customer count
    const countResult = await execute_sql(`
      SELECT COUNT(*) as count FROM customer_segment_members 
      WHERE tenant_id = $1 AND segment_id = $2 AND is_active = true
    `, [tenantId, segmentId]);
    
    await execute_sql(`
      UPDATE customer_segments 
      SET customer_count = $3, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, segmentId, parseInt(countResult.rows[0].count)]);
    
  } catch (error) {
    console.error('Error populating automatic segment:', error);
    throw error;
  }
}