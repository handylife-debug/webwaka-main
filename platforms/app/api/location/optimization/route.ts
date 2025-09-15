import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const recommendations = await multiLocationManagementCell.getOptimizationRecommendations(tenantId);

    return NextResponse.json(recommendations, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Optimization recommendations API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch optimization recommendations' },
      { status: 500 }
    );
  }
}