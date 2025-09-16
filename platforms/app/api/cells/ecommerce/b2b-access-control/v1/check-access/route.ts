/**
 * B2B Access Control Cell HTTP API Handler
 * Provides cellular independence through versioned HTTP API
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  B2BAccessCheckRequestSchema, 
  B2BAccessCheckResponseSchema
} from '@/lib/cell-contracts/types';

// Import the actual cell server (allowed only in API handlers)
import { b2bAccessControlCell } from '@/cells/ecommerce/B2BAccessControl/src/server';

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

    const validatedRequest = B2BAccessCheckRequestSchema.parse(body);

    // Call the actual cell implementation
    const result = await b2bAccessControlCell.checkGuestPriceAccess({
      userId: validatedRequest.userId,
      action: validatedRequest.action,
      productId: validatedRequest.resource
    });

    if (!result.canViewPrice && !result.canViewProduct) {
      return NextResponse.json({
        version: 'v1',
        requestId,
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: result.restrictionReason || 'Access check failed'
        },
        meta: { tenantId, requestId }
      }, { status: 403 });
    }

    // Map internal access result to contract format
    const accessData = {
      hasAccess: result.canViewPrice,
      userGroup: 'bronze', // Default for now
      restrictions: result.appliedRules || [],
      reason: result.restrictionReason
    };

    return NextResponse.json({
      version: 'v1',
      requestId,
      success: true,
      data: accessData,
      meta: { tenantId, requestId }
    });

  } catch (error) {
    console.error('B2B Access Control Cell API Error:', error);
    
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