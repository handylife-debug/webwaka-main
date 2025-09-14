'use client'

import { useState, useEffect } from 'react'
import { Save, X, Plus, Trash2, Package, Camera, Barcode, AlertCircle } from 'lucide-react'
import inventoryService from '../../lib/inventory-database'
import { ProductDocument, ProductCategoryDocument, SupplierDocument } from '../../lib/offline-database'
import BrandSelector from './brand-selector'

interface ProductFormProps {
  product?: ProductDocument | null
  onSave: (product: ProductDocument) => void
  onCancel: () => void
}

interface ProductFormData {
  name: string
  price: number
  categoryId: string
  supplierId: string
  brand: string
  stock: number
  image: string
  barcode: string
  sku: string
  description: string
  unitOfMeasure: string
  minStockLevel: number
  maxStockLevel: number
  isActive: boolean
}

const UNITS_OF_MEASURE = [
  'Each', 'Box', 'Case', 'Dozen', 'Kilogram', 'Gram', 'Liter', 'Milliliter', 
  'Meter', 'Centimeter', 'Square Meter', 'Cubic Meter', 'Pair', 'Set'
]

export default function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: product?.name || '',
    price: product?.price || 0,
    categoryId: product?.categoryId || '',
    supplierId: product?.supplierId || '',
    brand: product?.brand || '',
    stock: product?.stock || 0,
    image: product?.image || '',
    barcode: product?.barcode || '',
    sku: product?.sku || ''
    description: '',
    unitOfMeasure: 'Each',
    minStockLevel: 0,
    maxStockLevel: 1000,
    isActive: true
  })

  const [categories, setCategories] = useState<ProductCategoryDocument[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [generatedSKU, setGeneratedSKU] = useState('')
  const [variants, setVariants] = useState<Array<{
    id: string
    type: string
    value: string
    price: number
    sku: string
    barcode: string
    stock: number
  }>>([])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    // Generate SKU when name or category changes
    if (formData.name && formData.categoryId) {
      const category = categories.find(cat => cat.id === formData.categoryId)
      if (category) {
        const sku = inventoryService.generateSKU(category.categoryCode, formData.name)
        setGeneratedSKU(sku)
        // Auto-assign generated SKU to SKU field if empty
        if (!formData.sku) {
          setFormData(prev => ({ ...prev, sku: sku }))
        }
      }
    }
  }, [formData.name, formData.categoryId, categories])

  const loadData = async () => {
    try {
      await inventoryService.init()
      const tenantId = inventoryService.getTenantId()
      const [categoriesData, suppliersData] = await Promise.all([
        inventoryService.getCategories(tenantId),
        inventoryService.getSuppliers(tenantId)
      ])
      
      setCategories(categoriesData)
      setSuppliers(suppliersData)
      
      // If editing, load variants
      if (product) {
        const productVariants = await inventoryService.getVariants(product.id, tenantId)
        setVariants(productVariants.map(variant => ({
          id: variant.id,
          type: variant.variantType,
          value: variant.variantValue,
          price: variant.sellingPrice || variant.costPrice || 0,
          sku: variant.sku || '',
          barcode: variant.barcode || '',
          stock: 0 // We'd need to get this from stock levels
        })))
      }
      
    } catch (error) {
      console.error('Error loading form data:', error)
    }
  }

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {}
    const tenantId = inventoryService.getTenantId()
    
    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required'
    }
    
    if (formData.price <= 0) {
      newErrors.price = 'Price must be greater than 0'
    }
    
    if (!formData.categoryId) {
      newErrors.categoryId = 'Category is required'
    }
    
    if (formData.stock < 0) {
      newErrors.stock = 'Stock cannot be negative'
    }
    
    // Validate barcode format and duplicates
    if (formData.barcode && !inventoryService.validateBarcode(formData.barcode)) {
      newErrors.barcode = 'Invalid barcode format'
    }

    if (formData.barcode) {
      try {
        const barcodeExists = await inventoryService.checkBarcodeExists(formData.barcode, tenantId)
        if (barcodeExists && (!product || product.barcode !== formData.barcode)) {
          newErrors.barcode = 'This barcode is already in use'
        }
      } catch (error) {
        console.error('Error checking barcode:', error)
      }
    }

    // Validate SKU duplicates (SKU is stored in barcode field for products)
    if (formData.sku) {
      try {
        const skuExists = await inventoryService.checkSKUExists(formData.sku, tenantId)
        if (skuExists && (!product || product.barcode !== formData.sku)) {
          newErrors.sku = 'This SKU is already in use'
        }
      } catch (error) {
        console.error('Error checking SKU:', error)
      }
    }

    // Validate variant SKUs and barcodes
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i]
      
      // Check variant SKU
      if (variant.sku) {
        try {
          const skuExists = await inventoryService.checkSKUExists(variant.sku, tenantId)
          if (skuExists) {
            newErrors[`variant_${i}_sku`] = 'This variant SKU is already in use'
          }
        } catch (error) {
          console.error('Error checking variant SKU:', error)
        }
      }
      
      // Check variant barcode
      if (variant.barcode) {
        if (!inventoryService.validateBarcode(variant.barcode)) {
          newErrors[`variant_${i}_barcode`] = 'Invalid variant barcode format'
        } else {
          try {
            const barcodeExists = await inventoryService.checkBarcodeExists(variant.barcode, tenantId)
            if (barcodeExists) {
              newErrors[`variant_${i}_barcode`] = 'This variant barcode is already in use'
            }
          } catch (error) {
            console.error('Error checking variant barcode:', error)
          }
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const isValid = await validateForm()
    if (!isValid) {
      return
    }
    
    setLoading(true)
    
    try {
      await inventoryService.init()
      const tenantId = inventoryService.getTenantId()
      
      const productData = {
        ...formData,
        sku: formData.sku,
        barcode: formData.barcode,
        tenantId,
        updatedAt: new Date().toISOString()
      }

      let savedProduct: ProductDocument
      
      if (product) {
        await inventoryService.updateProduct(product.id, productData)
        savedProduct = { ...product, ...productData }
      } else {
        const productId = await inventoryService.createProduct(productData)
        savedProduct = { 
          id: productId, 
          ...productData,
          _deleted: false
        }
      }
      
      // Save variants if any
      for (const variant of variants) {
        if (!product) {
          // Create new variants
          await inventoryService.createVariant({
            tenantId: inventoryService.getTenantId(),
            productId: savedProduct.id,
            variantCode: variant.sku,
            variantName: `${savedProduct.name} - ${variant.value}`,
            sku: variant.sku,
            barcode: variant.barcode || '',
            variantType: variant.type as any,
            variantValue: variant.value,
            costPrice: 0,
            sellingPrice: variant.price,
            isDefault: false,
            isActive: true,
            sortOrder: 0
          })
        }
      }
      
      onSave(savedProduct)
      
    } catch (error) {
      console.error('Error saving product:', error)
      alert('Failed to save product. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const addVariant = () => {
    const newVariant = {
      id: `temp_${Date.now()}`,
      type: 'size',
      value: '',
      price: formData.price,
      sku: generatedSKU + '-VAR',
      barcode: '',
      stock: 0
    }
    setVariants(prev => [...prev, newVariant])
  }

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index))
  }

  const updateVariant = (index: number, field: string, value: any) => {
    setVariants(prev => prev.map((variant, i) => 
      i === index ? { ...variant, [field]: value } : variant
    ))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            {product ? 'Edit Product' : 'Create New Product'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 mb-4">Basic Information</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter product name"
                />
                {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Product description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  required
                  value={formData.categoryId}
                  onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.categoryId ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.categoryName}
                    </option>
                  ))}
                </select>
                {errors.categoryId && <p className="text-sm text-red-600 mt-1">{errors.categoryId}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier
                </label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplierId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplierName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand
                </label>
                <BrandSelector
                  value={formData.brand}
                  onChange={(brand) => setFormData(prev => ({ ...prev, brand }))}
                  placeholder="Select or create brand..."
                  allowCreate={true}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit of Measure
                </label>
                <select
                  value={formData.unitOfMeasure}
                  onChange={(e) => setFormData(prev => ({ ...prev, unitOfMeasure: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {UNITS_OF_MEASURE.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 mb-4">Pricing & Inventory</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    className={`w-full pl-8 pr-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.price ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                  />
                </div>
                {errors.price && <p className="text-sm text-red-600 mt-1">{errors.price}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Stock
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData(prev => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.stock ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0"
                />
                {errors.stock && <p className="text-sm text-red-600 mt-1">{errors.stock}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Stock Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minStockLevel}
                    onChange={(e) => setFormData(prev => ({ ...prev, minStockLevel: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Stock Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.maxStockLevel}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxStockLevel: parseInt(e.target.value) || 1000 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="1000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU (Stock Keeping Unit)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    className={`flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.sku ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter SKU or use generated"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, sku: generatedSKU }))}
                    className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    title="Use generated SKU"
                  >
                    <Barcode className="w-4 h-4" />
                  </button>
                </div>
                {generatedSKU && (
                  <p className="text-xs text-gray-500 mt-1">Generated: {generatedSKU}</p>
                )}
                {errors.sku && <p className="text-sm text-red-600 mt-1">{errors.sku}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Barcode (Optional)
                </label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.barcode ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter barcode (EAN-13, UPC, etc.)"
                />
                <p className="text-xs text-gray-500 mt-1">Separate from SKU - used for scanning</p>
                {errors.barcode && <p className="text-sm text-red-600 mt-1">{errors.barcode}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Image
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <div className="text-center">
                    <Camera className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="mt-4">
                      <input
                        type="url"
                        value={formData.image}
                        onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter image URL"
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Enter image URL or upload functionality can be added later
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Product Variants */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-medium text-gray-900">Product Variants</h3>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Variant
              </button>
            </div>

            {variants.length === 0 ? (
              <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
                <Package className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">No variants defined. Add variants for different sizes, colors, or styles.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {variants.map((variant, index) => (
                  <div key={variant.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                    <div className="flex items-center space-x-3">
                      <select
                        value={variant.type}
                        onChange={(e) => updateVariant(index, 'type', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="size">Size</option>
                        <option value="color">Color</option>
                        <option value="style">Style</option>
                        <option value="material">Material</option>
                        <option value="flavor">Flavor</option>
                        <option value="other">Other</option>
                      </select>
                      
                      <input
                        type="text"
                        value={variant.value}
                        onChange={(e) => updateVariant(index, 'value', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Variant value (e.g., Large, Red, etc.)"
                      />
                      
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={variant.price}
                        onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Price"
                      />
                      
                      <button
                        type="button"
                        onClick={() => removeVariant(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                        <input
                          type="text"
                          value={variant.sku}
                          onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                            errors[`variant_${index}_sku`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Variant SKU"
                        />
                        {errors[`variant_${index}_sku`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`variant_${index}_sku`]}</p>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Barcode (Optional)</label>
                        <input
                          type="text"
                          value={variant.barcode}
                          onChange={(e) => updateVariant(index, 'barcode', e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                            errors[`variant_${index}_barcode`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Variant barcode"
                        />
                        {errors[`variant_${index}_barcode`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`variant_${index}_barcode`]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                Active product (visible in catalog and available for sale)
              </label>
            </div>
          </div>

          {/* Form Actions */}
          <div className="border-t border-gray-200 pt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {product ? 'Update Product' : 'Create Product'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}