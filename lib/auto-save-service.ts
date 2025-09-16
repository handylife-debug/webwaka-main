import { openDB, DBSchema, IDBPDatabase } from 'idb'

export interface SavedTransaction {
  id: string
  tenantId: string
  data: any
  savedAt: Date
  isInterrupted: boolean
  isRestored: boolean
  metadata: {
    userAgent?: string
    sessionId?: string
    deviceInfo?: string
    transactionType?: 'sale' | 'return' | 'void' | 'exchange'
    location?: string
  }
}

export interface AutoSaveSettings {
  id: string // tenantId for unique identification
  enabled: boolean
  saveInterval: number // seconds
  maxSavedTransactions: number
  retentionDays: number
  autoRecovery: boolean
  savePartialTransactions: boolean
  compressData: boolean
  encryptData: boolean
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'restoring' | 'restored' | 'error'

export interface AutoSaveAnalytics {
  id: string // tenantId for unique identification
  totalSaves: number
  successfulSaves: number
  failedSaves: number
  totalRestores: number
  averageSaveTime: number
  storageUsed: number
  lastCleanup: Date
}

interface AutoSaveDB extends DBSchema {
  transactions: {
    key: string
    value: SavedTransaction
    indexes: { 
      'by-tenant': string
      'by-tenant-date': [string, string]
      'by-interrupted': [string, boolean]
    }
  }
  settings: {
    key: string
    value: AutoSaveSettings
  }
  analytics: {
    key: string
    value: AutoSaveAnalytics
  }
  sessions: {
    key: string
    value: {
      id: string
      tenantId: string
      startedAt: Date
      lastActivity: Date
      isActive: boolean
      currentTransactionId?: string
    }
  }
}

/**
 * WebWaka Biological Cell: Auto-Save Service
 * 
 * Provides atomic, reusable transaction persistence functionality for POS systems.
 * Handles automatic saving, interruption detection, and transaction recovery.
 * Uses IndexedDB for persistent storage that survives page reloads and crashes.
 * Follows WebWaka principles of single responsibility and tenant isolation.
 */
export class AutoSaveService {
  private tenantId: string
  private sessionId: string
  private currentTransactionId: string | null = null
  private db: IDBPDatabase<AutoSaveDB> | null = null
  private encryptionKey: CryptoKey | null = null

  constructor(tenantId: string) {
    this.tenantId = tenantId
    this.sessionId = this.generateSessionId()
    this.initializeService()
    this.setupUnloadListener()
  }

  /**
   * Initialize the service with IndexedDB and defaults
   */
  private async initializeService(): Promise<void> {
    try {
      // Initialize IndexedDB
      await this.initializeDB()
      
      // Initialize encryption key if needed
      await this.initializeEncryption()
      
      // Initialize defaults and session
      await this.initializeDefaults()
      await this.initializeSession()
      
      // Check for interrupted transactions from previous sessions
      await this.detectAndMarkInterruptions()
    } catch (error) {
      console.error('Failed to initialize AutoSave service:', error)
    }
  }

  /**
   * Initialize IndexedDB with schema
   */
  private async initializeDB(): Promise<void> {
    this.db = await openDB<AutoSaveDB>('AutoSaveDB', 1, {
      upgrade(db) {
        // Transactions store
        const transactionStore = db.createObjectStore('transactions', {
          keyPath: 'id'
        })
        transactionStore.createIndex('by-tenant', 'tenantId')
        transactionStore.createIndex('by-tenant-date', ['tenantId', 'savedAt'])
        transactionStore.createIndex('by-interrupted', ['tenantId', 'isInterrupted'])

        // Settings store
        db.createObjectStore('settings', {
          keyPath: 'id'
        })

        // Analytics store
        db.createObjectStore('analytics', {
          keyPath: 'id'
        })

        // Sessions store
        db.createObjectStore('sessions', {
          keyPath: 'id'
        })
      }
    })
  }

  /**
   * Initialize encryption key for secure data storage
   */
  private async initializeEncryption(): Promise<void> {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      return
    }

    try {
      // Try to load existing key from localStorage
      const storedKey = localStorage.getItem(`autosave-key-${this.tenantId}`)
      
      if (storedKey) {
        // Import existing key
        const keyData = new Uint8Array(
          atob(storedKey).split('').map(char => char.charCodeAt(0))
        )
        this.encryptionKey = await window.crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        )
      } else {
        // Generate new key
        this.encryptionKey = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        )
        
        // Store key for future sessions
        const exportedKey = await window.crypto.subtle.exportKey('raw', this.encryptionKey)
        const keyString = btoa(
          String.fromCharCode(...new Uint8Array(exportedKey))
        )
        localStorage.setItem(`autosave-key-${this.tenantId}`, keyString)
      }
    } catch (error) {
      console.warn('Failed to initialize encryption:', error)
      this.encryptionKey = null
    }
  }

  /**
   * Initialize default settings and analytics for the tenant
   */
  private async initializeDefaults(): Promise<void> {
    if (!this.db) return

    // Check if settings exist
    const existingSettings = await this.db.get('settings', this.tenantId)
    if (!existingSettings) {
      const defaultSettings: AutoSaveSettings = {
        id: this.tenantId,
        enabled: true,
        saveInterval: 30, // 30 seconds
        maxSavedTransactions: 25,
        retentionDays: 7,
        autoRecovery: true,
        savePartialTransactions: true,
        compressData: false,
        encryptData: false
      }
      await this.db.put('settings', defaultSettings)
    }

    // Check if analytics exist
    const existingAnalytics = await this.db.get('analytics', this.tenantId)
    if (!existingAnalytics) {
      const defaultAnalytics: AutoSaveAnalytics = {
        id: this.tenantId,
        totalSaves: 0,
        successfulSaves: 0,
        failedSaves: 0,
        totalRestores: 0,
        averageSaveTime: 0,
        storageUsed: 0,
        lastCleanup: new Date()
      }
      await this.db.put('analytics', defaultAnalytics)
    }
  }

  /**
   * Initialize session tracking
   */
  private async initializeSession(): Promise<void> {
    if (!this.db) return

    const sessionData = {
      id: this.sessionId,
      tenantId: this.tenantId,
      startedAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    }

    await this.db.put('sessions', sessionData)
    
    // Mark all other sessions for this tenant as inactive
    const tx = this.db.transaction('sessions', 'readwrite')
    const sessions = await tx.store.getAll()
    
    for (const session of sessions) {
      if (session.tenantId === this.tenantId && session.id !== this.sessionId) {
        session.isActive = false
        await tx.store.put(session)
      }
    }
    
    await tx.done
  }

  /**
   * Detect interruptions from previous sessions and mark transactions
   */
  private async detectAndMarkInterruptions(): Promise<void> {
    if (!this.db) return

    try {
      // Get all inactive sessions for this tenant that might have been interrupted
      const tx = this.db.transaction(['sessions', 'transactions'], 'readwrite')
      const sessions = await tx.objectStore('sessions').getAll()
      
      const interruptedSessions = sessions.filter(session => 
        session.tenantId === this.tenantId && 
        !session.isActive &&
        session.currentTransactionId
      )

      // Mark transactions from interrupted sessions as interrupted
      for (const session of interruptedSessions) {
        if (session.currentTransactionId) {
          const transaction = await tx.objectStore('transactions').get(session.currentTransactionId)
          if (transaction && !transaction.isInterrupted) {
            transaction.isInterrupted = true
            await tx.objectStore('transactions').put(transaction)
          }
        }
      }

      await tx.done
    } catch (error) {
      console.error('Failed to detect interruptions:', error)
    }
  }

  /**
   * Setup page unload listener to detect interruptions and persist session state
   */
  private setupUnloadListener(): void {
    if (typeof window === 'undefined') return

    const handleUnload = () => {
      // Update session with current transaction to detect interruption on reload
      if (this.currentTransactionId) {
        const sessionData = {
          tenantId: this.tenantId,
          currentTransactionId: this.currentTransactionId,
          wasInterrupted: true,
          lastActivity: Date.now()
        }
        
        // Use localStorage for synchronous storage during unload
        localStorage.setItem(`autosave-session-${this.sessionId}`, JSON.stringify(sessionData))
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleUnload()
      }
    })
    
    // Store cleanup function for later use
    this.cleanup = () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }

  /**
   * Save a transaction with auto-generated ID and metadata
   */
  async saveTransaction(transactionData: any): Promise<string> {
    const startTime = Date.now()
    
    try {
      const settings = await this.getSettings()
      if (!settings.enabled) {
        throw new Error('Auto-save is disabled')
      }

      // Validate transaction data
      if (!this.isValidTransaction(transactionData, settings.savePartialTransactions)) {
        throw new Error('Invalid transaction data')
      }

      const transactionId = this.generateTransactionId()
      const savedTransaction: SavedTransaction = {
        id: transactionId,
        tenantId: this.tenantId,
        data: settings.compressData ? this.compressData(transactionData) : transactionData,
        savedAt: new Date(),
        isInterrupted: false,
        isRestored: false,
        metadata: {
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
          sessionId: this.sessionId,
          deviceInfo: this.getDeviceInfo(),
          transactionType: this.detectTransactionType(transactionData),
          location: transactionData.location || 'main'
        }
      }

      // Encrypt data if enabled
      if (settings.encryptData) {
        savedTransaction.data = await this.encryptData(savedTransaction.data)
      }

      // Save transaction
      await this.storeTransaction(savedTransaction)
      this.currentTransactionId = transactionId

      // Update analytics
      await this.updateSaveAnalytics(Date.now() - startTime, true)

      // Cleanup old transactions
      await this.cleanupOldTransactions()

      return transactionId
    } catch (error) {
      await this.updateSaveAnalytics(Date.now() - startTime, false)
      throw error
    }
  }

  /**
   * Store transaction in IndexedDB with persistent storage
   */
  private async storeTransaction(transaction: SavedTransaction): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      // Store transaction in IndexedDB
      await this.db.put('transactions', transaction)
      
      // Update session with current transaction ID
      const session = await this.db.get('sessions', this.sessionId)
      if (session) {
        session.currentTransactionId = transaction.id
        session.lastActivity = new Date()
        await this.db.put('sessions', session)
      }

      // Enforce max transactions limit
      const settings = await this.getSettings()
      const tenantTransactions = await this.db.getAllFromIndex('transactions', 'by-tenant-date', IDBKeyRange.bound(
        [this.tenantId, new Date(0)], 
        [this.tenantId, new Date()]
      ))
      
      if (tenantTransactions.length > settings.maxSavedTransactions) {
        const transactionsToDelete = tenantTransactions
          .sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime())
          .slice(0, tenantTransactions.length - settings.maxSavedTransactions)
        
        const tx = this.db.transaction('transactions', 'readwrite')
        for (const oldTransaction of transactionsToDelete) {
          await tx.store.delete(oldTransaction.id)
        }
        await tx.done
      }
    } catch (error) {
      console.error('Failed to store transaction:', error)
      throw error
    }
  }

  /**
   * Get all saved transactions for the tenant from IndexedDB
   */
  async getSavedTransactions(): Promise<SavedTransaction[]> {
    if (!this.db) return []

    try {
      const transactions = await this.db.getAllFromIndex('transactions', 'by-tenant-date', IDBKeyRange.bound(
        [this.tenantId, new Date(0)], 
        [this.tenantId, new Date()]
      ))
      
      // Sort by saved date (newest first)
      const sortedTransactions = transactions.sort((a, b) => 
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      )
      
      // Decrypt and decompress data if needed
      const settings = await this.getSettings()
      const processedTransactions = await Promise.all(
        sortedTransactions.map(async transaction => {
          let data = transaction.data
          
          // Decrypt if encrypted
          if (settings.encryptData) {
            data = await this.decryptData(data)
          }
          
          // Decompress if compressed
          if (settings.compressData) {
            data = this.decompressData(data)
          }
          
          return {
            ...transaction,
            data,
            // Ensure dates are proper Date objects
            savedAt: new Date(transaction.savedAt)
          }
        })
      )
      
      return processedTransactions
    } catch (error) {
      console.error('Failed to get saved transactions:', error)
      return []
    }
  }

  /**
   * Get transactions that were interrupted from IndexedDB
   */
  async getInterruptedTransactions(): Promise<SavedTransaction[]> {
    if (!this.db) return []

    try {
      const interruptedTransactions = await this.db.getAllFromIndex('transactions', 'by-interrupted', IDBKeyRange.only([this.tenantId, true]))
      
      // Filter out restored transactions and process data
      const unrestoredTransactions = interruptedTransactions.filter(t => !t.isRestored)
      
      const settings = await this.getSettings()
      return Promise.all(
        unrestoredTransactions.map(async transaction => {
          let data = transaction.data
          
          if (settings.encryptData) {
            data = await this.decryptData(data)
          }
          
          if (settings.compressData) {
            data = this.decompressData(data)
          }
          
          return {
            ...transaction,
            data,
            savedAt: new Date(transaction.savedAt)
          }
        })
      )
    } catch (error) {
      console.error('Failed to get interrupted transactions:', error)
      return []
    }
  }

  /**
   * Mark a transaction as restored in IndexedDB
   */
  async markTransactionRestored(transactionId: string): Promise<void> {
    if (!this.db) return

    try {
      const tx = this.db.transaction(['transactions', 'analytics'], 'readwrite')
      
      // Update transaction
      const transaction = await tx.objectStore('transactions').get(transactionId)
      if (transaction && transaction.tenantId === this.tenantId) {
        transaction.isRestored = true
        await tx.objectStore('transactions').put(transaction)
        
        // Update analytics
        const analytics = await tx.objectStore('analytics').get(this.tenantId)
        if (analytics) {
          analytics.totalRestores++
          await tx.objectStore('analytics').put(analytics)
        }
      }
      
      await tx.done
    } catch (error) {
      console.error('Failed to mark transaction as restored:', error)
      throw error
    }
  }

  /**
   * Mark a transaction as interrupted in IndexedDB
   */
  private async markTransactionInterrupted(transactionId: string): Promise<void> {
    if (!this.db) return

    try {
      const transaction = await this.db.get('transactions', transactionId)
      if (transaction && transaction.tenantId === this.tenantId) {
        transaction.isInterrupted = true
        await this.db.put('transactions', transaction)
      }
    } catch (error) {
      console.error('Failed to mark transaction as interrupted:', error)
    }
  }

  /**
   * Delete a specific transaction from IndexedDB
   */
  async deleteTransaction(transactionId: string): Promise<void> {
    if (!this.db) return

    try {
      // Verify transaction belongs to this tenant before deleting
      const transaction = await this.db.get('transactions', transactionId)
      if (transaction && transaction.tenantId === this.tenantId) {
        await this.db.delete('transactions', transactionId)
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error)
      throw error
    }
  }

  /**
   * Clear all transactions for the tenant from IndexedDB
   */
  async clearAllTransactions(): Promise<void> {
    if (!this.db) return

    try {
      // Get all transactions for this tenant and delete them
      const tenantTransactions = await this.db.getAllFromIndex('transactions', 'by-tenant', this.tenantId)
      
      const tx = this.db.transaction('transactions', 'readwrite')
      for (const transaction of tenantTransactions) {
        await tx.store.delete(transaction.id)
      }
      await tx.done
    } catch (error) {
      console.error('Failed to clear transactions:', error)
      throw error
    }
  }

  /**
   * Get auto-save settings from IndexedDB with fallback to defaults
   */
  async getSettings(): Promise<AutoSaveSettings> {
    if (!this.db) {
      return {
        id: this.tenantId,
        enabled: true,
        saveInterval: 30,
        maxSavedTransactions: 25,
        retentionDays: 7,
        autoRecovery: true,
        savePartialTransactions: true,
        compressData: false,
        encryptData: false
      }
    }

    try {
      const settings = await this.db.get('settings', this.tenantId)
      if (settings) {
        return settings
      }
      
      // Return defaults if no settings found
      const defaultSettings: AutoSaveSettings = {
        id: this.tenantId,
        enabled: true,
        saveInterval: 30,
        maxSavedTransactions: 25,
        retentionDays: 7,
        autoRecovery: true,
        savePartialTransactions: true,
        compressData: false,
        encryptData: false
      }
      
      // Store defaults for future use
      await this.db.put('settings', defaultSettings)
      return defaultSettings
    } catch (error) {
      console.error('Failed to get settings:', error)
      // Return defaults on error
      return {
        id: this.tenantId,
        enabled: true,
        saveInterval: 30,
        maxSavedTransactions: 25,
        retentionDays: 7,
        autoRecovery: true,
        savePartialTransactions: true,
        compressData: false,
        encryptData: false
      }
    }
  }

  /**
   * Update auto-save settings in IndexedDB
   */
  async updateSettings(settings: AutoSaveSettings): Promise<void> {
    if (!this.db) return

    try {
      // Ensure the settings have the correct tenant ID
      const settingsWithId = {
        ...settings,
        id: this.tenantId
      }
      
      await this.db.put('settings', settingsWithId)
    } catch (error) {
      console.error('Failed to update settings:', error)
      throw error
    }
  }

  /**
   * Get auto-save analytics from IndexedDB with fallback to defaults
   */
  async getAnalytics(): Promise<AutoSaveAnalytics> {
    if (!this.db) {
      return {
        id: this.tenantId,
        totalSaves: 0,
        successfulSaves: 0,
        failedSaves: 0,
        totalRestores: 0,
        averageSaveTime: 0,
        storageUsed: 0,
        lastCleanup: new Date()
      }
    }

    try {
      const analytics = await this.db.get('analytics', this.tenantId)
      if (analytics) {
        return {
          ...analytics,
          lastCleanup: new Date(analytics.lastCleanup)
        }
      }
      
      // Return defaults if no analytics found
      const defaultAnalytics: AutoSaveAnalytics = {
        id: this.tenantId,
        totalSaves: 0,
        successfulSaves: 0,
        failedSaves: 0,
        totalRestores: 0,
        averageSaveTime: 0,
        storageUsed: 0,
        lastCleanup: new Date()
      }
      
      // Store defaults for future use
      await this.db.put('analytics', defaultAnalytics)
      return defaultAnalytics
    } catch (error) {
      console.error('Failed to get analytics:', error)
      return {
        id: this.tenantId,
        totalSaves: 0,
        successfulSaves: 0,
        failedSaves: 0,
        totalRestores: 0,
        averageSaveTime: 0,
        storageUsed: 0,
        lastCleanup: new Date()
      }
    }
  }

  /**
   * Update save analytics in IndexedDB
   */
  private async updateSaveAnalytics(saveTime: number, success: boolean): Promise<void> {
    if (!this.db) return

    try {
      const analytics = await this.getAnalytics()
      
      analytics.totalSaves++
      if (success) {
        analytics.successfulSaves++
        // Update average save time
        analytics.averageSaveTime = 
          ((analytics.averageSaveTime * (analytics.successfulSaves - 1)) + saveTime) / analytics.successfulSaves
      } else {
        analytics.failedSaves++
      }
      
      // Update storage usage estimate
      analytics.storageUsed = await this.calculateStorageUsage()
      
      // Ensure ID is set for IndexedDB
      analytics.id = this.tenantId
      
      await this.db.put('analytics', analytics)
    } catch (error) {
      console.error('Failed to update analytics:', error)
    }
  }

  /**
   * Calculate estimated storage usage from IndexedDB
   */
  private async calculateStorageUsage(): Promise<number> {
    if (!this.db) return 0

    try {
      const transactions = await this.db.getAllFromIndex('transactions', 'by-tenant', this.tenantId)
      return transactions.reduce((total, transaction) => {
        return total + JSON.stringify(transaction).length
      }, 0)
    } catch (error) {
      console.error('Failed to calculate storage usage:', error)
      return 0
    }
  }

  /**
   * Cleanup old transactions based on retention policy in IndexedDB
   */
  private async cleanupOldTransactions(): Promise<void> {
    if (!this.db) return

    try {
      const settings = await this.getSettings()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - settings.retentionDays)
      
      // Get all transactions for this tenant
      const allTransactions = await this.db.getAllFromIndex('transactions', 'by-tenant-date', IDBKeyRange.bound(
        [this.tenantId, new Date(0)], 
        [this.tenantId, cutoffDate]
      ))
      
      if (allTransactions.length > 0) {
        const tx = this.db.transaction('transactions', 'readwrite')
        for (const transaction of allTransactions) {
          await tx.store.delete(transaction.id)
        }
        await tx.done
      }
      
      // Update last cleanup time in analytics
      const analytics = await this.getAnalytics()
      analytics.lastCleanup = new Date()
      analytics.id = this.tenantId
      await this.db.put('analytics', analytics)
    } catch (error) {
      console.error('Failed to cleanup old transactions:', error)
    }
  }

  /**
   * Validate transaction data
   */
  private isValidTransaction(transactionData: any, allowPartial: boolean): boolean {
    if (!transactionData) return false
    
    // For partial transactions, just check basic structure
    if (allowPartial) {
      return typeof transactionData === 'object'
    }
    
    // For complete transactions, require items and total
    return (
      typeof transactionData === 'object' &&
      Array.isArray(transactionData.items) &&
      transactionData.items.length > 0 &&
      typeof transactionData.total === 'number'
    )
  }

  /**
   * Detect transaction type from data
   */
  private detectTransactionType(transactionData: any): 'sale' | 'return' | 'void' | 'exchange' {
    if (transactionData.type) {
      return transactionData.type
    }
    
    // Default detection logic
    if (transactionData.total < 0) {
      return 'return'
    }
    
    if (transactionData.items?.some((item: any) => item.quantity < 0)) {
      return 'return'
    }
    
    return 'sale'
  }

  /**
   * Get device information for metadata
   */
  private getDeviceInfo(): string {
    if (typeof window === 'undefined') return 'server'
    
    const screen = window.screen
    const platform = window.navigator.platform
    
    return `${platform} ${screen.width}x${screen.height}`
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `autosave_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Compress transaction data using built-in compression
   */
  private compressData(data: any): any {
    try {
      // Use JSON stringification with reduced precision for compression
      const jsonString = JSON.stringify(data, (key, value) => {
        // Round numeric values to reduce precision and improve compression
        if (typeof value === 'number' && !Number.isInteger(value)) {
          return Math.round(value * 100) / 100
        }
        return value
      })
      
      // Simple run-length encoding for repeated characters
      return jsonString.replace(/(.)\1{2,}/g, (match, char) => {
        return `${char}{${match.length}}`
      })
    } catch (error) {
      console.warn('Failed to compress data:', error)
      return data
    }
  }

  /**
   * Decompress transaction data
   */
  private decompressData(compressedData: any): any {
    try {
      if (typeof compressedData !== 'string') {
        return compressedData
      }
      
      // Reverse run-length encoding
      const jsonString = compressedData.replace(/(.)\{(\d+)\}/g, (match, char, count) => {
        return char.repeat(parseInt(count))
      })
      
      return JSON.parse(jsonString)
    } catch (error) {
      console.warn('Failed to decompress data:', error)
      return compressedData
    }
  }

  /**
   * Encrypt transaction data using Web Crypto API (AES-GCM)
   */
  private async encryptData(data: any): Promise<any> {
    if (!this.encryptionKey || !window.crypto?.subtle) {
      console.warn('Encryption not available, storing data unencrypted')
      return data
    }

    try {
      // Convert data to JSON string
      const jsonString = JSON.stringify(data)
      const encoder = new TextEncoder()
      const dataBuffer = encoder.encode(jsonString)
      
      // Generate a random IV for each encryption
      const iv = window.crypto.getRandomValues(new Uint8Array(12))
      
      // Encrypt the data
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        this.encryptionKey,
        dataBuffer
      )
      
      // Combine IV and encrypted data
      const encryptedArray = new Uint8Array(encryptedBuffer)
      const result = new Uint8Array(iv.length + encryptedArray.length)
      result.set(iv, 0)
      result.set(encryptedArray, iv.length)
      
      // Convert to base64 for storage
      return btoa(String.fromCharCode(...result))
    } catch (error) {
      console.error('Failed to encrypt data:', error)
      // Return unencrypted data rather than failing completely
      return data
    }
  }

  /**
   * Decrypt transaction data using Web Crypto API (AES-GCM)
   */
  private async decryptData(encryptedData: any): Promise<any> {
    if (!this.encryptionKey || !window.crypto?.subtle) {
      return encryptedData
    }

    try {
      if (typeof encryptedData !== 'string') {
        return encryptedData
      }
      
      // Convert from base64
      const encryptedBuffer = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      )
      
      // Extract IV (first 12 bytes) and encrypted data (rest)
      const iv = encryptedBuffer.slice(0, 12)
      const encrypted = encryptedBuffer.slice(12)
      
      // Decrypt the data
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        this.encryptionKey,
        encrypted
      )
      
      // Convert back to string and parse JSON
      const decoder = new TextDecoder()
      const jsonString = decoder.decode(decryptedBuffer)
      return JSON.parse(jsonString)
    } catch (error) {
      console.error('Failed to decrypt data:', error)
      // Return the data as-is rather than failing completely
      return encryptedData
    }
  }

  /**
   * Export all transactions for backup
   */
  async exportTransactions(): Promise<string> {
    const transactions = await this.getSavedTransactions()
    const settings = await this.getSettings()
    const analytics = await this.getAnalytics()
    
    return JSON.stringify({
      tenantId: this.tenantId,
      exportedAt: new Date().toISOString(),
      transactions,
      settings,
      analytics
    }, null, 2)
  }

  /**
   * Import transactions from backup into IndexedDB
   */
  async importTransactions(backupData: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    try {
      const data = JSON.parse(backupData)
      
      if (data.tenantId !== this.tenantId) {
        throw new Error('Backup data is for a different tenant')
      }
      
      // Import transactions
      if (data.transactions && Array.isArray(data.transactions)) {
        const tx = this.db.transaction('transactions', 'readwrite')
        
        for (const transaction of data.transactions) {
          // Ensure transaction belongs to this tenant
          if (transaction.tenantId === this.tenantId) {
            // Ensure dates are properly formatted
            transaction.savedAt = new Date(transaction.savedAt)
            await tx.store.put(transaction)
          }
        }
        
        await tx.done
      }
      
      // Import settings
      if (data.settings) {
        await this.updateSettings(data.settings)
      }

      // Import analytics if available
      if (data.analytics) {
        const analytics = {
          ...data.analytics,
          id: this.tenantId,
          lastCleanup: new Date(data.analytics.lastCleanup)
        }
        await this.db.put('analytics', analytics)
      }
    } catch (error) {
      console.error('Failed to import backup data:', error)
      throw new Error('Invalid backup data format')
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: string): Promise<SavedTransaction | null> {
    const transactions = await this.getSavedTransactions()
    return transactions.find(t => t.id === transactionId) || null
  }

  /**
   * Check if auto-save is currently enabled
   */
  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings()
    return settings.enabled
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * Force cleanup of resources
   */
  private cleanup?: () => void

  /**
   * Cleanup method to remove listeners and clear resources
   */
  destroy(): void {
    if (this.cleanup) {
      this.cleanup()
    }
    this.currentTransactionId = null
  }
}