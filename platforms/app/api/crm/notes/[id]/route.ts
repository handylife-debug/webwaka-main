import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Note update schema (all fields optional)
const noteUpdateSchema = z.object({
  // Note Classification
  note_type: z.enum(['general', 'sales', 'support', 'meeting', 'call', 'email', 'complaint', 'opportunity', 'follow_up', 'internal']).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  
  // Context & Categorization
  category: z.enum(['general', 'sales', 'support', 'technical', 'billing', 'product', 'feedback', 'partnership', 'compliance']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  
  // Visibility & Access
  visibility: z.enum(['private', 'team', 'department', 'company']).optional(),
  is_confidential: z.boolean().optional(),
  
  // Interaction Context
  interaction_channel: z.enum(['phone', 'email', 'in_person', 'chat', 'video', 'social_media', 'website', 'other']).optional(),
  related_interaction_id: z.string().uuid().optional(),
  meeting_date: z.string().optional(),
  
  // Organization & Follow-up
  is_action_required: z.boolean().optional(),
  action_due_date: z.string().optional(),
  action_description: z.string().max(500).optional(),
  
  // Collaboration
  mentioned_users: z.array(z.string().uuid()).optional(),
  shared_with_customer: z.boolean().optional(),
  
  // Metadata
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.any()).optional(),
  
  // File Attachments
  attachments: z.array(z.object({
    file_name: z.string(),
    file_size: z.number(),
    file_type: z.string(),
    file_url: z.string(),
    uploaded_at: z.string().optional()
  })).optional()
});

// GET - Get specific customer note with detailed information
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const noteId = params.id;
    const { searchParams } = new URL(request.url);
    
    const includeRelatedNotes = searchParams.get('include_related') === 'true';
    const includeInteractions = searchParams.get('include_interactions') === 'true';
    
    // Get note details with customer and author information
    const noteQuery = `
      SELECT 
        cn.*,
        c.company_name as customer_company_name,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        c.customer_tier,
        c.customer_status,
        author.first_name as author_first_name,
        author.last_name as author_last_name,
        author.email as author_email,
        updater.first_name as updated_by_first_name,
        updater.last_name as updated_by_last_name,
        updater.email as updated_by_email
      FROM customer_notes cn
      LEFT JOIN customers c ON c.id = cn.customer_id
      LEFT JOIN users author ON author.id = cn.created_by
      LEFT JOIN users updater ON updater.id = cn.updated_by
      WHERE cn.tenant_id = $1 AND cn.id = $2
    `;
    
    const noteResult = await execute_sql(noteQuery, [tenantId, noteId]);
    
    if (noteResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer note not found'
      }, { status: 404 });
    }
    
    const note = noteResult.rows[0];
    
    // Get mentioned users details if any
    let mentionedUsers = null;
    if (note.mentioned_users && note.mentioned_users.length > 0) {
      const mentionedUsersQuery = `
        SELECT id, first_name, last_name, email, role
        FROM users
        WHERE tenant_id = $1 AND id = ANY($2)
      `;
      
      const mentionedUsersResult = await execute_sql(mentionedUsersQuery, [tenantId, note.mentioned_users]);
      mentionedUsers = mentionedUsersResult.rows;
    }
    
    // Get related notes for the same customer if requested
    let relatedNotes = null;
    if (includeRelatedNotes) {
      const relatedNotesQuery = `
        SELECT 
          id, note_type, title, priority, created_at, 
          author.first_name as author_first_name,
          author.last_name as author_last_name
        FROM customer_notes cn
        LEFT JOIN users author ON author.id = cn.created_by
        WHERE cn.tenant_id = $1 AND cn.customer_id = $2 AND cn.id != $3
        ORDER BY cn.created_at DESC
        LIMIT 10
      `;
      
      const relatedNotesResult = await execute_sql(relatedNotesQuery, [tenantId, note.customer_id, noteId]);
      relatedNotes = relatedNotesResult.rows;
    }
    
    // Get related interactions if requested and note has related_interaction_id
    let relatedInteractions = null;
    if (includeInteractions && note.related_interaction_id) {
      const interactionQuery = `
        SELECT 
          id, interaction_type, subject, interaction_date, outcome,
          sentiment_score, next_action
        FROM customer_interactions
        WHERE tenant_id = $1 AND id = $2
      `;
      
      const interactionResult = await execute_sql(interactionQuery, [tenantId, note.related_interaction_id]);
      if (interactionResult.rows.length > 0) {
        relatedInteractions = interactionResult.rows[0];
      }
    }
    
    // Generate note insights and recommendations
    const insights = {
      note_context: generateNoteContext(note),
      action_status: getActionStatus(note),
      collaboration_summary: getCollaborationSummary(note, mentionedUsers),
      content_analysis: analyzeNoteContent(note),
      recommendations: generateNoteRecommendations(note)
    };
    
    return NextResponse.json({
      success: true,
      data: {
        note,
        mentioned_users: mentionedUsers,
        related_notes: relatedNotes,
        related_interactions: relatedInteractions,
        insights
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer note:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customer note',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update customer note
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const noteId = params.id;
    const body = await request.json();
    const validatedData = noteUpdateSchema.parse(body);
    
    // Check if note exists and belongs to tenant
    const existingNote = await execute_sql(`
      SELECT id, customer_id, note_type, visibility, created_by 
      FROM customer_notes 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, noteId]);
    
    if (existingNote.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer note not found'
      }, { status: 404 });
    }
    
    const note = existingNote.rows[0];
    
    // Validate mentioned users belong to tenant (if updating)
    if (validatedData.mentioned_users && validatedData.mentioned_users.length > 0) {
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
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [tenantId, noteId];
      let paramCount = 2;
      
      Object.entries(validatedData).forEach(([key, value]) => {
        if (value !== undefined) {
          paramCount++;
          if (key === 'tags' || key === 'mentioned_users') {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(value);
          } else if (key === 'custom_fields' || key === 'attachments') {
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
        UPDATE customer_notes 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      const updatedNote = result.rows[0];
      
      return NextResponse.json({
        success: true,
        message: 'Customer note updated successfully',
        data: updatedNote
      });
    });
    
  } catch (error) {
    console.error('Error updating customer note:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update customer note',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete customer note
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const noteId = params.id;
    
    // Check if note exists
    const existingNote = await execute_sql(`
      SELECT 
        cn.id, cn.title, cn.note_type, cn.is_confidential,
        c.company_name as customer_company_name
      FROM customer_notes cn
      LEFT JOIN customers c ON c.id = cn.customer_id
      WHERE cn.tenant_id = $1 AND cn.id = $2
    `, [tenantId, noteId]);
    
    if (existingNote.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer note not found'
      }, { status: 404 });
    }
    
    const note = existingNote.rows[0];
    
    // For confidential notes, require additional confirmation
    if (note.is_confidential) {
      const { searchParams } = new URL(request.url);
      const confirmDelete = searchParams.get('confirm_confidential') === 'true';
      
      if (!confirmDelete) {
        return NextResponse.json({
          success: false,
          message: 'Confidential note deletion requires confirmation',
          details: {
            is_confidential: true,
            note_title: note.title,
            confirmation_required: 'Add ?confirm_confidential=true to delete confidential note'
          }
        }, { status: 409 });
      }
    }
    
    // Delete the note
    await execute_sql('DELETE FROM customer_notes WHERE tenant_id = $1 AND id = $2', [tenantId, noteId]);
    
    return NextResponse.json({
      success: true,
      message: `Customer note '${note.title}' deleted successfully`,
      data: {
        id: noteId,
        title: note.title,
        note_type: note.note_type,
        customer_company_name: note.customer_company_name,
        was_confidential: note.is_confidential
      }
    });
    
  } catch (error) {
    console.error('Error deleting customer note:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete customer note',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper functions for note insights
function generateNoteContext(note: any): any {
  return {
    note_type: note.note_type,
    category: note.category,
    interaction_context: note.interaction_channel ? {
      channel: note.interaction_channel,
      has_related_interaction: !!note.related_interaction_id,
      meeting_scheduled: !!note.meeting_date
    } : null,
    business_context: {
      is_sales_related: ['sales', 'opportunity'].includes(note.note_type),
      is_support_related: ['support', 'complaint'].includes(note.note_type),
      requires_follow_up: note.is_action_required,
      customer_facing: note.shared_with_customer
    }
  };
}

function getActionStatus(note: any): any {
  if (!note.is_action_required) {
    return {
      has_action: false,
      status: 'no_action_required'
    };
  }
  
  const now = new Date();
  const dueDate = note.action_due_date ? new Date(note.action_due_date) : null;
  
  let status = 'pending';
  let urgency = 'normal';
  
  if (dueDate) {
    const timeDiff = dueDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 0) {
      status = 'overdue';
      urgency = 'critical';
    } else if (daysDiff <= 1) {
      status = 'due_soon';
      urgency = 'high';
    } else if (daysDiff <= 3) {
      urgency = 'medium';
    }
  }
  
  return {
    has_action: true,
    status,
    urgency,
    due_date: note.action_due_date,
    description: note.action_description,
    days_until_due: dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
  };
}

function getCollaborationSummary(note: any, mentionedUsers: any[]): any {
  return {
    has_mentions: note.mentioned_users && note.mentioned_users.length > 0,
    mentioned_count: note.mentioned_users ? note.mentioned_users.length : 0,
    mentioned_users: mentionedUsers || [],
    visibility_level: note.visibility,
    is_confidential: note.is_confidential,
    shared_with_customer: note.shared_with_customer
  };
}

function analyzeNoteContent(note: any): any {
  const contentLength = note.content ? note.content.length : 0;
  const wordCount = note.content ? note.content.split(/\s+/).length : 0;
  
  // Simple sentiment indicators based on keywords
  const positiveKeywords = ['successful', 'pleased', 'satisfied', 'excellent', 'great', 'positive', 'happy'];
  const negativeKeywords = ['issue', 'problem', 'complaint', 'dissatisfied', 'concern', 'frustrated', 'angry'];
  
  const content = note.content?.toLowerCase() || '';
  const positiveMatches = positiveKeywords.filter(word => content.includes(word)).length;
  const negativeMatches = negativeKeywords.filter(word => content.includes(word)).length;
  
  let sentiment = 'neutral';
  if (positiveMatches > negativeMatches) {
    sentiment = 'positive';
  } else if (negativeMatches > positiveMatches) {
    sentiment = 'negative';
  }
  
  return {
    content_length: contentLength,
    word_count: wordCount,
    estimated_sentiment: sentiment,
    has_attachments: note.attachments && note.attachments.length > 0,
    attachment_count: note.attachments ? note.attachments.length : 0,
    reading_time_minutes: Math.ceil(wordCount / 200) // Average reading speed
  };
}

function generateNoteRecommendations(note: any): string[] {
  const recommendations: string[] = [];
  
  if (note.is_action_required && !note.action_due_date) {
    recommendations.push('Consider setting a due date for the action item to ensure timely follow-up');
  }
  
  if (note.note_type === 'meeting' && !note.meeting_date) {
    recommendations.push('Add the meeting date to provide better context and timeline tracking');
  }
  
  if (note.priority === 'high' || note.priority === 'urgent') {
    if (!note.mentioned_users || note.mentioned_users.length === 0) {
      recommendations.push('Consider mentioning relevant team members for high-priority notes');
    }
  }
  
  if (note.note_type === 'complaint' && !note.is_action_required) {
    recommendations.push('Complaints typically require follow-up actions - consider adding action items');
  }
  
  if (note.note_type === 'opportunity' && note.visibility === 'private') {
    recommendations.push('Consider sharing opportunity notes with the sales team for better collaboration');
  }
  
  if (note.content && note.content.length < 50) {
    recommendations.push('Consider adding more details to provide better context for future reference');
  }
  
  if (!note.tags || note.tags.length === 0) {
    recommendations.push('Add relevant tags to improve note organization and searchability');
  }
  
  return recommendations;
}