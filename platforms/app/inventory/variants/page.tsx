'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Package, Tag, Filter, Grid, List } from 'lucide-react'
import Link from 'next/link'
import inventoryService from '../../../lib/inventory-database'
import { ProductVariantDocument, ProductDocument, ProductCategoryDocument } from '../../../lib/offline-database'

interface VariantWithProduct extends ProductVariantDocument {
  product?: ProductDocument
  category?: ProductCategoryDocument
}

const VARIANT_TYPES = ['size', 'color', 'style', 'material', 'flavor', 'other']

export default function VariantsPage() {
  const [variants, setVariants] = useState<VariantWithProduct[]>([])
  const [products, setProducts] = useState<ProductDocument[]>([])
  const [categories, setCategories] = useState<ProductCategoryDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      await inventoryService.init()
      
      // Load all data
      const [productsData, categoriesData] = await Promise.all([
        inventoryService.getProducts(),
        inventoryService.getCategories()
      ])
      
      setProducts(productsData)
      setCategories(categoriesData)
      
      // Load variants for all products
      const allVariants: VariantWithProduct[] = []
      for (const product of productsData) {
        const productVariants = await inventoryService.getVariants(product.id)
        const enrichedVariants = productVariants.map(variant => ({
          ...variant,
          product,
          category: categoriesData.find(cat => cat.id === product.categoryId)
        }))
        allVariants.push(...enrichedVariants)
      }
      
      setVariants(allVariants)
      
    } catch (error) {
      console.error('Error loading variants data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVariant = async (variantId: string) => {
    if (window.confirm('Are you sure you want to delete this variant? This action cannot be undone.')) {
      try {
        await inventoryService.deleteVariant(variantId)
        await loadData() // Reload data
      } catch (error) {
        console.error('Error deleting variant:', error)
        alert('Failed to delete variant. Please try again.')
      }
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  // Filter variants
  const filteredVariants = variants.filter(variant => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      const matches = variant.variantName.toLowerCase().includes(searchLower) ||
                     variant.variantValue.toLowerCase().includes(searchLower) ||
                     variant.product?.name.toLowerCase().includes(searchLower) ||
                     variant.sku?.toLowerCase().includes(searchLower)
      if (!matches) return false
    }
    
    // Product filter
    if (selectedProduct !== 'all' && variant.productId !== selectedProduct) {
      return false
    }
    
    // Type filter
    if (selectedType !== 'all' && variant.variantType !== selectedType) {
      return false
    }
    
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading variants...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Variants</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage variations for your products - sizes, colors, styles, and more
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Link
            href="/inventory/products/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product with Variants
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search variants by name, value, or product..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Types</option>
              {VARIANT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            
            <div className="flex border border-gray-300 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 border-l border-gray-300 transition-colors ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Variants Display */}
      {filteredVariants.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Tag className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No variants found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm 
              ? `No variants match your search "${searchTerm}"`
              : 'Create products with variants to see them here'
            }
          </p>
          <Link
            href="/inventory/products/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product with Variants
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200">
          {viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
              {filteredVariants.map((variant) => (
                <div key={variant.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow group">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        variant.variantType === 'size' ? 'bg-blue-100 text-blue-800' :
                        variant.variantType === 'color' ? 'bg-green-100 text-green-800' :
                        variant.variantType === 'style' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {variant.variantType}
                      </span>
                      
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/inventory/products/${variant.productId}/edit`}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Edit product"
                        >
                          <Edit className="w-4 h-4 text-gray-600" />
                        </Link>
                        <button
                          onClick={() => handleDeleteVariant(variant.id)}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete variant"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-gray-900 mb-1 truncate">{variant.variantName}</h3>
                    <p className="text-sm text-gray-600 mb-2">{variant.product?.name}</p>
                    <p className="text-xs text-gray-500 mb-3">{variant.category?.categoryName || 'Uncategorized'}</p>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Value:</span>
                        <span className="text-sm font-medium text-gray-900">{variant.variantValue}</span>
                      </div>
                      
                      {variant.sellingPrice && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">Price:</span>
                          <span className="text-sm font-bold text-blue-600">${variant.sellingPrice.toFixed(2)}</span>
                        </div>
                      )}
                      
                      {variant.sku && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">SKU:</span>
                          <span className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">{variant.sku}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // List View
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVariants.map((variant) => (
                    <tr key={variant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{variant.variantName}</div>
                        <div className="text-sm text-gray-500">{variant.category?.categoryName || 'Uncategorized'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Package className="w-5 h-5 text-gray-400 mr-3" />
                          <div className="text-sm text-gray-900">{variant.product?.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          variant.variantType === 'size' ? 'bg-blue-100 text-blue-800' :
                          variant.variantType === 'color' ? 'bg-green-100 text-green-800' :
                          variant.variantType === 'style' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {variant.variantType}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {variant.variantValue}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {variant.sellingPrice ? (
                          <span className="text-sm font-medium text-blue-600">${variant.sellingPrice.toFixed(2)}</span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {variant.sku ? (
                          <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{variant.sku}</code>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <Link
                            href={`/inventory/products/${variant.productId}/edit`}
                            className="text-blue-600 hover:text-blue-700"
                            title="Edit product"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDeleteVariant(variant.id)}
                            className="text-red-600 hover:text-red-700"
                            title="Delete variant"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}