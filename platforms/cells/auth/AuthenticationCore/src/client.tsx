'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  Shield, 
  Key, 
  CheckCircle2, 
  AlertCircle,
  Smartphone,
  QrCode,
  Download,
  Copy,
  RefreshCw
} from 'lucide-react'

interface AuthenticationCoreProps {
  mode?: 'login' | 'register' | 'reset' | 'mfa-setup' | 'profile'
  onAuthSuccess?: (user: any, tokens: any) => void
  onAuthError?: (error: string) => void
  className?: string
  tenantId?: string
}

interface AuthUser {
  id: string
  email: string
  fullName: string
  role: string
  permissions: string[]
  mfaEnabled: boolean
  emailVerified: boolean
  lastLoginAt?: number
  createdAt: number
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  success: string | null
}

export function AuthenticationCoreCell({ 
  mode = 'login', 
  onAuthSuccess, 
  onAuthError, 
  className = '',
  tenantId 
}: AuthenticationCoreProps) {
  const [currentMode, setCurrentMode] = useState<typeof mode>(mode)
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    success: null
  })

  // Form states
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    mfaToken: '',
    newPassword: '',
    resetToken: '',
    rememberMe: false,
    acceptTerms: false
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [mfaSetup, setMfaSetup] = useState({
    qrCode: '',
    backupCodes: [] as string[],
    secret: ''
  })

  // Password strength indicator
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: [] as string[],
    isStrong: false
  })

  useEffect(() => {
    // Check existing session on mount
    checkExistingSession()
  }, [])

  useEffect(() => {
    if (formData.password) {
      checkPasswordStrength(formData.password)
    }
  }, [formData.password])

  const checkExistingSession = async () => {
    setAuthState(prev => ({ ...prev, loading: true }))
    
    try {
      // Since we're using httpOnly cookies, we can't access them directly
      // Instead, make a session validation request - cookies will be sent automatically
      const response = await fetch('/api/cells/auth/AuthenticationCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Important: Include cookies in request
        body: JSON.stringify({
          action: 'validateSession',
          payload: {} // No need to send tokens - they're in httpOnly cookies
        })
      })

      const result = await response.json()
      
      if (result.success && result.data?.valid) {
        setAuthState({
          user: result.data.user,
          isAuthenticated: true,
          loading: false,
          error: null,
          success: null
        })
      } else {
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          loading: false
        }))
      }
    } catch (error) {
      console.error('Session validation error:', error)
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        loading: false
      }))
    }
  }

  const checkPasswordStrength = async (password: string) => {
    try {
      const response = await fetch('/api/cells/auth/AuthenticationCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'checkPasswordStrength',
          payload: { password }
        })
      })

      const result = await response.json()
      if (result.success) {
        setPasswordStrength(result.data)
      }
    } catch (error) {
      console.error('Password strength check error:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent, action: string) => {
    e.preventDefault()
    setAuthState(prev => ({ ...prev, loading: true, error: null, success: null }))

    try {
      const response = await fetch('/api/cells/auth/AuthenticationCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          payload: formData,
          tenantId
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setAuthState(prev => ({ 
          ...prev, 
          loading: false, 
          success: result.message,
          error: null 
        }))

        // Handle different success cases
        switch (action) {
          case 'authenticate':
            if (result.data.requiresMFA) {
              setCurrentMode('login') // Stay in login for MFA
              setAuthState(prev => ({ ...prev, success: 'Please enter your MFA token' }))
            } else {
              // Tokens are now stored securely in httpOnly cookies by the server
              // No client-side storage needed - cookies are automatically included in requests
              
              setAuthState(prev => ({
                ...prev,
                user: result.data.user,
                isAuthenticated: true
              }))
              
              onAuthSuccess?.(result.data.user, {
                sessionToken: result.data.sessionToken,
                refreshToken: result.data.refreshToken,
                expiresAt: result.data.expiresAt
              })
            }
            break

          case 'register':
            setCurrentMode('login')
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }))
            break

          case 'setupMFA':
            setMfaSetup({
              qrCode: result.data.qrCode || '',
              backupCodes: result.data.backupCodes || [],
              secret: result.data.secret || ''
            })
            break
        }
      } else {
        setAuthState(prev => ({ 
          ...prev, 
          loading: false, 
          error: result.message,
          success: null 
        }))
        onAuthError?.(result.message)
      }
    } catch (error) {
      const errorMessage = 'Authentication service unavailable'
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage,
        success: null 
      }))
      onAuthError?.(errorMessage)
    }
  }

  const handleLogout = async () => {
    try {
      // Call logout endpoint to clear httpOnly cookies
      await fetch('/api/cells/auth/AuthenticationCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Include cookies for server to clear them
        body: JSON.stringify({
          action: 'logout',
          payload: {}
        })
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    
    setAuthState({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      success: null
    })
    
    setCurrentMode('login')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setAuthState(prev => ({ ...prev, success: 'Copied to clipboard' }))
  }

  const getPasswordStrengthColor = () => {
    if (passwordStrength.score <= 2) return 'bg-red-500'
    if (passwordStrength.score <= 3) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getPasswordStrengthLabel = () => {
    if (passwordStrength.score <= 2) return 'Weak'
    if (passwordStrength.score <= 3) return 'Medium'
    return 'Strong'
  }

  // If authenticated, show profile/settings
  if (authState.isAuthenticated && authState.user) {
    return (
      <Card className={`w-full max-w-2xl ${className}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6 text-green-600" />
              <CardTitle>Authentication Profile</CardTitle>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* User Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-600">Full Name</Label>
                <p className="text-lg font-medium">{authState.user.fullName}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Email</Label>
                <p className="text-lg font-medium">{authState.user.email}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Role</Label>
                <Badge variant="secondary">{authState.user.role}</Badge>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">MFA Status</Label>
                <Badge variant={authState.user.mfaEnabled ? "default" : "secondary"}>
                  {authState.user.mfaEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>

            {/* MFA Setup */}
            {!authState.user.mfaEnabled && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Enable Two-Factor Authentication
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Add an extra layer of security to your account with 2FA
                </p>
                <Button 
                  onClick={() => setCurrentMode('mfa-setup')}
                  className="flex items-center"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Setup MFA
                </Button>
              </div>
            )}

            {/* Last Login */}
            {authState.user.lastLoginAt && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Last Login</Label>
                <p className="text-sm text-gray-500">
                  {new Date(authState.user.lastLoginAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`w-full max-w-md ${className}`}>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 p-3 bg-blue-100 rounded-full w-fit">
          <Lock className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle className="text-2xl font-bold">
          {currentMode === 'login' && 'Sign In'}
          {currentMode === 'register' && 'Create Account'}
          {currentMode === 'reset' && 'Reset Password'}
          {currentMode === 'mfa-setup' && 'Setup 2FA'}
        </CardTitle>
        <CardDescription>
          {currentMode === 'login' && 'Enter your credentials to access your account'}
          {currentMode === 'register' && 'Create a new account to get started'}
          {currentMode === 'reset' && 'Reset your password via email'}
          {currentMode === 'mfa-setup' && 'Secure your account with two-factor authentication'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {authState.error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {authState.error}
            </AlertDescription>
          </Alert>
        )}

        {authState.success && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {authState.success}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={currentMode} onValueChange={(value) => setCurrentMode(value as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="reset">Reset</TabsTrigger>
          </TabsList>

          {/* Login Form */}
          <TabsContent value="login">
            <form onSubmit={(e) => handleSubmit(e, 'authenticate')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mfaToken">MFA Token (if enabled)</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="mfaToken"
                    name="mfaToken"
                    type="text"
                    placeholder="123456"
                    value={formData.mfaToken}
                    onChange={handleInputChange}
                    className="pl-10"
                    maxLength={6}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="rememberMe"
                  checked={formData.rememberMe}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, rememberMe: checked }))
                  }
                />
                <Label htmlFor="rememberMe" className="text-sm">Remember me</Label>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={authState.loading}
              >
                {authState.loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Sign In
              </Button>
            </form>
          </TabsContent>

          {/* Register Form */}
          <TabsContent value="register">
            <form onSubmit={(e) => handleSubmit(e, 'register')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Choose a strong password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full transition-all ${getPasswordStrengthColor()}`}
                          style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{getPasswordStrengthLabel()}</span>
                    </div>
                    {passwordStrength.feedback.length > 0 && (
                      <ul className="text-xs text-red-600 space-y-0.5">
                        {passwordStrength.feedback.map((item, index) => (
                          <li key={index}>• {item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-xs text-red-600">Passwords do not match</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  name="acceptTerms"
                  checked={formData.acceptTerms}
                  onChange={handleInputChange}
                  className="rounded"
                  required
                />
                <Label htmlFor="acceptTerms" className="text-sm">
                  I accept the Terms of Service and Privacy Policy
                </Label>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={authState.loading || !passwordStrength.isStrong || formData.password !== formData.confirmPassword}
              >
                {authState.loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <User className="h-4 w-4 mr-2" />
                )}
                Create Account
              </Button>
            </form>
          </TabsContent>

          {/* Reset Password Form */}
          <TabsContent value="reset">
            <form onSubmit={(e) => handleSubmit(e, 'resetPassword')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={authState.loading}
              >
                {authState.loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Send Reset Link
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {/* MFA Setup Modal-like Content */}
        {currentMode === 'mfa-setup' && (
          <div className="space-y-4">
            <div className="text-center">
              <QrCode className="h-16 w-16 mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-semibold mb-2">Setup Two-Factor Authentication</h3>
              <p className="text-sm text-gray-600 mb-4">
                Scan the QR code with your authenticator app
              </p>
            </div>

            {mfaSetup.qrCode && (
              <div className="space-y-4">
                <div className="bg-white p-4 border rounded-lg text-center">
                  <div className="bg-gray-100 p-4 rounded mb-4">
                    <p className="text-xs font-mono break-all">{mfaSetup.qrCode}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(mfaSetup.qrCode)}
                    className="flex items-center mx-auto"
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Copy QR Code Data
                  </Button>
                </div>

                {mfaSetup.backupCodes.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center">
                      <Download className="h-4 w-4 mr-2" />
                      Backup Codes
                    </h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Save these codes securely. You can use them to access your account if you lose your authenticator device.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {mfaSetup.backupCodes.map((code, index) => (
                        <div key={index} className="bg-gray-100 p-2 rounded text-sm font-mono text-center">
                          {code}
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(mfaSetup.backupCodes.join('\n'))}
                      className="w-full"
                    >
                      <Copy className="h-3 w-3 mr-2" />
                      Copy All Codes
                    </Button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={(e) => handleSubmit(e, 'setupMFA')} className="space-y-4">
              <div className="space-y-2">
                <Label>MFA Method</Label>
                <select
                  name="method"
                  value="totp"
                  className="w-full p-2 border rounded-lg"
                  disabled
                >
                  <option value="totp">Authenticator App (TOTP)</option>
                </select>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={authState.loading}
              >
                {authState.loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Enable MFA
              </Button>

              <Button 
                variant="outline"
                onClick={() => setCurrentMode('login')}
                className="w-full"
              >
                Back to Login
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}