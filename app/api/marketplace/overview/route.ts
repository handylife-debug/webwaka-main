import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceOverview } from '@/cells/ecommerce/MultiStoreMarketplace/src/actions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, message: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const filters = {
      status: (searchParams.get('status') as 'active' | 'inactive' | 'pending') || undefined,
      category: searchParams.get('category') || undefined,
      dateRange: (searchParams.get('startDate') && searchParams.get('endDate')) ? {
        startDate: searchParams.get('startDate')!,
        endDate: searchParams.get('endDate')!
      } : undefined
    };

    const result = await getMarketplaceOverview({ tenantId, filters });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in get marketplace overview API:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}