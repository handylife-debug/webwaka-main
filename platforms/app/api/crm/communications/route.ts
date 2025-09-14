import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { getCurrentUser } from '../../../../lib/auth-server'
import { z } from 'zod'

// Communication query schema
const communicationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  search: z.string().optional(),
  customer_id: z.string().uuid().optional(),
  communication_type: z.enum(['email', 'phone', 'sms', 'meeting', 'chat', 'social', 'mail', 'other']).optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  status: z.enum(['draft', 'sent', 'delivered', 'read', 'failed', 'bounced']).optional(),
  campaign_id: z.string().uuid().optional(),
  is_automated: z.coerce.boolean().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort_by: z.enum(['sent_at', 'communication_type', 'status', 'customer_name']).default('sent_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  include_analytics: z.coerce.boolean().default(false),
  include_customer_details: z.coerce.boolean().default(true)
});

// Communication creation schema
const createCommunicationSchema = z.object({
  customer_id: z.string().uuid(),
  communication_type: z.enum(['email', 'phone', 'sms', 'meeting', 'chat', 'social', 'mail', 'other']),
  direction: z.enum(['inbound', 'outbound']),
  subject: z.string().max(200).optional(),
  content: z.string().optional(),
  from_address: z.string().max(255).optional(),
  to_address: z.string().max(255).optional(),
  cc_addresses: z.array(z.string()).optional(),
  bcc_addresses: z.array(z.string()).optional(),
  campaign_id: z.string().uuid().optional(),
  is_automated: z.boolean().default(false),
  template_id: z.string().uuid().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content_type: z.string(),
    size: z.number(),
    url: z.string().optional()
  })).optional(),
  metadata: z.record(z.any()).optional(),
  sent_at: z.string().optional(),
  delivered_at: z.string().optional(),
  read_at: z.string().optional()
});

// Bulk communication creation schema
const bulkCommunicationSchema = z.object({
  communications: z.array(createCommunicationSchema).min(1).max(100),
  campaign_info: z.object({
    name: z.string().max(100),
    description: z.string().optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});

// GET - Fetch communication history with analytics
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());
    const validatedQuery = communicationQuerySchema.parse(query);

    const {
      page, limit, search, customer_id, communication_type, direction,
      status, campaign_id, is_automated, date_from, date_to,
      sort_by, sort_order, include_analytics, include_customer_details
    } = validatedQuery;

    const offset = (page - 1) * limit;

    // Build WHERE clause
    const conditions: string[] = ['cl.tenant_id = $1'];
    const queryParams: any[] = [tenantId];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(
        cl.subject ILIKE $${paramIndex} OR 
        cl.content ILIKE $${paramIndex} OR
        CONCAT(c.first_name, ' ', c.last_name) ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.company_name ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (customer_id) {
      conditions.push(`cl.customer_id = $${paramIndex}`);
      queryParams.push(customer_id);
      paramIndex++;
    }

    if (communication_type) {
      conditions.push(`cl.communication_type = $${paramIndex}`);
      queryParams.push(communication_type);
      paramIndex++;
    }

    if (direction) {
      conditions.push(`cl.direction = $${paramIndex}`);
      queryParams.push(direction);
      paramIndex++;
    }

    if (status) {
      conditions.push(`cl.communication_status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (campaign_id) {
      conditions.push(`cl.campaign_id = $${paramIndex}`);
      queryParams.push(campaign_id);
      paramIndex++;
    }

    if (is_automated !== undefined) {
      conditions.push(`cl.is_automated = $${paramIndex}`);
      queryParams.push(is_automated);
      paramIndex++;
    }

    if (date_from) {
      conditions.push(`cl.sent_at >= $${paramIndex}`);
      queryParams.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      conditions.push(`cl.sent_at <= $${paramIndex}`);
      queryParams.push(date_to);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort column
    const sortColumns = {
      'sent_at': 'cl.sent_at',
      'communication_type': 'cl.communication_type',
      'status': 'cl.communication_status',
      'customer_name': 'CONCAT(c.first_name, \' \', c.last_name)'
    };
    const sortColumn = sortColumns[sort_by] || 'cl.sent_at';

    // Main query
    const mainQuery = `
      SELECT 
        cl.id,
        cl.customer_id,
        cl.communication_type,
        cl.direction,
        cl.subject,
        cl.content,
        cl.communication_status,
        cl.from_address,
        cl.to_address,
        cl.cc_addresses,
        cl.bcc_addresses,
        cl.campaign_id,
        cl.is_automated,
        cl.template_id,
        cl.click_count,
        cl.open_count,
        cl.attachments,
        cl.metadata,
        cl.sent_at,
        cl.delivered_at,
        cl.read_at,
        cl.created_at,
        cl.updated_at,
        ${include_customer_details ? `
        c.first_name,
        c.last_name,
        c.email,
        c.mobile,
        c.phone,
        c.company_name,
        c.customer_status,
        ` : ''}
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM communication_logs cl
      LEFT JOIN customers c ON c.id = cl.customer_id AND c.tenant_id = cl.tenant_id
      LEFT JOIN users creator ON creator.id = cl.created_by
      ${whereClause}
      ORDER BY ${sortColumn} ${sort_order.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const result = await execute_sql(mainQuery, queryParams);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM communication_logs cl
      LEFT JOIN customers c ON c.id = cl.customer_id AND c.tenant_id = cl.tenant_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Analytics query (if requested)
    let analytics = null;
    if (include_analytics) {
      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_communications,
          COUNT(*) FILTER (WHERE communication_type = 'email') as email_count,
          COUNT(*) FILTER (WHERE communication_type = 'sms') as sms_count,
          COUNT(*) FILTER (WHERE communication_type = 'phone') as phone_count,
          COUNT(*) FILTER (WHERE communication_type = 'meeting') as meeting_count,
          COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
          COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
          COUNT(*) FILTER (WHERE communication_status = 'sent') as sent_count,
          COUNT(*) FILTER (WHERE communication_status = 'delivered') as delivered_count,
          COUNT(*) FILTER (WHERE communication_status = 'read') as read_count,
          COUNT(*) FILTER (WHERE communication_status = 'failed') as failed_count,
          COUNT(*) FILTER (WHERE communication_status = 'bounced') as bounced_count,
          COUNT(*) FILTER (WHERE is_automated = true) as automated_count,
          COUNT(*) FILTER (WHERE is_automated = false) as manual_count,
          COUNT(DISTINCT customer_id) as unique_customers,
          COUNT(DISTINCT campaign_id) FILTER (WHERE campaign_id IS NOT NULL) as unique_campaigns,
          SUM(click_count) as total_clicks,
          SUM(open_count) as total_opens,
          AVG(click_count) as avg_clicks_per_communication,
          AVG(open_count) as avg_opens_per_communication,
          DATE_TRUNC('day', sent_at) as date_breakdown
        FROM communication_logs cl
        LEFT JOIN customers c ON c.id = cl.customer_id AND c.tenant_id = cl.tenant_id
        ${whereClause}
        GROUP BY DATE_TRUNC('day', sent_at)
        ORDER BY date_breakdown DESC
        LIMIT 30
      `;
      
      const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
      
      // Calculate aggregate analytics
      const aggregateAnalyticsQuery = `
        SELECT 
          COUNT(*) as total_communications,
          COUNT(*) FILTER (WHERE communication_type = 'email') as email_count,
          COUNT(*) FILTER (WHERE communication_type = 'sms') as sms_count,
          COUNT(*) FILTER (WHERE communication_type = 'phone') as phone_count,
          COUNT(*) FILTER (WHERE communication_type = 'meeting') as meeting_count,
          COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
          COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
          COUNT(*) FILTER (WHERE communication_status = 'sent') as sent_count,
          COUNT(*) FILTER (WHERE communication_status = 'delivered') as delivered_count,
          COUNT(*) FILTER (WHERE communication_status = 'read') as read_count,
          COUNT(*) FILTER (WHERE communication_status = 'failed') as failed_count,
          COUNT(*) FILTER (WHERE communication_status = 'bounced') as bounced_count,
          COUNT(*) FILTER (WHERE is_automated = true) as automated_count,
          COUNT(*) FILTER (WHERE is_automated = false) as manual_count,
          COUNT(DISTINCT customer_id) as unique_customers,
          COUNT(DISTINCT campaign_id) FILTER (WHERE campaign_id IS NOT NULL) as unique_campaigns,
          SUM(click_count) as total_clicks,
          SUM(open_count) as total_opens,
          AVG(click_count) as avg_clicks_per_communication,
          AVG(open_count) as avg_opens_per_communication
        FROM communication_logs cl
        LEFT JOIN customers c ON c.id = cl.customer_id AND c.tenant_id = cl.tenant_id
        ${whereClause}
      `;
      
      const aggregateResult = await execute_sql(aggregateAnalyticsQuery, queryParams.slice(0, -2));
      
      // Calculate rates
      const aggregateData = aggregateResult.rows[0];
      const deliveryRate = aggregateData.total_communications > 0 ? 
        ((parseInt(aggregateData.delivered_count) + parseInt(aggregateData.read_count)) / parseInt(aggregateData.total_communications) * 100).toFixed(2) : '0';
      const openRate = aggregateData.total_communications > 0 ? 
        (parseInt(aggregateData.read_count) / parseInt(aggregateData.total_communications) * 100).toFixed(2) : '0';
      const clickRate = parseInt(aggregateData.total_opens) > 0 ? 
        (parseInt(aggregateData.total_clicks) / parseInt(aggregateData.total_opens) * 100).toFixed(2) : '0';

      analytics = {
        aggregate: {
          ...aggregateData,
          delivery_rate: parseFloat(deliveryRate),
          open_rate: parseFloat(openRate),
          click_rate: parseFloat(clickRate)
        },
        daily_breakdown: analyticsResult.rows
      };
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
        search, customer_id, communication_type, direction, status,
        campaign_id, is_automated, date_from, date_to, sort_by, sort_order
      }
    });

  } catch (error) {
    console.error('Error fetching communication history:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to fetch communication history',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Create new communication log entry
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (Array.isArray(body.communications)) {
      return await handleBulkCommunications(tenantId, user.id, body);
    }

    const validatedData = createCommunicationSchema.parse(body);

    // Verify customer exists and belongs to tenant
    const customerQuery = `
      SELECT id FROM customers 
      WHERE tenant_id = $1 AND id = $2 AND customer_status = 'active'
    `;
    const customerResult = await execute_sql(customerQuery, [tenantId, validatedData.customer_id]);

    if (customerResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found or inactive'
      }, { status: 404 });
    }

    // Insert communication log
    const insertQuery = `
      INSERT INTO communication_logs (
        tenant_id, customer_id, communication_type, direction,
        subject, content, communication_status, from_address, to_address,
        cc_addresses, bcc_addresses, campaign_id, is_automated, template_id,
        attachments, metadata, sent_at, delivered_at, read_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const insertParams = [
      tenantId,
      validatedData.customer_id,
      validatedData.communication_type,
      validatedData.direction,
      validatedData.subject || null,
      validatedData.content || null,
      'sent', // Default status
      validatedData.from_address || null,
      validatedData.to_address || null,
      validatedData.cc_addresses || [],
      validatedData.bcc_addresses || [],
      validatedData.campaign_id || null,
      validatedData.is_automated,
      validatedData.template_id || null,
      JSON.stringify(validatedData.attachments || []),
      JSON.stringify(validatedData.metadata || {}),
      validatedData.sent_at || new Date().toISOString(),
      validatedData.delivered_at || null,
      validatedData.read_at || null,
      user.id
    ];

    const result = await execute_sql(insertQuery, insertParams);

    return NextResponse.json({
      success: true,
      message: 'Communication logged successfully',
      data: result.rows[0]
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating communication log:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to create communication log',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Handle bulk communications
async function handleBulkCommunications(tenantId: string, userId: string, body: any) {
  const validatedData = bulkCommunicationSchema.parse(body);

  // Validate all customer IDs exist
  const customerIds = [...new Set(validatedData.communications.map(c => c.customer_id))];
  const customerQuery = `
    SELECT id FROM customers 
    WHERE tenant_id = $1 AND id = ANY($2) AND customer_status = 'active'
  `;
  const customerResult = await execute_sql(customerQuery, [tenantId, customerIds]);
  const validCustomerIds = customerResult.rows.map((row: any) => row.id);

  // Filter out communications for invalid customers
  const validCommunications = validatedData.communications.filter(c => 
    validCustomerIds.includes(c.customer_id)
  );

  if (validCommunications.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'No valid customers found for communications'
    }, { status: 400 });
  }

  // Generate campaign ID if campaign info provided
  let campaignId = null;
  if (validatedData.campaign_info) {
    const campaignInsertQuery = `
      INSERT INTO communication_logs (
        tenant_id, customer_id, communication_type, direction,
        subject, content, communication_status, campaign_id, is_automated,
        metadata, created_by
      ) VALUES ($1, $2, 'other', 'outbound', $3, $4, 'sent', gen_random_uuid(), true, $5, $6)
      RETURNING campaign_id
    `;
    // This is a placeholder - you might want a separate campaigns table
  }

  const results = [];
  for (const comm of validCommunications) {
    try {
      const insertQuery = `
        INSERT INTO communication_logs (
          tenant_id, customer_id, communication_type, direction,
          subject, content, communication_status, from_address, to_address,
          cc_addresses, bcc_addresses, campaign_id, is_automated, template_id,
          attachments, metadata, sent_at, delivered_at, read_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id
      `;

      const insertParams = [
        tenantId,
        comm.customer_id,
        comm.communication_type,
        comm.direction,
        comm.subject || null,
        comm.content || null,
        'sent',
        comm.from_address || null,
        comm.to_address || null,
        comm.cc_addresses || [],
        comm.bcc_addresses || [],
        campaignId || comm.campaign_id || null,
        comm.is_automated,
        comm.template_id || null,
        JSON.stringify(comm.attachments || []),
        JSON.stringify({
          ...comm.metadata || {},
          bulk_campaign: validatedData.campaign_info || null
        }),
        comm.sent_at || new Date().toISOString(),
        comm.delivered_at || null,
        comm.read_at || null,
        userId
      ];

      const result = await execute_sql(insertQuery, insertParams);
      results.push({ 
        customer_id: comm.customer_id, 
        success: true, 
        id: result.rows[0].id 
      });
    } catch (error) {
      results.push({ 
        customer_id: comm.customer_id, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return NextResponse.json({
    success: successCount > 0,
    message: `${successCount}/${results.length} communications logged successfully`,
    data: results,
    campaign_info: validatedData.campaign_info
  });
}