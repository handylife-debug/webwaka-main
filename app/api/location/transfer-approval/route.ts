import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { withAuth } from '@/lib/auth-middleware';
import { validateRequestBody, transferApprovalSchema } from '@/lib/location-validation';

export const POST = withAuth(async function(request: NextRequest, context: any) {
  try {
    // SECURITY: Get tenant context from authenticated session, not request body
    const tenantContext = await getTenantContext(request);
    const tenantId = tenantContext.tenantId;
    
    // SECURITY: Validate user has access to this tenant
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      console.warn(`SECURITY VIOLATION: User ${context.user?.id} attempted unauthorized transfer approval for tenant ${tenantId}`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Access denied to tenant resources',
          code: 'TENANT_ACCESS_DENIED'
        },
        { status: 403 }
      );
    }

    // Parse and validate request body with comprehensive schema validation
    const body = await request.json();
    const validation = validateRequestBody(transferApprovalSchema, body, 'transfer-approval');
    if (!validation.success) {
      return NextResponse.json(validation.error, { status: 400 });
    }

    const {
      transferId,
      action,
      approvedBy,
      approvedQuantity,
      rejectionReason
    } = validation.data;

    // SECURITY: Ensure approvedBy matches authenticated user (prevent user impersonation)
    if (approvedBy !== context.user.id) {
      console.warn(`SECURITY VIOLATION: User ${context.user.id} attempted to approve transfer as ${approvedBy}`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Cannot approve transfer for another user',
          code: 'UNAUTHORIZED_USER_IMPERSONATION'
        },
        { status: 403 }
      );
    }

    // SECURITY: Additional role check for transfer approval (requires elevated permissions)
    const userRole = context.user.role;
    if (!['Admin', 'SuperAdmin', 'Partner'].includes(userRole)) {
      console.warn(`SECURITY VIOLATION: User ${context.user.id} with role ${userRole} attempted transfer approval`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Insufficient permissions for transfer approval',
          code: 'INSUFFICIENT_PERMISSIONS'
        },
        { status: 403 }
      );
    }

    console.log(`✅ Transfer approval: User ${context.user.id} (${userRole}) ${action}ing transfer ${transferId} for tenant ${tenantId}`);

    const result = await multiLocationManagementCell.processTransferApproval(
      tenantId,
      transferId,
      action,
      approvedBy,
      approvedQuantity,
      rejectionReason
    );

    return NextResponse.json({
      success: result.success,
      data: result.success ? { transferId } : null,
      message: result.message
    }, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    console.error('Transfer approval API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process transfer approval',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}, { requiredRole: 'Admin' }); // Elevated role required for approvals