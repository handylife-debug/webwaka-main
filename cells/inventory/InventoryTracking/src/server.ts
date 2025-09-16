import { execute_sql } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';

// Types for InventoryTracking operations
export interface StockLevel {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
  costPerUnit: number;
  totalValue: number;
  lastUpdated: string;
  lastMovementId?: string;
  batchNumbers?: string[];
  expiryDates?: string[];
  serialNumbers?: string[]; // POS-102 Enhancement: Advanced serial tracking
  lotNumbers?: string[]; // POS-102 Enhancement: Advanced lot tracking
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  movementType: 'in' | 'out' | 'adjustment' | 'transfer' | 'return' | 'loss';
  movementReason: 'sale' | 'purchase' | 'adjustment' | 'transfer' | 'return' | 'damaged' | 'expired' | 'theft' | 'recount';
  referenceType?: 'sale' | 'purchase_order' | 'adjustment' | 'transfer' | 'audit';
  referenceId?: string;
  quantityBefore: number;
  quantityChanged: number;
  quantityAfter: number;
  costPerUnit: number;
  totalValue: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumbers?: string[]; // POS-102 Enhancement: Serial tracking per movement
  lotNumber?: string; // POS-102 Enhancement: Lot tracking per movement
  notes?: string;
  performedBy: string;
  createdAt: string;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  transferReason: 'restock' | 'rebalance' | 'customer_request' | 'expired' | 'damaged' | 'seasonal';
  status: 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled' | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expectedArrival?: string;
  actualArrival?: string;
  notes?: string;
  requestedBy: string;
  approvedBy?: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockReservation {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  quantity: number;
  reservationType: 'sale' | 'transfer' | 'hold' | 'inspection' | 'return';
  referenceId?: string;
  reservationExpiry?: string;
  status: 'active' | 'expired' | 'released' | 'fulfilled';
  notes?: string;
  reservedBy: string;
  releasedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockAdjustment {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  currentStock: number;
  adjustedStock: number;
  adjustmentQuantity: number;
  adjustmentReason: 'count_correction' | 'damaged' | 'expired' | 'theft' | 'found' | 'system_error' | 'audit';
  notes?: string;
  evidence?: string;
  status: 'pending' | 'approved' | 'rejected';
  performedBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockAudit {
  id: string;
  tenantId: string;
  locationId: string;
  auditType: 'full' | 'cycle' | 'spot' | 'category';
  categoryId?: string;
  auditReason: 'scheduled' | 'discrepancy' | 'loss' | 'compliance' | 'period_end';
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  plannedDate: string;
  startedDate?: string;
  completedDate?: string;
  assignedTo: string;
  completedBy?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  totalItems: number;
  completedItems: number;
  discrepancies: number;
  totalDiscrepancyValue: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditItem {
  id: string;
  auditId: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  expectedCount: number;
  actualCount: number;
  discrepancy: number;
  discrepancyValue: number;
  notes?: string;
  countedBy?: string;
  countedAt?: string;
  createdAt: string;
}

export interface LowStockAlert {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  productName: string;
  variantName?: string;
  locationName: string;
  currentStock: number;
  minStockLevel: number;
  reorderPoint: number;
  recommendedReorderQuantity: number;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'acknowledged' | 'resolved';
  alertDate: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface ReorderSuggestion {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  productName: string;
  currentStock: number;
  reorderPoint: number;
  recommendedQuantity: number;
  avgDailySales: number;
  leadTimeDays: number;
  seasonalFactor: number;
  priority: 'critical' | 'urgent' | 'normal';
  estimatedCost: number;
  supplierInfo?: string;
  lastOrderDate?: string;
  generatedAt: string;
}

// POS-102 Enhancement: Advanced Serial Number Tracking Interface
export interface SerialNumberRecord {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  serialNumber: string;
  status: 'available' | 'sold' | 'reserved' | 'damaged' | 'returned' | 'warranty';
  batchNumber?: string;
  lotNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  warrantyPeriod?: number; // days
  supplierInfo?: {
    supplierId: string;
    supplierLotNumber?: string;
    receiptDate: string;
  };
  saleInfo?: {
    saleId: string;
    soldDate: string;
    customerId?: string;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// POS-102 Enhancement: Advanced Lot Tracking Interface
export interface LotRecord {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  lotNumber: string;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  initialQuantity: number;
  currentQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  lossQuantity: number;
  unitCost: number;
  totalValue: number;
  supplierInfo?: {
    supplierId: string;
    supplierLotNumber?: string;
    receiptDate: string;
    certificateNumber?: string;
  };
  qualityInfo?: {
    inspectionDate?: string;
    inspectedBy?: string;
    qualityStatus: 'approved' | 'rejected' | 'pending' | 'quarantine';
    testResults?: Record<string, any>;
  };
  locations: Array<{
    locationId: string;
    quantity: number;
    lastMovement: string;
  }>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryValuation {
  tenantId: string;
  locationId?: string;
  categoryId?: string;
  totalItems: number;
  totalQuantity: number;
  fifoValue: number;
  lifoValue: number;
  weightedAverageValue: number;
  standardCostValue: number;
  currentMarketValue: number;
  valuationDate: string;
  breakdown: {
    categoryId: string;
    categoryName: string;
    quantity: number;
    value: number;
    percentage: number;
  }[];
}

// Input validation schemas
const updateStockLevelSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  quantity: z.number().int(),
  movement_type: z.enum(['in', 'out', 'adjustment', 'transfer', 'return', 'loss']),
  movement_reason: z.enum(['sale', 'purchase', 'adjustment', 'transfer', 'return', 'damaged', 'expired', 'theft', 'recount']),
  reference_type: z.enum(['sale', 'purchase_order', 'adjustment', 'transfer', 'audit']).optional(),
  reference_id: z.string().optional(),
  cost_per_unit: z.number().min(0).default(0),
  notes: z.string().optional(),
  batch_number: z.string().optional(),
  expiry_date: z.string().optional(),
  performed_by: z.string().uuid()
});

const transferStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().int().min(1),
  transferReason: z.enum(['restock', 'rebalance', 'customer_request', 'expired', 'damaged', 'seasonal']),
  expectedArrival: z.string().optional(),
  notes: z.string().optional(),
  requestedBy: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium')
});

const stockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  currentStock: z.number().int().min(0),
  adjustedStock: z.number().int().min(0),
  adjustmentReason: z.enum(['count_correction', 'damaged', 'expired', 'theft', 'found', 'system_error', 'audit']),
  notes: z.string().optional(),
  evidence: z.string().optional(),
  performedBy: z.string().uuid(),
  approvedBy: z.string().uuid().optional()
});

const stockAuditSchema = z.object({
  locationId: z.string().uuid(),
  auditType: z.enum(['full', 'cycle', 'spot', 'category']).default('cycle'),
  categoryId: z.string().uuid().optional(),
  plannedDate: z.string(),
  auditReason: z.enum(['scheduled', 'discrepancy', 'loss', 'compliance', 'period_end']),
  assignedTo: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  products: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    expected_count: z.number().int().min(0),
    actual_count: z.number().int().min(0),
    notes: z.string().optional()
  })).optional()
});

const reserveStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  quantity: z.number().int().min(1),
  reservationType: z.enum(['sale', 'transfer', 'hold', 'inspection', 'return']),
  referenceId: z.string().optional(),
  reservationExpiry: z.string().optional(),
  notes: z.string().optional(),
  reservedBy: z.string().uuid()
});

// Nigerian business constants
const NIGERIAN_BUSINESS_UNITS = {
  'piece': { name: 'Piece', abbreviation: 'pcs', isBase: true },
  'dozen': { name: 'Dozen', abbreviation: 'dz', conversionRate: 12 },
  'carton': { name: 'Carton', abbreviation: 'ctn', conversionRate: 24 },
  'bag': { name: 'Bag', abbreviation: 'bag', conversionRate: 50 },
  'sack': { name: 'Sack', abbreviation: 'sack', conversionRate: 100 },
  'kilogram': { name: 'Kilogram', abbreviation: 'kg', isBase: true },
  'gram': { name: 'Gram', abbreviation: 'g', conversionRate: 0.001 },
  'ton': { name: 'Ton', abbreviation: 't', conversionRate: 1000 },
  'liter': { name: 'Liter', abbreviation: 'l', isBase: true },
  'milliliter': { name: 'Milliliter', abbreviation: 'ml', conversionRate: 0.001 }
};

export const inventoryTrackingCell = {
  // ========================================
  // STOCK LEVEL MANAGEMENT
  // ========================================

  /**
   * Update stock level with comprehensive movement tracking
   */
  async updateStockLevel(input: unknown, tenantId: string): Promise<{ success: boolean; movement?: StockMovement; stockLevel?: StockLevel; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = updateStockLevelSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const stockData = validationResult.data;

        // Begin transaction
        const movementId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Get current stock level
        const currentStockResult = await execute_sql(
          `SELECT * FROM inventory_stock_levels 
           WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3 
           AND ($4::uuid IS NULL OR variant_id = $4)`,
          [tenantId, stockData.productId, stockData.locationId, stockData.variantId]
        );

        let currentStock = 0;
        let currentReserved = 0;
        let stockLevelId = '';

        if (currentStockResult.rows.length > 0) {
          const row = currentStockResult.rows[0];
          currentStock = row.available_quantity;
          currentReserved = row.reserved_quantity;
          stockLevelId = row.id;
        } else {
          // Create new stock level record
          stockLevelId = crypto.randomUUID();
          await execute_sql(
            `INSERT INTO inventory_stock_levels (
              id, tenant_id, product_id, variant_id, location_id, 
              available_quantity, reserved_quantity, total_quantity, 
              cost_per_unit, total_value, last_updated, last_movement_id
            ) VALUES ($1, $2, $3, $4, $5, 0, 0, 0, $6, 0, $7, $8)`,
            [
              stockLevelId, tenantId, stockData.productId, stockData.variantId, 
              stockData.locationId, stockData.cost_per_unit, now, movementId
            ]
          );
        }

        // Calculate new stock levels
        let newStock = currentStock;
        let quantityChanged = stockData.quantity;

        if (stockData.movement_type === 'in') {
          newStock = currentStock + Math.abs(quantityChanged);
        } else if (stockData.movement_type === 'out') {
          quantityChanged = -Math.abs(quantityChanged);
          newStock = Math.max(0, currentStock + quantityChanged);
        } else if (stockData.movement_type === 'adjustment') {
          quantityChanged = stockData.quantity - currentStock;
          newStock = Math.max(0, stockData.quantity);
        }

        // Validate sufficient stock for outbound movements
        if ((stockData.movement_type === 'out' || stockData.movement_type === 'transfer') && newStock < 0) {
          return {
            success: false,
            message: 'Insufficient stock',
            error: `Cannot reduce stock by ${Math.abs(quantityChanged)} units. Current available: ${currentStock}`
          };
        }

        // Create stock movement record
        await execute_sql(
          `INSERT INTO inventory_stock_movements (
            id, tenant_id, product_id, variant_id, location_id, 
            movement_type, movement_reason, reference_type, reference_id,
            quantity_before, quantity_changed, quantity_after, 
            cost_per_unit, total_value, batch_number, expiry_date, 
            notes, performed_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            movementId, tenantId, stockData.productId, stockData.variantId, stockData.locationId,
            stockData.movement_type, stockData.movement_reason, stockData.reference_type, stockData.reference_id,
            currentStock, quantityChanged, newStock,
            stockData.cost_per_unit, Math.abs(quantityChanged) * stockData.cost_per_unit,
            stockData.batch_number, stockData.expiry_date, stockData.notes, stockData.performed_by, now
          ]
        );

        // Update stock level
        const totalQuantity = newStock + currentReserved;
        const totalValue = newStock * stockData.cost_per_unit;

        await execute_sql(
          `UPDATE inventory_stock_levels SET
            available_quantity = $1,
            total_quantity = $2,
            cost_per_unit = $3,
            total_value = $4,
            last_updated = $5,
            last_movement_id = $6
           WHERE id = $7`,
          [newStock, totalQuantity, stockData.cost_per_unit, totalValue, now, movementId, stockLevelId]
        );

        // Clear cache
        await this.invalidateStockCache(tenantId, stockData.locationId, stockData.productId);

        // Create low stock alert if necessary
        await this.checkAndCreateLowStockAlert(tenantId, stockData.productId, stockData.variantId, stockData.locationId, newStock);

        console.log(`[InventoryTracking] Stock updated for product ${stockData.productId} at location ${stockData.locationId}: ${currentStock} -> ${newStock}`);

        return {
          success: true,
          movement: {
            id: movementId,
            tenantId,
            productId: stockData.productId,
            variantId: stockData.variantId,
            locationId: stockData.locationId,
            movementType: stockData.movement_type,
            movementReason: stockData.movement_reason,
            referenceType: stockData.reference_type,
            referenceId: stockData.reference_id,
            quantityBefore: currentStock,
            quantityChanged,
            quantityAfter: newStock,
            costPerUnit: stockData.cost_per_unit,
            totalValue: Math.abs(quantityChanged) * stockData.cost_per_unit,
            batchNumber: stockData.batch_number,
            expiryDate: stockData.expiry_date,
            notes: stockData.notes,
            performedBy: stockData.performed_by,
            createdAt: now
          },
          stockLevel: {
            id: stockLevelId,
            tenantId,
            productId: stockData.productId,
            variantId: stockData.variantId,
            locationId: stockData.locationId,
            availableQuantity: newStock,
            reservedQuantity: currentReserved,
            totalQuantity: totalQuantity,
            costPerUnit: stockData.cost_per_unit,
            totalValue,
            lastUpdated: now,
            lastMovementId: movementId
          },
          message: 'Stock level updated successfully'
        };
      },
      {
        success: false,
        message: 'Stock update service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get stock levels with advanced filtering
   */
  async getStockLevels(input: unknown, tenantId: string): Promise<{ success: boolean; stockLevels?: StockLevel[]; pagination?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          locationId,
          productId,
          categoryId,
          includeReserved = true,
          lowStockOnly = false,
          limit = 100,
          offset = 0
        } = input as any;

        // Build dynamic WHERE clause
        const whereConditions = ['s.tenant_id = $1'];
        const queryParams = [tenantId];
        let paramCounter = 2;

        if (locationId) {
          whereConditions.push(`s.location_id = $${paramCounter}`);
          queryParams.push(locationId);
          paramCounter++;
        }

        if (productId) {
          whereConditions.push(`s.product_id = $${paramCounter}`);
          queryParams.push(productId);
          paramCounter++;
        }

        if (categoryId) {
          whereConditions.push(`p.category_id = $${paramCounter}`);
          queryParams.push(categoryId);
          paramCounter++;
        }

        if (lowStockOnly) {
          whereConditions.push('s.available_quantity <= p.reorder_point');
        }

        if (!includeReserved) {
          whereConditions.push('s.reserved_quantity = 0');
        }

        // Count query
        const countQuery = `
          SELECT COUNT(*) as total
          FROM inventory_stock_levels s
          JOIN inventory_products p ON s.product_id = p.id
          WHERE ${whereConditions.join(' AND ')}
        `;

        const countResult = await execute_sql(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query with pagination
        const dataQuery = `
          SELECT 
            s.*,
            p.product_name,
            p.sku,
            p.reorder_point,
            p.min_stock_level,
            pv.variant_name,
            l.location_name
          FROM inventory_stock_levels s
          JOIN inventory_products p ON s.product_id = p.id
          LEFT JOIN product_variants pv ON s.variant_id = pv.id
          LEFT JOIN locations l ON s.location_id = l.id
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY s.last_updated DESC, p.product_name ASC
          LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        queryParams.push(limit, offset);

        const dataResult = await execute_sql(dataQuery, queryParams);

        const stockLevels = dataResult.rows.map((row: any) => ({
          id: row.id,
          tenantId: row.tenant_id,
          productId: row.product_id,
          variantId: row.variant_id,
          locationId: row.location_id,
          availableQuantity: row.available_quantity,
          reservedQuantity: row.reserved_quantity,
          totalQuantity: row.total_quantity,
          costPerUnit: parseFloat(row.cost_per_unit || 0),
          totalValue: parseFloat(row.total_value || 0),
          lastUpdated: row.last_updated,
          lastMovementId: row.last_movement_id,
          // Additional enriched data
          productName: row.product_name,
          sku: row.sku,
          variantName: row.variant_name,
          locationName: row.location_name,
          reorderPoint: row.reorder_point,
          minStockLevel: row.min_stock_level,
          isLowStock: row.available_quantity <= row.reorder_point
        }));

        return {
          success: true,
          stockLevels,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          },
          message: `Found ${stockLevels.length} stock levels`
        };
      },
      {
        success: false as const,
        stockLevels: [] as StockLevel[],
        pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        message: 'Stock levels service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Transfer stock between locations with approval workflow
   */
  async transferStock(input: unknown, tenantId: string): Promise<{ success: boolean; transfer?: StockTransfer; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = transferStockSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const transferData = validationResult.data;

        // Validate locations exist and belong to tenant
        const locationCheck = await execute_sql(
          'SELECT id FROM locations WHERE tenant_id = $1 AND id IN ($2, $3)',
          [tenantId, transferData.fromLocationId, transferData.toLocationId]
        );

        if (locationCheck.rows.length !== 2) {
          return {
            success: false,
            message: 'Invalid location references',
            error: 'One or both locations do not exist or access denied'
          };
        }

        // Check stock availability at source location
        const stockCheck = await execute_sql(
          `SELECT available_quantity FROM inventory_stock_levels 
           WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3 
           AND ($4::uuid IS NULL OR variant_id = $4)`,
          [tenantId, transferData.productId, transferData.fromLocationId, transferData.variantId]
        );

        if (stockCheck.rows.length === 0 || stockCheck.rows[0].available_quantity < transferData.quantity) {
          return {
            success: false,
            message: 'Insufficient stock',
            error: `Not enough stock available for transfer. Required: ${transferData.quantity}, Available: ${stockCheck.rows[0]?.available_quantity || 0}`
          };
        }

        const transferId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Create transfer request
        await execute_sql(
          `INSERT INTO inventory_stock_transfers (
            id, tenant_id, product_id, variant_id, from_location_id, to_location_id,
            quantity, transfer_reason, status, priority, expected_arrival, 
            notes, requested_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            transferId, tenantId, transferData.productId, transferData.variantId,
            transferData.fromLocationId, transferData.toLocationId, transferData.quantity,
            transferData.transferReason, 'pending', transferData.priority,
            transferData.expectedArrival, transferData.notes, transferData.requestedBy, now, now
          ]
        );

        // Auto-approve low-priority transfers under certain conditions
        let status = 'pending';
        if (transferData.priority === 'low' && transferData.quantity <= 10) {
          await execute_sql(
            'UPDATE inventory_stock_transfers SET status = $1, approved_by = $2 WHERE id = $3',
            ['approved', transferData.requestedBy, transferId]
          );
          status = 'approved';
        }

        console.log(`[InventoryTracking] Stock transfer requested: ${transferData.quantity} units from ${transferData.fromLocationId} to ${transferData.toLocationId}`);

        return {
          success: true,
          transfer: {
            id: transferId,
            tenantId,
            productId: transferData.productId,
            variantId: transferData.variantId,
            fromLocationId: transferData.fromLocationId,
            toLocationId: transferData.toLocationId,
            quantity: transferData.quantity,
            transferReason: transferData.transferReason,
            status: status as any,
            priority: transferData.priority,
            expectedArrival: transferData.expectedArrival,
            notes: transferData.notes,
            requestedBy: transferData.requestedBy,
            createdAt: now,
            updatedAt: now
          },
          message: status === 'approved' ? 'Transfer request created and auto-approved' : 'Transfer request created successfully'
        };
      },
      {
        success: false,
        message: 'Stock transfer service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Perform stock adjustment with audit trail
   */
  async stockAdjustment(input: unknown, tenantId: string): Promise<{ success: boolean; adjustment?: StockAdjustment; movement?: StockMovement; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = stockAdjustmentSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const adjustmentData = validationResult.data;

        // Verify current stock level matches expected
        const stockCheck = await execute_sql(
          `SELECT * FROM inventory_stock_levels 
           WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3 
           AND ($4::uuid IS NULL OR variant_id = $4)`,
          [tenantId, adjustmentData.productId, adjustmentData.locationId, adjustmentData.variantId]
        );

        if (stockCheck.rows.length === 0) {
          return {
            success: false,
            message: 'Stock level not found',
            error: 'No stock record exists for this product at the specified location'
          };
        }

        const currentStockInSystem = stockCheck.rows[0].available_quantity;

        // Allow small discrepancies (1 unit) automatically, require approval for larger ones
        const discrepancy = Math.abs(currentStockInSystem - adjustmentData.currentStock);
        let requiresApproval = discrepancy > 1 || Math.abs(adjustmentData.adjustedStock - adjustmentData.currentStock) > 10;

        const adjustmentId = crypto.randomUUID();
        const adjustmentQuantity = adjustmentData.adjustedStock - adjustmentData.currentStock;
        const now = new Date().toISOString();

        // Create adjustment record
        const status = requiresApproval && !adjustmentData.approvedBy ? 'pending' : 'approved';
        
        await execute_sql(
          `INSERT INTO inventory_stock_adjustments (
            id, tenant_id, product_id, variant_id, location_id,
            current_stock, adjusted_stock, adjustment_quantity, adjustment_reason,
            notes, evidence, status, performed_by, approved_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            adjustmentId, tenantId, adjustmentData.productId, adjustmentData.variantId, 
            adjustmentData.locationId, adjustmentData.currentStock, adjustmentData.adjustedStock,
            adjustmentQuantity, adjustmentData.adjustmentReason, adjustmentData.notes,
            adjustmentData.evidence, status, adjustmentData.performedBy, adjustmentData.approvedBy,
            now, now
          ]
        );

        let movement: StockMovement | undefined;

        // If approved, create stock movement and update stock level
        if (status === 'approved') {
          // Update stock through the stock movement system
          const stockUpdateResult = await this.updateStockLevel({
            productId: adjustmentData.productId,
            variantId: adjustmentData.variantId,
            locationId: adjustmentData.locationId,
            quantity: adjustmentData.adjustedStock,
            movement_type: 'adjustment',
            movement_reason: 'adjustment',
            reference_type: 'adjustment',
            reference_id: adjustmentId,
            notes: `Stock adjustment: ${adjustmentData.adjustmentReason}`,
            performed_by: adjustmentData.performedBy
          }, tenantId);

          if (stockUpdateResult.success && stockUpdateResult.movement) {
            movement = stockUpdateResult.movement;
          }
        }

        console.log(`[InventoryTracking] Stock adjustment ${status}: ${adjustmentData.currentStock} -> ${adjustmentData.adjustedStock} (${adjustmentQuantity >= 0 ? '+' : ''}${adjustmentQuantity})`);

        return {
          success: true,
          adjustment: {
            id: adjustmentId,
            tenantId,
            productId: adjustmentData.productId,
            variantId: adjustmentData.variantId,
            locationId: adjustmentData.locationId,
            currentStock: adjustmentData.currentStock,
            adjustedStock: adjustmentData.adjustedStock,
            adjustmentQuantity,
            adjustmentReason: adjustmentData.adjustmentReason,
            notes: adjustmentData.notes,
            evidence: adjustmentData.evidence,
            status: status as any,
            performedBy: adjustmentData.performedBy,
            approvedBy: adjustmentData.approvedBy,
            createdAt: now,
            updatedAt: now
          },
          movement,
          message: status === 'approved' ? 'Stock adjustment completed successfully' : 'Stock adjustment created and awaiting approval'
        };
      },
      {
        success: false,
        message: 'Stock adjustment service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Create and manage stock audits
   */
  async stockAudit(input: unknown, tenantId: string): Promise<{ success: boolean; audit?: StockAudit; auditItems?: AuditItem[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = stockAuditSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const auditData = validationResult.data;
        const auditId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Get products to audit based on criteria
        let productsToAudit = auditData.products || [];

        if (productsToAudit.length === 0) {
          // Generate audit items based on audit type
          let productQuery = `
            SELECT s.product_id, s.variant_id, s.available_quantity, p.product_name
            FROM inventory_stock_levels s
            JOIN inventory_products p ON s.product_id = p.id
            WHERE s.tenant_id = $1 AND s.location_id = $2
          `;
          const queryParams = [tenantId, auditData.locationId];

          if (auditData.auditType === 'category' && auditData.categoryId) {
            productQuery += ' AND p.category_id = $3';
            queryParams.push(auditData.categoryId);
          } else if (auditData.auditType === 'spot') {
            productQuery += ' AND s.available_quantity <= p.reorder_point';
          }

          productQuery += ' ORDER BY p.product_name ASC LIMIT 1000';

          const productsResult = await execute_sql(productQuery, queryParams);

          productsToAudit = productsResult.rows.map((row: any) => ({
            productId: row.product_id,
            variantId: row.variant_id,
            expected_count: row.available_quantity,
            actual_count: row.available_quantity, // Default to expected, will be updated during audit
            notes: ''
          }));
        }

        // Create audit record
        await execute_sql(
          `INSERT INTO inventory_stock_audits (
            id, tenant_id, location_id, audit_type, category_id, audit_reason,
            status, planned_date, assigned_to, priority, total_items,
            completed_items, discrepancies, total_discrepancy_value, 
            notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            auditId, tenantId, auditData.locationId, auditData.auditType, auditData.categoryId,
            auditData.auditReason, 'planned', auditData.plannedDate, auditData.assignedTo,
            auditData.priority, productsToAudit.length, 0, 0, 0, '', now, now
          ]
        );

        // Create audit items
        const auditItems: AuditItem[] = [];
        for (const product of productsToAudit) {
          const auditItemId = crypto.randomUUID();
          const discrepancy = product.actual_count - product.expected_count;
          
          await execute_sql(
            `INSERT INTO inventory_audit_items (
              id, audit_id, tenant_id, product_id, variant_id, 
              expected_count, actual_count, discrepancy, discrepancy_value,
              notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              auditItemId, auditId, tenantId, product.productId, product.variantId,
              product.expected_count, product.actual_count, discrepancy, 0,
              product.notes, now
            ]
          );

          auditItems.push({
            id: auditItemId,
            auditId,
            tenantId,
            productId: product.productId,
            variantId: product.variantId,
            expectedCount: product.expected_count,
            actualCount: product.actual_count,
            discrepancy,
            discrepancyValue: 0,
            notes: product.notes,
            createdAt: now
          });
        }

        console.log(`[InventoryTracking] Stock audit created: ${auditData.auditType} audit for location ${auditData.locationId} with ${productsToAudit.length} items`);

        return {
          success: true,
          audit: {
            id: auditId,
            tenantId,
            locationId: auditData.locationId,
            auditType: auditData.auditType,
            categoryId: auditData.categoryId,
            auditReason: auditData.auditReason,
            status: 'planned',
            plannedDate: auditData.plannedDate,
            assignedTo: auditData.assignedTo,
            priority: auditData.priority,
            totalItems: productsToAudit.length,
            completedItems: 0,
            discrepancies: 0,
            totalDiscrepancyValue: 0,
            createdAt: now,
            updatedAt: now
          },
          auditItems,
          message: 'Stock audit created successfully'
        };
      },
      {
        success: false,
        message: 'Stock audit service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Reserve stock for sales or other purposes
   */
  async reserveStock(input: unknown, tenantId: string): Promise<{ success: boolean; reservation?: StockReservation; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = reserveStockSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const reservationData = validationResult.data;

        // Check stock availability
        const stockCheck = await execute_sql(
          `SELECT available_quantity FROM inventory_stock_levels 
           WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3 
           AND ($4::uuid IS NULL OR variant_id = $4)`,
          [tenantId, reservationData.productId, reservationData.locationId, reservationData.variantId]
        );

        if (stockCheck.rows.length === 0 || stockCheck.rows[0].available_quantity < reservationData.quantity) {
          return {
            success: false,
            message: 'Insufficient stock',
            error: `Not enough stock available for reservation. Required: ${reservationData.quantity}, Available: ${stockCheck.rows[0]?.available_quantity || 0}`
          };
        }

        const reservationId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Default expiry to 24 hours if not specified
        const expiry = reservationData.reservationExpiry || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Create reservation
        await execute_sql(
          `INSERT INTO inventory_stock_reservations (
            id, tenant_id, product_id, variant_id, location_id, quantity,
            reservation_type, reference_id, reservation_expiry, status,
            notes, reserved_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            reservationId, tenantId, reservationData.productId, reservationData.variantId,
            reservationData.locationId, reservationData.quantity, reservationData.reservationType,
            reservationData.referenceId, expiry, 'active', reservationData.notes,
            reservationData.reservedBy, now, now
          ]
        );

        // Update stock levels - move from available to reserved
        await execute_sql(
          `UPDATE inventory_stock_levels SET
            available_quantity = available_quantity - $1,
            reserved_quantity = reserved_quantity + $1,
            last_updated = $2
           WHERE tenant_id = $3 AND product_id = $4 AND location_id = $5 
           AND ($6::uuid IS NULL OR variant_id = $6)`,
          [
            reservationData.quantity, now, tenantId, reservationData.productId,
            reservationData.locationId, reservationData.variantId
          ]
        );

        // Clear cache
        await this.invalidateStockCache(tenantId, reservationData.locationId, reservationData.productId);

        console.log(`[InventoryTracking] Stock reserved: ${reservationData.quantity} units of product ${reservationData.productId}`);

        return {
          success: true,
          reservation: {
            id: reservationId,
            tenantId,
            productId: reservationData.productId,
            variantId: reservationData.variantId,
            locationId: reservationData.locationId,
            quantity: reservationData.quantity,
            reservationType: reservationData.reservationType,
            referenceId: reservationData.referenceId,
            reservationExpiry: expiry,
            status: 'active',
            notes: reservationData.notes,
            reservedBy: reservationData.reservedBy,
            createdAt: now,
            updatedAt: now
          },
          message: 'Stock reservation created successfully'
        };
      },
      {
        success: false,
        message: 'Stock reservation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Release stock reservation
   */
  async releaseReservation(input: unknown, tenantId: string): Promise<{ success: boolean; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { reservationId, quantity, releaseReason, notes, releasedBy } = input as any;

        if (!reservationId || !releaseReason || !releasedBy) {
          return {
            success: false,
            message: 'Invalid input data',
            error: 'Reservation ID, release reason, and released by are required'
          };
        }

        // Get reservation details
        const reservationCheck = await execute_sql(
          'SELECT * FROM inventory_stock_reservations WHERE id = $1 AND tenant_id = $2 AND status = $3',
          [reservationId, tenantId, 'active']
        );

        if (reservationCheck.rows.length === 0) {
          return {
            success: false,
            message: 'Reservation not found',
            error: 'Active reservation does not exist'
          };
        }

        const reservation = reservationCheck.rows[0];
        const releaseQuantity = quantity || reservation.quantity;

        if (releaseQuantity > reservation.quantity) {
          return {
            success: false,
            message: 'Invalid release quantity',
            error: 'Cannot release more than reserved quantity'
          };
        }

        const now = new Date().toISOString();

        // Update reservation status
        if (releaseQuantity === reservation.quantity) {
          // Full release
          await execute_sql(
            `UPDATE inventory_stock_reservations SET
              status = $1, released_by = $2, notes = $3, updated_at = $4
             WHERE id = $5`,
            ['released', releasedBy, notes, now, reservationId]
          );
        } else {
          // Partial release - reduce quantity
          await execute_sql(
            `UPDATE inventory_stock_reservations SET
              quantity = quantity - $1, notes = $2, updated_at = $3
             WHERE id = $4`,
            [releaseQuantity, notes, now, reservationId]
          );
        }

        // Update stock levels - move from reserved back to available
        if (releaseReason !== 'fulfilled') {
          await execute_sql(
            `UPDATE inventory_stock_levels SET
              available_quantity = available_quantity + $1,
              reserved_quantity = reserved_quantity - $1,
              last_updated = $2
             WHERE tenant_id = $3 AND product_id = $4 AND location_id = $5 
             AND ($6::uuid IS NULL OR variant_id = $6)`,
            [
              releaseQuantity, now, tenantId, reservation.product_id,
              reservation.location_id, reservation.variant_id
            ]
          );
        } else {
          // For fulfilled reservations, just reduce reserved quantity (stock already moved out)
          await execute_sql(
            `UPDATE inventory_stock_levels SET
              reserved_quantity = reserved_quantity - $1,
              last_updated = $2
             WHERE tenant_id = $3 AND product_id = $4 AND location_id = $5 
             AND ($6::uuid IS NULL OR variant_id = $6)`,
            [
              releaseQuantity, now, tenantId, reservation.product_id,
              reservation.location_id, reservation.variant_id
            ]
          );
        }

        // Clear cache
        await this.invalidateStockCache(tenantId, reservation.location_id, reservation.product_id);

        console.log(`[InventoryTracking] Stock reservation released: ${releaseQuantity} units (${releaseReason})`);

        return {
          success: true,
          message: 'Stock reservation released successfully'
        };
      },
      {
        success: false,
        message: 'Stock reservation release service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(input: unknown, tenantId: string): Promise<{ success: boolean; alerts?: LowStockAlert[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { locationId, severity = 'warning', categoryId, limit = 50 } = input as any;

        // Build query
        let query = `
          SELECT 
            s.id,
            s.tenant_id,
            s.product_id,
            s.variant_id,
            s.location_id,
            s.available_quantity as current_stock,
            p.product_name,
            p.reorder_point,
            p.min_stock_level,
            p.reorder_quantity,
            pv.variant_name,
            l.location_name,
            CASE 
              WHEN s.available_quantity = 0 THEN 'critical'
              WHEN s.available_quantity <= p.min_stock_level THEN 'critical'
              WHEN s.available_quantity <= p.reorder_point THEN 'warning'
              ELSE 'info'
            END as alert_severity
          FROM inventory_stock_levels s
          JOIN inventory_products p ON s.product_id = p.id
          LEFT JOIN product_variants pv ON s.variant_id = pv.id
          LEFT JOIN locations l ON s.location_id = l.id
          WHERE s.tenant_id = $1 
          AND s.available_quantity <= p.reorder_point
        `;

        const queryParams = [tenantId];
        let paramCounter = 2;

        if (locationId) {
          query += ` AND s.location_id = $${paramCounter}`;
          queryParams.push(locationId);
          paramCounter++;
        }

        if (categoryId) {
          query += ` AND p.category_id = $${paramCounter}`;
          queryParams.push(categoryId);
          paramCounter++;
        }

        if (severity !== 'info') {
          if (severity === 'critical') {
            query += ' AND s.available_quantity <= p.min_stock_level';
          } else if (severity === 'warning') {
            query += ' AND s.available_quantity > p.min_stock_level';
          }
        }

        query += ` ORDER BY 
          CASE 
            WHEN s.available_quantity = 0 THEN 1
            WHEN s.available_quantity <= p.min_stock_level THEN 2
            ELSE 3
          END,
          s.available_quantity ASC
          LIMIT $${paramCounter}
        `;

        queryParams.push(limit);

        const result = await execute_sql(query, queryParams);

        const alerts = result.rows.map((row: any) => ({
          id: crypto.randomUUID(),
          tenantId: row.tenant_id,
          productId: row.product_id,
          variantId: row.variant_id,
          locationId: row.location_id,
          productName: row.product_name,
          variantName: row.variant_name,
          locationName: row.location_name,
          currentStock: row.current_stock,
          minStockLevel: row.min_stock_level,
          reorderPoint: row.reorder_point,
          recommendedReorderQuantity: row.reorder_quantity,
          severity: row.alert_severity,
          status: 'active',
          alertDate: new Date().toISOString()
        }));

        return {
          success: true,
          alerts,
          message: `Found ${alerts.length} low stock alerts`
        };
      },
      {
        success: false as const,
        alerts: [] as LowStockAlert[],
        message: 'Low stock alerts service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Generate reorder suggestions based on sales velocity and stock levels
   */
  async generateReorderSuggestions(input: unknown, tenantId: string): Promise<{ success: boolean; suggestions?: ReorderSuggestion[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { 
          locationId, 
          categoryId, 
          priority = 'all', 
          includeSeasonalFactors = true,
          forecastDays = 30 
        } = input as any;

        // Get products that need reordering
        let query = `
          SELECT 
            s.*,
            p.product_name,
            p.reorder_point,
            p.reorder_quantity,
            p.selling_price,
            p.cost_price,
            l.location_name,
            COALESCE(sales.avg_daily_sales, 0) as avg_daily_sales,
            COALESCE(sales.last_sale_date, '1900-01-01') as last_sale_date
          FROM inventory_stock_levels s
          JOIN inventory_products p ON s.product_id = p.id
          LEFT JOIN locations l ON s.location_id = l.id
          LEFT JOIN (
            SELECT 
              product_id,
              variant_id,
              location_id,
              AVG(daily_quantity) as avg_daily_sales,
              MAX(sale_date) as last_sale_date
            FROM (
              SELECT 
                sm.product_id,
                sm.variant_id,
                sm.location_id,
                DATE(sm.created_at) as sale_date,
                SUM(ABS(sm.quantity_changed)) as daily_quantity
              FROM inventory_stock_movements sm
              WHERE sm.movement_type = 'out' 
              AND sm.movement_reason = 'sale'
              AND sm.created_at >= NOW() - INTERVAL '90 days'
              GROUP BY sm.product_id, sm.variant_id, sm.location_id, DATE(sm.created_at)
            ) daily_sales
            GROUP BY product_id, variant_id, location_id
          ) sales ON s.product_id = sales.product_id 
                   AND COALESCE(s.variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(sales.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   AND s.location_id = sales.location_id
          WHERE s.tenant_id = $1
          AND s.available_quantity <= p.reorder_point
          AND p.is_active = true
        `;

        const queryParams = [tenantId];
        let paramCounter = 2;

        if (locationId) {
          query += ` AND s.location_id = $${paramCounter}`;
          queryParams.push(locationId);
          paramCounter++;
        }

        if (categoryId) {
          query += ` AND p.category_id = $${paramCounter}`;
          queryParams.push(categoryId);
          paramCounter++;
        }

        query += ' ORDER BY s.available_quantity ASC, sales.avg_daily_sales DESC LIMIT 100';

        const result = await execute_sql(query, queryParams);

        const suggestions = result.rows.map((row: any) => {
          const avgDailySales = parseFloat(row.avg_daily_sales || 0);
          const currentStock = row.available_quantity;
          const reorderPoint = row.reorder_point;
          const baseReorderQty = row.reorder_quantity || 50;
          
          // Calculate days of stock remaining
          const daysRemaining = avgDailySales > 0 ? currentStock / avgDailySales : 999;
          
          // Calculate recommended quantity based on forecast days and lead time
          const leadTimeDays = 7; // Default lead time
          const safetyStock = avgDailySales * 3; // 3 days safety stock
          const forecastDemand = avgDailySales * forecastDays;
          
          let recommendedQuantity = Math.max(baseReorderQty, forecastDemand + safetyStock - currentStock);
          
          // Apply seasonal factor if requested
          let seasonalFactor = 1.0;
          if (includeSeasonalFactors) {
            const month = new Date().getMonth();
            // Simple seasonal adjustment - increase for holiday seasons
            if (month === 11 || month === 0) { // December, January
              seasonalFactor = 1.3;
            } else if (month >= 9 && month <= 11) { // October-December
              seasonalFactor = 1.2;
            }
            recommendedQuantity = Math.round(recommendedQuantity * seasonalFactor);
          }

          // Determine priority
          let suggestionPriority: 'critical' | 'urgent' | 'normal' = 'normal';
          if (currentStock === 0) {
            suggestionPriority = 'critical';
          } else if (daysRemaining < 3) {
            suggestionPriority = 'urgent';
          } else if (daysRemaining < 7) {
            suggestionPriority = 'urgent';
          }

          // Filter by priority if specified
          if (priority !== 'all' && suggestionPriority !== priority) {
            return null;
          }

          return {
            id: crypto.randomUUID(),
            tenantId,
            productId: row.product_id,
            variantId: row.variant_id,
            locationId: row.location_id,
            productName: row.product_name,
            currentStock,
            reorderPoint,
            recommendedQuantity,
            avgDailySales,
            leadTimeDays,
            seasonalFactor,
            priority: suggestionPriority,
            estimatedCost: recommendedQuantity * parseFloat(row.cost_price || 0),
            lastOrderDate: row.last_sale_date !== '1900-01-01' ? row.last_sale_date : undefined,
            generatedAt: new Date().toISOString()
          };
        }).filter(Boolean);

        return {
          success: true,
          suggestions,
          message: `Generated ${suggestions.length} reorder suggestions`
        };
      },
      {
        success: false as const,
        suggestions: [] as ReorderSuggestion[],
        message: 'Reorder suggestions service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get stock movement history with filtering
   */
  async stockMovementHistory(input: unknown, tenantId: string): Promise<{ success: boolean; movements?: StockMovement[]; pagination?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          productId,
          variantId,
          locationId,
          startDate,
          endDate,
          movementTypes,
          limit = 100,
          offset = 0
        } = input as any;

        // Build dynamic WHERE clause
        const whereConditions = ['sm.tenant_id = $1'];
        const queryParams = [tenantId];
        let paramCounter = 2;

        if (productId) {
          whereConditions.push(`sm.product_id = $${paramCounter}`);
          queryParams.push(productId);
          paramCounter++;
        }

        if (variantId) {
          whereConditions.push(`sm.variant_id = $${paramCounter}`);
          queryParams.push(variantId);
          paramCounter++;
        }

        if (locationId) {
          whereConditions.push(`sm.location_id = $${paramCounter}`);
          queryParams.push(locationId);
          paramCounter++;
        }

        if (startDate) {
          whereConditions.push(`sm.created_at >= $${paramCounter}`);
          queryParams.push(startDate);
          paramCounter++;
        }

        if (endDate) {
          whereConditions.push(`sm.created_at <= $${paramCounter}`);
          queryParams.push(endDate);
          paramCounter++;
        }

        if (movementTypes && movementTypes.length > 0) {
          whereConditions.push(`sm.movement_type = ANY($${paramCounter})`);
          queryParams.push(movementTypes);
          paramCounter++;
        }

        // Count query
        const countQuery = `
          SELECT COUNT(*) as total
          FROM inventory_stock_movements sm
          WHERE ${whereConditions.join(' AND ')}
        `;

        const countResult = await execute_sql(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query with enriched information
        const dataQuery = `
          SELECT 
            sm.*,
            p.product_name,
            p.sku,
            pv.variant_name,
            l.location_name,
            u.first_name,
            u.last_name
          FROM inventory_stock_movements sm
          JOIN inventory_products p ON sm.product_id = p.id
          LEFT JOIN product_variants pv ON sm.variant_id = pv.id
          LEFT JOIN locations l ON sm.location_id = l.id
          LEFT JOIN users u ON sm.performed_by::uuid = u.id
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY sm.created_at DESC
          LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        queryParams.push(limit, offset);

        const dataResult = await execute_sql(dataQuery, queryParams);

        const movements = dataResult.rows.map((row: any) => ({
          id: row.id,
          tenantId: row.tenant_id,
          productId: row.product_id,
          variantId: row.variant_id,
          locationId: row.location_id,
          movementType: row.movement_type,
          movementReason: row.movement_reason,
          referenceType: row.reference_type,
          referenceId: row.reference_id,
          quantityBefore: row.quantity_before,
          quantityChanged: row.quantity_changed,
          quantityAfter: row.quantity_after,
          costPerUnit: parseFloat(row.cost_per_unit || 0),
          totalValue: parseFloat(row.total_value || 0),
          batchNumber: row.batch_number,
          expiryDate: row.expiry_date,
          notes: row.notes,
          performedBy: row.performed_by,
          createdAt: row.created_at,
          // Enriched data
          productName: row.product_name,
          sku: row.sku,
          variantName: row.variant_name,
          locationName: row.location_name,
          performedByName: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : null
        }));

        return {
          success: true,
          movements,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          },
          message: `Found ${movements.length} stock movements`
        };
      },
      {
        success: false as const,
        movements: [] as StockMovement[],
        pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        message: 'Stock movement history service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Calculate inventory valuation using different methods
   */
  async inventoryValuation(input: unknown, tenantId: string): Promise<{ success: boolean; valuation?: InventoryValuation; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { locationId, categoryId, valuationMethod = 'fifo' } = input as any;

        // Get all stock levels for valuation
        let query = `
          SELECT 
            s.*,
            p.product_name,
            p.category_id,
            p.selling_price,
            p.cost_price,
            c.category_name
          FROM inventory_stock_levels s
          JOIN inventory_products p ON s.product_id = p.id
          LEFT JOIN product_categories c ON p.category_id = c.id
          WHERE s.tenant_id = $1 AND s.total_quantity > 0
        `;

        const queryParams = [tenantId];
        let paramCounter = 2;

        if (locationId) {
          query += ` AND s.location_id = $${paramCounter}`;
          queryParams.push(locationId);
          paramCounter++;
        }

        if (categoryId) {
          query += ` AND p.category_id = $${paramCounter}`;
          queryParams.push(categoryId);
          paramCounter++;
        }

        query += ' ORDER BY p.category_id, p.product_name';

        const result = await execute_sql(query, queryParams);

        let totalItems = 0;
        let totalQuantity = 0;
        let fifoValue = 0;
        let lifoValue = 0;
        let weightedAverageValue = 0;
        let standardCostValue = 0;
        let currentMarketValue = 0;

        const categoryBreakdown: { [key: string]: { categoryId: string; categoryName: string; quantity: number; value: number } } = {};

        for (const row of result.rows) {
          const quantity = row.total_quantity;
          const costPerUnit = parseFloat(row.cost_per_unit || row.cost_price || 0);
          const marketPrice = parseFloat(row.selling_price || 0);

          totalItems++;
          totalQuantity += quantity;

          // For this implementation, we'll use current cost as approximation for all methods
          // In a real system, you'd need to track historical costs and batches
          const itemValue = quantity * costPerUnit;
          const itemMarketValue = quantity * marketPrice;

          fifoValue += itemValue;
          lifoValue += itemValue;
          weightedAverageValue += itemValue;
          standardCostValue += itemValue;
          currentMarketValue += itemMarketValue;

          // Category breakdown
          const categoryKey = row.category_id || 'uncategorized';
          if (!categoryBreakdown[categoryKey]) {
            categoryBreakdown[categoryKey] = {
              categoryId: row.category_id,
              categoryName: row.category_name || 'Uncategorized',
              quantity: 0,
              value: 0
            };
          }
          categoryBreakdown[categoryKey].quantity += quantity;
          categoryBreakdown[categoryKey].value += itemValue;
        }

        // Calculate percentages for breakdown
        const breakdown = Object.values(categoryBreakdown).map(cat => ({
          ...cat,
          percentage: fifoValue > 0 ? (cat.value / fifoValue) * 100 : 0
        }));

        const valuation: InventoryValuation = {
          tenantId,
          locationId,
          categoryId,
          totalItems,
          totalQuantity,
          fifoValue,
          lifoValue,
          weightedAverageValue,
          standardCostValue,
          currentMarketValue,
          valuationDate: new Date().toISOString(),
          breakdown
        };

        return {
          success: true,
          valuation,
          message: 'Inventory valuation calculated successfully'
        };
      },
      {
        success: false as const,
        valuation: undefined,
        message: 'Inventory valuation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Clear stock-related cache entries
   */
  async invalidateStockCache(tenantId: string, locationId: string, productId?: string): Promise<void> {
    const cacheKeys = [
      `stock_levels:${tenantId}:${locationId}`,
      `low_stock_alerts:${tenantId}:${locationId}`
    ];

    if (productId) {
      cacheKeys.push(`stock_level:${tenantId}:${locationId}:${productId}`);
    }

    await Promise.all(cacheKeys.map(key => redis.delete(key)));
  },

  /**
   * Check and create low stock alert if necessary
   */
  async checkAndCreateLowStockAlert(tenantId: string, productId: string, variantId: string | undefined, locationId: string, currentStock: number): Promise<void> {
    // Get product reorder settings
    const productResult = await execute_sql(
      'SELECT reorder_point, min_stock_level FROM inventory_products WHERE id = $1 AND tenant_id = $2',
      [productId, tenantId]
    );

    if (productResult.rows.length === 0) return;

    const { reorder_point, min_stock_level } = productResult.rows[0];

    if (currentStock <= reorder_point) {
      // Create or update low stock alert
      await execute_sql(
        `INSERT INTO inventory_low_stock_alerts (
          id, tenant_id, product_id, variant_id, location_id, current_stock,
          reorder_point, min_stock_level, severity, status, alert_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), location_id)
        DO UPDATE SET
          current_stock = $6,
          severity = $9,
          alert_date = $11,
          status = 'active'`,
        [
          crypto.randomUUID(),
          tenantId,
          productId,
          variantId,
          locationId,
          currentStock,
          reorder_point,
          min_stock_level,
          currentStock <= min_stock_level ? 'critical' : 'warning',
          'active',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
    }
  },

  /**
   * Check stock availability for products
   */
  async checkStockAvailability(input: unknown, tenantId: string): Promise<{
    success: boolean;
    available: boolean;
    availableQuantity?: number;
    message: string;
    error?: string;
  }> {
    try {
      const { productId, variantId, quantity, locationId } = input as any;

      const query = `
        SELECT available_quantity
        FROM inventory_stock_levels
        WHERE tenant_id = $1 AND product_id = $2
        ${variantId ? 'AND variant_id = $3' : 'AND variant_id IS NULL'}
        ${locationId ? `AND location_id = $${variantId ? 4 : 3}` : ''}
        LIMIT 1
      `;

      const params = [tenantId, productId];
      if (variantId) params.push(variantId);
      if (locationId) params.push(locationId);

      const result = await execute_sql(query, params);

      if (result.rows.length === 0) {
        return {
          success: true,
          available: false,
          availableQuantity: 0,
          message: 'Product not found or no stock available'
        };
      }

      const availableQuantity = result.rows[0].available_quantity;
      const available = availableQuantity >= quantity;

      return {
        success: true,
        available,
        availableQuantity,
        message: available ? 'Stock available' : 'Insufficient stock'
      };
    } catch (error) {
      return {
        success: false,
        available: false,
        message: 'Failed to check stock availability',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  /**
   * Adjust stock levels after sales or other transactions
   */
  async adjustStock(input: unknown, tenantId: string): Promise<{
    success: boolean;
    movement?: any;
    message: string;
    error?: string;
  }> {
    try {
      const { productId, variantId, quantity, reason, locationId, userId } = input as any;

      const movementData = {
        productId,
        variantId,
        locationId,
        movementType: quantity > 0 ? 'in' : 'out',
        quantityChanged: Math.abs(quantity),
        movementReason: reason || 'adjustment',
        notes: `Stock adjustment: ${reason}`,
        userId
      };

      return await this.updateStockLevel(movementData, tenantId);
    } catch (error) {
      return {
        success: false,
        message: 'Failed to adjust stock',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  /**
   * Update inventory after a sale transaction
   */
  async updateInventoryAfterSale(transaction: any, tenantId: string): Promise<{
    success: boolean;
    updates: any[];
    message: string;
    error?: string;
  }> {
    try {
      const updates = [];

      for (const item of transaction.items) {
        const adjustResult = await this.adjustStock({
          productId: item.productId,
          variantId: item.variantId,
          quantity: -item.quantity, // Negative for sale
          reason: 'sale',
          locationId: transaction.locationId,
          userId: transaction.cashierId
        }, tenantId);

        updates.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          success: adjustResult.success,
          error: adjustResult.error
        });
      }

      const failedUpdates = updates.filter(u => !u.success);
      if (failedUpdates.length > 0) {
        return {
          success: false,
          updates,
          message: `Failed to update inventory for ${failedUpdates.length} items`,
          error: failedUpdates.map(u => u.error).join(', ')
        };
      }

      return {
        success: true,
        updates,
        message: 'Inventory updated successfully after sale'
      };
    } catch (error) {
      return {
        success: false,
        updates: [],
        message: 'Failed to update inventory after sale',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  /**
   * Unit conversion helper for Nigerian businesses
   */
  convertUnits(quantity: number, fromUnit: string, toUnit: string): number {
    const fromUnitInfo = NIGERIAN_BUSINESS_UNITS[fromUnit as keyof typeof NIGERIAN_BUSINESS_UNITS];
    const toUnitInfo = NIGERIAN_BUSINESS_UNITS[toUnit as keyof typeof NIGERIAN_BUSINESS_UNITS];

    if (!fromUnitInfo || !toUnitInfo) {
      return quantity; // No conversion if units not found
    }

    // Convert to base unit first, then to target unit
    const fromRate = 'conversionRate' in fromUnitInfo ? fromUnitInfo.conversionRate : 1;
    const toRate = 'conversionRate' in toUnitInfo ? toUnitInfo.conversionRate : 1;

    return (quantity * fromRate) / toRate;
  },

  // ========================================
  // ADVANCED SERIAL/LOT TRACKING OPERATIONS (POS-102 Enhancement)  
  // ========================================

  /**
   * Manage serial number tracking using existing stock movement infrastructure
   */
  async manageSerialNumbers(input: unknown, tenantId: string): Promise<{ success: boolean; serialRecords?: SerialNumberRecord[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          productId,
          variantId,
          locationId,
          serialNumbers,
          action = 'create',
          batchNumber,
          lotNumber,
          supplierInfo
        } = input as {
          productId: string;
          variantId?: string;
          locationId: string;
          serialNumbers: string[];
          action: 'create' | 'update' | 'transfer' | 'sell' | 'return' | 'damage';
          batchNumber?: string;
          lotNumber?: string;
          supplierInfo?: any;
        };

        const serialRecords: SerialNumberRecord[] = [];
        const now = new Date().toISOString();

        for (const serialNumber of serialNumbers) {
          let status: SerialNumberRecord['status'] = action === 'sell' ? 'sold' : 
                     action === 'damage' ? 'damaged' : 
                     action === 'return' ? 'returned' : 'available';

          // Leverage existing stock movement table with serial tracking
          const movementId = crypto.randomUUID();
          
          // Create stock movement with serial number tracking embedded in batch_number field
          await execute_sql(
            `INSERT INTO inventory_stock_movements (
              id, tenant_id, product_id, variant_id, location_id, movement_type,
              movement_reason, quantity_before, quantity_changed, quantity_after,
              cost_per_unit, total_value, batch_number, notes, performed_by, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              movementId, tenantId, productId, variantId, locationId, 
              action === 'create' || action === 'update' ? 'in' : 'out',
              action, 0, 1, 1, 0, 0, 
              `SERIAL:${serialNumber}|BATCH:${batchNumber || ''}|LOT:${lotNumber || ''}`,
              `Serial tracking: ${action} ${serialNumber}`, tenantId, now
            ]
          );

          // Create serial record representation
          const serialRecord: SerialNumberRecord = {
            id: movementId,
            tenantId,
            productId,
            variantId,
            locationId,
            serialNumber,
            status,
            batchNumber,
            lotNumber,
            supplierInfo,
            notes: `Serial ${action} operation`,
            createdAt: now,
            updatedAt: now
          };

          serialRecords.push(serialRecord);
        }

        console.log(`[InventoryTracking] Managed ${serialRecords.length} serial numbers for product ${productId}`);

        return {
          success: true,
          serialRecords,
          message: `Successfully managed ${serialRecords.length} serial numbers`
        };
      },
      {
        success: false as const,
        message: 'Serial number management service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get serial number tracking report from existing stock movements
   */
  async getSerialNumberReport(input: unknown, tenantId: string): Promise<{ success: boolean; report?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          productId,
          locationId,
          serialNumber,
          limit = 100,
          offset = 0
        } = input as {
          productId?: string;
          locationId?: string;
          serialNumber?: string;
          limit?: number;
          offset?: number;
        };

        // Build query to find serial number movements in batch_number field
        const whereConditions = ['sm.tenant_id = $1', 'sm.batch_number LIKE \'SERIAL:%\''];
        const queryParams = [tenantId];
        let paramCounter = 2;

        if (productId) {
          whereConditions.push(`sm.product_id = $${paramCounter}`);
          queryParams.push(productId);
          paramCounter++;
        }

        if (locationId) {
          whereConditions.push(`sm.location_id = $${paramCounter}`);
          queryParams.push(locationId);
          paramCounter++;
        }

        if (serialNumber) {
          whereConditions.push(`sm.batch_number LIKE $${paramCounter}`);
          queryParams.push(`%SERIAL:${serialNumber}%`);
          paramCounter++;
        }

        const query = `
          SELECT 
            sm.*,
            p.product_name,
            p.product_code,
            pv.variant_name,
            l.location_name
          FROM inventory_stock_movements sm
          JOIN inventory_products p ON sm.product_id = p.id
          LEFT JOIN product_variants pv ON sm.variant_id = pv.id
          LEFT JOIN locations l ON sm.location_id = l.id
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY sm.created_at DESC
          LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        queryParams.push(limit, offset);

        const result = await execute_sql(query, queryParams);
        
        const serialMovements = result.rows.map((row: any) => {
          // Parse serial info from batch_number field format: SERIAL:xxx|BATCH:yyy|LOT:zzz
          const batchInfo = row.batch_number || '';
          const serialMatch = batchInfo.match(/SERIAL:([^|]*)/);
          const batchMatch = batchInfo.match(/BATCH:([^|]*)/);
          const lotMatch = batchInfo.match(/LOT:([^|]*)/);

          return {
            id: row.id,
            productId: row.product_id,
            productName: row.product_name,
            serialNumber: serialMatch ? serialMatch[1] : 'Unknown',
            batchNumber: batchMatch ? batchMatch[1] || null : null,
            lotNumber: lotMatch ? lotMatch[1] || null : null,
            movementType: row.movement_type,
            movementReason: row.movement_reason,
            locationId: row.location_id,
            locationName: row.location_name,
            createdAt: row.created_at,
            notes: row.notes
          };
        });

        const report = {
          serialMovements,
          pagination: {
            total: serialMovements.length,
            limit,
            offset,
            hasMore: serialMovements.length === limit
          },
          summary: {
            totalMovements: serialMovements.length
          }
        };

        return {
          success: true,
          report,
          message: `Found ${serialMovements.length} serial tracking records`
        };
      },
      {
        success: false as const,
        message: 'Serial number report service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get lot expiry and aging report using existing batch tracking
   */
  async getLotExpiryReport(input: unknown, tenantId: string): Promise<{ success: boolean; report?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          locationId,
          productId,
          daysToExpiry = 30
        } = input as {
          locationId?: string;
          productId?: string;
          daysToExpiry?: number;
        };

        const whereConditions = ['sl.tenant_id = $1', 'sl.total_quantity > 0'];
        const queryParams = [tenantId];
        let paramCounter = 2;

        if (locationId) {
          whereConditions.push(`sl.location_id = $${paramCounter}`);
          queryParams.push(locationId);
          paramCounter++;
        }

        if (productId) {
          whereConditions.push(`sl.product_id = $${paramCounter}`);
          queryParams.push(productId);
          paramCounter++;
        }

        // Leverage existing stock levels with batch/expiry tracking
        const query = `
          SELECT 
            sl.*,
            p.product_name,
            p.product_code,
            l.location_name,
            CASE 
              WHEN sl.expiry_dates IS NOT NULL AND array_length(sl.expiry_dates, 1) > 0 THEN
                sl.expiry_dates[1]::date
              ELSE NULL
            END as earliest_expiry,
            CASE 
              WHEN sl.expiry_dates IS NOT NULL AND array_length(sl.expiry_dates, 1) > 0 THEN
                CASE 
                  WHEN sl.expiry_dates[1]::date < CURRENT_DATE THEN 'expired'
                  WHEN sl.expiry_dates[1]::date <= CURRENT_DATE + INTERVAL '${daysToExpiry} days' THEN 'expiring_soon'
                  ELSE 'fresh'
                END
              ELSE 'no_expiry'
            END as expiry_status
          FROM inventory_stock_levels sl
          JOIN inventory_products p ON sl.product_id = p.id
          LEFT JOIN locations l ON sl.location_id = l.id
          WHERE ${whereConditions.join(' AND ')}
            AND (sl.expiry_dates IS NOT NULL OR sl.batch_numbers IS NOT NULL)
          ORDER BY 
            CASE 
              WHEN sl.expiry_dates IS NOT NULL AND array_length(sl.expiry_dates, 1) > 0 THEN
                sl.expiry_dates[1]::date
              ELSE '9999-12-31'::date
            END ASC
        `;

        const result = await execute_sql(query, queryParams);
        
        const lots = result.rows.map((row: any) => ({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          productCode: row.product_code,
          locationId: row.location_id,
          locationName: row.location_name,
          currentQuantity: row.total_quantity,
          batchNumbers: row.batch_numbers || [],
          expiryDates: row.expiry_dates || [],
          earliestExpiry: row.earliest_expiry,
          expiryStatus: row.expiry_status,
          totalValue: parseFloat(row.total_value || '0')
        }));

        // Calculate summary statistics  
        const summary = {
          totalLots: lots.length,
          expiredLots: lots.filter(lot => lot.expiryStatus === 'expired').length,
          expiringSoonLots: lots.filter(lot => lot.expiryStatus === 'expiring_soon').length,
          freshLots: lots.filter(lot => lot.expiryStatus === 'fresh').length,
          totalExpiredValue: lots
            .filter(lot => lot.expiryStatus === 'expired')
            .reduce((sum, lot) => sum + lot.totalValue, 0)
        };

        const report = {
          lots,
          summary,
          expiryThreshold: daysToExpiry,
          generatedAt: new Date().toISOString()
        };

        return {
          success: true,
          report,
          message: `Found ${lots.length} lots with expiry tracking`
        };
      },
      {
        success: false as const,
        message: 'Lot expiry report service temporarily unavailable',
        error: 'Service error'
      }
    );
  }
};