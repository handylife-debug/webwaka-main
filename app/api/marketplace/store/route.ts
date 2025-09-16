import { NextRequest, NextResponse } from 'next/server';
import { createVendorStore, getVendorDashboard, manageStoreSettings } from '@/cells/ecommerce/MultiStoreMarketplace/src/actions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createVendorStore(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in create vendor store API:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get('vendorId');
    
    if (!vendorId) {
      return NextResponse.json(
        { success: false, message: 'Vendor ID is required' },
        { status: 400 }
      );
    }

    const result = await getVendorDashboard({ vendorId });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in get vendor dashboard API:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await manageStoreSettings(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in manage store settings API:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}