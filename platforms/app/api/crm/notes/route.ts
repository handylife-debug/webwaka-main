import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Customer note creation/update schema
const customerNoteSchema = z.object({
  customer_id: z.string().uuid(),
  
  // Note Classification
  note_type: z.enum(['general', 'sales', 'support', 'meeting', 'call', 'email', 'complaint', 'opportunity', 'follow_up', 'internal']),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  
  // Context & Categorization
  category: z.enum(['general', 'sales', 'support', 'technical', 'billing', 'product', 'feedback', 'partnership', 'compliance']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  
  // Visibility & Access
  visibility: z.enum(['private', 'team', 'department', 'company']).default('team'),
  is_confidential: z.boolean().default(false),
  
  // Interaction Context
  interaction_channel: z.enum(['phone', 'email', 'in_person', 'chat', 'video', 'social_media', 'website', 'other']).optional(),
  related_interaction_id: z.string().uuid().optional(),
  meeting_date: z.string().optional(), // ISO date
  
  // Organization & Follow-up
  is_action_required: z.boolean().default(false),
  action_due_date: z.string().optional(), // ISO date
  action_description: z.string().max(500).optional(),
  
  // Collaboration
  mentioned_users: z.array(z.string().uuid()).default([]),
  shared_with_customer: z.boolean().default(false),
  
  // Metadata
  tags: z.array(z.string()).default([]),
  custom_fields: z.record(z.any()).default({}),
  
  // File Attachments
  attachments: z.array(z.object({
    file_name: z.string(),
    file_size: z.number(),
    file_type: z.string(),
    file_url: z.string(),
    uploaded_at: z.string().optional()
  })).default([])
});

// Bulk operations schema
const bulkNotesActionSchema = z.object({
  action: z.enum(['update_visibility', 'assign_tags', 'set_priority', 'archive_notes', 'export_notes']),
  note_ids: z.array(z.string().uuid()),
  parameters: z.record(z.any())
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'note_type', 'category', 'priority', 'title', 'created_at', 'updated_at',
  'meeting_date', 'action_due_date', 'is_action_required', 'visibility'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List customer notes with advanced filtering
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
    const customerId = searchParams.get('customer_id') || '';
    const noteType = searchParams.get('note_type') || '';
    const category = searchParams.get('category') || '';
    const priority = searchParams.get('priority') || '';
    const visibility = searchParams.get('visibility') || '';
    const isActionRequired = searchParams.get('is_action_required');
    const isConfidential = searchParams.get('is_confidential');
    const sharedWithCustomer = searchParams.get('shared_with_customer');
    const interactionChannel = searchParams.get('interaction_channel') || '';
    const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    const includeCustomer = searchParams.get('include_customer') === 'true';
    const includeAuthor = searchParams.get('include_author') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['cn.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    // Text search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        cn.title ILIKE $${paramCount} OR 
        cn.content ILIKE $${paramCount} OR
        cn.action_description ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (customerId) {
      paramCount++;
      whereConditions.push(`cn.customer_id = $${paramCount}`);
      queryParams.push(customerId);
    }
    
    if (noteType) {
      paramCount++;
      whereConditions.push(`cn.note_type = $${paramCount}`);
      queryParams.push(noteType);
    }
    
    if (category) {
      paramCount++;
      whereConditions.push(`cn.category = $${paramCount}`);
      queryParams.push(category);
    }
    
    if (priority) {
      paramCount++;
      whereConditions.push(`cn.priority = $${paramCount}`);
      queryParams.push(priority);
    }
    
    if (visibility) {
      paramCount++;
      whereConditions.push(`cn.visibility = $${paramCount}`);
      queryParams.push(visibility);
    }
    
    if (isActionRequired !== null) {
      paramCount++;
      whereConditions.push(`cn.is_action_required = $${paramCount}`);
      queryParams.push(isActionRequired === 'true');
    }
    
    if (isConfidential !== null) {
      paramCount++;
      whereConditions.push(`cn.is_confidential = $${paramCount}`);
      queryParams.push(isConfidential === 'true');
    }
    
    if (sharedWithCustomer !== null) {
      paramCount++;
      whereConditions.push(`cn.shared_with_customer = $${paramCount}`);
      queryParams.push(sharedWithCustomer === 'true');
    }
    
    if (interactionChannel) {
      paramCount++;
      whereConditions.push(`cn.interaction_channel = $${paramCount}`);
      queryParams.push(interactionChannel);
    }
    
    if (tags.length > 0) {
      paramCount++;
      whereConditions.push(`cn.tags && $${paramCount}`);
      queryParams.push(tags);
    }
    
    if (dateFrom) {
      paramCount++;
      whereConditions.push(`cn.created_at >= $${paramCount}`);
      queryParams.push(dateFrom);
    }
    
    if (dateTo) {
      paramCount++;
      whereConditions.push(`cn.created_at <= $${paramCount}`);
      queryParams.push(dateTo);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with customer and author details
    const query = `
      SELECT 
        cn.*,
        c.company_name as customer_company_name,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.customer_tier,
        c.customer_status,
        author.first_name as author_first_name,
        author.last_name as author_last_name,
        author.email as author_email,
        updater.first_name as updated_by_first_name,
        updater.last_name as updated_by_last_name
      FROM customer_notes cn
      LEFT JOIN customers c ON c.id = cn.customer_id
      LEFT JOIN users author ON author.id = cn.created_by
      LEFT JOIN users updater ON updater.id = cn.updated_by
      ${whereClause}
      ORDER BY cn.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_notes cn
      LEFT JOIN customers c ON c.id = cn.customer_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get notes analytics
    const analyticsQuery = `
      SELECT 
        COUNT(*) as total_notes,
        COUNT(*) FILTER (WHERE note_type = 'sales') as sales_notes,
        COUNT(*) FILTER (WHERE note_type = 'support') as support_notes,
        COUNT(*) FILTER (WHERE note_type = 'meeting') as meeting_notes,
        COUNT(*) FILTER (WHERE is_action_required = true) as action_required_notes,
        COUNT(*) FILTER (WHERE is_confidential = true) as confidential_notes,
        COUNT(*) FILTER (WHERE shared_with_customer = true) as customer_shared_notes,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority_notes,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_notes,
        COUNT(DISTINCT customer_id) as customers_with_notes,
        COUNT(DISTINCT created_by) as note_authors,
        AVG(CASE WHEN action_due_date IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (action_due_date::timestamp - created_at)) / 86400 
            ELSE NULL END) as avg_action_lead_days
      FROM customer_notes cn
      LEFT JOIN customers c ON c.id = cn.customer_id
      ${whereClause}
    `;
    
    const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
    const analytics = analyticsResult.rows[0];
    
    // Convert string numbers to proper types
    Object.keys(analytics).forEach(key => {
      if (analytics[key] !== null && !isNaN(analytics[key])) {
        analytics[key] = parseFloat(analytics[key]);
      }
    });
    
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
        search, customerId, noteType, category, priority, visibility,
        isActionRequired, isConfidential, sharedWithCustomer, interactionChannel,
        tags, dateFrom, dateTo
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer notes:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customer notes',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create customer note or bulk operations
export const POST = withStaffPermissions('customers.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (body.action && body.note_ids) {
      return await handleBulkNotesAction(tenantId, body);
    } else {
      return await handleCreateNote(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error creating customer note:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create customer note',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleCreateNote(tenantId: string, body: any) {
  const validatedData = customerNoteSchema.parse(body);
  
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
  
  // Validate mentioned users belong to tenant (if any)
  if (validatedData.mentioned_users.length > 0) {
    const usersCheck = await execute_sql(`
      SELECT id FROM users 
      WHERE tenant_id = $1 AND id = ANY($2)
    `, [tenantId, validatedData.mentioned_users]);
    
    if (usersCheck.rows.length !== validatedData.mentioned_users.length) {
      return NextResponse.json({
        success: false,
        message: 'One or more mentioned users not found'
      }, { status: 400 });
    }
  }
  
  return await withTransaction(async (client) => {
    // Insert note
    const insertQuery = `
      INSERT INTO customer_notes (
        tenant_id, customer_id, note_type, title, content, category, priority,
        visibility, is_confidential, interaction_channel, related_interaction_id,
        meeting_date, is_action_required, action_due_date, action_description,
        mentioned_users, shared_with_customer, tags, custom_fields, attachments,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING *
    `;
    
    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.customer_id,
      validatedData.note_type,
      validatedData.title,
      validatedData.content,
      validatedData.category || null,
      validatedData.priority,
      validatedData.visibility,
      validatedData.is_confidential,
      validatedData.interaction_channel || null,
      validatedData.related_interaction_id || null,
      validatedData.meeting_date || null,
      validatedData.is_action_required,
      validatedData.action_due_date || null,
      validatedData.action_description || null,
      validatedData.mentioned_users,
      validatedData.shared_with_customer,
      validatedData.tags,
      JSON.stringify(validatedData.custom_fields),
      JSON.stringify(validatedData.attachments),
      body.created_by || null
    ]);
    
    const newNote = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Customer note created successfully',
      data: newNote
    }, { status: 201 });
  });
}

async function handleBulkNotesAction(tenantId: string, body: any) {
  const validatedData = bulkNotesActionSchema.parse(body);
  
  return await withTransaction(async (client) => {
    let affectedCount = 0;
    const results: any[] = [];
    
    switch (validatedData.action) {
      case 'update_visibility':
        const newVisibility = validatedData.parameters.visibility;
        if (!['private', 'team', 'department', 'company'].includes(newVisibility)) {
          throw new Error('Invalid visibility value');
        }
        
        const visibilityResult = await client.query(`
          UPDATE customer_notes 
          SET visibility = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, title, note_type, visibility
        `, [tenantId, validatedData.note_ids, newVisibility]);
        
        affectedCount = visibilityResult.rowCount;
        results.push(...visibilityResult.rows);
        break;
        
      case 'assign_tags':
        const tagsToAdd = validatedData.parameters.tags || [];
        if (!Array.isArray(tagsToAdd)) {
          throw new Error('Tags must be an array');
        }
        
        const assignTagsResult = await client.query(`
          UPDATE customer_notes 
          SET tags = array(SELECT DISTINCT unnest(tags || $3)), updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, title, note_type, tags
        `, [tenantId, validatedData.note_ids, tagsToAdd]);
        
        affectedCount = assignTagsResult.rowCount;
        results.push(...assignTagsResult.rows);
        break;
        
      case 'set_priority':
        const newPriority = validatedData.parameters.priority;
        if (!['low', 'normal', 'high', 'urgent'].includes(newPriority)) {
          throw new Error('Invalid priority value');
        }
        
        const priorityResult = await client.query(`
          UPDATE customer_notes 
          SET priority = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, title, note_type, priority
        `, [tenantId, validatedData.note_ids, newPriority]);
        
        affectedCount = priorityResult.rowCount;
        results.push(...priorityResult.rows);
        break;
        
      case 'archive_notes':
        const archiveResult = await client.query(`
          UPDATE customer_notes 
          SET visibility = 'private', is_action_required = false, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, title, note_type
        `, [tenantId, validatedData.note_ids]);
        
        affectedCount = archiveResult.rowCount;
        results.push(...archiveResult.rows);
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