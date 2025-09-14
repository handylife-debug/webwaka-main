'use client'

import React, { useState, useEffect, useContext, createContext, ReactNode } from 'react'
import { 
  initOfflineDatabase, 
  getOfflineDatabase, 
  OfflineDatabase,
  ProductDocument,
  TransactionDocument,
  CustomerDocument,
  DraftTransactionDocument
} from '../../../lib/offline-database'
import { Wifi, WifiOff, CloudOff, Cloud, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

// Offline context for state management
interface OfflineContextType {
  isOnline: boolean
  database: OfflineDatabase | null
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncTime: Date | null
  pendingSyncCount: number
  
  // Database operations
  addProduct: (product: Omit<ProductDocument, 'id' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateProduct: (id: string, updates: Partial<ProductDocument>) => Promise<void>
  getProducts: () => Promise<ProductDocument[]>
  getProduct: (id: string) => Promise<ProductDocument | null>
  
  // Transaction operations
  saveTransaction: (transaction: Omit<TransactionDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>) => Promise<string>
  getTransactions: () => Promise<TransactionDocument[]>
  getPendingTransactions: () => Promise<TransactionDocument[]>
  
  // Customer operations
  addCustomer: (customer: Omit<CustomerDocument, 'id' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateCustomer: (id: string, updates: Partial<CustomerDocument>) => Promise<void>
  getCustomers: () => Promise<CustomerDocument[]>
  getCustomerByPhone: (phone: string) => Promise<CustomerDocument | null>
  
  // Draft operations
  saveDraft: (draft: Omit<DraftTransactionDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateDraft: (id: string, updates: Partial<DraftTransactionDocument>) => Promise<void>
  getDrafts: () => Promise<DraftTransactionDocument[]>
  deleteDraft: (id: string) => Promise<void>
  
  // Sync operations
  triggerSync: () => Promise<void>
  clearOfflineData: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextType | null>(null)

export const useOffline = () => {
  const context = useContext(OfflineContext)
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider')
  }
  return context
}

interface OfflineProviderProps {
  children: ReactNode
}

export const OfflineProvider: React.FC<OfflineProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [database, setDatabase] = useState<OfflineDatabase | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize offline database
  useEffect(() => {
    const initDb = async () => {
      try {
        console.log('Initializing offline database...')
        const db = await initOfflineDatabase()
        setDatabase(db)
        setIsInitialized(true)
        console.log('Offline database ready')
        
        // Load initial sample data if empty
        await loadSampleData(db)
        
        // Count pending transactions
        const pendingTxns = await db.transactions.find({
          selector: { syncedAt: { $exists: false } }
        }).exec()
        setPendingSyncCount(pendingTxns.length)
        
      } catch (error) {
        console.error('Failed to initialize offline database:', error)
        setIsInitialized(true) // Still set to true to avoid infinite loading
      }
    }

    initDb()
  }, [])

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      console.log('Device is online')
      // Auto-trigger sync when coming back online
      if (database && pendingSyncCount > 0) {
        triggerSync()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('Device is offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [database, pendingSyncCount])

  // Load sample data for demo
  const loadSampleData = async (db: OfflineDatabase) => {
    try {
      // Check if products already exist
      const existingProducts = await db.products.find().exec()
      if (existingProducts.length > 0) return

      console.log('Loading sample products...')
      
      const sampleProducts = [
        {
          id: 'prod_1',
          name: 'Nigerian Jollof Rice',
          price: 1500,
          category: 'Food',
          stock: 50,
          image: '/images/jollof-rice.jpg',
          barcode: '123456789001',
          updatedAt: new Date().toISOString(),
          _deleted: false
        },
        {
          id: 'prod_2', 
          name: 'Coca Cola 350ml',
          price: 200,
          category: 'Beverages',
          stock: 100,
          image: '/images/coca-cola.jpg',
          barcode: '123456789002',
          updatedAt: new Date().toISOString(),
          _deleted: false
        },
        {
          id: 'prod_3',
          name: 'Gala Sausage Roll',
          price: 150,
          category: 'Snacks',
          stock: 75,
          image: '/images/gala.jpg',
          barcode: '123456789003',
          updatedAt: new Date().toISOString(),
          _deleted: false
        }
      ]

      await db.products.bulkInsert(sampleProducts)
      console.log('Sample products loaded')
    } catch (error) {
      console.error('Error loading sample data:', error)
    }
  }

  // Product operations
  const addProduct = async (productData: Omit<ProductDocument, 'id' | 'updatedAt' | '_deleted'>): Promise<string> => {
    if (!database) throw new Error('Database not initialized')
    
    const id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const product: ProductDocument = {
      ...productData,
      id,
      updatedAt: new Date().toISOString(),
      _deleted: false
    }
    
    await database.products.insert(product)
    return id
  }

  const updateProduct = async (id: string, updates: Partial<ProductDocument>): Promise<void> => {
    if (!database) throw new Error('Database not initialized')
    
    const product = await database.products.findOne(id).exec()
    if (!product) throw new Error('Product not found')
    
    await product.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }

  const getProducts = async (): Promise<ProductDocument[]> => {
    if (!database) return []
    
    const products = await database.products.find({
      selector: { _deleted: { $ne: true } }
    }).exec()
    
    return products.map(doc => doc.toJSON())
  }

  const getProduct = async (id: string): Promise<ProductDocument | null> => {
    if (!database) return null
    
    const product = await database.products.findOne({
      selector: { id, _deleted: { $ne: true } }
    }).exec()
    
    return product ? product.toJSON() : null
  }

  // Transaction operations
  const saveTransaction = async (transactionData: Omit<TransactionDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>): Promise<string> => {
    if (!database) throw new Error('Database not initialized')
    
    const id = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()
    
    const transaction: TransactionDocument = {
      ...transactionData,
      id,
      createdAt: now,
      updatedAt: now,
      _deleted: false
    }
    
    await database.transactions.insert(transaction)
    
    // Update pending sync count
    const pendingTxns = await database.transactions.find({
      selector: { syncedAt: { $exists: false } }
    }).exec()
    setPendingSyncCount(pendingTxns.length)
    
    return id
  }

  const getTransactions = async (): Promise<TransactionDocument[]> => {
    if (!database) return []
    
    const transactions = await database.transactions.find({
      selector: { _deleted: { $ne: true } },
      sort: [{ createdAt: 'desc' }]
    }).exec()
    
    return transactions.map(doc => doc.toJSON() as TransactionDocument)
  }

  const getPendingTransactions = async (): Promise<TransactionDocument[]> => {
    if (!database) return []
    
    const transactions = await database.transactions.find({
      selector: { 
        _deleted: { $ne: true },
        syncedAt: { $exists: false }
      }
    }).exec()
    
    return transactions.map(doc => doc.toJSON() as TransactionDocument)
  }

  // Customer operations
  const addCustomer = async (customerData: Omit<CustomerDocument, 'id' | 'updatedAt' | '_deleted'>): Promise<string> => {
    if (!database) throw new Error('Database not initialized')
    
    const id = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const customer: CustomerDocument = {
      ...customerData,
      id,
      updatedAt: new Date().toISOString(),
      _deleted: false
    }
    
    await database.customers.insert(customer)
    return id
  }

  const updateCustomer = async (id: string, updates: Partial<CustomerDocument>): Promise<void> => {
    if (!database) throw new Error('Database not initialized')
    
    const customer = await database.customers.findOne(id).exec()
    if (!customer) throw new Error('Customer not found')
    
    await customer.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }

  const getCustomers = async (): Promise<CustomerDocument[]> => {
    if (!database) return []
    
    const customers = await database.customers.find({
      selector: { _deleted: { $ne: true } }
    }).exec()
    
    return customers.map(doc => doc.toJSON())
  }

  const getCustomerByPhone = async (phone: string): Promise<CustomerDocument | null> => {
    if (!database) return null
    
    const customer = await database.customers.findOne({
      selector: { phone, _deleted: { $ne: true } }
    }).exec()
    
    return customer ? customer.toJSON() : null
  }

  // Draft operations
  const saveDraft = async (draftData: Omit<DraftTransactionDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>): Promise<string> => {
    if (!database) throw new Error('Database not initialized')
    
    const id = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()
    
    const draft: DraftTransactionDocument = {
      ...draftData,
      id,
      createdAt: now,
      updatedAt: now,
      _deleted: false
    }
    
    await database.drafts.insert(draft)
    return id
  }

  const updateDraft = async (id: string, updates: Partial<DraftTransactionDocument>): Promise<void> => {
    if (!database) throw new Error('Database not initialized')
    
    const draft = await database.drafts.findOne(id).exec()
    if (!draft) throw new Error('Draft not found')
    
    await draft.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }

  const getDrafts = async (): Promise<DraftTransactionDocument[]> => {
    if (!database) return []
    
    const drafts = await database.drafts.find({
      selector: { _deleted: { $ne: true } },
      sort: [{ updatedAt: 'desc' }]
    }).exec()
    
    return drafts.map(doc => doc.toJSON() as DraftTransactionDocument)
  }

  const deleteDraft = async (id: string): Promise<void> => {
    if (!database) throw new Error('Database not initialized')
    
    const draft = await database.drafts.findOne(id).exec()
    if (!draft) throw new Error('Draft not found')
    
    await draft.update({
      $set: {
        _deleted: true,
        updatedAt: new Date().toISOString()
      }
    })
  }

  // Sync operations
  const triggerSync = async (): Promise<void> => {
    if (!database || !isOnline) {
      console.log('Cannot sync: database not ready or offline')
      return
    }

    setSyncStatus('syncing')
    
    try {
      console.log('Starting data synchronization...')
      
      // Get pending transactions
      const pendingTransactions = await getPendingTransactions()
      
      if (pendingTransactions.length > 0) {
        console.log(`Syncing ${pendingTransactions.length} pending transactions...`)
        
        // Send to server
        const response = await fetch('/api/pos/sync-transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transactions: pendingTransactions })
        })

        if (response.ok) {
          // Mark transactions as synced
          for (const txn of pendingTransactions) {
            const doc = await database.transactions.findOne(txn.id).exec()
            if (doc) {
              await doc.update({
                $set: {
                  syncedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }
              })
            }
          }
          
          setPendingSyncCount(0)
          console.log('Sync completed successfully')
        } else {
          console.error('Sync failed with server error')
          throw new Error('Server sync failed')
        }
      }
      
      setSyncStatus('success')
      setLastSyncTime(new Date())
      
      // Reset status after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000)
      
    } catch (error) {
      console.error('Sync error:', error)
      setSyncStatus('error')
      
      // Reset status after 5 seconds
      setTimeout(() => setSyncStatus('idle'), 5000)
    }
  }

  const clearOfflineData = async (): Promise<void> => {
    if (!database) return
    
    try {
      await database.products.remove()
      await database.transactions.remove()
      await database.customers.remove()
      await database.drafts.remove()
      
      setPendingSyncCount(0)
      console.log('Offline data cleared')
    } catch (error) {
      console.error('Error clearing offline data:', error)
    }
  }

  const contextValue: OfflineContextType = {
    isOnline,
    database,
    syncStatus,
    lastSyncTime,
    pendingSyncCount,
    
    addProduct,
    updateProduct,
    getProducts,
    getProduct,
    
    saveTransaction,
    getTransactions,
    getPendingTransactions,
    
    addCustomer,
    updateCustomer,
    getCustomers,
    getCustomerByPhone,
    
    saveDraft,
    updateDraft,
    getDrafts,
    deleteDraft,
    
    triggerSync,
    clearOfflineData
  }

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-gray-600">Initializing offline database...</p>
        </div>
      </div>
    )
  }

  return (
    <OfflineContext.Provider value={contextValue}>
      {children}
    </OfflineContext.Provider>
  )
}

// Offline status indicator component
export const OfflineStatusIndicator: React.FC = () => {
  const { isOnline, syncStatus, pendingSyncCount, lastSyncTime, triggerSync } = useOffline()

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="h-5 w-5 text-red-500" />
    
    switch (syncStatus) {
      case 'syncing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return pendingSyncCount > 0 ? 
          <CloudOff className="h-5 w-5 text-yellow-500" /> : 
          <Cloud className="h-5 w-5 text-green-500" />
    }
  }

  const getStatusText = () => {
    if (!isOnline) return 'Offline'
    
    switch (syncStatus) {
      case 'syncing':
        return 'Syncing...'
      case 'success':
        return 'Synced'
      case 'error':
        return 'Sync Error'
      default:
        return pendingSyncCount > 0 ? `${pendingSyncCount} pending` : 'Online'
    }
  }

  return (
    <div className="flex items-center space-x-2 px-3 py-2 bg-white rounded-lg shadow-sm border">
      {getStatusIcon()}
      <span className="text-sm font-medium text-gray-700">{getStatusText()}</span>
      
      {isOnline && pendingSyncCount > 0 && (
        <button
          onClick={triggerSync}
          disabled={syncStatus === 'syncing'}
          className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Sync Now
        </button>
      )}
      
      {lastSyncTime && (
        <span className="text-xs text-gray-500">
          Last: {lastSyncTime.toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}