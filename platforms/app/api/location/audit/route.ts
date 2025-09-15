import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId,
      auditType,
      locationIds,
      productCategories,
      createdBy
    } = body;

    if (!tenantId || !auditType || !locationIds || !Array.isArray(locationIds) || locationIds.length === 0 || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields for audit creation' },
        { status: 400 }
      );
    }

    if (!['full', 'partial', 'cycle'].includes(auditType)) {
      return NextResponse.json(
        { error: 'Audit type must be "full", "partial", or "cycle"' },
        { status: 400 }
      );
    }

    const result = await multiLocationManagementCell.conductStockAudit(
      tenantId,
      auditType,
      locationIds,
      productCategories || [],
      createdBy
    );

    return NextResponse.json(result, {
      status: result.success ? 201 : 400
    });
  } catch (error) {
    console.error('Audit creation API error:', error);
    return NextResponse.json(
      { error: 'Failed to create stock audit' },
      { status: 500 }
    );
  }
}