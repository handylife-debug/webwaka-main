import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Interaction update schema (all fields optional)
const interactionUpdateSchema = z.object({
  // Interaction Classification
  interaction_type: z.enum(['call', 'email', 'meeting', 'demo', 'presentation', 'support', 'social', 'event', 'other']).optional(),
  interaction_subtype: z.string().max(100).optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  channel: z.enum(['phone', 'email', 'in_person', 'video_call', 'web_chat', 'social_media', 'text_message', 'other']).optional(),
  
  // Content & Details
  subject: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).optional(),
  detailed_notes: z.string().optional(),
  
  // Timing & Duration
  interaction_date: z.string().optional(),
  duration_minutes: z.number().min(0).optional(),
  
  // Participants & Context
  handled_by_user_id: z.string().uuid().optional(),
  participants: z.array(z.string()).optional(),
  location: z.string().max(200).optional(),
  meeting_url: z.string().url().max(500).optional(),
  
  // Outcome & Follow-up
  outcome: z.enum(['successful', 'neutral', 'unsuccessful', 'no_contact', 'rescheduled', 'cancelled']).optional(),
  sentiment: z.enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']).optional(),
  next_steps: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().optional(),
  follow_up_type: z.string().max(100).optional(),
  
  // Business Impact
  opportunity_stage: z.enum(['awareness', 'interest', 'consideration', 'intent', 'evaluation', 'purchase', 'retention', 'advocacy']).optional(),
  deal_value_discussed: z.number().min(0).optional(),
  products_discussed: z.array(z.string()).optional(),
  pain_points_identified: z.array(z.string()).optional(),
  competitive_mentions: z.array(z.string()).optional(),
  
  // Quality & Performance
  interaction_quality: z.enum(['excellent', 'good', 'average', 'poor', 'very_poor']).optional(),
  objectives_met: z.boolean().optional(),
  customer_satisfaction: z.number().min(1).max(5).optional(),
  
  // Tracking & Analysis
  campaign_id: z.string().uuid().optional(),
  lead_source: z.string().max(100).optional(),
  touchpoint_sequence: z.number().int().min(1).optional(),
  
  // Status & Metadata
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.any()).optional()
});

// GET - Get specific interaction with detailed information
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const interactionId = params.id;
    const { searchParams } = new URL(request.url);
    
    const includeRelatedInteractions = searchParams.get('include_related') === 'true';
    const includeFollowUps = searchParams.get('include_follow_ups') === 'true';
    
    // Get interaction details with customer, contact, and user information
    const interactionQuery = `
      SELECT 
        ci.*,
        c.company_name,
        c.customer_status,
        c.customer_tier,
        c.industry,
        cc.first_name as contact_first_name,
        cc.last_name as contact_last_name,
        cc.title as contact_title,
        cc.email as contact_email,
        cc.phone as contact_phone,
        cc.is_primary_contact,
        cc.is_decision_maker,
        u.first_name as handled_by_first_name,
        u.last_name as handled_by_last_name,
        u.email as handled_by_email,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM customer_interactions ci
      LEFT JOIN customers c ON c.id = ci.customer_id
      LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
      LEFT JOIN users u ON u.id = ci.handled_by_user_id
      LEFT JOIN users creator ON creator.id = ci.created_by
      WHERE ci.tenant_id = $1 AND ci.id = $2
    `;
    
    const interactionResult = await execute_sql(interactionQuery, [tenantId, interactionId]);
    
    if (interactionResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Interaction not found'
      }, { status: 404 });
    }
    
    const interaction = interactionResult.rows[0];
    
    // Get related interactions with the same customer/contact if requested
    let relatedInteractions = null;
    if (includeRelatedInteractions) {
      const relatedQuery = `
        SELECT 
          ci.id, ci.interaction_type, ci.direction, ci.subject, ci.interaction_date,
          ci.outcome, ci.sentiment, ci.duration_minutes,
          cc.first_name as contact_first_name, cc.last_name as contact_last_name
        FROM customer_interactions ci
        LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
        WHERE ci.tenant_id = $1 
          AND ci.customer_id = $2 
          AND ci.id != $3
          AND (
            ci.contact_id = $4 
            OR ($4 IS NULL AND ci.contact_id IS NULL)
          )
        ORDER BY ci.interaction_date DESC
        LIMIT 10
      `;
      
      const relatedResult = await execute_sql(relatedQuery, [
        tenantId, 
        interaction.customer_id, 
        interactionId, 
        interaction.contact_id
      ]);
      relatedInteractions = relatedResult.rows;
    }
    
    // Get follow-up interactions if requested
    let followUpInteractions = null;
    if (includeFollowUps && interaction.follow_up_required) {
      const followUpQuery = `
        SELECT 
          ci.id, ci.interaction_type, ci.direction, ci.subject, ci.interaction_date,
          ci.outcome, ci.sentiment, ci.status
        FROM customer_interactions ci
        WHERE ci.tenant_id = $1 
          AND ci.customer_id = $2
          AND ci.interaction_date > $3
          AND ci.id != $4
        ORDER BY ci.interaction_date ASC
        LIMIT 5
      `;
      
      const followUpResult = await execute_sql(followUpQuery, [
        tenantId,
        interaction.customer_id,
        interaction.interaction_date,
        interactionId
      ]);
      followUpInteractions = followUpResult.rows;
    }
    
    // Calculate interaction context and insights
    const insights = {
      is_overdue_follow_up: interaction.follow_up_required && 
                           interaction.follow_up_date && 
                           new Date(interaction.follow_up_date) < new Date(),
      
      days_since_interaction: Math.floor((new Date().getTime() - new Date(interaction.interaction_date).getTime()) / (1000 * 60 * 60 * 24)),
      
      interaction_score: calculateInteractionScore(interaction),
      
      next_recommended_action: getNextRecommendedAction(interaction),
      
      relationship_impact: getRelationshipImpact(interaction)
    };
    
    return NextResponse.json({
      success: true,
      data: {
        interaction,
        related_interactions: relatedInteractions,
        follow_up_interactions: followUpInteractions,
        insights
      }
    });
    
  } catch (error) {
    console.error('Error fetching interaction:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch interaction',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update interaction
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const interactionId = params.id;
    const body = await request.json();
    const validatedData = interactionUpdateSchema.parse(body);
    
    // Check if interaction exists and belongs to tenant
    const existingInteraction = await execute_sql(`
      SELECT id, customer_id, contact_id, interaction_date FROM customer_interactions 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, interactionId]);
    
    if (existingInteraction.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Interaction not found'
      }, { status: 404 });
    }
    
    const interaction = existingInteraction.rows[0];
    
    // Validate handled_by_user if provided
    if (validatedData.handled_by_user_id !== undefined) {
      if (validatedData.handled_by_user_id === null) {
        // Allow null to unassign
      } else {
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
    }
    
    return await withTransaction(async (client) => {
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [tenantId, interactionId];
      let paramCount = 2;
      
      Object.entries(validatedData).forEach(([key, value]) => {
        if (value !== undefined) {
          paramCount++;
          if (['participants', 'products_discussed', 'pain_points_identified', 'competitive_mentions', 'tags'].includes(key)) {
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
        UPDATE customer_interactions 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      const updatedInteraction = result.rows[0];
      
      // Update contact's last contact date if interaction date changed
      if (validatedData.interaction_date && interaction.contact_id) {
        await client.query(`
          UPDATE customer_contacts 
          SET last_contact_date = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = $2
        `, [tenantId, interaction.contact_id, validatedData.interaction_date]);
      }
      
      // Update customer's last contact date if interaction date changed
      if (validatedData.interaction_date) {
        await client.query(`
          UPDATE customers 
          SET last_contact_date = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = $2
        `, [tenantId, interaction.customer_id, validatedData.interaction_date]);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Interaction updated successfully',
        data: updatedInteraction
      });
    });
    
  } catch (error) {
    console.error('Error updating interaction:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update interaction',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete interaction
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const interactionId = params.id;
    
    // Check if interaction exists
    const existingInteraction = await execute_sql(`
      SELECT 
        ci.id, ci.subject, ci.interaction_date, ci.interaction_type,
        c.company_name,
        cc.first_name as contact_first_name, cc.last_name as contact_last_name
      FROM customer_interactions ci
      LEFT JOIN customers c ON c.id = ci.customer_id
      LEFT JOIN customer_contacts cc ON cc.id = ci.contact_id
      WHERE ci.tenant_id = $1 AND ci.id = $2
    `, [tenantId, interactionId]);
    
    if (existingInteraction.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Interaction not found'
      }, { status: 404 });
    }
    
    const interaction = existingInteraction.rows[0];
    
    // Delete the interaction
    await execute_sql('DELETE FROM customer_interactions WHERE tenant_id = $1 AND id = $2', [tenantId, interactionId]);
    
    return NextResponse.json({
      success: true,
      message: `Interaction '${interaction.subject}' deleted successfully`,
      data: {
        id: interactionId,
        subject: interaction.subject,
        interaction_type: interaction.interaction_type,
        interaction_date: interaction.interaction_date,
        company_name: interaction.company_name,
        contact_name: interaction.contact_first_name && interaction.contact_last_name 
          ? `${interaction.contact_first_name} ${interaction.contact_last_name}`
          : null
      }
    });
    
  } catch (error) {
    console.error('Error deleting interaction:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete interaction',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper functions for interaction insights
function calculateInteractionScore(interaction: any): number {
  let score = 50; // Base score
  
  // Outcome impact
  const outcomeScores = {
    'successful': 20,
    'neutral': 0,
    'unsuccessful': -15,
    'no_contact': -10,
    'rescheduled': -5,
    'cancelled': -10
  };
  score += outcomeScores[interaction.outcome] || 0;
  
  // Sentiment impact
  const sentimentScores = {
    'very_positive': 20,
    'positive': 10,
    'neutral': 0,
    'negative': -10,
    'very_negative': -20
  };
  score += sentimentScores[interaction.sentiment] || 0;
  
  // Quality impact
  const qualityScores = {
    'excellent': 15,
    'good': 10,
    'average': 0,
    'poor': -10,
    'very_poor': -15
  };
  score += qualityScores[interaction.interaction_quality] || 0;
  
  // Objectives met bonus
  if (interaction.objectives_met) {
    score += 10;
  }
  
  // Customer satisfaction impact
  if (interaction.customer_satisfaction) {
    score += (interaction.customer_satisfaction - 3) * 5; // -10 to +10 based on 1-5 scale
  }
  
  return Math.max(0, Math.min(100, score));
}

function getNextRecommendedAction(interaction: any): string {
  if (interaction.follow_up_required && interaction.follow_up_date) {
    const followUpDate = new Date(interaction.follow_up_date);
    const today = new Date();
    
    if (followUpDate < today) {
      return 'Overdue follow-up required';
    } else if (followUpDate <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      return 'Follow-up due within 7 days';
    } else {
      return 'Scheduled follow-up planned';
    }
  }
  
  if (interaction.sentiment === 'negative' || interaction.sentiment === 'very_negative') {
    return 'Address concerns and improve relationship';
  }
  
  if (interaction.outcome === 'successful' && interaction.sentiment === 'positive') {
    return 'Consider advancing to next stage';
  }
  
  if (interaction.outcome === 'no_contact') {
    return 'Retry contact with different approach';
  }
  
  return 'Monitor and continue engagement';
}

function getRelationshipImpact(interaction: any): 'positive' | 'neutral' | 'negative' {
  if (interaction.sentiment === 'positive' || interaction.sentiment === 'very_positive') {
    return 'positive';
  }
  
  if (interaction.sentiment === 'negative' || interaction.sentiment === 'very_negative') {
    return 'negative';
  }
  
  if (interaction.outcome === 'successful' && interaction.objectives_met) {
    return 'positive';
  }
  
  if (interaction.outcome === 'unsuccessful') {
    return 'negative';
  }
  
  return 'neutral';
}