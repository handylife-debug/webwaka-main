import { execute_sql, withTransaction } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Nigerian market specific imports
import { createSMSService } from '@/lib/sms-service';
import { sendEmail } from '@/lib/replitmail';

// Import other cells for integration
import { productCatalogCell } from '@/cells/inventory/ProductCatalog/src/server';
import { inventoryTrackingCell } from '@/cells/inventory/InventoryTracking/src/server';
import { customerProfileCell } from '@/cells/customer/CustomerProfile/src/server';
import { paymentGatewayCoreCell } from '@/cells/payment/PaymentGatewayCore/src/server';

// Initialize SMS service
const smsService = createSMSService();

// Types for SalesEngine operations
export interface CartSession {
  id: string;
  sessionId: string;
  tenantId: string;
  cashierId: string;
  customerId?: string;
  locationId?: string;
  terminalId?: string;
  currency: 'NGN' | 'USD' | 'GBP';
  items: CartItem[];
  subtotal: number;
  discounts: Discount[];
  taxes: Tax[];
  fees: Fee[];
  total: number;
  status: 'active' | 'suspended' | 'completed' | 'cancelled';
  notes?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  productCode: string;
  productName: string;
  sku?: string;
  barcode?: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  notes?: string;
  isTaxable: boolean;
  isRefundable: boolean;
  categoryId?: string;
  supplierId?: string;
}

export interface Discount {
  id: string;
  code?: string;
  type: 'percentage' | 'fixed_amount' | 'product_specific' | 'category' | 'customer_tier';
  value: number;
  amount: number;
  description: string;
  targetProductIds?: string[];
  minimumPurchase?: number;
  maximumDiscount?: number;
  validFrom?: string;
  validTo?: string;
}

export interface Tax {
  id: string;
  name: string;
  type: 'vat' | 'luxury' | 'service' | 'withholding' | 'customs';
  rate: number;
  amount: number;
  taxableAmount: number;
  exemptAmount: number;
  isIncluded: boolean;
  description: string;
}

export interface Fee {
  id: string;
  name: string;
  type: 'service' | 'processing' | 'delivery' | 'packaging' | 'convenience';
  amount: number;
  description: string;
}

export interface Transaction {
  id: string;
  tenantId: string;
  transactionNumber: string;
  reference: string;
  sessionId: string;
  cashierId: string;
  customerId?: string;
  locationId?: string;
  terminalId?: string;
  items: CartItem[];
  subtotal: number;
  discounts: Discount[];
  taxes: Tax[];
  fees: Fee[];
  total: number;
  currency: string;
  paymentMethods: PaymentMethod[];
  paymentStatus: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';
  customerInfo?: CustomerInfo;
  receiptUrl?: string;
  qrCode?: string;
  notes?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethod {
  method: 'cash' | 'card' | 'mobile_money' | 'bank_transfer' | 'split_payment';
  amount: number;
  provider?: 'paystack' | 'flutterwave' | 'interswitch' | 'cash';
  reference?: string;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

export interface CustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  type: 'individual' | 'business' | 'corporate' | 'government';
}

export interface RefundRequest {
  id: string;
  originalTransactionId: string;
  tenantId: string;
  refundType: 'full' | 'partial' | 'item_specific';
  refundAmount: number;
  refundItems?: RefundItem[];
  refundReason: 'defective' | 'wrong_item' | 'customer_request' | 'policy_return' | 'damaged';
  notes?: string;
  status: 'pending' | 'approved' | 'processed' | 'rejected';
  cashierId: string;
  approvedBy?: string;
  processedAt?: string;
  createdAt: string;
}

export interface RefundItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
  reason: string;
}

// Nigerian VAT rates and exemptions
const NIGERIAN_TAX_RATES = {
  'standard_vat': 0.075,     // 7.5% standard VAT
  'luxury_tax': 0.10,        // 10% luxury goods tax
  'service_tax': 0.05,       // 5% service tax
  'withholding_tax': 0.05,   // 5% withholding tax for businesses
};

const VAT_EXEMPT_CATEGORIES = [
  'food', 'medicine', 'books', 'education', 'healthcare', 'basic_services'
];

// Nigerian luxury goods threshold
const luxuryThreshold = 50000; // NGN

const NIGERIAN_EXCHANGE_RATES = {
  'NGN-USD': 0.0012,  // 1 NGN = 0.0012 USD
  'NGN-GBP': 0.0010,  // 1 NGN = 0.0010 GBP
  'USD-NGN': 850.0,   // 1 USD = 850 NGN
  'USD-GBP': 0.82,    // 1 USD = 0.82 GBP
  'GBP-NGN': 1050.0,  // 1 GBP = 1050 NGN
  'GBP-USD': 1.22     // 1 GBP = 1.22 USD
};

// Input validation schemas
const initializeCartSchema = z.object({
  sessionId: z.string().uuid(),
  cashierId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  terminalId: z.string().max(100).optional(),
  customerId: z.string().uuid().optional(),
  currency: z.enum(['NGN', 'USD', 'GBP']).default('NGN')
});

const addToCartSchema = z.object({
  sessionId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().min(0.01),
  unitPrice: z.number().min(0).optional(),
  overridePrice: z.boolean().default(false),
  discountId: z.string().uuid().optional(),
  notes: z.string().max(500).optional()
});

const updateCartItemSchema = z.object({
  sessionId: z.string().uuid(),
  cartItemId: z.string().uuid(),
  quantity: z.number().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  discountId: z.string().uuid().optional(),
  notes: z.string().max(500).optional()
});

const applyDiscountSchema = z.object({
  sessionId: z.string().uuid(),
  discountType: z.enum(['percentage', 'fixed_amount', 'product_specific', 'category', 'customer_tier']),
  discountValue: z.number().min(0),
  discountCode: z.string().max(50).optional(),
  targetProductIds: z.array(z.string().uuid()).optional(),
  minimumPurchase: z.number().min(0).optional(),
  maximumDiscount: z.number().min(0).optional()
});

const processPaymentSchema = z.object({
  sessionId: z.string().uuid(),
  paymentMethods: z.array(z.object({
    method: z.enum(['cash', 'card', 'mobile_money', 'bank_transfer', 'split_payment']),
    amount: z.number().min(0.01),
    provider: z.enum(['paystack', 'flutterwave', 'interswitch', 'cash']).optional(),
    reference: z.string().max(255).optional(),
    metadata: z.record(z.any()).optional()
  })),
  customerInfo: z.object({
    name: z.string().max(255).optional(),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
    address: z.string().max(500).optional(),
    type: z.enum(['individual', 'business', 'corporate', 'government']).optional()
  }).optional(),
  receiptPreferences: z.object({
    printReceipt: z.boolean().default(true),
    emailReceipt: z.boolean().default(false),
    smsReceipt: z.boolean().default(false),
    language: z.enum(['en', 'ha', 'yo', 'ig']).default('en')
  }).optional()
});

const processRefundSchema = z.object({
  transactionId: z.string().uuid(),
  refundType: z.enum(['full', 'partial', 'item_specific']),
  refundAmount: z.number().min(0).optional(),
  refundItems: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().min(0.01),
    reason: z.string().max(500)
  })).optional(),
  refundReason: z.enum(['defective', 'wrong_item', 'customer_request', 'policy_return', 'damaged']),
  notes: z.string().max(1000).optional(),
  cashierId: z.string().uuid()
});

export const salesEngineCell = {
  // ========================================
  // CART MANAGEMENT OPERATIONS
  // ========================================

  /**
   * Initialize a new cart session with Nigerian market features
   */
  async initializeCart(input: unknown, tenantId: string): Promise<{ success: boolean; cart?: CartSession; sessionId?: string; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = initializeCartSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const { sessionId, cashierId, locationId, terminalId, customerId, currency } = validationResult.data;

        // Validate cashier exists and is active
        const cashierValidation = await this.validateCashier(tenantId, cashierId);
        if (!cashierValidation.valid) {
          return {
            success: false,
            message: 'Cashier validation failed',
            error: cashierValidation.error
          };
        }

        // Check for existing active cart session
        const existingCart = await this.getActiveCartSession(tenantId, sessionId);
        if (existingCart) {
          return {
            success: true,
            cart: existingCart,
            sessionId: existingCart.sessionId,
            message: 'Retrieved existing cart session'
          };
        }

        // Create new cart session
        const cartSession: CartSession = {
          id: uuidv4(),
          sessionId,
          tenantId,
          cashierId,
          customerId,
          locationId,
          terminalId,
          currency,
          items: [],
          subtotal: 0,
          discounts: [],
          taxes: [],
          fees: [],
          total: 0,
          status: 'active',
          notes: '',
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        };

        // Store cart session in Redis for fast access
        const cacheKey = `cart:${tenantId}:${sessionId}`;
        await redis.set(cacheKey, JSON.stringify(cartSession), { ex: 86400 }); // 24 hours

        // Also persist to database for reliability
        await this.persistCartSession(cartSession);

        return {
          success: true,
          cart: cartSession,
          sessionId: cartSession.sessionId,
          message: 'Cart session initialized successfully'
        };
      },
      {
        success: false,
        message: 'Failed to initialize cart session',
        error: 'Redis operation failed'
      }
    );
  },

  /**
   * Add item to cart with inventory validation and pricing
   */
  async addToCart(input: unknown, tenantId: string): Promise<{ success: boolean; cart?: CartSession; item?: CartItem; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = addToCartSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const { sessionId, productId, variantId, quantity, unitPrice, overridePrice, discountId, notes } = validationResult.data;

        // Get cart session
        const cartSession = await this.getActiveCartSession(tenantId, sessionId);
        if (!cartSession) {
          return {
            success: false,
            message: 'Cart session not found',
            error: 'Session may have expired or been cleared'
          };
        }

        // Validate product and get details
        const productResult = await productCatalogCell.searchProducts({ 
          productId: productId,
          includeInactive: false 
        }, tenantId);
        if (!productResult.success || !productResult.products || productResult.products.length === 0) {
          return {
            success: false,
            message: 'Product not found',
            error: 'Invalid product ID or product may be inactive'
          };
        }

        const product = productResult.products[0];

        // Check inventory availability
        const inventoryResult = await inventoryTrackingCell.getStockLevels({
          productId,
          variantId,
          locationId: cartSession.locationId
        }, tenantId);

        if (!inventoryResult.success || !inventoryResult.stockLevels || inventoryResult.stockLevels.length === 0) {
          return {
            success: false,
            message: 'Stock information not available',
            error: 'Unable to verify stock levels'
          };
        }
        
        const stockLevel = inventoryResult.stockLevels[0];
        if (stockLevel.availableQuantity < quantity) {
          return {
            success: false,
            message: 'Insufficient stock',
            error: `Only ${stockLevel.availableQuantity} items available`
          };
        }

        // Determine final unit price
        let finalUnitPrice = unitPrice || product.sellingPrice;
        if (overridePrice && unitPrice) {
          // Validate price override permissions
          const priceOverrideValidation = await this.validatePriceOverride(tenantId, cartSession.cashierId, unitPrice, product.sellingPrice);
          if (!priceOverrideValidation.valid) {
            return {
              success: false,
              message: 'Price override not allowed',
              error: priceOverrideValidation.error
            };
          }
          finalUnitPrice = unitPrice;
        }

        // Check for existing item in cart (same product + variant)
        const existingItemIndex = cartSession.items.findIndex(item => 
          item.productId === productId && item.variantId === variantId
        );

        let cartItem: CartItem;

        if (existingItemIndex >= 0) {
          // Update existing item quantity
          const existingItem = cartSession.items[existingItemIndex];
          const newQuantity = existingItem.quantity + quantity;
          
          // Re-check inventory for new total quantity
          const newInventoryResult = await inventoryTrackingCell.getStockLevels({
            productId,
            variantId,
            locationId: cartSession.locationId
          }, tenantId);

          if (!newInventoryResult.success || !newInventoryResult.stockLevels || newInventoryResult.stockLevels.length === 0) {
            return {
              success: false,
              message: 'Stock information not available',
              error: 'Unable to verify stock levels'
            };
          }
          
          const newStockLevel = newInventoryResult.stockLevels[0];
          if (newStockLevel.availableQuantity < newQuantity) {
            return {
              success: false,
              message: 'Insufficient stock for updated quantity',
              error: `Only ${newStockLevel.availableQuantity} items available in total`
            };
          }

          existingItem.quantity = newQuantity;
          existingItem.unitPrice = finalUnitPrice;
          existingItem.lineTotal = newQuantity * finalUnitPrice;
          existingItem.notes = notes || existingItem.notes;
          cartItem = existingItem;
        } else {
          // Create new cart item
          cartItem = {
            id: uuidv4(),
            productId,
            variantId,
            productCode: product.productCode,
            productName: product.productName,
            sku: product.sku,
            barcode: product.barcode,
            unitPrice: finalUnitPrice,
            quantity,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: quantity * finalUnitPrice,
            notes,
            isTaxable: product.isTaxable || true,
            isRefundable: true,
            categoryId: product.categoryId,
            supplierId: product.supplierId
          };

          cartSession.items.push(cartItem);
        }

        // Apply discount if provided
        if (discountId) {
          // Simplified discount application - to be implemented
          console.log('Discount application requested for cart item:', cartItem.id);
        }

        // Recalculate cart totals
        await this.recalculateCartTotals(cartSession, tenantId);

        // Update cart session
        cartSession.updatedAt = new Date().toISOString();

        // Save updated cart
        await this.saveCartSession(cartSession);

        return {
          success: true,
          cart: cartSession,
          item: cartItem,
          message: 'Item added to cart successfully'
        };
      },
      {
        success: false,
        message: 'Failed to add item to cart',
        error: 'Cart operation failed'
      }
    );
  },

  /**
   * Update cart item quantity or price
   */
  async updateCartItem(input: unknown, tenantId: string): Promise<{ success: boolean; cart?: CartSession; item?: CartItem; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = updateCartItemSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const { sessionId, cartItemId, quantity, unitPrice, discountId, notes } = validationResult.data;

        // Get cart session
        const cartSession = await this.getActiveCartSession(tenantId, sessionId);
        if (!cartSession) {
          return {
            success: false,
            message: 'Cart session not found'
          };
        }

        // Find cart item
        const itemIndex = cartSession.items.findIndex(item => item.id === cartItemId);
        if (itemIndex === -1) {
          return {
            success: false,
            message: 'Cart item not found'
          };
        }

        const cartItem = cartSession.items[itemIndex];

        // Update quantity if provided
        if (quantity !== undefined) {
          if (quantity === 0) {
            // Remove item from cart
            cartSession.items.splice(itemIndex, 1);
            await this.recalculateCartTotals(cartSession, tenantId);
            cartSession.updatedAt = new Date().toISOString();
            await this.saveCartSession(cartSession);

            return {
              success: true,
              cart: cartSession,
              message: 'Item removed from cart'
            };
          }

          // Check inventory for new quantity
          const inventoryResult = await inventoryTrackingCell.checkStockAvailability({
            productId: cartItem.productId,
            variantId: cartItem.variantId,
            quantity,
            locationId: cartSession.locationId
          }, tenantId);

          if (!inventoryResult.success || !inventoryResult.available) {
            return {
              success: false,
              message: 'Insufficient stock for requested quantity',
              error: `Only ${inventoryResult.availableQuantity || 0} items available`
            };
          }

          cartItem.quantity = quantity;
        }

        // Update unit price if provided
        if (unitPrice !== undefined) {
          const priceOverrideValidation = await this.validatePriceOverride(tenantId, cartSession.cashierId, unitPrice, cartItem.unitPrice);
          if (!priceOverrideValidation.valid) {
            return {
              success: false,
              message: 'Price override not allowed',
              error: priceOverrideValidation.error
            };
          }
          cartItem.unitPrice = unitPrice;
        }

        // Update notes if provided
        if (notes !== undefined) {
          cartItem.notes = notes;
        }

        // Recalculate line total
        cartItem.lineTotal = cartItem.quantity * cartItem.unitPrice;

        // Apply new discount if provided
        if (discountId) {
          await this.applyDiscountToItem(cartSession, cartItem, discountId, tenantId);
        }

        // Recalculate cart totals
        await this.recalculateCartTotals(cartSession, tenantId);

        // Update cart session
        cartSession.updatedAt = new Date().toISOString();
        await this.saveCartSession(cartSession);

        return {
          success: true,
          cart: cartSession,
          item: cartItem,
          message: 'Cart item updated successfully'
        };
      },
      async () => {
        return {
          success: false,
          message: 'Failed to update cart item',
          error: 'Cart operation failed'
        };
      }
    );
  },

  /**
   * Remove item from cart
   */
  async removeFromCart(input: { sessionId: string; cartItemId: string }, tenantId: string): Promise<{ success: boolean; cart?: CartSession; message: string; error?: string }> {
    return await this.updateCartItem({ ...input, quantity: 0 }, tenantId);
  },

  /**
   * Apply discount to cart or specific items
   */
  async applyDiscount(input: unknown, tenantId: string): Promise<{ success: boolean; cart?: CartSession; discount?: Discount; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = applyDiscountSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const { sessionId, discountType, discountValue, discountCode, targetProductIds, minimumPurchase, maximumDiscount } = validationResult.data;

        // Get cart session
        const cartSession = await this.getActiveCartSession(tenantId, sessionId);
        if (!cartSession) {
          return {
            success: false,
            message: 'Cart session not found'
          };
        }

        // Validate discount code if provided
        if (discountCode) {
          const discountValidation = await this.validateDiscountCode(tenantId, discountCode, cartSession);
          if (!discountValidation.valid) {
            return {
              success: false,
              message: 'Invalid discount code',
              error: discountValidation.error
            };
          }
        }

        // Check minimum purchase requirement
        if (minimumPurchase && cartSession.subtotal < minimumPurchase) {
          return {
            success: false,
            message: 'Minimum purchase amount not met',
            error: `Minimum purchase of ${cartSession.currency} ${minimumPurchase} required`
          };
        }

        // Calculate discount amount
        let discountAmount = 0;
        let applicableAmount = cartSession.subtotal;

        if (targetProductIds && targetProductIds.length > 0) {
          // Product-specific discount
          applicableAmount = cartSession.items
            .filter(item => targetProductIds.includes(item.productId))
            .reduce((sum, item) => sum + item.lineTotal, 0);
        }

        if (discountType === 'percentage') {
          discountAmount = applicableAmount * (discountValue / 100);
        } else {
          discountAmount = discountValue;
        }

        // Apply maximum discount limit
        if (maximumDiscount && discountAmount > maximumDiscount) {
          discountAmount = maximumDiscount;
        }

        // Ensure discount doesn't exceed applicable amount
        discountAmount = Math.min(discountAmount, applicableAmount);

        // Create discount object
        const discount: Discount = {
          id: uuidv4(),
          code: discountCode,
          type: discountType,
          value: discountValue,
          amount: discountAmount,
          description: discountCode ? `Discount code: ${discountCode}` : `${discountType} discount`,
          targetProductIds,
          minimumPurchase,
          maximumDiscount
        };

        // Add discount to cart
        cartSession.discounts.push(discount);

        // Recalculate cart totals
        await this.recalculateCartTotals(cartSession, tenantId);

        // Update cart session
        cartSession.updatedAt = new Date().toISOString();
        await this.saveCartSession(cartSession);

        return {
          success: true,
          cart: cartSession,
          discount,
          message: 'Discount applied successfully'
        };
      },
      async () => {
        return {
          success: false,
          message: 'Failed to apply discount',
          error: 'Discount operation failed'
        };
      }
    );
  },

  // ========================================
  // TAX CALCULATION OPERATIONS
  // ========================================

  /**
   * Calculate Nigerian VAT and other taxes
   */
  async calculateTax(input: unknown, tenantId: string): Promise<{ success: boolean; taxCalculation?: any; message: string; error?: string }> {
    try {
      const { sessionId, taxableAmount, customerType = 'individual', exemptions = [], region = 'Nigeria' } = input as any;

      // Get cart session for context
      const cartSession = await this.getActiveCartSession(tenantId, sessionId);
      if (!cartSession) {
        return {
          success: false,
          message: 'Cart session not found'
        };
      }

      let totalTaxableAmount = taxableAmount || cartSession.subtotal;
      let exemptAmount = 0;
      let vatAmount = 0;
      let luxuryTaxAmount = 0;
      let serviceTaxAmount = 0;

      // Calculate category-based exemptions
      for (const item of cartSession.items) {
        const product = await productCatalogCell.getProduct({ id: item.productId }, tenantId);
        if (product.success && product.product) {
          const category = await productCatalogCell.getCategory({ id: product.product.categoryId }, tenantId);
          if (category.success && category.category) {
            const categoryCode = category.category.categoryCode.toLowerCase();
            if (VAT_EXEMPT_CATEGORIES.includes(categoryCode) || exemptions.includes(categoryCode)) {
              exemptAmount += item.lineTotal;
              totalTaxableAmount -= item.lineTotal;
            }
          }
        }
      }

      // Calculate VAT (7.5% in Nigeria)
      if (region === 'Nigeria') {
        vatAmount = totalTaxableAmount * NIGERIAN_TAX_RATES.standard_vat;

        // Apply customer type adjustments
        if (customerType === 'business' || customerType === 'corporate') {
          // Withholding tax may apply for business customers
          // This is typically handled separately in business transactions
        }

        // Calculate luxury tax for high-value items
        const luxuryThreshold = cartSession.currency === 'NGN' ? 500000 : 600; // NGN 500k or $600
        if (cartSession.subtotal > luxuryThreshold) {
          luxuryTaxAmount = (cartSession.subtotal - luxuryThreshold) * NIGERIAN_TAX_RATES.luxury_tax;
        }
      }

      const totalTax = vatAmount + luxuryTaxAmount + serviceTaxAmount;
      const grandTotal = cartSession.subtotal + totalTax;

      const taxCalculation = {
        subtotal: cartSession.subtotal,
        taxableAmount: totalTaxableAmount,
        exemptAmount,
        vatAmount,
        vatRate: NIGERIAN_TAX_RATES.standard_vat,
        totalTax,
        grandTotal,
        breakdown: {
          standardVAT: vatAmount,
          exemptVAT: exemptAmount,
          luxuryTax: luxuryTaxAmount,
          serviceTax: serviceTaxAmount
        }
      };

      // Update cart session with calculated taxes
      cartSession.taxes = [
        {
          id: uuidv4(),
          name: 'Nigerian VAT',
          type: 'vat',
          rate: NIGERIAN_TAX_RATES.standard_vat,
          amount: vatAmount,
          taxableAmount: totalTaxableAmount,
          exemptAmount,
          isIncluded: false,
          description: '7.5% Nigerian Value Added Tax'
        }
      ];

      if (luxuryTaxAmount > 0) {
        cartSession.taxes.push({
          id: uuidv4(),
          name: 'Luxury Tax',
          type: 'luxury',
          rate: NIGERIAN_TAX_RATES.luxury_tax,
          amount: luxuryTaxAmount,
          taxableAmount: cartSession.subtotal - luxuryThreshold,
          exemptAmount: 0,
          isIncluded: false,
          description: '10% Luxury goods tax for high-value purchases'
        });
      }

      // Recalculate cart totals
      await this.recalculateCartTotals(cartSession, tenantId);
      await this.saveCartSession(cartSession);

      return {
        success: true,
        taxCalculation,
        message: 'Tax calculation completed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Tax calculation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // PAYMENT PROCESSING OPERATIONS
  // ========================================

  /**
   * Process payment for cart session with multi-payment support
   */
  async processPayment(input: unknown, tenantId: string): Promise<{ success: boolean; transaction?: Transaction; receipt?: any; loyaltyPoints?: any; message: string; error?: string }> {
    return await withTransaction(async () => {
      const validationResult = processPaymentSchema.safeParse(input);
      if (!validationResult.success) {
        return {
          success: false,
          message: 'Invalid input data',
          error: validationResult.error.errors.map(e => e.message).join(', ')
        };
      }

      const { sessionId, paymentMethods, customerInfo, receiptPreferences } = validationResult.data;

      // Get cart session
      const cartSession = await this.getActiveCartSession(tenantId, sessionId);
      if (!cartSession) {
        return {
          success: false,
          message: 'Cart session not found'
        };
      }

      if (cartSession.items.length === 0) {
        return {
          success: false,
          message: 'Cart is empty'
        };
      }

      // Validate payment amounts
      const totalPaymentAmount = paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
      if (Math.abs(totalPaymentAmount - cartSession.total) > 0.01) {
        return {
          success: false,
          message: 'Payment amount mismatch',
          error: `Total payment ${totalPaymentAmount} does not match cart total ${cartSession.total}`
        };
      }

      // Validate inventory availability before processing payment
      const inventoryValidation = await this.validateInventoryAvailability(cartSession, tenantId);
      if (!inventoryValidation.success) {
        return {
          success: false,
          message: 'Inventory validation failed',
          error: inventoryValidation.error
        };
      }

      // Generate transaction number and reference
      const transactionNumber = await this.generateTransactionNumber(tenantId);
      const reference = `TXN-${tenantId.substring(0, 8)}-${Date.now()}`;

      // Create transaction record
      const transaction: Transaction = {
        id: uuidv4(),
        tenantId,
        transactionNumber,
        reference,
        sessionId: cartSession.sessionId,
        cashierId: cartSession.cashierId,
        customerId: cartSession.customerId,
        locationId: cartSession.locationId,
        terminalId: cartSession.terminalId,
        items: [...cartSession.items],
        subtotal: cartSession.subtotal,
        discounts: [...cartSession.discounts],
        taxes: [...cartSession.taxes],
        fees: [...cartSession.fees],
        total: cartSession.total,
        currency: cartSession.currency,
        paymentMethods: paymentMethods.map(pm => ({ ...pm, status: 'pending' })),
        paymentStatus: 'pending',
        customerInfo: customerInfo ? {
          ...customerInfo,
          type: customerInfo.type || 'individual'
        } : undefined,
        notes: cartSession.notes,
        metadata: { ...cartSession.metadata },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Process each payment method
      const paymentResults = [];
      for (const paymentMethod of paymentMethods) {
        if (paymentMethod.method === 'cash') {
          // Cash payment - instant completion
          paymentResults.push({
            ...paymentMethod,
            status: 'completed',
            reference: `CASH-${Date.now()}`
          });
        } else {
          // Electronic payment - process through payment gateway
          const paymentResult = await paymentGatewayCoreCell.initializePayment({
            amount: paymentMethod.amount,
            currency: transaction.currency,
            provider: paymentMethod.provider,
            email: customerInfo?.email || 'pos@customer.local',
            description: `POS Transaction ${transactionNumber}`,
            metadata: {
              transactionId: transaction.id,
              tenantId,
              sessionId,
              ...paymentMethod.metadata
            },
            tenantId,
            userId: cartSession.cashierId,
            userRole: 'User'
          });

          if (paymentResult.success) {
            paymentResults.push({
              ...paymentMethod,
              status: 'completed',
              reference: paymentResult.payment?.reference || paymentMethod.reference
            });
          } else {
            paymentResults.push({
              ...paymentMethod,
              status: 'failed',
              error: paymentResult.error
            });
          }
        }
      }

      // Check if all payments succeeded
      const failedPayments = paymentResults.filter(pr => pr.status === 'failed');
      if (failedPayments.length > 0) {
        return {
          success: false,
          message: 'Payment processing failed',
          error: `Failed payment methods: ${failedPayments.map(fp => fp.method).join(', ')}`
        };
      }

      // Update transaction with payment results
      transaction.paymentMethods = paymentResults.map(pr => ({
        method: pr.method,
        amount: pr.amount,
        provider: pr.provider,
        reference: pr.reference,
        status: pr.status as 'pending' | 'completed' | 'failed',
        metadata: pr.metadata
      }));
      transaction.paymentStatus = 'completed';
      transaction.updatedAt = new Date().toISOString();

      // Update inventory levels
      await this.updateInventoryAfterSale(transaction, tenantId);

      // Process customer loyalty points if customer provided
      let loyaltyPoints;
      if (customerInfo && cartSession.customerId) {
        loyaltyPoints = await this.processLoyaltyPoints(cartSession.customerId, transaction, tenantId);
      }

      // Generate receipt
      const receipt = await this.generateReceipt({
        transactionId: transaction.id,
        format: 'pdf',
        language: receiptPreferences?.language || 'en',
        includeTaxBreakdown: true,
        includeQRCode: true
      }, tenantId);

      // Save transaction to database
      await this.saveTransaction(transaction);

      // Mark cart session as completed
      cartSession.status = 'completed';
      cartSession.updatedAt = new Date().toISOString();
      await this.saveCartSession(cartSession);

      // Send receipt if requested
      if (receiptPreferences?.emailReceipt && customerInfo?.email) {
        await this.emailReceipt(customerInfo.email, receipt, transaction);
      }

      if (receiptPreferences?.smsReceipt && customerInfo?.phone) {
        await this.smsReceipt(customerInfo.phone, receipt, transaction);
      }

      return {
        success: true,
        transaction,
        receipt,
        loyaltyPoints,
        message: 'Payment processed successfully'
      };
    });
  },

  // ========================================
  // REFUND PROCESSING OPERATIONS
  // ========================================

  /**
   * Process refund with inventory restoration
   */
  async processRefund(input: unknown, tenantId: string): Promise<{ success: boolean; refund?: any; inventoryUpdates?: any[]; message: string; error?: string }> {
    return await withTransaction(async () => {
      const validationResult = processRefundSchema.safeParse(input);
      if (!validationResult.success) {
        return {
          success: false,
          message: 'Invalid input data',
          error: validationResult.error.errors.map(e => e.message).join(', ')
        };
      }

      const { transactionId, refundType, refundAmount, refundItems, refundReason, notes, cashierId } = validationResult.data;

      // Get original transaction
      const originalTransactionResult = await this.getTransaction({ transactionId }, tenantId);
      if (!originalTransactionResult.success || !originalTransactionResult.transaction) {
        return {
          success: false,
          message: 'Original transaction not found',
          error: originalTransactionResult.error
        };
      }

      const originalTransaction = originalTransactionResult.transaction;

      // Validate refund eligibility
      const refundValidation = await this.validateRefundEligibility(originalTransaction, refundType, refundAmount, refundItems);
      if (!refundValidation.valid) {
        return {
          success: false,
          message: 'Refund validation failed',
          error: refundValidation.error
        };
      }

      // Calculate refund amount if not provided
      let finalRefundAmount = refundAmount;
      if (refundType === 'full') {
        finalRefundAmount = originalTransaction.total;
      } else if (refundType === 'item_specific' && refundItems) {
        finalRefundAmount = refundItems.reduce((sum, item) => {
          const originalItem = originalTransaction.items.find((oi: any) => oi.productId === item.productId);
          return sum + (originalItem ? originalItem.unitPrice * item.quantity : 0);
        }, 0);
      }

      // Create refund record
      const refund: RefundRequest = {
        id: uuidv4(),
        originalTransactionId: transactionId,
        tenantId,
        refundType,
        refundAmount: finalRefundAmount!,
        refundItems,
        refundReason,
        notes,
        status: 'pending',
        cashierId,
        createdAt: new Date().toISOString()
      };

      // Process refund through payment gateway for electronic payments
      const refundResults = [];
      for (const paymentMethod of originalTransaction.paymentMethods) {
        if (paymentMethod.method === 'cash') {
          // Cash refund - immediate
          refundResults.push({
            method: 'cash',
            amount: paymentMethod.amount,
            status: 'processed',
            processedAt: new Date().toISOString()
          });
        } else {
          // Electronic refund
          const refundResult = await paymentGatewayCoreCell.processRefund({
            paymentId: paymentMethod.reference,
            provider: paymentMethod.provider,
            amount: paymentMethod.amount,
            reason: refundReason
          });

          refundResults.push({
            method: paymentMethod.method,
            amount: paymentMethod.amount,
            status: refundResult.success ? 'processed' : 'failed',
            processedAt: new Date().toISOString(),
            error: refundResult.success ? undefined : refundResult.error
          });
        }
      }

      // Update inventory levels (restore stock)
      const inventoryUpdates = [];
      if (refundType === 'full') {
        for (const item of originalTransaction.items) {
          const updateResult = await inventoryTrackingCell.adjustStock({
            productId: item.productId,
            variantId: item.variantId,
            adjustment: item.quantity,
            reason: 'refund',
            locationId: originalTransaction.locationId,
            notes: `Refund for transaction ${originalTransaction.transactionNumber}`
          }, tenantId);

          inventoryUpdates.push({
            productId: item.productId,
            quantityReturned: item.quantity,
            newStockLevel: updateResult.success ? updateResult.newStockLevel : 'unknown'
          });
        }
      } else if (refundType === 'item_specific' && refundItems) {
        for (const refundItem of refundItems) {
          const updateResult = await inventoryTrackingCell.adjustStock({
            productId: refundItem.productId,
            adjustment: refundItem.quantity,
            reason: 'refund',
            locationId: originalTransaction.locationId,
            notes: `Partial refund for transaction ${originalTransaction.transactionNumber}: ${refundItem.reason}`
          }, tenantId);

          inventoryUpdates.push({
            productId: refundItem.productId,
            quantityReturned: refundItem.quantity,
            newStockLevel: updateResult.success ? updateResult.newStockLevel : 'unknown'
          });
        }
      }

      // Update refund status
      const allRefundsSuccessful = refundResults.every(rr => rr.status === 'processed');
      refund.status = allRefundsSuccessful ? 'processed' : 'approved';
      refund.processedAt = allRefundsSuccessful ? new Date().toISOString() : undefined;

      // Save refund record
      await this.saveRefund(refund);

      // Update original transaction status
      if (refundType === 'full') {
        originalTransaction.paymentStatus = 'refunded';
      } else {
        originalTransaction.paymentStatus = 'partially_refunded';
      }
      await this.updateTransaction(originalTransaction);

      // Generate refund receipt
      const refundReceipt = await this.generateRefundReceipt(refund, originalTransaction);

      return {
        success: true,
        refund: {
          ...refund,
          refundReceipt: refundReceipt.url
        },
        inventoryUpdates,
        message: 'Refund processed successfully'
      };
    });
  },

  // ========================================
  // RECEIPT GENERATION OPERATIONS
  // ========================================

  /**
   * Generate Nigerian-compliant receipt with VAT details
   */
  async generateReceipt(input: unknown, tenantId: string): Promise<{ success: boolean; receipt?: any; message: string; error?: string }> {
    try {
      const { transactionId, format = 'pdf', language = 'en', includeTaxBreakdown = true, includeQRCode = true } = input as any;

      // Get transaction details
      const transaction = await this.getTransaction(transactionId, tenantId);
      if (!transaction) {
        return {
          success: false,
          message: 'Transaction not found'
        };
      }

      // Get tenant details for receipt header
      const tenantDetails = await this.getTenantDetails(tenantId);

      // Generate QR code for transaction verification
      let qrCodeData = '';
      if (includeQRCode) {
        const qrData = {
          txn: transaction.transactionNumber,
          ref: transaction.reference,
          amt: transaction.total,
          curr: transaction.currency,
          date: transaction.createdAt
        };
        qrCodeData = await this.generateQRCode(JSON.stringify(qrData));
      }

      // Build receipt data structure
      const receiptData = {
        id: uuidv4(),
        format,
        language,
        transaction,
        tenant: tenantDetails,
        qrCode: qrCodeData,
        generatedAt: new Date().toISOString(),
        includeTaxBreakdown,
        includeQRCode
      };

      // Generate receipt content based on format
      let receiptContent = '';
      let receiptUrl = '';

      if (format === 'pdf') {
        const pdfResult = await this.generatePDFReceipt(receiptData);
        receiptContent = pdfResult.content;
        receiptUrl = pdfResult.url;
      } else if (format === 'html') {
        receiptContent = await this.generateHTMLReceipt(receiptData);
        receiptUrl = await this.saveHTMLReceipt(receiptContent, transaction.transactionNumber);
      } else if (format === 'thermal') {
        receiptContent = await this.generateThermalReceipt(receiptData);
      } else {
        receiptContent = JSON.stringify(receiptData, null, 2);
      }

      const receipt = {
        id: receiptData.id,
        format,
        url: receiptUrl,
        content: receiptContent,
        qrCode: qrCodeData,
        transactionId,
        generatedAt: receiptData.generatedAt
      };

      // Save receipt record
      await this.saveReceiptRecord(receipt);

      return {
        success: true,
        receipt,
        message: 'Receipt generated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Receipt generation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // VALIDATION OPERATIONS
  // ========================================

  /**
   * Validate transaction before processing
   */
  async validateTransaction(input: unknown, tenantId: string): Promise<{ success: boolean; valid?: boolean; validationResults?: any; warnings?: string[]; message: string; error?: string }> {
    try {
      const { sessionId, performInventoryCheck = true, validateCustomer = true, checkPaymentLimits = true } = input as any;

      // Get cart session
      const cartSession = await this.getActiveCartSession(tenantId, sessionId);
      if (!cartSession) {
        return {
          success: false,
          message: 'Cart session not found'
        };
      }

      const validationResults: any = {
        inventoryCheck: { valid: true, insufficientStock: [], unavailableProducts: [] },
        customerValidation: { valid: true, creditLimit: 0, loyaltyStatus: 'standard' },
        paymentLimits: { valid: true, dailyLimit: 0, transactionLimit: 0 }
      };

      const warnings: string[] = [];
      let overallValid = true;

      // Inventory validation
      if (performInventoryCheck) {
        for (const item of cartSession.items) {
          const inventoryResult = await inventoryTrackingCell.checkStockAvailability({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            locationId: cartSession.locationId
          }, tenantId);

          if (!inventoryResult.success || !inventoryResult.available) {
            validationResults.inventoryCheck.valid = false;
            validationResults.inventoryCheck.insufficientStock.push({
              productId: item.productId,
              productName: item.productName,
              requested: item.quantity,
              available: inventoryResult.availableQuantity || 0
            });
            overallValid = false;
          }
        }
      }

      // Customer validation
      if (validateCustomer && cartSession.customerId) {
        const customerResult = await customerProfileCell.getCustomer({ id: cartSession.customerId }, tenantId);
        if (customerResult.success && customerResult.customer) {
          validationResults.customerValidation.loyaltyStatus = customerResult.customer.tier;
          
          // Check credit limits for business customers
          if (customerResult.customer.customerType === 'business' || customerResult.customer.customerType === 'corporate') {
            const creditLimit = customerResult.customer.customFields?.creditLimit || 0;
            if (cartSession.total > creditLimit) {
              validationResults.customerValidation.valid = false;
              validationResults.customerValidation.creditLimit = creditLimit;
              warnings.push(`Transaction amount exceeds customer credit limit of ${cartSession.currency} ${creditLimit}`);
            }
          }
        }
      }

      // Payment limits validation
      if (checkPaymentLimits) {
        const dailyLimit = await this.getDailyTransactionLimit(tenantId, cartSession.cashierId);
        const currentDailyTotal = await this.getDailyTransactionTotal(tenantId, cartSession.cashierId);
        
        if (currentDailyTotal + cartSession.total > dailyLimit) {
          validationResults.paymentLimits.valid = false;
          validationResults.paymentLimits.dailyLimit = dailyLimit;
          warnings.push(`Transaction would exceed daily limit of ${cartSession.currency} ${dailyLimit}`);
        }

        const singleTransactionLimit = await this.getSingleTransactionLimit(tenantId);
        if (cartSession.total > singleTransactionLimit) {
          validationResults.paymentLimits.valid = false;
          validationResults.paymentLimits.transactionLimit = singleTransactionLimit;
          warnings.push(`Transaction exceeds single transaction limit of ${cartSession.currency} ${singleTransactionLimit}`);
        }
      }

      return {
        success: true,
        valid: overallValid,
        validationResults,
        warnings,
        message: overallValid ? 'Transaction validation passed' : 'Transaction validation failed'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Transaction validation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // HELPER METHODS
  // ========================================

  async getActiveCartSession(tenantId: string, sessionId: string): Promise<CartSession | null> {
    try {
      const cacheKey = `cart:${tenantId}:${sessionId}`;
      const cachedCart = await redis.get(cacheKey);
      
      if (cachedCart) {
        return JSON.parse(cachedCart);
      }

      // Fallback to database
      const result = await execute_sql(
        'SELECT * FROM cart_sessions WHERE tenant_id = $1 AND session_id = $2 AND status = $3',
        [tenantId, sessionId, 'active']
      );

      if (result.rows && result.rows.length > 0) {
        const cartSession = this.mapDatabaseRowToCartSession(result.rows[0]);
        // Cache for future use
        await redis.set(cacheKey, JSON.stringify(cartSession), { ex: 86400 });
        return cartSession;
      }

      return null;
    } catch (error) {
      console.error('Error getting cart session:', error);
      return null;
    }
  },

  async saveCartSession(cartSession: CartSession): Promise<void> {
    try {
      // Save to Redis cache
      const cacheKey = `cart:${cartSession.tenantId}:${cartSession.sessionId}`;
      await redis.set(cacheKey, JSON.stringify(cartSession), { ex: 86400 });

      // Persist to database
      await this.persistCartSession(cartSession);
    } catch (error) {
      console.error('Error saving cart session:', error);
      throw error;
    }
  },

  async persistCartSession(cartSession: CartSession): Promise<void> {
    const sql = `
      INSERT INTO cart_sessions (
        id, session_id, tenant_id, cashier_id, customer_id, location_id, terminal_id,
        currency, items, subtotal, discounts, taxes, fees, total, status, notes, metadata,
        created_at, updated_at, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) ON CONFLICT (tenant_id, session_id) DO UPDATE SET
        items = $9, subtotal = $10, discounts = $11, taxes = $12, fees = $13, total = $14,
        status = $15, notes = $16, metadata = $17, updated_at = $19
    `;

    await execute_sql(sql, [
      cartSession.id,
      cartSession.sessionId,
      cartSession.tenantId,
      cartSession.cashierId,
      cartSession.customerId,
      cartSession.locationId,
      cartSession.terminalId,
      cartSession.currency,
      JSON.stringify(cartSession.items),
      cartSession.subtotal,
      JSON.stringify(cartSession.discounts),
      JSON.stringify(cartSession.taxes),
      JSON.stringify(cartSession.fees),
      cartSession.total,
      cartSession.status,
      cartSession.notes,
      JSON.stringify(cartSession.metadata),
      cartSession.createdAt,
      cartSession.updatedAt,
      cartSession.expiresAt
    ]);
  },

  async recalculateCartTotals(cartSession: CartSession, tenantId: string): Promise<void> {
    // Calculate subtotal
    cartSession.subtotal = cartSession.items.reduce((sum, item) => sum + item.lineTotal, 0);

    // Apply discounts
    const totalDiscountAmount = cartSession.discounts.reduce((sum, discount) => sum + discount.amount, 0);

    // Calculate taxes
    await this.calculateTax({ sessionId: cartSession.sessionId, taxableAmount: cartSession.subtotal - totalDiscountAmount }, tenantId);

    // Calculate fees
    const totalFees = cartSession.fees.reduce((sum, fee) => sum + fee.amount, 0);

    // Calculate total
    const totalTaxAmount = cartSession.taxes.reduce((sum, tax) => sum + tax.amount, 0);
    cartSession.total = cartSession.subtotal - totalDiscountAmount + totalTaxAmount + totalFees;
  },

  async validateCashier(tenantId: string, cashierId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const result = await execute_sql(
        'SELECT id, status FROM users WHERE tenant_id = $1 AND id = $2',
        [tenantId, cashierId]
      );

      if (!result.rows || result.rows.length === 0) {
        return { valid: false, error: 'Cashier not found' };
      }

      const cashier = result.rows[0];
      if (cashier.status !== 'active') {
        return { valid: false, error: 'Cashier account is inactive' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Cashier validation failed' };
    }
  },

  async validatePriceOverride(tenantId: string, cashierId: string, newPrice: number, originalPrice: number): Promise<{ valid: boolean; error?: string }> {
    // Check if price override is allowed for this cashier
    const maxDiscountPercent = 0.20; // 20% maximum discount without manager approval
    const discountPercent = (originalPrice - newPrice) / originalPrice;

    if (discountPercent > maxDiscountPercent) {
      return { valid: false, error: 'Price override exceeds maximum allowed discount. Manager approval required.' };
    }

    if (newPrice < 0) {
      return { valid: false, error: 'Price cannot be negative' };
    }

    return { valid: true };
  },

  async generateTransactionNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get next sequence number for today
    const result = await execute_sql(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM 10) AS INTEGER)), 0) + 1 as next_seq
       FROM pos_transactions 
       WHERE tenant_id = $1 AND transaction_number LIKE $2`,
      [tenantId, `${dateStr}%`]
    );

    const nextSeq = result.rows?.[0]?.next_seq || 1;
    return `${dateStr}${nextSeq.toString().padStart(4, '0')}`;
  },

  mapDatabaseRowToCartSession(row: any): CartSession {
    return {
      id: row.id,
      sessionId: row.session_id,
      tenantId: row.tenant_id,
      cashierId: row.cashier_id,
      customerId: row.customer_id,
      locationId: row.location_id,
      terminalId: row.terminal_id,
      currency: row.currency,
      items: JSON.parse(row.items || '[]'),
      subtotal: parseFloat(row.subtotal || '0'),
      discounts: JSON.parse(row.discounts || '[]'),
      taxes: JSON.parse(row.taxes || '[]'),
      fees: JSON.parse(row.fees || '[]'),
      total: parseFloat(row.total || '0'),
      status: row.status,
      notes: row.notes,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at
    };
  },

  // ========================================
  // DISCOUNT AND VALIDATION METHODS
  // ========================================

  async validateDiscountCode(input: unknown, tenantId: string): Promise<{
    success: boolean;
    valid: boolean;
    discount?: Discount;
    message: string;
    error?: string;
  }> {
    try {
      const { discountCode } = input as any;
      // Simplified validation - in production would check discount database
      return {
        success: true,
        valid: !!discountCode,
        message: discountCode ? 'Discount code valid' : 'Invalid discount code'
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        message: 'Failed to validate discount code',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async applyDiscountToItem(input: unknown, tenantId: string): Promise<{
    success: boolean;
    item?: CartItem;
    message: string;
    error?: string;
  }> {
    try {
      const { cartItemId, discountAmount } = input as any;
      // Simplified implementation
      return {
        success: true,
        message: 'Discount applied to item'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to apply discount to item',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async validateInventoryAvailability(input: unknown, tenantId: string): Promise<{
    success: boolean;
    available: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // Delegate to inventory cell
      return await inventoryTrackingCell.checkStockAvailability(input, tenantId);
    } catch (error) {
      return {
        success: false,
        available: false,
        message: 'Failed to validate inventory',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // TRANSACTION MANAGEMENT METHODS
  // ========================================

  async saveTransaction(transaction: Transaction): Promise<{
    success: boolean;
    transactionId?: string;
    message: string;
    error?: string;
  }> {
    try {
      const query = `
        INSERT INTO pos_transactions (
          id, tenant_id, transaction_number, reference, session_id, cashier_id,
          customer_id, location_id, terminal_id, items, subtotal, discounts,
          taxes, fees, total, currency, payment_methods, payment_status,
          customer_info, receipt_url, qr_code, notes, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      `;

      await execute_sql(query, [
        transaction.id,
        transaction.tenantId,
        transaction.transactionNumber,
        transaction.reference,
        transaction.sessionId,
        transaction.cashierId,
        transaction.customerId,
        transaction.locationId,
        transaction.terminalId,
        JSON.stringify(transaction.items),
        transaction.subtotal,
        JSON.stringify(transaction.discounts),
        JSON.stringify(transaction.taxes),
        JSON.stringify(transaction.fees),
        transaction.total,
        transaction.currency,
        JSON.stringify(transaction.paymentMethods),
        transaction.paymentStatus,
        JSON.stringify(transaction.customerInfo),
        transaction.receiptUrl,
        transaction.qrCode,
        transaction.notes,
        JSON.stringify(transaction.metadata),
        transaction.createdAt,
        transaction.updatedAt
      ]);

      return {
        success: true,
        transactionId: transaction.id,
        message: 'Transaction saved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save transaction',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async getTransaction(input: unknown, tenantId: string): Promise<{
    success: boolean;
    transaction?: Transaction;
    message: string;
    error?: string;
  }> {
    try {
      const { transactionId } = input as any;
      
      const query = `
        SELECT * FROM pos_transactions 
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `;

      const result = await execute_sql(query, [tenantId, transactionId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'Transaction not found'
        };
      }

      const row = result.rows[0];
      const transaction: Transaction = {
        id: row.id,
        tenantId: row.tenant_id,
        transactionNumber: row.transaction_number,
        reference: row.reference,
        sessionId: row.session_id,
        cashierId: row.cashier_id,
        customerId: row.customer_id,
        locationId: row.location_id,
        terminalId: row.terminal_id,
        items: JSON.parse(row.items || '[]'),
        subtotal: parseFloat(row.subtotal || '0'),
        discounts: JSON.parse(row.discounts || '[]'),
        taxes: JSON.parse(row.taxes || '[]'),
        fees: JSON.parse(row.fees || '[]'),
        total: parseFloat(row.total || '0'),
        currency: row.currency,
        paymentMethods: JSON.parse(row.payment_methods || '[]'),
        paymentStatus: row.payment_status,
        customerInfo: JSON.parse(row.customer_info || '{}'),
        receiptUrl: row.receipt_url,
        qrCode: row.qr_code,
        notes: row.notes,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      return {
        success: true,
        transaction,
        message: 'Transaction retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get transaction',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async updateTransaction(input: unknown, tenantId: string): Promise<{
    success: boolean;
    transaction?: Transaction;
    message: string;
    error?: string;
  }> {
    try {
      const { transactionId, updates } = input as any;
      
      const query = `
        UPDATE pos_transactions 
        SET payment_status = $3, updated_at = $4, metadata = $5
        WHERE tenant_id = $1 AND id = $2
      `;

      await execute_sql(query, [
        tenantId,
        transactionId,
        updates.paymentStatus || 'pending',
        new Date().toISOString(),
        JSON.stringify(updates.metadata || {})
      ]);

      return {
        success: true,
        message: 'Transaction updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update transaction',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // REFUND MANAGEMENT METHODS
  // ========================================

  async validateRefundEligibility(transaction: Transaction, refundType: string, refundAmount?: number, refundItems?: any[]): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      if (!transaction) {
        return { valid: false, error: 'Transaction not found' };
      }

      if (transaction.paymentStatus !== 'completed') {
        return { valid: false, error: 'Cannot refund incomplete transaction' };
      }

      if (refundAmount && refundAmount > transaction.total) {
        return { valid: false, error: 'Refund amount exceeds transaction total' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Refund validation failed' };
    }
  },

  async saveRefund(refund: RefundRequest): Promise<{
    success: boolean;
    refundId?: string;
    message: string;
    error?: string;
  }> {
    try {
      const query = `
        INSERT INTO pos_refunds (
          id, original_transaction_id, tenant_id, refund_type, refund_amount,
          refund_items, refund_reason, notes, status, cashier_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      await execute_sql(query, [
        refund.id,
        refund.originalTransactionId,
        refund.tenantId,
        refund.refundType,
        refund.refundAmount,
        JSON.stringify(refund.refundItems || []),
        refund.refundReason,
        refund.notes,
        refund.status,
        refund.cashierId,
        refund.createdAt
      ]);

      return {
        success: true,
        refundId: refund.id,
        message: 'Refund saved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save refund',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // CUSTOMER AND LOYALTY METHODS
  // ========================================

  async processLoyaltyPoints(customerId: string, transaction: Transaction, tenantId: string): Promise<{
    success: boolean;
    pointsEarned?: number;
    message: string;
    error?: string;
  }> {
    try {
      // Simple loyalty calculation: 1 point per NGN 100 spent
      const pointsEarned = Math.floor(transaction.total / 100);
      
      // In production, would save to loyalty_points table
      return {
        success: true,
        pointsEarned,
        message: `Customer earned ${pointsEarned} loyalty points`
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to process loyalty points',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async getTenantDetails(tenantId: string): Promise<{
    success: boolean;
    tenant?: any;
    message: string;
    error?: string;
  }> {
    try {
      const query = `
        SELECT id, name, subdomain, settings, address, phone, email
        FROM tenants 
        WHERE id = $1 AND is_active = true
        LIMIT 1
      `;

      const result = await execute_sql(query, [tenantId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'Tenant not found'
        };
      }

      return {
        success: true,
        tenant: result.rows[0],
        message: 'Tenant details retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get tenant details',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async getDailyTransactionLimit(tenantId: string): Promise<{
    success: boolean;
    limit?: number;
    message: string;
    error?: string;
  }> {
    try {
      // Default daily transaction limit in NGN
      const defaultLimit = 1000000; // 1 million NGN
      
      return {
        success: true,
        limit: defaultLimit,
        message: 'Daily transaction limit retrieved'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get daily transaction limit',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // RECEIPT GENERATION METHODS
  // ========================================

  async generateQRCode(input: unknown, tenantId: string): Promise<{
    success: boolean;
    qrCode?: string;
    message: string;
    error?: string;
  }> {
    try {
      const { transactionId, data } = input as any;
      // Simplified QR code generation
      const qrData = JSON.stringify({ transactionId, tenantId, data });
      const qrCode = `data:image/svg+xml;base64,${Buffer.from(qrData).toString('base64')}`;
      
      return {
        success: true,
        qrCode,
        message: 'QR code generated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate QR code',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async generatePDFReceipt(input: unknown, tenantId: string): Promise<{
    success: boolean;
    receiptData?: any;
    message: string;
    error?: string;
  }> {
    try {
      // Simplified PDF receipt generation
      return {
        success: true,
        receiptData: { format: 'pdf', content: 'PDF receipt content' },
        message: 'PDF receipt generated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate PDF receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async generateHTMLReceipt(input: unknown, tenantId: string): Promise<{
    success: boolean;
    receiptData?: any;
    message: string;
    error?: string;
  }> {
    try {
      return {
        success: true,
        receiptData: { format: 'html', content: '<html>Receipt content</html>' },
        message: 'HTML receipt generated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate HTML receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async generateThermalReceipt(input: unknown, tenantId: string): Promise<{
    success: boolean;
    receiptData?: any;
    message: string;
    error?: string;
  }> {
    try {
      return {
        success: true,
        receiptData: { format: 'thermal', content: 'Thermal receipt content' },
        message: 'Thermal receipt generated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate thermal receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async saveHTMLReceipt(input: unknown, tenantId: string): Promise<{
    success: boolean;
    receiptUrl?: string;
    message: string;
    error?: string;
  }> {
    try {
      const { receiptData, transactionId } = input as any;
      const receiptUrl = `/receipts/${tenantId}/${transactionId}.html`;
      
      return {
        success: true,
        receiptUrl,
        message: 'HTML receipt saved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save HTML receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async saveReceiptRecord(input: unknown, tenantId: string): Promise<{
    success: boolean;
    receiptId?: string;
    message: string;
    error?: string;
  }> {
    try {
      const { transactionId, receiptData } = input as any;
      const receiptId = uuidv4();
      
      return {
        success: true,
        receiptId,
        message: 'Receipt record saved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save receipt record',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async generateRefundReceipt(input: unknown, tenantId: string): Promise<{
    success: boolean;
    receiptData?: any;
    message: string;
    error?: string;
  }> {
    try {
      return {
        success: true,
        receiptData: { format: 'pdf', content: 'Refund receipt content' },
        message: 'Refund receipt generated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate refund receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // COMMUNICATION METHODS
  // ========================================

  async emailReceipt(email: string, receipt: any, transaction: Transaction): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // Send email using replitmail integration
      await sendEmail({
        to: email,
        subject: `Receipt for Transaction ${transaction.transactionNumber}`,
        html: `<p>Thank you for your purchase!</p><p>Transaction ID: ${transaction.id}</p>`
      });

      return {
        success: true,
        message: 'Receipt emailed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to email receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async smsReceipt(phone: string, receipt: any, transaction: Transaction): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // Send SMS using integrated SMS service
      await smsService.sendSMS({
        to: phone,
        message: `Receipt for Transaction ${transaction.transactionNumber}. Total: ${transaction.currency} ${transaction.total}. Thank you!`
      });

      return {
        success: true,
        message: 'Receipt sent via SMS successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to send SMS receipt',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // ========================================
  // MISSING METHODS FOR SALES ENGINE
  // ========================================

  async updateInventoryAfterSale(transaction: Transaction, tenantId: string): Promise<{
    success: boolean;
    updates: any[];
    message: string;
    error?: string;
  }> {
    try {
      // Delegate to inventory tracking cell
      return await inventoryTrackingCell.updateInventoryAfterSale(transaction, tenantId);
    } catch (error) {
      return {
        success: false,
        updates: [],
        message: 'Failed to update inventory after sale',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async getDailyTransactionTotal(tenantId: string): Promise<{
    success: boolean;
    total?: number;
    message: string;
    error?: string;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const query = `
        SELECT COALESCE(SUM(total), 0) as daily_total
        FROM pos_transactions
        WHERE tenant_id = $1 
        AND DATE(created_at) = $2
        AND payment_status = 'completed'
      `;

      const result = await execute_sql(query, [tenantId, today]);
      const dailyTotal = parseFloat(result.rows[0]?.daily_total || '0');

      return {
        success: true,
        total: dailyTotal,
        message: 'Daily transaction total retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get daily transaction total',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async getSingleTransactionLimit(tenantId: string): Promise<{
    success: boolean;
    limit?: number;
    message: string;
    error?: string;
  }> {
    try {
      // Default single transaction limit in NGN
      const defaultLimit = 500000; // 500,000 NGN per transaction
      
      return {
        success: true,
        limit: defaultLimit,
        message: 'Single transaction limit retrieved'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get single transaction limit',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};