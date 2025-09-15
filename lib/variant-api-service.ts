/**
 * API Service for Product Variants - PostgreSQL-backed
 * Replaces the offline database variant operations with HTTP API calls
 */

export interface VariantData {
  id?: string
  productId: string
  variantCode: string
  variantName: string
  sku?: string
  barcode?: string
  variantType: 'size' | 'color' | 'style' | 'material' | 'flavor' | 'other'
  variantValue: string
  costPrice: number
  sellingPrice?: number
  weight?: number
  dimensions?: string
  imageUrl?: string
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  metadata?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  error?: string
  data?: T
  variants?: T[]
  variant?: T
  pagination?: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  validationErrors?: Array<{
    field: string
    message: string
    conflictId?: string
  }>
}

class VariantApiService {
  private baseUrl = '/api/inventory/variants'

  /**
   * Get variants for a specific product
   */
  async getVariants(productId: string, params?: {
    limit?: number
    offset?: number
    search?: string
    variantType?: string
    isActive?: boolean
  }): Promise<VariantData[]> {
    try {
      const searchParams = new URLSearchParams()
      searchParams.set('productId', productId)
      
      if (params?.limit) searchParams.set('limit', params.limit.toString())
      if (params?.offset) searchParams.set('offset', params.offset.toString())
      if (params?.search) searchParams.set('search', params.search)
      if (params?.variantType) searchParams.set('variantType', params.variantType)
      if (params?.isActive !== undefined) searchParams.set('isActive', params.isActive.toString())

      const response = await fetch(`${this.baseUrl}?${searchParams}`)
      const result: ApiResponse<VariantData> = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch variants')
      }

      return result.variants || []
    } catch (error) {
      console.error('Error fetching variants:', error)
      throw error
    }
  }

  /**
   * Create a new variant
   */
  async createVariant(variantData: Omit<VariantData, 'id' | 'createdAt' | 'updatedAt'>): Promise<VariantData> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(variantData),
      })

      const result: ApiResponse<VariantData> = await response.json()

      if (!result.success) {
        if (result.validationErrors) {
          // Convert validation errors to user-friendly format
          const errorMessages = result.validationErrors.map(err => `${err.field}: ${err.message}`).join(', ')
          throw new Error(`Validation failed: ${errorMessages}`)
        }
        throw new Error(result.error || 'Failed to create variant')
      }

      return result.variant!
    } catch (error) {
      console.error('Error creating variant:', error)
      throw error
    }
  }

  /**
   * Update an existing variant
   */
  async updateVariant(id: string, updates: Partial<VariantData>): Promise<VariantData> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, ...updates }),
      })

      const result: ApiResponse<VariantData> = await response.json()

      if (!result.success) {
        if (result.validationErrors) {
          // Convert validation errors to user-friendly format
          const errorMessages = result.validationErrors.map(err => `${err.field}: ${err.message}`).join(', ')
          throw new Error(`Validation failed: ${errorMessages}`)
        }
        throw new Error(result.error || 'Failed to update variant')
      }

      return result.variant!
    } catch (error) {
      console.error('Error updating variant:', error)
      throw error
    }
  }

  /**
   * Delete a variant
   */
  async deleteVariant(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}?id=${id}`, {
        method: 'DELETE',
      })

      const result: ApiResponse<void> = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete variant')
      }
    } catch (error) {
      console.error('Error deleting variant:', error)
      throw error
    }
  }

  /**
   * Bulk delete variants
   */
  async bulkDeleteVariants(variantIds: string[]): Promise<void> {
    try {
      // Delete each variant individually since the API doesn't support bulk delete yet
      const deletePromises = variantIds.map(id => this.deleteVariant(id))
      await Promise.all(deletePromises)
    } catch (error) {
      console.error('Error bulk deleting variants:', error)
      throw error
    }
  }

  /**
   * Bulk create variants
   */
  async bulkCreateVariants(variants: Array<Omit<VariantData, 'id' | 'createdAt' | 'updatedAt'>>): Promise<VariantData[]> {
    try {
      // Create each variant individually since the API doesn't support bulk create yet
      const createPromises = variants.map(variant => this.createVariant(variant))
      return await Promise.all(createPromises)
    } catch (error) {
      console.error('Error bulk creating variants:', error)
      throw error
    }
  }

  /**
   * Check if a barcode exists (uses validation from create/update APIs)
   */
  async checkBarcodeExists(barcode: string, excludeId?: string): Promise<boolean> {
    try {
      // We'll rely on the API validation during create/update operations
      // This method is kept for compatibility but always returns false
      // The real validation happens server-side in the API
      return false
    } catch (error) {
      console.error('Error checking barcode:', error)
      return false
    }
  }

  /**
   * Check if a SKU exists (uses validation from create/update APIs)
   */
  async checkSKUExists(sku: string, excludeId?: string): Promise<boolean> {
    try {
      // We'll rely on the API validation during create/update operations
      // This method is kept for compatibility but always returns false
      // The real validation happens server-side in the API
      return false
    } catch (error) {
      console.error('Error checking SKU:', error)
      return false
    }
  }

  /**
   * Validate barcode format (client-side validation)
   */
  validateBarcode(barcode: string): boolean {
    // Basic barcode validation (EAN-13, UPC-A, etc.)
    if (!barcode || barcode.length < 8 || barcode.length > 14) {
      return false
    }
    
    // Check if all characters are digits
    return /^\d+$/.test(barcode)
  }

  /**
   * Generate a variant code
   */
  generateVariantCode(productId: string, variantType: string, variantValue: string): string {
    const typeCode = variantType.toUpperCase().substring(0, 3)
    const valueCode = variantValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 5)
    const timestamp = Date.now().toString().slice(-6)
    return `${productId}-${typeCode}-${valueCode}-${timestamp}`
  }

  /**
   * Generate a variant name
   */
  generateVariantName(variantType: string, variantValue: string): string {
    const typeLabel = variantType.charAt(0).toUpperCase() + variantType.slice(1)
    return `${typeLabel} - ${variantValue}`
  }
}

// Singleton instance
const variantApiService = new VariantApiService()

export { variantApiService }
export default variantApiService