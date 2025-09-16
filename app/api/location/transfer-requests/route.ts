import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { withAuth } from '@/lib/auth-middleware';
import { validateQueryParams, validateRequestBody, transferRequestSchema } from '@/lib/location-validation';

export const GET = withAuth(async function(request: NextRequest, context: any) {
  try {
    // SECURITY: Get tenant context from authenticated session, not query params
    const tenantContext = await getTenantContext(request);
    const tenantId = tenantContext.tenantId;
    
    // SECURITY: Validate user has access to this tenant
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      console.warn(`SECURITY VIOLATION: User ${context.user?.id} attempted unauthorized access to tenant ${tenantId}`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Access denied to tenant resources',
          code: 'TENANT_ACCESS_DENIED'
        },
        { status: 403 }
      );
    }

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const validation = validateQueryParams(searchParams, 'transfer-requests');
    if (!validation.success) {
      return NextResponse.json(validation.error, { status: 400 });
    }

    const { status, locationId } = validation.data;

    console.log(`✅ Transfer requests query: User ${context.user.id} for tenant ${tenantId}${status ? ` status: ${status}` : ''}${locationId ? ` location: ${locationId}` : ''}`);

    const transfers = await multiLocationManagementCell.getTransferRequests(
      tenantId,
      status || undefined,
      locationId || undefined
    );

    return NextResponse.json({
      success: true,
      data: transfers
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Transfer requests API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch transfer requests',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}, { requiredRole: 'User' });

export const POST = withAuth(async function(request: NextRequest, context: any) {
  try {
    // SECURITY: Get tenant context from authenticated session, not request body
    const tenantContext = await getTenantContext(request);
    const tenantId = tenantContext.tenantId;
    
    // SECURITY: Validate user has access to this tenant
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      console.warn(`SECURITY VIOLATION: User ${context.user?.id} attempted unauthorized transfer creation for tenant ${tenantId}`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Access denied to tenant resources',
          code: 'TENANT_ACCESS_DENIED'
        },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = validateRequestBody(transferRequestSchema, body, 'transfer-request-creation');
    if (!validation.success) {
      return NextResponse.json(validation.error, { status: 400 });
    }

    const {
      fromLocationId,
      toLocationId,
      productId,
      quantity,
      reason,
      priority,
      requestedBy,
      notes
    } = validation.data;

    // SECURITY: Ensure requestedBy matches authenticated user
    if (requestedBy !== context.user.id) {
      console.warn(`SECURITY VIOLATION: User ${context.user.id} attempted to create transfer as ${requestedBy}`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Cannot create transfer request for another user',
          code: 'UNAUTHORIZED_USER_IMPERSONATION'
        },
        { status: 403 }
      );
    }

    console.log(`✅ Transfer request creation: User ${context.user.id} for tenant ${tenantId} - ${quantity} units from ${fromLocationId} to ${toLocationId}`);

    const result = await multiLocationManagementCell.initiateInventoryTransfer(
      tenantId,
      fromLocationId,
      toLocationId,
      productId,
      quantity,
      reason || 'rebalancing',
      priority || 'medium',
      requestedBy
    );

    return NextResponse.json({
      success: result.success,
      data: result.success ? { transferId: result.transferId } : null,
      message: result.message
    }, {
      status: result.success ? 201 : 400
    });
  } catch (error) {
    console.error('Transfer request creation API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create transfer request',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}, { requiredRole: 'User' });