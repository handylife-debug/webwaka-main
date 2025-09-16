import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context';
import { predictiveInventoryAlertsCell } from '../../../../cells/inventory/PredictiveInventoryAlerts/src/server';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context from request headers/subdomain
    const tenantContext = await getTenantContext(request);
    const { tenantId } = tenantContext;
    
    // Validate tenant access with authentication
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required or access denied'
      }, { status: 401 });
    }

    // Get locationId from query parameters
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId') || undefined;

    // Generate predictive alerts
    const alerts = await predictiveInventoryAlertsCell.generatePredictiveAlerts(tenantId, locationId);

    return NextResponse.json({
      success: true,
      data: alerts
    });

  } catch (error) {
    console.error('Error generating predictive alerts:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate predictive alerts'
    }, { status: 500 });
  }
}