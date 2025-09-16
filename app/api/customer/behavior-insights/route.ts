import { NextRequest, NextResponse } from 'next/server';
import { customerBehaviorAnalyticsCell } from '@/cells/customer/CustomerBehaviorAnalytics/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const timeRange = searchParams.get('timeRange') || '30d';
    const segmentId = searchParams.get('segmentId') || undefined;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const insights = await customerBehaviorAnalyticsCell.analyzeCustomerBehavior(
      tenantId,
      timeRange,
      segmentId
    );

    return NextResponse.json(insights);
  } catch (error) {
    console.error('Failed to fetch customer behavior insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer behavior insights' },
      { status: 500 }
    );
  }
}