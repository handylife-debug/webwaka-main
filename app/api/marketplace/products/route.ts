import { NextRequest, NextResponse } from 'next/server';
import { mapProductToVendor, getStoreProducts } from '@/cells/ecommerce/MultiStoreMarketplace/src/actions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await mapProductToVendor(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in map product to vendor API:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    
    if (!storeId) {
      return NextResponse.json(
        { success: false, message: 'Store ID is required' },
        { status: 400 }
      );
    }

    const filters = {
      category: searchParams.get('category') || undefined,
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      inStock: searchParams.get('inStock') === 'true' || undefined,
      search: searchParams.get('search') || undefined
    };

    const pagination = {
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined
    };

    const result = await getStoreProducts({ storeId, filters, pagination });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in get store products API:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}