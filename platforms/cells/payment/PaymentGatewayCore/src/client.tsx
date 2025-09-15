'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  CreditCard, 
  Shield, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  DollarSign,
  Smartphone,
  Building2,
  QrCode,
  Globe,
  ArrowRight,
  History,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react'

interface PaymentGatewayCoreProps {
  mode?: 'payment' | 'subscription' | 'refund' | 'history' | 'customer'
  onPaymentSuccess?: (data: any) => void
  onPaymentError?: (error: string) => void
  className?: string
  tenantId?: string
  defaultProvider?: 'paystack' | 'flutterwave' | 'interswitch'
  defaultCurrency?: string
  defaultAmount?: number
}

interface PaymentState {
  loading: boolean
  error: string | null
  success: string | null
  paymentUrl?: string
  reference?: string
  status?: string
  transactions: PaymentTransaction[]
  customers: Customer[]
}

interface PaymentTransaction {
  id: string
  reference: string
  amount: number
  currency: string
  status: string
  provider: string
  createdAt: string
  customer?: {
    email: string
    name: string
  }
}

interface Customer {
  id: string
  email: string
  firstName: string
  lastName: string
  provider: string
  createdAt: string
}

export function PaymentGatewayCoreCell({ 
  mode = 'payment', 
  onPaymentSuccess, 
  onPaymentError, 
  className = '',
  tenantId,
  defaultProvider = 'paystack',
  defaultCurrency = 'NGN',
  defaultAmount = 0
}: PaymentGatewayCoreProps) {
  const [currentMode, setCurrentMode] = useState<typeof mode>(mode)
  const [paymentState, setPaymentState] = useState<PaymentState>({
    loading: false,
    error: null,
    success: null,
    transactions: [],
    customers: []
  })

  // Form states
  const [paymentData, setPaymentData] = useState({
    amount: defaultAmount || 0,
    currency: defaultCurrency,
    provider: defaultProvider,
    email: '',
    description: '',
    firstName: '',
    lastName: '',
    phone: '',
    reference: '',
    customerId: '',
    channels: [] as string[],
    metadata: {} as Record<string, string>
  })

  const [subscriptionData, setSubscriptionData] = useState({
    planCode: '',
    customerId: '',
    provider: defaultProvider as 'paystack' | 'flutterwave' | 'interswitch',
    metadata: {} as Record<string, string>
  })

  const [refundData, setRefundData] = useState({
    transactionId: '',
    provider: defaultProvider as 'paystack' | 'flutterwave' | 'interswitch',
    amount: 0,
    reason: 'requested_by_customer' as 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'other'
  })

  // Nigerian currency rates for display (example rates)
  const currencySymbols = {
    NGN: '₦',
    USD: '$',
    EUR: '€',
    GBP: '£',
    ZAR: 'R',
    KES: 'KSh',
    GHS: '₵',
    UGX: 'USh',
    RWF: 'RF'
  }

  const supportedCurrencies = ['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']
  const paymentProviders = [
    { value: 'paystack', label: 'Paystack', description: 'Nigerian leader in online payments' },
    { value: 'flutterwave', label: 'Flutterwave', description: 'Pan-African payment infrastructure' },
    { value: 'interswitch', label: 'Interswitch', description: 'Nigerian payment processing pioneer' }
  ]

  const paymentChannels = [
    { value: 'card', label: 'Card Payment', icon: CreditCard },
    { value: 'bank', label: 'Bank Transfer', icon: Building2 },
    { value: 'ussd', label: 'USSD', icon: Smartphone },
    { value: 'qr', label: 'QR Code', icon: QrCode },
    { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
    { value: 'bank_transfer', label: 'Direct Bank Transfer', icon: Building2 }
  ]

  useEffect(() => {
    if (currentMode === 'history') {
      loadTransactionHistory()
    } else if (currentMode === 'customer') {
      loadCustomers()
    }
  }, [currentMode])

  const loadTransactionHistory = async () => {
    setPaymentState(prev => ({ ...prev, loading: true }))
    
    try {
      const response = await fetch('/api/cells/payment/PaymentGatewayCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'getTransactionHistory',
          payload: { tenantId }
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setPaymentState(prev => ({ 
          ...prev, 
          loading: false,
          transactions: result.data?.transactions || [] 
        }))
      } else {
        setPaymentState(prev => ({ 
          ...prev, 
          loading: false, 
          error: result.message 
        }))
      }
    } catch (error) {
      setPaymentState(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Failed to load transaction history' 
      }))
    }
  }

  const loadCustomers = async () => {
    setPaymentState(prev => ({ ...prev, loading: true }))
    
    try {
      const response = await fetch('/api/cells/payment/PaymentGatewayCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'getCustomers',
          payload: { tenantId }
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setPaymentState(prev => ({ 
          ...prev, 
          loading: false,
          customers: result.data?.customers || [] 
        }))
      } else {
        setPaymentState(prev => ({ 
          ...prev, 
          loading: false, 
          error: result.message 
        }))
      }
    } catch (error) {
      setPaymentState(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Failed to load customers' 
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent, action: string) => {
    e.preventDefault()
    setPaymentState(prev => ({ ...prev, loading: true, error: null, success: null }))

    try {
      let payload
      
      switch (action) {
        case 'initializePayment':
          payload = paymentData
          break
        case 'createCustomer':
          payload = {
            email: paymentData.email,
            first_name: paymentData.firstName,
            last_name: paymentData.lastName,
            phone: paymentData.phone,
            provider: paymentData.provider
          }
          break
        case 'createSubscription':
          payload = subscriptionData
          break
        case 'processRefund':
          payload = refundData
          break
        default:
          payload = paymentData
      }

      const response = await fetch('/api/cells/payment/PaymentGatewayCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          payload: {
            ...payload,
            tenantId
          }
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setPaymentState(prev => ({ 
          ...prev, 
          loading: false, 
          success: result.message,
          error: null
        }))

        // Handle different success cases
        switch (action) {
          case 'initializePayment':
            if (result.data?.authorization_url || result.data?.link) {
              setPaymentState(prev => ({
                ...prev,
                paymentUrl: result.data.authorization_url || result.data.link,
                reference: result.data.reference || result.data.tx_ref
              }))
              
              // Open payment window for Nigerian providers
              const paymentWindow = window.open(
                result.data.authorization_url || result.data.link,
                'payment',
                'width=500,height=600,scrollbars=yes,resizable=yes'
              )
              
              // Poll for payment completion
              const pollPayment = setInterval(() => {
                if (paymentWindow?.closed) {
                  clearInterval(pollPayment)
                  // Verify payment when window closes
                  verifyPayment(result.data.reference || result.data.tx_ref, paymentData.provider)
                }
              }, 1000)
              
              onPaymentSuccess?.(result.data)
            }
            break

          case 'createCustomer':
            setCurrentMode('payment')
            setPaymentData(prev => ({ 
              ...prev, 
              customerId: result.data?.customer_code || result.data?.id || '' 
            }))
            break

          case 'createSubscription':
            setCurrentMode('payment')
            break

          case 'processRefund':
            setCurrentMode('history')
            loadTransactionHistory()
            break
        }
      } else {
        setPaymentState(prev => ({ 
          ...prev, 
          loading: false, 
          error: result.message,
          success: null 
        }))
        onPaymentError?.(result.message)
      }
    } catch (error) {
      const errorMessage = 'Payment service unavailable'
      setPaymentState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage,
        success: null 
      }))
      onPaymentError?.(errorMessage)
    }
  }

  const verifyPayment = async (reference: string, provider: string) => {
    try {
      const response = await fetch('/api/cells/payment/PaymentGatewayCore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'verifyPayment',
          payload: { reference, provider }
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setPaymentState(prev => ({ 
          ...prev, 
          status: result.data?.status,
          success: `Payment ${result.data?.status}` 
        }))
        onPaymentSuccess?.(result.data)
      } else {
        setPaymentState(prev => ({ ...prev, error: result.message }))
        onPaymentError?.(result.message)
      }
    } catch (error) {
      setPaymentState(prev => ({ ...prev, error: 'Payment verification failed' }))
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target
    setPaymentData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setPaymentState(prev => ({ ...prev, success: 'Copied to clipboard' }))
  }

  const formatAmount = (amount: number, currency: string) => {
    const symbol = currencySymbols[currency as keyof typeof currencySymbols] || currency
    return `${symbol}${amount.toLocaleString()}`
  }

  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case 'paystack': return 'bg-blue-100 text-blue-800'
      case 'flutterwave': return 'bg-orange-100 text-orange-800'
      case 'interswitch': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'succeeded':
      case 'success':
      case 'successful': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'refunded': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Card className={`w-full max-w-4xl ${className}`}>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 p-3 bg-green-100 rounded-full w-fit">
          <CreditCard className="h-6 w-6 text-green-600" />
        </div>
        <CardTitle className="text-2xl font-bold">
          Nigerian Payment Gateway
        </CardTitle>
        <CardDescription>
          Integrated payment processing with Paystack, Flutterwave, and Interswitch
        </CardDescription>
      </CardHeader>

      <CardContent>
        {paymentState.error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {paymentState.error}
            </AlertDescription>
          </Alert>
        )}

        {paymentState.success && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {paymentState.success}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={currentMode} onValueChange={(value) => setCurrentMode(value as any)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="payment">Payment</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="customer">Customers</TabsTrigger>
            <TabsTrigger value="refund">Refunds</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Payment Form */}
          <TabsContent value="payment">
            <form onSubmit={(e) => handleSubmit(e, 'initializePayment')} className="space-y-6">
              {/* Provider Selection */}
              <div className="space-y-2">
                <Label>Payment Provider</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {paymentProviders.map((provider) => (
                    <div
                      key={provider.value}
                      onClick={() => setPaymentData(prev => ({ ...prev, provider: provider.value as any }))}
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        paymentData.provider === provider.value 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{provider.label}</div>
                      <div className="text-sm text-gray-500">{provider.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount and Currency */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      placeholder="0.00"
                      value={paymentData.amount}
                      onChange={handleInputChange}
                      className="pl-10"
                      min="0.50"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={paymentData.currency}
                    onValueChange={(value) => setPaymentData(prev => ({ ...prev, currency: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {supportedCurrencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currencySymbols[currency as keyof typeof currencySymbols]} {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="customer@example.com"
                    value={paymentData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+234XXXXXXXXX"
                    value={paymentData.phone}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="John"
                    value={paymentData.firstName}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Doe"
                    value={paymentData.lastName}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {/* Payment Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Payment Description</Label>
                <Input
                  id="description"
                  name="description"
                  type="text"
                  placeholder="Payment for services"
                  value={paymentData.description}
                  onChange={handleInputChange}
                />
              </div>

              {/* Payment Channels */}
              <div className="space-y-2">
                <Label>Payment Channels (Optional)</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {paymentChannels.map((channel) => {
                    const Icon = channel.icon
                    const isSelected = paymentData.channels.includes(channel.value)
                    
                    return (
                      <div
                        key={channel.value}
                        onClick={() => {
                          const newChannels = isSelected
                            ? paymentData.channels.filter(c => c !== channel.value)
                            : [...paymentData.channels, channel.value]
                          setPaymentData(prev => ({ ...prev, channels: newChannels }))
                        }}
                        className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="h-5 w-5 mx-auto mb-1" />
                        <div className="text-xs">{channel.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div className="text-lg font-semibold">
                  Total: {formatAmount(paymentData.amount, paymentData.currency)}
                </div>
                <Button 
                  type="submit" 
                  className="flex items-center space-x-2" 
                  disabled={paymentState.loading}
                >
                  {paymentState.loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  <span>Initialize Payment</span>
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Subscription Form */}
          <TabsContent value="subscription">
            <form onSubmit={(e) => handleSubmit(e, 'createSubscription')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planCode">Plan Code</Label>
                <Input
                  id="planCode"
                  name="planCode"
                  type="text"
                  placeholder="PLN_xxxxxx"
                  value={subscriptionData.planCode}
                  onChange={(e) => setSubscriptionData(prev => ({ ...prev, planCode: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerId">Customer ID</Label>
                <Input
                  id="customerId"
                  name="customerId"
                  type="text"
                  placeholder="CUS_xxxxxx"
                  value={subscriptionData.customerId}
                  onChange={(e) => setSubscriptionData(prev => ({ ...prev, customerId: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={subscriptionData.provider}
                  onValueChange={(value) => setSubscriptionData(prev => ({ ...prev, provider: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentProviders.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={paymentState.loading}
              >
                {paymentState.loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Create Subscription
              </Button>
            </form>
          </TabsContent>

          {/* Customer Management */}
          <TabsContent value="customer">
            <div className="space-y-4">
              <form onSubmit={(e) => handleSubmit(e, 'createCustomer')} className="space-y-4 border rounded-lg p-4">
                <h3 className="font-medium">Create New Customer</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    name="firstName"
                    placeholder="First Name"
                    value={paymentData.firstName}
                    onChange={handleInputChange}
                    required
                  />
                  <Input
                    name="lastName"
                    placeholder="Last Name"
                    value={paymentData.lastName}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <Input
                  name="email"
                  type="email"
                  placeholder="Email Address"
                  value={paymentData.email}
                  onChange={handleInputChange}
                  required
                />

                <Input
                  name="phone"
                  type="tel"
                  placeholder="Phone Number"
                  value={paymentData.phone}
                  onChange={handleInputChange}
                />

                <Button type="submit" disabled={paymentState.loading}>
                  Create Customer
                </Button>
              </form>

              {/* Customer List */}
              <div className="space-y-2">
                <h3 className="font-medium">Existing Customers</h3>
                {paymentState.customers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No customers found</p>
                ) : (
                  <div className="space-y-2">
                    {paymentState.customers.map((customer) => (
                      <div key={customer.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{customer.firstName} {customer.lastName}</div>
                            <div className="text-sm text-gray-500">{customer.email}</div>
                          </div>
                          <Badge className={getProviderBadgeColor(customer.provider)}>
                            {customer.provider}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Refund Form */}
          <TabsContent value="refund">
            <form onSubmit={(e) => handleSubmit(e, 'processRefund')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transactionId">Transaction ID</Label>
                <Input
                  id="transactionId"
                  name="transactionId"
                  type="text"
                  placeholder="Transaction reference or ID"
                  value={refundData.transactionId}
                  onChange={(e) => setRefundData(prev => ({ ...prev, transactionId: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={refundData.provider}
                  onValueChange={(value) => setRefundData(prev => ({ ...prev, provider: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentProviders.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refundAmount">Refund Amount (Optional - leave 0 for full refund)</Label>
                <Input
                  id="refundAmount"
                  name="amount"
                  type="number"
                  placeholder="0.00"
                  value={refundData.amount}
                  onChange={(e) => setRefundData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label>Refund Reason</Label>
                <Select
                  value={refundData.reason}
                  onValueChange={(value) => setRefundData(prev => ({ ...prev, reason: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="requested_by_customer">Requested by Customer</SelectItem>
                    <SelectItem value="duplicate">Duplicate Payment</SelectItem>
                    <SelectItem value="fraudulent">Fraudulent Transaction</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={paymentState.loading}
                variant="destructive"
              >
                {paymentState.loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Process Refund
              </Button>
            </form>
          </TabsContent>

          {/* Transaction History */}
          <TabsContent value="history">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Transaction History</h3>
                <Button 
                  onClick={loadTransactionHistory}
                  variant="outline"
                  size="sm"
                  disabled={paymentState.loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${paymentState.loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {paymentState.transactions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No transactions found</p>
              ) : (
                <div className="space-y-3">
                  {paymentState.transactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge className={getStatusBadgeColor(transaction.status)}>
                            {transaction.status}
                          </Badge>
                          <Badge className={getProviderBadgeColor(transaction.provider)}>
                            {transaction.provider}
                          </Badge>
                        </div>
                        <div className="font-medium">
                          {formatAmount(transaction.amount, transaction.currency)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Reference:</span> {transaction.reference}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(transaction.reference)}
                            className="ml-2 p-1 h-auto"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div>
                          <span className="font-medium">Date:</span> {new Date(transaction.createdAt).toLocaleString()}
                        </div>
                        {transaction.customer && (
                          <>
                            <div>
                              <span className="font-medium">Customer:</span> {transaction.customer.name}
                            </div>
                            <div>
                              <span className="font-medium">Email:</span> {transaction.customer.email}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// Export additional components for specific use cases
export function PaymentModal({ 
  isOpen, 
  onClose, 
  amount, 
  currency = 'NGN', 
  provider = 'paystack',
  ...props 
}: PaymentGatewayCoreProps & { 
  isOpen: boolean
  onClose: () => void
  amount: number
  currency?: string
  provider?: 'paystack' | 'flutterwave' | 'interswitch'
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Payment</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ×
          </Button>
        </div>
        <PaymentGatewayCoreCell
          mode="payment"
          defaultAmount={amount}
          defaultCurrency={currency}
          defaultProvider={provider}
          {...props}
        />
      </div>
    </div>
  )
}

export function QuickPaymentButton({ 
  amount, 
  currency = 'NGN', 
  provider = 'paystack',
  children,
  ...props 
}: PaymentGatewayCoreProps & { 
  children: React.ReactNode
  amount: number
  currency?: string
  provider?: 'paystack' | 'flutterwave' | 'interswitch'
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)}>
        {children}
      </Button>
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        amount={amount}
        currency={currency}
        provider={provider}
        {...props}
      />
    </>
  )
}