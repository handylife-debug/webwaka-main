'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Check, X, ExternalLink, Shield, Unlink, AlertCircle } from 'lucide-react';

// Provider icons (using Lucide icons as placeholders)
const ProviderIcons = {
  google: '🔍',
  github: '🐙', 
  linkedin: '💼',
  replit: '🔧'
};

interface SocialLoginProps {
  mode?: 'login' | 'link' | 'manage';
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  redirectUri?: string;
  userId?: string; // Required for link/manage modes
  tenantId?: string;
  className?: string;
}

interface LinkedAccount {
  provider: string;
  email: string;
  name: string;
  avatar?: string;
  linkedAt: string;
}

export function SocialLoginIntegration({
  mode = 'login',
  onSuccess,
  onError,
  redirectUri,
  userId,
  tenantId,
  className = ''
}: SocialLoginProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const supportedProviders = [
    { id: 'google', name: 'Google', icon: ProviderIcons.google },
    { id: 'github', name: 'GitHub', icon: ProviderIcons.github },
    { id: 'linkedin', name: 'LinkedIn', icon: ProviderIcons.linkedin }
  ];

  // Load linked accounts for manage mode
  useEffect(() => {
    if (mode === 'manage' && userId) {
      loadLinkedAccounts();
    }
  }, [mode, userId]);

  const loadLinkedAccounts = async () => {
    try {
      const response = await fetch('/api/cells/auth/SocialLoginIntegration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getLinkedAccounts',
          payload: { userId }
        })
      });

      const result = await response.json();
      if (result.success) {
        setLinkedAccounts(result.data.linkedAccounts || []);
      }
    } catch (error) {
      console.error('Failed to load linked accounts:', error);
    }
  };

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(true);
    setLoadingProvider(provider);
    setError('');
    setSuccess('');

    try {
      // Step 1: Get authorization URL
      const authResponse = await fetch('/api/cells/auth/SocialLoginIntegration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getAuthUrl',
          payload: {
            provider,
            redirectUri: redirectUri || `${window.location.origin}/auth/callback`,
            scopes: getProviderScopes(provider)
          }
        })
      });

      const authResult = await authResponse.json();
      if (!authResult.success) {
        throw new Error(authResult.message);
      }

      // Step 2: Store state and redirect to OAuth provider
      const { authUrl, state } = authResult.data;
      
      // Store callback info for when user returns
      localStorage.setItem('oauth_callback', JSON.stringify({
        provider,
        state,
        mode,
        userId,
        tenantId,
        redirectUri: redirectUri || `${window.location.origin}/auth/callback`
      }));

      // Redirect to OAuth provider
      window.location.href = authUrl;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      setError(errorMessage);
      onError?.(errorMessage);
      setIsLoading(false);
      setLoadingProvider(null);
    }
  };

  const handleLinkAccount = async (provider: string) => {
    if (!userId) {
      setError('User ID is required for linking accounts');
      return;
    }

    setLoadingProvider(provider);
    try {
      const authResponse = await fetch('/api/cells/auth/SocialLoginIntegration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getAuthUrl',
          payload: {
            provider,
            redirectUri: redirectUri || `${window.location.origin}/auth/callback`,
            scopes: getProviderScopes(provider)
          }
        })
      });

      const authResult = await authResponse.json();
      if (!authResult.success) {
        throw new Error(authResult.message);
      }

      localStorage.setItem('oauth_callback', JSON.stringify({
        provider,
        state: authResult.data.state,
        mode: 'link',
        userId,
        redirectUri: redirectUri || `${window.location.origin}/auth/callback`
      }));

      window.location.href = authResult.data.authUrl;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Link failed';
      setError(errorMessage);
      setLoadingProvider(null);
    }
  };

  const handleUnlinkAccount = async (provider: string) => {
    if (!userId) return;

    setLoadingProvider(provider);
    try {
      const response = await fetch('/api/cells/auth/SocialLoginIntegration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlinkAccount',
          payload: { userId, provider }
        })
      });

      const result = await response.json();
      if (result.success) {
        setSuccess(`${provider} account unlinked successfully`);
        loadLinkedAccounts(); // Refresh the list
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unlink failed';
      setError(errorMessage);
    }
    setLoadingProvider(null);
  };

  const getProviderScopes = (provider: string): string[] => {
    switch (provider) {
      case 'google':
        return ['openid', 'email', 'profile'];
      case 'github':
        return ['user:email'];
      case 'linkedin':
        return ['r_liteprofile', 'r_emailaddress'];
      default:
        return [];
    }
  };

  const isAccountLinked = (provider: string): boolean => {
    return linkedAccounts.some(account => account.provider === provider);
  };

  const getLinkedAccount = (provider: string): LinkedAccount | undefined => {
    return linkedAccounts.find(account => account.provider === provider);
  };

  if (mode === 'login') {
    return (
      <Card className={`w-full max-w-md mx-auto ${className}`}>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5" />
            Continue with Social Login
          </CardTitle>
          <CardDescription>
            Sign in with your preferred social account
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
              <Check className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {supportedProviders.map((provider) => (
              <Button
                key={provider.id}
                variant="outline"
                className="w-full h-12 text-left justify-start"
                onClick={() => handleSocialLogin(provider.id)}
                disabled={isLoading}
              >
                {loadingProvider === provider.id ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <span className="mr-3 text-lg">{provider.icon}</span>
                )}
                Continue with {provider.name}
              </Button>
            ))}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Secure OAuth Authentication
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mode === 'manage') {
    return (
      <Card className={`w-full max-w-2xl mx-auto ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Linked Social Accounts
          </CardTitle>
          <CardDescription>
            Manage your connected social media accounts for easier sign-in
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
              <Check className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {supportedProviders.map((provider) => {
              const linkedAccount = getLinkedAccount(provider.id);
              const isLinked = isAccountLinked(provider.id);

              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{provider.icon}</span>
                    <div>
                      <h3 className="font-medium">{provider.name}</h3>
                      {isLinked && linkedAccount ? (
                        <div className="text-sm text-muted-foreground">
                          {linkedAccount.email}
                          <Badge variant="secondary" className="ml-2">
                            <Check className="h-3 w-3 mr-1" />
                            Connected
                          </Badge>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Not connected
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isLinked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnlinkAccount(provider.id)}
                        disabled={loadingProvider === provider.id}
                      >
                        {loadingProvider === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unlink className="h-4 w-4" />
                        )}
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLinkAccount(provider.id)}
                        disabled={loadingProvider === provider.id}
                      >
                        {loadingProvider === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
            <strong>Security Note:</strong> Linking social accounts allows you to sign in using those credentials. 
            You can disconnect any account at any time. Your account security is protected by our enterprise-grade encryption.
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

// OAuth Callback Handler Component
export function SocialLoginCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!authCode || !state) {
        throw new Error('Missing authorization code or state parameter');
      }

      // Get stored callback info
      const callbackInfo = localStorage.getItem('oauth_callback');
      if (!callbackInfo) {
        throw new Error('No callback information found');
      }

      const { provider, mode, userId, tenantId, redirectUri } = JSON.parse(callbackInfo);

      // Clear stored callback info
      localStorage.removeItem('oauth_callback');

      if (mode === 'login') {
        // Handle login
        const response = await fetch('/api/cells/auth/SocialLoginIntegration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'authenticate',
            payload: {
              provider,
              authCode,
              redirectUri,
              tenantId
            }
          })
        });

        const result = await response.json();
        if (result.success) {
          setStatus('success');
          setMessage('Authentication successful! Redirecting...');
          
          // Redirect to dashboard or home page
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 2000);
        } else {
          throw new Error(result.message);
        }
      } else if (mode === 'link') {
        // Handle account linking
        const response = await fetch('/api/cells/auth/SocialLoginIntegration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'linkAccount',
            payload: {
              userId,
              provider,
              authCode,
              redirectUri
            }
          })
        });

        const result = await response.json();
        if (result.success) {
          setStatus('success');
          setMessage('Account linked successfully! Redirecting...');
          
          // Redirect back to settings page
          setTimeout(() => {
            window.location.href = '/settings/accounts';
          }, 2000);
        } else {
          throw new Error(result.message);
        }
      }

    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            {status === 'processing' && (
              <>
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                <h2 className="text-lg font-semibold">Processing Authentication</h2>
                <p className="text-muted-foreground">Please wait while we verify your account...</p>
              </>
            )}

            {status === 'success' && (
              <>
                <Check className="h-8 w-8 text-green-500 mx-auto" />
                <h2 className="text-lg font-semibold text-green-600">Success!</h2>
                <p className="text-muted-foreground">{message}</p>
              </>
            )}

            {status === 'error' && (
              <>
                <X className="h-8 w-8 text-red-500 mx-auto" />
                <h2 className="text-lg font-semibold text-red-600">Authentication Failed</h2>
                <p className="text-muted-foreground">{message}</p>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.href = '/login'}
                  className="mt-4"
                >
                  Return to Login
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}