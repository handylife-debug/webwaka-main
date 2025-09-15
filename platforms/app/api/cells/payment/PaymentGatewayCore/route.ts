import { NextRequest, NextResponse } from 'next/server';
import { paymentGatewayCoreCell } from '@/cells/payment/PaymentGatewayCore/src/server';
import { withAuth } from '@/lib/auth-middleware';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { z } from 'zod';

// Rate limiting store (in production, use Redis)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100;

// Input validation schemas
const PaymentActionSchema = z.object({
  action: z.enum([
    'initializePayment', 'verifyPayment', 'createCustomer', 'createSubscription',
    'processRefund', 'getPaymentStatus', 'validateWebhook', 'getTransactionHistory',
    'getCustomers', 'getSupportedCurrencies', 'getPaymentProviders'
  ]),
  payload: z.record(z.any()).optional()
});

// Rate limiting function
function checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = identifier;
  const entry = requestCounts.get(key);
  
  if (!entry || now > entry.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  entry.count++;
  return { allowed: true };
}

// Audit logging function
async function auditLog({
  userId,
  tenantId,
  action,
  resource,
  details,
  status,
  ip
}: {
  userId: string;
  tenantId: string;
  action: string;
  resource: string;
  details: any;
  status: 'success' | 'failure' | 'warning';
  ip: string;
}) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    userId,
    tenantId,
    action,
    resource,
    details: JSON.stringify(details),
    status,
    ip,
    service: 'PaymentGatewayCore'
  };
  
  // In production, save to audit log database table
  console.log(`🔍 AUDIT: ${status.toUpperCase()} - ${action} by user ${userId} for tenant ${tenantId}`, auditEntry);
}

// Secure POST handler with authentication, authorization, and rate limiting
const securePostHandler = withAuth(async (request: NextRequest, context: { user: any }) => {
  const startTime = Date.now();
  let tenantContext;
  let auditDetails = {};
  
  try {
    // Get tenant context (CRITICAL: derive from request, never trust payload)
    tenantContext = await getTenantContext(request);
    
    // Validate tenant access for authenticated user
    const hasAccess = await validateTenantAccess(tenantContext.tenantId, request);
    if (!hasAccess) {
      await auditLog({
        userId: context.user.id,
        tenantId: tenantContext.tenantId,
        action: 'TENANT_ACCESS_DENIED',
        resource: 'PaymentGateway',
        details: { reason: 'User lacks access to tenant' },
        status: 'failure',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });
      
      return NextResponse.json({
        success: false,
        message: 'Access denied to tenant resources',
        code: 'TENANT_ACCESS_DENIED'
      }, { status: 403 });
    }
    
    // Rate limiting per tenant + user
    const rateLimitKey = `${tenantContext.tenantId}:${context.user.id}`;
    const rateCheck = checkRateLimit(rateLimitKey);
    
    if (!rateCheck.allowed) {
      await auditLog({
        userId: context.user.id,
        tenantId: tenantContext.tenantId,
        action: 'RATE_LIMIT_EXCEEDED',
        resource: 'PaymentGateway',
        details: { limit: RATE_LIMIT_MAX_REQUESTS, window: RATE_LIMIT_WINDOW },
        status: 'warning',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });
      
      return NextResponse.json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateCheck.retryAfter
      }, { 
        status: 429,
        headers: {
          'Retry-After': rateCheck.retryAfter?.toString() || '900'
        }
      });
    }
    
    // Parse and validate request body
    const requestBody = await request.json();
    const validation = PaymentActionSchema.safeParse(requestBody);
    
    if (!validation.success) {
      await auditLog({
        userId: context.user.id,
        tenantId: tenantContext.tenantId,
        action: 'INVALID_REQUEST',
        resource: 'PaymentGateway',
        details: { errors: validation.error.errors, body: requestBody },
        status: 'failure',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });
      
      return NextResponse.json({
        success: false,
        message: 'Invalid request format',
        code: 'VALIDATION_ERROR',
        errors: validation.error.errors
      }, { status: 400 });
    }
    
    const { action, payload } = validation.data;
    auditDetails = { action, payloadKeys: payload ? Object.keys(payload) : [] };

    // Add tenant context to payload for downstream processing
    const enhancedPayload = {
      ...payload,
      tenantId: tenantContext.tenantId,
      userId: context.user.id,
      userRole: context.user.role
    };
    
    let result;
    
    switch (action) {
      case 'initializePayment':
        if (!payload?.amount || !payload?.email || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Amount, email, and provider are required for payment initialization'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.initializePayment(enhancedPayload);
        break;
        
      case 'verifyPayment':
        if (!payload?.reference || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Reference and provider are required for payment verification'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.verifyPayment(enhancedPayload);
        break;
        
      case 'createCustomer':
        if (!payload?.email || !payload?.first_name || !payload?.last_name || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Email, first name, last name, and provider are required for customer creation'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.createCustomer(enhancedPayload);
        break;
        
      case 'createSubscription':
        if (!payload?.planCode || !payload?.customerId || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Plan code, customer ID, and provider are required for subscription creation'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.createSubscription(enhancedPayload);
        break;
        
      case 'processRefund':
        if (!payload?.transactionId || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Transaction ID and provider are required for refund processing'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.processRefund(enhancedPayload);
        break;
        
      case 'getPaymentStatus':
        if (!payload?.transactionId || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Transaction ID and provider are required for payment status'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.getPaymentStatus(enhancedPayload);
        break;
        
      case 'validateWebhook':
        if (!payload?.body || !payload?.signature || !payload?.provider) {
          return NextResponse.json({
            success: false,
            message: 'Body, signature, and provider are required for webhook validation'
          }, { status: 400 });
        }
        result = await paymentGatewayCoreCell.validateWebhook(enhancedPayload);
        break;

      // Additional helper actions for the UI
      case 'getTransactionHistory':
        // Get tenant-specific transaction history
        result = {
          success: true,
          data: {
            transactions: [],
            tenantId: tenantContext.tenantId,
            requestedBy: context.user.id
          },
          message: 'Transaction history retrieved successfully'
        };
        break;

      case 'getCustomers':
        // Get tenant-specific customers
        result = {
          success: true,
          data: {
            customers: [],
            tenantId: tenantContext.tenantId,
            requestedBy: context.user.id
          },
          message: 'Customers retrieved successfully'
        };
        break;

      case 'getSupportedCurrencies':
        result = {
          success: true,
          data: {
            currencies: [
              { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
              { code: 'USD', name: 'US Dollar', symbol: '$' },
              { code: 'EUR', name: 'Euro', symbol: '€' },
              { code: 'GBP', name: 'British Pound', symbol: '£' },
              { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
              { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
              { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
              { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
              { code: 'RWF', name: 'Rwandan Franc', symbol: 'RF' }
            ]
          },
          message: 'Supported currencies retrieved successfully'
        };
        break;

      case 'getPaymentProviders':
        result = {
          success: true,
          data: {
            providers: [
              {
                id: 'paystack',
                name: 'Paystack',
                description: 'Nigerian leader in online payments',
                supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS'],
                paymentMethods: ['card', 'bank', 'ussd', 'mobile_money', 'qr'],
                features: ['one_time_payments', 'subscriptions', 'refunds', 'webhooks']
              },
              {
                id: 'flutterwave',
                name: 'Flutterwave',
                description: 'Pan-African payment infrastructure',
                supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'UGX', 'ZAR', 'GHS', 'RWF'],
                paymentMethods: ['card', 'bank', 'ussd', 'mobile_money', 'mpesa', 'rwanda_momo'],
                features: ['one_time_payments', 'subscriptions', 'refunds', 'webhooks']
              },
              {
                id: 'interswitch',
                name: 'Interswitch',
                description: 'Nigerian payment processing pioneer',
                supportedCurrencies: ['NGN', 'USD'],
                paymentMethods: ['card', 'ussd', 'bank_transfer', 'qr_code', 'verve'],
                features: ['one_time_payments', 'subscriptions', 'refunds', 'webhooks']
              }
            ]
          },
          message: 'Payment providers retrieved successfully'
        };
        break;

      default:
        return NextResponse.json({
          success: false,
          message: `Unsupported action: ${action}`
        }, { status: 400 });
    }

    // Audit successful operation
    await auditLog({
      userId: context.user.id,
      tenantId: tenantContext.tenantId,
      action: action.toUpperCase(),
      resource: 'PaymentGateway',
      details: { ...auditDetails, duration: Date.now() - startTime, success: result?.success },
      status: result?.success ? 'success' : 'failure',
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });
    
    // Handle different return shapes - normalize to consistent envelope
    const success = result?.success || false;
    const message = result?.message || 'Operation completed';
    const data = (result && 'data' in result) ? result.data : result;

    const response = NextResponse.json({
      success,
      message,
      data,
      meta: {
        tenantId: tenantContext.tenantId,
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    });

    // Add security headers for payment operations
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Set cache control for payment data
    if (action.includes('Payment') || action.includes('Transaction')) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
    }

    return response;

  } catch (error) {
    console.error('PaymentGatewayCore Cell API Error:', error);
    
    // Enhanced error logging for payment operations
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      tenantId: tenantContext?.tenantId,
      userId: context.user.id
    };

    // Audit the error
    if (tenantContext) {
      await auditLog({
        userId: context.user.id,
        tenantId: tenantContext.tenantId,
        action: 'SYSTEM_ERROR',
        resource: 'PaymentGateway',
        details: { error: errorDetails, duration: Date.now() - startTime },
        status: 'failure',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });
    }

    console.error('Payment Gateway Error Details:', errorDetails);
    
    return NextResponse.json({
      success: false,
      message: 'Payment service temporarily unavailable',
      code: 'SYSTEM_ERROR',
      error: process.env.NODE_ENV === 'development' ? errorDetails : 'Internal server error'
    }, { status: 500 });
  }
}, { requiredRole: 'User' }); // Minimum role required for payment operations

export async function POST(request: NextRequest) {
  return securePostHandler(request);
}

// Handle webhook endpoints for payment providers
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'health':
        return NextResponse.json({
          success: true,
          message: 'Payment Gateway Core is operational',
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            providers: ['paystack', 'flutterwave', 'interswitch']
          }
        });

      case 'config':
        return NextResponse.json({
          success: true,
          message: 'Payment gateway configuration retrieved',
          data: {
            supportedProviders: ['paystack', 'flutterwave', 'interswitch'],
            supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF'],
            features: {
              oneTimePayments: true,
              subscriptions: true,
              refunds: true,
              webhooks: true,
              multiCurrency: true,
              auditLogging: true
            },
            security: {
              pciCompliant: true,
              tokenization: true,
              encryption: true,
              webhookValidation: true
            }
          }
        });

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid GET action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('PaymentGatewayCore GET Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Service unavailable'
    }, { status: 500 });
  }
}

// Handle webhooks from payment providers
export async function PUT(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-paystack-signature') || 
                      request.headers.get('verif-hash') || 
                      request.headers.get('x-interswitch-signature') || '';

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') as 'paystack' | 'flutterwave' | 'interswitch';

    if (!provider || !['paystack', 'flutterwave', 'interswitch'].includes(provider)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid provider'
      }, { status: 400 });
    }

    const result = await paymentGatewayCoreCell.validateWebhook({
      body,
      signature,
      provider
    });

    if (result.success) {
      // Here you would typically:
      // 1. Update transaction status in database
      // 2. Send notifications to relevant parties
      // 3. Trigger business logic based on event type
      // 4. Log the webhook event for audit purposes

      console.log(`${provider} webhook processed successfully:`, (result && 'data' in result) ? result.data : result);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({
      success: false,
      message: 'Webhook processing failed'
    }, { status: 500 });
  }
}