// Payment Service - Real Paystack Integration Infrastructure
import { PaymentResult, PaymentProvider } from '../app/pos/components/TransactionProcessingCell'

export interface PaymentConfig {
  paystackSecretKey?: string
  paystackPublicKey?: string
  environment: 'test' | 'live'
}

export interface TransactionRecord {
  id: string
  tenantId: string
  amount: number
  currency: string
  paymentMethod: string
  status: 'pending' | 'success' | 'failed' | 'refunded' | 'partially_refunded'
  paystackReference?: string
  customerInfo?: {
    name?: string
    email?: string
    phone?: string
  }
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface RefundRecord {
  id: string
  originalTransactionId: string
  amount: number
  reason?: string
  status: 'pending' | 'success' | 'failed'
  paystackRefundId?: string
  processedBy: string
  createdAt: string
  updatedAt: string
}

export class PaymentService {
  private config: PaymentConfig
  private paystackBaseUrl: string

  constructor(config: PaymentConfig) {
    this.config = config
    this.paystackBaseUrl = config.environment === 'live' 
      ? 'https://api.paystack.co' 
      : 'https://api.paystack.co' // Paystack uses same URL for test/live, distinguished by keys
  }

  async initializePayment(params: {
    amount: number // in kobo (smallest currency unit)
    email: string
    currency?: string
    reference?: string
    metadata?: Record<string, any>
    channels?: string[]
  }): Promise<{
    success: boolean
    data?: {
      authorization_url: string
      access_code: string
      reference: string
    }
    message: string
  }> {
    if (!this.config.paystackSecretKey) {
      return {
        success: false,
        message: 'Paystack credentials not configured'
      }
    }

    try {
      const response = await fetch(`${this.paystackBaseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: params.amount,
          email: params.email,
          currency: params.currency || 'NGN',
          reference: params.reference || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          metadata: params.metadata,
          channels: params.channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
        })
      })

      const data = await response.json()

      if (data.status && data.data) {
        return {
          success: true,
          data: data.data,
          message: 'Payment initialized successfully'
        }
      } else {
        return {
          success: false,
          message: data.message || 'Payment initialization failed'
        }
      }
    } catch (error) {
      console.error('Payment initialization error:', error)
      return {
        success: false,
        message: 'Payment service error'
      }
    }
  }

  async verifyPayment(reference: string): Promise<{
    success: boolean
    data?: {
      reference: string
      amount: number
      currency: string
      status: string
      paid_at?: string
      channel: string
      fees?: number
      customer: {
        email: string
        customer_code?: string
      }
    }
    message: string
  }> {
    if (!this.config.paystackSecretKey) {
      return {
        success: false,
        message: 'Paystack credentials not configured'
      }
    }

    try {
      const response = await fetch(`${this.paystackBaseUrl}/transaction/verify/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.paystackSecretKey}`,
        }
      })

      const data = await response.json()

      if (data.status && data.data) {
        return {
          success: true,
          data: data.data,
          message: 'Payment verification successful'
        }
      } else {
        return {
          success: false,
          message: data.message || 'Payment verification failed'
        }
      }
    } catch (error) {
      console.error('Payment verification error:', error)
      return {
        success: false,
        message: 'Payment verification error'
      }
    }
  }

  async processRefund(params: {
    transactionReference: string
    amount?: number // in kobo, if not provided, full refund
    currency?: string
    customerNote?: string
    merchantNote?: string
  }): Promise<{
    success: boolean
    data?: {
      transaction: {
        reference: string
        status: string
      }
      refund: {
        id: string
        amount: number
        currency: string
        status: string
        refunded_by: string
        refunded_at: string
      }
    }
    message: string
  }> {
    if (!this.config.paystackSecretKey) {
      return {
        success: false,
        message: 'Paystack credentials not configured'
      }
    }

    try {
      const response = await fetch(`${this.paystackBaseUrl}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: params.transactionReference,
          amount: params.amount,
          currency: params.currency || 'NGN',
          customer_note: params.customerNote,
          merchant_note: params.merchantNote
        })
      })

      const data = await response.json()

      if (data.status && data.data) {
        return {
          success: true,
          data: data.data,
          message: 'Refund processed successfully'
        }
      } else {
        return {
          success: false,
          message: data.message || 'Refund processing failed'
        }
      }
    } catch (error) {
      console.error('Refund processing error:', error)
      return {
        success: false,
        message: 'Refund service error'
      }
    }
  }

  async listRefunds(params?: {
    reference?: string
    currency?: string
    perPage?: number
    page?: number
  }): Promise<{
    success: boolean
    data?: Array<{
      id: string
      amount: number
      currency: string
      transaction: {
        reference: string
        amount: number
      }
      status: string
      refunded_by: string
      refunded_at: string
      created_at: string
    }>
    meta?: {
      total: number
      perPage: number
      page: number
      pageCount: number
    }
    message: string
  }> {
    if (!this.config.paystackSecretKey) {
      return {
        success: false,
        message: 'Paystack credentials not configured'
      }
    }

    try {
      const queryParams = new URLSearchParams()
      if (params?.reference) queryParams.append('transaction', params.reference)
      if (params?.currency) queryParams.append('currency', params.currency)
      if (params?.perPage) queryParams.append('perPage', params.perPage.toString())
      if (params?.page) queryParams.append('page', params.page.toString())

      const response = await fetch(`${this.paystackBaseUrl}/refund?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.paystackSecretKey}`,
        }
      })

      const data = await response.json()

      if (data.status) {
        return {
          success: true,
          data: data.data,
          meta: data.meta,
          message: 'Refunds retrieved successfully'
        }
      } else {
        return {
          success: false,
          message: data.message || 'Failed to retrieve refunds'
        }
      }
    } catch (error) {
      console.error('List refunds error:', error)
      return {
        success: false,
        message: 'Refund service error'
      }
    }
  }
}

// Updated PaystackProvider with real integration
export class RealPaystackProvider implements PaymentProvider {
  name = 'Paystack'
  type = 'card' as const
  private paymentService: PaymentService

  constructor(config: PaymentConfig) {
    this.paymentService = new PaymentService(config)
  }

  async process(amount: number, metadata?: any): Promise<PaymentResult> {
    try {
      const { email, reference, customerInfo } = metadata || {}
      
      if (!email) {
        return {
          success: false,
          message: 'Customer email is required for Paystack payments'
        }
      }

      // Initialize payment with Paystack
      const initialization = await this.paymentService.initializePayment({
        amount: Math.round(amount * 100), // Convert to kobo
        email,
        reference,
        metadata: {
          customer_info: customerInfo,
          pos_transaction: true
        }
      })

      if (!initialization.success || !initialization.data) {
        return {
          success: false,
          message: initialization.message
        }
      }

      // For POS systems, we would typically redirect to payment page or use Paystack Inline
      // For now, return the authorization URL for manual completion
      return {
        success: true,
        transactionId: initialization.data.reference,
        reference: initialization.data.reference,
        message: 'Payment initialized - redirect customer to complete payment',
        fee: amount * 0.015, // 1.5% estimated fee
        refundable: true
      }

    } catch (error) {
      console.error('Paystack payment error:', error)
      return {
        success: false,
        message: 'Payment processing failed'
      }
    }
  }

  async refund(transactionId: string, amount: number, reason?: string): Promise<PaymentResult> {
    try {
      const refundResult = await this.paymentService.processRefund({
        transactionReference: transactionId,
        amount: Math.round(amount * 100), // Convert to kobo
        merchantNote: reason
      })

      if (refundResult.success && refundResult.data) {
        return {
          success: true,
          transactionId: refundResult.data.refund.id,
          reference: refundResult.data.transaction.reference,
          message: `Refund of ₦${amount.toFixed(2)} processed successfully`,
          refundTransactionId: transactionId
        }
      } else {
        return {
          success: false,
          message: refundResult.message
        }
      }
    } catch (error) {
      console.error('Paystack refund error:', error)
      return {
        success: false,
        message: 'Refund processing failed'
      }
    }
  }
}

// Factory function to create payment service
export function createPaymentService(): PaymentService {
  const config: PaymentConfig = {
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY,
    environment: process.env.NODE_ENV === 'production' ? 'live' : 'test'
  }

  return new PaymentService(config)
}

// Factory function to create real Paystack provider
export function createRealPaystackProvider(): RealPaystackProvider {
  const config: PaymentConfig = {
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY,
    environment: process.env.NODE_ENV === 'production' ? 'live' : 'test'
  }

  return new RealPaystackProvider(config)
}