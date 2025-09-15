'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Package, Building } from 'lucide-react'
import inventoryService from '../../../lib/inventory-database'

interface BrandWithStats {
  name: string
  productCount: number
  totalValue: number
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandWithStats[]>([])
  const [filteredBrands, setFilteredBrands] = useState<BrandWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingBrand, setEditingBrand] = useState<string | null>(null)
  const [newBrandName, setNewBrandName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    loadBrands()
  }, [])

  useEffect(() => {
    const filtered = brands.filter(brand =>
      brand.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredBrands(filtered)
  }, [searchTerm, brands])

  const loadBrands = async () => {
    try {
      setLoading(true)
      
      await inventoryService.init()
      const tenantId = inventoryService.getTenantId()
      
      // Get all brands
      const brandsData = await inventoryService.getBrands(tenantId)
      
      // Get all products to calculate stats
      const products = await inventoryService.getProducts(tenantId)
      
      // Calculate brand statistics
      const brandStats: Record<string, { productCount: number, totalValue: number }> = {}
      
      products.forEach(product => {
        if (product.brand && product.brand.trim()) {
          const brand = product.brand.trim()
          if (!brandStats[brand]) {
            brandStats[brand] = { productCount: 0, totalValue: 0 }
          }
          brandStats[brand].productCount++
          brandStats[brand].totalValue += (product.price * product.stock)
        }
      })
      
      // Combine brands with stats
      const brandsWithStats = brandsData.map(brandName => ({
        name: brandName,
        productCount: brandStats[brandName]?.productCount || 0,
        totalValue: brandStats[brandName]?.totalValue || 0
      }))
      
      // Sort by product count (descending)
      brandsWithStats.sort((a, b) => b.productCount - a.productCount)
      
      setBrands(brandsWithStats)
      setFilteredBrands(brandsWithStats)
      
    } catch (error) {
      console.error('Error loading brands:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) {
      setErrors({ brand: 'Brand name is required' })
      return
    }

    // Check if brand already exists
    if (brands.some(brand => brand.name.toLowerCase() === newBrandName.trim().toLowerCase())) {
      setErrors({ brand: 'Brand already exists' })
      return
    }

    try {
      const tenantId = inventoryService.getTenantId()
      await inventoryService.createBrand(newBrandName.trim(), tenantId)
      await loadBrands()
      setNewBrandName('')
      setErrors({})
    } catch (error) {
      console.error('Error creating brand:', error)
      setErrors({ brand: 'Failed to create brand' })
    }
  }

  const handleEditBrand = async () => {
    if (!editingBrand || !newBrandName.trim()) {
      setErrors({ brand: 'Brand name is required' })
      return
    }

    if (editingBrand === newBrandName.trim()) {
      setShowEditModal(false)
      setEditingBrand(null)
      setNewBrandName('')
      return
    }

    // Check if new brand name already exists
    if (brands.some(brand => brand.name.toLowerCase() === newBrandName.trim().toLowerCase())) {
      setErrors({ brand: 'Brand already exists' })
      return
    }

    try {
      const tenantId = inventoryService.getTenantId()
      await inventoryService.updateBrand(editingBrand, newBrandName.trim(), tenantId)
      await loadBrands()
      setShowEditModal(false)
      setEditingBrand(null)
      setNewBrandName('')
      setErrors({})
    } catch (error) {
      console.error('Error updating brand:', error)
      setErrors({ brand: 'Failed to update brand' })
    }
  }

  const handleDeleteBrand = async (brandName: string) => {
    const brandData = brands.find(b => b.name === brandName)
    if (!brandData) return

    if (brandData.productCount > 0) {
      if (!confirm(`This brand is used by ${brandData.productCount} product(s). Deleting it will remove the brand from all products. Are you sure?`)) {
        return
      }
    } else {
      if (!confirm(`Are you sure you want to delete the brand "${brandName}"?`)) {
        return
      }
    }

    try {
      const tenantId = inventoryService.getTenantId()
      await inventoryService.deleteBrand(brandName, tenantId)
      await loadBrands()
    } catch (error) {
      console.error('Error deleting brand:', error)
      alert('Failed to delete brand. Please try again.')
    }
  }

  const startEdit = (brandName: string) => {
    setEditingBrand(brandName)
    setNewBrandName(brandName)
    setShowEditModal(true)
    setErrors({})
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading brands...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredBrands.length} brands found
          </p>
        </div>
      </div>

      {/* Search and Create */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search brands..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Create Brand */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New brand name..."
              value={newBrandName}
              onChange={(e) => {
                setNewBrandName(e.target.value)
                setErrors({})
              }}
              className={`px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.brand ? 'border-red-500' : 'border-gray-300'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateBrand()
                }
              }}
            />
            <button
              onClick={handleCreateBrand}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Brand
            </button>
          </div>
        </div>
        {errors.brand && <p className="text-sm text-red-600 mt-2">{errors.brand}</p>}
      </div>

      {/* Brands Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBrands.map((brand) => (
          <div key={brand.name} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center">
                  <Building className="w-5 h-5 text-blue-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">{brand.name}</h3>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <Package className="w-4 h-4 mr-2" />
                    <span>{brand.productCount} products</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Inventory Value:</span>
                    <span className="ml-1">${brand.totalValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-1 ml-4">
                <button
                  onClick={() => startEdit(brand.name)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  title="Edit brand"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteBrand(brand.name)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  title="Delete brand"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredBrands.length === 0 && !loading && (
        <div className="text-center py-12">
          <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No brands found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm ? 'Try adjusting your search terms' : 'Create your first brand to get started'}
          </p>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Brand</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand Name
                </label>
                <input
                  type="text"
                  value={newBrandName}
                  onChange={(e) => {
                    setNewBrandName(e.target.value)
                    setErrors({})
                  }}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.brand ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter brand name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleEditBrand()
                    }
                  }}
                />
                {errors.brand && <p className="text-sm text-red-600 mt-1">{errors.brand}</p>}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingBrand(null)
                  setNewBrandName('')
                  setErrors({})
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditBrand}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
              >
                Update Brand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}