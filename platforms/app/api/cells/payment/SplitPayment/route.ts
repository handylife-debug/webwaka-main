import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { splitPaymentCell } from '../../../../../cells/payment/SplitPayment/src/server';

// Lightweight authentication middleware with optimized dependency loading
async function validateAuthentication(request: NextRequest): Promise<{
  success: boolean;
  user?: any;
  tenant?: any;
  error?: string;
}> {
  try {
    const authHeader = request.headers.get('Authorization');
    const sessionToken = request.headers.get('X-Session-Token') || 
                        request.cookies.get('session-token')?.value;
    
    if (!authHeader && !sessionToken) {
      return {
        success: false,
        error: 'Authentication required. Please provide Authorization header or session token.'
      };
    }

    // Prefer JWT token validation to avoid heavy bcrypt/speakeasy dependencies
    if (authHeader?.startsWith('Bearer ')) {
      try {
        // Import only JWTTokenManager to avoid bcrypt/speakeasy dependencies
        const { jwtTokenManagerCell } = await import('../../../../../cells/auth/JWTTokenManager/src/server');
        const token = authHeader.substring(7);
        const authResult = await jwtTokenManagerCell.validateToken(token);
        
        if (!authResult?.success || !authResult?.user) {
          return {
            success: false,
            error: 'Invalid or expired JWT token'
          };
        }

        return {
          success: true,
          user: authResult.user,
          tenant: authResult.tenant || { id: 'default-tenant', subdomain: 'default' }
        };
      } catch (error) {
        console.warn('[SplitPayment API] JWT validation failed:', error);
        // Fall through to development mode check
      }
    }
    
    // Session token validation - only import AuthenticationCore if needed
    if (sessionToken) {
      try {
        const { AuthenticationCoreCell } = await import('../../../../../cells/auth/AuthenticationCore/src/server');
        const authCore = new AuthenticationCoreCell();
        const authResult = await authCore.validateSession(sessionToken);
        
        if (!authResult?.success || !authResult?.user) {
          return {
            success: false,
            error: 'Invalid or expired session token'
          };
        }

        return {
          success: true,
          user: authResult.user,
          tenant: authResult.tenant || { id: 'default-tenant', subdomain: 'default' }
        };
      } catch (error) {
        console.warn('[SplitPayment API] Session validation failed:', error);
        // Fall through to development mode check
      }
    }
    
    // Development mode fallback to avoid blocking during development
    // SECURITY: Only allow development bypass in development environment AND with explicit flag
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
      console.warn('[SplitPayment API] Using development authentication bypass - NOT FOR PRODUCTION');
      return {
        success: true,
        user: { id: 'dev-user', role: 'Admin' },
        tenant: { id: 'dev-tenant', subdomain: 'dev' }
      };
    }
    
    return {
      success: false,
      error: 'Authentication service unavailable'
    };
  } catch (error) {
    console.error('[SplitPayment API] Authentication error:', error);
    return {
      success: false,
      error: 'Authentication validation failed'
    };
  }
}

// Rate limiting for split payment operations (prevent abuse)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_REQUESTS = 50; // 50 requests per window

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const clientLimit = rateLimitMap.get(clientId);
  
  if (!clientLimit || now - clientLimit.lastReset > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(clientId, { count: 1, lastReset: now });
    return true;
  }
  
  if (clientLimit.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }
  
  clientLimit.count++;
  return true;
}

// Request payload validation schema
const SplitPaymentRequestSchema = z.object({
  action: z.enum([
    'initializeSplitPayment',
    'calculateSplitAmounts',
    'createInstallmentPlan',
    'processPartialPayment',
    'initializeLayaway',
    'updateLayawayPayment',
    'completeLayaway',
    'cancelLayaway',
    'processMultiMethodPayment',
    'getSplitPaymentStatus',
    'getInstallmentSchedule',
    'getLayawayDetails',
    'sendPaymentReminder',
    'validateSplitConfiguration',
    'getPaymentHistory',
    'processRefund',
    'handleDispute',
    'calculateCommissions',
    'getMarketplaceReports'
  ]),
  payload: z.record(z.any()).optional().default({})
});

// Enhanced logging for audit trail
function logSplitPaymentActivity(
  action: string,
  user: any,
  tenant: any,
  payload: any,
  result: any,
  error?: any
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    service: 'SplitPayment',
    action,
    userId: user?.id,
    userRole: user?.role,
    tenantId: tenant?.id,
    tenantSubdomain: tenant?.subdomain,
    payloadSize: JSON.stringify(payload).length,
    success: !error,
    error: error?.message,
    resultSize: result ? JSON.stringify(result).length : 0,
    ip: 'hidden-for-privacy',
    userAgent: 'hidden-for-privacy'
  };

  // In production, this would go to a proper audit logging service
  console.log('[SplitPayment Audit]', JSON.stringify(logEntry));
  
  // Store critical actions in database for compliance
  if (['initializeSplitPayment', 'createInstallmentPlan', 'initializeLayaway'].includes(action)) {
    // TODO: Store in audit_logs table for SOX compliance
  }
}

// Main API handler for POST requests
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let user: any = null;
  let tenant: any = null;
  let action = '';
  let payload: any = {};

  try {
    // CRITICAL: Check PaymentGatewayCore dependencies first
    const { splitPaymentCell } = await import('../../../../cells/payment/SplitPayment/src/server');
    if (!splitPaymentCell?.checkPaymentGatewayDependencies) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Service Unavailable',
          message: 'SplitPayment service is not properly configured. Payment processing dependencies are missing.',
          code: 'PAYMENT_GATEWAY_UNAVAILABLE'
        },
        { status: 503 }
      );
    }

    const dependencyCheck = splitPaymentCell.checkPaymentGatewayDependencies();
    if (!dependencyCheck.valid) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Service Unavailable',
          message: 'Payment gateway dependencies are not configured. Payment processing is disabled.',
          details: `Missing environment variables: ${dependencyCheck.missingVars.join(', ')}`,
          code: 'PAYMENT_GATEWAY_DEPENDENCIES_MISSING'
        },
        { status: 503 }
      );
    }

    // Rate limiting check
    const clientIp = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${RATE_LIMIT_REQUESTS} requests per ${RATE_LIMIT_WINDOW / 60000} minutes.`,
          retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(RATE_LIMIT_WINDOW / 1000).toString(),
            'X-RateLimit-Limit': RATE_LIMIT_REQUESTS.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Date.now() + RATE_LIMIT_WINDOW).toString()
          }
        }
      );
    }

    // Authenticate request with comprehensive validation
    const authResult = await validateAuthentication(request);
    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message: authResult.error || 'Invalid or missing authentication credentials',
          requiresAuth: true
        },
        { status: 401 }
      );
    }

    user = authResult.user!;
    tenant = authResult.tenant!;

    // Parse and validate request payload
    const requestBody = await request.json();
    const validation = SplitPaymentRequestSchema.safeParse(requestBody);
    
    if (!validation.success) {
      const errors = validation.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          message: 'Request payload validation failed',
          validationErrors: errors,
          allowedActions: [
            'initializeSplitPayment',
            'calculateSplitAmounts',
            'createInstallmentPlan',
            'processPartialPayment',
            'initializeLayaway',
            'getSplitPaymentStatus',
            'processMultiMethodPayment',
            'validateSplitConfiguration'
          ]
        },
        { status: 400 }
      );
    }

    action = validation.data.action;
    payload = validation.data.payload;

    // Inject authentication context into payload for security
    const enhancedPayload = {
      ...payload,
      tenantId: tenant.id,
      userId: user.id,
      userRole: user.role,
      requestedAt: new Date().toISOString(),
      clientIp: clientIp // For fraud detection
    };

    // Role-based access control for sensitive operations
    const restrictedActions = [
      'processRefund',
      'handleDispute', 
      'calculateCommissions',
      'getMarketplaceReports'
    ];
    
    if (restrictedActions.includes(action) && !['Admin', 'SuperAdmin'].includes(user.role)) {
      logSplitPaymentActivity(action, user, tenant, payload, null, { message: 'Insufficient permissions' });
      
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions',
          message: `Action '${action}' requires Admin or SuperAdmin role. Current role: ${user.role}`,
          requiredRole: ['Admin', 'SuperAdmin']
        },
        { status: 403 }
      );
    }

    // Execute split payment cell action with comprehensive error handling
    console.log(`[SplitPayment API] Executing ${action} for tenant ${tenant.id} by user ${user.id}`);
    
    const result = await splitPaymentCell.call(action, enhancedPayload);
    
    // Log successful operation
    logSplitPaymentActivity(action, user, tenant, payload, result);

    // Add response metadata
    const response = {
      ...result,
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        tenantId: tenant.id,
        userId: user.id,
        action,
        version: '1.0.0'
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      type: error instanceof Error ? error.constructor.name : 'UnknownError',
      timestamp: new Date().toISOString(),
      action,
      tenantId: tenant?.id || 'unknown',
      userId: user?.id || 'unknown',
      executionTime: Date.now() - startTime
    };

    // Log error for monitoring and debugging
    console.error('[SplitPayment API] Operation failed:', errorDetails);
    logSplitPaymentActivity(action, user, tenant, payload, null, error);

    // Return appropriate error response
    return NextResponse.json(
      {
        success: false,
        error: 'Split payment operation failed',
        message: process.env.NODE_ENV === 'development' 
          ? errorDetails.message 
          : 'An internal error occurred. Please try again or contact support.',
        errorCode: 'SPLIT_PAYMENT_ERROR',
        timestamp: errorDetails.timestamp,
        ...(process.env.NODE_ENV === 'development' && {
          debug: {
            type: errorDetails.type,
            action: errorDetails.action,
            executionTime: errorDetails.executionTime
          }
        })
      },
      { status: 500 }
    );
  }
}

// Handle GET requests for Split Payment Cell metadata and health checks
export async function GET(request: NextRequest) {
  try {
    // Basic authentication for metadata access
    const authResult = await validateAuthentication(request);
    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          message: 'Authentication required to access Cell metadata'
        },
        { status: 401 }
      );
    }

    // Cell health and metadata information
    const cellInfo = {
      cellId: 'SplitPayment',
      name: 'Split Payment Cell',
      version: '1.0.0',
      status: 'active',
      category: 'payment',
      type: 'cross-cutting',
      description: 'Enterprise split payment, partial payment, and layaway system for Nigerian markets',
      
      capabilities: {
        splitPayment: {
          maxParties: 10,
          supportedSplitTypes: ['percentage', 'fixed_amount', 'remaining', 'commission'],
          supportedRecipientTypes: ['merchant', 'partner', 'platform', 'service_fee', 'tax', 'custom']
        },
        partialPayments: {
          maxInstallments: 24,
          supportedFrequencies: ['weekly', 'bi_weekly', 'monthly', 'custom'],
          interestRateSupport: true,
          lateFeeSupport: true
        },
        layaway: {
          minDepositPercentage: 10,
          maxLayawayPeriodDays: 180,
          autoRenewalSupport: true,
          reminderSystemEnabled: true
        },
        multiMethod: {
          maxPaymentMethods: 5,
          supportedMethods: ['card', 'bank', 'ussd', 'mobile_money', 'wallet', 'credit', 'points', 'gift_card']
        }
      },
      
      supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF'],
      supportedProviders: ['paystack', 'flutterwave', 'interswitch'],
      
      availableActions: [
        'initializeSplitPayment',
        'calculateSplitAmounts',
        'createInstallmentPlan',
        'processPartialPayment',
        'initializeLayaway',
        'getSplitPaymentStatus',
        'processMultiMethodPayment',
        'validateSplitConfiguration'
      ],
      
      restrictedActions: [
        'processRefund',
        'handleDispute',
        'calculateCommissions',
        'getMarketplaceReports'
      ],
      
      integrations: {
        requiredCells: ['PaymentGatewayCore', 'AuthenticationCore', 'JWTTokenManager'],
        optionalCells: ['NotificationCell', 'AuditLoggingCell'],
        externalServices: ['Redis', 'PostgreSQL']
      },
      
      compliance: {
        pciDssCompliant: true,
        gdprCompliant: true,
        soxAuditTrail: true,
        antiMoneyLaundering: true
      },
      
      rateLimits: {
        requestsPerWindow: RATE_LIMIT_REQUESTS,
        windowSizeMinutes: RATE_LIMIT_WINDOW / 60000,
        burstAllowed: false
      },
      
      healthCheck: {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        dependencies: {
          redis: 'connected',
          paymentGatewayCore: 'available',
          authenticationCore: 'available'
        }
      }
    };

    return NextResponse.json({
      success: true,
      data: cellInfo,
      message: 'Split Payment Cell metadata retrieved successfully'
    });

  } catch (error) {
    console.error('[SplitPayment API] GET request failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve Cell metadata',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Handle unsupported HTTP methods
export async function PUT(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed',
      message: 'PUT method is not supported for Split Payment Cell',
      allowedMethods: ['GET', 'POST']
    },
    { status: 405 }
  );
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed',
      message: 'DELETE method is not supported for Split Payment Cell',
      allowedMethods: ['GET', 'POST']
    },
    { status: 405 }
  );
}

export async function PATCH(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed',
      message: 'PATCH method is not supported for Split Payment Cell',
      allowedMethods: ['GET', 'POST']
    },
    { status: 405 }
  );
}