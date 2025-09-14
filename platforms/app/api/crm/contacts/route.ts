import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Contact creation/update schema
const contactSchema = z.object({
  customer_id: z.string().uuid(),
  
  // Personal Information
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  salutation: z.enum(['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Other']).optional(),
  
  // Contact Information
  email: z.string().email().max(255).optional(),
  phone: z.string().max(20).optional(),
  mobile: z.string().max(20).optional(),
  fax: z.string().max(20).optional(),
  linkedin_url: z.string().url().max(500).optional(),
  
  // Role & Hierarchy
  is_primary_contact: z.boolean().default(false),
  is_decision_maker: z.boolean().default(false),
  is_technical_contact: z.boolean().default(false),
  is_billing_contact: z.boolean().default(false),
  is_executive: z.boolean().default(false),
  reports_to_contact_id: z.string().uuid().optional(),
  
  // Relationship & Influence
  relationship_strength: z.enum(['weak', 'moderate', 'strong', 'champion']).default('moderate'),
  influence_level: z.enum(['low', 'medium', 'high', 'decision_maker']).default('medium'),
  communication_frequency: z.enum(['never', 'rarely', 'monthly', 'weekly', 'daily']).default('monthly'),
  preferred_contact_method: z.enum(['email', 'phone', 'sms', 'linkedin', 'in_person']).default('email'),
  
  // Communication Preferences
  email_opt_in: z.boolean().default(true),
  sms_opt_in: z.boolean().default(false),
  marketing_opt_in: z.boolean().default(true),
  newsletter_opt_in: z.boolean().default(false),
  
  // Business Context
  budget_authority: z.number().min(0).optional(),
  areas_of_responsibility: z.array(z.string()).default([]),
  pain_points: z.array(z.string()).default([]),
  interests: z.array(z.string()).default([]),
  
  // Activity Tracking
  last_contact_date: z.string().optional(), // ISO date string
  next_follow_up_date: z.string().optional(),
  lead_score: z.number().min(0).max(100).default(50),
  
  // Status & Notes
  status: z.enum(['active', 'inactive', 'bounced', 'do_not_contact', 'archived']).default('active'),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  custom_fields: z.record(z.any()).default({})
});

// Bulk operations schema
const bulkContactActionSchema = z.object({
  action: z.enum(['update_status', 'assign_tags', 'remove_tags', 'update_opt_ins', 'merge_contacts']),
  contact_ids: z.array(z.string().uuid()),
  parameters: z.record(z.any())
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'first_name', 'last_name', 'title', 'department', 'email', 'phone',
  'is_primary_contact', 'is_decision_maker', 'relationship_strength', 'influence_level',
  'last_contact_date', 'next_follow_up_date', 'lead_score', 'status', 'created_at', 'updated_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List contacts with advanced filtering
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
    const status = searchParams.get('status') || '';
    const isPrimary = searchParams.get('is_primary_contact');
    const isDecisionMaker = searchParams.get('is_decision_maker');
    const relationshipStrength = searchParams.get('relationship_strength') || '';
    const influenceLevel = searchParams.get('influence_level') || '';
    const department = searchParams.get('department') || '';
    const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
    const lastContactAfter = searchParams.get('last_contact_after') || '';
    const nextFollowUpBefore = searchParams.get('next_follow_up_before') || '';
    const leadScoreMin = searchParams.get('lead_score_min') || '';
    const leadScoreMax = searchParams.get('lead_score_max') || '';
    const includeCustomer = searchParams.get('include_customer') === 'true';
    const includeInteractions = searchParams.get('include_interactions') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['cc.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    // Text search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        cc.first_name ILIKE $${paramCount} OR 
        cc.last_name ILIKE $${paramCount} OR 
        cc.email ILIKE $${paramCount} OR 
        cc.title ILIKE $${paramCount} OR
        cc.department ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (customerId) {
      paramCount++;
      whereConditions.push(`cc.customer_id = $${paramCount}`);
      queryParams.push(customerId);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`cc.status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (isPrimary !== null) {
      paramCount++;
      whereConditions.push(`cc.is_primary_contact = $${paramCount}`);
      queryParams.push(isPrimary === 'true');
    }
    
    if (isDecisionMaker !== null) {
      paramCount++;
      whereConditions.push(`cc.is_decision_maker = $${paramCount}`);
      queryParams.push(isDecisionMaker === 'true');
    }
    
    if (relationshipStrength) {
      paramCount++;
      whereConditions.push(`cc.relationship_strength = $${paramCount}`);
      queryParams.push(relationshipStrength);
    }
    
    if (influenceLevel) {
      paramCount++;
      whereConditions.push(`cc.influence_level = $${paramCount}`);
      queryParams.push(influenceLevel);
    }
    
    if (department) {
      paramCount++;
      whereConditions.push(`cc.department ILIKE $${paramCount}`);
      queryParams.push(`%${department}%`);
    }
    
    if (tags.length > 0) {
      paramCount++;
      whereConditions.push(`cc.tags && $${paramCount}`);
      queryParams.push(tags);
    }
    
    if (lastContactAfter) {
      paramCount++;
      whereConditions.push(`cc.last_contact_date >= $${paramCount}`);
      queryParams.push(lastContactAfter);
    }
    
    if (nextFollowUpBefore) {
      paramCount++;
      whereConditions.push(`cc.next_follow_up_date <= $${paramCount}`);
      queryParams.push(nextFollowUpBefore);
    }
    
    if (leadScoreMin) {
      paramCount++;
      whereConditions.push(`cc.lead_score >= $${paramCount}`);
      queryParams.push(parseInt(leadScoreMin));
    }
    
    if (leadScoreMax) {
      paramCount++;
      whereConditions.push(`cc.lead_score <= $${paramCount}`);
      queryParams.push(parseInt(leadScoreMax));
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with customer and reporting hierarchy
    const query = `
      SELECT 
        cc.*,
        c.company_name,
        c.customer_status,
        c.customer_tier,
        c.industry,
        reports_to.first_name as reports_to_first_name,
        reports_to.last_name as reports_to_last_name,
        reports_to.title as reports_to_title
      FROM customer_contacts cc
      LEFT JOIN customers c ON c.id = cc.customer_id
      LEFT JOIN customer_contacts reports_to ON reports_to.id = cc.reports_to_contact_id
      ${whereClause}
      ORDER BY cc.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get interaction counts for each contact if requested
    if (includeInteractions) {
      for (const contact of result.rows) {
        const interactionCountQuery = `
          SELECT 
            COUNT(*) as total_interactions,
            COUNT(*) FILTER (WHERE interaction_date >= CURRENT_DATE - INTERVAL '30 days') as interactions_last_30_days,
            MAX(interaction_date) as last_interaction_date
          FROM customer_interactions
          WHERE tenant_id = $1 AND contact_id = $2
        `;
        
        const interactionResult = await execute_sql(interactionCountQuery, [tenantId, contact.id]);
        contact.interaction_summary = interactionResult.rows[0];
      }
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_contacts cc
      LEFT JOIN customers c ON c.id = cc.customer_id
      LEFT JOIN customer_contacts reports_to ON reports_to.id = cc.reports_to_contact_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
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
      },
      filters: {
        search, customerId, status, isPrimary, isDecisionMaker, relationshipStrength,
        influenceLevel, department, tags, lastContactAfter, nextFollowUpBefore,
        leadScoreMin, leadScoreMax
      }
    });
    
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch contacts',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create contact or bulk operations
export const POST = withStaffPermissions('customers.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (body.action && body.contact_ids) {
      return await handleBulkContactAction(tenantId, body);
    } else {
      return await handleCreateContact(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error creating contact:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create contact',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleCreateContact(tenantId: string, body: any) {
  const validatedData = contactSchema.parse(body);
  
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
  
  // Check for duplicate email within the same customer
  if (validatedData.email) {
    const duplicateCheck = await execute_sql(`
      SELECT id FROM customer_contacts 
      WHERE tenant_id = $1 AND customer_id = $2 AND email = $3
    `, [tenantId, validatedData.customer_id, validatedData.email]);
    
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Contact with this email already exists for this customer'
      }, { status: 409 });
    }
  }
  
  // Validate reports_to_contact_id if provided
  if (validatedData.reports_to_contact_id) {
    const reportsToCheck = await execute_sql(`
      SELECT id FROM customer_contacts 
      WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
    `, [tenantId, validatedData.customer_id, validatedData.reports_to_contact_id]);
    
    if (reportsToCheck.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Reports-to contact not found or belongs to different customer'
      }, { status: 400 });
    }
  }
  
  return await withTransaction(async (client) => {
    // If setting as primary contact, unset existing primary
    if (validatedData.is_primary_contact) {
      await client.query(`
        UPDATE customer_contacts 
        SET is_primary_contact = false, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND customer_id = $2 AND is_primary_contact = true
      `, [tenantId, validatedData.customer_id]);
    }
    
    // Insert contact
    const insertQuery = `
      INSERT INTO customer_contacts (
        tenant_id, customer_id, first_name, last_name, title, department, salutation,
        email, phone, mobile, fax, linkedin_url, is_primary_contact, is_decision_maker,
        is_technical_contact, is_billing_contact, is_executive, reports_to_contact_id,
        relationship_strength, influence_level, communication_frequency, preferred_contact_method,
        email_opt_in, sms_opt_in, marketing_opt_in, newsletter_opt_in, budget_authority,
        areas_of_responsibility, pain_points, interests, last_contact_date, next_follow_up_date,
        lead_score, status, notes, tags, custom_fields, created_by
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
      validatedData.first_name,
      validatedData.last_name,
      validatedData.title || null,
      validatedData.department || null,
      validatedData.salutation || null,
      validatedData.email || null,
      validatedData.phone || null,
      validatedData.mobile || null,
      validatedData.fax || null,
      validatedData.linkedin_url || null,
      validatedData.is_primary_contact,
      validatedData.is_decision_maker,
      validatedData.is_technical_contact,
      validatedData.is_billing_contact,
      validatedData.is_executive,
      validatedData.reports_to_contact_id || null,
      validatedData.relationship_strength,
      validatedData.influence_level,
      validatedData.communication_frequency,
      validatedData.preferred_contact_method,
      validatedData.email_opt_in,
      validatedData.sms_opt_in,
      validatedData.marketing_opt_in,
      validatedData.newsletter_opt_in,
      validatedData.budget_authority || null,
      validatedData.areas_of_responsibility,
      validatedData.pain_points,
      validatedData.interests,
      validatedData.last_contact_date || null,
      validatedData.next_follow_up_date || null,
      validatedData.lead_score,
      validatedData.status,
      validatedData.notes || null,
      validatedData.tags,
      JSON.stringify(validatedData.custom_fields),
      body.created_by || null
    ]);
    
    const newContact = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Contact created successfully',
      data: newContact
    }, { status: 201 });
  });
}

async function handleBulkContactAction(tenantId: string, body: any) {
  const validatedData = bulkContactActionSchema.parse(body);
  
  return await withTransaction(async (client) => {
    let affectedCount = 0;
    const results: any[] = [];
    
    switch (validatedData.action) {
      case 'update_status':
        const newStatus = validatedData.parameters.status;
        if (!['active', 'inactive', 'bounced', 'do_not_contact', 'archived'].includes(newStatus)) {
          throw new Error('Invalid status value');
        }
        
        const statusResult = await client.query(`
          UPDATE customer_contacts 
          SET status = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, first_name, last_name, email, status
        `, [tenantId, validatedData.contact_ids, newStatus]);
        
        affectedCount = statusResult.rowCount;
        results.push(...statusResult.rows);
        break;
        
      case 'assign_tags':
        const tagsToAdd = validatedData.parameters.tags || [];
        if (!Array.isArray(tagsToAdd)) {
          throw new Error('Tags must be an array');
        }
        
        const assignTagsResult = await client.query(`
          UPDATE customer_contacts 
          SET tags = array(SELECT DISTINCT unnest(tags || $3)), updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, first_name, last_name, email, tags
        `, [tenantId, validatedData.contact_ids, tagsToAdd]);
        
        affectedCount = assignTagsResult.rowCount;
        results.push(...assignTagsResult.rows);
        break;
        
      case 'update_opt_ins':
        const emailOptIn = validatedData.parameters.email_opt_in;
        const smsOptIn = validatedData.parameters.sms_opt_in;
        const marketingOptIn = validatedData.parameters.marketing_opt_in;
        
        const updateFields: string[] = [];
        const updateValues: any[] = [tenantId, validatedData.contact_ids];
        let paramCount = 2;
        
        if (emailOptIn !== undefined) {
          paramCount++;
          updateFields.push(`email_opt_in = $${paramCount}`);
          updateValues.push(emailOptIn);
        }
        
        if (smsOptIn !== undefined) {
          paramCount++;
          updateFields.push(`sms_opt_in = $${paramCount}`);
          updateValues.push(smsOptIn);
        }
        
        if (marketingOptIn !== undefined) {
          paramCount++;
          updateFields.push(`marketing_opt_in = $${paramCount}`);
          updateValues.push(marketingOptIn);
        }
        
        if (updateFields.length === 0) {
          throw new Error('No opt-in fields to update');
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        
        const optInResult = await client.query(`
          UPDATE customer_contacts 
          SET ${updateFields.join(', ')}
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, first_name, last_name, email, email_opt_in, sms_opt_in, marketing_opt_in
        `, updateValues);
        
        affectedCount = optInResult.rowCount;
        results.push(...optInResult.rows);
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