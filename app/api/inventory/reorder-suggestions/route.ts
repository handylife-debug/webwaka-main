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

    // Generate reorder suggestions
    const suggestions = await predictiveInventoryAlertsCell.generateReorderSuggestions(tenantId);

    return NextResponse.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    console.error('Error generating reorder suggestions:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate reorder suggestions'
    }, { status: 500 });
  }
}