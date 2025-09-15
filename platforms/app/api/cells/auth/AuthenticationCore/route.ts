import { NextRequest, NextResponse } from 'next/server';
import { authenticationCoreCell } from '@/cells/auth/AuthenticationCore/src/server';
import { cookies } from 'next/headers';

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
      case 'authenticate':
        result = await authenticationCoreCell.authenticate(payload);
        break;
        
      case 'register':
        result = await authenticationCoreCell.register(payload);
        break;
        
      case 'validateSession':
        result = await authenticationCoreCell.validateSession(payload);
        break;
        
      case 'resetPassword':
        result = await authenticationCoreCell.resetPassword(payload);
        break;
        
      case 'setupMFA':
        result = await authenticationCoreCell.setupMFA(payload);
        break;
        
      case 'checkPasswordStrength':
        if (!payload?.password) {
          return NextResponse.json({
            success: false,
            message: 'Password is required for strength check'
          }, { status: 400 });
        }
        const strength = authenticationCoreCell.checkPasswordStrength(payload.password);
        result = {
          success: true,
          data: strength
        };
        break;
        
      default:
        return NextResponse.json({
          success: false,
          message: `Unsupported action: ${action}`
        }, { status: 400 });
    }

    // Handle different return shapes - normalize to consistent envelope
    const success = (result as any).success || false;
    const message = (result as any).message;
    const data = result;

    const response = NextResponse.json({
      success,
      message,
      data
    });

    // Handle secure httpOnly cookie session management for authentication
    if (action === 'authenticate' && success) {
      const authData = data as any; // Type assertion for auth response
      
      if (authData.sessionToken) {
        // Set session token as httpOnly cookie
        response.cookies.set('auth_session', authData.sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60, // 24 hours
          path: '/'
        });

        // Set refresh token as httpOnly cookie  
        if (authData.refreshToken) {
          response.cookies.set('auth_refresh', authData.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60, // 30 days
            path: '/'
          });
        }

        // Remove sensitive tokens from response body for security
        delete authData.sessionToken;
        delete authData.refreshToken;
      }
    }

    // Handle logout - clear cookies
    if (action === 'logout' || (action === 'validateSession' && !success)) {
      response.cookies.delete('auth_session');
      response.cookies.delete('auth_refresh');
    }

    return response;

  } catch (error) {
    console.error('AuthenticationCore Cell API Error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error'
    }, { status: 500 });
  }
}