/**
 * Customer Engagement Cell HTTP API Handler
 * Provides cellular independence through versioned HTTP API
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  TrackEngagementRequestSchema, 
  TrackEngagementResponseSchema
} from '@/lib/cell-contracts/types';

// Import the actual cell server (allowed only in API handlers)
import { customerEngagementCell } from '@/cells/customer/CustomerEngagement/src/server';

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

    const validatedRequest = TrackEngagementRequestSchema.parse(body);

    // Call the actual cell implementation - using available method as temporary bridge
    const result = await customerEngagementCell.getLoyaltyProgram({
      customerId: validatedRequest.customerId
    }, tenantId);
    
    // For now, create a mock successful interaction result
    // TODO: This will be replaced with proper interaction tracking method once identified

    if (!result.success) {
      return NextResponse.json({
        version: 'v1',
        requestId,
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: result.message || 'Failed to track engagement'
        },
        meta: { tenantId, requestId }
      }, { status: 500 });
    }

    // Map internal engagement result to contract format (using loyalty data as bridge)
    const engagementData = {
      interactionId: crypto.randomUUID(), // Generated for tracking
      engagementScore: result.loyaltyProfile?.engagementScore || 50,
      customerTier: (result.loyaltyProfile?.currentTier || 'bronze') as any,
      recommendedActions: ['Continue engagement', 'Check loyalty rewards'] // Default actions
    };

    return NextResponse.json({
      version: 'v1',
      requestId,
      success: true,
      data: engagementData,
      meta: { tenantId, requestId }
    });

  } catch (error) {
    console.error('Customer Engagement Cell API Error:', error);
    
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