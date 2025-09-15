'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Clock, RefreshCw, X, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface JWTTokenManagerProps {
  mode?: 'generate' | 'validate' | 'refresh' | 'manage';
  onTokenGenerated?: (tokens: any) => void;
  onTokenValidated?: (result: any) => void;
  onTokenRefreshed?: (tokens: any) => void;
  onError?: (error: string) => void;
  className?: string;
  initialToken?: string;
  userId?: string;
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

export function JWTTokenManager({
  mode = 'manage',
  onTokenGenerated,
  onTokenValidated,
  onTokenRefreshed,
  onError,
  className = '',
  initialToken = '',
  userId
}: JWTTokenManagerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [tokens, setTokens] = useState<any>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [inputToken, setInputToken] = useState(initialToken);
  const [showTokenDetails, setShowTokenDetails] = useState(false);

  // Load initial token info if provided
  useEffect(() => {
    if (initialToken && mode === 'validate') {
      handleGetTokenInfo(initialToken);
    }
  }, [initialToken, mode]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const handleGenerateTokens = async () => {
    if (!userId) {
      setError('User ID is required for token generation');
      return;
    }

    setIsLoading(true);
    setLoadingAction('generate');
    clearMessages();

    try {
      const response = await fetch('/api/cells/auth/JWTTokenManager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'generateTokens',
          payload: {
            payload: {
              userId,
              // Email should be provided by calling component
              roles: ['user'],
              tenantId: 'default'
            },
            options: {
              accessTokenExpiry: '15m',
              refreshTokenExpiry: '30d'
            }
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        // Tokens are now secure in httpOnly cookies, only store metadata
        const tokenMetadata = {
          tokenType: result.data?.tokenType || 'Bearer',
          accessTokenExpiry: result.data?.accessTokenExpiry,
          refreshTokenExpiry: result.data?.refreshTokenExpiry
        };
        setTokens(tokenMetadata);
        setSuccess('Tokens generated successfully');
        onTokenGenerated?.(tokenMetadata);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token generation failed';
      setError(errorMessage);
      onError?.(errorMessage);
    }

    setIsLoading(false);
    setLoadingAction('');
  };

  const handleValidateToken = async (token?: string) => {
    const tokenToValidate = token || inputToken;
    if (!tokenToValidate) {
      setError('Token is required for validation');
      return;
    }

    setIsLoading(true);
    setLoadingAction('validate');
    clearMessages();

    try {
      const response = await fetch('/api/cells/auth/JWTTokenManager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'validateToken',
          payload: {
            token: tokenToValidate,
            tokenType: 'access'
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        setSuccess(`Token is ${result.data.valid ? 'valid' : 'invalid'}`);
        onTokenValidated?.(result.data);
      } else {
        setError(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token validation failed';
      setError(errorMessage);
      onError?.(errorMessage);
    }

    setIsLoading(false);
    setLoadingAction('');
  };

  const handleRefreshTokens = async () => {
    setIsLoading(true);
    setLoadingAction('refresh');
    clearMessages();

    try {
      // With secure cookies, the refresh token comes automatically from httpOnly cookie
      const response = await fetch('/api/cells/auth/JWTTokenManager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies in request
        body: JSON.stringify({
          action: 'refreshTokens',
          payload: {
            // No refresh token in payload - it comes from secure httpOnly cookie
            options: {
              accessTokenExpiry: '15m',
              newRefreshToken: true
            }
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        // Update metadata from response (tokens are secure in cookies)
        const tokenMetadata = {
          tokenType: result.data?.tokenType || tokens?.tokenType || 'Bearer',
          accessTokenExpiry: result.data?.accessTokenExpiry,
          refreshTokenExpiry: result.data?.refreshTokenExpiry
        };
        setTokens(tokenMetadata);
        setSuccess('Tokens refreshed successfully');
        onTokenRefreshed?.(tokenMetadata);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';
      setError(errorMessage);
      onError?.(errorMessage);
    }

    setIsLoading(false);
    setLoadingAction('');
  };

  const handleGetTokenInfo = async (token?: string) => {
    const tokenToAnalyze = token || inputToken;
    if (!tokenToAnalyze) {
      setError('Token is required for info retrieval');
      return;
    }

    setIsLoading(true);
    setLoadingAction('info');
    clearMessages();

    try {
      const response = await fetch('/api/cells/auth/JWTTokenManager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'getTokenInfo',
          payload: {
            token: tokenToAnalyze,
            includePayload: true
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        setTokenInfo(result.data);
        setSuccess('Token information retrieved');
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get token info';
      setError(errorMessage);
      onError?.(errorMessage);
    }

    setIsLoading(false);
    setLoadingAction('');
  };

  const handleRevokeToken = async (tokenType: 'access' | 'refresh' | 'all' = 'access') => {
    setIsLoading(true);
    setLoadingAction('revoke');
    clearMessages();

    try {
      // With secure cookies, tokens are automatically included in request
      const response = await fetch('/api/cells/auth/JWTTokenManager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies in request
        body: JSON.stringify({
          action: 'revokeToken',
          payload: {
            // No explicit token needed - comes from httpOnly cookies
            tokenType,
            userId
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        setSuccess(`${tokenType} token revoked successfully`);
        if (tokenType === 'all') {
          setTokens(null);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token revocation failed';
      setError(errorMessage);
      onError?.(errorMessage);
    }

    setIsLoading(false);
    setLoadingAction('');
  };

  const formatTokenDisplay = (token: string) => {
    return `${token.substring(0, 20)}...${token.substring(token.length - 20)}`;
  };

  if (mode === 'generate') {
    return (
      <Card className={`w-full max-w-md mx-auto ${className}`}>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5" />
            Generate JWT Tokens
          </CardTitle>
          <CardDescription>
            Create secure access and refresh tokens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleGenerateTokens}
            disabled={isLoading || !userId}
            className="w-full"
          >
            {isLoading && loadingAction === 'generate' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            Generate Tokens
          </Button>

          {tokens && (
            <div className="space-y-3 mt-4">
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-2">Access Token</h4>
                <p className="text-xs font-mono break-all">{formatTokenDisplay(tokens.accessToken)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expires: {new Date(tokens.accessTokenExpiry).toLocaleString()}
                </p>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-2">Refresh Token</h4>
                <p className="text-xs font-mono break-all">{formatTokenDisplay(tokens.refreshToken)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expires: {new Date(tokens.refreshTokenExpiry).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (mode === 'validate') {
    return (
      <Card className={`w-full max-w-md mx-auto ${className}`}>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Validate JWT Token
          </CardTitle>
          <CardDescription>
            Verify token validity and get information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">JWT Token</label>
            <textarea
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              placeholder="Paste your JWT token here..."
              className="w-full h-24 p-2 border rounded-md text-xs font-mono"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handleValidateToken()}
              disabled={isLoading || !inputToken}
              className="flex-1"
            >
              {isLoading && loadingAction === 'validate' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Validate
            </Button>

            <Button
              onClick={() => handleGetTokenInfo()}
              disabled={isLoading || !inputToken}
              variant="outline"
            >
              {isLoading && loadingAction === 'info' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>

          {tokenInfo && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Token Information</h4>
                <Badge variant={tokenInfo.expired ? "destructive" : "default"}>
                  {tokenInfo.expired ? 'Expired' : 'Valid'}
                </Badge>
              </div>
              
              <div className="text-xs space-y-1">
                <p><strong>Type:</strong> {tokenInfo.tokenType}</p>
                <p><strong>Issued:</strong> {new Date(tokenInfo.issuedAt).toLocaleString()}</p>
                <p><strong>Expires:</strong> {new Date(tokenInfo.expiresAt).toLocaleString()}</p>
                {tokenInfo.audience && <p><strong>Audience:</strong> {tokenInfo.audience}</p>}
                {tokenInfo.issuer && <p><strong>Issuer:</strong> {tokenInfo.issuer}</p>}
              </div>

              {tokenInfo.payload && (
                <div className="mt-2 pt-2 border-t">
                  <button
                    onClick={() => setShowTokenDetails(!showTokenDetails)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showTokenDetails ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showTokenDetails ? 'Hide' : 'Show'} Payload
                  </button>
                  
                  {showTokenDetails && (
                    <pre className="text-xs mt-2 p-2 bg-background rounded border overflow-auto">
                      {JSON.stringify(tokenInfo.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Default mode: manage
  return (
    <Card className={`w-full max-w-2xl mx-auto ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          JWT Token Manager
        </CardTitle>
        <CardDescription>
          Manage JWT tokens: generate, validate, refresh, and revoke
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            onClick={handleGenerateTokens}
            disabled={isLoading || !userId}
            variant="outline"
          >
            {isLoading && loadingAction === 'generate' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            Generate New Tokens
          </Button>

          <Button
            onClick={handleRefreshTokens}
            disabled={isLoading}
            variant="outline"
          >
            {isLoading && loadingAction === 'refresh' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Tokens
          </Button>
        </div>

        {tokens && (
          <div className="space-y-4">
            <h3 className="font-medium">Token Security Status</h3>
            
            <div className="space-y-3">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">Access Token</h4>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRevokeToken('access')}
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-green-600 font-medium bg-green-50 p-2 rounded">
                  🔒 Securely stored in httpOnly cookie (inaccessible to JavaScript)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <Clock className="inline h-3 w-3 mr-1" />
                  Expires: {tokens.accessTokenExpiry ? new Date(tokens.accessTokenExpiry).toLocaleString() : 'N/A'}
                </p>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">Refresh Token</h4>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRevokeToken('refresh')}
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-green-600 font-medium bg-green-50 p-2 rounded">
                  🔒 Securely stored in httpOnly cookie (inaccessible to JavaScript)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <Clock className="inline h-3 w-3 mr-1" />
                  Expires: {tokens.refreshTokenExpiry ? new Date(tokens.refreshTokenExpiry).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>

            <Button
              onClick={() => handleRevokeToken('all')}
              disabled={isLoading}
              variant="destructive"
              size="sm"
            >
              {isLoading && loadingAction === 'revoke' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Revoke All Tokens
            </Button>
          </div>
        )}

        <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
          <strong>Security Features:</strong> Token family tracking, refresh token rotation, 
          automatic revocation on security violations, and secure token lifecycle management.
        </div>
      </CardContent>
    </Card>
  );
}