import { NextRequest, NextResponse } from 'next/server';
import { customerBehaviorAnalyticsCell } from '@/cells/customer/CustomerBehaviorAnalytics/src/server';

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

    const analysis = await customerBehaviorAnalyticsCell.analyzeCustomerSegments(
      tenantId,
      timeRange
    );

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Failed to fetch segment analysis:', error);
    return NextResponse.json(
      { error: 'Failed to fetch segment analysis' },
      { status: 500 }
    );
  }
}