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
    const validation = validateQueryParams(searchParams, 'performance-analysis');
    if (!validation.success) {
      return NextResponse.json(validation.error, { status: 400 });
    }

    const { timeRange } = validation.data;

    console.log(`✅ Performance analysis request: User ${context.user.id} for tenant ${tenantId} (${timeRange})`);

    const performance = await multiLocationManagementCell.analyzeLocationPerformance(
      tenantId,
      timeRange || '30d'
    );

    return NextResponse.json({
      success: true,
      data: performance
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Performance analysis API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch performance analysis',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}, { requiredRole: 'User' });