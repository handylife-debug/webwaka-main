import { NextRequest, NextResponse } from 'next/server';
import { jwtTokenManagerCell } from '@/cells/auth/JWTTokenManager/src/server';

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
    let result;
    
    switch (action) {
      case 'generateTokens':
        result = await jwtTokenManagerCell.generateTokens(payload);
        break;
        
      case 'validateToken':
        result = await jwtTokenManagerCell.validateToken(payload);
        break;
        
      case 'refreshTokens':
        // Get refresh token from secure httpOnly cookie
        const refreshTokenFromCookie = request.cookies.get('jwt_refresh_token')?.value;
        const refreshPayload = {
          ...payload,
          refreshToken: refreshTokenFromCookie || payload.refreshToken
        };
        result = await jwtTokenManagerCell.refreshTokens(refreshPayload);
        break;
        
      case 'revokeToken':
        // Support revoking tokens from cookies or payload
        const accessTokenFromCookie = request.cookies.get('jwt_access_token')?.value;
        const refreshTokenFromCookieForRevoke = request.cookies.get('jwt_refresh_token')?.value;
        const revokePayload = {
          ...payload,
          // Use token from cookies if not provided in payload
          token: payload.token || 
                (payload.tokenType === 'refresh' ? refreshTokenFromCookieForRevoke : accessTokenFromCookie) ||
                accessTokenFromCookie
        };
        result = await jwtTokenManagerCell.revokeToken(revokePayload);
        break;
        
      case 'getTokenInfo':
        result = await jwtTokenManagerCell.getTokenInfo(payload);
        break;
        
      case 'validateTokenFamily':
        result = await jwtTokenManagerCell.validateTokenFamily(payload);
        break;
        
      default:
        return NextResponse.json({
          success: false,
          message: `Unsupported action: ${action}`
        }, { status: 400 });
    }

    // Build safe response data without tokens FIRST
    let safeResponseData = result.data;
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    let accessTokenExpiry: string | undefined;
    let refreshTokenExpiry: string | undefined;

    // For token generation and refresh, extract tokens and build safe response
    if ((action === 'generateTokens' || action === 'refreshTokens') && result.success && result.data) {
      // Extract tokens before building response
      accessToken = result.data.accessToken;
      refreshToken = result.data.refreshToken;
      accessTokenExpiry = result.data.accessTokenExpiry;
      refreshTokenExpiry = result.data.refreshTokenExpiry;

      // Build safe response data without sensitive tokens
      safeResponseData = {
        ...result.data,
        // Remove tokens from response body for security
        accessToken: undefined,
        refreshToken: undefined,
        // Keep metadata for client reference
        tokenType: result.data.tokenType,
        accessTokenExpiry: result.data.accessTokenExpiry,
        refreshTokenExpiry: result.data.refreshTokenExpiry
      };

      // Clean up undefined fields
      delete safeResponseData.accessToken;
      delete safeResponseData.refreshToken;
    }

    // Create secure response with safe data only
    const response = NextResponse.json({
      success: result.success,
      message: result.message,
      data: safeResponseData
    });

    // Set secure httpOnly cookies with extracted tokens
    if ((action === 'generateTokens' || action === 'refreshTokens') && result.success) {
      // Calculate cookie maxAge from actual token expiry
      let accessCookieMaxAge = 15 * 60; // Default 15 minutes
      let refreshCookieMaxAge = 30 * 24 * 60 * 60; // Default 30 days

      if (accessTokenExpiry) {
        const expiryTime = new Date(accessTokenExpiry).getTime();
        const now = Date.now();
        accessCookieMaxAge = Math.max(0, Math.floor((expiryTime - now) / 1000));
      }

      if (refreshTokenExpiry) {
        const expiryTime = new Date(refreshTokenExpiry).getTime();
        const now = Date.now();
        refreshCookieMaxAge = Math.max(0, Math.floor((expiryTime - now) / 1000));
      }

      // Set access token as httpOnly cookie
      if (accessToken) {
        response.cookies.set('jwt_access_token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: accessCookieMaxAge,
          path: '/'
        });
      }

      // Set refresh token as httpOnly cookie  
      if (refreshToken) {
        response.cookies.set('jwt_refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', 
          sameSite: 'strict',
          maxAge: refreshCookieMaxAge,
          path: '/'
        });
      }
    }

    // For token revocation, clear cookies
    if (action === 'revokeToken' && result.success) {
      const { tokenType } = payload;
      
      if (tokenType === 'access' || tokenType === 'all') {
        response.cookies.delete('jwt_access_token');
      }
      
      if (tokenType === 'refresh' || tokenType === 'all') {
        response.cookies.delete('jwt_refresh_token');
      }
    }

    return response;

  } catch (error) {
    console.error('JWTTokenManager Cell API Error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error'
    }, { status: 500 });
  }
}