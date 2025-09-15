import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { redis } from '@/lib/redis';

// Required environment variables
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Fail fast if secrets are missing in production
if (process.env.NODE_ENV === 'production') {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET environment variable is required in production');
  }
  if (!JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required in production');
  }
}

// Default secrets for development (not secure!)
const ACCESS_SECRET = JWT_ACCESS_SECRET || 'dev-access-secret-not-secure-change-in-prod';
const REFRESH_SECRET = JWT_REFRESH_SECRET || 'dev-refresh-secret-not-secure-change-in-prod';

// Types
interface TokenPayload {
  userId: string;
  email: string;
  roles?: string[];
  tenantId?: string;
  permissions?: string[];
}

interface TokenOptions {
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
  audience?: string;
  issuer?: string;
}

interface ValidationOptions {
  audience?: string;
  issuer?: string;
  ignoreExpiration?: boolean;
}

interface RefreshOptions {
  accessTokenExpiry?: string;
  newRefreshToken?: boolean;
}

interface TokenResult {
  success: boolean;
  message: string;
  data?: any;
}

interface TokenInfo {
  tokenType: string;
  issuedAt: string;
  expiresAt: string;
  expired: boolean;
  audience?: string;
  issuer?: string;
  payload?: any;
}

// Token Family Management for security
interface TokenFamily {
  familyId: string;
  userId: string;
  generationCount: number;
  lastRefresh: string;
  createdAt: string;
}

// Safe wrapper for async operations
async function safeOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('JWT operation failed:', error);
    throw new Error('Token operation failed');
  }
}

// Generate secure token family ID
function generateTokenFamilyId(): string {
  return randomBytes(32).toString('hex');
}

// Generate secure JTI (JWT ID)
function generateJTI(): string {
  return randomBytes(16).toString('hex');
}

// Hash refresh token for storage
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Store token family info
async function storeTokenFamily(family: TokenFamily): Promise<void> {
  await redis.set(`token_family:${family.familyId}`, JSON.stringify(family));
}

// Get token family info
async function getTokenFamily(familyId: string): Promise<TokenFamily | null> {
  const familyData = await redis.get(`token_family:${familyId}`);
  return familyData ? JSON.parse(familyData as string) : null;
}

// Store revoked token
async function revokeTokenById(jti: string, exp: number): Promise<void> {
  const ttl = Math.max(0, exp - Math.floor(Date.now() / 1000));
  if (ttl > 0) {
    await redis.set(`revoked_token:${jti}`, '1');
    // Set TTL to match token expiration
    await redis.expire(`revoked_token:${jti}`, ttl);
  }
}

// Check if token is revoked
async function isTokenRevoked(jti: string): Promise<boolean> {
  const revoked = await redis.get(`revoked_token:${jti}`);
  return revoked === '1';
}

// Revoke entire token family
async function revokeTokenFamily(familyId: string): Promise<void> {
  const family = await getTokenFamily(familyId);
  if (family) {
    // Mark family as revoked
    await redis.set(`revoked_family:${familyId}`, '1');
    await redis.expire(`revoked_family:${familyId}`, 30 * 24 * 60 * 60); // 30 days
    
    // Remove family record
    await redis.del(`token_family:${familyId}`);
  }
}

// Check if token family is revoked
async function isTokenFamilyRevoked(familyId: string): Promise<boolean> {
  const revoked = await redis.get(`revoked_family:${familyId}`);
  return revoked === '1';
}

// Store used refresh token JTI to detect reuse attempts
async function storeUsedRefreshTokenJTI(jti: string, exp: number): Promise<void> {
  const ttl = Math.max(0, exp - Math.floor(Date.now() / 1000));
  if (ttl > 0) {
    await redis.set(`used_refresh_jti:${jti}`, '1');
    // Set TTL to match token expiration
    await redis.expire(`used_refresh_jti:${jti}`, ttl);
  }
}

// Check if refresh token JTI has been used before (reuse detection)
async function isRefreshTokenJTIUsed(jti: string): Promise<boolean> {
  const used = await redis.get(`used_refresh_jti:${jti}`);
  return used === '1';
}

export const jwtTokenManagerCell = {
  // Generate access and refresh tokens
  async generateTokens(input: unknown): Promise<TokenResult> {
    return await safeOperation(async () => {
      const { payload, options = {} } = input as any;

      if (!payload || !payload.userId || !payload.email) {
        return {
          success: false,
          message: 'User ID and email are required in payload'
        };
      }

      const {
        accessTokenExpiry = '15m',
        refreshTokenExpiry = '30d',
        audience = 'webwaka-clients',
        issuer = 'webwaka-platform'
      } = options;

      // Generate token family for refresh token rotation security
      const familyId = generateTokenFamilyId();
      const accessJTI = generateJTI();
      const refreshJTI = generateJTI();

      const now = Math.floor(Date.now() / 1000);
      
      // Create access token payload
      const accessPayload = {
        ...payload,
        jti: accessJTI,
        iat: now,
        type: 'access'
      };

      // Create refresh token payload
      const refreshPayload = {
        userId: payload.userId,
        email: payload.email,
        familyId,
        jti: refreshJTI,
        iat: now,
        type: 'refresh'
      };

      // Sign tokens
      const accessToken = jwt.sign(accessPayload, ACCESS_SECRET, {
        expiresIn: accessTokenExpiry,
        audience,
        issuer,
        algorithm: 'HS256'
      });

      const refreshToken = jwt.sign(refreshPayload, REFRESH_SECRET, {
        expiresIn: refreshTokenExpiry,
        audience,
        issuer,
        algorithm: 'HS256'
      });

      // Store token family
      const family: TokenFamily = {
        familyId,
        userId: payload.userId,
        generationCount: 1,
        lastRefresh: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      await storeTokenFamily(family);

      // Calculate expiration times
      const accessExpiry = new Date(now * 1000);
      const refreshExpiry = new Date(now * 1000);
      
      // Add time based on expiry strings
      if (accessTokenExpiry.endsWith('m')) {
        accessExpiry.setMinutes(accessExpiry.getMinutes() + parseInt(accessTokenExpiry));
      } else if (accessTokenExpiry.endsWith('h')) {
        accessExpiry.setHours(accessExpiry.getHours() + parseInt(accessTokenExpiry));
      } else if (accessTokenExpiry.endsWith('d')) {
        accessExpiry.setDate(accessExpiry.getDate() + parseInt(accessTokenExpiry));
      }

      if (refreshTokenExpiry.endsWith('m')) {
        refreshExpiry.setMinutes(refreshExpiry.getMinutes() + parseInt(refreshTokenExpiry));
      } else if (refreshTokenExpiry.endsWith('h')) {
        refreshExpiry.setHours(refreshExpiry.getHours() + parseInt(refreshTokenExpiry));
      } else if (refreshTokenExpiry.endsWith('d')) {
        refreshExpiry.setDate(refreshExpiry.getDate() + parseInt(refreshTokenExpiry));
      }

      return {
        success: true,
        message: 'Tokens generated successfully',
        data: {
          accessToken,
          refreshToken,
          accessTokenExpiry: accessExpiry.toISOString(),
          refreshTokenExpiry: refreshExpiry.toISOString(),
          tokenType: 'Bearer'
        }
      };
    });
  },

  // Validate access or refresh token
  async validateToken(input: unknown): Promise<TokenResult> {
    return await safeOperation(async () => {
      const { token, tokenType = 'access', options = {} } = input as any;

      if (!token) {
        return {
          success: false,
          message: 'Token is required'
        };
      }

      const secret = tokenType === 'access' ? ACCESS_SECRET : REFRESH_SECRET;
      const { audience, issuer, ignoreExpiration = false } = options;

      try {
        // Verify token signature and basic claims
        const decoded = jwt.verify(token, secret, {
          audience: audience || undefined,
          issuer: issuer || undefined,
          ignoreExpiration,
          algorithms: ['HS256']
        }) as any;

        // Check if token is revoked
        if (decoded.jti) {
          const revoked = await isTokenRevoked(decoded.jti);
          if (revoked) {
            return {
              success: false,
              message: 'Token has been revoked',
              data: {
                valid: false,
                expired: false,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
              }
            };
          }
        }

        // For refresh tokens, check family validity
        if (tokenType === 'refresh' && decoded.familyId) {
          const familyRevoked = await isTokenFamilyRevoked(decoded.familyId);
          if (familyRevoked) {
            return {
              success: false,
              message: 'Token family has been revoked',
              data: {
                valid: false,
                expired: false,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
              }
            };
          }
        }

        return {
          success: true,
          message: 'Token is valid',
          data: {
            valid: true,
            payload: decoded,
            expired: false,
            expiresAt: new Date(decoded.exp * 1000).toISOString()
          }
        };

      } catch (error) {
        const isExpired = error instanceof jwt.TokenExpiredError;
        
        return {
          success: false,
          message: isExpired ? 'Token has expired' : 'Token is invalid',
          data: {
            valid: false,
            expired: isExpired,
            expiresAt: isExpired ? new Date((error as any).expiredAt).toISOString() : null
          }
        };
      }
    });
  },

  // Refresh access token using refresh token
  async refreshTokens(input: unknown): Promise<TokenResult> {
    return await safeOperation(async () => {
      const { refreshToken, options = {} } = input as any;

      if (!refreshToken) {
        return {
          success: false,
          message: 'Refresh token is required'
        };
      }

      // CRITICAL: Check for refresh token reuse BEFORE validation
      // Decode token without verification to get JTI for reuse detection
      let tokenPayload: any;
      try {
        tokenPayload = jwt.decode(refreshToken) as any;
        if (!tokenPayload || !tokenPayload.jti) {
          return {
            success: false,
            message: 'Invalid refresh token format'
          };
        }
      } catch (error) {
        return {
          success: false,
          message: 'Invalid refresh token format'
        };
      }

      // Check if this JTI has been used before (indicates reuse attack)
      const jtiAlreadyUsed = await isRefreshTokenJTIUsed(tokenPayload.jti);
      if (jtiAlreadyUsed) {
        // SECURITY: Refresh token reuse detected - revoke entire family
        if (tokenPayload.familyId) {
          await revokeTokenFamily(tokenPayload.familyId);
        }
        return {
          success: false,
          message: 'Refresh token reuse detected - token family revoked for security'
        };
      }

      // Validate refresh token
      const validation = await this.validateToken({
        token: refreshToken,
        tokenType: 'refresh'
      });

      if (!validation.success) {
        return validation;
      }

      const { payload } = validation.data;
      const { accessTokenExpiry = '15m', newRefreshToken = true } = options;

      // CRITICAL: Mark this refresh token JTI as used to prevent reuse
      // This must happen AFTER validation but BEFORE generating new tokens
      await storeUsedRefreshTokenJTI(payload.jti, payload.exp);

      // Check and update token family
      if (payload.familyId) {
        const family = await getTokenFamily(payload.familyId);
        if (!family) {
          // Family doesn't exist - possible token reuse attack
          await revokeTokenFamily(payload.familyId);
          return {
            success: false,
            message: 'Invalid token family - security violation detected'
          };
        }

        // Update generation count
        family.generationCount += 1;
        family.lastRefresh = new Date().toISOString();
        
        // Check for excessive refresh attempts
        if (family.generationCount > 50) {
          await revokeTokenFamily(payload.familyId);
          return {
            success: false,
            message: 'Token family has exceeded maximum refresh count'
          };
        }

        await storeTokenFamily(family);
      }

      // Generate new access token
      const accessJTI = generateJTI();
      const now = Math.floor(Date.now() / 1000);

      const accessPayload = {
        userId: payload.userId,
        email: payload.email,
        roles: payload.roles,
        tenantId: payload.tenantId,
        permissions: payload.permissions,
        jti: accessJTI,
        iat: now,
        type: 'access'
      };

      const newAccessToken = jwt.sign(accessPayload, ACCESS_SECRET, {
        expiresIn: accessTokenExpiry,
        audience: payload.aud,
        issuer: payload.iss,
        algorithm: 'HS256'
      });

      const accessExpiry = new Date(now * 1000);
      if (accessTokenExpiry.endsWith('m')) {
        accessExpiry.setMinutes(accessExpiry.getMinutes() + parseInt(accessTokenExpiry));
      } else if (accessTokenExpiry.endsWith('h')) {
        accessExpiry.setHours(accessExpiry.getHours() + parseInt(accessTokenExpiry));
      } else if (accessTokenExpiry.endsWith('d')) {
        accessExpiry.setDate(accessExpiry.getDate() + parseInt(accessTokenExpiry));
      }

      const result: any = {
        accessToken: newAccessToken,
        accessTokenExpiry: accessExpiry.toISOString()
      };

      // Generate new refresh token if requested
      if (newRefreshToken) {
        const refreshJTI = generateJTI();
        const refreshPayload = {
          userId: payload.userId,
          email: payload.email,
          familyId: payload.familyId,
          jti: refreshJTI,
          iat: now,
          type: 'refresh'
        };

        const newRefreshTokenValue = jwt.sign(refreshPayload, REFRESH_SECRET, {
          expiresIn: '30d',
          audience: payload.aud,
          issuer: payload.iss,
          algorithm: 'HS256'
        });

        // Revoke old refresh token
        if (payload.jti) {
          await revokeTokenById(payload.jti, payload.exp);
        }

        const refreshExpiry = new Date(now * 1000);
        refreshExpiry.setDate(refreshExpiry.getDate() + 30);

        result.refreshToken = newRefreshTokenValue;
        result.refreshTokenExpiry = refreshExpiry.toISOString();
      }

      return {
        success: true,
        message: 'Tokens refreshed successfully',
        data: result
      };
    });
  },

  // Revoke token(s)
  async revokeToken(input: unknown): Promise<TokenResult> {
    return await safeOperation(async () => {
      const { token, tokenType = 'access', userId } = input as any;

      if (!token) {
        return {
          success: false,
          message: 'Token is required'
        };
      }

      try {
        // Decode token without verification to get claims
        const decoded = jwt.decode(token) as any;
        
        if (!decoded || !decoded.jti) {
          return {
            success: false,
            message: 'Invalid token format'
          };
        }

        if (tokenType === 'all' || tokenType === 'refresh') {
          // Revoke entire token family
          if (decoded.familyId) {
            await revokeTokenFamily(decoded.familyId);
          }
        }

        if (tokenType === 'all' || tokenType === 'access') {
          // Revoke specific token
          await revokeTokenById(decoded.jti, decoded.exp);
        }

        return {
          success: true,
          message: `Token${tokenType === 'all' ? ' family' : ''} revoked successfully`,
          data: {
            revoked: true,
            tokenType,
            revokedAt: new Date().toISOString()
          }
        };

      } catch (error) {
        return {
          success: false,
          message: 'Failed to revoke token'
        };
      }
    });
  },

  // Get token information
  async getTokenInfo(input: unknown): Promise<TokenResult> {
    return await safeOperation(async () => {
      const { token, includePayload = false } = input as any;

      if (!token) {
        return {
          success: false,
          message: 'Token is required'
        };
      }

      try {
        // Decode token without verification to get basic info
        const decoded = jwt.decode(token, { complete: true }) as any;
        
        if (!decoded) {
          return {
            success: false,
            message: 'Invalid token format'
          };
        }

        const payload = decoded.payload;
        const isExpired = payload.exp && payload.exp < Math.floor(Date.now() / 1000);

        const tokenInfo: TokenInfo = {
          tokenType: payload.type || 'unknown',
          issuedAt: new Date(payload.iat * 1000).toISOString(),
          expiresAt: new Date(payload.exp * 1000).toISOString(),
          expired: isExpired,
          audience: payload.aud,
          issuer: payload.iss
        };

        if (includePayload) {
          tokenInfo.payload = {
            userId: payload.userId,
            email: payload.email,
            roles: payload.roles || [],
            tenantId: payload.tenantId,
            permissions: payload.permissions || []
          };
        }

        return {
          success: true,
          message: 'Token information retrieved successfully',
          data: tokenInfo
        };

      } catch (error) {
        return {
          success: false,
          message: 'Failed to decode token'
        };
      }
    });
  },

  // Validate token family for security
  async validateTokenFamily(input: unknown): Promise<TokenResult> {
    return await safeOperation(async () => {
      const { refreshToken, userId } = input as any;

      if (!refreshToken || !userId) {
        return {
          success: false,
          message: 'Refresh token and user ID are required'
        };
      }

      try {
        const decoded = jwt.decode(refreshToken) as any;
        
        if (!decoded || !decoded.familyId) {
          return {
            success: false,
            message: 'Invalid refresh token format'
          };
        }

        // Check if family exists and belongs to user
        const family = await getTokenFamily(decoded.familyId);
        
        if (!family) {
          return {
            success: false,
            message: 'Token family not found'
          };
        }

        if (family.userId !== userId) {
          return {
            success: false,
            message: 'Token family does not belong to specified user'
          };
        }

        // Check if family is revoked
        const familyRevoked = await isTokenFamilyRevoked(decoded.familyId);
        if (familyRevoked) {
          return {
            success: false,
            message: 'Token family has been revoked'
          };
        }

        return {
          success: true,
          message: 'Token family is valid',
          data: {
            valid: true,
            familyId: decoded.familyId,
            generationCount: family.generationCount,
            lastRefresh: family.lastRefresh
          }
        };

      } catch (error) {
        return {
          success: false,
          message: 'Failed to validate token family'
        };
      }
    });
  }
};