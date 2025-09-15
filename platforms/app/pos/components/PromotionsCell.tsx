'use client'

import { useState, useEffect } from 'react'
import { Percent, Gift, Star, Trash2, Plus, Minus, Tag, Users, Calendar } from 'lucide-react'

// Promotion and Discount Types
export interface Discount {
  id: string
  name: string
  type: 'percentage' | 'fixed_amount' | 'bogo' | 'loyalty_points'
  value: number // percentage (0-100), fixed amount, or points required
  applicable: 'all' | 'category' | 'product'
  applicableIds?: string[] // category names or product IDs
  minPurchase?: number
  maxDiscount?: number
  startDate?: Date
  endDate?: Date
  active: boolean
  usageLimit?: number
  usageCount: number
  isAutomatic: boolean
}

export interface Coupon {
  id: string
  code: string
  name: string
  discount: Discount
  singleUse: boolean
  usedBy?: string[]
  expiryDate?: Date
  active: boolean
}

export interface GiftCard {
  id: string
  cardNumber: string
  balance: number
  originalAmount: number
  issuedDate: Date
  expiryDate?: Date
  active: boolean
  lastUsed?: Date
}

export interface LoyaltyAccount {
  id: string
  customerPhone: string
  customerName?: string
  points: number
  totalSpent: number
  joinDate: Date
  lastTransaction?: Date
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
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

export interface AppliedPromotion {
  id: string
  type: 'discount' | 'coupon' | 'loyalty'
  name: string
  discountAmount: number
  itemsAffected?: string[]
}

interface PromotionsCellProps {
  cartItems: CartItem[]
  subtotal: number
  onPromotionsApplied: (promotions: AppliedPromotion[], newSubtotal: number) => void
  isVisible: boolean
  onClose: () => void
}

export default function PromotionsCell({
  cartItems,
  subtotal,
  onPromotionsApplied,
  isVisible,
  onClose
}: PromotionsCellProps) {
  // State management
  const [activeDiscounts, setActiveDiscounts] = useState<Discount[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [giftCards, setGiftCards] = useState<GiftCard[]>([])
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<LoyaltyAccount[]>([])
  const [appliedPromotions, setAppliedPromotions] = useState<AppliedPromotion[]>([])
  
  // UI state
  const [activeTab, setActiveTab] = useState<'discounts' | 'coupons' | 'loyalty'>('discounts')
  const [couponCode, setCouponCode] = useState('')
  const [giftCardNumber, setGiftCardNumber] = useState('')
  const [loyaltyPhone, setLoyaltyPhone] = useState('')
  const [selectedLoyalty, setSelectedLoyalty] = useState<LoyaltyAccount | null>(null)
  const [showNewDiscount, setShowNewDiscount] = useState(false)
  const [newDiscount, setNewDiscount] = useState<Partial<Discount>>({
    type: 'percentage',
    applicable: 'all',
    active: true,
    isAutomatic: false,
    usageCount: 0
  })

  // Sample data initialization
  useEffect(() => {
    // Initialize with sample discounts
    setActiveDiscounts([
      {
        id: 'disc1',
        name: '10% Off Beverages',
        type: 'percentage',
        value: 10,
        applicable: 'category',
        applicableIds: ['Beverages'],
        active: true,
        usageCount: 0,
        isAutomatic: true
      },
      {
        id: 'disc2',
        name: 'Buy 2 Get 1 Free Pastries',
        type: 'bogo',
        value: 1, // get 1 free for every 2 purchased
        applicable: 'category',
        applicableIds: ['Pastries'],
        active: true,
        usageCount: 0,
        isAutomatic: true
      },
      {
        id: 'disc3',
        name: '$5 Off Orders Above $25',
        type: 'fixed_amount',
        value: 5,
        applicable: 'all',
        minPurchase: 25,
        active: true,
        usageCount: 0,
        isAutomatic: true
      }
    ])

    // Initialize with sample coupons
    setCoupons([
      {
        id: 'coup1',
        code: 'WELCOME10',
        name: 'Welcome 10% Off',
        discount: {
          id: 'coup1_disc',
          name: 'Welcome 10% Off',
          type: 'percentage',
          value: 10,
          applicable: 'all',
          active: true,
          usageCount: 0,
          isAutomatic: false
        },
        singleUse: false,
        active: true
      },
      {
        id: 'coup2',
        code: 'COFFEE15',
        name: '15% Off Coffee',
        discount: {
          id: 'coup2_disc',
          name: '15% Off Coffee',
          type: 'percentage',
          value: 15,
          applicable: 'category',
          applicableIds: ['Beverages'],
          active: true,
          usageCount: 0,
          isAutomatic: false
        },
        singleUse: false,
        active: true
      }
    ])

    // Initialize with sample gift cards
    setGiftCards([
      {
        id: 'gc1',
        cardNumber: '1234567890123456',
        balance: 50.00,
        originalAmount: 50.00,
        issuedDate: new Date('2024-08-01'),
        active: true
      },
      {
        id: 'gc2',
        cardNumber: '9876543210987654',
        balance: 25.75,
        originalAmount: 100.00,
        issuedDate: new Date('2024-07-15'),
        active: true,
        lastUsed: new Date('2024-09-01')
      }
    ])

    // Initialize with sample loyalty accounts
    setLoyaltyAccounts([
      {
        id: 'loyal1',
        customerPhone: '+234-800-1234',
        customerName: 'John Doe',
        points: 250,
        totalSpent: 127.50,
        joinDate: new Date('2024-01-15'),
        tier: 'silver'
      },
      {
        id: 'loyal2',
        customerPhone: '+234-800-5678',
        customerName: 'Jane Smith',
        points: 580,
        totalSpent: 305.00,
        joinDate: new Date('2023-11-08'),
        tier: 'gold'
      }
    ])
  }, [])

  // Calculate promotions and discounts
  useEffect(() => {
    calculatePromotions()
  }, [cartItems, subtotal, activeDiscounts, selectedLoyalty])

  const calculatePromotions = () => {
    // Preserve existing manual promotions (coupons, loyalty, gift cards)
    const manualPromotions = appliedPromotions.filter(p => 
      p.type === 'coupon' || p.type === 'loyalty' || p.name.includes('Gift Card')
    )
    
    const autoPromotions: AppliedPromotion[] = []
    let discountedSubtotal = subtotal

    // Apply automatic discounts
    activeDiscounts.forEach(discount => {
      if (!discount.active || !discount.isAutomatic) return

      const discountResult = calculateDiscount(discount, cartItems, discountedSubtotal)
      if (discountResult.amount > 0) {
        autoPromotions.push({
          id: discount.id,
          type: 'discount',
          name: discount.name,
          discountAmount: discountResult.amount,
          itemsAffected: discountResult.itemsAffected
        })
        discountedSubtotal -= discountResult.amount
      }
    })

    // Combine manual and automatic promotions
    const allPromotions = [...manualPromotions, ...autoPromotions]
    const totalDiscount = allPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
    const finalSubtotal = Math.max(0, subtotal - totalDiscount)

    setAppliedPromotions(allPromotions)
    onPromotionsApplied(allPromotions, finalSubtotal)
  }

  const calculateDiscount = (discount: Discount, items: CartItem[], currentSubtotal: number) => {
    let amount = 0
    let itemsAffected: string[] = []

    if (discount.minPurchase && currentSubtotal < discount.minPurchase) {
      return { amount: 0, itemsAffected: [] }
    }

    switch (discount.applicable) {
      case 'all':
        if (discount.type === 'percentage') {
          amount = currentSubtotal * (discount.value / 100)
        } else if (discount.type === 'fixed_amount') {
          amount = Math.min(discount.value, currentSubtotal)
        }
        itemsAffected = items.map(item => item.id)
        break

      case 'category':
        const categoryItems = items.filter(item => 
          discount.applicableIds?.includes(item.categoryId || '')
        )
        const categorySubtotal = categoryItems.reduce((sum, item) => 
          sum + (item.price * item.quantity), 0
        )
        
        if (discount.type === 'percentage') {
          amount = categorySubtotal * (discount.value / 100)
        } else if (discount.type === 'fixed_amount') {
          amount = Math.min(discount.value, categorySubtotal)
        } else if (discount.type === 'bogo') {
          // BOGO logic: Buy X Get Y Free (e.g., Buy 2 Get 1 Free)
          categoryItems.forEach(item => {
            const buyQuantity = 2 // items to buy
            const freeQuantity = discount.value // items to get free
            const groupSize = buyQuantity + freeQuantity
            
            if (item.quantity >= buyQuantity) {
              const completeGroups = Math.floor(item.quantity / groupSize)
              const remainingItems = item.quantity % groupSize
              
              // Free items from complete groups
              let totalFreeItems = completeGroups * freeQuantity
              
              // Check if remaining items qualify for partial free items
              if (remainingItems >= buyQuantity) {
                totalFreeItems += Math.min(freeQuantity, remainingItems - buyQuantity)
              }
              
              amount += item.price * totalFreeItems
            }
          })
        }
        itemsAffected = categoryItems.map(item => item.id)
        break

      case 'product':
        const productItems = items.filter(item => 
          discount.applicableIds?.includes(item.id)
        )
        const productSubtotal = productItems.reduce((sum, item) => 
          sum + (item.price * item.quantity), 0
        )
        
        if (discount.type === 'percentage') {
          amount = productSubtotal * (discount.value / 100)
        } else if (discount.type === 'fixed_amount') {
          amount = Math.min(discount.value, productSubtotal)
        }
        itemsAffected = productItems.map(item => item.id)
        break
    }

    if (discount.maxDiscount) {
      amount = Math.min(amount, discount.maxDiscount)
    }

    return { amount, itemsAffected }
  }

  const applyCoupon = () => {
    const coupon = coupons.find(c => c.code.toLowerCase() === couponCode.toLowerCase() && c.active)
    if (!coupon) {
      alert('Invalid coupon code')
      return
    }

    if (coupon.expiryDate && new Date() > coupon.expiryDate) {
      alert('Coupon has expired')
      return
    }

    const discountResult = calculateDiscount(coupon.discount, cartItems, subtotal)
    if (discountResult.amount > 0) {
      const newPromotion: AppliedPromotion = {
        id: coupon.id,
        type: 'coupon',
        name: coupon.name,
        discountAmount: discountResult.amount,
        itemsAffected: discountResult.itemsAffected
      }

      // Remove existing coupon promotions and add new one
      const updatedPromotions = [...appliedPromotions.filter(p => p.type !== 'coupon' && !p.name.includes('Gift Card')), newPromotion]
      setAppliedPromotions(updatedPromotions)
      
      const totalDiscount = updatedPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
      const newSubtotal = Math.max(0, subtotal - totalDiscount)
      onPromotionsApplied(updatedPromotions, newSubtotal)
      setCouponCode('')
    }
  }

  const lookupLoyalty = () => {
    const account = loyaltyAccounts.find(acc => acc.customerPhone === loyaltyPhone)
    if (account) {
      setSelectedLoyalty(account)
    } else {
      alert('Loyalty account not found')
    }
  }

  const applyGiftCard = () => {
    const giftCard = giftCards.find(gc => gc.cardNumber === giftCardNumber && gc.active)
    if (!giftCard) {
      alert('Invalid gift card number')
      return
    }

    if (giftCard.expiryDate && new Date() > giftCard.expiryDate) {
      alert('Gift card has expired')
      return
    }

    if (giftCard.balance <= 0) {
      alert('Gift card has no remaining balance')
      return
    }

    // Apply full balance or remaining cart total, whichever is smaller
    const maxRedeemable = Math.min(giftCard.balance, subtotal)
    const discountAmount = maxRedeemable

    const newPromotion: AppliedPromotion = {
      id: giftCard.id,
      type: 'coupon', // Use coupon type for gift cards in promotions
      name: `Gift Card (${giftCard.cardNumber.slice(-4)})`,
      discountAmount
    }

    // Remove existing gift card promotions and add new one
    const updatedPromotions = [...appliedPromotions.filter(p => !p.name.includes('Gift Card')), newPromotion]
    setAppliedPromotions(updatedPromotions)
    
    const newSubtotal = subtotal - updatedPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
    onPromotionsApplied(updatedPromotions, Math.max(0, newSubtotal))

    // Update gift card balance
    setGiftCards(prev => prev.map(gc => 
      gc.id === giftCard.id 
        ? { ...gc, balance: gc.balance - discountAmount, lastUsed: new Date() }
        : gc
    ))
    
    setGiftCardNumber('')
  }

  const redeemLoyaltyPoints = (pointsToRedeem: number) => {
    if (!selectedLoyalty || selectedLoyalty.points < pointsToRedeem) {
      alert('Insufficient loyalty points')
      return
    }

    const discountAmount = pointsToRedeem * 0.01 // 1 point = $0.01
    const newPromotion: AppliedPromotion = {
      id: `loyalty_${Date.now()}`,
      type: 'loyalty',
      name: `${pointsToRedeem} Loyalty Points`,
      discountAmount
    }

    // Remove existing loyalty promotions and add new one
    const updatedPromotions = [...appliedPromotions.filter(p => p.type !== 'loyalty'), newPromotion]
    setAppliedPromotions(updatedPromotions)
    
    const newSubtotal = subtotal - updatedPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
    onPromotionsApplied(updatedPromotions, Math.max(0, newSubtotal))

    // Update loyalty account
    setSelectedLoyalty({
      ...selectedLoyalty,
      points: selectedLoyalty.points - pointsToRedeem
    })
  }

  const calculateLoyaltyEarning = (finalTotal: number) => {
    // Earn 1 point per dollar spent
    return Math.floor(finalTotal)
  }

  const getTierMultiplier = (tier: string) => {
    switch (tier) {
      case 'silver': return 1.25
      case 'gold': return 1.5
      case 'platinum': return 2.0
      default: return 1.0
    }
  }

  const addManualDiscount = () => {
    if (!newDiscount.name || !newDiscount.value) {
      alert('Please fill in discount name and value')
      return
    }

    const discount: Discount = {
      id: `manual_${Date.now()}`,
      name: newDiscount.name!,
      type: newDiscount.type!,
      value: newDiscount.value!,
      applicable: newDiscount.applicable!,
      applicableIds: newDiscount.applicableIds,
      active: true,
      usageCount: 0,
      isAutomatic: false,
      minPurchase: newDiscount.minPurchase,
      maxDiscount: newDiscount.maxDiscount
    }

    const discountResult = calculateDiscount(discount, cartItems, subtotal)
    if (discountResult.amount > 0) {
      const newPromotion: AppliedPromotion = {
        id: discount.id,
        type: 'discount',
        name: discount.name,
        discountAmount: discountResult.amount,
        itemsAffected: discountResult.itemsAffected
      }

      const updatedPromotions = [...appliedPromotions, newPromotion]
      setAppliedPromotions(updatedPromotions)
      
      const newSubtotal = subtotal - updatedPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
      onPromotionsApplied(updatedPromotions, newSubtotal)
    }

    setNewDiscount({
      type: 'percentage',
      applicable: 'all',
      active: true,
      isAutomatic: false,
      usageCount: 0
    })
    setShowNewDiscount(false)
  }

  const removePromotion = (promotionId: string) => {
    const updatedPromotions = appliedPromotions.filter(p => p.id !== promotionId)
    setAppliedPromotions(updatedPromotions)
    
    const newSubtotal = subtotal - updatedPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
    onPromotionsApplied(updatedPromotions, newSubtotal)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Promotions & Discounts</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-4 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'discounts', label: 'Discounts', icon: Percent },
              { id: 'coupons', label: 'Coupons & Cards', icon: Tag },
              { id: 'loyalty', label: 'Loyalty', icon: Star }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Applied Promotions Summary */}
          {appliedPromotions.length > 0 && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">Applied Promotions</h3>
              <div className="space-y-2">
                {appliedPromotions.map(promotion => (
                  <div key={promotion.id} className="flex justify-between items-center">
                    <span className="text-sm text-green-700">{promotion.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-green-800">
                        -${promotion.discountAmount.toFixed(2)}
                      </span>
                      <button
                        onClick={() => removePromotion(promotion.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-green-200 pt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span>Total Savings:</span>
                    <span className="text-green-800">
                      -${appliedPromotions.reduce((sum, p) => sum + p.discountAmount, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'discounts' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Available Discounts</h3>
                <button
                  onClick={() => setShowNewDiscount(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Manual Discount</span>
                </button>
              </div>

              {/* Automatic Discounts */}
              <div className="grid grid-cols-1 gap-4">
                {activeDiscounts.filter(d => d.isAutomatic).map(discount => (
                  <div key={discount.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{discount.name}</h4>
                        <p className="text-sm text-gray-600">
                          {discount.type === 'percentage' ? `${discount.value}% off` :
                           discount.type === 'fixed_amount' ? `$${discount.value} off` :
                           'Buy 2 Get 1 Free'}
                          {discount.applicable !== 'all' && ` on ${discount.applicableIds?.join(', ')}`}
                          {discount.minPurchase && ` (min. $${discount.minPurchase})`}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        discount.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {discount.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Manual Discount Form */}
              {showNewDiscount && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-medium mb-4">Add Manual Discount</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Discount Name"
                      value={newDiscount.name || ''}
                      onChange={(e) => setNewDiscount(prev => ({ ...prev, name: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={newDiscount.type}
                      onChange={(e) => setNewDiscount(prev => ({ ...prev, type: e.target.value as any }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed_amount">Fixed Amount</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Value"
                      value={newDiscount.value || ''}
                      onChange={(e) => setNewDiscount(prev => ({ ...prev, value: parseFloat(e.target.value) }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={newDiscount.applicable}
                      onChange={(e) => setNewDiscount(prev => ({ ...prev, applicable: e.target.value as any }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Items</option>
                      <option value="category">Category</option>
                      <option value="product">Specific Product</option>
                    </select>
                  </div>
                  <div className="flex space-x-2 mt-4">
                    <button
                      onClick={addManualDiscount}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Apply Discount
                    </button>
                    <button
                      onClick={() => setShowNewDiscount(false)}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'coupons' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Coupons & Gift Cards</h3>
              
              {/* Coupon Application */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-3">Apply Coupon Code</h4>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={applyCoupon}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Gift Card Application */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-3">Apply Gift Card</h4>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Enter gift card number"
                    value={giftCardNumber}
                    onChange={(e) => setGiftCardNumber(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={applyGiftCard}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Available Coupons */}
              <div>
                <h4 className="font-medium mb-3">Available Coupons</h4>
                <div className="grid grid-cols-1 gap-3">
                  {coupons.filter(c => c.active).map(coupon => (
                    <div key={coupon.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-900">{coupon.code}</div>
                          <div className="text-sm text-gray-600">{coupon.name}</div>
                        </div>
                        <button
                          onClick={() => setCouponCode(coupon.code)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          Use Code
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Available Gift Cards */}
              <div>
                <h4 className="font-medium mb-3">Available Gift Cards</h4>
                <div className="grid grid-cols-1 gap-3">
                  {giftCards.filter(gc => gc.active && gc.balance > 0).map(giftCard => (
                    <div key={giftCard.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-900">****{giftCard.cardNumber.slice(-4)}</div>
                          <div className="text-sm text-gray-600">Balance: ${giftCard.balance.toFixed(2)}</div>
                        </div>
                        <button
                          onClick={() => setGiftCardNumber(giftCard.cardNumber)}
                          className="text-green-600 hover:text-green-700 text-sm font-medium"
                        >
                          Use Card
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Loyalty Points System</h3>
              
              {/* Loyalty Lookup */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-3">Customer Lookup</h4>
                <div className="flex space-x-2">
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={loyaltyPhone}
                    onChange={(e) => setLoyaltyPhone(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={lookupLoyalty}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Lookup
                  </button>
                </div>
              </div>

              {/* Selected Loyalty Account */}
              {selectedLoyalty && (
                <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-medium text-gray-900">{selectedLoyalty.customerName}</h4>
                      <p className="text-sm text-gray-600">{selectedLoyalty.customerPhone}</p>
                      <p className="text-sm text-gray-600">
                        Member since {selectedLoyalty.joinDate.toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedLoyalty.tier === 'platinum' ? 'bg-purple-100 text-purple-800' :
                      selectedLoyalty.tier === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                      selectedLoyalty.tier === 'silver' ? 'bg-gray-100 text-gray-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {selectedLoyalty.tier.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{selectedLoyalty.points}</div>
                      <div className="text-sm text-gray-600">Available Points</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">${selectedLoyalty.totalSpent.toFixed(2)}</div>
                      <div className="text-sm text-gray-600">Total Spent</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{getTierMultiplier(selectedLoyalty.tier)}x</div>
                      <div className="text-sm text-gray-600">Points Multiplier</div>
                    </div>
                  </div>

                  {/* Points Redemption */}
                  <div className="space-y-2">
                    <h5 className="font-medium">Redeem Points (100 points = $1.00)</h5>
                    <div className="flex space-x-2">
                      {[100, 250, 500].map(points => (
                        <button
                          key={points}
                          onClick={() => redeemLoyaltyPoints(points)}
                          disabled={selectedLoyalty.points < points}
                          className={`px-4 py-2 rounded-lg font-medium ${
                            selectedLoyalty.points >= points
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {points} pts = ${(points * 0.01).toFixed(2)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Points to be Earned */}
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="flex justify-between text-sm">
                      <span>Points to be earned from this purchase:</span>
                      <span className="font-medium">
                        {Math.floor(subtotal * getTierMultiplier(selectedLoyalty.tier))} points
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}