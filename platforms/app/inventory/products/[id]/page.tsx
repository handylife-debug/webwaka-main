'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Trash2, Package, Barcode, Tag, Building, ArrowLeft, Plus, Eye } from 'lucide-react'
import inventoryService from '../../../../lib/inventory-database'
import { ProductDocument, ProductCategoryDocument, SupplierDocument, ProductVariantDocument } from '../../../../lib/offline-database'

interface ProductWithDetails extends ProductDocument {
  category?: ProductCategoryDocument
  supplier?: SupplierDocument
  variants: ProductVariantDocument[]
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string
  
  const [product, setProduct] = useState<ProductWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (productId) {
      loadProduct()
    }
  }, [productId])

  const loadProduct = async () => {
    try {
      setLoading(true)
      
      await inventoryService.init()
      
      // Load product
      const productData = await inventoryService.getProduct(productId)
      if (!productData) {
        setError('Product not found')
        return
      }
      
      // Load related data
      const [categories, suppliers, variants] = await Promise.all([
        inventoryService.getCategories(),
        inventoryService.getSuppliers(),
        inventoryService.getVariants(productId)
      ])
      
      const enrichedProduct: ProductWithDetails = {
        ...productData,
        category: categories.find(cat => cat.id === productData.categoryId),
        supplier: suppliers.find(sup => sup.id === productData.supplierId),
        variants
      }
      
      setProduct(enrichedProduct)
      
    } catch (error) {
      console.error('Error loading product:', error)
      setError('Failed to load product')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProduct = async () => {
    if (!product) return
    
    if (window.confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      try {
        await inventoryService.deleteProduct(product.id)
        router.push('/inventory')
      } catch (error) {
        console.error('Error deleting product:', error)
        alert('Failed to delete product. Please try again.')
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading product...</p>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="text-center py-12">
        <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {error || 'Product not found'}
        </h3>
        <p className="text-gray-500 mb-4">
          The product you're looking for doesn't exist or has been deleted.
        </p>
        <Link
          href="/inventory"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Inventory
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/inventory"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Product details and management
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Link
            href={`/inventory/products/${product.id}/edit`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Product
          </Link>
          <button
            onClick={handleDeleteProduct}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Image and Basic Info */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            {/* Image */}
            <div className="aspect-square bg-gray-100 rounded-lg mb-6 flex items-center justify-center">
              {product.image ? (
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <Package className="w-16 h-16 text-gray-400" />
              )}
            </div>
            
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Price</label>
                <p className="text-2xl font-bold text-blue-600">${product.price.toFixed(2)}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Stock Level</label>
                <p className={`text-lg font-semibold ${product.stock <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {product.stock} units
                </p>
              </div>
              
              {product.barcode && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Barcode/SKU</label>
                  <div className="flex items-center space-x-2">
                    <Barcode className="w-4 h-4 text-gray-400" />
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{product.barcode}</code>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* General Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">General Information</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Category</label>
                <div className="flex items-center space-x-2">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-900">
                    {product.category?.categoryName || 'Uncategorized'}
                  </p>
                </div>
              </div>
              
              {product.supplier && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Supplier</label>
                  <div className="flex items-center space-x-2">
                    <Building className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{product.supplier.supplierName}</p>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
                <p className="text-sm text-gray-900">
                  {new Date(product.updatedAt).toLocaleDateString()}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
                <p className="text-sm text-gray-900">
                  {new Date(product.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Product Variants */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Product Variants</h3>
              <Link
                href={`/inventory/products/${product.id}/edit`}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Variant
              </Link>
            </div>
            
            {product.variants.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <Tag className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 mb-2">No variants defined</p>
                <p className="text-xs text-gray-400">Add variants for different sizes, colors, or styles</p>
              </div>
            ) : (
              <div className="space-y-3">
                {product.variants.map((variant) => (
                  <div key={variant.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        variant.variantType === 'size' ? 'bg-blue-100 text-blue-800' :
                        variant.variantType === 'color' ? 'bg-green-100 text-green-800' :
                        variant.variantType === 'style' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {variant.variantType}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{variant.variantName}</p>
                        <p className="text-xs text-gray-500">{variant.variantValue}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      {variant.sellingPrice && (
                        <span className="text-sm font-medium text-blue-600">
                          ${variant.sellingPrice.toFixed(2)}
                        </span>
                      )}
                      {variant.sku && (
                        <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                          {variant.sku}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category Details */}
          {product.category && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Category Details</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Category Code</label>
                  <p className="text-sm font-mono bg-gray-100 px-2 py-1 rounded inline-block">
                    {product.category.categoryCode}
                  </p>
                </div>
                
                {product.category.taxRate > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Tax Rate</label>
                    <p className="text-sm text-gray-900">
                      {(product.category.taxRate * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
                
                {product.category.description && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-500 mb-1">Category Description</label>
                    <p className="text-sm text-gray-700">{product.category.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}