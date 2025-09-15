'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit, Check, X, Upload, Download, Package } from 'lucide-react'
import variantApiService, { type VariantData } from '../../lib/variant-api-service'

interface VariantManagerProps {
  productId: string
  onClose: () => void
}

interface VariantFormData {
  id?: string
  variantType: 'size' | 'color' | 'style' | 'material' | 'flavor' | 'other'
  variantValue: string
  sellingPrice?: number
  sku?: string
  barcode?: string
  costPrice: number
  isActive: boolean
  isDefault: boolean
}

const VARIANT_TYPES = [
  { value: 'size', label: 'Size' },
  { value: 'color', label: 'Color' },
  { value: 'style', label: 'Style' },
  { value: 'material', label: 'Material' },
  { value: 'flavor', label: 'Flavor' },
  { value: 'other', label: 'Other' }
]

export default function VariantManager({ productId, onClose }: VariantManagerProps) {
  const [variants, setVariants] = useState<VariantData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingVariant, setEditingVariant] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState<VariantFormData>({
    variantType: 'size',
    variantValue: '',
    costPrice: 0,
    isActive: true,
    isDefault: false,
    barcode: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadVariants()
  }, [productId])

  const loadVariants = async () => {
    try {
      setLoading(true)
      const variantsData = await variantApiService.getVariants(productId)
      setVariants(variantsData)
    } catch (error) {
      console.error('Error loading variants:', error)
      alert('Failed to load variants. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {}

    if (!formData.variantValue.trim()) {
      newErrors.variantValue = 'Variant value is required'
    }

    if (formData.costPrice < 0) {
      newErrors.costPrice = 'Cost price cannot be negative'
    }

    if (formData.sellingPrice && formData.sellingPrice < 0) {
      newErrors.sellingPrice = 'Selling price cannot be negative'
    }

    // Validate barcode format if provided
    if (formData.barcode && !variantApiService.validateBarcode(formData.barcode)) {
      newErrors.barcode = 'Invalid barcode format'
    }

    // Check for duplicate variant combinations (client-side check)
    const isDuplicate = variants.some(variant => 
      variant.id !== formData.id &&
      variant.variantType === formData.variantType &&
      variant.variantValue.toLowerCase() === formData.variantValue.toLowerCase().trim()
    )

    if (isDuplicate) {
      newErrors.variantValue = `A ${formData.variantType} variant with this value already exists`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSaveVariant = async () => {
    if (!(await validateForm())) {
      return
    }

    try {
      const variantData = {
        productId,
        variantCode: variantApiService.generateVariantCode(productId, formData.variantType, formData.variantValue),
        variantName: variantApiService.generateVariantName(formData.variantType, formData.variantValue),
        variantType: formData.variantType,
        variantValue: formData.variantValue.trim(),
        sku: formData.sku || undefined,
        barcode: formData.barcode || undefined,
        costPrice: formData.costPrice,
        sellingPrice: formData.sellingPrice || undefined,
        isActive: formData.isActive,
        isDefault: formData.isDefault,
        sortOrder: 0,
        metadata: {}
      }

      if (editingVariant) {
        await variantApiService.updateVariant(editingVariant, variantData)
      } else {
        await variantApiService.createVariant(variantData)
      }

      await loadVariants()
      resetForm()
    } catch (error) {
      console.error('Error saving variant:', error)
      // Extract error message from API response if available
      const errorMessage = error instanceof Error ? error.message : 'Failed to save variant. Please try again.'
      alert(errorMessage)
    }
  }

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Are you sure you want to delete this variant?')) {
      return
    }

    try {
      await variantApiService.deleteVariant(variantId)
      await loadVariants()
    } catch (error) {
      console.error('Error deleting variant:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete variant. Please try again.'
      alert(errorMessage)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedVariants.size === 0) {
      alert('Please select variants to delete')
      return
    }

    if (!confirm(`Are you sure you want to delete ${selectedVariants.size} variant(s)?`)) {
      return
    }

    try {
      await variantApiService.bulkDeleteVariants(Array.from(selectedVariants))
      await loadVariants()
      setSelectedVariants(new Set())
    } catch (error) {
      console.error('Error bulk deleting variants:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete variants. Please try again.'
      alert(errorMessage)
    }
  }

  const handleBulkCreate = async () => {
    // Simple bulk create example - in real app, this could import from CSV
    const bulkVariants = [
      { type: 'size' as const, value: 'Small' },
      { type: 'size' as const, value: 'Medium' },
      { type: 'size' as const, value: 'Large' }
    ]
    
    const variantsToCreate = bulkVariants
      .filter(v => !variants.some(existing => 
        existing.variantType === v.type && existing.variantValue.toLowerCase() === v.value.toLowerCase()
      ))
      .map(v => ({
        productId,
        variantCode: variantApiService.generateVariantCode(productId, v.type, v.value),
        variantName: variantApiService.generateVariantName(v.type, v.value),
        variantType: v.type,
        variantValue: v.value,
        costPrice: 0,
        isActive: true,
        isDefault: false,
        sortOrder: 0,
        metadata: {}
      }))

    if (variantsToCreate.length === 0) {
      alert('All sample variants already exist')
      return
    }

    try {
      await variantApiService.bulkCreateVariants(variantsToCreate)
      await loadVariants()
    } catch (error) {
      console.error('Error bulk creating variants:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create variants. Please try again.'
      alert(errorMessage)
    }
  }

  const startEdit = (variant: VariantData) => {
    setEditingVariant(variant.id!)
    setFormData({
      id: variant.id,
      variantType: variant.variantType,
      variantValue: variant.variantValue,
      sellingPrice: variant.sellingPrice,
      sku: variant.sku,
      barcode: variant.barcode,
      costPrice: variant.costPrice,
      isActive: variant.isActive,
      isDefault: variant.isDefault
    })
    setErrors({})
  }

  const resetForm = () => {
    setFormData({
      variantType: 'size',
      variantValue: '',
      costPrice: 0,
      isActive: true,
      isDefault: false
    })
    setEditingVariant(null)
    setIsCreating(false)
    setErrors({})
  }

  const toggleVariantSelection = (variantId: string) => {
    const newSelection = new Set(selectedVariants)
    if (newSelection.has(variantId)) {
      newSelection.delete(variantId)
    } else {
      newSelection.add(variantId)
    }
    setSelectedVariants(newSelection)
  }

  const selectAllVariants = () => {
    if (selectedVariants.size === variants.length) {
      setSelectedVariants(new Set())
    } else {
      setSelectedVariants(new Set(variants.map(v => v.id).filter((id): id is string => id !== undefined)))
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Manage Product Variants</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Bulk Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <button
                onClick={selectAllVariants}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {selectedVariants.size === variants.length ? 'Deselect All' : 'Select All'}
              </button>
              
              {selectedVariants.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-300 rounded-md hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4 inline mr-1" />
                  Delete Selected ({selectedVariants.size})
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkCreate}
                className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100 transition-colors"
              >
                <Upload className="w-4 h-4 inline mr-1" />
                Add Size Variants
              </button>
              
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                New Variant
              </button>
            </div>
          </div>

          {/* Create/Edit Form */}
          {(isCreating || editingVariant) && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-md font-medium text-gray-900 mb-4">
                {editingVariant ? 'Edit Variant' : 'Create New Variant'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type *
                  </label>
                  <select
                    value={formData.variantType}
                    onChange={(e) => setFormData(prev => ({ ...prev, variantType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {VARIANT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value *
                  </label>
                  <input
                    type="text"
                    value={formData.variantValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, variantValue: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.variantValue ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., Large, Blue, Cotton"
                  />
                  {errors.variantValue && <p className="text-sm text-red-600 mt-1">{errors.variantValue}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.costPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, costPrice: parseFloat(e.target.value) || 0 }))}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.costPrice ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                  />
                  {errors.costPrice && <p className="text-sm text-red-600 mt-1">{errors.costPrice}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selling Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.sellingPrice || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      sellingPrice: e.target.value ? parseFloat(e.target.value) : undefined 
                    }))}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.sellingPrice ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                  />
                  {errors.sellingPrice && <p className="text-sm text-red-600 mt-1">{errors.sellingPrice}</p>}
                </div>
              </div>

              <div className="flex items-center space-x-4 mt-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Active</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Default variant</span>
                </label>
              </div>

              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVariant}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Check className="w-4 h-4 inline mr-1" />
                  {editingVariant ? 'Update' : 'Create'} Variant
                </button>
              </div>
            </div>
          )}

          {/* Variants List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading variants...</span>
            </div>
          ) : variants.length > 0 ? (
            <div className="space-y-2">
              {variants.map((variant) => (
                <div key={variant.id} className="flex items-center p-4 border border-gray-200 rounded-lg bg-white">
                  <input
                    type="checkbox"
                    checked={variant.id ? selectedVariants.has(variant.id) : false}
                    onChange={() => variant.id && toggleVariantSelection(variant.id)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-4"
                  />
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{variant.variantType}</span>
                      <p className="text-sm text-gray-600">{variant.variantValue}</p>
                    </div>
                    
                    <div>
                      <span className="text-sm text-gray-600">Cost: ${variant.costPrice.toFixed(2)}</span>
                      {variant.sellingPrice && (
                        <p className="text-sm text-gray-600">Sell: ${variant.sellingPrice.toFixed(2)}</p>
                      )}
                    </div>
                    
                    <div>
                      {variant.sku && (
                        <span className="text-sm text-gray-600">SKU: {variant.sku}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        variant.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {variant.isActive ? 'Active' : 'Inactive'}
                      </span>
                      
                      {variant.isDefault && (
                        <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 ml-4">
                    <button
                      onClick={() => startEdit(variant)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                      title="Edit variant"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => variant.id && handleDeleteVariant(variant.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Delete variant"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No variants yet</h3>
              <p className="text-gray-500 mb-4">Create your first variant to get started</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Create First Variant
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}