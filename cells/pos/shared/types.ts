// Shared types for POS cells to avoid circular dependencies

export interface CartItem {
  productId: string
  name: string
  price: number
  quantity: number
  total: number
  category?: string
}

export interface PaymentMethod {
  type: 'card' | 'cash' | 'bank_transfer' | 'mobile_money' | 'paystack' | 'flutterwave'
  name: string
  provider?: string
  enabled: boolean
  processingFee: number
  minAmount?: number
  maxAmount?: number
}

export interface SplitPayment {
  id: string
  paymentMethod: PaymentMethod
  amount: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reference?: string
  metadata?: any
}

export interface Transaction {
  id: string
  tenantId: string
  customerId?: string
  items: CartItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  payments: SplitPayment[]
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  completedAt?: string
  metadata?: any
}

export interface OrderTotals {
  subtotal: number
  tax: number
  discount: number
  total: number
  appliedDiscounts: any[]
}

export type DiscountType = 'percentage' | 'fixed_amount' | 'buy_x_get_y' | 'category' | 'customer_tier'

export interface AppliedDiscount {
  discountId: string
  discountName: string
  amount: number
  type: DiscountType
  appliedTo: string[]
}

export interface GiftCard {
  id: string
  code: string
  originalAmount: number
  currentBalance: number
  currency: string
  status: 'active' | 'redeemed' | 'expired' | 'cancelled'
  recipientEmail?: string
  recipientName?: string
  senderName?: string
  personalMessage?: string
  issuedAt: string
  expiresAt?: string
  lastUsedAt?: string
  transactions: GiftCardTransaction[]
}

export interface GiftCardTransaction {
  id: string
  type: 'issue' | 'redeem' | 'refund'
  amount: number
  transactionId?: string
  timestamp: string
  notes?: string
}

export interface Coupon {
  id: string
  code: string
  name: string
  description: string
  discountType: 'percentage' | 'fixed_amount'
  discountValue: number
  minOrderAmount?: number
  maxDiscountAmount?: number
  status: 'active' | 'used' | 'expired' | 'deactivated'
  usageLimit?: number
  usageCount: number
  validFrom: string
  validUntil?: string
  applicableProducts?: string[]
  applicableCategories?: string[]
  createdAt: string
}

export interface RedemptionResult {
  success: boolean
  amount?: number
  remainingBalance?: number
  error?: string
}