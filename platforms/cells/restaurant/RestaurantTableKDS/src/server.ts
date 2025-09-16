import { execute_sql, withTransaction } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';

// REUSE-FIRST: Import existing cells for maximum component reuse
import { salesEngineCell } from '@/cells/sales/SalesEngine/src/server';
import { inventoryTrackingCell } from '@/cells/inventory/InventoryTracking/src/server';
import { productCatalogCell } from '@/cells/inventory/ProductCatalog/src/server';
import { customerProfileCell } from '@/cells/customer/CustomerProfile/src/server';

// Nigerian market specific imports
import { createSMSService } from '@/lib/sms-service';
import { sendEmail } from '@/lib/replitmail';

// Initialize SMS service for customer notifications
const smsService = createSMSService();

// Types for RestaurantTableKDS operations
export interface RestaurantOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  tableId: string;
  tableNumber: string;
  customerId?: string;
  customerName?: string;
  phoneNumber?: string;
  orderItems: OrderItem[];
  orderType: 'dine_in' | 'takeout' | 'delivery';
  status: OrderStatus;
  priority: 'normal' | 'rush' | 'vip';
  totalAmount: number;
  currency: 'NGN' | 'USD' | 'GBP';
  paymentStatus: 'pending' | 'partial' | 'paid';
  waiterStaffId: string;
  locationId: string;
  estimatedReadyTime?: string;
  actualReadyTime?: string;
  specialRequests?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customizations: string[];
  specialInstructions?: string;
  course: 'appetizer' | 'main' | 'dessert' | 'beverage' | 'special';
  allergens: string[];
  spiceLevel: 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';
  status: ItemStatus;
  kitchenStation?: KitchenStation;
  preparationTime: number; // minutes
  preparationStartTime?: string;
  preparationEndTime?: string;
  actualPrepTime?: number;
  chefAssigned?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantTable {
  id: string;
  tenantId: string;
  tableNumber: string;
  capacity: number;
  section: string;
  status: TableStatus;
  currentOrderId?: string;
  partySize?: number;
  customerName?: string;
  seatedTime?: string;
  reservationTime?: string;
  waitStaffId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled'
  | 'on_hold';

export type ItemStatus = 
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'served';

export type TableStatus = 
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'cleaning'
  | 'unavailable';

export type KitchenStation = 
  | 'grill'
  | 'fryer'
  | 'saute'
  | 'salad'
  | 'pastry'
  | 'beverage'
  | 'expedite';

// Zod validation schemas
const createTableOrderSchema = z.object({
  tableId: z.string().uuid(),
  tableNumber: z.string().max(20),
  customerId: z.string().uuid().optional(),
  orderItems: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1),
    customizations: z.array(z.string()).default([]),
    specialInstructions: z.string().max(200).optional(),
    price: z.number().min(0),
    preparationTime: z.number().int().min(0).default(15),
    course: z.enum(['appetizer', 'main', 'dessert', 'beverage', 'special']).default('main'),
    allergens: z.array(z.string()).default([]),
    spiceLevel: z.enum(['none', 'mild', 'medium', 'hot', 'extra_hot']).default('none')
  })),
  orderType: z.enum(['dine_in', 'takeout', 'delivery']).default('dine_in'),
  priority: z.enum(['normal', 'rush', 'vip']).default('normal'),
  customerName: z.string().max(100).optional(),
  phoneNumber: z.string().max(20).optional(),
  estimatedDeliveryTime: z.string().optional(),
  specialRequests: z.string().max(500).optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid']).default('pending'),
  waiterStaffId: z.string().uuid(),
  locationId: z.string().uuid(),
  notes: z.string().max(300).optional(),
  idempotencyKey: z.string().optional() // Prevent duplicate orders
});

const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'on_hold']),
  kitchenStation: z.enum(['grill', 'fryer', 'saute', 'salad', 'pastry', 'beverage', 'expedite']).optional(),
  estimatedReadyTime: z.string().optional(),
  actualReadyTime: z.string().optional(),
  kitchenNotes: z.string().max(300).optional(),
  chefAssigned: z.string().uuid().optional(),
  updatedBy: z.string().uuid(),
  notifyCustomer: z.boolean().default(true),
  notificationMethod: z.enum(['sms', 'email', 'call']).default('sms')
});

const manageTableSchema = z.object({
  tableId: z.string().uuid(),
  action: z.enum(['seat_customers', 'clear_table', 'reserve', 'mark_unavailable', 'mark_available']),
  tableNumber: z.string().max(20).optional(),
  capacity: z.number().int().min(1).max(20).optional(),
  section: z.string().max(50).optional(),
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning', 'unavailable']).optional(),
  partySize: z.number().int().min(1).optional(),
  customerName: z.string().max(100).optional(),
  reservationTime: z.string().optional(),
  seatedTime: z.string().optional(),
  waitStaffId: z.string().uuid().optional(),
  notes: z.string().max(200).optional(),
  updatedBy: z.string().uuid()
});

// NIGERIAN RESTAURANT UNITS for ingredients and portions
const NIGERIAN_RESTAURANT_UNITS = {
  'kg': { name: 'Kilogram', symbol: 'kg', conversionRate: 1 },
  'g': { name: 'Gram', symbol: 'g', conversionRate: 0.001 },
  'l': { name: 'Litre', symbol: 'l', conversionRate: 1 },
  'ml': { name: 'Millilitre', symbol: 'ml', conversionRate: 0.001 },
  'cup': { name: 'Cup', symbol: 'cup', conversionRate: 0.237 },
  'tbsp': { name: 'Tablespoon', symbol: 'tbsp', conversionRate: 0.0148 },
  'tsp': { name: 'Teaspoon', symbol: 'tsp', conversionRate: 0.0049 },
  'piece': { name: 'Piece', symbol: 'pc', conversionRate: 1 }
};

// RestaurantTableKDS Cell Implementation
const RestaurantTableKDSCell = {

  /**
   * Create new table order - REUSES SalesEngine and InventoryTracking
   */
  async createTableOrder(input: unknown, tenantId: string): Promise<{ success: boolean; order?: RestaurantOrder; kitchenTicket?: any; customerReceipt?: any; ingredientReservations?: any[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = createTableOrderSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const orderData = validationResult.data;

        // IDEMPOTENCY FIX: Check with proper JSON parsing
        if (orderData.idempotencyKey) {
          const idempotencyKey = `restaurant_order:${tenantId}:${orderData.idempotencyKey}`;
          const existingOrderJson = await redis.get(idempotencyKey);
          if (existingOrderJson) {
            const existingOrder = JSON.parse(existingOrderJson as string) as RestaurantOrder;
            return {
              success: true,
              order: existingOrder,
              message: 'Order already exists (idempotent request)'
            };
          }
        }

        // REUSE: Validate customer if provided using CustomerProfile cell
        let customer = null;
        if (orderData.customerId) {
          const customerResult = await customerProfileCell.getCustomer({ customerId: orderData.customerId }, tenantId);
          if (!customerResult.success) {
            return {
              success: false,
              message: 'Customer not found',
              error: 'Invalid customer ID provided'
            };
          }
          customer = customerResult.customer;
        }

        // Generate order number
        const orderNumber = await this.generateOrderNumber(tenantId);
        const orderId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Calculate order total and create order items
        let totalAmount = 0;
        const orderItems: OrderItem[] = [];

        for (const item of orderData.orderItems) {
          const itemId = crypto.randomUUID();
          const lineTotal = item.price * item.quantity;
          totalAmount += lineTotal;

          // REUSE: Get menu item details from ProductCatalog
          const menuItemResult = await productCatalogCell.getProduct(item.menuItemId, tenantId);
          const menuItemName = menuItemResult.success ? menuItemResult.product?.productName || 'Unknown Item' : 'Unknown Item';

          const orderItem: OrderItem = {
            id: itemId,
            orderId,
            menuItemId: item.menuItemId,
            menuItemName,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: lineTotal,
            customizations: item.customizations,
            specialInstructions: item.specialInstructions,
            course: item.course,
            allergens: item.allergens,
            spiceLevel: item.spiceLevel,
            status: 'pending',
            preparationTime: item.preparationTime,
            createdAt: now,
            updatedAt: now
          };

          orderItems.push(orderItem);
        }

        // TRANSACTIONAL ATOMICITY: Wrap all operations in a database transaction
        return await withTransaction(async () => {
          // REUSE: Check ingredient availability and reserve stock inside transaction
          const ingredientReservations: any[] = [];
          for (const item of orderData.orderItems) {
            const availabilityResult = await this.checkIngredientAvailability({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              locationId: orderData.locationId
            }, tenantId);

            if (!availabilityResult.success || !availabilityResult.available) {
              console.warn(`[RestaurantKDS] Insufficient ingredients for menu item ${item.menuItemId}`);
              // Continue with order but note unavailable items
            } else {
              // Reserve ingredients for this order inside transaction
              const reservationResult = await inventoryTrackingCell.reserveStock({
                productId: item.menuItemId,
                locationId: orderData.locationId,
                quantity: item.quantity,
                reservationType: 'order',
                referenceId: orderId,
                notes: `Reserved for order ${orderNumber}`,
                reservedBy: orderData.waiterStaffId
              }, tenantId);

              if (reservationResult.success) {
                ingredientReservations.push(reservationResult.reservation);
              }
            }
          }

          // REUSE: Create sales transaction using SalesEngine
          const salesResult = await salesEngineCell.initializeCart({
            sessionId: `restaurant_${orderId}`,
            cashierId: orderData.waiterStaffId,
            customerId: orderData.customerId,
            locationId: orderData.locationId,
            currency: 'NGN'
          }, tenantId);

          if (!salesResult.success) {
            throw new Error(`Failed to create sales transaction: ${salesResult.error}`);
          }

          const salesSessionId = salesResult.sessionId || salesResult.cart?.sessionId;

          // Create restaurant order record with SalesEngine link
          await execute_sql(
            `INSERT INTO restaurant_orders (
              id, tenant_id, order_number, table_id, table_number, customer_id,
              customer_name, phone_number, order_type, status, priority,
              total_amount, currency, payment_status, waiter_staff_id, location_id,
              estimated_ready_time, special_requests, notes, sales_engine_session_id,
              created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
            [
              orderId, tenantId, orderNumber, orderData.tableId, orderData.tableNumber,
              orderData.customerId, orderData.customerName, orderData.phoneNumber,
              orderData.orderType, 'pending', orderData.priority, totalAmount, 'NGN',
              orderData.paymentStatus, orderData.waiterStaffId, orderData.locationId,
              orderData.estimatedDeliveryTime, orderData.specialRequests, orderData.notes,
              salesSessionId, now, now, orderData.waiterStaffId
            ]
          );

          // Update table status to occupied and link to order
          await execute_sql(
            `UPDATE restaurant_tables SET 
              status = 'occupied', 
              current_order_id = $1,
              updated_at = $2
             WHERE id = $3 AND tenant_id = $4`,
            [orderId, now, orderData.tableId, tenantId]
          );

          // POS SYNCHRONIZATION: Add each item to SalesEngine cart and create order item records
          const salesEngineItems = [];
          for (const item of orderItems) {
            // Add item to SalesEngine cart for proper POS integration
            const addItemResult = await salesEngineCell.addToCart({
              sessionId: salesSessionId,
              productId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              notes: item.specialInstructions || undefined
            }, tenantId);

            if (!addItemResult.success) {
              throw new Error(`Failed to add item ${item.menuItemName} to cart: ${addItemResult.error}`);
            }

            const salesEngineItemId = addItemResult.item?.id;
            salesEngineItems.push({ restaurantItemId: item.id, salesEngineItemId });

            // Create restaurant order item record with SalesEngine link
            await execute_sql(
              `INSERT INTO restaurant_order_items (
                id, tenant_id, order_id, menu_item_id, menu_item_name, quantity, unit_price,
                total_price, customizations, special_instructions, course, allergens,
                spice_level, status, preparation_time, sales_engine_item_id, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
              [
                item.id, tenantId, item.orderId, item.menuItemId, item.menuItemName,
                item.quantity, item.unitPrice, item.totalPrice,
                JSON.stringify(item.customizations), item.specialInstructions,
                item.course, JSON.stringify(item.allergens), item.spiceLevel,
                item.status, item.preparationTime, salesEngineItemId, now, now
              ]
            );
          }

          // Create restaurant order object inside transaction
          const restaurantOrder: RestaurantOrder = {
            id: orderId,
            tenantId,
            orderNumber,
            tableId: orderData.tableId,
            tableNumber: orderData.tableNumber,
            customerId: orderData.customerId,
            customerName: orderData.customerName,
            phoneNumber: orderData.phoneNumber,
            orderItems,
            orderType: orderData.orderType,
            status: 'pending',
            priority: orderData.priority,
            totalAmount,
            currency: 'NGN',
            paymentStatus: orderData.paymentStatus,
            waiterStaffId: orderData.waiterStaffId,
            locationId: orderData.locationId,
            estimatedReadyTime: orderData.estimatedDeliveryTime,
            specialRequests: orderData.specialRequests,
            notes: orderData.notes,
            createdAt: now,
            updatedAt: now,
            createdBy: orderData.waiterStaffId
          };

          // Generate kitchen ticket inside transaction
          const kitchenTicket = await this.generateKitchenTicket(restaurantOrder);

          // Generate customer receipt inside transaction
          const customerReceipt = await this.generateCustomerReceipt(restaurantOrder);

          // Send customer notification if contact info provided (inside transaction)
          if (customer || orderData.phoneNumber) {
            await this.sendCustomerNotification(
              customer || { firstName: orderData.customerName, primaryPhone: orderData.phoneNumber },
              'order_received',
              {
                orderNumber,
                estimatedReadyTime: orderData.estimatedDeliveryTime,
                tableNumber: orderData.tableNumber
              }
            );
          }

          // IDEMPOTENCY FIX: Properly serialize objects to Redis inside transaction
          if (orderData.idempotencyKey) {
            const idempotencyKey = `restaurant_order:${tenantId}:${orderData.idempotencyKey}`;
            await redis.set(idempotencyKey, JSON.stringify(restaurantOrder), { ex: 86400 }); // 24 hour cache
          }

          console.log(`[RestaurantKDS] Created order ${orderNumber} for table ${orderData.tableNumber}`);

          // Return success with all generated data
          return {
            success: true,
            order: restaurantOrder,
            kitchenTicket,
            customerReceipt,
            ingredientReservations,
            salesEngineItems,
            message: `Order ${orderNumber} created successfully`
          };
        }); // End transaction
      },
      {
        success: false as const,
        message: 'Restaurant order creation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Update order status - REUSES existing status management patterns
   */
  async updateOrderStatus(input: unknown, tenantId: string): Promise<{ success: boolean; order?: RestaurantOrder; notification?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = updateOrderStatusSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const statusData = validationResult.data;
        const now = new Date().toISOString();

        // Get current order
        const orderResult = await execute_sql(
          'SELECT * FROM restaurant_orders WHERE id = $1 AND tenant_id = $2',
          [statusData.orderId, tenantId]
        );

        if (orderResult.rows.length === 0) {
          return {
            success: false,
            message: 'Restaurant order not found',
            error: 'Invalid order ID'
          };
        }

        const currentOrder = orderResult.rows[0];

        // Update order status
        await execute_sql(
          `UPDATE restaurant_orders SET 
            status = $1, kitchen_station = $2, estimated_ready_time = $3,
            actual_ready_time = $4, kitchen_notes = $5, chef_assigned = $6,
            updated_at = $7, updated_by = $8
           WHERE id = $9 AND tenant_id = $10`,
          [
            statusData.status, statusData.kitchenStation, statusData.estimatedReadyTime,
            statusData.actualReadyTime, statusData.kitchenNotes, statusData.chefAssigned,
            now, statusData.updatedBy, statusData.orderId, tenantId
          ]
        );

        // Log status change
        await execute_sql(
          `INSERT INTO restaurant_order_status_history (
            id, order_id, previous_status, new_status, kitchen_station, notes,
            changed_by, changed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(), statusData.orderId, currentOrder.status,
            statusData.status, statusData.kitchenStation, statusData.kitchenNotes,
            statusData.updatedBy, now
          ]
        );

        // REUSE: Get customer info for notifications if needed
        let notification = null;
        if (statusData.notifyCustomer && currentOrder.customer_id) {
          const customerResult = await customerProfileCell.getCustomer({ customerId: currentOrder.customer_id }, tenantId);
          
          if (customerResult.success && customerResult.customer) {
            notification = await this.sendCustomerNotification(
              customerResult.customer,
              'status_update',
              {
                orderNumber: currentOrder.order_number,
                status: statusData.status,
                tableNumber: currentOrder.table_number,
                estimatedReadyTime: statusData.estimatedReadyTime
              },
              statusData.notificationMethod
            );
          }
        }

        const updatedOrder = this.mapDatabaseRowToRestaurantOrder(currentOrder);
        updatedOrder.status = statusData.status as OrderStatus;
        updatedOrder.updatedAt = now;

        console.log(`[RestaurantKDS] Updated order ${currentOrder.order_number} status to ${statusData.status}`);

        return {
          success: true,
          order: updatedOrder,
          notification,
          message: `Order status updated to ${statusData.status}`
        };
      },
      {
        success: false as const,
        message: 'Order status update service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Check ingredient availability - REUSES InventoryTracking for ingredient management
   */
  async checkIngredientAvailability(input: unknown, tenantId: string): Promise<{ success: boolean; available: boolean; menuItem?: any; ingredients?: any[]; alternatives?: any[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { menuItemId, quantity, locationId, includeAlternatives = false } = input as {
          menuItemId: string;
          quantity: number;
          locationId: string;
          includeAlternatives?: boolean;
        };

        // REUSE: Get menu item details from ProductCatalog
        const menuItemResult = await productCatalogCell.getProduct(menuItemId, tenantId);
        if (!menuItemResult.success) {
          return {
            success: false,
            available: false,
            message: 'Menu item not found',
            error: 'Invalid menu item ID'
          };
        }

        const menuItem = menuItemResult.product;

        // Get recipe ingredients (stored in product metadata)
        const recipe = menuItem?.metadata?.recipe || [];
        const ingredientChecks = [];
        let allIngredientsAvailable = true;

        for (const ingredient of recipe) {
          const requiredQuantity = ingredient.quantity * quantity;

          // REUSE: Check stock availability using InventoryTracking
          const stockResult = await inventoryTrackingCell.checkStockAvailability({
            productId: ingredient.ingredientId,
            locationId,
            requiredQuantity
          }, tenantId);

          const ingredientCheck = {
            ingredientId: ingredient.ingredientId,
            ingredientName: ingredient.name,
            required: requiredQuantity,
            available: stockResult.success ? stockResult.availableQuantity || 0 : 0,
            sufficient: stockResult.success && (stockResult.availableQuantity || 0) >= requiredQuantity
          };

          if (!ingredientCheck.sufficient) {
            allIngredientsAvailable = false;
          }

          ingredientChecks.push(ingredientCheck);
        }

        // Find alternatives if requested and ingredients not available
        let alternatives: { menuItemId: string; name: string; price: number; }[] = [];
        if (includeAlternatives && !allIngredientsAvailable) {
          // Get similar menu items from same category
          const categoryResult = await productCatalogCell.searchProducts({
            categoryId: menuItem?.categoryId,
            limit: 5
          }, tenantId);

          if (categoryResult.success && categoryResult.products) {
            alternatives = categoryResult.products
              .filter((p: any) => p.id !== menuItemId && p.isActive)
              .map((p: any) => ({
                menuItemId: p.id,
                name: p.productName,
                price: p.sellingPrice
              }));
          }
        }

        return {
          success: true,
          available: allIngredientsAvailable,
          menuItem,
          ingredients: ingredientChecks,
          alternatives,
          message: allIngredientsAvailable 
            ? 'All ingredients available' 
            : `${ingredientChecks.filter(i => !i.sufficient).length} ingredients insufficient`
        };
      },
      {
        success: false,
        available: false,
        message: 'Ingredient availability check service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Manage table status and seating
   */
  async manageTable(input: unknown, tenantId: string): Promise<{ success: boolean; table?: RestaurantTable; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = manageTableSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const tableData = validationResult.data;
        const now = new Date().toISOString();

        // Get current table state
        const tableResult = await execute_sql(
          'SELECT * FROM restaurant_tables WHERE id = $1 AND tenant_id = $2',
          [tableData.tableId, tenantId]
        );

        if (tableResult.rows.length === 0) {
          return {
            success: false,
            message: 'Table not found',
            error: 'Invalid table ID'
          };
        }

        const currentTable = tableResult.rows[0];

        // Update table based on action
        let updateFields: any = {
          updated_at: now,
          updated_by: tableData.updatedBy
        };

        switch (tableData.action) {
          case 'seat_customers':
            updateFields.status = 'occupied';
            updateFields.party_size = tableData.partySize;
            updateFields.customer_name = tableData.customerName;
            updateFields.seated_time = tableData.seatedTime || now;
            updateFields.wait_staff_id = tableData.waitStaffId;
            break;

          case 'clear_table':
            updateFields.status = 'cleaning';
            updateFields.party_size = null;
            updateFields.customer_name = null;
            updateFields.seated_time = null;
            updateFields.current_order_id = null;
            break;

          case 'reserve':
            updateFields.status = 'reserved';
            updateFields.customer_name = tableData.customerName;
            updateFields.reservation_time = tableData.reservationTime;
            updateFields.party_size = tableData.partySize;
            break;

          case 'mark_available':
            updateFields.status = 'available';
            updateFields.party_size = null;
            updateFields.customer_name = null;
            updateFields.seated_time = null;
            updateFields.reservation_time = null;
            updateFields.current_order_id = null;
            break;

          case 'mark_unavailable':
            updateFields.status = 'unavailable';
            updateFields.notes = tableData.notes;
            break;
        }

        // Build dynamic update query
        const updateColumns = Object.keys(updateFields);
        const updateValues = Object.values(updateFields);
        const updateQuery = `UPDATE restaurant_tables SET ${updateColumns.map((col, i) => `${col} = $${i + 1}`).join(', ')} WHERE id = $${updateColumns.length + 1} AND tenant_id = $${updateColumns.length + 2}`;

        await execute_sql(updateQuery, [...updateValues, tableData.tableId, tenantId]);

        // Log table action
        await execute_sql(
          `INSERT INTO restaurant_table_history (
            id, table_id, action, previous_status, new_status, notes,
            performed_by, performed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(), tableData.tableId, tableData.action,
            currentTable.status, updateFields.status || currentTable.status,
            tableData.notes, tableData.updatedBy, now
          ]
        );

        const updatedTable = this.mapDatabaseRowToRestaurantTable({
          ...currentTable,
          ...updateFields
        });

        console.log(`[RestaurantKDS] Table ${currentTable.table_number} ${tableData.action} completed`);

        return {
          success: true,
          table: updatedTable,
          message: `Table ${tableData.action} completed successfully`
        };
      },
      {
        success: false as const,
        message: 'Table management service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Generate unique order number
   */
  async generateOrderNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Get daily counter using get/set pattern
    const counterKey = `restaurant_order_counter:${tenantId}:${year}-${month}-${day}`;
    const currentValue = await redis.get<number>(counterKey) || 0;
    const counter = currentValue + 1;
    await redis.set(counterKey, counter, { ex: 86400 }); // Expire after 24 hours
    
    return `RO${year}${month}${day}${String(counter).padStart(4, '0')}`;
  },

  /**
   * Generate kitchen ticket for order preparation
   */
  async generateKitchenTicket(order: RestaurantOrder): Promise<any> {
    const ticket = {
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      orderType: order.orderType,
      priority: order.priority,
      items: order.orderItems.map(item => ({
        name: item.menuItemName,
        quantity: item.quantity,
        customizations: item.customizations,
        specialInstructions: item.specialInstructions,
        course: item.course,
        spiceLevel: item.spiceLevel,
        allergens: item.allergens
      })),
      specialRequests: order.specialRequests,
      estimatedReadyTime: order.estimatedReadyTime,
      createdAt: order.createdAt
    };

    return ticket;
  },

  /**
   * Generate customer receipt
   */
  async generateCustomerReceipt(order: RestaurantOrder): Promise<any> {
    const receipt = {
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      items: order.orderItems.map(item => ({
        name: item.menuItemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      })),
      totalAmount: order.totalAmount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      estimatedReadyTime: order.estimatedReadyTime,
      createdAt: order.createdAt
    };

    return receipt;
  },

  /**
   * Send customer notification using existing SMS/Email services
   */
  async sendCustomerNotification(customer: any, notificationType: string, data: any, method: string = 'sms'): Promise<any> {
    try {
      let message = '';
      
      switch (notificationType) {
        case 'order_received':
          message = `Hello ${customer.firstName || 'valued customer'}, your order #${data.orderNumber} for table ${data.tableNumber} has been received. ${data.estimatedReadyTime ? `Estimated ready time: ${data.estimatedReadyTime}` : ''}`;
          break;
        case 'status_update':
          message = `Order #${data.orderNumber} status updated: ${data.status.replace('_', ' ')}. Table: ${data.tableNumber}. ${data.estimatedReadyTime ? `Ready time: ${data.estimatedReadyTime}` : ''}`;
          break;
        case 'order_ready':
          message = `Your order #${data.orderNumber} is ready for pickup/serving at table ${data.tableNumber}. Thank you for dining with us!`;
          break;
      }

      if (method === 'sms' && customer.primaryPhone) {
        return await smsService.sendSMS(customer.primaryPhone, message);
      } else if (method === 'email' && customer.email) {
        return await sendEmail({
          to: customer.email,
          subject: `Restaurant Order Update - #${data.orderNumber}`,
          text: message
        });
      }

      return { sent: false, method, message: 'No valid contact method' };
    } catch (error) {
      console.error('[RestaurantKDS] Notification error:', error);
      return { sent: false, method, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  /**
   * Map database row to RestaurantOrder object
   */
  mapDatabaseRowToRestaurantOrder(row: any): RestaurantOrder {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderNumber: row.order_number,
      tableId: row.table_id,
      tableNumber: row.table_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      phoneNumber: row.phone_number,
      orderItems: [], // Would be populated separately
      orderType: row.order_type,
      status: row.status,
      priority: row.priority,
      totalAmount: parseFloat(row.total_amount || '0'),
      currency: row.currency || 'NGN',
      paymentStatus: row.payment_status,
      waiterStaffId: row.waiter_staff_id,
      locationId: row.location_id,
      estimatedReadyTime: row.estimated_ready_time,
      actualReadyTime: row.actual_ready_time,
      specialRequests: row.special_requests,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by
    };
  },

  /**
   * Update individual order item status for kitchen workflow
   */
  async updateItemStatus(input: unknown, tenantId: string): Promise<{ success: boolean; item?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { orderId, itemId, status, kitchenStation, preparationStartTime, preparationEndTime, actualPrepTime, notes, updatedBy } = input as {
          orderId: string;
          itemId: string;
          status: ItemStatus;
          kitchenStation?: KitchenStation;
          preparationStartTime?: string;
          preparationEndTime?: string;
          actualPrepTime?: number;
          notes?: string;
          updatedBy: string;
        };

        const now = new Date().toISOString();

        // Update order item status
        await execute_sql(
          `UPDATE restaurant_order_items SET 
            status = $1, kitchen_station = $2, preparation_start_time = $3,
            preparation_end_time = $4, actual_prep_time = $5, notes = $6,
            updated_at = $7
           WHERE id = $8 AND order_id = $9 AND tenant_id = $10`,
          [
            status, kitchenStation, preparationStartTime,
            preparationEndTime, actualPrepTime, notes,
            now, itemId, orderId, tenantId
          ]
        );

        return {
          success: true,
          message: `Item status updated to ${status}`
        };
      },
      {
        success: false as const,
        message: 'Item status update service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get current kitchen queue for display system
   */
  async getKitchenQueue(input: unknown, tenantId: string): Promise<{ success: boolean; orders?: RestaurantOrder[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { locationId, status, limit = 50 } = input as {
          locationId: string;
          status?: OrderStatus[];
          limit?: number;
        };

        let whereClause = 'WHERE tenant_id = $1 AND location_id = $2';
        const params: any[] = [tenantId, locationId];

        if (status && status.length > 0) {
          whereClause += ` AND status = ANY($3)`;
          params.push(status);
        } else {
          // Default to active statuses
          whereClause += ` AND status IN ('pending', 'accepted', 'preparing', 'ready')`;
        }

        const ordersResult = await execute_sql(
          `SELECT * FROM restaurant_orders ${whereClause} ORDER BY priority DESC, created_at ASC LIMIT $${params.length + 1}`,
          [...params, limit]
        );

        const orders = ordersResult.rows.map((row: any) => this.mapDatabaseRowToRestaurantOrder(row));

        return {
          success: true,
          orders,
          message: `Retrieved ${orders.length} orders from kitchen queue`
        };
      },
      {
        success: false as const,
        orders: [],
        message: 'Kitchen queue service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get table status for restaurant management
   */
  async getTableStatus(input: unknown, tenantId: string): Promise<{ success: boolean; tables?: RestaurantTable[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { section, status, limit = 100 } = input as {
          section?: string;
          status?: TableStatus[];
          limit?: number;
        };

        let whereClause = 'WHERE tenant_id = $1';
        const params: any[] = [tenantId];

        if (section) {
          whereClause += ` AND section = $2`;
          params.push(section);
        }

        if (status && status.length > 0) {
          whereClause += ` AND status = ANY($${params.length + 1})`;
          params.push(status);
        }

        const tablesResult = await execute_sql(
          `SELECT * FROM restaurant_tables ${whereClause} ORDER BY table_number ASC LIMIT $${params.length + 1}`,
          [...params, limit]
        );

        const tables = tablesResult.rows.map((row: any) => this.mapDatabaseRowToRestaurantTable(row));

        return {
          success: true,
          tables,
          message: `Retrieved ${tables.length} tables`
        };
      },
      {
        success: false as const,
        tables: [],
        message: 'Table status service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Map database row to RestaurantTable object
   */
  mapDatabaseRowToRestaurantTable(row: any): RestaurantTable {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tableNumber: row.table_number,
      capacity: parseInt(row.capacity || '4'),
      section: row.section || 'main',
      status: row.status,
      currentOrderId: row.current_order_id,
      partySize: row.party_size ? parseInt(row.party_size) : undefined,
      customerName: row.customer_name,
      seatedTime: row.seated_time,
      reservationTime: row.reservation_time,
      waitStaffId: row.wait_staff_id,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
};

// Export singleton instance
export const restaurantTableKDSCell = RestaurantTableKDSCell;
export default restaurantTableKDSCell;