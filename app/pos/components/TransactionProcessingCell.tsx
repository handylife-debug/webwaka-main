'use client'

import { useState, useEffect } from 'react'
import { CreditCard, DollarSign, Smartphone, Gift, Receipt, Clock, Plus, Minus, X, Check } from 'lucide-react'

// Payment Gateway Abstraction Layer
export interface PaymentProvider {
  name: string
  type: 'card' | 'mobile' | 'cash' | 'gift_card'
  process: (amount: number, metadata?: any) => Promise<PaymentResult>
  validate?: (data: any) => boolean
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  reference?: string
  message: string
  fee?: number
}

export interface CartItem {
  id: string
  name: string
  price: number
  categoryId?: string
  stock: number
  quantity: number
  image?: string
}

export interface SplitPayment {
  id: string
  method: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  transactionId?: string
}

export interface DraftSale {
  id: string
  items: CartItem[]
  total: number
  amountPaid: number
  amountDue: number
  splitPayments: SplitPayment[]
  status: 'draft' | 'partial' | 'completed'
  createdAt: Date
  customerInfo?: {
    name?: string
    phone?: string
    email?: string
  }
}

// Paystack Payment Provider Implementation
class PaystackProvider implements PaymentProvider {
  name = 'Paystack'
  type = 'card' as const

  async process(amount: number, metadata?: any): Promise<PaymentResult> {
    try {
      // For now, simulate Paystack integration
      // In production, this would integrate with Paystack API
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate API call
      
      const success = Math.random() > 0.1 // 90% success rate
      
      if (success) {
        return {
          success: true,
          transactionId: `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          reference: `REF_${Date.now()}`,
          message: 'Payment processed successfully via Paystack',
          fee: amount * 0.015 // 1.5% transaction fee
        }
      } else {
        return {
          success: false,
          message: 'Payment declined by bank'
        }
      }
    } catch (error) {
      return {
        success: false,
        message: 'Payment processing failed'
      }
    }
  }
}

// Mobile Wallet Provider (MTN, Airtel, etc.)
class MobileWalletProvider implements PaymentProvider {
  name = 'Mobile Wallet'
  type = 'mobile' as const

  async process(amount: number, metadata?: any): Promise<PaymentResult> {
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const success = Math.random() > 0.05 // 95% success rate
      
      if (success) {
        return {
          success: true,
          transactionId: `mw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          reference: `MW_${Date.now()}`,
          message: 'Payment completed via Mobile Wallet',
          fee: amount * 0.01 // 1% transaction fee
        }
      } else {
        return {
          success: false,
          message: 'Mobile wallet payment failed'
        }
      }
    } catch (error) {
      return {
        success: false,
        message: 'Mobile wallet processing failed'
      }
    }
  }
}

// Cash Payment Provider
class CashProvider implements PaymentProvider {
  name = 'Cash'
  type = 'cash' as const

  async process(amount: number, metadata?: any): Promise<PaymentResult> {
    return {
      success: true,
      transactionId: `cash_${Date.now()}`,
      reference: `CASH_${Date.now()}`,
      message: 'Cash payment received',
      fee: 0
    }
  }
}

// Gift Card Provider
class GiftCardProvider implements PaymentProvider {
  name = 'Gift Card'
  type = 'gift_card' as const

  validate(cardNumber: string): boolean {
    // Simple validation - in production, this would check against a database
    return cardNumber.length >= 12 && /^\d+$/.test(cardNumber)
  }

  async process(amount: number, metadata?: any): Promise<PaymentResult> {
    const { cardNumber, balance } = metadata || {}
    
    if (!this.validate(cardNumber)) {
      return {
        success: false,
        message: 'Invalid gift card number'
      }
    }

    if (balance < amount) {
      return {
        success: false,
        message: 'Insufficient gift card balance'
      }
    }

    return {
      success: true,
      transactionId: `gc_${Date.now()}`,
      reference: `GC_${Date.now()}`,
      message: 'Gift card payment processed',
      fee: 0
    }
  }
}

interface TransactionProcessingCellProps {
  cartItems: CartItem[]
  total: number
  onPaymentComplete: (result: PaymentResult, splitPayments?: SplitPayment[]) => void
  onSaveDraft?: (draft: DraftSale) => void
  isVisible: boolean
  onClose: () => void
}

export default function TransactionProcessingCell({
  cartItems,
  total,
  onPaymentComplete,
  onSaveDraft,
  isVisible,
  onClose
}: TransactionProcessingCellProps) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([])
  const [isSplitMode, setIsSplitMode] = useState(false)
  const [splitAmount, setSplitAmount] = useState('')
  const [giftCardNumber, setGiftCardNumber] = useState('')
  const [giftCardBalance] = useState(100) // Mock balance
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '' })
  const [showPartialPayment, setShowPartialPayment] = useState(false)

  // Payment providers
  const paymentProviders: Record<string, PaymentProvider> = {
    cash: new CashProvider(),
    paystack: new PaystackProvider(),
    mobile_wallet: new MobileWalletProvider(),
    gift_card: new GiftCardProvider()
  }

  const totalPaid = splitPayments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0)
  
  const remainingAmount = total - totalPaid

  const addSplitPayment = async () => {
    const amount = parseFloat(splitAmount)
    if (!amount || amount <= 0 || !selectedPaymentMethod) return

    if (amount > remainingAmount) {
      alert(`Amount cannot exceed remaining balance of $${remainingAmount.toFixed(2)}`)
      return
    }

    setIsProcessing(true)

    const provider = paymentProviders[selectedPaymentMethod]
    let metadata = {}

    if (selectedPaymentMethod === 'gift_card') {
      metadata = { cardNumber: giftCardNumber, balance: giftCardBalance }
    }

    const result = await provider.process(amount, metadata)

    const newSplitPayment: SplitPayment = {
      id: `split_${Date.now()}`,
      method: provider.name,
      amount,
      status: result.success ? 'completed' : 'failed',
      transactionId: result.transactionId
    }

    setSplitPayments(prev => [...prev, newSplitPayment])
    
    if (result.success) {
      setSplitAmount('')
      setGiftCardNumber('')
      
      // Check if payment is complete
      if (amount >= remainingAmount) {
        onPaymentComplete(result, [...splitPayments, newSplitPayment])
      }
    }

    setIsProcessing(false)
  }

  const processSinglePayment = async () => {
    if (!selectedPaymentMethod) return

    setIsProcessing(true)
    
    const provider = paymentProviders[selectedPaymentMethod]
    let metadata = {}

    if (selectedPaymentMethod === 'gift_card') {
      metadata = { cardNumber: giftCardNumber, balance: giftCardBalance }
    }

    const result = await provider.process(total, metadata)
    
    setIsProcessing(false)
    onPaymentComplete(result)
  }

  const saveDraftSale = () => {
    if (!onSaveDraft) return

    const draft: DraftSale = {
      id: `draft_${Date.now()}`,
      items: cartItems,
      total,
      amountPaid: totalPaid,
      amountDue: remainingAmount,
      splitPayments,
      status: totalPaid > 0 ? 'partial' : 'draft',
      createdAt: new Date(),
      customerInfo: customerInfo.name || customerInfo.phone ? customerInfo : undefined
    }

    onSaveDraft(draft)
    onClose()
  }

  const removeSplitPayment = (id: string) => {
    setSplitPayments(prev => prev.filter(p => p.id !== id))
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Payment Processing</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Transaction Summary */}
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Subtotal:</span>
              <span>${(total / 1.085).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span>Tax (8.5%):</span>
              <span>${((total / 1.085) * 0.085).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
            
            {isSplitMode && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-sm text-green-600">
                  <span>Amount Paid:</span>
                  <span>${totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Remaining:</span>
                  <span>${remainingAmount.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Options */}
        <div className="p-6">
          {/* Split Payment Toggle */}
          <div className="mb-6">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={isSplitMode}
                onChange={(e) => setIsSplitMode(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium">Enable Split Payment</span>
            </label>
          </div>

          {/* Payment Methods */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Payment Method</h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Cash */}
              <button
                onClick={() => setSelectedPaymentMethod('cash')}
                className={`p-4 rounded-lg border-2 flex flex-col items-center space-y-2 transition-colors ${
                  selectedPaymentMethod === 'cash'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <DollarSign className="w-8 h-8 text-green-600" />
                <span className="text-sm font-medium">Cash</span>
              </button>

              {/* Paystack */}
              <button
                onClick={() => setSelectedPaymentMethod('paystack')}
                className={`p-4 rounded-lg border-2 flex flex-col items-center space-y-2 transition-colors ${
                  selectedPaymentMethod === 'paystack'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CreditCard className="w-8 h-8 text-blue-600" />
                <span className="text-sm font-medium">Card (Paystack)</span>
              </button>

              {/* Mobile Wallet */}
              <button
                onClick={() => setSelectedPaymentMethod('mobile_wallet')}
                className={`p-4 rounded-lg border-2 flex flex-col items-center space-y-2 transition-colors ${
                  selectedPaymentMethod === 'mobile_wallet'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Smartphone className="w-8 h-8 text-purple-600" />
                <span className="text-sm font-medium">Mobile Wallet</span>
              </button>

              {/* Gift Card */}
              <button
                onClick={() => setSelectedPaymentMethod('gift_card')}
                className={`p-4 rounded-lg border-2 flex flex-col items-center space-y-2 transition-colors ${
                  selectedPaymentMethod === 'gift_card'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Gift className="w-8 h-8 text-orange-600" />
                <span className="text-sm font-medium">Gift Card</span>
              </button>
            </div>

            {/* Gift Card Input */}
            {selectedPaymentMethod === 'gift_card' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Gift Card Number</label>
                <input
                  type="text"
                  value={giftCardNumber}
                  onChange={(e) => setGiftCardNumber(e.target.value)}
                  placeholder="Enter gift card number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500">Available Balance: ${giftCardBalance.toFixed(2)}</p>
              </div>
            )}

            {/* Split Payment Interface */}
            {isSplitMode && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Split Payment</h4>
                
                {/* Split Payment Input */}
                <div className="flex space-x-2 mb-4">
                  <input
                    type="number"
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    placeholder="Amount"
                    max={remainingAmount}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addSplitPayment}
                    disabled={!splitAmount || !selectedPaymentMethod || isProcessing}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isProcessing ? (
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Add Payment
                  </button>
                </div>

                {/* Split Payment List */}
                {splitPayments.length > 0 && (
                  <div className="space-y-2">
                    {splitPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${
                            payment.status === 'completed' ? 'bg-green-500' :
                            payment.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                          }`} />
                          <span className="font-medium">{payment.method}</span>
                          <span>${payment.amount.toFixed(2)}</span>
                        </div>
                        <button
                          onClick={() => removeSplitPayment(payment.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Partial Payment & Layaway */}
            <div className="border-t pt-4">
              <button
                onClick={() => setShowPartialPayment(!showPartialPayment)}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
              >
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">Partial Payment & Layaway</span>
              </button>

              {showPartialPayment && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <input
                      type="text"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Customer Name (Optional)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="tel"
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Phone Number (Optional)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <button
                    onClick={saveDraftSale}
                    className="w-full bg-yellow-600 text-white py-2 rounded-lg font-medium hover:bg-yellow-700 transition-colors"
                  >
                    Save as Draft Sale
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            {!isSplitMode ? (
              <button
                onClick={processSinglePayment}
                disabled={!selectedPaymentMethod || isProcessing}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Receipt className="w-5 h-5 mr-2" />
                    Process Payment (${total.toFixed(2)})
                  </>
                )}
              </button>
            ) : (
              remainingAmount <= 0 && (
                <button
                  onClick={() => onPaymentComplete({ success: true, message: 'Split payment completed', transactionId: `split_${Date.now()}` }, splitPayments)}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 flex items-center justify-center"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Complete Split Payment
                </button>
              )
            )}
            
            <button
              onClick={onClose}
              className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}