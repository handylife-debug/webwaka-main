import { NextRequest, NextResponse } from 'next/server';
import { paymentGatewayCoreCell } from '@/cells/payment/PaymentGatewayCore/src/server';
import crypto from 'crypto';

/**
 * SECURITY-CRITICAL: Flutterwave Webhook Handler
 * Validates verif-hash signature and processes payment events
 * Flutterwave uses SHA256 HMAC with 'verif-hash' header
 */

// Shared rate limiting with other webhook endpoints
const webhookCounts = new Map<string, { count: number; resetTime: number }>();
const WEBHOOK_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const WEBHOOK_RATE_LIMIT_MAX = 100;

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

// Verify Flutterwave webhook signature
function verifyFlutterwaveSignature(body: string, hash: string, secret: string): boolean {
  try {
    const expectedHash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  } catch (error) {
    console.error('Flutterwave signature verification error:', error);
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
        provider: 'flutterwave',
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
    const verifHash = request.headers.get('verif-hash');
    
    if (!verifHash) {
      await auditWebhookEvent({
        provider: 'flutterwave',
        event: 'MISSING_SIGNATURE',
        status: 'failure',
        ip,
        details: { headers: Object.fromEntries(request.headers.entries()) }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Missing webhook signature (verif-hash)'
      }, { status: 400 });
    }

    // Verify webhook secret exists
    const webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CRITICAL: FLUTTERWAVE_WEBHOOK_SECRET environment variable not configured');
      await auditWebhookEvent({
        provider: 'flutterwave',
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
    if (!verifyFlutterwaveSignature(body, verifHash, webhookSecret)) {
      await auditWebhookEvent({
        provider: 'flutterwave',
        event: 'INVALID_SIGNATURE',
        status: 'failure',
        ip,
        details: { 
          hash: verifHash.substring(0, 10) + '...', // Log partial hash for debugging
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
        provider: 'flutterwave',
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
        provider: 'flutterwave',
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
      signature: verifHash,
      provider: 'flutterwave',
      event,
      data
    });

    // Audit the webhook processing
    await auditWebhookEvent({
      provider: 'flutterwave',
      event,
      reference: data.tx_ref || data.flw_ref,
      status: result.success ? 'success' : 'failure',
      ip,
      details: {
        event,
        tx_ref: data.tx_ref,
        flw_ref: data.flw_ref,
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
        case 'charge.completed':
          if (data.status === 'successful') {
            console.log(`✅ Flutterwave payment successful: ${data.tx_ref} - ${data.currency}${data.amount}`);
            // Here: Update transaction status, send notifications, etc.
          } else {
            console.log(`❌ Flutterwave payment completed but failed: ${data.tx_ref} - ${data.status}`);
            // Here: Handle failed payment
          }
          break;
          
        case 'transfer.completed':
          console.log(`💸 Flutterwave transfer completed: ${data.reference} - ${data.status}`);
          // Here: Handle transfer completion
          break;
          
        case 'subscription.cancelled':
          console.log(`⏹️ Flutterwave subscription cancelled: ${data.id}`);
          // Here: Handle subscription cancellation
          break;
          
        case 'charge.dispute.create':
          console.log(`⚠️ Flutterwave dispute created: ${data.id} for ${data.transaction_reference}`);
          // Here: Handle dispute creation
          break;
          
        case 'charge.dispute.resolve':
          console.log(`✅ Flutterwave dispute resolved: ${data.id} - ${data.status}`);
          // Here: Handle dispute resolution
          break;
          
        default:
          console.log(`📥 Flutterwave webhook received: ${event}`);
      }
    }

    const response = NextResponse.json({
      success: result.success,
      message: result.message || 'Webhook processed',
      event,
      reference: data.tx_ref || data.flw_ref
    });

    // Security headers for webhook responses
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    
    return response;

  } catch (error) {
    console.error('Flutterwave webhook processing error:', error);
    
    await auditWebhookEvent({
      provider: 'flutterwave',
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
    message: 'Flutterwave webhook endpoint operational',
    provider: 'flutterwave',
    timestamp: new Date().toISOString(),
    security: {
      signatureVerification: true,
      rateLimiting: true,
      auditLogging: true
    }
  });
}