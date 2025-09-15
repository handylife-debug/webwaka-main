import { NextRequest, NextResponse } from 'next/server';
import { paymentGatewayCoreCell } from '@/cells/payment/PaymentGatewayCore/src/server';
import crypto from 'crypto';

/**
 * SECURITY-CRITICAL: Interswitch Webhook Handler
 * Validates MAC signature and processes payment events
 * Interswitch uses HMAC-SHA256 with custom MAC calculation
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

// Verify Interswitch webhook signature
function verifyInterswitchSignature(
  amount: string, 
  paymentReference: string, 
  responseCode: string, 
  receivedMac: string, 
  secret: string
): boolean {
  try {
    // Interswitch MAC calculation: amount + paymentReference + responseCode + secret
    const macString = amount + paymentReference + responseCode + secret;
    const calculatedMac = crypto.createHash('sha512').update(macString).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(receivedMac.toLowerCase()), 
      Buffer.from(calculatedMac.toLowerCase())
    );
  } catch (error) {
    console.error('Interswitch signature verification error:', error);
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
        provider: 'interswitch',
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

    // Parse the form data or JSON payload
    const contentType = request.headers.get('content-type') || '';
    let webhookData: any;
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Interswitch sends form-encoded data
      const formData = await request.formData();
      webhookData = Object.fromEntries(formData.entries());
    } else {
      // JSON payload
      const body = await request.text();
      try {
        webhookData = JSON.parse(body);
      } catch (error) {
        await auditWebhookEvent({
          provider: 'interswitch',
          event: 'INVALID_JSON',
          status: 'failure',
          ip,
          details: { error: 'Invalid JSON payload', bodyPreview: body.substring(0, 100) }
        });
        
        return NextResponse.json({
          success: false,
          message: 'Invalid payload format'
        }, { status: 400 });
      }
    }

    // Extract required fields for MAC verification
    const { amount, paymentReference, responseCode, mac } = webhookData;
    
    if (!amount || !paymentReference || !responseCode || !mac) {
      await auditWebhookEvent({
        provider: 'interswitch',
        event: 'MISSING_REQUIRED_FIELDS',
        status: 'failure',
        ip,
        details: { 
          receivedFields: Object.keys(webhookData),
          missingFields: ['amount', 'paymentReference', 'responseCode', 'mac'].filter(
            field => !webhookData[field]
          )
        }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Missing required fields for webhook verification'
      }, { status: 400 });
    }

    // Verify webhook secret exists
    const webhookSecret = process.env.INTERSWITCH_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CRITICAL: INTERSWITCH_WEBHOOK_SECRET environment variable not configured');
      await auditWebhookEvent({
        provider: 'interswitch',
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

    // Verify MAC signature
    if (!verifyInterswitchSignature(amount, paymentReference, responseCode, mac, webhookSecret)) {
      await auditWebhookEvent({
        provider: 'interswitch',
        event: 'INVALID_SIGNATURE',
        status: 'failure',
        ip,
        details: { 
          receivedMac: mac.substring(0, 10) + '...', // Log partial MAC for debugging
          amount,
          paymentReference,
          responseCode
        }
      });
      
      return NextResponse.json({
        success: false,
        message: 'Invalid webhook signature'
      }, { status: 403 });
    }

    // Determine event type based on response code
    let event = 'payment.unknown';
    if (responseCode === '00' || responseCode === '0') {
      event = 'payment.success';
    } else {
      event = 'payment.failed';
    }

    // Process webhook through payment cell
    const result = await paymentGatewayCoreCell.validateWebhook({
      body: JSON.stringify(webhookData),
      signature: mac,
      provider: 'interswitch',
      event,
      data: webhookData
    });

    // Audit the webhook processing
    await auditWebhookEvent({
      provider: 'interswitch',
      event,
      reference: paymentReference,
      status: result.success ? 'success' : 'failure',
      ip,
      details: {
        event,
        paymentReference,
        amount,
        responseCode,
        merchantCode: webhookData.merchantCode,
        transactionReference: webhookData.transactionReference,
        duration: Date.now() - startTime,
        processingResult: result.success
      }
    });

    // Enhanced webhook processing based on event type
    if (result.success) {
      switch (event) {
        case 'payment.success':
          console.log(`✅ Interswitch payment successful: ${paymentReference} - ₦${amount}`);
          // Here: Update transaction status, send notifications, etc.
          break;
          
        case 'payment.failed':
          console.log(`❌ Interswitch payment failed: ${paymentReference} - Code: ${responseCode}`);
          // Here: Update transaction status, handle failed payment
          break;
          
        default:
          console.log(`📥 Interswitch webhook received: ${event}`);
      }
      
      // Additional Interswitch-specific processing
      if (webhookData.recurringPayment === 'true') {
        console.log(`🔄 Interswitch recurring payment: ${paymentReference}`);
        // Handle recurring payment
      }
      
      if (webhookData.splitPayment === 'true') {
        console.log(`💰 Interswitch split payment: ${paymentReference}`);
        // Handle split payment
      }
    }

    const response = NextResponse.json({
      success: result.success,
      message: result.message || 'Webhook processed',
      event,
      reference: paymentReference,
      responseCode
    });

    // Security headers for webhook responses
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    
    return response;

  } catch (error) {
    console.error('Interswitch webhook processing error:', error);
    
    await auditWebhookEvent({
      provider: 'interswitch',
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
    message: 'Interswitch webhook endpoint operational',
    provider: 'interswitch',
    timestamp: new Date().toISOString(),
    security: {
      signatureVerification: true,
      rateLimiting: true,
      auditLogging: true,
      macValidation: true
    }
  });
}