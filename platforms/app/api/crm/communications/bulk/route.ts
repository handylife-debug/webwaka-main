import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { getCurrentUser } from '../../../../../lib/auth-server'
import { sendEmail, type SmtpMessage } from '../../../../../lib/replitmail'
import { createCustomerCommunicationService } from '../../../../../lib/sms-service'
import { z } from 'zod'

// Bulk communication request schema with enhanced validation
const bulkCommunicationSchema = z.object({
  // Communication details
  communication_type: z.enum(['email', 'sms', 'both']),
  
  // Targeting options
  target_type: z.enum(['segment', 'customers', 'all_active']),
  segment_ids: z.array(z.string().uuid()).optional(),
  customer_ids: z.array(z.string().uuid()).optional(),
  
  // Message content
  subject: z.string().max(200).optional(),
  content: z.string().optional(),
  html_content: z.string().optional(),
  sms_message: z.string().max(160).optional(),
  
  // Template-based messaging
  template_type: z.enum(['receipt', 'appointment_reminder', 'promotional', 'custom']).optional(),
  template_data: z.record(z.any()).optional(),
  
  // Campaign details
  campaign_name: z.string().min(1).max(100),
  campaign_description: z.string().optional(),
  campaign_tags: z.array(z.string()).optional(),
  
  // Scheduling
  send_immediately: z.boolean().default(true),
  scheduled_at: z.string().optional(),
  
  // Filters and preferences
  respect_marketing_consent: z.boolean().default(true),
  respect_contact_preferences: z.boolean().default(true),
  exclude_bounced: z.boolean().default(true),
  
  // Testing and preview
  test_mode: z.boolean().default(false),
  test_recipients: z.array(z.string()).optional(), // Allow phone numbers for SMS test mode
  
  // Rate limiting
  batch_size: z.number().min(1).max(100).default(50),
  delay_between_batches: z.number().min(0).max(60000).default(1000) // milliseconds
});

// Campaign stats schema
const campaignStatsSchema = z.object({
  campaign_id: z.string().uuid()
});

// POST - Send bulk communications
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
    const validatedData = bulkCommunicationSchema.parse(body);

    // Create campaign record
    const campaignId = await createCampaign(tenantId, user.id, validatedData);

    // Validate targeting parameters first (CRITICAL: Production validation)
    if (validatedData.target_type === 'customers' && (!validatedData.customer_ids || validatedData.customer_ids.length === 0)) {
      return NextResponse.json({
        success: false,
        message: 'customer_ids is required when target_type is "customers"'
      }, { status: 400 });
    }
    
    if (validatedData.target_type === 'segment' && (!validatedData.segment_ids || validatedData.segment_ids.length === 0)) {
      return NextResponse.json({
        success: false,
        message: 'segment_ids is required when target_type is "segment"'
      }, { status: 400 });
    }

    // Get target customers based on targeting type
    const targetCustomers = await getTargetCustomers(tenantId, validatedData);

    if (targetCustomers.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No target customers found matching the criteria'
      }, { status: 400 });
    }

    // If test mode, limit to test recipients
    if (validatedData.test_mode) {
      if (!validatedData.test_recipients || validatedData.test_recipients.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'Test mode requires test_recipients'
        }, { status: 400 });
      }
      
      // Filter customers to only test recipients (CRITICAL: Fix SMS test mode support)
      const testCustomers = targetCustomers.filter(customer => {
        // For email test mode, match by email
        if (validatedData.communication_type === 'email') {
          return validatedData.test_recipients!.includes(customer.email);
        }
        // For SMS test mode, match by phone numbers
        else if (validatedData.communication_type === 'sms') {
          const customerPhone = customer.mobile || customer.phone;
          return customerPhone && validatedData.test_recipients!.includes(customerPhone);
        }
        // For both mode, match by email or phone
        else {
          const customerPhone = customer.mobile || customer.phone;
          return validatedData.test_recipients!.includes(customer.email) || 
                 (customerPhone && validatedData.test_recipients!.includes(customerPhone));
        }
      });

      if (testCustomers.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No target customers match test recipients'
        }, { status: 400 });
        }

      // Process test communications immediately
      const testResults = await processCommunications(
        tenantId, 
        campaignId, 
        testCustomers, 
        validatedData, 
        user.id
      );

      return NextResponse.json({
        success: true,
        message: `Test campaign sent to ${testResults.successful} recipients`,
        data: {
          campaign_id: campaignId,
          test_mode: true,
          results: testResults
        }
      });
    }

    // For production, handle scheduling
    if (!validatedData.send_immediately && validatedData.scheduled_at) {
      // Store campaign for scheduled sending
      await scheduleCampaign(tenantId, campaignId, validatedData.scheduled_at, targetCustomers);
      
      return NextResponse.json({
        success: true,
        message: 'Campaign scheduled successfully',
        data: {
          campaign_id: campaignId,
          scheduled_at: validatedData.scheduled_at,
          target_count: targetCustomers.length
        }
      });
    }

    // Send immediately in batches
    const results = await processCommunicationsInBatches(
      tenantId,
      campaignId,
      targetCustomers,
      validatedData,
      user.id
    );

    return NextResponse.json({
      success: results.successful > 0,
      message: `Campaign sent: ${results.successful}/${results.total} successful`,
      data: {
        campaign_id: campaignId,
        results: results,
        target_customers: targetCustomers.length
      }
    });

  } catch (error) {
    console.error('Error sending bulk communications:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to send bulk communications',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET - Get campaign statistics and status
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
    const campaign_id = searchParams.get('campaign_id');

    if (campaign_id) {
      // Get specific campaign stats
      const stats = await getCampaignStats(tenantId, campaign_id);
      return NextResponse.json({
        success: true,
        data: stats
      });
    }

    // Get all campaigns for tenant
    const campaigns = await getAllCampaigns(tenantId);
    return NextResponse.json({
      success: true,
      data: campaigns
    });

  } catch (error) {
    console.error('Error fetching campaign data:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch campaign data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper functions

async function createCampaign(tenantId: string, userId: string, data: any): Promise<string> {
  const insertQuery = `
    INSERT INTO communication_logs (
      tenant_id, customer_id, communication_type, direction, subject,
      content, communication_status, campaign_id, is_automated,
      metadata, created_by, sent_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, gen_random_uuid(), $8, $9, $10, $11)
    RETURNING campaign_id
  `;

  // Create a campaign log entry (using a dummy customer for now)
  const dummyCustomerId = '00000000-0000-0000-0000-000000000000';
  const campaignMetadata = {
    campaign_name: data.campaign_name,
    campaign_description: data.campaign_description,
    campaign_tags: data.campaign_tags,
    target_type: data.target_type,
    segment_ids: data.segment_ids,
    customer_ids: data.customer_ids,
    communication_type: data.communication_type,
    template_type: data.template_type,
    send_immediately: data.send_immediately,
    scheduled_at: data.scheduled_at,
    created_at: new Date().toISOString()
  };

  const result = await execute_sql(insertQuery, [
    tenantId,
    dummyCustomerId,
    'other', // Campaign record type
    'outbound',
    `Campaign: ${data.campaign_name}`,
    data.campaign_description || '',
    'sent',
    true,
    JSON.stringify(campaignMetadata),
    userId,
    new Date().toISOString()
  ]);

  return result.rows[0].campaign_id;
}

async function getTargetCustomers(tenantId: string, data: any): Promise<any[]> {
  let query = '';
  let queryParams: any[] = [tenantId];
  let paramIndex = 2;

  const baseSelect = `
    SELECT DISTINCT c.id, c.email, c.mobile, c.phone, c.first_name, c.last_name,
           c.company_name, c.preferred_contact_method, c.marketing_consent,
           c.email_bounced, c.sms_bounced, c.created_at
    FROM customers c
  `;

  const baseWhere = `WHERE c.tenant_id = $1 AND c.customer_status = 'active'`;

  if (data.target_type === 'all_active') {
    query = `${baseSelect} ${baseWhere}`;
  } else if (data.target_type === 'customers' && data.customer_ids) {
    query = `${baseSelect} ${baseWhere} AND c.id = ANY($${paramIndex})`;
    queryParams.push(data.customer_ids);
    paramIndex++;
  } else if (data.target_type === 'segment' && data.segment_ids) {
    query = `
      ${baseSelect}
      INNER JOIN customer_segment_members csm ON csm.customer_id = c.id
      INNER JOIN customer_segments cs ON cs.id = csm.segment_id
      ${baseWhere} AND cs.id = ANY($${paramIndex}) AND cs.tenant_id = $1
    `;
    queryParams.push(data.segment_ids);
    paramIndex++;
  } else {
    // Return empty array for invalid target_type to trigger proper 400 validation error
    return [];
  }

  // Apply filters
  const additionalFilters: string[] = [];

  if (data.respect_marketing_consent) {
    additionalFilters.push(`c.marketing_consent = true`);
  }

  if (data.exclude_bounced) {
    if (data.communication_type === 'email' || data.communication_type === 'both') {
      additionalFilters.push(`(c.email_bounced = false OR c.email_bounced IS NULL)`);
    }
    if (data.communication_type === 'sms' || data.communication_type === 'both') {
      additionalFilters.push(`(c.sms_bounced = false OR c.sms_bounced IS NULL)`);
    }
  }

  // Add contact preferences filter (CRITICAL: Implement respect_contact_preferences)
  if (data.respect_contact_preferences) {
    if (data.communication_type === 'email' || data.communication_type === 'both') {
      additionalFilters.push(`(c.preferred_contact_method IS NULL OR c.preferred_contact_method IN ('email', 'both'))`);
    }
    if (data.communication_type === 'sms' || data.communication_type === 'both') {
      additionalFilters.push(`(c.preferred_contact_method IS NULL OR c.preferred_contact_method IN ('sms', 'both'))`);
    }
  }

  // Add communication type specific filters (CRITICAL: Fix SQL precedence bug)
  if (data.communication_type === 'email') {
    additionalFilters.push(`(c.email IS NOT NULL AND c.email != '')`);
  } else if (data.communication_type === 'sms') {
    additionalFilters.push(`((c.mobile IS NOT NULL AND c.mobile != '') OR (c.phone IS NOT NULL AND c.phone != ''))`);
  } else if (data.communication_type === 'both') {
    additionalFilters.push(`
      ((c.email IS NOT NULL AND c.email != '') OR 
       (c.mobile IS NOT NULL AND c.mobile != '') OR 
       (c.phone IS NOT NULL AND c.phone != ''))
    `);
  }

  // CRITICAL: Wrap entire additionalFilters chain to prevent SQL injection via precedence
  if (additionalFilters.length > 0) {
    query += ` AND (${additionalFilters.join(' AND ')})`;
  }

  query += ` ORDER BY c.created_at DESC`;

  const result = await execute_sql(query, queryParams);
  return result.rows;
}

async function processCommunications(tenantId: string, campaignId: string, customers: any[], data: any, userId: string) {
  let successful = 0;
  let failed = 0;
  const errors: any[] = [];

  for (const customer of customers) {
    try {
      // Send email if required
      if (data.communication_type === 'email' || data.communication_type === 'both') {
        if (customer.email) {
          await sendCampaignEmail(customer, data);
          await logCommunication(tenantId, customer.id, 'email', campaignId, data, userId);
        }
      }

      // Send SMS if required
      if (data.communication_type === 'sms' || data.communication_type === 'both') {
        const phone = customer.mobile || customer.phone;
        if (phone) {
          await sendCampaignSMS(customer, phone, data);
          await logCommunication(tenantId, customer.id, 'sms', campaignId, data, userId);
        }
      }

      successful++;
    } catch (error) {
      failed++;
      errors.push({
        customer_id: customer.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return {
    total: customers.length,
    successful,
    failed,
    errors: errors.slice(0, 10) // Limit error details to first 10
  };
}

async function processCommunicationsInBatches(tenantId: string, campaignId: string, customers: any[], data: any, userId: string) {
  const batchSize = data.batch_size || 50;
  const delay = data.delay_between_batches || 1000;
  
  let totalSuccessful = 0;
  let totalFailed = 0;
  const allErrors: any[] = [];

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    
    const batchResults = await processCommunications(tenantId, campaignId, batch, data, userId);
    
    totalSuccessful += batchResults.successful;
    totalFailed += batchResults.failed;
    allErrors.push(...batchResults.errors);

    // Delay between batches (except for last batch)
    if (i + batchSize < customers.length && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    total: customers.length,
    successful: totalSuccessful,
    failed: totalFailed,
    errors: allErrors.slice(0, 20) // Limit to first 20 errors
  };
}

async function sendCampaignEmail(customer: any, data: any) {
  let subject = data.subject || `Message from our business`;
  let content = data.content || '';
  let htmlContent = data.html_content || '';

  // Apply template if specified
  if (data.template_type && data.template_data) {
    const templateResult = generateEmailTemplate(customer, data.template_type, data.template_data);
    subject = templateResult.subject;
    content = templateResult.text;
    htmlContent = templateResult.html;
  }

  // Personalize content
  subject = personalizeContent(subject, customer);
  content = personalizeContent(content, customer);
  htmlContent = personalizeContent(htmlContent, customer);

  const emailMessage: SmtpMessage = {
    to: customer.email,
    subject: subject,
    text: content,
    html: htmlContent || undefined
  };

  return await sendEmail(emailMessage);
}

async function sendCampaignSMS(customer: any, phone: string, data: any) {
  let message = data.sms_message || 'Message from our business';

  // Apply template if specified
  if (data.template_type && data.template_data) {
    message = generateSMSTemplate(customer, data.template_type, data.template_data);
  }

  // Personalize content
  message = personalizeContent(message, customer);

  const communicationService = createCustomerCommunicationService();
  const smsService = (communicationService as any).smsService;
  
  return await smsService.sendSMS(phone, message);
}

function personalizeContent(content: string, customer: any): string {
  const replacements = {
    '{{first_name}}': customer.first_name || '',
    '{{last_name}}': customer.last_name || '',
    '{{full_name}}': `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
    '{{company_name}}': customer.company_name || '',
    '{{email}}': customer.email || ''
  };

  let personalizedContent = content;
  Object.entries(replacements).forEach(([placeholder, value]) => {
    personalizedContent = personalizedContent.replace(new RegExp(placeholder, 'g'), value);
  });

  return personalizedContent;
}

function generateEmailTemplate(customer: any, template: string, data: any) {
  const customerName = `${customer.first_name} ${customer.last_name}`;
  const businessName = data.business_name || 'Our Business';
  
  switch (template) {
    case 'promotional':
      return {
        subject: `Special Offer for You - ${businessName}`,
        text: `Dear ${customerName},\n\nWe have a special offer just for you!\n\n${data.offer || 'Special discount available'}\n\nValid until: ${data.valid_until || 'Limited time'}\n\nDon't miss out!\n\nBest regards,\n${businessName}`,
        html: `
          <h2>Special Offer for You!</h2>
          <p>Dear ${customerName},</p>
          <div style="background: #f0f8ff; border: 1px solid #0066cc; padding: 20px; margin: 20px 0;">
            <h3 style="color: #0066cc;">Exclusive Offer</h3>
            <p style="font-size: 18px;">${data.offer || 'Special discount available'}</p>
            <p><strong>Valid until:</strong> ${data.valid_until || 'Limited time'}</p>
          </div>
          <p>Don't miss out on this great deal!</p>
          <p>Best regards,<br>${businessName}</p>
        `
      };
    default:
      return {
        subject: `Message from ${businessName}`,
        text: `Dear ${customerName},\n\n${data.message || 'We have a message for you.'}\n\nBest regards,\n${businessName}`,
        html: `<p>Dear ${customerName},</p><p>${data.message || 'We have a message for you.'}</p><p>Best regards,<br>${businessName}</p>`
      };
  }
}

function generateSMSTemplate(customer: any, template: string, data: any) {
  const customerName = customer.first_name;
  const businessName = data.business_name || 'Our Business';
  
  switch (template) {
    case 'promotional':
      return `Hi ${customerName}! ${data.offer || 'Special offer'} Valid until ${data.valid_until || 'soon'}. ${businessName}`;
    default:
      return `Hi ${customerName}! ${data.message || 'Message from our business'}. ${businessName}`;
  }
}

async function logCommunication(tenantId: string, customerId: string, type: string, campaignId: string, data: any, userId: string) {
  try {
    await execute_sql(`
      INSERT INTO communication_logs (
        tenant_id, customer_id, communication_type, direction,
        subject, content, communication_status, campaign_id,
        is_automated, sent_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      tenantId,
      customerId,
      type,
      'outbound',
      type === 'email' ? data.subject : null,
      type === 'email' ? data.content : data.sms_message,
      'sent',
      campaignId,
      true,
      new Date().toISOString(),
      userId
    ]);
  } catch (error) {
    console.error('Error logging communication:', error);
  }
}

async function scheduleCampaign(tenantId: string, campaignId: string, scheduledAt: string, customers: any[]) {
  // This would typically store in a separate scheduled_campaigns table
  // For now, we'll store it in metadata of the campaign log
  const updateQuery = `
    UPDATE communication_logs 
    SET metadata = jsonb_set(metadata, '{scheduled_customers}', $1::jsonb)
    WHERE tenant_id = $2 AND campaign_id = $3 AND communication_type = 'other'
  `;
  
  await execute_sql(updateQuery, [
    JSON.stringify(customers.map(c => c.id)),
    tenantId,
    campaignId
  ]);
}

async function getCampaignStats(tenantId: string, campaignId: string) {
  const statsQuery = `
    SELECT 
      campaign_id,
      COUNT(*) FILTER (WHERE communication_type != 'other') as total_sent,
      COUNT(*) FILTER (WHERE communication_type = 'email') as emails_sent,
      COUNT(*) FILTER (WHERE communication_type = 'sms') as sms_sent,
      COUNT(*) FILTER (WHERE communication_status = 'delivered') as delivered_count,
      COUNT(*) FILTER (WHERE communication_status = 'read') as read_count,
      COUNT(*) FILTER (WHERE communication_status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE communication_status = 'bounced') as bounced_count,
      SUM(open_count) as total_opens,
      SUM(click_count) as total_clicks,
      MIN(sent_at) as campaign_started,
      MAX(sent_at) as campaign_completed,
      COUNT(DISTINCT customer_id) as unique_customers
    FROM communication_logs
    WHERE tenant_id = $1 AND campaign_id = $2
    GROUP BY campaign_id
  `;

  const campaignInfoQuery = `
    SELECT metadata
    FROM communication_logs
    WHERE tenant_id = $1 AND campaign_id = $2 AND communication_type = 'other'
    LIMIT 1
  `;

  const [statsResult, infoResult] = await Promise.all([
    execute_sql(statsQuery, [tenantId, campaignId]),
    execute_sql(campaignInfoQuery, [tenantId, campaignId])
  ]);

  const stats = statsResult.rows[0] || {};
  const info = infoResult.rows[0]?.metadata || {};

  return {
    campaign_id: campaignId,
    campaign_info: info,
    stats: stats
  };
}

async function getAllCampaigns(tenantId: string) {
  const query = `
    SELECT 
      campaign_id,
      metadata,
      created_at,
      COUNT(*) FILTER (WHERE communication_type != 'other') as total_sent,
      COUNT(*) FILTER (WHERE communication_status = 'delivered') as delivered_count,
      COUNT(*) FILTER (WHERE communication_status = 'read') as read_count,
      COUNT(*) FILTER (WHERE communication_status = 'failed') as failed_count
    FROM communication_logs
    WHERE tenant_id = $1 AND campaign_id IS NOT NULL
    GROUP BY campaign_id, metadata, created_at
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const result = await execute_sql(query, [tenantId]);
  return result.rows;
}