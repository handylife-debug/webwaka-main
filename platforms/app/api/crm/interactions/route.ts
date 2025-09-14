import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Interaction creation/update schema
const interactionSchema = z.object({
  customer_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  
  // Interaction Classification
  interaction_type: z.enum(['call', 'email', 'meeting', 'demo', 'presentation', 'support', 'social', 'event', 'other']),
  interaction_subtype: z.string().max(100).optional(),
  direction: z.enum(['inbound', 'outbound']),
  channel: z.enum(['phone', 'email', 'in_person', 'video_call', 'web_chat', 'social_media', 'text_message', 'other']).optional(),
  
  // Content & Details
  subject: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  detailed_notes: z.string().optional(),
  
  // Timing & Duration
  interaction_date: z.string(), // ISO datetime string
  duration_minutes: z.number().min(0).optional(),
  
  // Participants & Context
  handled_by_user_id: z.string().uuid().optional(),
  participants: z.array(z.string()).default([]), // Array of participant names/emails
  location: z.string().max(200).optional(),
  meeting_url: z.string().url().max(500).optional(),
  
  // Outcome & Follow-up
  outcome: z.enum(['successful', 'neutral', 'unsuccessful', 'no_contact', 'rescheduled', 'cancelled']),
  sentiment: z.enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']),
  next_steps: z.string().optional(),
  follow_up_required: z.boolean().default(false),
  follow_up_date: z.string().optional(), // ISO date string
  follow_up_type: z.string().max(100).optional(),
  
  // Business Impact
  opportunity_stage: z.enum(['awareness', 'interest', 'consideration', 'intent', 'evaluation', 'purchase', 'retention', 'advocacy']).optional(),
  deal_value_discussed: z.number().min(0).optional(),
  products_discussed: z.array(z.string()).default([]),
  pain_points_identified: z.array(z.string()).default([]),
  competitive_mentions: z.array(z.string()).default([]),
  
  // Quality & Performance
  interaction_quality: z.enum(['excellent', 'good', 'average', 'poor', 'very_poor']).default('average'),
  objectives_met: z.boolean().default(false),
  customer_satisfaction: z.number().min(1).max(5).optional(), // 1-5 scale
  
  // Tracking & Analysis
  campaign_id: z.string().uuid().optional(),
  lead_source: z.string().max(100).optional(),
  touchpoint_sequence: z.number().int().min(1).optional(),
  
  // Status & Metadata
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled']).default('completed'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  tags: z.array(z.string()).default([]),
  custom_fields: z.record(z.any()).default({})
});

// Bulk operations schema
const bulkInteractionActionSchema = z.object({
  action: z.enum(['update_status', 'assign_follow_ups', 'assign_tags', 'update_sentiment']),
  interaction_ids: z.array(z.string().uuid()),
  parameters: z.record(z.any())
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'interaction_date', 'interaction_type', 'direction', 'outcome', 'sentiment',
  'duration_minutes', 'follow_up_date', 'customer_satisfaction', 'interaction_quality',
  'deal_value_discussed', 'status', 'priority', 'created_at', 'updated_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List interactions with advanced filtering and analytics
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
    const sortBy = searchParams.get('sort_by') || 'interaction_date';
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
    const customerId = searchParams.get('customer_id') || '';
    const contactId = searchParams.get('contact_id') || '';
    const interactionType = searchParams.get('interaction_type') || '';
    const direction = searchParams.get('direction') || '';
    const outcome = searchParams.get('outcome') || '';
    const sentiment = searchParams.get('sentiment') || '';
    const status = searchParams.get('status') || '';
    const handledByUserId = searchParams.get('handled_by_user_id') || '';
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    const followUpRequired = searchParams.get('follow_up_required');
    const overdue = searchParams.get('overdue') === 'true';
    const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
    const includeAnalytics = searchParams.get('include_analytics') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['ci.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    // Text search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        ci.subject ILIKE $${paramCount} OR 
        ci.summary ILIKE $${paramCount} OR 
        ci.detailed_notes ILIKE $${paramCount} OR
        c.company_name ILIKE $${paramCount} OR
        cc.first_name ILIKE $${paramCount} OR
        cc.last_name ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (customerId) {
      paramCount++;
      whereConditions.push(`ci.customer_id = $${paramCount}`);
      queryParams.push(customerId);
    }
    
    if (contactId) {
      paramCount++;
      whereConditions.push(`ci.contact_id = $${paramCount}`);
      queryParams.push(contactId);
    }
    
    if (interactionType) {
      paramCount++;
      whereConditions.push(`ci.interaction_type = $${paramCount}`);
      queryParams.push(interactionType);
    }
    
    if (direction) {
      paramCount++;
      whereConditions.push(`ci.direction = $${paramCount}`);
      queryParams.push(direction);
    }
    
    if (outcome) {
      paramCount++;
      whereConditions.push(`ci.outcome = $${paramCount}`);
      queryParams.push(outcome);
    }
    
    if (sentiment) {
      paramCount++;
      whereConditions.push(`ci.sentiment = $${paramCount}`);
      queryParams.push(sentiment);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`ci.status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (handledByUserId) {
      paramCount++;
      whereConditions.push(`ci.handled_by_user_id = $${paramCount}`);
      queryParams.push(handledByUserId);
    }
    
    if (dateFrom) {
      paramCount++;
      whereConditions.push(`ci.interaction_date >= $${paramCount}`);
      queryParams.push(dateFrom);
    }
    
    if (dateTo) {
      paramCount++;
      whereConditions.push(`ci.interaction_date <= $${paramCount}`);
      queryParams.push(dateTo);
    }
    
    if (followUpRequired !== null) {
      paramCount++;
      whereConditions.push(`ci.follow_up_required = $${paramCount}`);
      queryParams.push(followUpRequired === 'true');
    }
    
    if (overdue) {
      whereConditions.push(`ci.follow_up_required = true AND ci.follow_up_date < CURRENT_DATE`);
    }
    
    if (tags.length > 0) {
      paramCount++;
      whereConditions.push(`ci.tags && $${paramCount}`);
      queryParams.push(tags);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with customer, contact, and user details
    const query = `
      SELECT 
        ci.*,
        c.company_name,
        c.customer_tier,
        cc.first_name as contact_first_name,
        cc.last_name as contact_last_name,
        cc.title as contact_title,
        cc.email as contact_email,
        u.first_name as handled_by_first_name,
        u.last_name as handled_by_last_name,
        u.email as handled_by_email
      FROM customer_interactions ci
      LEFT JOIN customers c ON c.id = ci.customer_id
      LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
      LEFT JOIN users u ON u.id = ci.handled_by_user_id
      ${whereClause}
      ORDER BY ci.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_interactions ci
      LEFT JOIN customers c ON c.id = ci.customer_id
      LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
      LEFT JOIN users u ON u.id = ci.handled_by_user_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get analytics if requested
    let analytics: any = null;
    if (includeAnalytics) {
      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_interactions,
          COUNT(*) FILTER (WHERE interaction_date >= CURRENT_DATE - INTERVAL '30 days') as interactions_last_30_days,
          COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
          COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
          COUNT(*) FILTER (WHERE outcome = 'successful') as successful_count,
          COUNT(*) FILTER (WHERE sentiment IN ('positive', 'very_positive')) as positive_sentiment_count,
          COUNT(*) FILTER (WHERE sentiment IN ('negative', 'very_negative')) as negative_sentiment_count,
          COUNT(*) FILTER (WHERE follow_up_required = true) as follow_ups_required,
          COUNT(*) FILTER (WHERE follow_up_required = true AND follow_up_date < CURRENT_DATE) as overdue_follow_ups,
          AVG(duration_minutes) FILTER (WHERE duration_minutes IS NOT NULL) as avg_duration_minutes,
          AVG(customer_satisfaction) FILTER (WHERE customer_satisfaction IS NOT NULL) as avg_customer_satisfaction,
          SUM(deal_value_discussed) FILTER (WHERE deal_value_discussed IS NOT NULL) as total_deal_value_discussed,
          COUNT(DISTINCT customer_id) as unique_customers,
          COUNT(DISTINCT contact_id) FILTER (WHERE contact_id IS NOT NULL) as unique_contacts,
          COUNT(DISTINCT handled_by_user_id) FILTER (WHERE handled_by_user_id IS NOT NULL) as unique_handlers
        FROM customer_interactions ci
        LEFT JOIN customers c ON c.id = ci.customer_id
        LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
        LEFT JOIN users u ON u.id = ci.handled_by_user_id
        ${whereClause}
      `;
      
      const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
      analytics = analyticsResult.rows[0];
      
      // Convert string numbers to proper types and calculate percentages
      Object.keys(analytics).forEach(key => {
        if (analytics[key] !== null && !isNaN(analytics[key])) {
          analytics[key] = parseFloat(analytics[key]);
        }
      });
      
      if (analytics.total_interactions > 0) {
        analytics.success_rate = (analytics.successful_count / analytics.total_interactions) * 100;
        analytics.positive_sentiment_rate = (analytics.positive_sentiment_count / analytics.total_interactions) * 100;
        analytics.inbound_rate = (analytics.inbound_count / analytics.total_interactions) * 100;
        analytics.follow_up_completion_rate = analytics.follow_ups_required > 0 
          ? ((analytics.follow_ups_required - analytics.overdue_follow_ups) / analytics.follow_ups_required) * 100 
          : 100;
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
        search, customerId, contactId, interactionType, direction, outcome,
        sentiment, status, handledByUserId, dateFrom, dateTo, followUpRequired,
        overdue, tags
      }
    });
    
  } catch (error) {
    console.error('Error fetching interactions:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch interactions',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create interaction or bulk operations
export const POST = withStaffPermissions('customers.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (body.action && body.interaction_ids) {
      return await handleBulkInteractionAction(tenantId, body);
    } else {
      return await handleCreateInteraction(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error creating interaction:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create interaction',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleCreateInteraction(tenantId: string, body: any) {
  const validatedData = interactionSchema.parse(body);
  
  // Validate customer exists and belongs to tenant
  const customerCheck = await execute_sql(`
    SELECT id, company_name FROM customers 
    WHERE tenant_id = $1 AND id = $2
  `, [tenantId, validatedData.customer_id]);
  
  if (customerCheck.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Customer not found'
    }, { status: 400 });
  }
  
  // Validate contact if provided
  if (validatedData.contact_id) {
    const contactCheck = await execute_sql(`
      SELECT id FROM customer_contacts 
      WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
    `, [tenantId, validatedData.customer_id, validatedData.contact_id]);
    
    if (contactCheck.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Contact not found or does not belong to this customer'
      }, { status: 400 });
    }
  }
  
  // Validate handled_by_user if provided
  if (validatedData.handled_by_user_id) {
    const userCheck = await execute_sql(`
      SELECT u.id FROM users u
      JOIN user_tenants ut ON ut.user_id = u.id
      WHERE ut.tenant_id = $1 AND u.id = $2 AND u.is_active = true
    `, [tenantId, validatedData.handled_by_user_id]);
    
    if (userCheck.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Invalid user ID'
      }, { status: 400 });
    }
  }
  
  return await withTransaction(async (client) => {
    // Insert interaction
    const insertQuery = `
      INSERT INTO customer_interactions (
        tenant_id, customer_id, contact_id, interaction_type, interaction_subtype, direction,
        channel, subject, summary, detailed_notes, interaction_date, duration_minutes,
        handled_by_user_id, participants, location, meeting_url, outcome, sentiment,
        next_steps, follow_up_required, follow_up_date, follow_up_type, opportunity_stage,
        deal_value_discussed, products_discussed, pain_points_identified, competitive_mentions,
        interaction_quality, objectives_met, customer_satisfaction, campaign_id, lead_source,
        touchpoint_sequence, status, priority, tags, custom_fields, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
        $35, $36, $37, $38
      )
      RETURNING *
    `;
    
    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.customer_id,
      validatedData.contact_id || null,
      validatedData.interaction_type,
      validatedData.interaction_subtype || null,
      validatedData.direction,
      validatedData.channel || null,
      validatedData.subject,
      validatedData.summary || null,
      validatedData.detailed_notes || null,
      validatedData.interaction_date,
      validatedData.duration_minutes || null,
      validatedData.handled_by_user_id || null,
      validatedData.participants,
      validatedData.location || null,
      validatedData.meeting_url || null,
      validatedData.outcome,
      validatedData.sentiment,
      validatedData.next_steps || null,
      validatedData.follow_up_required,
      validatedData.follow_up_date || null,
      validatedData.follow_up_type || null,
      validatedData.opportunity_stage || null,
      validatedData.deal_value_discussed || null,
      validatedData.products_discussed,
      validatedData.pain_points_identified,
      validatedData.competitive_mentions,
      validatedData.interaction_quality,
      validatedData.objectives_met,
      validatedData.customer_satisfaction || null,
      validatedData.campaign_id || null,
      validatedData.lead_source || null,
      validatedData.touchpoint_sequence || null,
      validatedData.status,
      validatedData.priority,
      validatedData.tags,
      JSON.stringify(validatedData.custom_fields),
      body.created_by || null
    ]);
    
    const newInteraction = result.rows[0];
    
    // Update contact's last contact date if contact was specified
    if (validatedData.contact_id) {
      await client.query(`
        UPDATE customer_contacts 
        SET last_contact_date = $3, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND id = $2
      `, [tenantId, validatedData.contact_id, validatedData.interaction_date]);
    }
    
    // Update customer's last contact date
    await client.query(`
      UPDATE customers 
      SET last_contact_date = $3, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, validatedData.customer_id, validatedData.interaction_date]);
    
    return NextResponse.json({
      success: true,
      message: 'Interaction created successfully',
      data: newInteraction
    }, { status: 201 });
  });
}

async function handleBulkInteractionAction(tenantId: string, body: any) {
  const validatedData = bulkInteractionActionSchema.parse(body);
  
  return await withTransaction(async (client) => {
    let affectedCount = 0;
    const results: any[] = [];
    
    switch (validatedData.action) {
      case 'update_status':
        const newStatus = validatedData.parameters.status;
        if (!['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled'].includes(newStatus)) {
          throw new Error('Invalid status value');
        }
        
        const statusResult = await client.query(`
          UPDATE customer_interactions 
          SET status = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, subject, interaction_date, status
        `, [tenantId, validatedData.interaction_ids, newStatus]);
        
        affectedCount = statusResult.rowCount;
        results.push(...statusResult.rows);
        break;
        
      case 'assign_follow_ups':
        const followUpDate = validatedData.parameters.follow_up_date;
        const followUpType = validatedData.parameters.follow_up_type;
        
        const followUpResult = await client.query(`
          UPDATE customer_interactions 
          SET follow_up_required = true, follow_up_date = $3, follow_up_type = $4, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, subject, follow_up_date, follow_up_type
        `, [tenantId, validatedData.interaction_ids, followUpDate, followUpType]);
        
        affectedCount = followUpResult.rowCount;
        results.push(...followUpResult.rows);
        break;
        
      case 'update_sentiment':
        const newSentiment = validatedData.parameters.sentiment;
        if (!['very_positive', 'positive', 'neutral', 'negative', 'very_negative'].includes(newSentiment)) {
          throw new Error('Invalid sentiment value');
        }
        
        const sentimentResult = await client.query(`
          UPDATE customer_interactions 
          SET sentiment = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, subject, interaction_date, sentiment
        `, [tenantId, validatedData.interaction_ids, newSentiment]);
        
        affectedCount = sentimentResult.rowCount;
        results.push(...sentimentResult.rows);
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