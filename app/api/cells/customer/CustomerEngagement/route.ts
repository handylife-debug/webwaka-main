import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { withStaffPermissions } from '@/lib/permission-middleware';
import { customerEngagementCell } from '@/cells/customer/CustomerEngagement/src/server';

// GET - Handle query actions for CustomerEngagement Cell
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const customerId = searchParams.get('customerId');

    switch (action) {
      case 'getLoyaltyProgram':
        if (!customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const includePurchaseHistory = searchParams.get('includePurchaseHistory') === 'true';
        const includeRewardHistory = searchParams.get('includeRewardHistory') === 'true';
        const includeEngagementMetrics = searchParams.get('includeEngagementMetrics') === 'true';

        const loyaltyResult = await customerEngagementCell.getLoyaltyProgram({
          customerId,
          includePurchaseHistory,
          includeRewardHistory,
          includeEngagementMetrics
        }, tenantId);

        return NextResponse.json(loyaltyResult);

      case 'analyzePurchaseBehavior':
        if (!customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const timeRange = searchParams.get('timeRange') || '12m';
        const includePredictions = searchParams.get('includePredictions') === 'true';
        const includeRecommendations = searchParams.get('includeRecommendations') === 'true';

        const behaviorResult = await customerEngagementCell.analyzePurchaseBehavior({
          timeRange,
          includePredictions,
          includeRecommendations
        }, tenantId, customerId);

        return NextResponse.json(behaviorResult);

      case 'getCustomerSegments':
        const includeAutomation = searchParams.get('includeAutomation') === 'true';

        const segmentsResult = await customerEngagementCell.getCustomerSegments({
          customerId,
          includeAutomation
        }, tenantId);

        return NextResponse.json(segmentsResult);

      case 'calculateLoyaltyMetrics':
        const metricsTimeRange = searchParams.get('timeRange') || '12m';
        const segmentId = searchParams.get('segmentId') || '';
        const includeProjections = searchParams.get('includeProjections') === 'true';

        const metricsResult = await customerEngagementCell.calculateLoyaltyMetrics({
          timeRange: metricsTimeRange,
          segmentId,
          includeProjections
        }, tenantId);

        return NextResponse.json(metricsResult);

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('CustomerEngagement GET error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Handle create and update actions for CustomerEngagement Cell
export const POST = withStaffPermissions('customers.edit')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    const body = await request.json();
    const userId = request.headers.get('user-id') || 'system';

    switch (action) {
      case 'getLoyaltyProgram':
        const loyaltyResult = await customerEngagementCell.getLoyaltyProgram(body, tenantId);
        return NextResponse.json(loyaltyResult);

      case 'updateLoyaltyPoints':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const pointsResult = await customerEngagementCell.updateLoyaltyPoints(
          {
            points: body.points,
            action: body.action,
            reason: body.reason,
            transactionId: body.transactionId,
            expiryDate: body.expiryDate,
            category: body.category,
            familyMemberId: body.familyMemberId
          },
          tenantId,
          body.customerId,
          userId
        );

        return NextResponse.json(pointsResult);

      case 'createLoyaltyReward':
        const createRewardResult = await customerEngagementCell.createLoyaltyReward(
          body.rewardData,
          tenantId,
          userId
        );

        return NextResponse.json(createRewardResult);

      case 'redeemReward':
        if (!body.customerId || !body.rewardId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID and Reward ID are required'
          }, { status: 400 });
        }

        const redeemResult = await customerEngagementCell.redeemReward(
          {
            rewardId: body.rewardId,
            quantity: body.quantity || 1,
            notes: body.notes
          },
          tenantId,
          body.customerId,
          userId
        );

        return NextResponse.json(redeemResult);

      case 'analyzePurchaseBehavior':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const behaviorResult = await customerEngagementCell.analyzePurchaseBehavior(
          {
            timeRange: body.timeRange || '12m',
            includePredictions: body.includePredictions || true,
            includeRecommendations: body.includeRecommendations || true
          },
          tenantId,
          body.customerId
        );

        return NextResponse.json(behaviorResult);

      case 'getCustomerSegments':
        const segmentsResult = await customerEngagementCell.getCustomerSegments(
          {
            customerId: body.customerId,
            includeAutomation: body.includeAutomation || false
          },
          tenantId
        );

        return NextResponse.json(segmentsResult);

      case 'createEngagementCampaign':
        const campaignResult = await customerEngagementCell.createEngagementCampaign(
          body.campaignData,
          tenantId,
          userId
        );

        return NextResponse.json(campaignResult);

      case 'trackEngagement':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const trackResult = await customerEngagementCell.trackEngagement(
          {
            customerId: body.customerId,
            engagementType: body.engagementType,
            channel: body.channel,
            content: body.content,
            metadata: body.metadata || {}
          },
          tenantId,
          userId
        );

        return NextResponse.json(trackResult);

      case 'calculateLoyaltyMetrics':
        const metricsResult = await customerEngagementCell.calculateLoyaltyMetrics(
          {
            timeRange: body.timeRange || '12m',
            segmentId: body.segmentId,
            includeProjections: body.includeProjections || false
          },
          tenantId
        );

        return NextResponse.json(metricsResult);

      case 'exportEngagementData':
        const exportResult = await customerEngagementCell.exportEngagementData(
          {
            filters: body.filters || {},
            format: body.format || 'csv',
            fields: body.fields || []
          },
          tenantId,
          userId
        );

        return NextResponse.json(exportResult);

      case 'manageTierProgression':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const tierResult = await customerEngagementCell.manageTierProgression(
          body.customerId,
          tenantId,
          body.forceUpdate || false
        );

        return NextResponse.json(tierResult);

      case 'calculateCashback':
        if (!body.customerId || !body.transactionAmount) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID and transaction amount are required'
          }, { status: 400 });
        }

        const cashbackResult = await customerEngagementCell.calculateCashback(
          {
            customerId: body.customerId,
            transactionAmount: body.transactionAmount,
            paymentMethod: body.paymentMethod,
            category: body.category
          },
          tenantId
        );

        return NextResponse.json(cashbackResult);

      case 'scheduleRetentionCampaigns':
        const retentionResult = await customerEngagementCell.scheduleRetentionCampaigns(
          {
            segmentCriteria: body.segmentCriteria || {},
            campaignType: body.campaignType || 'retention',
            channels: body.channels || ['sms', 'email'],
            delayHours: body.delayHours || 24
          },
          tenantId,
          userId
        );

        return NextResponse.json(retentionResult);

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('CustomerEngagement POST error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Handle loyalty updates and campaign modifications
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const userId = request.headers.get('user-id') || 'system';

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'updateLoyalty';

    switch (action) {
      case 'updateLoyalty':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const result = await customerEngagementCell.updateLoyaltyProfile(
          {
            customerId: body.customerId,
            updates: body.updates
          },
          tenantId,
          userId
        );

        return NextResponse.json(result);

      case 'updateCampaign':
        if (!body.campaignId) {
          return NextResponse.json({
            success: false,
            message: 'Campaign ID is required'
          }, { status: 400 });
        }

        const campaignResult = await customerEngagementCell.updateEngagementCampaign(
          {
            campaignId: body.campaignId,
            updates: body.updates
          },
          tenantId,
          userId
        );

        return NextResponse.json(campaignResult);

      case 'updateReward':
        if (!body.rewardId) {
          return NextResponse.json({
            success: false,
            message: 'Reward ID is required'
          }, { status: 400 });
        }

        const rewardResult = await customerEngagementCell.updateLoyaltyReward(
          {
            rewardId: body.rewardId,
            updates: body.updates
          },
          tenantId,
          userId
        );

        return NextResponse.json(rewardResult);

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('CustomerEngagement PUT error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Handle deactivation of campaigns and rewards
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'deactivate';
    const resourceId = searchParams.get('id');

    if (!resourceId) {
      return NextResponse.json({
        success: false,
        message: 'Resource ID is required'
      }, { status: 400 });
    }

    const userId = request.headers.get('user-id') || 'system';

    switch (action) {
      case 'deactivateCampaign':
        const campaignResult = await customerEngagementCell.deactivateEngagementCampaign(
          resourceId,
          tenantId,
          userId
        );

        return NextResponse.json(campaignResult);

      case 'deactivateReward':
        const rewardResult = await customerEngagementCell.deactivateLoyaltyReward(
          resourceId,
          tenantId,
          userId
        );

        return NextResponse.json(rewardResult);

      case 'expirePoints':
        if (!searchParams.get('customerId')) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const expireResult = await customerEngagementCell.expireLoyaltyPoints(
          searchParams.get('customerId')!,
          tenantId,
          userId
        );

        return NextResponse.json(expireResult);

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('CustomerEngagement DELETE error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});