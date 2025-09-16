import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { withAuth } from '@/lib/auth-middleware';
import { validateQueryParams } from '@/lib/location-validation';

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
    const validation = validateQueryParams(searchParams, 'location-overview');
    if (!validation.success) {
      return NextResponse.json(validation.error, { status: 400 });
    }

    const { locationId } = validation.data;

    console.log(`✅ Location overview request: User ${context.user.id} for tenant ${tenantId}${locationId ? ` location ${locationId}` : ''}`);

    const overview = await multiLocationManagementCell.getLocationOverview(
      tenantId,
      locationId || undefined
    );

    return NextResponse.json({
      success: true,
      data: overview
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Location overview API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch location overview',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}, { requiredRole: 'User' });