import { execute_sql, withTransaction } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Nigerian market specific imports
import { createSMSService } from '@/lib/sms-service';
import { sendEmail } from '@/lib/replitmail';

// Types for TransactionHistory operations
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
  items: TransactionItem[];
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

export interface TransactionItem {
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

export interface SalesAnalytics {
  totalRevenue: number;
  totalTransactions: number;
  totalItemsSold: number;
  averageTransactionValue: number;
  taxCollected: number;
  discountsGiven: number;
  refundsProcessed: number;
  topProducts: ProductPerformance[];
  cashierPerformance: CashierPerformance[];
  paymentMethodBreakdown: PaymentMethodStats[];
  hourlyTrends: HourlyTrend[];
  categoryPerformance: CategoryPerformance[];
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  profit?: number;
}

export interface CashierPerformance {
  cashierId: string;
  cashierName?: string;
  transactionCount: number;
  totalRevenue: number;
  averageTransactionValue: number;
  hoursWorked?: number;
}

export interface PaymentMethodStats {
  method: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface HourlyTrend {
  hour: number;
  transactionCount: number;
  revenue: number;
}

export interface CategoryPerformance {
  categoryId: string;
  categoryName: string;
  revenue: number;
  itemsSold: number;
}

// Nigerian market specific constants
const NIGERIAN_TAX_RATES = {
  'standard_vat': 0.075,     // 7.5% standard VAT
  'luxury_tax': 0.10,        // 10% luxury goods tax
  'service_tax': 0.05,       // 5% service tax
  'withholding_tax': 0.05,   // 5% withholding tax for businesses
};

const REFUND_POLICIES = {
  'same_day': { maxAmount: 500000, requiresApproval: false },      // NGN 500k same day
  'weekly': { maxAmount: 1000000, requiresApproval: true },        // NGN 1M weekly approval
  'monthly': { maxAmount: 5000000, requiresApproval: true },       // NGN 5M monthly approval
  'manager_override': { maxAmount: Infinity, requiresApproval: true }
};

// Initialize SMS service
const smsService = createSMSService();

// Input validation schemas
const getTransactionHistorySchema = z.object({
  filters: z.object({
    dateRange: z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional()
    }).optional(),
    status: z.array(z.enum(['pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'])).optional(),
    paymentMethods: z.array(z.enum(['cash', 'card', 'mobile_money', 'bank_transfer', 'split_payment'])).optional(),
    cashierId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    terminalId: z.string().max(100).optional(),
    transactionNumber: z.string().max(100).optional(),
    reference: z.string().max(100).optional(),
    minAmount: z.number().min(0).optional(),
    maxAmount: z.number().min(0).optional(),
    currency: z.enum(['NGN', 'USD', 'GBP']).optional(),
    productIds: z.array(z.string().uuid()).optional(),
    categoryIds: z.array(z.string().uuid()).optional()
  }).optional(),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(1000).default(50),
    sortBy: z.enum(['createdAt', 'total', 'transactionNumber', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }).optional(),
  includeItems: z.boolean().default(true),
  includePayments: z.boolean().default(true),
  includeCustomer: z.boolean().default(false),
  includeRefunds: z.boolean().default(false)
});

const getTransactionDetailsSchema = z.object({
  transactionId: z.string().uuid(),
  includeAuditTrail: z.boolean().default(true),
  includeRefundHistory: z.boolean().default(true),
  includeRelatedTransactions: z.boolean().default(false)
});

const processRefundSchema = z.object({
  originalTransactionId: z.string().uuid(),
  refundType: z.enum(['full', 'partial', 'item_specific']),
  refundAmount: z.number().min(0).optional(),
  refundItems: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity: z.number().min(0.01),
    reason: z.string().max(500)
  })).optional(),
  refundReason: z.enum(['defective', 'wrong_item', 'customer_request', 'policy_return', 'damaged']),
  notes: z.string().max(1000).optional(),
  cashierId: z.string().uuid(),
  managerApproval: z.boolean().default(false),
  managerApprovalCode: z.string().max(20).optional()
});

const generateSalesReportSchema = z.object({
  reportType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom']).default('daily'),
  dateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }),
  groupBy: z.array(z.enum(['date', 'cashier', 'location', 'terminal', 'product', 'category', 'payment_method'])).optional(),
  metrics: z.array(z.enum(['revenue', 'transactions', 'items_sold', 'average_transaction', 'tax_collected', 'discounts_given', 'refunds_processed'])).optional(),
  filters: z.object({
    locationIds: z.array(z.string().uuid()).optional(),
    cashierIds: z.array(z.string().uuid()).optional(),
    terminalIds: z.array(z.string()).optional(),
    productIds: z.array(z.string().uuid()).optional(),
    categoryIds: z.array(z.string().uuid()).optional()
  }).optional(),
  format: z.enum(['json', 'pdf', 'excel', 'csv']).default('json'),
  currency: z.enum(['NGN', 'USD', 'GBP']).default('NGN')
});

const getAnalyticsSchema = z.object({
  analyticsType: z.enum(['revenue_trends', 'product_performance', 'cashier_performance', 'payment_methods', 'customer_behavior', 'tax_analysis', 'refund_analysis']),
  timeframe: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_year', 'custom']),
  customDateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }).optional(),
  comparisonPeriod: z.boolean().default(false),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  topN: z.number().min(1).max(100).default(10)
});

// Core Transaction History Cell Implementation
export class TransactionHistoryCell {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  // Get transaction history with advanced filtering
  async getTransactionHistory(params: z.infer<typeof getTransactionHistorySchema>) {
    try {
      const validated = getTransactionHistorySchema.parse(params);
      const { filters = {}, pagination = {}, includeItems, includePayments, includeCustomer, includeRefunds } = validated;
      const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;

      let query = `
        SELECT 
          t.*,
          ${includeCustomer ? 'c.name as customer_name, c.phone as customer_phone, c.email as customer_email,' : ''}
          cashier.name as cashier_name
        FROM pos_transactions t
        ${includeCustomer ? 'LEFT JOIN customers c ON t.customer_id = c.id' : ''}
        LEFT JOIN users cashier ON t.cashier_id = cashier.id
        WHERE t.tenant_id = $1
      `;

      const queryParams: any[] = [this.tenantId];
      let paramIndex = 2;

      // Apply filters
      if (filters.dateRange?.startDate) {
        query += ` AND t.created_at >= $${paramIndex}`;
        queryParams.push(filters.dateRange.startDate);
        paramIndex++;
      }

      if (filters.dateRange?.endDate) {
        query += ` AND t.created_at <= $${paramIndex}`;
        queryParams.push(filters.dateRange.endDate);
        paramIndex++;
      }

      if (filters.status?.length) {
        query += ` AND t.payment_status = ANY($${paramIndex})`;
        queryParams.push(filters.status);
        paramIndex++;
      }

      if (filters.cashierId) {
        query += ` AND t.cashier_id = $${paramIndex}`;
        queryParams.push(filters.cashierId);
        paramIndex++;
      }

      if (filters.customerId) {
        query += ` AND t.customer_id = $${paramIndex}`;
        queryParams.push(filters.customerId);
        paramIndex++;
      }

      if (filters.locationId) {
        query += ` AND t.location_id = $${paramIndex}`;
        queryParams.push(filters.locationId);
        paramIndex++;
      }

      if (filters.terminalId) {
        query += ` AND t.terminal_id = $${paramIndex}`;
        queryParams.push(filters.terminalId);
        paramIndex++;
      }

      if (filters.transactionNumber) {
        query += ` AND t.transaction_number ILIKE $${paramIndex}`;
        queryParams.push(`%${filters.transactionNumber}%`);
        paramIndex++;
      }

      if (filters.reference) {
        query += ` AND t.reference ILIKE $${paramIndex}`;
        queryParams.push(`%${filters.reference}%`);
        paramIndex++;
      }

      if (filters.minAmount !== undefined) {
        query += ` AND t.total >= $${paramIndex}`;
        queryParams.push(filters.minAmount);
        paramIndex++;
      }

      if (filters.maxAmount !== undefined) {
        query += ` AND t.total <= $${paramIndex}`;
        queryParams.push(filters.maxAmount);
        paramIndex++;
      }

      if (filters.currency) {
        query += ` AND t.currency = $${paramIndex}`;
        queryParams.push(filters.currency);
        paramIndex++;
      }

      // Apply product/category filters if needed
      if (filters.productIds?.length) {
        query += ` AND EXISTS (
          SELECT 1 FROM pos_transaction_items pti 
          WHERE pti.transaction_id = t.id 
          AND pti.product_id = ANY($${paramIndex})
        )`;
        queryParams.push(filters.productIds);
        paramIndex++;
      }

      if (filters.categoryIds?.length) {
        query += ` AND EXISTS (
          SELECT 1 FROM pos_transaction_items pti 
          JOIN products p ON pti.product_id = p.id
          WHERE pti.transaction_id = t.id 
          AND p.category_id = ANY($${paramIndex})
        )`;
        queryParams.push(filters.categoryIds);
        paramIndex++;
      }

      // Add sorting and pagination
      query += ` ORDER BY t.${sortBy} ${sortOrder.toUpperCase()}`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, (page - 1) * limit);

      const transactions = await execute_sql(query, queryParams);

      // Get total count for pagination
      const countQuery = query.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM').split(' ORDER BY')[0];
      const countResult = await execute_sql(countQuery, queryParams.slice(0, -2));
      const totalCount = parseInt(countResult[0]?.total || '0');

      // Fetch related data if requested
      const enrichedTransactions = await Promise.all(
        transactions.map(async (transaction: any) => {
          const enriched: any = { ...transaction };

          if (includeItems) {
            const items = await execute_sql(`
              SELECT * FROM pos_transaction_items 
              WHERE transaction_id = $1 
              ORDER BY created_at
            `, [transaction.id]);
            enriched.items = items;
          }

          if (includePayments) {
            const payments = await execute_sql(`
              SELECT * FROM pos_transaction_payments 
              WHERE transaction_id = $1 
              ORDER BY created_at
            `, [transaction.id]);
            enriched.paymentMethods = payments;
          }

          if (includeRefunds) {
            const refunds = await execute_sql(`
              SELECT * FROM pos_refunds 
              WHERE original_transaction_id = $1 
              ORDER BY created_at DESC
            `, [transaction.id]);
            enriched.refunds = refunds;
          }

          return enriched;
        })
      );

      return {
        success: true,
        data: {
          transactions: enrichedTransactions,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNext: page < Math.ceil(totalCount / limit),
            hasPrev: page > 1
          }
        }
      };

    } catch (error) {
      console.error('Get transaction history error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transaction history'
      };
    }
  }

  // Get detailed transaction information
  async getTransactionDetails(params: z.infer<typeof getTransactionDetailsSchema>) {
    try {
      const validated = getTransactionDetailsSchema.parse(params);
      const { transactionId, includeAuditTrail, includeRefundHistory, includeRelatedTransactions } = validated;

      // Get main transaction
      const transaction = await execute_sql(`
        SELECT 
          t.*,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          c.address as customer_address,
          cashier.name as cashier_name,
          cashier.email as cashier_email
        FROM pos_transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN users cashier ON t.cashier_id = cashier.id
        WHERE t.id = $1 AND t.tenant_id = $2
      `, [transactionId, this.tenantId]);

      if (!transaction.length) {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }

      const transactionData = transaction[0];

      // Get transaction items
      const items = await execute_sql(`
        SELECT 
          pti.*,
          p.name as product_name,
          p.sku,
          p.barcode,
          pc.name as category_name
        FROM pos_transaction_items pti
        LEFT JOIN products p ON pti.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE pti.transaction_id = $1
        ORDER BY pti.created_at
      `, [transactionId]);

      // Get payment methods
      const payments = await execute_sql(`
        SELECT * FROM pos_transaction_payments 
        WHERE transaction_id = $1 
        ORDER BY created_at
      `, [transactionId]);

      // Get discounts
      const discounts = await execute_sql(`
        SELECT * FROM pos_transaction_discounts 
        WHERE transaction_id = $1 
        ORDER BY created_at
      `, [transactionId]);

      // Get taxes
      const taxes = await execute_sql(`
        SELECT * FROM pos_transaction_taxes 
        WHERE transaction_id = $1 
        ORDER BY created_at
      `, [transactionId]);

      // Get fees
      const fees = await execute_sql(`
        SELECT * FROM pos_transaction_fees 
        WHERE transaction_id = $1 
        ORDER BY created_at
      `, [transactionId]);

      const enrichedTransaction = {
        ...transactionData,
        items,
        paymentMethods: payments,
        discounts,
        taxes,
        fees
      };

      // Get audit trail if requested
      if (includeAuditTrail) {
        const auditTrail = await execute_sql(`
          SELECT 
            al.*,
            u.name as user_name
          FROM audit_logs al
          LEFT JOIN users u ON al.user_id = u.id
          WHERE al.resource_type = 'transaction' 
          AND al.resource_id = $1
          AND al.tenant_id = $2
          ORDER BY al.created_at DESC
        `, [transactionId, this.tenantId]);
        enrichedTransaction.auditTrail = auditTrail;
      }

      // Get refund history if requested
      if (includeRefundHistory) {
        const refunds = await execute_sql(`
          SELECT 
            r.*,
            u.name as processed_by_name
          FROM pos_refunds r
          LEFT JOIN users u ON r.approved_by = u.id
          WHERE r.original_transaction_id = $1
          ORDER BY r.created_at DESC
        `, [transactionId]);
        enrichedTransaction.refunds = refunds;
      }

      // Get related transactions if requested
      if (includeRelatedTransactions) {
        const relatedTransactions = await execute_sql(`
          SELECT * FROM pos_transactions 
          WHERE (customer_id = $1 OR reference LIKE $2) 
          AND id != $3 
          AND tenant_id = $4
          ORDER BY created_at DESC
          LIMIT 10
        `, [transactionData.customer_id, `%${transactionData.reference}%`, transactionId, this.tenantId]);
        enrichedTransaction.relatedTransactions = relatedTransactions;
      }

      return {
        success: true,
        data: enrichedTransaction
      };

    } catch (error) {
      console.error('Get transaction details error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transaction details'
      };
    }
  }

  // Process refund with Nigerian business rules
  async processRefund(params: z.infer<typeof processRefundSchema>) {
    return await withTransaction(async () => {
      try {
        const validated = processRefundSchema.parse(params);
        const { 
          originalTransactionId, 
          refundType, 
          refundAmount, 
          refundItems, 
          refundReason, 
          notes, 
          cashierId,
          managerApproval,
          managerApprovalCode
        } = validated;

        // Get original transaction
        const originalTransaction = await execute_sql(`
          SELECT * FROM pos_transactions 
          WHERE id = $1 AND tenant_id = $2
        `, [originalTransactionId, this.tenantId]);

        if (!originalTransaction.length) {
          throw new Error('Original transaction not found');
        }

        const transaction = originalTransaction[0];

        // Check if transaction can be refunded
        if (transaction.payment_status === 'refunded') {
          throw new Error('Transaction has already been fully refunded');
        }

        if (transaction.payment_status === 'failed' || transaction.payment_status === 'cancelled') {
          throw new Error('Cannot refund failed or cancelled transaction');
        }

        // Calculate refund amount based on type
        let calculatedRefundAmount = 0;
        if (refundType === 'full') {
          calculatedRefundAmount = transaction.total;
        } else if (refundType === 'partial') {
          calculatedRefundAmount = refundAmount || 0;
        } else if (refundType === 'item_specific' && refundItems) {
          // Calculate based on specific items
          for (const item of refundItems) {
            const originalItem = await execute_sql(`
              SELECT * FROM pos_transaction_items 
              WHERE transaction_id = $1 AND product_id = $2
            `, [originalTransactionId, item.productId]);

            if (originalItem.length) {
              calculatedRefundAmount += originalItem[0].unit_price * item.quantity;
            }
          }
        }

        // Check refund policies
        const refundPolicy = this.getRefundPolicy(calculatedRefundAmount);
        if (refundPolicy.requiresApproval && !managerApproval) {
          throw new Error('Manager approval required for this refund amount');
        }

        // Validate manager approval code if provided
        if (managerApproval && managerApprovalCode) {
          const isValidCode = await this.validateManagerApprovalCode(managerApprovalCode, cashierId);
          if (!isValidCode) {
            throw new Error('Invalid manager approval code');
          }
        }

        // Check if refund amount exceeds remaining refundable amount
        const existingRefunds = await execute_sql(`
          SELECT COALESCE(SUM(refund_amount), 0) as total_refunded
          FROM pos_refunds 
          WHERE original_transaction_id = $1 AND status = 'processed'
        `, [originalTransactionId]);

        const totalRefunded = parseFloat(existingRefunds[0]?.total_refunded || '0');
        const remainingRefundable = transaction.total - totalRefunded;

        if (calculatedRefundAmount > remainingRefundable) {
          throw new Error(`Refund amount exceeds remaining refundable amount (${remainingRefundable})`);
        }

        // Create refund record
        const refundId = uuidv4();
        await execute_sql(`
          INSERT INTO pos_refunds (
            id, original_transaction_id, tenant_id, refund_type, refund_amount,
            refund_reason, notes, status, cashier_id, approved_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        `, [
          refundId,
          originalTransactionId,
          this.tenantId,
          refundType,
          calculatedRefundAmount,
          refundReason,
          notes,
          refundPolicy.requiresApproval ? 'pending' : 'processed',
          cashierId,
          managerApproval ? cashierId : null
        ]);

        // Create refund items if item-specific refund
        if (refundType === 'item_specific' && refundItems) {
          for (const item of refundItems) {
            await execute_sql(`
              INSERT INTO pos_refund_items (
                id, refund_id, product_id, variant_id, quantity, 
                unit_price, refund_amount, reason, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            `, [
              uuidv4(),
              refundId,
              item.productId,
              item.variantId || null,
              item.quantity,
              await this.getItemUnitPrice(originalTransactionId, item.productId),
              item.quantity * await this.getItemUnitPrice(originalTransactionId, item.productId),
              item.reason
            ]);
          }
        }

        // Update original transaction status
        const newStatus = (totalRefunded + calculatedRefundAmount) >= transaction.total 
          ? 'refunded' 
          : 'partially_refunded';

        await execute_sql(`
          UPDATE pos_transactions 
          SET payment_status = $1, updated_at = NOW()
          WHERE id = $2
        `, [newStatus, originalTransactionId]);

        // Process payment refund through payment gateway if needed
        if (!refundPolicy.requiresApproval) {
          await this.processPaymentRefund(transaction, calculatedRefundAmount);
        }

        // Create audit log
        await this.createAuditLog('refund_processed', {
          refund_id: refundId,
          original_transaction_id: originalTransactionId,
          refund_amount: calculatedRefundAmount,
          refund_type: refundType,
          refund_reason: refundReason
        }, cashierId);

        return {
          success: true,
          data: {
            refundId,
            refundAmount: calculatedRefundAmount,
            status: refundPolicy.requiresApproval ? 'pending_approval' : 'processed',
            reference: await this.generateRefundReference(refundId)
          }
        };

      } catch (error) {
        console.error('Process refund error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process refund'
        };
      }
    });
  }

  // Generate comprehensive sales analytics
  async getAnalytics(params: z.infer<typeof getAnalyticsSchema>) {
    try {
      const validated = getAnalyticsSchema.parse(params);
      const { analyticsType, timeframe, customDateRange, comparisonPeriod, granularity, topN } = validated;

      const dateRange = this.calculateDateRange(timeframe, customDateRange);

      switch (analyticsType) {
        case 'revenue_trends':
          return await this.getRevenueTrends(dateRange, granularity, comparisonPeriod);
        
        case 'product_performance':
          return await this.getProductPerformance(dateRange, topN);
        
        case 'cashier_performance':
          return await this.getCashierPerformance(dateRange, topN);
        
        case 'payment_methods':
          return await this.getPaymentMethodAnalytics(dateRange);
        
        case 'customer_behavior':
          return await this.getCustomerBehaviorAnalytics(dateRange);
        
        case 'tax_analysis':
          return await this.getTaxAnalytics(dateRange);
        
        case 'refund_analysis':
          return await this.getRefundAnalytics(dateRange);
        
        default:
          throw new Error(`Unsupported analytics type: ${analyticsType}`);
      }

    } catch (error) {
      console.error('Get analytics error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate analytics'
      };
    }
  }

  // Generate sales reports
  async generateSalesReport(params: z.infer<typeof generateSalesReportSchema>) {
    try {
      const validated = generateSalesReportSchema.parse(params);
      const { reportType, dateRange, groupBy, metrics, filters, format, currency } = validated;

      const reportData = await this.generateReportData(dateRange, groupBy, metrics, filters, currency);

      if (format === 'json') {
        return {
          success: true,
          data: reportData
        };
      }

      // Generate formatted reports for other formats
      const formattedReport = await this.formatReport(reportData, format, reportType);

      return {
        success: true,
        data: {
          report: formattedReport,
          downloadUrl: await this.uploadReportFile(formattedReport, format)
        }
      };

    } catch (error) {
      console.error('Generate sales report error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate sales report'
      };
    }
  }

  // Helper methods

  private getRefundPolicy(amount: number) {
    if (amount <= REFUND_POLICIES.same_day.maxAmount) {
      return REFUND_POLICIES.same_day;
    } else if (amount <= REFUND_POLICIES.weekly.maxAmount) {
      return REFUND_POLICIES.weekly;
    } else if (amount <= REFUND_POLICIES.monthly.maxAmount) {
      return REFUND_POLICIES.monthly;
    } else {
      return REFUND_POLICIES.manager_override;
    }
  }

  private async validateManagerApprovalCode(code: string, cashierId: string): Promise<boolean> {
    // Implement manager approval code validation logic
    // This could involve checking against a temporary code system or manager credentials
    return true; // Simplified for now
  }

  private async getItemUnitPrice(transactionId: string, productId: string): Promise<number> {
    const item = await execute_sql(`
      SELECT unit_price FROM pos_transaction_items 
      WHERE transaction_id = $1 AND product_id = $2
    `, [transactionId, productId]);
    
    return item.length ? parseFloat(item[0].unit_price) : 0;
  }

  private async processPaymentRefund(transaction: any, refundAmount: number) {
    // Implement payment gateway refund processing
    // This would integrate with Paystack, Flutterwave, etc.
    console.log(`Processing payment refund for transaction ${transaction.id}: ${refundAmount}`);
  }

  private async generateRefundReference(refundId: string): Promise<string> {
    return `REF-${Date.now()}-${refundId.substr(0, 8).toUpperCase()}`;
  }

  private async createAuditLog(action: string, details: any, userId: string) {
    await execute_sql(`
      INSERT INTO audit_logs (
        id, tenant_id, user_id, event_type, event_action, 
        resource_type, resource_id, event_details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      uuidv4(),
      this.tenantId,
      userId,
      'transaction_history',
      action,
      'transaction',
      details.original_transaction_id || details.transaction_id,
      JSON.stringify(details)
    ]);
  }

  private calculateDateRange(timeframe: string, customDateRange?: any) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeframe) {
      case 'today':
        return { startDate: today, endDate: now };
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: yesterday, endDate: today };
      case 'last_7_days':
        const last7Days = new Date(today);
        last7Days.setDate(last7Days.getDate() - 7);
        return { startDate: last7Days, endDate: now };
      case 'last_30_days':
        const last30Days = new Date(today);
        last30Days.setDate(last30Days.getDate() - 30);
        return { startDate: last30Days, endDate: now };
      case 'last_90_days':
        const last90Days = new Date(today);
        last90Days.setDate(last90Days.getDate() - 90);
        return { startDate: last90Days, endDate: now };
      case 'last_year':
        const lastYear = new Date(today);
        lastYear.setFullYear(lastYear.getFullYear() - 1);
        return { startDate: lastYear, endDate: now };
      case 'custom':
        return {
          startDate: new Date(customDateRange?.startDate),
          endDate: new Date(customDateRange?.endDate)
        };
      default:
        return { startDate: today, endDate: now };
    }
  }

  private async getRevenueTrends(dateRange: any, granularity: string, comparisonPeriod: boolean) {
    // Implement revenue trends analytics
    const trends = await execute_sql(`
      SELECT 
        DATE_TRUNC($1, created_at) as period,
        COUNT(*) as transaction_count,
        SUM(total) as revenue,
        AVG(total) as average_transaction_value
      FROM pos_transactions 
      WHERE tenant_id = $2 
      AND created_at >= $3 
      AND created_at <= $4
      AND payment_status = 'completed'
      GROUP BY DATE_TRUNC($1, created_at)
      ORDER BY period
    `, [granularity, this.tenantId, dateRange.startDate, dateRange.endDate]);

    return {
      success: true,
      data: { trends }
    };
  }

  private async getProductPerformance(dateRange: any, topN: number) {
    // Implement product performance analytics
    const performance = await execute_sql(`
      SELECT 
        pti.product_id,
        p.name as product_name,
        p.sku,
        SUM(pti.quantity) as quantity_sold,
        SUM(pti.line_total) as revenue,
        COUNT(DISTINCT pti.transaction_id) as transaction_count
      FROM pos_transaction_items pti
      JOIN pos_transactions pt ON pti.transaction_id = pt.id
      JOIN products p ON pti.product_id = p.id
      WHERE pt.tenant_id = $1 
      AND pt.created_at >= $2 
      AND pt.created_at <= $3
      AND pt.payment_status = 'completed'
      GROUP BY pti.product_id, p.name, p.sku
      ORDER BY revenue DESC
      LIMIT $4
    `, [this.tenantId, dateRange.startDate, dateRange.endDate, topN]);

    return {
      success: true,
      data: { topProducts: performance }
    };
  }

  private async getCashierPerformance(dateRange: any, topN: number) {
    // Implement cashier performance analytics
    const performance = await execute_sql(`
      SELECT 
        pt.cashier_id,
        u.name as cashier_name,
        COUNT(*) as transaction_count,
        SUM(pt.total) as total_revenue,
        AVG(pt.total) as average_transaction_value
      FROM pos_transactions pt
      JOIN users u ON pt.cashier_id = u.id
      WHERE pt.tenant_id = $1 
      AND pt.created_at >= $2 
      AND pt.created_at <= $3
      AND pt.payment_status = 'completed'
      GROUP BY pt.cashier_id, u.name
      ORDER BY total_revenue DESC
      LIMIT $4
    `, [this.tenantId, dateRange.startDate, dateRange.endDate, topN]);

    return {
      success: true,
      data: { cashierPerformance: performance }
    };
  }

  private async getPaymentMethodAnalytics(dateRange: any) {
    // Implement payment method analytics
    const analytics = await execute_sql(`
      SELECT 
        ptp.method,
        COUNT(*) as count,
        SUM(ptp.amount) as total_amount
      FROM pos_transaction_payments ptp
      JOIN pos_transactions pt ON ptp.transaction_id = pt.id
      WHERE pt.tenant_id = $1 
      AND pt.created_at >= $2 
      AND pt.created_at <= $3
      AND pt.payment_status = 'completed'
      GROUP BY ptp.method
      ORDER BY total_amount DESC
    `, [this.tenantId, dateRange.startDate, dateRange.endDate]);

    return {
      success: true,
      data: { paymentMethods: analytics }
    };
  }

  private async getCustomerBehaviorAnalytics(dateRange: any) {
    // Implement customer behavior analytics
    const behavior = await execute_sql(`
      SELECT 
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(*) as total_transactions,
        AVG(total) as average_order_value,
        SUM(total) as total_revenue
      FROM pos_transactions 
      WHERE tenant_id = $1 
      AND created_at >= $2 
      AND created_at <= $3
      AND payment_status = 'completed'
    `, [this.tenantId, dateRange.startDate, dateRange.endDate]);

    return {
      success: true,
      data: { customerBehavior: behavior[0] }
    };
  }

  private async getTaxAnalytics(dateRange: any) {
    // Implement tax analytics
    const taxAnalytics = await execute_sql(`
      SELECT 
        ptt.type as tax_type,
        SUM(ptt.amount) as total_tax_collected,
        AVG(ptt.rate) as average_tax_rate
      FROM pos_transaction_taxes ptt
      JOIN pos_transactions pt ON ptt.transaction_id = pt.id
      WHERE pt.tenant_id = $1 
      AND pt.created_at >= $2 
      AND pt.created_at <= $3
      AND pt.payment_status = 'completed'
      GROUP BY ptt.type
      ORDER BY total_tax_collected DESC
    `, [this.tenantId, dateRange.startDate, dateRange.endDate]);

    return {
      success: true,
      data: { taxBreakdown: taxAnalytics }
    };
  }

  private async getRefundAnalytics(dateRange: any) {
    // Implement refund analytics
    const refundAnalytics = await execute_sql(`
      SELECT 
        COUNT(*) as total_refunds,
        SUM(refund_amount) as total_refund_amount,
        AVG(refund_amount) as average_refund_amount,
        refund_reason,
        COUNT(*) as refund_count
      FROM pos_refunds 
      WHERE tenant_id = $1 
      AND created_at >= $2 
      AND created_at <= $3
      AND status = 'processed'
      GROUP BY refund_reason
      ORDER BY refund_count DESC
    `, [this.tenantId, dateRange.startDate, dateRange.endDate]);

    return {
      success: true,
      data: { refundAnalytics }
    };
  }

  private async generateReportData(dateRange: any, groupBy?: string[], metrics?: string[], filters?: any, currency?: string) {
    // Implement comprehensive report data generation
    // This would create detailed reports based on the specified parameters
    return {
      summary: {
        totalRevenue: 0,
        totalTransactions: 0,
        averageTransactionValue: 0
      },
      details: [],
      filters: filters,
      dateRange: dateRange,
      currency: currency || 'NGN'
    };
  }

  private async formatReport(data: any, format: string, reportType: string) {
    // Implement report formatting for different output formats
    switch (format) {
      case 'pdf':
        return await this.generatePDFReport(data, reportType);
      case 'excel':
        return await this.generateExcelReport(data, reportType);
      case 'csv':
        return await this.generateCSVReport(data, reportType);
      default:
        return data;
    }
  }

  private async generatePDFReport(data: any, reportType: string) {
    // Implement PDF report generation
    return { format: 'pdf', data: 'PDF content would be generated here' };
  }

  private async generateExcelReport(data: any, reportType: string) {
    // Implement Excel report generation
    return { format: 'excel', data: 'Excel content would be generated here' };
  }

  private async generateCSVReport(data: any, reportType: string) {
    // Implement CSV report generation
    return { format: 'csv', data: 'CSV content would be generated here' };
  }

  private async uploadReportFile(reportData: any, format: string): Promise<string> {
    // Implement file upload to storage service
    return `https://storage.example.com/reports/report_${Date.now()}.${format}`;
  }
}

// Export the main function for API integration
export async function transactionHistoryCell(action: string, params: any, tenantId: string) {
  const cell = new TransactionHistoryCell(tenantId);

  switch (action) {
    case 'getTransactionHistory':
      return await cell.getTransactionHistory(params);
    
    case 'getTransactionDetails':
      return await cell.getTransactionDetails(params);
    
    case 'processRefund':
      return await cell.processRefund(params);
    
    case 'generateSalesReport':
      return await cell.generateSalesReport(params);
    
    case 'getAnalytics':
      return await cell.getAnalytics(params);
    
    default:
      return {
        success: false,
        error: `Unsupported action: ${action}`
      };
  }
}