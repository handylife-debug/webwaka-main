import { NextRequest, NextResponse } from 'next/server';
import { paymentGatewayCoreCell } from '@/cells/payment/PaymentGatewayCore/src/server';
import crypto from 'crypto';

/**
 * SECURITY-CRITICAL: Paystack Webhook Handler
 * Validates HMAC signature and processes payment events
 * NEVER trust webhook data without signature verification
 */

// Rate limiting for webhooks (prevent webhook flooding)
const webhookCounts = new Map<string, { count: number; resetTime: number }>();
const WEBHOOK_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const WEBHOOK_RATE_LIMIT_MAX = 100; // 100 webhooks per minute per IP

function checkWebhookRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = webhookCounts.get(ip);
  
  if (!entry || now > entry.resetTime) {
    webhookCounts.set(ip, { count: 1, resetTime: now + WEBHOOK_RATE_LIMIT_WINDOW });
    return { allowed: true };
  }
  
  if (entry.count >= WEBHOOK_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  entry.count++;
  return { allowed: true };
}

// Verify Paystack webhook signature
function verifyPaystackSignature(body: string, signature: string, secret: string): boolean {
  try {
    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash));
  } catch (error) {
    console.error('Paystack signature verification error:', error);
    return false;
  }
}

// Audit logging for webhooks
async function auditWebhookEvent({
  provider,
  event,
  reference,
  status,
  ip,
  details
}: {
  provider: string;
  event: string;
  reference?: string;
  status: 'success' | 'failure' | 'warning';
  ip: string;
  details: any;
}) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    provider,
    event,
    reference,
    status,
    ip,
    details: JSON.stringify(details),
    service: 'PaymentWebhook'
  };
  
  console.log(`🔗 WEBHOOK AUDIT: ${status.toUpperCase()} - ${provider} ${event}`, auditEntry);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const startTime = Date.now();
  
  try {
    // Rate limiting for webhooks
    const rateCheck = checkWebhookRateLimit(ip);
    if (!rateCheck.allowed) {
      await auditWebhookEvent({
        provider: 'paystack',
        event: 'RATE_LIMIT_EXCEEDED',
        status: 'warning',
        ip,
        details: { limit: WEBHOOK_RATE_LIMIT_MAX, window: WEBHOOK_RATE_LIMIT_WINDOW }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Webhook rate limit exceeded'
      }, { 
        status: 429,
        headers: { 'Retry-After': rateCheck.retryAfter?.toString() || '60' }
      });
    }

    // Get raw body and signature
    const body = await request.text();
    const signature = request.headers.get('x-paystack-signature');
    
    if (!signature) {
      await auditWebhookEvent({
        provider: 'paystack',
        event: 'MISSING_SIGNATURE',
        status: 'failure',
        ip,
        details: { headers: Object.fromEntries(request.headers.entries()) }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Missing webhook signature'
      }, { status: 400 });
    }

    // Verify webhook secret exists
    const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CRITICAL: PAYSTACK_WEBHOOK_SECRET environment variable not configured');
      await auditWebhookEvent({
        provider: 'paystack',
        event: 'MISSING_SECRET',
        status: 'failure',
        ip,
        details: { error: 'Webhook secret not configured' }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Webhook configuration error'
      }, { status: 500 });
    }

    // Verify signature
    if (!verifyPaystackSignature(body, signature, webhookSecret)) {
      await auditWebhookEvent({
        provider: 'paystack',
        event: 'INVALID_SIGNATURE',
        status: 'failure',
        ip,
        details: { 
          signature: signature.substring(0, 10) + '...', // Log partial signature for debugging
          bodyLength: body.length
        }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Invalid webhook signature'
      }, { status: 403 });
    }

    // Parse webhook data
    let webhookData;
    try {
      webhookData = JSON.parse(body);
    } catch (error) {
      await auditWebhookEvent({
        provider: 'paystack',
        event: 'INVALID_JSON',
        status: 'failure',
        ip,
        details: { error: 'Invalid JSON payload', bodyPreview: body.substring(0, 100) }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON payload'
      }, { status: 400 });
    }

    const { event, data } = webhookData;
    
    if (!event || !data) {
      await auditWebhookEvent({
        provider: 'paystack',
        event: 'MISSING_EVENT_DATA',
        status: 'failure',
        ip,
        details: { webhookData }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Missing event or data in webhook'
      }, { status: 400 });
    }

    // Process webhook through payment cell
    const result = await paymentGatewayCoreCell.validateWebhook({
      body,
      signature,
      provider: 'paystack',
      event,
      data
    });

    // Audit the webhook processing
    await auditWebhookEvent({
      provider: 'paystack',
      event,
      reference: data.reference,
      status: result.success ? 'success' : 'failure',
      ip,
      details: {
        event,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        customer: data.customer?.email,
        duration: Date.now() - startTime,
        processingResult: result.success
      }
    });

    // Enhanced webhook processing based on event type
    if (result.success) {
      switch (event) {
        case 'charge.success':
          console.log(`✅ Paystack payment successful: ${data.reference} - ₦${data.amount/100}`);
          // Here: Update transaction status, send notifications, etc.
          break;
          
        case 'charge.failed':
          console.log(`❌ Paystack payment failed: ${data.reference} - ${data.gateway_response}`);
          // Here: Update transaction status, handle failed payment
          break;
          
        case 'subscription.create':
          console.log(`🔄 Paystack subscription created: ${data.subscription_code}`);
          // Here: Handle new subscription
          break;
          
        case 'subscription.disable':
          console.log(`⏹️ Paystack subscription disabled: ${data.subscription_code}`);
          // Here: Handle subscription cancellation
          break;
          
        case 'invoice.create':
          console.log(`📄 Paystack invoice created: ${data.invoice_code}`);
          // Here: Handle invoice creation
          break;
          
        default:
          console.log(`📥 Paystack webhook received: ${event}`);
      }
    }

    const response = NextResponse.json({
      success: result.success,
      message: result.message || 'Webhook processed',
      event,
      reference: data.reference
    });

    // Security headers for webhook responses
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    
    return response;

  } catch (error) {
    console.error('Paystack webhook processing error:', error);
    
    await auditWebhookEvent({
      provider: 'paystack',
      event: 'PROCESSING_ERROR',
      status: 'failure',
      ip,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime
      }
    });
    
    return NextResponse.json({
      success: false,
      message: 'Webhook processing failed'
    }, { status: 500 });
  }
}

// Health check for webhook endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Paystack webhook endpoint operational',
    provider: 'paystack',
    timestamp: new Date().toISOString(),
    security: {
      signatureVerification: true,
      rateLimiting: true,
      auditLogging: true
    }
  });
}