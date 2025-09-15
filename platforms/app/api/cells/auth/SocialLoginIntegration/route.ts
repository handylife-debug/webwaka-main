import { NextRequest, NextResponse } from 'next/server';
import { socialLoginIntegrationCell } from '@/cells/auth/SocialLoginIntegration/src/server';

export async function POST(request: NextRequest) {
  try {
    const { action, payload, tenantId } = await request.json();

    if (!action) {
      return NextResponse.json({
        success: false,
        message: 'Action is required'
      }, { status: 400 });
    }

    // Route the action to the appropriate cell method
    let result: any;
    
    switch (action) {
      case 'getAuthUrl':
        result = await socialLoginIntegrationCell.getAuthUrl(payload);
        break;
        
      case 'authenticate':
        result = await socialLoginIntegrationCell.authenticate({ ...payload, tenantId });
        break;
        
      case 'linkAccount':
        result = await socialLoginIntegrationCell.linkAccount(payload);
        break;
        
      case 'unlinkAccount':
        result = await socialLoginIntegrationCell.unlinkAccount(payload);
        break;
        
      case 'getLinkedAccounts':
        result = await socialLoginIntegrationCell.getLinkedAccounts(payload);
        break;
        
      default:
        return NextResponse.json({
          success: false,
          message: `Unsupported action: ${action}`
        }, { status: 400 });
    }

    // Prepare secure response - extract session data for cookie setting only
    let sessionData = null;
    let responseData = result.data;

    // Handle authentication success - extract session tokens for secure cookie setting
    if (action === 'authenticate' && result.success && result.sessionData) {
      sessionData = result.sessionData;
      // Ensure response data never contains session tokens
      responseData = result.data; // Already clean in new implementation
    }

    // Create response with clean data (no tokens) BEFORE setting cookies
    const response = NextResponse.json({
      success: result.success,
      message: result.message,
      data: responseData
    });

    // Set secure cookies if session data exists
    if (sessionData?.sessionToken) {
      // Set session token as httpOnly cookie
      response.cookies.set('auth_session', sessionData.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/'
      });

      // Set refresh token as httpOnly cookie  
      if (sessionData.refreshToken) {
        response.cookies.set('auth_refresh', sessionData.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', 
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60, // 30 days
          path: '/'
        });
      }
    }

    return response;

  } catch (error) {
    console.error('SocialLoginIntegration Cell API Error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error'
    }, { status: 500 });
  }
}