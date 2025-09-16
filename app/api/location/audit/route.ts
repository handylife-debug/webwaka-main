import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { withAuth } from '@/lib/auth-middleware';
import { validateRequestBody, stockAuditSchema } from '@/lib/location-validation';

export const POST = withAuth(async function(request: NextRequest, context: any) {
  try {
    // SECURITY: Get tenant context from authenticated session, not request body
    const tenantContext = await getTenantContext(request);
    const tenantId = tenantContext.tenantId;
    
    // SECURITY: Validate user has access to this tenant
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      console.warn(`SECURITY VIOLATION: User ${context.user?.id} attempted unauthorized audit creation for tenant ${tenantId}`);
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
    const validation = validateRequestBody(stockAuditSchema, body, 'stock-audit-creation');
    if (!validation.success) {
      return NextResponse.json(validation.error, { status: 400 });
    }

    const {
      auditType,
      locationIds,
      productCategories,
      createdBy,
      notes
    } = validation.data;

    // SECURITY: Ensure createdBy matches authenticated user
    if (createdBy !== context.user.id) {
      console.warn(`SECURITY VIOLATION: User ${context.user.id} attempted to create audit as ${createdBy}`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Cannot create audit for another user',
          code: 'UNAUTHORIZED_USER_IMPERSONATION'
        },
        { status: 403 }
      );
    }

    // SECURITY: Additional role check for audit creation (requires elevated permissions)
    const userRole = context.user.role;
    if (!['Admin', 'SuperAdmin'].includes(userRole)) {
      console.warn(`SECURITY VIOLATION: User ${context.user.id} with role ${userRole} attempted audit creation`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Insufficient permissions for audit creation',
          code: 'INSUFFICIENT_PERMISSIONS'
        },
        { status: 403 }
      );
    }

    console.log(`✅ Stock audit creation: User ${context.user.id} (${userRole}) creating ${auditType} audit for ${locationIds.length} locations in tenant ${tenantId}`);

    const result = await multiLocationManagementCell.conductStockAudit(
      tenantId,
      auditType,
      locationIds,
      productCategories || [],
      createdBy
    );

    return NextResponse.json({
      success: result.success,
      data: result.success ? { auditId: result.auditId } : null,
      message: result.message
    }, {
      status: result.success ? 201 : 400
    });
  } catch (error) {
    console.error('Audit creation API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create stock audit',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}, { requiredRole: 'Admin' }); // Elevated role required for audit creation