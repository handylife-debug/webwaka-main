import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { encryptSync as encrypt, decryptSync as decrypt } from '@/lib/encryption';
import { authenticationCoreCell } from '@/cells/auth/AuthenticationCore/src/server';

// OAuth Provider Configurations
const providers = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: 'openid email profile',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    userEmailUrl: 'https://api.github.com/user/emails',
    scope: 'user:email',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/people/~:(id,firstName,lastName,profilePicture(displayImage~:playableStreams))',
    emailUrl: 'https://api.linkedin.com/v2/emailAddresses?q=members&projection=(elements*(handle~))',
    scope: 'r_liteprofile r_emailaddress',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET
  }
};

// Types
interface SocialLoginResult {
  success: boolean;
  message: string;
  data?: {
    user: {
      id: string;
      email: string;
      name: string;
      avatar?: string;
      provider: string;
      providerId: string;
      isNewUser: boolean;
    };
    // Session data for secure cookie setting - should not be in JSON response
    sessionToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
}

// Secure response type that excludes sensitive tokens
interface SecureSocialLoginResult {
  success: boolean;
  message: string;
  data?: {
    user: {
      id: string;
      email: string;
      name: string;
      avatar?: string;
      provider: string;
      providerId: string;
      isNewUser: boolean;
    };
    expiresAt?: string;
  };
  // Session data for cookie setting only - never in response body
  sessionData?: {
    sessionToken: string;
    refreshToken: string;
  };
}

interface AuthUrlResult {
  success: boolean;
  message: string;
  data?: {
    authUrl: string;
    state: string;
  };
}

interface LinkAccountResult {
  success: boolean;
  message: string;
  data?: {
    provider: string;
    linked: boolean;
    providerData: {
      email: string;
      name: string;
      avatar?: string;
    };
  };
}

interface UnlinkAccountResult {
  success: boolean;
  message: string;
  data?: {
    provider: string;
    unlinked: boolean;
  };
}

interface LinkedAccountsResult {
  success: boolean;
  message: string;
  data?: {
    linkedAccounts: Array<{
      provider: string;
      email: string;
      name: string;
      avatar?: string;
      linkedAt: string;
    }>;
  };
}

// Safe wrapper for async operations
async function safeOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('Social login operation failed:', error);
    throw new Error('OAuth operation failed');
  }
}

// Generate secure state parameter
function generateState(): string {
  return randomBytes(32).toString('hex');
}

// Validate redirect URI
function validateRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Allow localhost for development and specific domains for production
    const allowedDomains = process.env.ALLOWED_OAUTH_DOMAINS?.split(',') || [];
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return isDevelopment && isLocalhost || allowedDomains.includes(url.hostname);
  } catch {
    return false;
  }
}

// Exchange authorization code for access token
async function exchangeCodeForToken(provider: string, authCode: string, redirectUri: string): Promise<any> {
  const config = providers[provider as keyof typeof providers];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const tokenData = new URLSearchParams({
    client_id: config.clientId || '',
    client_secret: config.clientSecret || '',
    code: authCode,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: tokenData
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return await response.json();
}

// Get user info from OAuth provider
async function getUserInfo(provider: string, accessToken: string): Promise<any> {
  const config = providers[provider as keyof typeof providers];
  
  const response = await fetch(config.userInfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  const userInfo = await response.json();

  // Handle provider-specific user data formats
  switch (provider) {
    case 'google':
      return {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture
      };
      
    case 'github':
      // GitHub requires separate email API call
      let userEmail = userInfo.email;
      if (!userEmail) {
        const githubConfig = config as any;
        const emailResponse = await fetch(githubConfig.userEmailUrl!, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });
        if (emailResponse.ok) {
          const emails = await emailResponse.json();
          const primaryEmail = emails.find((e: any) => e.primary);
          userEmail = primaryEmail?.email || emails[0]?.email;
        }
      }
      
      return {
        id: userInfo.id.toString(),
        email: userEmail,
        name: userInfo.name || userInfo.login,
        avatar: userInfo.avatar_url
      };
      
    case 'linkedin':
      // LinkedIn has complex nested structure
      const firstName = userInfo.firstName?.localized?.en_US || '';
      const lastName = userInfo.lastName?.localized?.en_US || '';
      
      // Get email separately
      const linkedinConfig = config as any;
      const emailResponse = await fetch(linkedinConfig.emailUrl!, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      let linkedinEmail = '';
      if (emailResponse.ok) {
        const emailData = await emailResponse.json();
        linkedinEmail = emailData.elements?.[0]?.['handle~']?.emailAddress || '';
      }
      
      return {
        id: userInfo.id,
        email: linkedinEmail,
        name: `${firstName} ${lastName}`.trim(),
        avatar: userInfo.profilePicture?.displayImage?.elements?.[0]?.identifiers?.[0]?.identifier
      };
      
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Store encrypted social account data
async function storeSocialAccount(userId: string, provider: string, providerData: any): Promise<void> {
  const encryptedData = encrypt(JSON.stringify(providerData));
  await redis.set(`social_account:${userId}:${provider}`, encryptedData);
}

// Get social account data
async function getSocialAccount(userId: string, provider: string): Promise<any> {
  const encryptedData = await redis.get(`social_account:${userId}:${provider}`);
  if (!encryptedData) return null;
  
  const decryptedData = decrypt(encryptedData as string);
  return JSON.parse(decryptedData);
}

// Create OAuth session manually (since AuthenticationCore doesn't expose session creation)
async function createOAuthSession(userId: string): Promise<{ sessionToken: string; refreshToken: string; expiresAt: number } | null> {
  try {
    // Get JWT secrets from environment (same as AuthenticationCore)
    const JWT_SECRET = process.env.JWT_SECRET || 'webwaka_jwt_secret_dev';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'webwaka_refresh_secret_dev';
    
    const sessionId = randomBytes(16).toString('hex');
    const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    const expiresAt = Date.now() + SESSION_DURATION;

    // Get user data for token payload
    const userData = await redis.get(`user:${userId}`);
    if (!userData) {
      console.error('User not found for session creation:', userId);
      return null;
    }

    const user = userData as any;

    const sessionToken = jwt.sign(
      { 
        userId: user.id, 
        sessionId, 
        role: user.role || 'User',
        permissions: user.permissions || ['user:read', 'user:update_own']
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    // Store session in Redis
    const session = {
      id: sessionId,
      userId: user.id,
      token: sessionToken,
      refreshToken,
      expiresAt,
      createdAt: Date.now()
    };

    await redis.set(`session:${sessionId}`, session);

    return {
      sessionToken,
      refreshToken,
      expiresAt
    };
  } catch (error) {
    console.error('Failed to create OAuth session:', error);
    return null;
  }
}

// Social Login Integration Cell Implementation
export const socialLoginIntegrationCell = {
  // Generate OAuth authorization URL
  async getAuthUrl(input: unknown): Promise<AuthUrlResult> {
    return await safeOperation(async () => {
      const { provider, redirectUri, scopes, state: customState } = input as any;

      if (!provider || !redirectUri) {
        return {
          success: false,
          message: 'Provider and redirect URI are required'
        };
      }

      if (!validateRedirectUri(redirectUri)) {
        return {
          success: false,
          message: 'Invalid redirect URI'
        };
      }

      const config = providers[provider as keyof typeof providers];
      if (!config) {
        return {
          success: false,
          message: `Unsupported provider: ${provider}`
        };
      }

      const state = customState || generateState();
      
      // Store state for verification with TTL (10 minutes)
      await redis.set(`oauth_state:${state}`, JSON.stringify({
        provider,
        redirectUri,
        createdAt: new Date().toISOString()
      }), 'EX', 600); // 10 minutes TTL

      const authUrl = new URL(config.authUrl);
      authUrl.searchParams.set('client_id', config.clientId!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', scopes?.join(' ') || config.scope);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_type', 'code');

      return {
        success: true,
        message: 'Authorization URL generated successfully',
        data: {
          authUrl: authUrl.toString(),
          state
        }
      };
    });
  },

  // Authenticate user with OAuth provider
  async authenticate(input: unknown): Promise<SecureSocialLoginResult> {
    return await safeOperation(async () => {
      const { provider, authCode, redirectUri, tenantId, state } = input as any;

      if (!provider || !authCode || !redirectUri || !state) {
        return {
          success: false,
          message: 'Provider, authorization code, redirect URI, and state are required'
        };
      }

      // Verify OAuth state parameter for CSRF protection
      const stateData = await redis.get(`oauth_state:${state}`);
      if (!stateData) {
        return {
          success: false,
          message: 'Invalid or expired OAuth state parameter'
        };
      }

      let parsedStateData;
      try {
        parsedStateData = JSON.parse(stateData as string);
      } catch {
        return {
          success: false,
          message: 'Malformed OAuth state data'
        };
      }

      // Validate state matches request parameters
      if (parsedStateData.provider !== provider || parsedStateData.redirectUri !== redirectUri) {
        return {
          success: false,
          message: 'OAuth state validation failed - parameters do not match'
        };
      }

      // Delete state immediately after use (one-time use)
      await redis.del(`oauth_state:${state}`);

      // Additional redirect URI validation for production security
      if (process.env.NODE_ENV === 'production' && !redirectUri.startsWith('https://')) {
        return {
          success: false,
          message: 'HTTPS required for redirect URI in production'
        };
      }

      if (!validateRedirectUri(redirectUri)) {
        return {
          success: false,
          message: 'Invalid redirect URI'
        };
      }

      // Exchange code for access token
      const tokenData = await exchangeCodeForToken(provider, authCode, redirectUri);
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return {
          success: false,
          message: 'Failed to obtain access token'
        };
      }

      // Get user info from provider
      const providerUserInfo = await getUserInfo(provider, accessToken);

      if (!providerUserInfo.email) {
        return {
          success: false,
          message: 'Email address is required for authentication'
        };
      }

      // Check if user exists with this email - try registration first to detect existing users
      let isNewUser = false;
      let userId: string;
      
      // Try to register user first - this will fail if user already exists
      const randomPassword = randomBytes(32).toString('hex'); // Generate random password for OAuth users
      const registerResult = await authenticationCoreCell.register({
        email: providerUserInfo.email,
        password: randomPassword,
        confirmPassword: randomPassword, // Must match password for validation
        fullName: providerUserInfo.name,
        acceptTerms: true
      });

      if (registerResult.success) {
        // New user created successfully
        userId = registerResult.userId!;
        isNewUser = true;
      } else if (registerResult.message.includes('already exists')) {
        // User already exists, get userId from Redis directly using email mapping
        const existingUserId = await redis.get(`user_email:${providerUserInfo.email.toLowerCase()}`);
        if (!existingUserId) {
          return {
            success: false,
            message: 'User lookup failed - email mapping not found'
          };
        }
        userId = existingUserId as string;
        isNewUser = false;
      } else {
        return {
          success: false,
          message: 'Failed to create or find user account: ' + registerResult.message
        };
      }

      // Store social account link
      await storeSocialAccount(userId, provider, {
        providerId: providerUserInfo.id,
        email: providerUserInfo.email,
        name: providerUserInfo.name,
        avatar: providerUserInfo.avatar,
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(tokenData.refresh_token || ''),
        linkedAt: new Date().toISOString()
      });

      // Create session manually for OAuth (since AuthenticationCore doesn't expose session creation)
      const sessionData = await createOAuthSession(userId);

      if (!sessionData) {
        return {
          success: false,
          message: 'Failed to create session'
        };
      }

      // Return secure response - tokens separated for cookie setting
      return {
        success: true,
        message: 'Authentication successful',
        data: {
          user: {
            id: userId,
            email: providerUserInfo.email,
            name: providerUserInfo.name,
            avatar: providerUserInfo.avatar,
            provider,
            providerId: providerUserInfo.id,
            isNewUser
          },
          expiresAt: new Date(sessionData.expiresAt).toISOString()
        },
        // Session tokens for secure cookie setting - never in response body
        sessionData: {
          sessionToken: sessionData.sessionToken,
          refreshToken: sessionData.refreshToken
        }
      };
    });
  },

  // Link social account to existing user
  async linkAccount(input: unknown): Promise<LinkAccountResult> {
    return await safeOperation(async () => {
      const { userId, provider, authCode, redirectUri } = input as any;

      if (!userId || !provider || !authCode || !redirectUri) {
        return {
          success: false,
          message: 'User ID, provider, authorization code, and redirect URI are required'
        };
      }

      // Check if account is already linked
      const existingLink = await getSocialAccount(userId, provider);
      if (existingLink) {
        return {
          success: false,
          message: `${provider} account is already linked to this user`
        };
      }

      // Exchange code for token and get user info
      const tokenData = await exchangeCodeForToken(provider, authCode, redirectUri);
      const providerUserInfo = await getUserInfo(provider, tokenData.access_token);

      // Store the link
      await storeSocialAccount(userId, provider, {
        providerId: providerUserInfo.id,
        email: providerUserInfo.email,
        name: providerUserInfo.name,
        avatar: providerUserInfo.avatar,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token || ''),
        linkedAt: new Date().toISOString()
      });

      return {
        success: true,
        message: `${provider} account linked successfully`,
        data: {
          provider,
          linked: true,
          providerData: {
            email: providerUserInfo.email,
            name: providerUserInfo.name,
            avatar: providerUserInfo.avatar
          }
        }
      };
    });
  },

  // Unlink social account from user
  async unlinkAccount(input: unknown): Promise<UnlinkAccountResult> {
    return await safeOperation(async () => {
      const { userId, provider } = input as any;

      if (!userId || !provider) {
        return {
          success: false,
          message: 'User ID and provider are required'
        };
      }

      const existingLink = await getSocialAccount(userId, provider);
      if (!existingLink) {
        return {
          success: false,
          message: `No ${provider} account linked to this user`
        };
      }

      // Remove the link
      await redis.del(`social_account:${userId}:${provider}`);

      return {
        success: true,
        message: `${provider} account unlinked successfully`,
        data: {
          provider,
          unlinked: true
        }
      };
    });
  },

  // Get all linked accounts for a user
  async getLinkedAccounts(input: unknown): Promise<LinkedAccountsResult> {
    return await safeOperation(async () => {
      const { userId } = input as any;

      if (!userId) {
        return {
          success: false,
          message: 'User ID is required'
        };
      }

      const linkedAccounts = [];
      const supportedProviders = Object.keys(providers);

      for (const provider of supportedProviders) {
        const accountData = await getSocialAccount(userId, provider);
        if (accountData) {
          linkedAccounts.push({
            provider,
            email: accountData.email,
            name: accountData.name,
            avatar: accountData.avatar,
            linkedAt: accountData.linkedAt
          });
        }
      }

      return {
        success: true,
        message: 'Linked accounts retrieved successfully',
        data: {
          linkedAccounts
        }
      };
    });
  }
};