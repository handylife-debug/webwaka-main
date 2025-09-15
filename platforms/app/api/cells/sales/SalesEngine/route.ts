import { NextRequest, NextResponse } from 'next/server';
import { salesEngineCell } from '@/cells/sales/SalesEngine/src/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { getCurrentUser } from '@/lib/auth-server';
import { z } from 'zod';

// Rate limiting and security imports
import { headers } from 'next/headers';

// Request validation schema
const SalesEngineRequestSchema = z.object({
  action: z.enum([
    'initializeCart',
    'addToCart', 
    'updateCartItem',
    'removeFromCart',
    'clearCart',
    'getCart',
    'applyDiscount',
    'removeDiscount',
    'calculateTax',
    'calculateTotal',
    'validateTransaction',
    'processPayment',
    'processRefund',
    'cancelTransaction',
    'suspendTransaction',
    'resumeTransaction',
    'generateReceipt',
    'printReceipt',
    'emailReceipt',
    'smsReceipt',
    'holdTransaction',
    'voidTransaction',
    'splitPayment',
    'layawayPayment',
    'installmentPayment',
    'loyaltyPointsRedemption',
    'loyaltyPointsEarn',
    'stockAdjustment',
    'priceOverride',
    'managerApproval',
    'offlineSync',
    'validateInventory',
    'reserveStock',
    'releaseStock'
  ]),
  // Data varies by action, will be validated per action
  sessionId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  cartItemId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'product_specific', 'category', 'customer_tier']).optional(),
  discountValue: z.number().min(0).optional(),
  discountCode: z.string().max(50).optional(),
  paymentMethods: z.array(z.object({
    method: z.enum(['cash', 'card', 'mobile_money', 'bank_transfer', 'split_payment']),
    amount: z.number().min(0.01),
    provider: z.enum(['paystack', 'flutterwave', 'interswitch', 'cash']).optional(),
    reference: z.string().max(255).optional(),
    metadata: z.record(z.any()).optional()
  })).optional(),
  customerInfo: z.object({
    name: z.string().max(255).optional(),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
    address: z.string().max(500).optional(),
    type: z.enum(['individual', 'business', 'corporate', 'government']).optional()
  }).optional(),
  receiptPreferences: z.object({
    printReceipt: z.boolean().default(true),
    emailReceipt: z.boolean().default(false),
    smsReceipt: z.boolean().default(false),
    language: z.enum(['en', 'ha', 'yo', 'ig']).default('en')
  }).optional(),
  refundType: z.enum(['full', 'partial', 'item_specific']).optional(),
  refundAmount: z.number().min(0).optional(),
  refundReason: z.enum(['defective', 'wrong_item', 'customer_request', 'policy_return', 'damaged']).optional(),
  cashierId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  terminalId: z.string().max(100).optional(),
  customerId: z.string().uuid().optional(),
  currency: z.enum(['NGN', 'USD', 'GBP']).optional(),
  notes: z.string().max(1000).optional(),
  overridePrice: z.boolean().optional(),
  discountId: z.string().uuid().optional(),
  targetProductIds: z.array(z.string().uuid()).optional(),
  minimumPurchase: z.number().min(0).optional(),
  maximumDiscount: z.number().min(0).optional(),
  taxableAmount: z.number().min(0).optional(),
  customerType: z.enum(['individual', 'business', 'corporate', 'government']).optional(),
  exemptions: z.array(z.string()).optional(),
  region: z.string().optional(),
  refundItems: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().min(0.01),
    reason: z.string().max(500)
  })).optional(),
  format: z.enum(['pdf', 'html', 'thermal', 'json']).optional(),
  language: z.enum(['en', 'ha', 'yo', 'ig']).optional(),
  includeTaxBreakdown: z.boolean().optional(),
  includeQRCode: z.boolean().optional(),
  includePromotions: z.boolean().optional(),
  performInventoryCheck: z.boolean().optional(),
  validateCustomer: z.boolean().optional(),
  checkPaymentLimits: z.boolean().optional()
});

// Security validation
async function validateSalesEngineAccess(request: NextRequest, tenantId: string, action: string) {
  // Validate tenant access
  const hasAccess = await validateTenantAccess(tenantId, request);
  if (!hasAccess) {
    throw new Error('Unauthorized access to tenant');
  }

  // Get current user for authorization
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('Authentication required');
  }

  // Role-based authorization for sensitive actions
  const restrictedActions = [
    'priceOverride', 
    'managerApproval', 
    'voidTransaction', 
    'processRefund',
    'stockAdjustment'
  ];

  if (restrictedActions.includes(action)) {
    const userRoles = currentUser.role ? [currentUser.role] : [];
    const hasPermission = userRoles.includes('Admin') || 
                         userRoles.includes('SuperAdmin');
    
    if (!hasPermission) {
      throw new Error(`Insufficient permissions for action: ${action}`);
    }
  }

  return { currentUser, hasAccess: true };
}

// Audit logging for sales operations
async function logSalesOperation(
  tenantId: string, 
  userId: string, 
  action: string, 
  data: any, 
  result: any, 
  request: NextRequest
) {
  try {
    const auditData = {
      tenant_id: tenantId,
      user_id: userId,
      event_type: 'sales_operation',
      event_action: action,
      event_result: result.success ? 'success' : 'failure',
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 '127.0.0.1',
      user_agent: request.headers.get('user-agent') || 'Unknown',
      resource_type: 'sales_engine',
      resource_id: data.sessionId || data.transactionId || 'unknown',
      event_details: {
        action,
        input_data: {
          ...data,
          // Remove sensitive payment data from logs
          paymentMethods: data.paymentMethods?.map((pm: any) => ({
            method: pm.method,
            amount: pm.amount,
            provider: pm.provider
            // Exclude sensitive references and metadata
          }))
        },
        result_summary: {
          success: result.success,
          message: result.message,
          error: result.error
        }
      }
    };

    // Log to audit system (assuming audit service exists)
    console.log('Sales Operation Audit:', JSON.stringify(auditData, null, 2));
    
  } catch (error) {
    console.error('Failed to log sales operation:', error);
    // Don't fail the main operation due to logging issues
  }
}

// Main POST handler
export async function POST(request: NextRequest) {
  let tenantId: string = '';
  let currentUser: any = null;
  let requestData: any = {};

  try {
    // SECURITY: Get tenant context from subdomain, never from client input
    const tenantContext = await getTenantContext(request);
    tenantId = tenantContext.tenantId;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = SalesEngineRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({
        success: false,
        message: 'Invalid request format',
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      }, { status: 400 });
    }

    requestData = validationResult.data;
    const { action, ...actionData } = requestData;

    // Validate access and authorization
    const authResult = await validateSalesEngineAccess(request, tenantId, action);
    currentUser = authResult.currentUser;

    // Rate limiting check (simple implementation)
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    '127.0.0.1';
    
    // TODO: Implement proper rate limiting with Redis
    
    // Execute sales engine operation
    let result: any;
    
    switch (action) {
      case 'initializeCart':
        result = await salesEngineCell.initializeCart(actionData, tenantId);
        break;
        
      case 'addToCart':
        result = await salesEngineCell.addToCart(actionData, tenantId);
        break;
        
      case 'updateCartItem':
        result = await salesEngineCell.updateCartItem(actionData, tenantId);
        break;
        
      case 'removeFromCart':
        result = await salesEngineCell.removeFromCart(actionData, tenantId);
        break;
        
      case 'applyDiscount':
        result = await salesEngineCell.applyDiscount(actionData, tenantId);
        break;
        
      case 'calculateTax':
        result = await salesEngineCell.calculateTax(actionData, tenantId);
        break;
        
      case 'processPayment':
        // Enhanced logging for payment operations
        console.log(`Processing payment for tenant ${tenantId}, user ${currentUser.id}`);
        result = await salesEngineCell.processPayment(actionData, tenantId);
        break;
        
      case 'processRefund':
        // Additional authorization check for refunds
        if (!currentUser.roles?.includes('Admin') && !currentUser.roles?.includes('SuperAdmin')) {
          return NextResponse.json({
            success: false,
            message: 'Manager approval required for refunds'
          }, { status: 403 });
        }
        result = await salesEngineCell.processRefund(actionData, tenantId);
        break;
        
      case 'generateReceipt':
        result = await salesEngineCell.generateReceipt(actionData, tenantId);
        break;
        
      case 'validateTransaction':
        result = await salesEngineCell.validateTransaction(actionData, tenantId);
        break;
        
      case 'getCart':
        // Simple cart retrieval
        result = {
          success: true,
          cart: await salesEngineCell.getActiveCartSession(tenantId, actionData.sessionId),
          message: 'Cart retrieved successfully'
        };
        break;
        
      case 'clearCart':
        // Clear cart by setting status to cancelled
        const cartSession = await salesEngineCell.getActiveCartSession(tenantId, actionData.sessionId);
        if (cartSession) {
          cartSession.status = 'cancelled';
          cartSession.items = [];
          cartSession.subtotal = 0;
          cartSession.total = 0;
          cartSession.discounts = [];
          cartSession.taxes = [];
          cartSession.fees = [];
          await salesEngineCell.saveCartSession(cartSession);
          result = { success: true, message: 'Cart cleared successfully' };
        } else {
          result = { success: false, message: 'Cart not found' };
        }
        break;
        
      case 'suspendTransaction':
        const suspendCartSession = await salesEngineCell.getActiveCartSession(tenantId, actionData.sessionId);
        if (suspendCartSession) {
          suspendCartSession.status = 'suspended';
          await salesEngineCell.saveCartSession(suspendCartSession);
          result = { success: true, message: 'Transaction suspended successfully' };
        } else {
          result = { success: false, message: 'Cart not found' };
        }
        break;
        
      case 'resumeTransaction':
        const resumeCartSession = await salesEngineCell.getActiveCartSession(tenantId, actionData.sessionId);
        if (resumeCartSession && resumeCartSession.status === 'suspended') {
          resumeCartSession.status = 'active';
          await salesEngineCell.saveCartSession(resumeCartSession);
          result = { success: true, cart: resumeCartSession, message: 'Transaction resumed successfully' };
        } else {
          result = { success: false, message: 'Suspended cart not found' };
        }
        break;
        
      default:
        return NextResponse.json({
          success: false,
          message: 'Unknown action',
          error: `Action '${action}' is not supported`
        }, { status: 400 });
    }

    // Log the operation for audit trail
    await logSalesOperation(tenantId, currentUser.id, action, actionData, result, request);

    // Return success response
    return NextResponse.json({
      success: result.success,
      ...result,
      metadata: {
        action,
        tenantId,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        requestId: request.headers.get('x-request-id') || 'unknown'
      }
    }, { 
      status: result.success ? 200 : 400 
    });

  } catch (error) {
    console.error('SalesEngine API error:', error);
    
    // Log the error operation
    if (tenantId && currentUser) {
      await logSalesOperation(tenantId, currentUser.id, requestData.action || 'unknown', requestData, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, request);
    }

    // Determine appropriate error status
    let status = 500;
    let message = 'Internal server error';
    
    if (error instanceof Error) {
      if (error.message.includes('Unauthorized') || error.message.includes('Authentication')) {
        status = 401;
        message = 'Authentication required';
      } else if (error.message.includes('permissions') || error.message.includes('access')) {
        status = 403;
        message = 'Insufficient permissions';
      } else if (error.message.includes('not found') || error.message.includes('Invalid')) {
        status = 400;
        message = error.message;
      } else {
        message = 'Sales engine operation failed';
      }
    }

    return NextResponse.json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? 
        (error instanceof Error ? error.message : 'Unknown error') : 
        'Operation failed',
      metadata: {
        action: requestData.action || 'unknown',
        tenantId,
        timestamp: new Date().toISOString(),
        requestId: request.headers.get('x-request-id') || 'unknown'
      }
    }, { status });
  }
}

// GET handler for retrieving sales data
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from subdomain
    const tenantContext = await getTenantContext(request);
    const tenantId = tenantContext.tenantId;
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      return NextResponse.json({ 
        success: false, 
        message: 'Unauthorized access to tenant' 
      }, { status: 403 });
    }

    // Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ 
        success: false, 
        message: 'Authentication required' 
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation');
    const sessionId = searchParams.get('sessionId');

    let result: any;

    switch (operation) {
      case 'getCart':
        if (!sessionId) {
          return NextResponse.json({
            success: false,
            message: 'Session ID required'
          }, { status: 400 });
        }
        
        const cart = await salesEngineCell.getActiveCartSession(tenantId, sessionId);
        result = {
          success: true,
          cart,
          message: cart ? 'Cart retrieved successfully' : 'Cart not found'
        };
        break;
        
      case 'getActiveSessions':
        // TODO: Implement active sessions retrieval
        result = {
          success: true,
          sessions: [],
          message: 'Active sessions retrieved successfully'
        };
        break;
        
      default:
        return NextResponse.json({
          success: false,
          message: 'Unknown operation',
          error: `Operation '${operation}' is not supported`
        }, { status: 400 });
    }

    return NextResponse.json({
      success: result.success,
      ...result,
      metadata: {
        operation,
        tenantId,
        userId: currentUser.id,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('SalesEngine GET error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve sales data',
      error: process.env.NODE_ENV === 'development' ? 
        (error instanceof Error ? error.message : 'Unknown error') : 
        'Retrieval failed'
    }, { status: 500 });
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}