import {
  createRxDatabase,
  addRxPlugin,
  RxDatabase,
  RxCollection,
  RxJsonSchema,
  RxDocument
} from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'

// Product schema based on CartItem interface
const productSchema: RxJsonSchema<ProductDocument> = {
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
    price: {
      type: 'number',
      minimum: 0
    },
    category: {
      type: 'string'
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
  required: ['id', 'name', 'price', 'category', 'stock', 'updatedAt'],
  indexes: ['category', 'barcode']
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

// TypeScript interfaces
export interface ProductDocument {
  id: string
  name: string
  price: number
  category: string
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
  products: RxCollection<ProductDocument>
  transactions: RxCollection<TransactionDocument>
  customers: RxCollection<CustomerDocument>
  drafts: RxCollection<DraftTransactionDocument>
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