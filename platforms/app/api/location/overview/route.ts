import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const locationId = searchParams.get('locationId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const overview = await multiLocationManagementCell.getLocationOverview(
      tenantId,
      locationId || undefined
    );

    return NextResponse.json(overview, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Location overview API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch location overview' },
      { status: 500 }
    );
  }
}