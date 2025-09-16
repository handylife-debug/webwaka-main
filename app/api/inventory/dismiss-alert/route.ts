import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context';
import { predictiveInventoryAlertsCell } from '../../../../cells/inventory/PredictiveInventoryAlerts/src/server';
import { z } from 'zod';

const dismissAlertSchema = z.object({
  alertId: z.string().min(1, 'Alert ID is required'),
  reason: z.string().optional()
});

export async function POST(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = dismissAlertSchema.parse(body);

    // Dismiss the alert
    const result = await predictiveInventoryAlertsCell.dismissAlert(
      tenantId, 
      validatedData.alertId, 
      validatedData.reason
    );

    return NextResponse.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Error dismissing alert:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to dismiss alert'
    }, { status: 500 });
  }
}