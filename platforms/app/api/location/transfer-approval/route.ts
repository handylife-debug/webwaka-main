import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId,
      transferId,
      action,
      approvedBy,
      approvedQuantity,
      rejectionReason
    } = body;

    if (!tenantId || !transferId || !action || !approvedBy) {
      return NextResponse.json(
        { error: 'Missing required fields for transfer approval' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be either "approve" or "reject"' },
        { status: 400 }
      );
    }

    const result = await multiLocationManagementCell.processTransferApproval(
      tenantId,
      transferId,
      action,
      approvedBy,
      approvedQuantity,
      rejectionReason
    );

    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    console.error('Transfer approval API error:', error);
    return NextResponse.json(
      { error: 'Failed to process transfer approval' },
      { status: 500 }
    );
  }
}