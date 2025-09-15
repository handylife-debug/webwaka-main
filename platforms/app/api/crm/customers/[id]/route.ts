import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Customer update schema
const customerUpdateSchema = z.object({
  // Company Information
  company_name: z.string().min(1).max(200).optional(),
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
  customer_type: z.enum(['prospect', 'lead', 'customer', 'partner', 'vendor', 'inactive']).optional(),
  customer_status: z.enum(['active', 'inactive', 'blacklisted', 'archived']).optional(),
  priority_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  customer_tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'enterprise', 'standard']).optional(),
  
  // Sales Information
  lead_source: z.string().max(100).optional(),
  assigned_sales_rep_id: z.string().uuid().optional(),
  territory: z.string().max(100).optional(),
  
  // Financial Information
  credit_limit: z.number().min(0).optional(),
  payment_terms: z.number().int().min(1).optional(),
  currency_code: z.string().length(3).optional(),
  
  // Relationship Tracking
  acquisition_date: z.string().optional(),
  first_purchase_date: z.string().optional(),
  last_purchase_date: z.string().optional(),
  total_purchase_amount: z.number().min(0).optional(),
  lifetime_value: z.number().min(0).optional(),
  last_contact_date: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  
  // Communication Preferences
  preferred_communication: z.enum(['email', 'phone', 'sms', 'mail', 'in_person']).optional(),
  email_opt_in: z.boolean().optional(),
  sms_opt_in: z.boolean().optional(),
  marketing_opt_in: z.boolean().optional(),
  
  // Additional Information
  description: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.any()).optional(),
  social_media: z.record(z.string()).optional()
});

// GET - Get specific customer with detailed information
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const customerId = id;
    const { searchParams } = new URL(request.url);
    
    const includeContacts = searchParams.get('include_contacts') === 'true';
    const includeInteractions = searchParams.get('include_interactions') === 'true';
    const includeAddresses = searchParams.get('include_addresses') === 'true';
    const includeSegments = searchParams.get('include_segments') === 'true';
    const includeDocuments = searchParams.get('include_documents') === 'true';
    const includeNotes = searchParams.get('include_notes') === 'true';
    const includeAnalytics = searchParams.get('include_analytics') === 'true';
    
    // Get customer details with sales rep information
    const customerQuery = `
      SELECT 
        c.*,
        sr.first_name as sales_rep_first_name,
        sr.last_name as sales_rep_last_name,
        sr.email as sales_rep_email,
        sr.phone as sales_rep_phone,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM customers c
      LEFT JOIN users sr ON sr.id = c.assigned_sales_rep_id
      LEFT JOIN users creator ON creator.id = c.created_by
      WHERE c.tenant_id = $1 AND c.id = $2
    `;
    
    const customerResult = await execute_sql(customerQuery, [tenantId, customerId]);
    
    if (customerResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found'
      }, { status: 404 });
    }
    
    const customer = customerResult.rows[0];
    
    // Get contacts if requested
    let contacts = null;
    if (includeContacts) {
      const contactsQuery = `
        SELECT 
          id, first_name, last_name, title, department, email, phone, mobile,
          is_primary_contact, is_decision_maker, is_technical_contact, is_billing_contact,
          relationship_strength, influence_level, status, last_contact_date, next_follow_up_date
        FROM customer_contacts
        WHERE tenant_id = $1 AND customer_id = $2 AND status = 'active'
        ORDER BY is_primary_contact DESC, is_decision_maker DESC, last_name, first_name
      `;
      
      const contactsResult = await execute_sql(contactsQuery, [tenantId, customerId]);
      contacts = contactsResult.rows;
    }
    
    // Get recent interactions if requested
    let interactions = null;
    if (includeInteractions) {
      const interactionsQuery = `
        SELECT 
          ci.id, ci.interaction_type, ci.interaction_subtype, ci.direction, ci.subject,
          ci.interaction_date, ci.duration_minutes, ci.outcome, ci.sentiment,
          ci.follow_up_required, ci.follow_up_date, ci.status,
          cc.first_name as contact_first_name, cc.last_name as contact_last_name,
          u.first_name as handled_by_first_name, u.last_name as handled_by_last_name
        FROM customer_interactions ci
        LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
        LEFT JOIN users u ON u.id = ci.handled_by_user_id
        WHERE ci.tenant_id = $1 AND ci.customer_id = $2
        ORDER BY ci.interaction_date DESC
        LIMIT 20
      `;
      
      const interactionsResult = await execute_sql(interactionsQuery, [tenantId, customerId]);
      interactions = interactionsResult.rows;
    }
    
    // Get addresses if requested
    let addresses = null;
    if (includeAddresses) {
      const addressesQuery = `
        SELECT 
          id, address_type, address_label, company_name, attention_to,
          address_line_1, address_line_2, city, state_province, postal_code, country,
          phone, email, is_primary, is_billing_default, is_shipping_default,
          is_verified, status
        FROM customer_addresses
        WHERE tenant_id = $1 AND customer_id = $2 AND status = 'active'
        ORDER BY is_primary DESC, is_billing_default DESC, address_type
      `;
      
      const addressesResult = await execute_sql(addressesQuery, [tenantId, customerId]);
      addresses = addressesResult.rows;
    }
    
    // Get customer segments if requested
    let segments = null;
    if (includeSegments) {
      const segmentsQuery = `
        SELECT 
          cs.id, cs.segment_name, cs.segment_code, cs.description, cs.color_hex,
          csm.relevance_score, csm.assigned_method, csm.assigned_date, csm.priority_level
        FROM customer_segment_memberships csm
        JOIN customer_segments cs ON cs.id = csm.segment_id
        WHERE csm.tenant_id = $1 AND csm.customer_id = $2 AND csm.status = 'active'
        ORDER BY csm.relevance_score DESC NULLS LAST, cs.segment_name
      `;
      
      const segmentsResult = await execute_sql(segmentsQuery, [tenantId, customerId]);
      segments = segmentsResult.rows;
    }
    
    // Get documents if requested
    let documents = null;
    if (includeDocuments) {
      const documentsQuery = `
        SELECT 
          id, document_type, title, file_name, file_size_bytes, version,
          visibility, is_signed, signed_date, folder_path, created_at,
          creator.first_name as created_by_first_name, creator.last_name as created_by_last_name
        FROM customer_documents cd
        LEFT JOIN users creator ON creator.id = cd.created_by
        WHERE cd.tenant_id = $1 AND cd.customer_id = $2 AND cd.status = 'active'
        ORDER BY cd.created_at DESC
        LIMIT 10
      `;
      
      const documentsResult = await execute_sql(documentsQuery, [tenantId, customerId]);
      documents = documentsResult.rows;
    }
    
    // Get notes if requested
    let notes = null;
    if (includeNotes) {
      const notesQuery = `
        SELECT 
          cn.id, cn.note_type, cn.title, cn.content, cn.priority, cn.is_pinned,
          cn.is_action_required, cn.action_due_date, cn.created_at,
          creator.first_name as created_by_first_name, creator.last_name as created_by_last_name,
          cc.first_name as contact_first_name, cc.last_name as contact_last_name
        FROM customer_notes cn
        LEFT JOIN users creator ON creator.id = cn.created_by
        LEFT JOIN customer_contacts cc ON cc.id = cn.contact_id
        WHERE cn.tenant_id = $1 AND cn.customer_id = $2 AND cn.status = 'active'
        ORDER BY cn.is_pinned DESC, cn.created_at DESC
        LIMIT 15
      `;
      
      const notesResult = await execute_sql(notesQuery, [tenantId, customerId]);
      notes = notesResult.rows;
    }
    
    // Get customer analytics if requested
    let analytics: any = null;
    if (includeAnalytics) {
      const analyticsQuery = `
        SELECT 
          COUNT(ci.id) as total_interactions,
          COUNT(ci.id) FILTER (WHERE ci.interaction_date >= CURRENT_DATE - INTERVAL '30 days') as interactions_last_30_days,
          COUNT(ci.id) FILTER (WHERE ci.direction = 'inbound') as inbound_interactions,
          COUNT(ci.id) FILTER (WHERE ci.direction = 'outbound') as outbound_interactions,
          COUNT(ci.id) FILTER (WHERE ci.sentiment IN ('positive', 'very_positive')) as positive_interactions,
          COUNT(cc.id) as total_contacts,
          COUNT(cc.id) FILTER (WHERE cc.status = 'active') as active_contacts,
          COUNT(ca.id) as total_addresses,
          COUNT(cd.id) as total_documents,
          COUNT(cn.id) as total_notes,
          COUNT(csm.id) as segment_memberships,
          MAX(ci.interaction_date) as last_interaction_date,
          AVG(ci.duration_minutes) FILTER (WHERE ci.duration_minutes IS NOT NULL) as avg_interaction_duration
        FROM customers c
        LEFT JOIN customer_interactions ci ON ci.customer_id = c.id AND ci.tenant_id = c.tenant_id
        LEFT JOIN customer_contacts cc ON cc.customer_id = c.id AND cc.tenant_id = c.tenant_id
        LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.tenant_id = c.tenant_id
        LEFT JOIN customer_documents cd ON cd.customer_id = c.id AND cd.tenant_id = c.tenant_id
        LEFT JOIN customer_notes cn ON cn.customer_id = c.id AND cn.tenant_id = c.tenant_id
        LEFT JOIN customer_segment_memberships csm ON csm.customer_id = c.id AND csm.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1 AND c.id = $2
        GROUP BY c.id
      `;
      
      const analyticsResult = await execute_sql(analyticsQuery, [tenantId, customerId]);
      analytics = analyticsResult.rows[0];
      
      // Convert string numbers to proper types
      Object.keys(analytics).forEach(key => {
        if (analytics[key] !== null && !isNaN(analytics[key])) {
          analytics[key] = parseFloat(analytics[key]);
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        customer,
        contacts,
        interactions,
        addresses,
        segments,
        documents,
        notes,
        analytics
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update customer
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const customerId = id;
    const body = await request.json();
    const validatedData = customerUpdateSchema.parse(body);
    
    // Check if customer exists and belongs to tenant
    const existingCustomer = await execute_sql(`
      SELECT id, company_name, customer_status FROM customers 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, customerId]);
    
    if (existingCustomer.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found'
      }, { status: 404 });
    }
    
    // Check for duplicate company name if changing
    if (validatedData.company_name) {
      const duplicateCheck = await execute_sql(`
        SELECT id FROM customers 
        WHERE tenant_id = $1 AND company_name = $2 AND id != $3
      `, [tenantId, validatedData.company_name, customerId]);
      
      if (duplicateCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Company name already exists'
        }, { status: 409 });
      }
    }
    
    // Validate assigned sales rep if provided
    if (validatedData.assigned_sales_rep_id !== undefined) {
      if (validatedData.assigned_sales_rep_id === null) {
        // Allow null to unassign
      } else {
        const salesRepCheck = await execute_sql(`
          SELECT u.id FROM users u
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
    }
    
    return await withTransaction(async (client) => {
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [tenantId, customerId];
      let paramCount = 2;
      
      Object.entries(validatedData).forEach(([key, value]) => {
        if (value !== undefined) {
          paramCount++;
          if (['custom_fields', 'social_media'].includes(key)) {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(value);
          }
        }
      });
      
      if (updateFields.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No fields to update'
        }, { status: 400 });
      }
      
      // Add updated_by and updated_at
      paramCount++;
      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(body.updated_by || null);
      
      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date().toISOString());
      
      const updateQuery = `
        UPDATE customers 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      const updatedCustomer = result.rows[0];
      
      return NextResponse.json({
        success: true,
        message: 'Customer updated successfully',
        data: updatedCustomer
      });
    });
    
  } catch (error) {
    console.error('Error updating customer:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete customer (with safety checks)
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const customerId = id;
    const { searchParams } = new URL(request.url);
    const forceDelete = searchParams.get('force') === 'true';
    
    // Check if customer exists
    const existingCustomer = await execute_sql(`
      SELECT id, company_name, customer_status FROM customers 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, customerId]);
    
    if (existingCustomer.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found'
      }, { status: 404 });
    }
    
    const customer = existingCustomer.rows[0];
    
    // Check for dependencies if not force delete
    if (!forceDelete) {
      const dependenciesCheck = await execute_sql(`
        SELECT 
          (SELECT COUNT(*) FROM customer_contacts WHERE customer_id = $2) as contacts_count,
          (SELECT COUNT(*) FROM customer_interactions WHERE customer_id = $2) as interactions_count,
          (SELECT COUNT(*) FROM customer_addresses WHERE customer_id = $2) as addresses_count,
          (SELECT COUNT(*) FROM customer_documents WHERE customer_id = $2) as documents_count,
          (SELECT COUNT(*) FROM customer_notes WHERE customer_id = $2) as notes_count,
          (SELECT COUNT(*) FROM customer_segment_memberships WHERE customer_id = $2) as segments_count
      `, [tenantId, customerId]);
      
      const deps = dependenciesCheck.rows[0];
      const totalDependencies = Object.values(deps).reduce((sum: number, count: any) => sum + parseInt(count), 0);
      
      if (totalDependencies > 0) {
        return NextResponse.json({
          success: false,
          message: 'Customer has associated data and cannot be deleted. Use force=true to delete all associated data.',
          dependencies: deps
        }, { status: 409 });
      }
    }
    
    return await withTransaction(async (client) => {
      if (forceDelete) {
        // Delete all associated data in correct order
        await client.query('DELETE FROM customer_segment_memberships WHERE tenant_id = $1 AND customer_id = $2', [tenantId, customerId]);
        await client.query('DELETE FROM customer_documents WHERE tenant_id = $1 AND customer_id = $2', [tenantId, customerId]);
        await client.query('DELETE FROM customer_notes WHERE tenant_id = $1 AND customer_id = $2', [tenantId, customerId]);
        await client.query('DELETE FROM customer_interactions WHERE tenant_id = $1 AND customer_id = $2', [tenantId, customerId]);
        await client.query('DELETE FROM customer_addresses WHERE tenant_id = $1 AND customer_id = $2', [tenantId, customerId]);
        await client.query('DELETE FROM customer_contacts WHERE tenant_id = $1 AND customer_id = $2', [tenantId, customerId]);
      }
      
      // Delete the customer
      await client.query('DELETE FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, customerId]);
      
      return NextResponse.json({
        success: true,
        message: `Customer '${customer.company_name}' deleted successfully${forceDelete ? ' (including all associated data)' : ''}`,
        data: {
          id: customerId,
          company_name: customer.company_name,
          force_delete: forceDelete
        }
      });
    });
    
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});