import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Contact update schema (all fields optional)
const contactUpdateSchema = z.object({
  // Personal Information
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
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
  is_primary_contact: z.boolean().optional(),
  is_decision_maker: z.boolean().optional(),
  is_technical_contact: z.boolean().optional(),
  is_billing_contact: z.boolean().optional(),
  is_executive: z.boolean().optional(),
  reports_to_contact_id: z.string().uuid().optional(),
  
  // Relationship & Influence
  relationship_strength: z.enum(['weak', 'moderate', 'strong', 'champion']).optional(),
  influence_level: z.enum(['low', 'medium', 'high', 'decision_maker']).optional(),
  communication_frequency: z.enum(['never', 'rarely', 'monthly', 'weekly', 'daily']).optional(),
  preferred_contact_method: z.enum(['email', 'phone', 'sms', 'linkedin', 'in_person']).optional(),
  
  // Communication Preferences
  email_opt_in: z.boolean().optional(),
  sms_opt_in: z.boolean().optional(),
  marketing_opt_in: z.boolean().optional(),
  newsletter_opt_in: z.boolean().optional(),
  
  // Business Context
  budget_authority: z.number().min(0).optional(),
  areas_of_responsibility: z.array(z.string()).optional(),
  pain_points: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  
  // Activity Tracking
  last_contact_date: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  lead_score: z.number().min(0).max(100).optional(),
  
  // Status & Notes
  status: z.enum(['active', 'inactive', 'bounced', 'do_not_contact', 'archived']).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.any()).optional()
});

// GET - Get specific contact with detailed information
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const contactId = id;
    const { searchParams } = new URL(request.url);
    
    const includeInteractions = searchParams.get('include_interactions') === 'true';
    const includeDirectReports = searchParams.get('include_direct_reports') === 'true';
    const includeAnalytics = searchParams.get('include_analytics') === 'true';
    
    // Get contact details with customer and reporting hierarchy
    const contactQuery = `
      SELECT 
        cc.*,
        c.company_name,
        c.customer_status,
        c.customer_tier,
        c.industry,
        c.assigned_sales_rep_id,
        reports_to.first_name as reports_to_first_name,
        reports_to.last_name as reports_to_last_name,
        reports_to.title as reports_to_title,
        reports_to.email as reports_to_email,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM customer_contacts cc
      LEFT JOIN customers c ON c.id = cc.customer_id
      LEFT JOIN customer_contacts reports_to ON reports_to.id = cc.reports_to_contact_id
      LEFT JOIN users creator ON creator.id = cc.created_by
      WHERE cc.tenant_id = $1 AND cc.id = $2
    `;
    
    const contactResult = await execute_sql(contactQuery, [tenantId, contactId]);
    
    if (contactResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Contact not found'
      }, { status: 404 });
    }
    
    const contact = contactResult.rows[0];
    
    // Get recent interactions if requested
    let interactions = null;
    if (includeInteractions) {
      const interactionsQuery = `
        SELECT 
          ci.id, ci.interaction_type, ci.interaction_subtype, ci.direction, ci.subject,
          ci.interaction_date, ci.duration_minutes, ci.outcome, ci.sentiment,
          ci.follow_up_required, ci.follow_up_date, ci.status, ci.summary,
          u.first_name as handled_by_first_name, u.last_name as handled_by_last_name
        FROM customer_interactions ci
        LEFT JOIN users u ON u.id = ci.handled_by_user_id
        WHERE ci.tenant_id = $1 AND ci.contact_id = $2
        ORDER BY ci.interaction_date DESC
        LIMIT 20
      `;
      
      const interactionsResult = await execute_sql(interactionsQuery, [tenantId, contactId]);
      interactions = interactionsResult.rows;
    }
    
    // Get direct reports if requested
    let directReports = null;
    if (includeDirectReports) {
      const directReportsQuery = `
        SELECT 
          id, first_name, last_name, title, department, email, phone, mobile,
          is_decision_maker, relationship_strength, influence_level, status
        FROM customer_contacts
        WHERE tenant_id = $1 AND reports_to_contact_id = $2 AND status = 'active'
        ORDER BY last_name, first_name
      `;
      
      const directReportsResult = await execute_sql(directReportsQuery, [tenantId, contactId]);
      directReports = directReportsResult.rows;
    }
    
    // Get contact analytics if requested
    let analytics: any = null;
    if (includeAnalytics) {
      const analyticsQuery = `
        SELECT 
          COUNT(ci.id) as total_interactions,
          COUNT(ci.id) FILTER (WHERE ci.interaction_date >= CURRENT_DATE - INTERVAL '30 days') as interactions_last_30_days,
          COUNT(ci.id) FILTER (WHERE ci.direction = 'inbound') as inbound_interactions,
          COUNT(ci.id) FILTER (WHERE ci.direction = 'outbound') as outbound_interactions,
          COUNT(ci.id) FILTER (WHERE ci.sentiment IN ('positive', 'very_positive')) as positive_interactions,
          COUNT(ci.id) FILTER (WHERE ci.sentiment IN ('negative', 'very_negative')) as negative_interactions,
          AVG(ci.duration_minutes) FILTER (WHERE ci.duration_minutes IS NOT NULL) as avg_interaction_duration,
          MAX(ci.interaction_date) as last_interaction_date,
          COUNT(ci.id) FILTER (WHERE ci.follow_up_required = true AND ci.follow_up_date IS NOT NULL) as pending_follow_ups
        FROM customer_interactions ci
        WHERE ci.tenant_id = $1 AND ci.contact_id = $2
      `;
      
      const analyticsResult = await execute_sql(analyticsQuery, [tenantId, contactId]);
      analytics = analyticsResult.rows[0];
      
      // Convert string numbers to proper types
      Object.keys(analytics).forEach(key => {
        if (analytics[key] !== null && !isNaN(analytics[key])) {
          analytics[key] = parseFloat(analytics[key]);
        }
      });
      
      // Calculate engagement score based on interactions and relationship strength
      const interactionScore = Math.min((analytics.interactions_last_30_days / 5) * 25, 25); // Max 25 points
      const relationshipScoreMap = {
        'weak': 10,
        'moderate': 20,
        'strong': 30,
        'champion': 40
      } as const;
      const relationshipScore = relationshipScoreMap[contact.relationship_strength as keyof typeof relationshipScoreMap] || 20;
      
      const influenceScoreMap = {
        'low': 5,
        'medium': 10,
        'high': 15,
        'decision_maker': 20
      } as const;
      const influenceScore = influenceScoreMap[contact.influence_level as keyof typeof influenceScoreMap] || 10;
      
      analytics.engagement_score = Math.round(interactionScore + relationshipScore + influenceScore + contact.lead_score * 0.15);
      analytics.sentiment_ratio = analytics.total_interactions > 0 
        ? (analytics.positive_interactions / analytics.total_interactions) * 100 
        : 0;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        contact,
        interactions,
        direct_reports: directReports,
        analytics
      }
    });
    
  } catch (error) {
    console.error('Error fetching contact:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch contact',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update contact
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const contactId = id;
    const body = await request.json();
    const validatedData = contactUpdateSchema.parse(body);
    
    // Check if contact exists and belongs to tenant
    const existingContact = await execute_sql(`
      SELECT id, customer_id, first_name, last_name, is_primary_contact FROM customer_contacts 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, contactId]);
    
    if (existingContact.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Contact not found'
      }, { status: 404 });
    }
    
    const contact = existingContact.rows[0];
    
    // Check for duplicate email if changing email
    if (validatedData.email) {
      const duplicateCheck = await execute_sql(`
        SELECT id FROM customer_contacts 
        WHERE tenant_id = $1 AND customer_id = $2 AND email = $3 AND id != $4
      `, [tenantId, contact.customer_id, validatedData.email, contactId]);
      
      if (duplicateCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Contact with this email already exists for this customer'
        }, { status: 409 });
      }
    }
    
    // Validate reports_to_contact_id if provided
    if (validatedData.reports_to_contact_id !== undefined) {
      if (validatedData.reports_to_contact_id === null) {
        // Allow null to clear reporting relationship
      } else if (validatedData.reports_to_contact_id === contactId) {
        return NextResponse.json({
          success: false,
          message: 'Contact cannot report to themselves'
        }, { status: 400 });
      } else {
        const reportsToCheck = await execute_sql(`
          SELECT id FROM customer_contacts 
          WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
        `, [tenantId, contact.customer_id, validatedData.reports_to_contact_id]);
        
        if (reportsToCheck.rows.length === 0) {
          return NextResponse.json({
            success: false,
            message: 'Reports-to contact not found or belongs to different customer'
          }, { status: 400 });
        }
      }
    }
    
    return await withTransaction(async (client) => {
      // If setting as primary contact, unset existing primary
      if (validatedData.is_primary_contact === true) {
        await client.query(`
          UPDATE customer_contacts 
          SET is_primary_contact = false, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND customer_id = $2 AND is_primary_contact = true AND id != $3
        `, [tenantId, contact.customer_id, contactId]);
      }
      
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [tenantId, contactId];
      let paramCount = 2;
      
      Object.entries(validatedData).forEach(([key, value]) => {
        if (value !== undefined) {
          paramCount++;
          if (['areas_of_responsibility', 'pain_points', 'interests', 'tags'].includes(key)) {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(value);
          } else if (key === 'custom_fields') {
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
        UPDATE customer_contacts 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      const updatedContact = result.rows[0];
      
      return NextResponse.json({
        success: true,
        message: 'Contact updated successfully',
        data: updatedContact
      });
    });
    
  } catch (error) {
    console.error('Error updating contact:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update contact',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete contact (with safety checks)
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const contactId = id;
    const { searchParams } = new URL(request.url);
    const forceDelete = searchParams.get('force') === 'true';
    
    // Check if contact exists
    const existingContact = await execute_sql(`
      SELECT 
        cc.id, cc.first_name, cc.last_name, cc.is_primary_contact,
        c.company_name
      FROM customer_contacts cc
      JOIN customers c ON c.id = cc.customer_id
      WHERE cc.tenant_id = $1 AND cc.id = $2
    `, [tenantId, contactId]);
    
    if (existingContact.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Contact not found'
      }, { status: 404 });
    }
    
    const contact = existingContact.rows[0];
    
    // Check for dependencies if not force delete
    if (!forceDelete) {
      const dependenciesCheck = await execute_sql(`
        SELECT 
          (SELECT COUNT(*) FROM customer_interactions WHERE contact_id = $2) as interactions_count,
          (SELECT COUNT(*) FROM customer_contacts WHERE reports_to_contact_id = $2) as direct_reports_count
      `, [tenantId, contactId]);
      
      const deps = dependenciesCheck.rows[0];
      const totalDependencies = Object.values(deps).reduce((sum: number, count: any) => sum + parseInt(count), 0);
      
      if (totalDependencies > 0) {
        return NextResponse.json({
          success: false,
          message: 'Contact has associated data and cannot be deleted. Use force=true to delete all associated data.',
          dependencies: deps
        }, { status: 409 });
      }
    }
    
    return await withTransaction(async (client) => {
      if (forceDelete) {
        // Clear reporting relationships
        await client.query(
          'UPDATE customer_contacts SET reports_to_contact_id = NULL WHERE tenant_id = $1 AND reports_to_contact_id = $2',
          [tenantId, contactId]
        );
        
        // Delete interactions
        await client.query(
          'DELETE FROM customer_interactions WHERE tenant_id = $1 AND contact_id = $2',
          [tenantId, contactId]
        );
      }
      
      // Delete the contact
      await client.query('DELETE FROM customer_contacts WHERE tenant_id = $1 AND id = $2', [tenantId, contactId]);
      
      return NextResponse.json({
        success: true,
        message: `Contact '${contact.first_name} ${contact.last_name}' deleted successfully${forceDelete ? ' (including all associated data)' : ''}`,
        data: {
          id: contactId,
          name: `${contact.first_name} ${contact.last_name}`,
          company: contact.company_name,
          was_primary: contact.is_primary_contact,
          force_delete: forceDelete
        }
      });
    });
    
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete contact',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});