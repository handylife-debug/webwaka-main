import { NextRequest, NextResponse } from 'next/server';
import { customerBehaviorAnalyticsCell } from '@/cells/customer/CustomerBehaviorAnalytics/src/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const analysisType = searchParams.get('analysisType') || 'comprehensive';
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const recommendations = await customerBehaviorAnalyticsCell.generateRecommendations(
      tenantId,
      analysisType
    );

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('Failed to fetch recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}