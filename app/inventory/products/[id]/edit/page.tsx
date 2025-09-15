'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ProductForm from '../../../../../components/inventory/product-form'
import inventoryService from '../../../../../lib/inventory-database'
import { ProductDocument } from '../../../../../lib/offline-database'

export default function EditProductPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string
  
  const [product, setProduct] = useState<ProductDocument | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (productId) {
      loadProduct()
    }
  }, [productId])

  const loadProduct = async () => {
    try {
      await inventoryService.init()
      const productData = await inventoryService.getProduct(productId)
      setProduct(productData)
    } catch (error) {
      console.error('Error loading product:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = (updatedProduct: ProductDocument) => {
    router.push(`/inventory/products/${updatedProduct.id}`)
  }

  const handleCancel = () => {
    router.push(`/inventory/products/${productId}`)
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

  if (!product) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Product not found</h3>
        <button
          onClick={() => router.push('/inventory')}
          className="text-blue-600 hover:text-blue-700"
        >
          Back to Inventory
        </button>
      </div>
    )
  }

  return (
    <div>
      <ProductForm 
        product={product}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  )
}