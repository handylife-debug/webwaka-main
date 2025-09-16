import { NextRequest, NextResponse } from 'next/server';
import { inventoryTrackingCell } from '@/cells/inventory/InventoryTracking/src/server';
import { jwtTokenManagerCell } from '@/cells/auth/JWTTokenManager/src/server';
import { getTenantContext } from '@/lib/tenant-context';

// Types for API requests
interface InventoryTrackingRequest {
  action: string;
  tenantId: string;
  [key: string]: any;
}

// Allowed actions for the InventoryTracking cell
const ALLOWED_ACTIONS = [
  'updateStockLevel',
  'getStockLevels',
  'transferStock',
  'stockAdjustment',
  'stockAudit',
  'reserveStock',
  'releaseReservation',
  'getLowStockAlerts',
  'generateReorderSuggestions',
  'stockMovementHistory',
  'inventoryValuation'
];

// Rate limiting configuration per action
const RATE_LIMITS = {
  'updateStockLevel': 100, // Max 100 stock updates per minute
  'getStockLevels': 200,   // Max 200 queries per minute
  'transferStock': 50,     // Max 50 transfer requests per minute
  'stockAdjustment': 30,   // Max 30 adjustments per minute
  'stockAudit': 10,        // Max 10 audit operations per minute
  'reserveStock': 200,     // Max 200 reservations per minute
  'releaseReservation': 200, // Max 200 releases per minute
  'getLowStockAlerts': 100,  // Max 100 alert queries per minute
  'generateReorderSuggestions': 20, // Max 20 suggestion generations per minute
  'stockMovementHistory': 100, // Max 100 history queries per minute
  'inventoryValuation': 10   // Max 10 valuations per minute
};

// Input validation schemas per action
const validateInput = (action: string, input: any): { valid: boolean; error?: string } => {
  try {
    switch (action) {
      case 'updateStockLevel':
        if (!input.productId || !input.locationId || typeof input.quantity !== 'number') {
          return { valid: false, error: 'Product ID, location ID, and quantity are required' };
        }
        if (!['in', 'out', 'adjustment', 'transfer', 'return', 'loss'].includes(input.movement_type)) {
          return { valid: false, error: 'Invalid movement type' };
        }
        if (!input.performed_by) {
          return { valid: false, error: 'User ID is required for audit trail' };
        }
        break;

      case 'getStockLevels':
        // Optional filters - no strict validation needed
        if (input.limit && (typeof input.limit !== 'number' || input.limit > 1000)) {
          return { valid: false, error: 'Limit must be a number not exceeding 1000' };
        }
        break;

      case 'transferStock':
        if (!input.productId || !input.fromLocationId || !input.toLocationId || 
            typeof input.quantity !== 'number' || input.quantity <= 0) {
          return { valid: false, error: 'Product ID, source/destination locations, and positive quantity are required' };
        }
        if (input.fromLocationId === input.toLocationId) {
          return { valid: false, error: 'Source and destination locations must be different' };
        }
        if (!input.requestedBy) {
          return { valid: false, error: 'User ID is required for transfer requests' };
        }
        break;

      case 'stockAdjustment':
        if (!input.productId || !input.locationId || 
            typeof input.currentStock !== 'number' || typeof input.adjustedStock !== 'number') {
          return { valid: false, error: 'Product ID, location ID, current stock, and adjusted stock are required' };
        }
        if (!input.performedBy) {
          return { valid: false, error: 'User ID is required for audit trail' };
        }
        break;

      case 'stockAudit':
        if (!input.locationId || !input.plannedDate || !input.assignedTo) {
          return { valid: false, error: 'Location ID, planned date, and assigned user are required' };
        }
        break;

      case 'reserveStock':
        if (!input.productId || !input.locationId || 
            typeof input.quantity !== 'number' || input.quantity <= 0) {
          return { valid: false, error: 'Product ID, location ID, and positive quantity are required' };
        }
        if (!input.reservedBy) {
          return { valid: false, error: 'User ID is required for reservations' };
        }
        break;

      case 'releaseReservation':
        if (!input.reservationId || !input.releaseReason || !input.releasedBy) {
          return { valid: false, error: 'Reservation ID, release reason, and user ID are required' };
        }
        break;

      case 'stockMovementHistory':
        if (input.limit && (typeof input.limit !== 'number' || input.limit > 1000)) {
          return { valid: false, error: 'Limit must be a number not exceeding 1000' };
        }
        if (input.startDate && input.endDate && new Date(input.startDate) > new Date(input.endDate)) {
          return { valid: false, error: 'Start date must be before end date' };
        }
        break;

      case 'inventoryValuation':
        // Optional filters - minimal validation
        break;

      default:
        return { valid: false, error: 'Unknown action' };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid input format' };
  }
};

// Rate limiting helper (simple in-memory implementation)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (key: string, limit: number): boolean => {
  const now = Date.now();
  const windowDuration = 60 * 1000; // 1 minute window
  
  const existing = rateLimitStore.get(key);
  
  if (!existing || now > existing.resetTime) {
    // New window or expired window
    rateLimitStore.set(key, { count: 1, resetTime: now + windowDuration });
    return true;
  }
  
  if (existing.count >= limit) {
    return false; // Rate limit exceeded
  }
  
  existing.count++;
  return true;
};

// Main POST handler for inventory tracking operations
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse request body
    let requestData: InventoryTrackingRequest;
    try {
      requestData = await request.json();
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid JSON in request body',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    const { action, tenantId, ...actionData } = requestData;

    // Validate required fields
    if (!action || !tenantId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Action and tenant ID are required',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Validate action is allowed
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Action '${action}' is not supported`,
          supportedActions: ALLOWED_ACTIONS,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Validate input data for the specific action
    const inputValidation = validateInput(action, actionData);
    if (!inputValidation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Input validation failed: ${inputValidation.error}`,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Verify JWT token and get user context
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    let userContext;
    try {
      const tokenValidation = await jwtTokenManagerCell.validateToken({ token, tokenType: 'access' });
      
      if (!tokenValidation.success || !tokenValidation.data?.valid) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid or expired authentication token',
            timestamp: new Date().toISOString()
          },
          { status: 401 }
        );
      }
      
      userContext = tokenValidation.data.payload;
      if (!userContext || !userContext.userId) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid token payload - missing user context',
            timestamp: new Date().toISOString()
          },
          { status: 401 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Authentication failed',
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    // Verify tenant access
    try {
      const tenantContext = await getTenantContext(request);
      
      // Ensure the requested tenantId matches the request context tenantId
      if (tenantId !== tenantContext.tenantId) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Tenant ID mismatch: Request does not belong to authenticated tenant',
            timestamp: new Date().toISOString()
          },
          { status: 403 }
        );
      }

      // Check if user has access to this tenant (if user context includes tenantId)
      if (userContext.tenantId && userContext.tenantId !== tenantId) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Access denied: User does not belong to this tenant',
            timestamp: new Date().toISOString()
          },
          { status: 403 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Tenant validation failed',
          timestamp: new Date().toISOString()
        },
        { status: 403 }
      );
    }

    // Rate limiting check
    const rateLimitKey = `inventory_${action}_${tenantId}_${userContext.userId}`;
    const rateLimit = RATE_LIMITS[action as keyof typeof RATE_LIMITS] || 60;
    
    if (!checkRateLimit(rateLimitKey, rateLimit)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: 60,
          timestamp: new Date().toISOString()
        },
        { 
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Limit': rateLimit.toString(),
            'X-RateLimit-Remaining': '0'
          }
        }
      );
    }

    // Add user context to action data for audit trails
    const enrichedActionData = {
      ...actionData,
      currentUserId: userContext.userId,
      currentUserEmail: userContext.email || 'unknown'
    };

    // Execute the cell action
    let result;
    try {
      // Route to the appropriate cell method
      switch (action) {
        case 'updateStockLevel':
          result = await inventoryTrackingCell.updateStockLevel(enrichedActionData, tenantId);
          break;
        case 'getStockLevels':
          result = await inventoryTrackingCell.getStockLevels(enrichedActionData, tenantId);
          break;
        case 'transferStock':
          result = await inventoryTrackingCell.transferStock(enrichedActionData, tenantId);
          break;
        case 'stockAdjustment':
          result = await inventoryTrackingCell.stockAdjustment(enrichedActionData, tenantId);
          break;
        case 'stockAudit':
          result = await inventoryTrackingCell.stockAudit(enrichedActionData, tenantId);
          break;
        case 'reserveStock':
          result = await inventoryTrackingCell.reserveStock(enrichedActionData, tenantId);
          break;
        case 'releaseReservation':
          result = await inventoryTrackingCell.releaseReservation(enrichedActionData, tenantId);
          break;
        case 'getLowStockAlerts':
          result = await inventoryTrackingCell.getLowStockAlerts(enrichedActionData, tenantId);
          break;
        case 'generateReorderSuggestions':
          result = await inventoryTrackingCell.generateReorderSuggestions(enrichedActionData, tenantId);
          break;
        case 'stockMovementHistory':
          result = await inventoryTrackingCell.stockMovementHistory(enrichedActionData, tenantId);
          break;
        case 'inventoryValuation':
          result = await inventoryTrackingCell.inventoryValuation(enrichedActionData, tenantId);
          break;
        default:
          return NextResponse.json(
            { 
              success: false, 
              error: `Action '${action}' not implemented`,
              timestamp: new Date().toISOString()
            },
            { status: 501 }
          );
      }
    } catch (cellError) {
      console.error(`[InventoryTracking API] Cell error for action '${action}':`, cellError);
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Internal cell processing error',
          details: process.env.NODE_ENV === 'development' ? String(cellError) : undefined,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    // Calculate response metrics
    const processingTime = Date.now() - startTime;

    // Log successful operations (for debugging/monitoring)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[InventoryTracking API] ${action} completed in ${processingTime}ms for tenant ${tenantId}`);
    }

    // Return successful result with metadata
    return NextResponse.json({
      ...result,
      metadata: {
        action,
        tenantId,
        processingTime,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    }, { 
      status: result.success ? 200 : 400,
      headers: {
        'X-Processing-Time': processingTime.toString(),
        'X-Tenant-ID': tenantId,
        'X-Action': action
      }
    });

  } catch (error) {
    console.error('[InventoryTracking API] Unexpected error:', error);
    
    const processingTime = Date.now() - startTime;
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
        metadata: {
          processingTime,
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}

// GET handler for health check and capability discovery
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'health') {
    return NextResponse.json({
      status: 'healthy',
      service: 'InventoryTracking Cell API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      capabilities: ALLOWED_ACTIONS,
      rateLimit: RATE_LIMITS
    });
  }

  if (action === 'capabilities') {
    return NextResponse.json({
      actions: ALLOWED_ACTIONS.map(actionName => ({
        name: actionName,
        rateLimit: RATE_LIMITS[actionName as keyof typeof RATE_LIMITS] || 60,
        description: getActionDescription(actionName)
      })),
      authentication: 'JWT Bearer token required',
      tenantIsolation: true,
      timestamp: new Date().toISOString()
    });
  }

  return NextResponse.json({
    service: 'InventoryTracking Cell API',
    version: '1.0.0',
    documentation: 'Use POST for operations, GET ?action=health for health check',
    timestamp: new Date().toISOString()
  });
}

// Helper function to provide action descriptions
function getActionDescription(action: string): string {
  const descriptions = {
    'updateStockLevel': 'Update stock quantities with full movement tracking and audit trail',
    'getStockLevels': 'Retrieve current stock levels with filtering and pagination',
    'transferStock': 'Request stock transfers between locations with approval workflow',
    'stockAdjustment': 'Perform stock adjustments with proper audit trails',
    'stockAudit': 'Create and manage comprehensive stock audits',
    'reserveStock': 'Reserve stock for sales or other purposes',
    'releaseReservation': 'Release previously reserved stock',
    'getLowStockAlerts': 'Get alerts for products below reorder points',
    'generateReorderSuggestions': 'AI-driven reorder suggestions based on sales velocity',
    'stockMovementHistory': 'Retrieve detailed stock movement history with filtering',
    'inventoryValuation': 'Calculate inventory valuation using multiple methods (FIFO, LIFO, etc.)'
  };
  return descriptions[action as keyof typeof descriptions] || 'No description available';
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}