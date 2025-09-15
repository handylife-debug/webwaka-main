import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Customer creation/update schema
const customerSchema = z.object({
  customer_code: z.string().min(1).max(50),
  
  // Company Information
  company_name: z.string().min(1).max(200),
  legal_name: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+', 'unknown']).optional(),
  annual_revenue: z.number().min(0).optional(),
  website: z.string().url().max(500).optional(),
  tax_id: z.string().max(50).optional(),
  
  // Primary Contact Information
  primary_contact_name: z.string().max(200).optional(),
  primary_email: z.string().email().max(255).optional(),
  primary_phone: z.string().max(20).optional(),
  
  // Business Classification
  customer_type: z.enum(['prospect', 'lead', 'customer', 'partner', 'vendor', 'inactive']).default('prospect'),
  customer_status: z.enum(['active', 'inactive', 'blacklisted', 'archived']).default('active'),
  priority_level: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  customer_tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'enterprise', 'standard']).default('standard'),
  
  // Sales Information
  lead_source: z.string().max(100).optional(),
  assigned_sales_rep_id: z.string().uuid().optional(),
  territory: z.string().max(100).optional(),
  
  // Financial Information
  credit_limit: z.number().min(0).default(0),
  payment_terms: z.number().int().min(1).default(30),
  currency_code: z.string().length(3).default('USD'),
  
  // Relationship Tracking
  acquisition_date: z.string().optional(), // ISO date string
  next_follow_up_date: z.string().optional(), // ISO date string
  
  // Communication Preferences
  preferred_communication: z.enum(['email', 'phone', 'sms', 'mail', 'in_person']).default('email'),
  email_opt_in: z.boolean().default(true),
  sms_opt_in: z.boolean().default(false),
  marketing_opt_in: z.boolean().default(true),
  
  // Additional Information
  description: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  custom_fields: z.record(z.any()).default({}),
  social_media: z.record(z.string()).default({})
});

// Bulk operations schema
const bulkActionSchema = z.object({
  action: z.enum(['update_status', 'assign_sales_rep', 'add_tags', 'remove_tags', 'update_tier', 'merge_customers']),
  customer_ids: z.array(z.string().uuid()),
  parameters: z.record(z.any())
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'company_name', 'customer_code', 'customer_type', 'customer_status', 'priority_level',
  'customer_tier', 'industry', 'annual_revenue', 'total_purchase_amount', 'lifetime_value',
  'last_contact_date', 'next_follow_up_date', 'created_at', 'updated_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List customers with advanced filtering and analytics
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest) {
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
    
    // Advanced Filters
    const search = searchParams.get('search') || '';
    const customerType = searchParams.get('customer_type') || '';
    const customerStatus = searchParams.get('customer_status') || '';
    const priority = searchParams.get('priority_level') || '';
    const tier = searchParams.get('customer_tier') || '';
    const industry = searchParams.get('industry') || '';
    const assignedSalesRep = searchParams.get('assigned_sales_rep_id') || '';
    const territory = searchParams.get('territory') || '';
    const leadSource = searchParams.get('lead_source') || '';
    const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
    const createdAfter = searchParams.get('created_after') || '';
    const createdBefore = searchParams.get('created_before') || '';
    const revenueMin = searchParams.get('annual_revenue_min') || '';
    const revenueMax = searchParams.get('annual_revenue_max') || '';
    const includeAnalytics = searchParams.get('include_analytics') === 'true';
    const includeSegments = searchParams.get('include_segments') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['c.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    // Text search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        c.company_name ILIKE $${paramCount} OR 
        c.primary_contact_name ILIKE $${paramCount} OR 
        c.primary_email ILIKE $${paramCount} OR 
        c.customer_code ILIKE $${paramCount} OR
        c.description ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (customerType) {
      paramCount++;
      whereConditions.push(`c.customer_type = $${paramCount}`);
      queryParams.push(customerType);
    }
    
    if (customerStatus) {
      paramCount++;
      whereConditions.push(`c.customer_status = $${paramCount}`);
      queryParams.push(customerStatus);
    }
    
    if (priority) {
      paramCount++;
      whereConditions.push(`c.priority_level = $${paramCount}`);
      queryParams.push(priority);
    }
    
    if (tier) {
      paramCount++;
      whereConditions.push(`c.customer_tier = $${paramCount}`);
      queryParams.push(tier);
    }
    
    if (industry) {
      paramCount++;
      whereConditions.push(`c.industry ILIKE $${paramCount}`);
      queryParams.push(`%${industry}%`);
    }
    
    if (assignedSalesRep) {
      paramCount++;
      whereConditions.push(`c.assigned_sales_rep_id = $${paramCount}`);
      queryParams.push(assignedSalesRep);
    }
    
    if (territory) {
      paramCount++;
      whereConditions.push(`c.territory ILIKE $${paramCount}`);
      queryParams.push(`%${territory}%`);
    }
    
    if (leadSource) {
      paramCount++;
      whereConditions.push(`c.lead_source ILIKE $${paramCount}`);
      queryParams.push(`%${leadSource}%`);
    }
    
    if (tags.length > 0) {
      paramCount++;
      whereConditions.push(`c.tags && $${paramCount}`);
      queryParams.push(tags);
    }
    
    if (createdAfter) {
      paramCount++;
      whereConditions.push(`c.created_at >= $${paramCount}`);
      queryParams.push(createdAfter);
    }
    
    if (createdBefore) {
      paramCount++;
      whereConditions.push(`c.created_at <= $${paramCount}`);
      queryParams.push(createdBefore);
    }
    
    if (revenueMin) {
      paramCount++;
      whereConditions.push(`c.annual_revenue >= $${paramCount}`);
      queryParams.push(parseFloat(revenueMin));
    }
    
    if (revenueMax) {
      paramCount++;
      whereConditions.push(`c.annual_revenue <= $${paramCount}`);
      queryParams.push(parseFloat(revenueMax));
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with sales rep details
    const query = `
      SELECT 
        c.*,
        sr.first_name as sales_rep_first_name,
        sr.last_name as sales_rep_last_name,
        sr.email as sales_rep_email
      FROM customers c
      LEFT JOIN users sr ON sr.id = c.assigned_sales_rep_id
      ${whereClause}
      ORDER BY c.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get customer segments if requested
    if (includeSegments) {
      for (const customer of result.rows) {
        const segmentsQuery = `
          SELECT cs.segment_name, cs.segment_code, cs.color_hex, csm.relevance_score
          FROM customer_segment_memberships csm
          JOIN customer_segments cs ON cs.id = csm.segment_id
          WHERE csm.tenant_id = $1 AND csm.customer_id = $2 AND csm.status = 'active'
          ORDER BY csm.relevance_score DESC NULLS LAST
        `;
        
        const segmentsResult = await execute_sql(segmentsQuery, [tenantId, customer.id]);
        customer.segments = segmentsResult.rows;
      }
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customers c
      LEFT JOIN users sr ON sr.id = c.assigned_sales_rep_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get customer analytics if requested
    let analytics: any = null;
    if (includeAnalytics) {
      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_customers,
          COUNT(*) FILTER (WHERE customer_type = 'prospect') as prospects_count,
          COUNT(*) FILTER (WHERE customer_type = 'lead') as leads_count,
          COUNT(*) FILTER (WHERE customer_type = 'customer') as customers_count,
          COUNT(*) FILTER (WHERE customer_status = 'active') as active_count,
          COUNT(*) FILTER (WHERE customer_status = 'inactive') as inactive_count,
          COUNT(*) FILTER (WHERE priority_level = 'high' OR priority_level = 'critical') as high_priority_count,
          COUNT(*) FILTER (WHERE customer_tier IN ('gold', 'platinum', 'enterprise')) as premium_tier_count,
          AVG(annual_revenue) FILTER (WHERE annual_revenue IS NOT NULL) as avg_annual_revenue,
          SUM(total_purchase_amount) as total_revenue,
          AVG(lifetime_value) FILTER (WHERE lifetime_value > 0) as avg_lifetime_value,
          COUNT(DISTINCT industry) FILTER (WHERE industry IS NOT NULL) as unique_industries,
          COUNT(DISTINCT territory) FILTER (WHERE territory IS NOT NULL) as unique_territories,
          COUNT(DISTINCT assigned_sales_rep_id) FILTER (WHERE assigned_sales_rep_id IS NOT NULL) as assigned_sales_reps
        FROM customers c
        ${whereClause}
      `;
      
      const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
      analytics = analyticsResult.rows[0];
      
      // Convert string numbers to proper types
      Object.keys(analytics).forEach(key => {
        if (analytics[key] !== null && !isNaN(analytics[key])) {
          analytics[key] = parseFloat(analytics[key]);
        }
      });
      
      // Add conversion rates
      if (analytics.total_customers > 0) {
        analytics.prospect_to_lead_rate = (analytics.leads_count / analytics.total_customers) * 100;
        analytics.lead_to_customer_rate = (analytics.customers_count / analytics.total_customers) * 100;
        analytics.premium_tier_rate = (analytics.premium_tier_count / analytics.total_customers) * 100;
      }
    }
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      analytics: analytics,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      filters: {
        search, customerType, customerStatus, priority, tier, industry,
        assignedSalesRep, territory, leadSource, tags, createdAfter, createdBefore,
        revenueMin, revenueMax
      }
    });
    
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customers',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create customer or bulk operations
export const POST = withStaffPermissions('customers.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (body.action && body.customer_ids) {
      return await handleBulkAction(tenantId, body);
    } else {
      return await handleCreateCustomer(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error creating customer:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleCreateCustomer(tenantId: string, body: any) {
  const validatedData = customerSchema.parse(body);
  
  // Check for duplicate customer code
  const duplicateCheck = await execute_sql(`
    SELECT id FROM customers 
    WHERE tenant_id = $1 AND customer_code = $2
  `, [tenantId, validatedData.customer_code]);
  
  if (duplicateCheck.rows.length > 0) {
    return NextResponse.json({
      success: false,
      message: 'Customer code already exists'
    }, { status: 409 });
  }
  
  // Check for duplicate company name
  const companyCheck = await execute_sql(`
    SELECT id FROM customers 
    WHERE tenant_id = $1 AND company_name = $2
  `, [tenantId, validatedData.company_name]);
  
  if (companyCheck.rows.length > 0) {
    return NextResponse.json({
      success: false,
      message: 'Company name already exists'
    }, { status: 409 });
  }
  
  // Validate assigned sales rep if provided
  if (validatedData.assigned_sales_rep_id) {
    const salesRepCheck = await execute_sql(`
      SELECT u.id, u.first_name, u.last_name
      FROM users u
      JOIN user_tenants ut ON ut.user_id = u.id
      WHERE ut.tenant_id = $1 AND u.id = $2 AND u.is_active = true
    `, [tenantId, validatedData.assigned_sales_rep_id]);
    
    if (salesRepCheck.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sales representative'
      }, { status: 400 });
    }
  }
  
  return await withTransaction(async (client) => {
    // Insert customer
    const insertQuery = `
      INSERT INTO customers (
        tenant_id, customer_code, company_name, legal_name, industry, company_size,
        annual_revenue, website, tax_id, primary_contact_name, primary_email, primary_phone,
        customer_type, customer_status, priority_level, customer_tier, lead_source,
        assigned_sales_rep_id, territory, credit_limit, payment_terms, currency_code,
        acquisition_date, next_follow_up_date, preferred_communication, email_opt_in,
        sms_opt_in, marketing_opt_in, description, notes, tags, custom_fields, social_media,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34
      )
      RETURNING *
    `;
    
    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.customer_code,
      validatedData.company_name,
      validatedData.legal_name || null,
      validatedData.industry || null,
      validatedData.company_size || null,
      validatedData.annual_revenue || null,
      validatedData.website || null,
      validatedData.tax_id || null,
      validatedData.primary_contact_name || null,
      validatedData.primary_email || null,
      validatedData.primary_phone || null,
      validatedData.customer_type,
      validatedData.customer_status,
      validatedData.priority_level,
      validatedData.customer_tier,
      validatedData.lead_source || null,
      validatedData.assigned_sales_rep_id || null,
      validatedData.territory || null,
      validatedData.credit_limit,
      validatedData.payment_terms,
      validatedData.currency_code,
      validatedData.acquisition_date || null,
      validatedData.next_follow_up_date || null,
      validatedData.preferred_communication,
      validatedData.email_opt_in,
      validatedData.sms_opt_in,
      validatedData.marketing_opt_in,
      validatedData.description || null,
      validatedData.notes || null,
      validatedData.tags,
      JSON.stringify(validatedData.custom_fields),
      JSON.stringify(validatedData.social_media),
      body.created_by || null
    ]);
    
    const newCustomer = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Customer created successfully',
      data: newCustomer
    }, { status: 201 });
  });
}

async function handleBulkAction(tenantId: string, body: any) {
  const validatedData = bulkActionSchema.parse(body);
  
  return await withTransaction(async (client) => {
    let affectedCount = 0;
    const results: any[] = [];
    
    switch (validatedData.action) {
      case 'update_status':
        const newStatus = validatedData.parameters.status;
        if (!['active', 'inactive', 'blacklisted', 'archived'].includes(newStatus)) {
          throw new Error('Invalid status value');
        }
        
        const statusResult = await client.query(`
          UPDATE customers 
          SET customer_status = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, company_name, customer_status
        `, [tenantId, validatedData.customer_ids, newStatus]);
        
        affectedCount = statusResult.rowCount;
        results.push(...statusResult.rows);
        break;
        
      case 'assign_sales_rep':
        const salesRepId = validatedData.parameters.sales_rep_id;
        
        // Validate sales rep if provided
        if (salesRepId) {
          const salesRepCheck = await client.query(`
            SELECT u.id FROM users u
            JOIN user_tenants ut ON ut.user_id = u.id
            WHERE ut.tenant_id = $1 AND u.id = $2 AND u.is_active = true
          `, [tenantId, salesRepId]);
          
          if (salesRepCheck.rows.length === 0) {
            throw new Error('Invalid sales representative');
          }
        }
        
        const assignResult = await client.query(`
          UPDATE customers 
          SET assigned_sales_rep_id = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, company_name, assigned_sales_rep_id
        `, [tenantId, validatedData.customer_ids, salesRepId]);
        
        affectedCount = assignResult.rowCount;
        results.push(...assignResult.rows);
        break;
        
      case 'add_tags':
        const tagsToAdd = validatedData.parameters.tags || [];
        if (!Array.isArray(tagsToAdd)) {
          throw new Error('Tags must be an array');
        }
        
        const addTagsResult = await client.query(`
          UPDATE customers 
          SET tags = array(SELECT DISTINCT unnest(tags || $3)), updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, company_name, tags
        `, [tenantId, validatedData.customer_ids, tagsToAdd]);
        
        affectedCount = addTagsResult.rowCount;
        results.push(...addTagsResult.rows);
        break;
        
      case 'update_tier':
        const newTier = validatedData.parameters.tier;
        if (!['bronze', 'silver', 'gold', 'platinum', 'enterprise', 'standard'].includes(newTier)) {
          throw new Error('Invalid tier value');
        }
        
        const tierResult = await client.query(`
          UPDATE customers 
          SET customer_tier = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, company_name, customer_tier
        `, [tenantId, validatedData.customer_ids, newTier]);
        
        affectedCount = tierResult.rowCount;
        results.push(...tierResult.rows);
        break;
        
      default:
        throw new Error(`Unsupported bulk action: ${validatedData.action}`);
    }
    
    return NextResponse.json({
      success: true,
      message: `Bulk ${validatedData.action} completed successfully`,
      data: {
        action: validatedData.action,
        affected_count: affectedCount,
        results: results
      }
    });
  });
}