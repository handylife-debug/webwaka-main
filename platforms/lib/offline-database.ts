import {
  createRxDatabase,
  addRxPlugin,
  RxDatabase,
  RxCollection,
  RxJsonSchema,
  RxDocument
} from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'

// ===================================================================
// PRODUCT CATEGORIES SCHEMA - Hierarchical categories with tax rates
// ===================================================================
const productCategorySchema: RxJsonSchema<ProductCategoryDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    categoryCode: {
      type: 'string',
      maxLength: 50
    },
    categoryName: {
      type: 'string',
      maxLength: 100
    },
    parentCategoryId: {
      type: 'string',
      maxLength: 100
    },
    description: {
      type: 'string'
    },
    taxRate: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      default: 0
    },
    isActive: {
      type: 'boolean',
      default: true
    },
    sortOrder: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    metadata: {
      type: 'object',
      default: {}
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'categoryCode', 'categoryName', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'categoryCode', 'parentCategoryId', 'isActive']
}

// ===================================================================
// SUPPLIERS SCHEMA - Supplier management with contact details
// ===================================================================
const supplierSchema: RxJsonSchema<SupplierDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    supplierCode: {
      type: 'string',
      maxLength: 50
    },
    supplierName: {
      type: 'string',
      maxLength: 200
    },
    contactPerson: {
      type: 'string',
      maxLength: 100
    },
    email: {
      type: 'string',
      maxLength: 255
    },
    phone: {
      type: 'string',
      maxLength: 20
    },
    address: {
      type: 'string'
    },
    city: {
      type: 'string',
      maxLength: 100
    },
    state: {
      type: 'string',
      maxLength: 100
    },
    postalCode: {
      type: 'string',
      maxLength: 20
    },
    country: {
      type: 'string',
      maxLength: 100
    },
    taxId: {
      type: 'string',
      maxLength: 50
    },
    paymentTerms: {
      type: 'string',
      maxLength: 100
    },
    creditLimit: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    isActive: {
      type: 'boolean',
      default: true
    },
    notes: {
      type: 'string'
    },
    metadata: {
      type: 'object',
      default: {}
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'supplierCode', 'supplierName', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'supplierCode', 'supplierName', 'isActive']
}

// ===================================================================
// LOCATIONS SCHEMA - Multi-location support (stores, warehouses, outlets)
// ===================================================================
const locationSchema: RxJsonSchema<LocationDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    locationCode: {
      type: 'string',
      maxLength: 50
    },
    locationName: {
      type: 'string',
      maxLength: 200
    },
    locationType: {
      type: 'string',
      enum: ['store', 'warehouse', 'outlet', 'online'],
      default: 'store'
    },
    address: {
      type: 'string'
    },
    city: {
      type: 'string',
      maxLength: 100
    },
    state: {
      type: 'string',
      maxLength: 100
    },
    postalCode: {
      type: 'string',
      maxLength: 20
    },
    country: {
      type: 'string',
      maxLength: 100
    },
    phone: {
      type: 'string',
      maxLength: 20
    },
    email: {
      type: 'string',
      maxLength: 255
    },
    managerName: {
      type: 'string',
      maxLength: 100
    },
    isActive: {
      type: 'boolean',
      default: true
    },
    isDefault: {
      type: 'boolean',
      default: false
    },
    sortOrder: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    metadata: {
      type: 'object',
      default: {}
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'locationCode', 'locationName', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'locationCode', 'locationType', 'isActive', 'isDefault']
}

// ===================================================================
// PRODUCT VARIANTS SCHEMA - Size, color, style variations with individual pricing
// ===================================================================
const productVariantSchema: RxJsonSchema<ProductVariantDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    productId: {
      type: 'string',
      maxLength: 100
    },
    variantCode: {
      type: 'string',
      maxLength: 100
    },
    variantName: {
      type: 'string',
      maxLength: 200
    },
    sku: {
      type: 'string',
      maxLength: 100
    },
    barcode: {
      type: 'string',
      maxLength: 100
    },
    variantType: {
      type: 'string',
      enum: ['size', 'color', 'style', 'material', 'flavor', 'other']
    },
    variantValue: {
      type: 'string',
      maxLength: 100
    },
    costPrice: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    sellingPrice: {
      type: 'number',
      minimum: 0
    },
    weight: {
      type: 'number',
      minimum: 0
    },
    dimensions: {
      type: 'string',
      maxLength: 100
    },
    imageUrl: {
      type: 'string',
      maxLength: 500
    },
    isDefault: {
      type: 'boolean',
      default: false
    },
    isActive: {
      type: 'boolean',
      default: true
    },
    sortOrder: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    metadata: {
      type: 'object',
      default: {}
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'productId', 'variantCode', 'variantName', 'variantType', 'variantValue', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'productId', 'variantCode', 'variantType', 'sku', 'barcode', 'isActive']
}

// ===================================================================
// STOCK LEVELS SCHEMA - Per-location stock tracking with reserved/available amounts
// ===================================================================
const stockLevelSchema: RxJsonSchema<StockLevelDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    productId: {
      type: 'string',
      maxLength: 100
    },
    variantId: {
      type: 'string',
      maxLength: 100
    },
    locationId: {
      type: 'string',
      maxLength: 100
    },
    currentStock: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    reservedStock: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    availableStock: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    costPerUnit: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    lastCountedAt: {
      type: 'string',
      format: 'date-time'
    },
    lastMovementAt: {
      type: 'string',
      format: 'date-time'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'productId', 'locationId', 'currentStock', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'productId', 'variantId', 'locationId', 'currentStock']
}

// ===================================================================
// PURCHASE ORDERS SCHEMA - PO management with supplier, status, totals
// ===================================================================
const purchaseOrderSchema: RxJsonSchema<PurchaseOrderDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    poNumber: {
      type: 'string',
      maxLength: 100
    },
    supplierId: {
      type: 'string',
      maxLength: 100
    },
    locationId: {
      type: 'string',
      maxLength: 100
    },
    orderDate: {
      type: 'string',
      format: 'date'
    },
    expectedDeliveryDate: {
      type: 'string',
      format: 'date'
    },
    actualDeliveryDate: {
      type: 'string',
      format: 'date'
    },
    status: {
      type: 'string',
      enum: ['draft', 'sent', 'confirmed', 'partial', 'completed', 'cancelled'],
      default: 'draft'
    },
    subtotal: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    taxAmount: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    shippingCost: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    discountAmount: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    totalAmount: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    paymentTerms: {
      type: 'string',
      maxLength: 100
    },
    notes: {
      type: 'string'
    },
    createdBy: {
      type: 'string',
      maxLength: 100
    },
    approvedBy: {
      type: 'string',
      maxLength: 100
    },
    approvedAt: {
      type: 'string',
      format: 'date-time'
    },
    metadata: {
      type: 'object',
      default: {}
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'poNumber', 'supplierId', 'locationId', 'orderDate', 'status', 'createdBy', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'poNumber', 'supplierId', 'locationId', 'status', 'orderDate']
}

// ===================================================================
// PURCHASE ORDER ITEMS SCHEMA - PO line items with quantities and costs
// ===================================================================
const purchaseOrderItemSchema: RxJsonSchema<PurchaseOrderItemDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    purchaseOrderId: {
      type: 'string',
      maxLength: 100
    },
    productId: {
      type: 'string',
      maxLength: 100
    },
    variantId: {
      type: 'string',
      maxLength: 100
    },
    quantityOrdered: {
      type: 'integer',
      minimum: 1
    },
    quantityReceived: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    unitCost: {
      type: 'number',
      minimum: 0
    },
    lineTotal: {
      type: 'number',
      minimum: 0
    },
    notes: {
      type: 'string'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'purchaseOrderId', 'productId', 'quantityOrdered', 'unitCost', 'lineTotal', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'purchaseOrderId', 'productId', 'variantId']
}

// ===================================================================
// STOCK MOVEMENTS SCHEMA - Track all inventory changes (in/out/transfer/adjustment)
// ===================================================================
const stockMovementSchema: RxJsonSchema<StockMovementDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    productId: {
      type: 'string',
      maxLength: 100
    },
    variantId: {
      type: 'string',
      maxLength: 100
    },
    locationId: {
      type: 'string',
      maxLength: 100
    },
    movementType: {
      type: 'string',
      enum: ['in', 'out', 'transfer', 'adjustment', 'audit']
    },
    movementReason: {
      type: 'string',
      enum: ['purchase', 'sale', 'return', 'transfer_in', 'transfer_out', 'adjustment_positive', 'adjustment_negative', 'audit_correction', 'damaged', 'expired', 'theft', 'promotion', 'sample']
    },
    quantityChange: {
      type: 'integer'
    },
    costPerUnit: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    referenceType: {
      type: 'string',
      maxLength: 50
    },
    referenceId: {
      type: 'string',
      maxLength: 100
    },
    batchId: {
      type: 'string',
      maxLength: 100
    },
    serialNumber: {
      type: 'string',
      maxLength: 100
    },
    expiryDate: {
      type: 'string',
      format: 'date'
    },
    notes: {
      type: 'string'
    },
    createdBy: {
      type: 'string',
      maxLength: 100
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'productId', 'locationId', 'movementType', 'movementReason', 'quantityChange', 'createdBy', 'createdAt'],
  indexes: ['tenantId', 'productId', 'locationId', 'movementType', 'movementReason', 'createdAt']
}

// ===================================================================
// STOCK AUDITS SCHEMA - Audit planning and execution tracking
// ===================================================================
const stockAuditSchema: RxJsonSchema<StockAuditDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    auditNumber: {
      type: 'string',
      maxLength: 100
    },
    locationId: {
      type: 'string',
      maxLength: 100
    },
    auditType: {
      type: 'string',
      enum: ['full', 'partial', 'cycle'],
      default: 'full'
    },
    status: {
      type: 'string',
      enum: ['planned', 'in_progress', 'completed', 'cancelled'],
      default: 'planned'
    },
    plannedDate: {
      type: 'string',
      format: 'date'
    },
    startedAt: {
      type: 'string',
      format: 'date-time'
    },
    completedAt: {
      type: 'string',
      format: 'date-time'
    },
    totalItemsPlanned: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    totalItemsCounted: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    discrepancyCount: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    notes: {
      type: 'string'
    },
    createdBy: {
      type: 'string',
      maxLength: 100
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'auditNumber', 'locationId', 'auditType', 'status', 'plannedDate', 'createdBy', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'auditNumber', 'locationId', 'auditType', 'status', 'plannedDate']
}

// ===================================================================
// PRODUCT SERIAL NUMBERS SCHEMA - Individual item tracking with status
// ===================================================================
const productSerialNumberSchema: RxJsonSchema<ProductSerialNumberDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    productId: {
      type: 'string',
      maxLength: 100
    },
    variantId: {
      type: 'string',
      maxLength: 100
    },
    locationId: {
      type: 'string',
      maxLength: 100
    },
    serialNumber: {
      type: 'string',
      maxLength: 100
    },
    batchNumber: {
      type: 'string',
      maxLength: 100
    },
    manufactureDate: {
      type: 'string',
      format: 'date'
    },
    expiryDate: {
      type: 'string',
      format: 'date'
    },
    costPrice: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    status: {
      type: 'string',
      enum: ['available', 'reserved', 'sold', 'damaged', 'expired', 'returned'],
      default: 'available'
    },
    purchaseOrderId: {
      type: 'string',
      maxLength: 100
    },
    transactionId: {
      type: 'string',
      maxLength: 100
    },
    notes: {
      type: 'string'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'productId', 'locationId', 'serialNumber', 'status', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'productId', 'variantId', 'locationId', 'serialNumber', 'status']
}

// ===================================================================
// LOW STOCK ALERTS SCHEMA - Alert configuration per product/location
// ===================================================================
const lowStockAlertSchema: RxJsonSchema<LowStockAlertDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    productId: {
      type: 'string',
      maxLength: 100
    },
    variantId: {
      type: 'string',
      maxLength: 100
    },
    locationId: {
      type: 'string',
      maxLength: 100
    },
    alertThreshold: {
      type: 'integer',
      minimum: 0
    },
    currentStock: {
      type: 'integer',
      minimum: 0,
      default: 0
    },
    isActive: {
      type: 'boolean',
      default: true
    },
    lastAlertedAt: {
      type: 'string',
      format: 'date-time'
    },
    alertFrequencyHours: {
      type: 'integer',
      minimum: 1,
      default: 24
    },
    notificationEmails: {
      type: 'array',
      items: {
        type: 'string'
      },
      default: []
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'productId', 'locationId', 'alertThreshold', 'createdAt', 'updatedAt'],
  indexes: ['tenantId', 'productId', 'variantId', 'locationId', 'isActive', 'currentStock']
}\n\n// Product schema aligned with normalized inventory model
const productSchema: RxJsonSchema<ProductDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    tenantId: {
      type: 'string',
      maxLength: 100
    },
    name: {
      type: 'string'
    },
    price: {
      type: 'number',
      minimum: 0
    },
    categoryId: {
      type: 'string',
      maxLength: 100
    },
    supplierId: {
      type: 'string',
      maxLength: 100
    },
    stock: {
      type: 'number',
      minimum: 0
    },
    image: {
      type: 'string'
    },
    barcode: {
      type: 'string'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'tenantId', 'name', 'price', 'stock', 'updatedAt'],
  indexes: ['tenantId', 'categoryId', 'supplierId', 'barcode']
}

// Transaction schema for offline sales
const transactionSchema: RxJsonSchema<TransactionDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'number' },
          subtotal: { type: 'number' }
        },
        required: ['productId', 'name', 'price', 'quantity', 'subtotal']
      }
    },
    subtotal: {
      type: 'number',
      minimum: 0
    },
    discounts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          name: { type: 'string' },
          amount: { type: 'number' }
        }
      }
    },
    taxes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          rate: { type: 'number' },
          amount: { type: 'number' }
        }
      }
    },
    fees: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          amount: { type: 'number' }
        }
      }
    },
    total: {
      type: 'number',
      minimum: 0
    },
    paymentMethod: {
      type: 'string'
    },
    paymentStatus: {
      type: 'string',
      enum: ['pending', 'completed', 'failed', 'cancelled']
    },
    customerInfo: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' }
      }
    },
    cashier: {
      type: 'string'
    },
    notes: {
      type: 'string'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    syncedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'items', 'subtotal', 'total', 'paymentMethod', 'paymentStatus', 'createdAt', 'updatedAt'],
  indexes: ['paymentStatus', 'createdAt', 'cashier']
}

// Customer schema for offline customer data
const customerSchema: RxJsonSchema<CustomerDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    name: {
      type: 'string'
    },
    phone: {
      type: 'string'
    },
    email: {
      type: 'string'
    },
    loyaltyPoints: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    totalSpent: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    tier: {
      type: 'string',
      enum: ['bronze', 'silver', 'gold', 'platinum'],
      default: 'bronze'
    },
    joinDate: {
      type: 'string',
      format: 'date-time'
    },
    lastVisit: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'name', 'phone', 'joinDate', 'updatedAt'],
  indexes: ['phone', 'email']
}

// Draft transaction schema for layaway/pending sales
const draftTransactionSchema: RxJsonSchema<DraftTransactionDocument> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'number' },
          subtotal: { type: 'number' }
        }
      }
    },
    customerInfo: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' }
      }
    },
    subtotal: {
      type: 'number',
      minimum: 0
    },
    total: {
      type: 'number',
      minimum: 0
    },
    paidAmount: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    remainingAmount: {
      type: 'number',
      minimum: 0
    },
    status: {
      type: 'string',
      enum: ['draft', 'layaway', 'ready_for_pickup'],
      default: 'draft'
    },
    dueDate: {
      type: 'string',
      format: 'date-time'
    },
    notes: {
      type: 'string'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    _deleted: {
      type: 'boolean',
      default: false
    }
  },
  required: ['id', 'items', 'subtotal', 'total', 'remainingAmount', 'status', 'createdAt', 'updatedAt'],
  indexes: ['status', 'createdAt']
}

// ===================================================================
// TYPESCRIPT INTERFACES FOR INVENTORY MANAGEMENT
// ===================================================================

export interface ProductCategoryDocument {
  id: string
  tenantId: string
  categoryCode: string
  categoryName: string
  parentCategoryId?: string
  description?: string
  taxRate: number
  isActive: boolean
  sortOrder: number
  metadata?: any
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface SupplierDocument {
  id: string
  tenantId: string
  supplierCode: string
  supplierName: string
  contactPerson?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  taxId?: string
  paymentTerms?: string
  creditLimit: number
  isActive: boolean
  notes?: string
  metadata?: any
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface LocationDocument {
  id: string
  tenantId: string
  locationCode: string
  locationName: string
  locationType: 'store' | 'warehouse' | 'outlet' | 'online'
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
  managerName?: string
  isActive: boolean
  isDefault: boolean
  sortOrder: number
  metadata?: any
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface ProductVariantDocument {
  id: string
  tenantId: string
  productId: string
  variantCode: string
  variantName: string
  sku?: string
  barcode?: string
  variantType: 'size' | 'color' | 'style' | 'material' | 'flavor' | 'other'
  variantValue: string
  costPrice: number
  sellingPrice?: number
  weight?: number
  dimensions?: string
  imageUrl?: string
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  metadata?: any
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface StockLevelDocument {
  id: string
  tenantId: string
  productId: string
  variantId?: string
  locationId: string
  currentStock: number
  reservedStock: number
  availableStock: number
  costPerUnit: number
  lastCountedAt?: string
  lastMovementAt?: string
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface PurchaseOrderDocument {
  id: string
  tenantId: string
  poNumber: string
  supplierId: string
  locationId: string
  orderDate: string
  expectedDeliveryDate?: string
  actualDeliveryDate?: string
  status: 'draft' | 'sent' | 'confirmed' | 'partial' | 'completed' | 'cancelled'
  subtotal: number
  taxAmount: number
  shippingCost: number
  discountAmount: number
  totalAmount: number
  paymentTerms?: string
  notes?: string
  createdBy: string
  approvedBy?: string
  approvedAt?: string
  metadata?: any
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface PurchaseOrderItemDocument {
  id: string
  tenantId: string
  purchaseOrderId: string
  productId: string
  variantId?: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: number
  lineTotal: number
  notes?: string
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface StockMovementDocument {
  id: string
  tenantId: string
  productId: string
  variantId?: string
  locationId: string
  movementType: 'in' | 'out' | 'transfer' | 'adjustment' | 'audit'
  movementReason: 'purchase' | 'sale' | 'return' | 'transfer_in' | 'transfer_out' | 'adjustment_positive' | 'adjustment_negative' | 'audit_correction' | 'damaged' | 'expired' | 'theft' | 'promotion' | 'sample'
  quantityChange: number
  costPerUnit: number
  referenceType?: string
  referenceId?: string
  batchId?: string
  serialNumber?: string
  expiryDate?: string
  notes?: string
  createdBy: string
  createdAt: string
  _deleted: boolean
}

export interface StockAuditDocument {
  id: string
  tenantId: string
  auditNumber: string
  locationId: string
  auditType: 'full' | 'partial' | 'cycle'
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  plannedDate: string
  startedAt?: string
  completedAt?: string
  totalItemsPlanned: number
  totalItemsCounted: number
  discrepancyCount: number
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface ProductSerialNumberDocument {
  id: string
  tenantId: string
  productId: string
  variantId?: string
  locationId: string
  serialNumber: string
  batchNumber?: string
  manufactureDate?: string
  expiryDate?: string
  costPrice: number
  status: 'available' | 'reserved' | 'sold' | 'damaged' | 'expired' | 'returned'
  purchaseOrderId?: string
  transactionId?: string
  notes?: string
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

export interface LowStockAlertDocument {
  id: string
  tenantId: string
  productId: string
  variantId?: string
  locationId: string
  alertThreshold: number
  currentStock: number
  isActive: boolean
  lastAlertedAt?: string
  alertFrequencyHours: number
  notificationEmails: string[]
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

// TypeScript interfaces
export interface ProductDocument {
  id: string
  tenantId: string
  name: string
  price: number
  categoryId?: string
  supplierId?: string
  stock: number
  image?: string
  barcode?: string
  updatedAt: string
  _deleted: boolean
}

export interface TransactionDocument {
  id: string
  items: Array<{
    productId: string
    name: string
    price: number
    quantity: number
    subtotal: number
  }>
  subtotal: number
  discounts: Array<{
    id: string
    type: string
    name: string
    amount: number
  }>
  taxes: Array<{
    id: string
    name: string
    rate: number
    amount: number
  }>
  fees: Array<{
    id: string
    name: string
    amount: number
  }>
  total: number
  paymentMethod: string
  paymentStatus: 'pending' | 'completed' | 'failed' | 'cancelled'
  customerInfo?: {
    name?: string
    phone?: string
    email?: string
  }
  cashier: string
  notes?: string
  createdAt: string
  updatedAt: string
  syncedAt?: string
  _deleted: boolean
}

export interface CustomerDocument {
  id: string
  name: string
  phone: string
  email?: string
  loyaltyPoints: number
  totalSpent: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  joinDate: string
  lastVisit?: string
  updatedAt: string
  _deleted: boolean
}

export interface DraftTransactionDocument {
  id: string
  items: Array<{
    productId: string
    name: string
    price: number
    quantity: number
    subtotal: number
  }>
  customerInfo?: {
    name?: string
    phone?: string
    email?: string
  }
  subtotal: number
  total: number
  paidAmount: number
  remainingAmount: number
  status: 'draft' | 'layaway' | 'ready_for_pickup'
  dueDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
  _deleted: boolean
}

// Database collections type
export interface OfflineCollections {
  // Original POS collections
  products: RxCollection<ProductDocument>
  transactions: RxCollection<TransactionDocument>
  customers: RxCollection<CustomerDocument>
  drafts: RxCollection<DraftTransactionDocument>
  
  // Inventory Management collections
  productCategories: RxCollection<ProductCategoryDocument>
  suppliers: RxCollection<SupplierDocument>
  locations: RxCollection<LocationDocument>
  productVariants: RxCollection<ProductVariantDocument>
  stockLevels: RxCollection<StockLevelDocument>
  purchaseOrders: RxCollection<PurchaseOrderDocument>
  purchaseOrderItems: RxCollection<PurchaseOrderItemDocument>
  stockMovements: RxCollection<StockMovementDocument>
  stockAudits: RxCollection<StockAuditDocument>
  productSerialNumbers: RxCollection<ProductSerialNumberDocument>
  lowStockAlerts: RxCollection<LowStockAlertDocument>
}

export type OfflineDatabase = RxDatabase<OfflineCollections>

let db: OfflineDatabase | null = null

export const initOfflineDatabase = async (): Promise<OfflineDatabase> => {
  if (db) return db

  try {
    console.log('Initializing offline database...')
    
    db = await createRxDatabase<OfflineCollections>({
      name: 'pos_offline_db',
      storage: getRxStorageDexie(),
      eventReduce: true,
      cleanupPolicy: {
        minimumDeletedTime: 1000 * 60 * 60 * 24 * 7, // One week
        minimumCollectionAge: 1000 * 60 * 60 * 24, // One day
        runEach: 1000 * 60 * 5, // Every 5 minutes
        awaitReplicationsInSync: true,
        waitForLeadership: true
      }
    })

    // Add collections
    await db.addCollections({
      // Original POS collections
      products: {
        schema: productSchema
      },
      transactions: {
        schema: transactionSchema
      },
      customers: {
        schema: customerSchema
      },
      drafts: {
        schema: draftTransactionSchema
      },
      
      // Inventory Management collections
      productCategories: {
        schema: productCategorySchema
      },
      suppliers: {
        schema: supplierSchema
      },
      locations: {
        schema: locationSchema
      },
      productVariants: {
        schema: productVariantSchema
      },
      stockLevels: {
        schema: stockLevelSchema
      },
      purchaseOrders: {
        schema: purchaseOrderSchema
      },
      purchaseOrderItems: {
        schema: purchaseOrderItemSchema
      },
      stockMovements: {
        schema: stockMovementSchema
      },
      stockAudits: {
        schema: stockAuditSchema
      },
      productSerialNumbers: {
        schema: productSerialNumberSchema
      },
      lowStockAlerts: {
        schema: lowStockAlertSchema
      }
    })

    console.log('Offline database initialized successfully')
    return db
  } catch (error) {
    console.error('Failed to initialize offline database:', error)
    throw error
  }
}

export const getOfflineDatabase = (): OfflineDatabase | null => {
  return db
}

export const closeOfflineDatabase = async (): Promise<void> => {
  if (db) {
    await db.remove()
    db = null
  }
}