'use server'

import { redis } from '@/lib/redis'
import { DiscountPromotionServerService } from '../DiscountPromotion/src/server'
import { GiftCardCouponServerService } from '../GiftCardCoupon/src/server'
import { AtomicOperations } from './atomic-operations'

export interface CartItem {
  productId: string
  name: string
  price: number
  quantity: number
  total: number
  category?: string
}

export interface OrderTotals {
  subtotal: number
  tax: number
  discount: number
  total: number
  appliedDiscounts: any[]
  giftCardCredits: number
  finalTotal: number
}

export interface TotalsCalculationRequest {
  tenantId: string
  items: CartItem[]
  customerId?: string
  discountCodes?: string[]
  giftCardCodes?: string[]
  idempotencyKey: string
}

export class TotalsCalculationService {
  private static readonly VAT_RATE = 0.075 // 7.5% Nigerian VAT

  /**
   * Calculate comprehensive order totals with atomic operations
   * This is the single authoritative source of truth for all pricing calculations
   */
  static async calculateOrderTotals(request: TotalsCalculationRequest): Promise<OrderTotals> {
    const { tenantId, items, customerId, discountCodes = [], giftCardCodes = [], idempotencyKey } = request

    // Check for existing calculation with same idempotency key
    const existingResult = await AtomicOperations.getIdempotentResult<OrderTotals>(idempotencyKey)
    if (existingResult) {
      return existingResult
    }

    const lockKey = `totals:${tenantId}:${idempotencyKey}`
    
    return await AtomicOperations.withLock(lockKey, async () => {
      // Calculate subtotal using integer arithmetic (kobo)
      const subtotalKobo = items.reduce((sum, item) => {
        return sum + AtomicOperations.toKobo(item.total)
      }, 0)

      // Calculate tax in kobo
      const taxKobo = Math.round(subtotalKobo * this.VAT_RATE)

      // Apply discounts atomically
      const discountService = new DiscountPromotionServerService(tenantId)
      const appliedDiscounts = await discountService.calculateDiscounts(
        items,
        customerId ? { id: customerId } : undefined,
        discountCodes[0] // Primary coupon code
      )

      const discountKobo = appliedDiscounts.reduce((sum: number, discount: any) => {
        return sum + AtomicOperations.toKobo(discount.amount)
      }, 0)

      // Apply gift card credits
      let giftCardCreditsKobo = 0
      const giftCardService = new GiftCardCouponServerService(tenantId)
      
      for (const giftCardCode of giftCardCodes) {
        const giftCard = await giftCardService.getGiftCardByCode(giftCardCode)
        if (giftCard && giftCard.status === 'active') {
          giftCardCreditsKobo += AtomicOperations.toKobo(giftCard.currentBalance)
        }
      }

      // Calculate final totals
      const totalBeforeCreditsKobo = subtotalKobo + taxKobo - discountKobo
      const finalTotalKobo = Math.max(0, totalBeforeCreditsKobo - giftCardCreditsKobo)

      const result: OrderTotals = {
        subtotal: AtomicOperations.fromKobo(subtotalKobo),
        tax: AtomicOperations.fromKobo(taxKobo),
        discount: AtomicOperations.fromKobo(discountKobo),
        total: AtomicOperations.fromKobo(totalBeforeCreditsKobo),
        appliedDiscounts,
        giftCardCredits: AtomicOperations.fromKobo(giftCardCreditsKobo),
        finalTotal: AtomicOperations.fromKobo(finalTotalKobo)
      }

      // Store result with idempotency key for 1 hour
      await AtomicOperations.storeIdempotentResult(idempotencyKey, result, 3600)

      return result
    }) as OrderTotals
  }

  /**
   * Atomically apply and commit discounts/coupons during transaction completion
   * This ensures usage counts are incremented and limits are enforced
   */
  static async commitDiscountsAndCoupons(
    tenantId: string,
    appliedDiscounts: any[],
    giftCardCodes: string[],
    giftCardAmounts: { [code: string]: number },
    transactionId: string
  ): Promise<void> {
    const discountService = new DiscountPromotionServerService(tenantId)
    const giftCardService = new GiftCardCouponServerService(tenantId)

    // Atomically increment discount usage counts
    for (const discount of appliedDiscounts) {
      const lockKey = `discount_usage:${tenantId}:${discount.discountId}`
      
      await AtomicOperations.withLock(lockKey, async () => {
        // This will be implemented in the discount service with atomic operations
        await discountService.incrementDiscountUsage(discount.discountId)
      })
    }

    // Atomically redeem gift cards
    for (const giftCardCode of giftCardCodes) {
      const amount = giftCardAmounts[giftCardCode] || 0
      if (amount > 0) {
        await giftCardService.redeemGiftCard(giftCardCode, amount, transactionId)
      }
    }
  }

  /**
   * Validate that calculated totals match expected amounts
   * Used as a safety check before processing payments
   */
  static validateTotals(
    calculatedTotals: OrderTotals,
    expectedTotal: number,
    tolerance: number = 0.01
  ): { valid: boolean; error?: string } {
    const difference = Math.abs(calculatedTotals.finalTotal - expectedTotal)
    
    if (difference > tolerance) {
      return {
        valid: false,
        error: `Total mismatch: calculated ₦${calculatedTotals.finalTotal.toFixed(2)}, expected ₦${expectedTotal.toFixed(2)}`
      }
    }

    return { valid: true }
  }
}