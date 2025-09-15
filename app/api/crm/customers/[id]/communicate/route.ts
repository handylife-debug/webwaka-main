import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../../lib/tenant-context'
import { sendEmail, type SmtpMessage } from '../../../../../../lib/replitmail'
import { createCustomerCommunicationService } from '../../../../../../lib/sms-service'
import { z } from 'zod'

// Communication request schema
const communicationSchema = z.object({
  type: z.enum(['email', 'sms', 'both']),
  template: z.enum(['receipt', 'appointment_reminder', 'promotional', 'custom']).optional(),
  
  // Email specific fields
  email_subject: z.string().min(1).max(255).optional(),
  email_content: z.string().optional(),
  email_html: z.string().optional(),
  
  // SMS specific fields
  sms_message: z.string().max(160).optional(),
  
  // Custom message fields
  custom_subject: z.string().max(255).optional(),
  custom_message: z.string().optional(),
  custom_html: z.string().optional(),
  
  // Template data for predefined templates
  template_data: z.object({
    order_id: z.string().optional(),
    amount: z.number().optional(),
    items: z.array(z.string()).optional(),
    appointment_date: z.string().optional(),
    appointment_time: z.string().optional(),
    service: z.string().optional(),
    offer: z.string().optional(),
    valid_until: z.string().optional(),
    business_name: z.string().optional()
  }).optional(),
  
  // Campaign tracking
  campaign_id: z.string().optional(),
  is_automated: z.boolean().optional()
});

// POST - Send communication to customer
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const customerId = id;
    const body = await request.json();
    const validatedData = communicationSchema.parse(body);
    
    // Get customer details
    const customerQuery = `
      SELECT id, email, mobile, phone, first_name, last_name, 
             preferred_contact_method, marketing_consent, company_name
      FROM customers 
      WHERE tenant_id = $1 AND id = $2 AND customer_status = 'active'
    `;
    
    const customerResult = await execute_sql(customerQuery, [tenantId, customerId]);
    
    if (customerResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found or inactive'
      }, { status: 404 });
    }
    
    const customer = customerResult.rows[0];
    
    // Check marketing consent for promotional messages
    if (validatedData.template === 'promotional' && !customer.marketing_consent) {
      return NextResponse.json({
        success: false,
        message: 'Customer has not consented to marketing communications'
      }, { status: 403 });
    }
    
    const results: any[] = [];
    
    // Send Email
    if (validatedData.type === 'email' || validatedData.type === 'both') {
      if (!customer.email) {
        results.push({
          type: 'email',
          success: false,
          message: 'Customer email not available'
        });
      } else {
        try {
          const emailResult = await sendCustomerEmail(customer, validatedData);
          results.push({
            type: 'email',
            success: true,
            message: 'Email sent successfully',
            details: emailResult
          });
          
          // Log communication
          await logCommunication(tenantId, customerId, 'email', validatedData, emailResult.messageId);
          
        } catch (error) {
          results.push({
            type: 'email',
            success: false,
            message: `Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }
    
    // Send SMS
    if (validatedData.type === 'sms' || validatedData.type === 'both') {
      const customerPhone = customer.mobile || customer.phone;
      
      if (!customerPhone) {
        results.push({
          type: 'sms',
          success: false,
          message: 'Customer phone number not available'
        });
      } else {
        try {
          const smsResult = await sendCustomerSMS(customer, customerPhone, validatedData);
          results.push({
            type: 'sms',
            success: smsResult.success,
            message: smsResult.message,
            details: smsResult
          });
          
          // Log communication
          await logCommunication(tenantId, customerId, 'sms', validatedData, smsResult.messageId);
          
        } catch (error) {
          results.push({
            type: 'sms',
            success: false,
            message: `SMS failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    return NextResponse.json({
      success: successCount > 0,
      message: `${successCount}/${totalCount} communications sent successfully`,
      results: results
    });
    
  } catch (error) {
    console.error('Error sending communication:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to send communication',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function sendCustomerEmail(customer: any, data: any) {
  let subject = '';
  let textContent = '';
  let htmlContent = '';
  
  // Generate content based on template or use custom content
  if (data.template && data.template_data) {
    const generated = generateEmailTemplate(customer, data.template, data.template_data);
    subject = generated.subject;
    textContent = generated.text;
    htmlContent = generated.html;
  } else {
    subject = data.email_subject || data.custom_subject || 'Message from our business';
    textContent = data.email_content || data.custom_message || '';
    htmlContent = data.email_html || data.custom_html || '';
  }
  
  const emailMessage: SmtpMessage = {
    to: customer.email,
    subject: subject,
    text: textContent,
    html: htmlContent || undefined
  };
  
  return await sendEmail(emailMessage);
}

async function sendCustomerSMS(customer: any, phone: string, data: any) {
  let message = '';
  
  // Generate SMS content based on template or use custom content
  if (data.template && data.template_data) {
    message = generateSMSTemplate(customer, data.template, data.template_data);
  } else {
    message = data.sms_message || data.custom_message || 'Message from our business';
  }
  
  const communicationService = createCustomerCommunicationService();
  
  // Use appropriate SMS method based on template
  switch (data.template) {
    case 'receipt':
      if (data.template_data) {
        return await communicationService.sendReceiptSMS(phone, {
          orderId: data.template_data.order_id || 'N/A',
          amount: data.template_data.amount || 0,
          items: data.template_data.items || [],
          businessName: data.template_data.business_name || 'Our Business'
        });
      }
      break;
      
    case 'appointment_reminder':
      if (data.template_data) {
        return await communicationService.sendAppointmentReminder(phone, {
          date: data.template_data.appointment_date || '',
          time: data.template_data.appointment_time || '',
          service: data.template_data.service || '',
          businessName: data.template_data.business_name || 'Our Business'
        });
      }
      break;
      
    case 'promotional':
      if (data.template_data) {
        return await communicationService.sendPromotionalSMS(phone, {
          offer: data.template_data.offer || '',
          validUntil: data.template_data.valid_until || '',
          businessName: data.template_data.business_name || 'Our Business'
        });
      }
      break;
      
    default:
      // Custom SMS
      const smsService = (communicationService as any).smsService;
      return await smsService.sendSMS(phone, message);
  }
  
  // Fallback to basic SMS
  const smsService = (communicationService as any).smsService;
  return await smsService.sendSMS(phone, message);
}

function generateEmailTemplate(customer: any, template: string, data: any) {
  const customerName = `${customer.first_name} ${customer.last_name}`;
  const businessName = data.business_name || 'Our Business';
  
  switch (template) {
    case 'receipt':
      return {
        subject: `Receipt for Order #${data.order_id || 'N/A'} - ${businessName}`,
        text: `Dear ${customerName},\n\nThank you for your purchase!\n\nOrder #${data.order_id || 'N/A'}\nTotal: ₦${(data.amount || 0).toLocaleString()}\nItems: ${(data.items || []).join(', ')}\n\nWe appreciate your business!\n\nBest regards,\n${businessName}`,
        html: `
          <h2>Thank you for your purchase, ${customerName}!</h2>
          <div style="border: 1px solid #ddd; padding: 20px; margin: 20px 0;">
            <h3>Order Details</h3>
            <p><strong>Order #:</strong> ${data.order_id || 'N/A'}</p>
            <p><strong>Total:</strong> ₦${(data.amount || 0).toLocaleString()}</p>
            <p><strong>Items:</strong></p>
            <ul>${(data.items || []).map((item: string) => `<li>${item}</li>`).join('')}</ul>
          </div>
          <p>We appreciate your business!</p>
          <p>Best regards,<br>${businessName}</p>
        `
      };
      
    case 'appointment_reminder':
      return {
        subject: `Appointment Reminder - ${data.service || 'Service'} - ${businessName}`,
        text: `Dear ${customerName},\n\nThis is a reminder about your upcoming appointment:\n\nService: ${data.service || 'N/A'}\nDate: ${data.appointment_date || 'N/A'}\nTime: ${data.appointment_time || 'N/A'}\n\nWe look forward to seeing you!\n\nBest regards,\n${businessName}`,
        html: `
          <h2>Appointment Reminder</h2>
          <p>Dear ${customerName},</p>
          <div style="border: 1px solid #ddd; padding: 20px; margin: 20px 0;">
            <h3>Appointment Details</h3>
            <p><strong>Service:</strong> ${data.service || 'N/A'}</p>
            <p><strong>Date:</strong> ${data.appointment_date || 'N/A'}</p>
            <p><strong>Time:</strong> ${data.appointment_time || 'N/A'}</p>
          </div>
          <p>We look forward to seeing you!</p>
          <p>Best regards,<br>${businessName}</p>
        `
      };
      
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
        text: `Dear ${customerName},\n\n${data.custom_message || 'We have a message for you.'}\n\nBest regards,\n${businessName}`,
        html: `<p>Dear ${customerName},</p><p>${data.custom_message || 'We have a message for you.'}</p><p>Best regards,<br>${businessName}</p>`
      };
  }
}

function generateSMSTemplate(customer: any, template: string, data: any) {
  const customerName = customer.first_name;
  const businessName = data.business_name || 'Our Business';
  
  switch (template) {
    case 'receipt':
      return `Hi ${customerName}! Thank you for your purchase. Order #${data.order_id || 'N/A'}: ₦${(data.amount || 0).toLocaleString()}. ${businessName}`;
      
    case 'appointment_reminder':
      return `Hi ${customerName}! Reminder: ${data.service || 'Appointment'} on ${data.appointment_date || 'TBD'} at ${data.appointment_time || 'TBD'}. ${businessName}`;
      
    case 'promotional':
      return `Hi ${customerName}! ${data.offer || 'Special offer'} Valid until ${data.valid_until || 'soon'}. ${businessName}`;
      
    default:
      return `Hi ${customerName}! ${data.custom_message || 'Message from our business'}. ${businessName}`;
  }
}

async function logCommunication(tenantId: string, customerId: string, type: string, data: any, messageId?: string) {
  try {
    await execute_sql(`
      INSERT INTO communication_logs (
        tenant_id, customer_id, communication_type, direction,
        subject, message_content, communication_status, external_message_id,
        campaign_id, is_automated, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      tenantId,
      customerId,
      type,
      'outbound',
      data.email_subject || data.custom_subject || null,
      data.email_content || data.sms_message || data.custom_message || null,
      'sent',
      messageId || null,
      data.campaign_id || null,
      data.is_automated || false,
      new Date().toISOString()
    ]);
  } catch (error) {
    console.error('Error logging communication:', error);
    // Don't fail the main operation if logging fails
  }
}