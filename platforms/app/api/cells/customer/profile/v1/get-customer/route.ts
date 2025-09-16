/**
 * Customer Profile Cell HTTP API Handler
 * Provides cellular independence through versioned HTTP API
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  GetCustomerRequestSchema, 
  GetCustomerResponseSchema,
  CellResponseSchema,
  CustomerBasicSchema
} from '@/lib/cell-contracts/types';

// Import the actual cell server (allowed only in API handlers)
import { customerProfileCell } from '@/cells/customer/CustomerProfile/src/server';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // Parse and validate request
    const body = await request.json();
    const tenantId = request.headers.get('X-Tenant-ID') || body.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({
        version: 'v1',
        requestId,
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing tenantId in headers or body'
        },
        meta: { tenantId: '', requestId }
      }, { status: 400 });
    }

    const validatedRequest = GetCustomerRequestSchema.parse(body);

    // Call the actual cell implementation
    const result = await customerProfileCell.getCustomer({
      tenantId,
      customerId: validatedRequest.customerId
    });

    if (!result.success) {
      return NextResponse.json({
        version: 'v1',
        requestId,
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: result.message || 'Customer not found'
        },
        meta: { tenantId, requestId }
      }, { status: 404 });
    }

    // Map internal customer data to contract format
    const customerData = {
      id: result.customer.id,
      tenantId: result.customer.tenantId,
      customerCode: result.customer.customerCode,
      firstName: result.customer.firstName,
      lastName: result.customer.lastName,
      email: result.customer.email,
      primaryPhone: result.customer.primaryPhone,
      customerType: result.customer.customerType,
      status: result.customer.status,
      tier: result.customer.tier,
      preferredLanguage: result.customer.preferredLanguage,
      createdAt: result.customer.createdAt,
      updatedAt: result.customer.updatedAt
    };

    // Validate response matches contract
    const response = {
      version: 'v1' as const,
      requestId,
      success: true,
      data: customerData,
      meta: { tenantId, requestId }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Customer Profile Cell API Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        version: 'v1',
        requestId,
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request format',
          details: error.errors
        },
        meta: { tenantId: '', requestId }
      }, { status: 400 });
    }

    return NextResponse.json({
      version: 'v1',
      requestId,
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      meta: { tenantId: '', requestId }
    }, { status: 500 });
  }
}