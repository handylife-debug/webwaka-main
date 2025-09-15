'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { 
  Share2, 
  Calculator,
  Calendar,
  ShoppingCart,
  CreditCard,
  Users,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Minus,
  Edit,
  Trash2,
  Eye,
  ArrowRight,
  ArrowLeft,
  Gift,
  Target,
  Percent,
  Building2,
  Smartphone,
  QrCode,
  Wallet,
  Star,
  Receipt,
  History,
  Bell,
  Settings,
  Info,
  Zap
} from 'lucide-react'

interface SplitPaymentCellProps {
  mode?: 'split_payment' | 'installment' | 'layaway' | 'multi_method' | 'status' | 'calculator'
  onPaymentSuccess?: (data: any) => void
  onPaymentError?: (error: string) => void
  className?: string
  tenantId?: string
  userId?: string
  defaultProvider?: 'paystack' | 'flutterwave' | 'interswitch'
  defaultCurrency?: string
  defaultAmount?: number
  maxSplitParties?: number
  enableLayaway?: boolean
  enableInstallments?: boolean
}

interface PaymentState {
  loading: boolean
  error: string | null
  success: string | null
  splitCalculation?: any
  paymentUrl?: string
  reference?: string
  status?: string
}

interface PaymentSplit {
  id: string
  recipient: {
    id: string
    type: 'merchant' | 'partner' | 'platform' | 'service_fee' | 'tax' | 'custom'
    name: string
    email?: string
    bankAccount?: {
      accountNumber: string
      bankCode: string
      accountName: string
    }
  }
  type: 'percentage' | 'fixed_amount' | 'remaining' | 'commission'
  value: number
  minimumAmount?: number
  maximumAmount?: number
  description?: string
  calculatedAmount?: number
}

interface InstallmentData {
  totalAmount: number
  numberOfInstallments: number
  frequency: 'weekly' | 'bi_weekly' | 'monthly' | 'custom'
  startDate: string
  downPayment: number
  interestRate: number
  lateFeeAmount: number
  lateFeeType: 'fixed' | 'percentage'
  earlyPaymentDiscount: number
  currency: string
  customerId: string
  description: string
}

interface LayawayData {
  totalAmount: number
  minimumDeposit: number
  depositPercentage: number
  layawayPeriodDays: number
  products: Array<{
    id: string
    name: string
    price: number
    quantity: number
    sku?: string
    category?: string
  }>
  currency: string
  customerId: string
  merchantId: string
  expiryDate?: string
  reminderSchedule: number[]
  autoRenew: boolean
}

export function SplitPaymentCell({
  mode = 'split_payment',
  onPaymentSuccess,
  onPaymentError,
  className = '',
  tenantId = '',
  userId = '',
  defaultProvider = 'paystack',
  defaultCurrency = 'NGN',
  defaultAmount = 0,
  maxSplitParties = 10,
  enableLayaway = true,
  enableInstallments = true
}: SplitPaymentCellProps) {
  const [currentMode, setCurrentMode] = useState<typeof mode>(mode)
  const [paymentState, setPaymentState] = useState<PaymentState>({
    loading: false,
    error: null,
    success: null
  })

  // Split payment states
  const [splitPaymentData, setSplitPaymentData] = useState({
    totalAmount: defaultAmount || 0,
    currency: defaultCurrency,
    provider: defaultProvider,
    customerId: '',
    merchantId: '',
    description: '',
    splits: [] as PaymentSplit[]
  })

  // Installment states
  const [installmentData, setInstallmentData] = useState<InstallmentData>({
    totalAmount: defaultAmount || 0,
    numberOfInstallments: 4,
    frequency: 'monthly',
    startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
    downPayment: 0,
    interestRate: 0,
    lateFeeAmount: 50,
    lateFeeType: 'fixed',
    earlyPaymentDiscount: 0,
    currency: defaultCurrency,
    customerId: '',
    description: ''
  })

  // Layaway states
  const [layawayData, setLayawayData] = useState<LayawayData>({
    totalAmount: defaultAmount || 0,
    minimumDeposit: 0,
    depositPercentage: 20,
    layawayPeriodDays: 90,
    products: [],
    currency: defaultCurrency,
    customerId: '',
    merchantId: '',
    reminderSchedule: [14, 7, 3, 1],
    autoRenew: false
  })

  // Multi-method payment state
  const [multiMethodData, setMultiMethodData] = useState({
    totalAmount: defaultAmount || 0,
    currency: defaultCurrency,
    customerId: '',
    paymentMethods: [] as Array<{
      id: string
      method: string
      amount: number
      provider?: string
      accountDetails?: any
    }>
  })

  // Calculator and preview states
  const [previewMode, setPreviewMode] = useState(false)
  const [calculationResult, setCalculationResult] = useState<any>(null)

  // Currency and provider configurations
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

  const splitTypes = [
    { value: 'percentage', label: 'Percentage', icon: Percent, description: 'Split by percentage of total' },
    { value: 'fixed_amount', label: 'Fixed Amount', icon: DollarSign, description: 'Fixed amount split' },
    { value: 'remaining', label: 'Remaining Balance', icon: Target, description: 'Gets remaining amount' },
    { value: 'commission', label: 'Commission', icon: TrendingUp, description: 'Commission-based split' }
  ]

  const recipientTypes = [
    { value: 'merchant', label: 'Merchant', icon: Building2 },
    { value: 'partner', label: 'Partner', icon: Users },
    { value: 'platform', label: 'Platform Fee', icon: Zap },
    { value: 'service_fee', label: 'Service Fee', icon: Settings },
    { value: 'tax', label: 'Tax', icon: Receipt },
    { value: 'custom', label: 'Custom', icon: Star }
  ]

  const paymentMethods = [
    { value: 'card', label: 'Card Payment', icon: CreditCard },
    { value: 'bank', label: 'Bank Transfer', icon: Building2 },
    { value: 'ussd', label: 'USSD', icon: Smartphone },
    { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
    { value: 'wallet', label: 'Wallet', icon: Wallet },
    { value: 'points', label: 'Loyalty Points', icon: Star },
    { value: 'gift_card', label: 'Gift Card', icon: Gift }
  ]

  // Helper functions
  const formatAmount = (amount: number, currency: string) => {
    const symbol = currencySymbols[currency as keyof typeof currencySymbols] || currency
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const generateUniqueId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // Add new split
  const addSplit = useCallback(() => {
    if (splitPaymentData.splits.length >= maxSplitParties) {
      setPaymentState(prev => ({ 
        ...prev, 
        error: `Maximum ${maxSplitParties} split parties allowed` 
      }))
      return
    }

    const newSplit: PaymentSplit = {
      id: generateUniqueId(),
      recipient: {
        id: '',
        type: 'merchant',
        name: ''
      },
      type: 'percentage',
      value: 0
    }

    setSplitPaymentData(prev => ({
      ...prev,
      splits: [...prev.splits, newSplit]
    }))
  }, [splitPaymentData.splits.length, maxSplitParties])

  // Remove split
  const removeSplit = useCallback((splitId: string) => {
    setSplitPaymentData(prev => ({
      ...prev,
      splits: prev.splits.filter(split => split.id !== splitId)
    }))
  }, [])

  // Update split
  const updateSplit = useCallback((splitId: string, updates: Partial<PaymentSplit>) => {
    setSplitPaymentData(prev => ({
      ...prev,
      splits: prev.splits.map(split => 
        split.id === splitId 
          ? { ...split, ...updates }
          : split
      )
    }))
  }, [])

  // Calculate splits preview
  const calculateSplits = async () => {
    if (!splitPaymentData.totalAmount || splitPaymentData.splits.length < 2) {
      setPaymentState(prev => ({ 
        ...prev, 
        error: 'Please enter total amount and add at least 2 splits' 
      }))
      return
    }

    setPaymentState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch('/api/cells/payment/SplitPayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'calculateSplitAmounts',
          payload: {
            totalAmount: splitPaymentData.totalAmount,
            currency: splitPaymentData.currency,
            splits: splitPaymentData.splits,
            tenantId
          }
        })
      })

      const result = await response.json()

      if (result.success) {
        setCalculationResult(result.data)
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          success: 'Split amounts calculated successfully',
          splitCalculation: result.data
        }))
        setPreviewMode(true)
      } else {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          error: result.message || 'Calculation failed'
        }))
      }
    } catch (error) {
      setPaymentState(prev => ({
        ...prev,
        loading: false,
        error: 'Split calculation service unavailable'
      }))
    }
  }

  // Initialize split payment
  const initializeSplitPayment = async () => {
    if (!calculationResult || !calculationResult.validationPassed) {
      setPaymentState(prev => ({ 
        ...prev, 
        error: 'Please calculate and validate splits first' 
      }))
      return
    }

    setPaymentState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch('/api/cells/payment/SplitPayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'initializeSplitPayment',
          payload: {
            ...splitPaymentData,
            tenantId,
            userId,
            metadata: {
              calculatedAt: new Date().toISOString(),
              splitCount: splitPaymentData.splits.length
            }
          }
        })
      })

      const result = await response.json()

      if (result.success) {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          success: result.message,
          paymentUrl: result.data.paymentUrl,
          reference: result.data.reference
        }))

        if (result.data.paymentUrl) {
          const paymentWindow = window.open(
            result.data.paymentUrl,
            'split_payment',
            'width=500,height=600,scrollbars=yes,resizable=yes'
          )
          
          const pollPayment = setInterval(() => {
            if (paymentWindow?.closed) {
              clearInterval(pollPayment)
              onPaymentSuccess?.(result.data)
            }
          }, 1000)
        } else {
          onPaymentSuccess?.(result.data)
        }
      } else {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          error: result.message || 'Payment initialization failed'
        }))
        onPaymentError?.(result.message || 'Payment initialization failed')
      }
    } catch (error) {
      const errorMessage = 'Split payment service unavailable'
      setPaymentState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
      onPaymentError?.(errorMessage)
    }
  }

  // Create installment plan
  const createInstallmentPlan = async () => {
    if (!installmentData.totalAmount || !installmentData.customerId) {
      setPaymentState(prev => ({ 
        ...prev, 
        error: 'Please enter total amount and customer ID' 
      }))
      return
    }

    setPaymentState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch('/api/cells/payment/SplitPayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'createInstallmentPlan',
          payload: {
            ...installmentData,
            tenantId,
            userId
          }
        })
      })

      const result = await response.json()

      if (result.success) {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          success: result.message,
          reference: result.data.reference
        }))
        onPaymentSuccess?.(result.data)
      } else {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          error: result.message || 'Installment plan creation failed'
        }))
        onPaymentError?.(result.message || 'Installment plan creation failed')
      }
    } catch (error) {
      const errorMessage = 'Installment service unavailable'
      setPaymentState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
      onPaymentError?.(errorMessage)
    }
  }

  // Initialize layaway
  const initializeLayaway = async () => {
    if (!layawayData.totalAmount || !layawayData.customerId || layawayData.products.length === 0) {
      setPaymentState(prev => ({ 
        ...prev, 
        error: 'Please enter total amount, customer ID, and at least one product' 
      }))
      return
    }

    setPaymentState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch('/api/cells/payment/SplitPayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'initializeLayaway',
          payload: {
            ...layawayData,
            tenantId,
            userId
          }
        })
      })

      const result = await response.json()

      if (result.success) {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          success: result.message,
          reference: result.data.reference
        }))
        onPaymentSuccess?.(result.data)
      } else {
        setPaymentState(prev => ({
          ...prev,
          loading: false,
          error: result.message || 'Layaway initialization failed'
        }))
        onPaymentError?.(result.message || 'Layaway initialization failed')
      }
    } catch (error) {
      const errorMessage = 'Layaway service unavailable'
      setPaymentState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
      onPaymentError?.(errorMessage)
    }
  }

  // Add product to layaway
  const addProduct = () => {
    const newProduct = {
      id: generateUniqueId(),
      name: '',
      price: 0,
      quantity: 1,
      sku: '',
      category: ''
    }

    setLayawayData(prev => ({
      ...prev,
      products: [...prev.products, newProduct]
    }))
  }

  // Remove product from layaway
  const removeProduct = (productId: string) => {
    setLayawayData(prev => ({
      ...prev,
      products: prev.products.filter(product => product.id !== productId)
    }))
  }

  // Update product
  const updateProduct = (productId: string, updates: any) => {
    setLayawayData(prev => ({
      ...prev,
      products: prev.products.map(product =>
        product.id === productId 
          ? { ...product, ...updates }
          : product
      )
    }))
  }

  // Calculate layaway minimum deposit
  useEffect(() => {
    const calculatedDeposit = (layawayData.totalAmount * layawayData.depositPercentage) / 100
    setLayawayData(prev => ({
      ...prev,
      minimumDeposit: Math.max(calculatedDeposit, 10) // Minimum $10 or equivalent
    }))
  }, [layawayData.totalAmount, layawayData.depositPercentage])

  // Calculate total product value
  useEffect(() => {
    const total = layawayData.products.reduce((sum, product) => 
      sum + (product.price * product.quantity), 0
    )
    setLayawayData(prev => ({
      ...prev,
      totalAmount: total
    }))
  }, [layawayData.products])

  return (
    <Card className={`w-full max-w-6xl ${className}`}>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 p-3 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full w-fit">
          <Share2 className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle className="text-2xl font-bold">
          Advanced Payment Solutions
        </CardTitle>
        <CardDescription>
          Split payments, installments, layaway, and multi-method processing for Nigerian markets
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
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="split_payment" className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Split Payment</span>
            </TabsTrigger>
            {enableInstallments && (
              <TabsTrigger value="installment" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Installments</span>
              </TabsTrigger>
            )}
            {enableLayaway && (
              <TabsTrigger value="layaway" className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden sm:inline">Layaway</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="multi_method" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Multi-Method</span>
            </TabsTrigger>
          </TabsList>

          {/* Split Payment Tab */}
          <TabsContent value="split_payment" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Payment Configuration */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Share2 className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold">Payment Configuration</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalAmount">Total Amount</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="totalAmount"
                        type="number"
                        placeholder="0.00"
                        value={splitPaymentData.totalAmount}
                        onChange={(e) => setSplitPaymentData(prev => ({ 
                          ...prev, 
                          totalAmount: parseFloat(e.target.value) || 0 
                        }))}
                        className="pl-10"
                        step="0.01"
                        min="1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                      value={splitPaymentData.currency}
                      onValueChange={(value) => setSplitPaymentData(prev => ({ 
                        ...prev, 
                        currency: value 
                      }))}
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

                <div className="space-y-2">
                  <Label>Payment Provider</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {paymentProviders.map((provider) => (
                      <div
                        key={provider.value}
                        onClick={() => setSplitPaymentData(prev => ({ 
                          ...prev, 
                          provider: provider.value as any 
                        }))}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          splitPaymentData.provider === provider.value 
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerId">Customer ID</Label>
                    <Input
                      id="customerId"
                      placeholder="customer@example.com"
                      value={splitPaymentData.customerId}
                      onChange={(e) => setSplitPaymentData(prev => ({ 
                        ...prev, 
                        customerId: e.target.value 
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="merchantId">Merchant ID</Label>
                    <Input
                      id="merchantId"
                      placeholder="merchant@example.com"
                      value={splitPaymentData.merchantId}
                      onChange={(e) => setSplitPaymentData(prev => ({ 
                        ...prev, 
                        merchantId: e.target.value 
                      }))}
                    />
                  </div>
                </div>
              </div>

              {/* Split Configuration */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold">Split Configuration</h3>
                  </div>
                  <Button
                    onClick={addSplit}
                    size="sm"
                    variant="outline"
                    disabled={splitPaymentData.splits.length >= maxSplitParties}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Split
                  </Button>
                </div>

                {splitPaymentData.splits.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                    <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No splits configured yet</p>
                    <p className="text-sm text-gray-400">Click "Add Split" to get started</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {splitPaymentData.splits.map((split, index) => (
                      <div key={split.id} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">Split #{index + 1}</Badge>
                          <Button
                            onClick={() => removeSplit(split.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Recipient Type</Label>
                            <Select
                              value={split.recipient.type}
                              onValueChange={(value) => updateSplit(split.id, {
                                recipient: { ...split.recipient, type: value as any }
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {recipientTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    <div className="flex items-center gap-2">
                                      <type.icon className="h-4 w-4" />
                                      {type.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Split Type</Label>
                            <Select
                              value={split.type}
                              onValueChange={(value) => updateSplit(split.id, {
                                type: value as any,
                                value: 0 // Reset value when type changes
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {splitTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    <div className="flex items-center gap-2">
                                      <type.icon className="h-4 w-4" />
                                      {type.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Recipient Name</Label>
                          <Input
                            placeholder="Enter recipient name"
                            value={split.recipient.name}
                            onChange={(e) => updateSplit(split.id, {
                              recipient: { ...split.recipient, name: e.target.value }
                            })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>
                              {split.type === 'percentage' ? 'Percentage (%)' : 
                               split.type === 'fixed_amount' ? `Amount (${splitPaymentData.currency})` :
                               split.type === 'remaining' ? 'Share Count' : 'Rate (%)'}
                            </Label>
                            <Input
                              type="number"
                              placeholder={split.type === 'percentage' ? '10' : '100.00'}
                              value={split.value}
                              onChange={(e) => updateSplit(split.id, {
                                value: parseFloat(e.target.value) || 0
                              })}
                              step={split.type === 'percentage' ? '0.01' : '0.01'}
                              min="0"
                              max={split.type === 'percentage' ? '100' : undefined}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Recipient ID</Label>
                            <Input
                              placeholder="account@example.com"
                              value={split.recipient.id}
                              onChange={(e) => updateSplit(split.id, {
                                recipient: { ...split.recipient, id: e.target.value }
                              })}
                            />
                          </div>
                        </div>

                        {calculationResult && calculationResult.splits?.find((s: any) => s.recipientId === split.recipient.id) && (
                          <div className="bg-green-50 p-3 rounded-lg">
                            <div className="text-sm font-medium text-green-800">
                              Calculated Amount: {formatAmount(
                                calculationResult.splits.find((s: any) => s.recipientId === split.recipient.id)?.calculatedAmount || 0,
                                splitPaymentData.currency
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {splitPaymentData.splits.length >= 2 && (
                  <div className="flex gap-2">
                    <Button
                      onClick={calculateSplits}
                      disabled={paymentState.loading}
                      className="flex-1"
                      variant="outline"
                    >
                      {paymentState.loading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Calculator className="h-4 w-4 mr-2" />
                      )}
                      Calculate Splits
                    </Button>

                    {calculationResult && calculationResult.validationPassed && (
                      <Button
                        onClick={initializeSplitPayment}
                        disabled={paymentState.loading}
                        className="flex-1"
                      >
                        {paymentState.loading ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4 mr-2" />
                        )}
                        Initialize Payment
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Split Preview */}
            {previewMode && calculationResult && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Split Preview</h3>
                  <Badge variant={calculationResult.validationPassed ? "default" : "destructive"}>
                    {calculationResult.validationPassed ? "Valid" : "Invalid"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatAmount(splitPaymentData.totalAmount, splitPaymentData.currency)}
                    </div>
                    <div className="text-sm text-gray-500">Total Amount</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatAmount(calculationResult.totalCalculated, splitPaymentData.currency)}
                    </div>
                    <div className="text-sm text-gray-500">Calculated Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {calculationResult.splits?.length || 0}
                    </div>
                    <div className="text-sm text-gray-500">Split Parties</div>
                  </div>
                </div>

                {calculationResult.errors?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-red-600">Validation Errors:</h4>
                    {calculationResult.errors.map((error: string, index: number) => (
                      <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                        {error}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-medium">Split Breakdown:</h4>
                  {calculationResult.splits?.map((split: any, index: number) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b">
                      <div>
                        <div className="font-medium">{split.recipientName}</div>
                        <div className="text-sm text-gray-500">{split.recipientType}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {formatAmount(split.calculatedAmount, splitPaymentData.currency)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {split.splitType === 'percentage' ? `${split.originalValue}%` : 
                           split.splitType === 'fixed_amount' ? 'Fixed' : split.splitType}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Installment Tab */}
          {enableInstallments && (
            <TabsContent value="installment" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold">Installment Plan</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="installmentTotal">Total Amount</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="installmentTotal"
                          type="number"
                          value={installmentData.totalAmount}
                          onChange={(e) => setInstallmentData(prev => ({ 
                            ...prev, 
                            totalAmount: parseFloat(e.target.value) || 0 
                          }))}
                          className="pl-10"
                          step="0.01"
                          min="1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="downPayment">Down Payment</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="downPayment"
                          type="number"
                          value={installmentData.downPayment}
                          onChange={(e) => setInstallmentData(prev => ({ 
                            ...prev, 
                            downPayment: parseFloat(e.target.value) || 0 
                          }))}
                          className="pl-10"
                          step="0.01"
                          min="0"
                          max={installmentData.totalAmount}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="numberOfInstallments">Number of Installments</Label>
                      <Select
                        value={installmentData.numberOfInstallments.toString()}
                        onValueChange={(value) => setInstallmentData(prev => ({ 
                          ...prev, 
                          numberOfInstallments: parseInt(value) 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 6, 8, 12, 18, 24].map(num => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} installments
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Payment Frequency</Label>
                      <Select
                        value={installmentData.frequency}
                        onValueChange={(value) => setInstallmentData(prev => ({ 
                          ...prev, 
                          frequency: value as any
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="interestRate">Interest Rate (%)</Label>
                      <Input
                        id="interestRate"
                        type="number"
                        value={installmentData.interestRate}
                        onChange={(e) => setInstallmentData(prev => ({ 
                          ...prev, 
                          interestRate: parseFloat(e.target.value) || 0 
                        }))}
                        step="0.01"
                        min="0"
                        max="50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="startDate">First Payment Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={installmentData.startDate}
                        onChange={(e) => setInstallmentData(prev => ({ 
                          ...prev, 
                          startDate: e.target.value 
                        }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customerId">Customer ID</Label>
                    <Input
                      id="customerId"
                      placeholder="customer@example.com"
                      value={installmentData.customerId}
                      onChange={(e) => setInstallmentData(prev => ({ 
                        ...prev, 
                        customerId: e.target.value 
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Payment plan description"
                      value={installmentData.description}
                      onChange={(e) => setInstallmentData(prev => ({ 
                        ...prev, 
                        description: e.target.value 
                      }))}
                    />
                  </div>

                  <Button
                    onClick={createInstallmentPlan}
                    disabled={paymentState.loading}
                    className="w-full"
                  >
                    {paymentState.loading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Calendar className="h-4 w-4 mr-2" />
                    )}
                    Create Installment Plan
                  </Button>
                </div>

                {/* Installment Preview */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Info className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold">Plan Preview</h3>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between">
                      <span>Total Amount:</span>
                      <span className="font-medium">
                        {formatAmount(installmentData.totalAmount, installmentData.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Down Payment:</span>
                      <span className="font-medium">
                        {formatAmount(installmentData.downPayment, installmentData.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Financed Amount:</span>
                      <span className="font-medium">
                        {formatAmount(installmentData.totalAmount - installmentData.downPayment, installmentData.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span>Estimated Payment:</span>
                      <span className="font-bold text-blue-600">
                        {formatAmount(
                          (installmentData.totalAmount - installmentData.downPayment) / installmentData.numberOfInstallments,
                          installmentData.currency
                        )} / {installmentData.frequency.replace('_', '-')}
                      </span>
                    </div>
                  </div>

                  <div className="text-center text-sm text-gray-500">
                    * Estimated payments may vary based on interest calculation
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          {/* Layaway Tab */}
          {enableLayaway && (
            <TabsContent value="layaway" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <ShoppingCart className="h-5 w-5 text-orange-600" />
                    <h3 className="text-lg font-semibold">Layaway Order</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="depositPercentage">Deposit Percentage (%)</Label>
                      <Input
                        id="depositPercentage"
                        type="number"
                        value={layawayData.depositPercentage}
                        onChange={(e) => setLayawayData(prev => ({ 
                          ...prev, 
                          depositPercentage: parseFloat(e.target.value) || 10 
                        }))}
                        min="5"
                        max="50"
                        step="5"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="layawayPeriod">Layaway Period (days)</Label>
                      <Select
                        value={layawayData.layawayPeriodDays.toString()}
                        onValueChange={(value) => setLayawayData(prev => ({ 
                          ...prev, 
                          layawayPeriodDays: parseInt(value) 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="60">60 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="120">120 days</SelectItem>
                          <SelectItem value="180">180 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="layawayCustomerId">Customer ID</Label>
                      <Input
                        id="layawayCustomerId"
                        placeholder="customer@example.com"
                        value={layawayData.customerId}
                        onChange={(e) => setLayawayData(prev => ({ 
                          ...prev, 
                          customerId: e.target.value 
                        }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="layawayMerchantId">Merchant ID</Label>
                      <Input
                        id="layawayMerchantId"
                        placeholder="merchant@example.com"
                        value={layawayData.merchantId}
                        onChange={(e) => setLayawayData(prev => ({ 
                          ...prev, 
                          merchantId: e.target.value 
                        }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="autoRenew"
                      checked={layawayData.autoRenew}
                      onCheckedChange={(checked) => setLayawayData(prev => ({ 
                        ...prev, 
                        autoRenew: checked 
                      }))}
                    />
                    <Label htmlFor="autoRenew">Auto-renew layaway if not completed</Label>
                  </div>

                  {/* Products Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Products</h4>
                      <Button onClick={addProduct} size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Product
                      </Button>
                    </div>

                    {layawayData.products.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                        <ShoppingCart className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No products added yet</p>
                        <p className="text-sm text-gray-400">Click "Add Product" to get started</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {layawayData.products.map((product, index) => (
                          <div key={product.id} className="p-3 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">Product #{index + 1}</Badge>
                              <Button
                                onClick={() => removeProduct(product.id)}
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label>Product Name</Label>
                                <Input
                                  placeholder="Product name"
                                  value={product.name}
                                  onChange={(e) => updateProduct(product.id, { 
                                    name: e.target.value 
                                  })}
                                />
                              </div>

                              <div className="space-y-1">
                                <Label>SKU</Label>
                                <Input
                                  placeholder="SKU-123"
                                  value={product.sku}
                                  onChange={(e) => updateProduct(product.id, { 
                                    sku: e.target.value 
                                  })}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label>Price</Label>
                                <Input
                                  type="number"
                                  placeholder="0.00"
                                  value={product.price}
                                  onChange={(e) => updateProduct(product.id, { 
                                    price: parseFloat(e.target.value) || 0 
                                  })}
                                  step="0.01"
                                  min="0"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  placeholder="1"
                                  value={product.quantity}
                                  onChange={(e) => updateProduct(product.id, { 
                                    quantity: parseInt(e.target.value) || 1 
                                  })}
                                  min="1"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={initializeLayaway}
                    disabled={paymentState.loading || layawayData.products.length === 0}
                    className="w-full"
                  >
                    {paymentState.loading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShoppingCart className="h-4 w-4 mr-2" />
                    )}
                    Initialize Layaway
                  </Button>
                </div>

                {/* Layaway Summary */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="h-5 w-5 text-purple-600" />
                    <h3 className="text-lg font-semibold">Layaway Summary</h3>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between">
                      <span>Total Value:</span>
                      <span className="font-medium">
                        {formatAmount(layawayData.totalAmount, layawayData.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Required Deposit ({layawayData.depositPercentage}%):</span>
                      <span className="font-medium">
                        {formatAmount(layawayData.minimumDeposit, layawayData.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Remaining Balance:</span>
                      <span className="font-medium">
                        {formatAmount(layawayData.totalAmount - layawayData.minimumDeposit, layawayData.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span>Layaway Period:</span>
                      <span className="font-bold text-orange-600">
                        {layawayData.layawayPeriodDays} days
                      </span>
                    </div>
                  </div>

                  {layawayData.products.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Product Summary:</h4>
                      <div className="space-y-2">
                        {layawayData.products.map((product, index) => (
                          <div key={product.id} className="flex justify-between text-sm">
                            <span>{product.name} x{product.quantity}</span>
                            <span>
                              {formatAmount(product.price * product.quantity, layawayData.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-center text-sm text-gray-500">
                    * Products will be reserved upon deposit payment
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          {/* Multi-Method Tab */}
          <TabsContent value="multi_method" className="space-y-6">
            <div className="text-center">
              <CreditCard className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Multi-Method Payment</h3>
              <p className="text-gray-600">
                Combine multiple payment methods for a single transaction
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Coming Soon</h4>
              <p className="text-sm text-gray-600">
                Multi-method payment processing is currently under development. 
                This feature will allow customers to split payments across cards, bank transfers, 
                mobile money, wallets, and loyalty points.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Reference Display */}
        {paymentState.reference && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Transaction Reference</span>
            </div>
            <div className="font-mono text-sm bg-white p-2 rounded border">
              {paymentState.reference}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SplitPaymentCell