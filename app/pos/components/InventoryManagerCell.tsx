'use client'

import { useState, useEffect } from 'react'
import { Package, Plus, Minus, AlertTriangle, RefreshCw, Search, Edit, Save, X, CheckCircle } from 'lucide-react'

export interface InventoryItem {
  id: string
  name: string
  sku: string
  currentStock: number
  reservedStock: number
  availableStock: number
  reorderLevel: number
  maxStock: number
  costPrice: number
  sellingPrice: number
  lastUpdated: string
  supplier?: string
  category: string
  conflictResolved?: boolean
  pendingSync?: boolean
}

export interface StockMovement {
  id: string
  itemId: string
  type: 'sale' | 'adjustment' | 'restock' | 'return' | 'transfer'
  quantity: number
  reason: string
  timestamp: string
  userId: string
  reference?: string
}

interface InventoryManagerCellProps {
  isVisible: boolean
  onClose: () => void
  onStockUpdate?: (itemId: string, newStock: number) => void
}

export default function InventoryManagerCell({
  isVisible,
  onClose,
  onStockUpdate
}: InventoryManagerCellProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<InventoryItem>>({})
  const [showConflicts, setShowConflicts] = useState(false)
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([])

  // Load inventory data
  useEffect(() => {
    if (isVisible) {
      loadInventory()
      loadStockMovements()
    }
  }, [isVisible])

  // Filter inventory based on search and filters
  useEffect(() => {
    let filtered = inventory

    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === categoryFilter)
    }

    if (stockFilter !== 'all') {
      switch (stockFilter) {
        case 'low':
          filtered = filtered.filter(item => item.availableStock <= item.reorderLevel)
          break
        case 'out':
          filtered = filtered.filter(item => item.availableStock <= 0)
          break
        case 'excess':
          filtered = filtered.filter(item => item.currentStock > item.maxStock)
          break
        case 'conflicts':
          filtered = filtered.filter(item => !item.conflictResolved && item.pendingSync)
          break
      }
    }

    setFilteredInventory(filtered)
  }, [inventory, searchTerm, categoryFilter, stockFilter])

  const loadInventory = async () => {
    setIsLoading(true)
    try {
      // Mock inventory data with stock conflicts
      const mockInventory: InventoryItem[] = [
        {
          id: 'inv_001',
          name: 'Espresso Beans (1kg)',
          sku: 'ESP-001',
          currentStock: 25,
          reservedStock: 3,
          availableStock: 22,
          reorderLevel: 10,
          maxStock: 100,
          costPrice: 15.00,
          sellingPrice: 25.00,
          lastUpdated: new Date().toISOString(),
          supplier: 'Premium Coffee Co.',
          category: 'Coffee',
          conflictResolved: true
        },
        {
          id: 'inv_002',
          name: 'Blueberry Muffins',
          sku: 'MUFF-BLU',
          currentStock: 8,
          reservedStock: 2,
          availableStock: 6,
          reorderLevel: 12,
          maxStock: 50,
          costPrice: 1.50,
          sellingPrice: 2.75,
          lastUpdated: new Date(Date.now() - 3600000).toISOString(),
          supplier: 'Local Bakery',
          category: 'Pastries',
          conflictResolved: false,
          pendingSync: true
        },
        {
          id: 'inv_003',
          name: 'Whole Milk (1L)',
          sku: 'MILK-WHL',
          currentStock: 0,
          reservedStock: 0,
          availableStock: 0,
          reorderLevel: 5,
          maxStock: 20,
          costPrice: 1.20,
          sellingPrice: 2.00,
          lastUpdated: new Date(Date.now() - 7200000).toISOString(),
          supplier: 'Dairy Fresh',
          category: 'Dairy',
          conflictResolved: true
        },
        {
          id: 'inv_004',
          name: 'BBQ Chips',
          sku: 'CHIP-BBQ',
          currentStock: 15,
          reservedStock: 1,
          availableStock: 14,
          reorderLevel: 8,
          maxStock: 30,
          costPrice: 1.00,
          sellingPrice: 2.25,
          lastUpdated: new Date(Date.now() - 1800000).toISOString(),
          supplier: 'Snack Foods Ltd.',
          category: 'Snacks',
          conflictResolved: true
        }
      ]

      setInventory(mockInventory)
    } catch (error) {
      console.error('Error loading inventory:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStockMovements = async () => {
    // Mock stock movement history
    const mockMovements: StockMovement[] = [
      {
        id: 'mov_001',
        itemId: 'inv_001',
        type: 'sale',
        quantity: -2,
        reason: 'Sale to customer',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        userId: 'user_001',
        reference: 'TXN-001'
      },
      {
        id: 'mov_002',
        itemId: 'inv_002',
        type: 'adjustment',
        quantity: -4,
        reason: 'Damaged items removed',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        userId: 'user_001'
      },
      {
        id: 'mov_003',
        itemId: 'inv_003',
        type: 'sale',
        quantity: -3,
        reason: 'Sale to customer',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        userId: 'user_001',
        reference: 'TXN-002'
      }
    ]

    setStockMovements(mockMovements)
  }

  const handleStockAdjustment = async (itemId: string, adjustment: number, reason: string) => {
    try {
      // Optimistic update
      setInventory(prev => prev.map(item => {
        if (item.id === itemId) {
          const newStock = Math.max(0, item.currentStock + adjustment)
          const newAvailable = Math.max(0, newStock - item.reservedStock)
          
          return {
            ...item,
            currentStock: newStock,
            availableStock: newAvailable,
            lastUpdated: new Date().toISOString(),
            pendingSync: true
          }
        }
        return item
      }))

      // Add stock movement record
      const newMovement: StockMovement = {
        id: `mov_${Date.now()}`,
        itemId,
        type: 'adjustment',
        quantity: adjustment,
        reason,
        timestamp: new Date().toISOString(),
        userId: 'current_user'
      }

      setStockMovements(prev => [newMovement, ...prev])

      // Call API to sync stock
      await syncStockLevel(itemId)

      // Callback to parent component
      if (onStockUpdate) {
        const updatedItem = inventory.find(item => item.id === itemId)
        if (updatedItem) {
          onStockUpdate(itemId, updatedItem.currentStock + adjustment)
        }
      }

    } catch (error) {
      console.error('Stock adjustment failed:', error)
      // Revert optimistic update
      loadInventory()
    }
  }

  const syncStockLevel = async (itemId: string) => {
    try {
      // Simulate API call for stock sync
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Mark as synced
      setInventory(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, pendingSync: false, conflictResolved: true }
          : item
      ))
    } catch (error) {
      console.error('Stock sync failed:', error)
    }
  }

  const resolveStockConflict = async (itemId: string, resolvedStock: number) => {
    try {
      setInventory(prev => prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            currentStock: resolvedStock,
            availableStock: Math.max(0, resolvedStock - item.reservedStock),
            conflictResolved: true,
            pendingSync: false,
            lastUpdated: new Date().toISOString()
          }
        }
        return item
      }))

      // Record conflict resolution
      const resolutionMovement: StockMovement = {
        id: `mov_${Date.now()}`,
        itemId,
        type: 'adjustment',
        quantity: 0, // Net change after conflict resolution
        reason: 'Conflict resolution - stock corrected',
        timestamp: new Date().toISOString(),
        userId: 'current_user'
      }

      setStockMovements(prev => [resolutionMovement, ...prev])

    } catch (error) {
      console.error('Conflict resolution failed:', error)
    }
  }

  const saveEditedItem = async (itemId: string) => {
    try {
      setInventory(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, ...editValues, lastUpdated: new Date().toISOString() }
          : item
      ))

      setEditingItem(null)
      setEditValues({})
    } catch (error) {
      console.error('Save failed:', error)
    }
  }

  const getStockStatus = (item: InventoryItem) => {
    if (item.availableStock <= 0) {
      return { status: 'out', color: 'text-red-600 bg-red-50', text: 'Out of Stock' }
    } else if (item.availableStock <= item.reorderLevel) {
      return { status: 'low', color: 'text-yellow-600 bg-yellow-50', text: 'Low Stock' }
    } else if (item.currentStock > item.maxStock) {
      return { status: 'excess', color: 'text-purple-600 bg-purple-50', text: 'Excess Stock' }
    } else {
      return { status: 'normal', color: 'text-green-600 bg-green-50', text: 'In Stock' }
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Package className="w-8 h-8 mr-3" />
              Inventory Management
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Filters and Search */}
          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              <option value="Coffee">Coffee</option>
              <option value="Pastries">Pastries</option>
              <option value="Dairy">Dairy</option>
              <option value="Snacks">Snacks</option>
            </select>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Stock Levels</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
              <option value="excess">Excess Stock</option>
              <option value="conflicts">Conflicts</option>
            </select>

            <button
              onClick={loadInventory}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
          </div>

          {/* Summary Stats */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-600">Total Items</p>
              <p className="text-2xl font-bold text-green-700">{inventory.length}</p>
            </div>
            <div className="bg-red-50 p-3 rounded-lg">
              <p className="text-sm text-red-600">Low Stock</p>
              <p className="text-2xl font-bold text-red-700">
                {inventory.filter(item => item.availableStock <= item.reorderLevel).length}
              </p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg">
              <p className="text-sm text-yellow-600">Out of Stock</p>
              <p className="text-2xl font-bold text-yellow-700">
                {inventory.filter(item => item.availableStock <= 0).length}
              </p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <p className="text-sm text-purple-600">Conflicts</p>
              <p className="text-2xl font-bold text-purple-700">
                {inventory.filter(item => !item.conflictResolved && item.pendingSync).length}
              </p>
            </div>
          </div>
        </div>

        {/* Inventory List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading inventory...</p>
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No inventory items found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInventory.map((item) => {
                const stockStatus = getStockStatus(item)
                const isEditing = editingItem === item.id

                return (
                  <div
                    key={item.id}
                    className={`bg-gray-50 rounded-lg p-4 border transition-colors ${
                      !item.conflictResolved && item.pendingSync 
                        ? 'border-red-300 bg-red-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValues.name || item.name}
                                onChange={(e) => setEditValues(prev => ({ ...prev, name: e.target.value }))}
                                className="border border-gray-300 rounded px-2 py-1"
                              />
                            ) : (
                              item.name
                            )}
                          </h3>
                          <span className="text-sm text-gray-500">SKU: {item.sku}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${stockStatus.color}`}>
                            {stockStatus.text}
                          </span>
                          {!item.conflictResolved && item.pendingSync && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium text-red-600 bg-red-100 flex items-center">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Conflict
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-3">
                          <div>
                            <p className="text-sm text-gray-600">Current Stock</p>
                            <p className="font-bold text-lg">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editValues.currentStock ?? item.currentStock}
                                  onChange={(e) => setEditValues(prev => ({ ...prev, currentStock: parseInt(e.target.value) }))}
                                  className="border border-gray-300 rounded px-2 py-1 w-20"
                                />
                              ) : (
                                item.currentStock
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Reserved</p>
                            <p className="font-medium text-yellow-600">{item.reservedStock}</p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Available</p>
                            <p className={`font-bold ${stockStatus.status === 'out' ? 'text-red-600' : 'text-green-600'}`}>
                              {item.availableStock}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Reorder Level</p>
                            <p className="font-medium">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editValues.reorderLevel ?? item.reorderLevel}
                                  onChange={(e) => setEditValues(prev => ({ ...prev, reorderLevel: parseInt(e.target.value) }))}
                                  className="border border-gray-300 rounded px-2 py-1 w-20"
                                />
                              ) : (
                                item.reorderLevel
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Cost Price</p>
                            <p className="font-medium">${item.costPrice.toFixed(2)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Selling Price</p>
                            <p className="font-medium">${item.sellingPrice.toFixed(2)}</p>
                          </div>
                        </div>

                        <div className="text-sm text-gray-500">
                          <p>Category: {item.category} | Supplier: {item.supplier}</p>
                          <p>Last Updated: {new Date(item.lastUpdated).toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="ml-4 flex flex-col space-y-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEditedItem(item.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors flex items-center"
                            >
                              <Save className="w-3 h-3 mr-1" />
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingItem(null)
                                setEditValues({})
                              }}
                              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingItem(item.id)
                                setEditValues(item)
                              }}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors flex items-center"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </button>

                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleStockAdjustment(item.id, -1, 'Manual adjustment')}
                                className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleStockAdjustment(item.id, 1, 'Manual adjustment')}
                                className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {!item.conflictResolved && item.pendingSync && (
                              <button
                                onClick={() => resolveStockConflict(item.id, item.currentStock)}
                                className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 transition-colors flex items-center"
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Resolve
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}