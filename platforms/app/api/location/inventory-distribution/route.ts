import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const productFilter = searchParams.get('productFilter');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const distribution = await multiLocationManagementCell.getInventoryDistribution(
      tenantId,
      productFilter || undefined
    );

    return NextResponse.json(distribution, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Inventory distribution API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory distribution' },
      { status: 500 }
    );
  }
}