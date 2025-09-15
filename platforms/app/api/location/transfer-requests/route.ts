import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const status = searchParams.get('status');
    const locationId = searchParams.get('locationId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const transfers = await multiLocationManagementCell.getTransferRequests(
      tenantId,
      status || undefined,
      locationId || undefined
    );

    return NextResponse.json(transfers, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Transfer requests API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer requests' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId,
      fromLocationId,
      toLocationId,
      productId,
      quantity,
      reason,
      priority,
      requestedBy
    } = body;

    if (!tenantId || !fromLocationId || !toLocationId || !productId || !quantity || !requestedBy) {
      return NextResponse.json(
        { error: 'Missing required fields for transfer request' },
        { status: 400 }
      );
    }

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

    return NextResponse.json(result, {
      status: result.success ? 201 : 400
    });
  } catch (error) {
    console.error('Transfer request creation API error:', error);
    return NextResponse.json(
      { error: 'Failed to create transfer request' },
      { status: 500 }
    );
  }
}