import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import { z } from 'zod';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: 'SuperAdmin' | 'Admin' | 'User';
  permissions: string[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  emailVerified: boolean;
  phoneNumber?: string;
  createdAt: number;
  lastLoginAt?: number;
  loginAttempts: number;
  lockedUntil?: number;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticationResult {
  success: boolean;
  user?: Omit<AuthUser, 'passwordHash' | 'mfaSecret'>;
  sessionToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  message: string;
  requiresMFA?: boolean;
}

// Input validation schemas
const authenticateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfaToken: z.string().optional(),
  rememberMe: z.boolean().default(false)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
  fullName: z.string().min(2),
  acceptTerms: z.boolean().refine(val => val === true, 'Terms must be accepted')
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  resetToken: z.string().optional(),
  newPassword: z.string().min(8).optional()
});

// Password strength validation
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true
};

export class AuthenticationCoreCell {
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly ENCRYPTION_KEY: string;
  private readonly SALT_ROUNDS = 12;
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly REFRESH_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Security: Warn about missing environment variables but allow dev mode
    const isDev = process.env.NODE_ENV === 'development';
    
    if (!process.env.JWT_SECRET) {
      if (!isDev) throw new Error('JWT_SECRET environment variable is required for production security');
      console.warn('SECURITY WARNING: Using default JWT_SECRET in development mode');
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      if (!isDev) throw new Error('JWT_REFRESH_SECRET environment variable is required for production security');
      console.warn('SECURITY WARNING: Using default JWT_REFRESH_SECRET in development mode');
    }
    if (!process.env.ENCRYPTION_KEY) {
      if (!isDev) throw new Error('ENCRYPTION_KEY environment variable is required for production security');
      console.warn('SECURITY WARNING: Using default ENCRYPTION_KEY in development mode');
    }
    
    this.JWT_SECRET = process.env.JWT_SECRET || 'webwaka_jwt_secret_dev';
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'webwaka_refresh_secret_dev';
    this.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'webwaka_encryption_key_dev';
  }

  // Encryption utilities for sensitive data
  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-cbc';
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = crypto.createHash('sha256').update(this.ENCRYPTION_KEY).digest();
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Hash backup codes for secure storage
  private async hashBackupCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map(code => bcrypt.hash(code, 10)));
  }

  private async verifyBackupCode(code: string, hashedCodes: string[]): Promise<{ valid: boolean; codeIndex: number }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      if (await bcrypt.compare(code, hashedCodes[i])) {
        return { valid: true, codeIndex: i };
      }
    }
    return { valid: false, codeIndex: -1 };
  }

  // Main authentication method
  async authenticate(input: unknown): Promise<AuthenticationResult> {
    return await safeRedisOperation(async () => {
      const validation = authenticateSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid input: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }

      const { email, password, mfaToken, rememberMe } = validation.data;

      // Get user by email
      const user = await this.getUserByEmail(email);
      if (!user) {
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > Date.now()) {
        return {
          success: false,
          message: `Account is locked until ${new Date(user.lockedUntil).toLocaleString()}`
        };
      }

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        await this.incrementLoginAttempts(user.id);
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Check if MFA is required
      if (user.mfaEnabled && !mfaToken) {
        return {
          success: false,
          message: 'MFA token required',
          requiresMFA: true
        };
      }

      // Verify MFA token if provided
      if (user.mfaEnabled && mfaToken) {
        const mfaValid = await this.verifyMFAToken(user.id, mfaToken);
        if (!mfaValid) {
          return {
            success: false,
            message: 'Invalid MFA token'
          };
        }
      }

      // Reset login attempts on successful login
      await this.resetLoginAttempts(user.id);

      // Create session
      const session = await this.createSession(user, rememberMe);

      // Update last login time
      await this.updateLastLogin(user.id);

      const { passwordHash, mfaSecret, ...safeUser } = user;
      
      return {
        success: true,
        user: safeUser,
        sessionToken: session.token,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        message: 'Authentication successful'
      };
    }, {
      success: false,
      message: 'Authentication service temporarily unavailable'
    });
  }

  // User registration
  async register(input: unknown): Promise<{ success: boolean; userId?: string; message: string; requiresVerification?: boolean }> {
    return await safeRedisOperation(async () => {
      const validation = registerSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid input: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }

      const { email, password, fullName } = validation.data;

      // Check if user already exists
      const existingUser = await this.getUserByEmail(email);
      if (existingUser) {
        return {
          success: false,
          message: 'User with this email already exists'
        };
      }

      // Validate password strength
      const passwordStrength = this.checkPasswordStrength(password);
      if (!passwordStrength.isStrong) {
        return {
          success: false,
          message: 'Password does not meet requirements: ' + passwordStrength.feedback.join(', ')
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

      // Create user
      const userId = crypto.randomUUID();
      const user: AuthUser = {
        id: userId,
        email: email.toLowerCase(),
        fullName,
        passwordHash,
        role: 'User', // Default role
        permissions: ['user:read', 'user:update_own'],
        mfaEnabled: false,
        emailVerified: false,
        createdAt: Date.now(),
        loginAttempts: 0
      };

      await redis.set(`user:${userId}`, user);
      await redis.set(`user_email:${email.toLowerCase()}`, userId);

      return {
        success: true,
        userId,
        message: 'User registered successfully',
        requiresVerification: true
      };
    }, {
      success: false,
      message: 'Registration service temporarily unavailable'
    });
  }

  // Session validation
  async validateSession(input: unknown): Promise<{ success: boolean; message: string; data?: { valid: boolean; user?: Omit<AuthUser, 'passwordHash' | 'mfaSecret'> } }> {
    return await safeRedisOperation(async () => {
      const validation = z.object({
        sessionToken: z.string(),
        userId: z.string()
      }).safeParse(input);

      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid input'
        };
      }

      const { sessionToken, userId } = validation.data;

      try {
        // Verify JWT token
        const payload = jwt.verify(sessionToken, this.JWT_SECRET) as any;
        
        if (payload.userId !== userId) {
          return {
            success: false,
            message: 'Invalid session'
          };
        }

        // Get user data
        const user = await redis.get(`user:${userId}`) as AuthUser | null;
        if (!user) {
          return {
            success: false,
            message: 'User not found'
          };
        }

        // Check if session exists in Redis and validate expiry
        const session = await redis.get(`session:${payload.sessionId}`) as AuthSession | null;
        if (!session) {
          return {
            success: false,
            message: 'Session not found'
          };
        }

        // Enforce session expiry enforcement
        if (session.expiresAt < Date.now()) {
          // Remove expired session
          await redis.delete(`session:${payload.sessionId}`);
          return {
            success: false,
            message: 'Session expired'
          };
        }

        const { passwordHash, mfaSecret, ...safeUser } = user;
        
        return {
          success: true,
          message: 'Session valid',
          data: {
            valid: true,
            user: safeUser
          }
        };
      } catch (error) {
        return {
          success: false,
          message: 'Invalid or expired session'
        };
      }
    }, {
      success: false,
      message: 'Session validation service temporarily unavailable'
    });
  }

  // Password reset initiation
  async resetPassword(input: unknown): Promise<{ success: boolean; message: string; resetTokenSent?: boolean }> {
    return await safeRedisOperation(async () => {
      const validation = resetPasswordSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid input'
        };
      }

      const { email, resetToken, newPassword } = validation.data;

      if (!resetToken && !newPassword) {
        // Initiate password reset
        const user = await this.getUserByEmail(email);
        if (!user) {
          // Don't reveal that user doesn't exist
          return {
            success: true,
            message: 'If an account with that email exists, a reset link has been sent',
            resetTokenSent: true
          };
        }

        // Generate reset token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex'); // Hash for secure storage
        const resetData = {
          userId: user.id,
          expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
          used: false
        };

        await redis.set(`reset_token:${tokenHash}`, resetData);

        // TODO: Send email with token using secure email service
        // SECURITY: Never log sensitive tokens in production

        return {
          success: true,
          message: 'Password reset link has been sent to your email',
          resetTokenSent: true
        };
      } else if (resetToken && newPassword) {
        // Complete password reset - hash the provided token for lookup
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetData = await redis.get(`reset_token:${tokenHash}`) as any;
        
        if (!resetData) {
          return {
            success: false,
            message: 'Invalid or expired reset token'
          };
        }

        if (resetData.used || resetData.expiresAt < Date.now()) {
          return {
            success: false,
            message: 'Invalid or expired reset token'
          };
        }

        // Validate new password
        const passwordStrength = this.checkPasswordStrength(newPassword);
        if (!passwordStrength.isStrong) {
          return {
            success: false,
            message: 'Password does not meet requirements: ' + passwordStrength.feedback.join(', ')
          };
        }

        // Update password
        const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
        const user = await redis.get(`user:${resetData.userId}`) as AuthUser | null;
        
        if (user) {
          user.passwordHash = passwordHash;
          await redis.set(`user:${user.id}`, user);
          
          // Mark token as used
          resetData.used = true;
          await redis.set(`reset_token:${tokenHash}`, resetData);
          
          // Invalidate all existing sessions
          await this.invalidateAllUserSessions(user.id);
        }

        return {
          success: true,
          message: 'Password has been reset successfully'
        };
      } else {
        return {
          success: false,
          message: 'Invalid request parameters'
        };
      }
    }, {
      success: false,
      message: 'Password reset service temporarily unavailable'
    });
  }

  // MFA Setup
  async setupMFA(input: unknown): Promise<{ success: boolean; message: string; data?: { qrCode?: string; backupCodes: string[] } }> {
    return await safeRedisOperation(async () => {
      const validation = z.object({
        userId: z.string(),
        method: z.enum(['totp', 'sms', 'email']),
        phoneNumber: z.string().optional()
      }).safeParse(input);

      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid input'
        };
      }

      const { userId, method, phoneNumber } = validation.data;

      const user = await redis.get(`user:${userId}`) as AuthUser | null;
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      if (method === 'totp') {
        // Generate TOTP secret
        const secret = speakeasy.generateSecret({ name: 'WebWaka', length: 20 }).base32 as string;
        
        // Generate backup codes
        const backupCodes = Array.from({ length: 8 }, () => 
          crypto.randomBytes(4).toString('hex').toUpperCase()
        );

        // Encrypt and hash sensitive data
        const encryptedSecret = this.encrypt(secret);
        const hashedBackupCodes = await this.hashBackupCodes(backupCodes);

        // Update user with MFA settings - store encrypted secret
        user.mfaEnabled = true;
        user.mfaSecret = encryptedSecret; // Store encrypted, not plaintext
        await redis.set(`user:${userId}`, user);
        await redis.set(`mfa_backup:${userId}`, hashedBackupCodes); // Store hashed codes

        // Generate QR code data (in real implementation, use QR library)
        const qrCodeData = `otpauth://totp/WebWaka:${user.email}?secret=${secret}&issuer=WebWaka`;

        return {
          success: true,
          message: 'MFA setup completed successfully',
          data: {
            qrCode: qrCodeData,
            backupCodes
          }
        };
      }

      return {
        success: false,
        message: 'MFA method not supported yet'
      };
    }, {
      success: false,
      message: 'MFA setup service temporarily unavailable'
    });
  }

  // Password strength checker
  checkPasswordStrength(password: string): { isStrong: boolean; score: number; feedback: string[] } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= PASSWORD_REQUIREMENTS.minLength) {
      score += 1;
    } else {
      feedback.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
    }

    if (PASSWORD_REQUIREMENTS.requireUppercase && /[A-Z]/.test(password)) {
      score += 1;
    } else if (PASSWORD_REQUIREMENTS.requireUppercase) {
      feedback.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireLowercase && /[a-z]/.test(password)) {
      score += 1;
    } else if (PASSWORD_REQUIREMENTS.requireLowercase) {
      feedback.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireNumbers && /\d/.test(password)) {
      score += 1;
    } else if (PASSWORD_REQUIREMENTS.requireNumbers) {
      feedback.push('Password must contain at least one number');
    }

    if (PASSWORD_REQUIREMENTS.requireSpecialChars && /[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 1;
    } else if (PASSWORD_REQUIREMENTS.requireSpecialChars) {
      feedback.push('Password must contain at least one special character');
    }

    // Additional strength checks
    if (password.length >= 12) score += 1;
    if (/(.)\1{2,}/.test(password)) {
      feedback.push('Password should not contain repeated characters');
      score -= 1;
    }

    return {
      isStrong: score >= 4 && feedback.length === 0,
      score: Math.max(0, Math.min(5, score)),
      feedback
    };
  }

  // Helper methods
  private async getUserByEmail(email: string): Promise<AuthUser | null> {
    const userId = await redis.get(`user_email:${email.toLowerCase()}`) as string | null;
    if (!userId) return null;
    return await redis.get(`user:${userId}`) as AuthUser | null;
  }

  private async createSession(user: AuthUser, rememberMe: boolean): Promise<AuthSession> {
    const sessionId = crypto.randomUUID();
    const duration = rememberMe ? this.REFRESH_DURATION : this.SESSION_DURATION;
    const expiresAt = Date.now() + duration;

    const sessionToken = jwt.sign(
      { 
        userId: user.id, 
        sessionId, 
        role: user.role,
        permissions: user.permissions 
      },
      this.JWT_SECRET,
      { expiresIn: rememberMe ? '30d' : '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId, type: 'refresh' },
      this.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    const session: AuthSession = {
      id: sessionId,
      userId: user.id,
      token: sessionToken,
      refreshToken,
      expiresAt,
      createdAt: Date.now()
    };

    await redis.set(`session:${sessionId}`, session);
    return session;
  }

  private async incrementLoginAttempts(userId: string): Promise<void> {
    const user = await redis.get(`user:${userId}`) as AuthUser | null;
    if (user) {
      user.loginAttempts += 1;
      
      if (user.loginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = Date.now() + this.LOCKOUT_DURATION;
      }
      
      await redis.set(`user:${userId}`, user);
    }
  }

  private async resetLoginAttempts(userId: string): Promise<void> {
    const user = await redis.get(`user:${userId}`) as AuthUser | null;
    if (user) {
      user.loginAttempts = 0;
      user.lockedUntil = undefined;
      await redis.set(`user:${userId}`, user);
    }
  }

  private async updateLastLogin(userId: string): Promise<void> {
    const user = await redis.get(`user:${userId}`) as AuthUser | null;
    if (user) {
      user.lastLoginAt = Date.now();
      await redis.set(`user:${userId}`, user);
    }
  }

  private async verifyMFAToken(userId: string, token: string): Promise<boolean> {
    // Get user to access encrypted MFA secret
    const user = await redis.get(`user:${userId}`) as AuthUser | null;
    if (!user || !user.mfaSecret) {
      return false;
    }

    // Decrypt MFA secret for TOTP verification
    const secret = this.decrypt(user.mfaSecret);
    
    // Verify TOTP token using speakeasy
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Allow 2 time steps before/after for clock skew
    });
    
    if (verified) {
      return true;
    }

    // Check backup codes (now hashed)
    const hashedBackupCodes = await redis.get(`mfa_backup:${userId}`) as string[] | null;
    if (hashedBackupCodes) {
      const backupResult = await this.verifyBackupCode(token.toUpperCase(), hashedBackupCodes);
      if (backupResult.valid) {
        // Remove used backup code
        const updatedCodes = hashedBackupCodes.filter((_, index) => index !== backupResult.codeIndex);
        await redis.set(`mfa_backup:${userId}`, updatedCodes);
        return true;
      }
    }
    
    return false;
  }

  private async invalidateAllUserSessions(userId: string): Promise<void> {
    // In a real implementation, maintain a list of active sessions per user
    // For now, we would need to scan and remove all sessions for this user
    console.log(`Invalidating all sessions for user ${userId}`);
  }
}

// Export Cell instance
export const authenticationCoreCell = new AuthenticationCoreCell();