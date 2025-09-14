'use client'

import { useRouter } from 'next/navigation'
import ProductForm from '../../../../components/inventory/product-form'
import { ProductDocument } from '../../../../lib/offline-database'

export default function NewProductPage() {
  const router = useRouter()

  const handleSave = (product: ProductDocument) => {
    router.push('/inventory')
  }

  const handleCancel = () => {
    router.push('/inventory')
  }

  return (
    <div>
      <ProductForm 
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  )
}