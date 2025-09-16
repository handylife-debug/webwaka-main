import { NextRequest, NextResponse } from 'next/server';
import {
  createSimpleProduct,
  createVariableProduct,
  createDigitalProduct,
  createBundledProduct,
  createClassifiedProduct,
  getProductsByType,
  getProductTypeDefinition,
  validateProductType,
  getProductTypeAnalytics
} from '@/cells/ecommerce/ProductTypesManager/src/actions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'createSimpleProduct':
        return NextResponse.json(await createSimpleProduct(params));
      
      case 'createVariableProduct':
        return NextResponse.json(await createVariableProduct(params));
      
      case 'createDigitalProduct':
        return NextResponse.json(await createDigitalProduct(params));
      
      case 'createBundledProduct':
        return NextResponse.json(await createBundledProduct(params));
      
      case 'createClassifiedProduct':
        return NextResponse.json(await createClassifiedProduct(params));
      
      case 'validateProductType':
        return NextResponse.json(await validateProductType(params));
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('ProductTypesManager API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'getProducts': {
        const productType = searchParams.get('productType') as any;
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');
        
        const filters: Record<string, any> = {};
        const categoryId = searchParams.get('categoryId');
        const brand = searchParams.get('brand');
        const minPrice = searchParams.get('minPrice');
        const maxPrice = searchParams.get('maxPrice');
        
        if (categoryId) filters.categoryId = categoryId;
        if (brand) filters.brand = brand;
        if (minPrice || maxPrice) {
          filters.priceRange = {};
          if (minPrice) filters.priceRange.min = parseFloat(minPrice);
          if (maxPrice) filters.priceRange.max = parseFloat(maxPrice);
        }
        
        return NextResponse.json(await getProductsByType({
          productType,
          filters,
          limit,
          offset
        }));
      }
      
      case 'getProductTypeDefinition': {
        const productType = searchParams.get('productType') as any;
        if (!productType) {
          return NextResponse.json(
            { success: false, error: 'Product type required' },
            { status: 400 }
          );
        }
        
        return NextResponse.json(await getProductTypeDefinition(productType));
      }
      
      case 'getAnalytics': {
        const productType = searchParams.get('productType') as any;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        
        const params: any = {};
        if (productType) params.productType = productType;
        if (startDate && endDate) {
          params.dateRange = { startDate, endDate };
        }
        
        return NextResponse.json(await getProductTypeAnalytics(params));
      }
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('ProductTypesManager GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}