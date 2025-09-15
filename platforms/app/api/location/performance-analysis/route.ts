import { NextRequest, NextResponse } from 'next/server';
import { multiLocationManagementCell } from '@/cells/location/MultiLocationManagement/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const timeRange = searchParams.get('timeRange') || '30d';

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const performance = await multiLocationManagementCell.analyzeLocationPerformance(
      tenantId,
      timeRange
    );

    return NextResponse.json(performance, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Performance analysis API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance analysis' },
      { status: 500 }
    );
  }
}