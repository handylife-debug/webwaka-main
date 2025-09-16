import { NextRequest, NextResponse } from 'next/server';
import { customerBehaviorAnalyticsCell } from '@/cells/customer/CustomerBehaviorAnalytics/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const customerId = searchParams.get('customerId') || undefined;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const scores = await customerBehaviorAnalyticsCell.generatePredictiveScores(
      tenantId,
      customerId
    );

    return NextResponse.json(scores);
  } catch (error) {
    console.error('Failed to fetch predictive scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch predictive scores' },
      { status: 500 }
    );
  }
}