import { 
  initOfflineDatabase,
  OfflineDatabase,
  ProductCategoryDocument,
  SupplierDocument,
  ProductVariantDocument,
  StockLevelDocument,
  ProductDocument
} from './offline-database'

export interface InventoryService {
  // Product operations
  createProduct: (product: Omit<ProductDocument, 'id' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateProduct: (id: string, updates: Partial<ProductDocument>) => Promise<void>
  getProducts: (tenantId?: string) => Promise<ProductDocument[]>
  getProduct: (id: string) => Promise<ProductDocument | null>
  deleteProduct: (id: string) => Promise<void>
  searchProducts: (query: string, tenantId?: string) => Promise<ProductDocument[]>
  
  // Category operations
  createCategory: (category: Omit<ProductCategoryDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateCategory: (id: string, updates: Partial<ProductCategoryDocument>) => Promise<void>
  getCategories: (tenantId?: string) => Promise<ProductCategoryDocument[]>
  getCategory: (id: string) => Promise<ProductCategoryDocument | null>
  getCategoryHierarchy: (tenantId?: string) => Promise<ProductCategoryDocument[]>
  deleteCategory: (id: string) => Promise<void>
  
  // Variant operations
  createVariant: (variant: Omit<ProductVariantDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateVariant: (id: string, updates: Partial<ProductVariantDocument>) => Promise<void>
  getVariants: (productId: string, tenantId?: string) => Promise<ProductVariantDocument[]>
  getVariant: (id: string) => Promise<ProductVariantDocument | null>
  deleteVariant: (id: string) => Promise<void>
  bulkCreateVariants: (variants: Array<Omit<ProductVariantDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>>) => Promise<string[]>
  bulkUpdateVariants: (updates: Array<{ id: string, updates: Partial<ProductVariantDocument> }>) => Promise<void>
  bulkDeleteVariants: (variantIds: string[]) => Promise<void>
  
  // Supplier operations
  createSupplier: (supplier: Omit<SupplierDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>) => Promise<string>
  updateSupplier: (id: string, updates: Partial<SupplierDocument>) => Promise<void>
  getSuppliers: (tenantId?: string) => Promise<SupplierDocument[]>
  getSupplier: (id: string) => Promise<SupplierDocument | null>
  deleteSupplier: (id: string) => Promise<void>
  
  // Brand operations
  getBrands: (tenantId?: string) => Promise<string[]>
  createBrand: (brandName: string, tenantId: string) => Promise<void>
  updateBrand: (oldBrand: string, newBrand: string, tenantId: string) => Promise<void>
  deleteBrand: (brandName: string, tenantId: string) => Promise<void>
  searchBrands: (query: string, tenantId?: string) => Promise<string[]>
  
  // Stock operations
  updateStock: (productId: string, locationId: string, stock: number) => Promise<void>
  getStockLevels: (productId: string) => Promise<StockLevelDocument[]>
  getStockLevel: (productId: string, locationId: string) => Promise<StockLevelDocument | null>
  
  // Utility operations
  generateSKU: (categoryCode: string, productName: string, variantInfo?: string) => string
  validateBarcode: (barcode: string) => boolean
  checkSKUExists: (sku: string, tenantId: string) => Promise<boolean>
  checkBarcodeExists: (barcode: string, tenantId: string) => Promise<boolean>
  getTenantId: () => string
}

class InventoryDatabaseService implements InventoryService {
  private database: OfflineDatabase | null = null
  
  async init(): Promise<void> {
    if (!this.database) {
      this.database = await initOfflineDatabase()
    }
  }
  
  private async getDb(): Promise<OfflineDatabase> {
    if (!this.database) {
      await this.init()
    }
    if (!this.database) {
      throw new Error('Database not initialized')
    }
    return this.database
  }
  
  // Product operations
  async createProduct(productData: Omit<ProductDocument, 'id' | 'updatedAt' | '_deleted'>): Promise<string> {
    const db = await this.getDb()
    const id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const product: ProductDocument = {
      ...productData,
      id,
      updatedAt: new Date().toISOString(),
      _deleted: false
    }
    
    await db.products.insert(product)
    return id
  }
  
  async updateProduct(id: string, updates: Partial<ProductDocument>): Promise<void> {
    const db = await this.getDb()
    const product = await db.products.findOne(id).exec()
    if (!product) throw new Error('Product not found')
    
    await product.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  async getProducts(tenantId?: string): Promise<ProductDocument[]> {
    const db = await this.getDb()
    const selector: any = { _deleted: { $ne: true } }
    if (tenantId) {
      selector.tenantId = tenantId
    }
    
    const products = await db.products.find({ selector }).exec()
    return products.map(doc => doc.toJSON())
  }
  
  async getProduct(id: string): Promise<ProductDocument | null> {
    const db = await this.getDb()
    const product = await db.products.findOne({
      selector: { id, _deleted: { $ne: true } }
    }).exec()
    
    return product ? product.toJSON() : null
  }
  
  async deleteProduct(id: string): Promise<void> {
    const db = await this.getDb()
    const product = await db.products.findOne(id).exec()
    if (!product) throw new Error('Product not found')
    
    await product.update({
      $set: {
        _deleted: true,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  async searchProducts(query: string, tenantId?: string): Promise<ProductDocument[]> {
    const db = await this.getDb()
    const selector: any = {
      _deleted: { $ne: true },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { barcode: { $regex: query, $options: 'i' } }
      ]
    }
    if (tenantId) {
      selector.tenantId = tenantId
    }
    
    const products = await db.products.find({ selector }).exec()
    return products.map(doc => doc.toJSON())
  }
  
  // Category operations
  async createCategory(categoryData: Omit<ProductCategoryDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>): Promise<string> {
    const db = await this.getDb()
    const id = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const category: ProductCategoryDocument = {
      ...categoryData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _deleted: false
    }
    
    await db.productCategories.insert(category)
    return id
  }
  
  async updateCategory(id: string, updates: Partial<ProductCategoryDocument>): Promise<void> {
    const db = await this.getDb()
    const category = await db.productCategories.findOne(id).exec()
    if (!category) throw new Error('Category not found')
    
    await category.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  async getCategories(tenantId?: string): Promise<ProductCategoryDocument[]> {
    const db = await this.getDb()
    const selector: any = { _deleted: { $ne: true } }
    if (tenantId) {
      selector.tenantId = tenantId
    }
    
    const categories = await db.productCategories.find({
      selector,
      sort: [{ sortOrder: 'asc' }, { categoryName: 'asc' }]
    }).exec()
    
    return categories.map(doc => doc.toJSON())
  }
  
  async getCategory(id: string): Promise<ProductCategoryDocument | null> {
    const db = await this.getDb()
    const category = await db.productCategories.findOne({
      selector: { id, _deleted: { $ne: true } }
    }).exec()
    
    return category ? category.toJSON() : null
  }
  
  async getCategoryHierarchy(tenantId?: string): Promise<ProductCategoryDocument[]> {
    const categories = await this.getCategories(tenantId)
    
    // Build hierarchy tree (root categories first, then children)
    const rootCategories = categories.filter(cat => !cat.parentCategoryId)
    const childCategories = categories.filter(cat => cat.parentCategoryId)
    
    const hierarchy: ProductCategoryDocument[] = []
    
    // Add root categories
    hierarchy.push(...rootCategories)
    
    // Add children recursively
    const addChildren = (parentId: string, level: number = 1) => {
      const children = childCategories.filter(cat => cat.parentCategoryId === parentId)
      children.forEach(child => {
        hierarchy.push(child)
        addChildren(child.id, level + 1)
      })
    }
    
    rootCategories.forEach(root => addChildren(root.id))
    
    return hierarchy
  }
  
  async deleteCategory(id: string): Promise<void> {
    const db = await this.getDb()
    const category = await db.productCategories.findOne(id).exec()
    if (!category) throw new Error('Category not found')
    
    // Check if category has children
    const children = await db.productCategories.find({
      selector: { parentCategoryId: id, _deleted: { $ne: true } }
    }).exec()
    
    if (children.length > 0) {
      throw new Error('Cannot delete category that has subcategories')
    }
    
    // Check if category has products
    const products = await db.products.find({
      selector: { categoryId: id, _deleted: { $ne: true } }
    }).exec()
    
    if (products.length > 0) {
      throw new Error('Cannot delete category that has products')
    }
    
    await category.update({
      $set: {
        _deleted: true,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  // Variant operations
  async createVariant(variantData: Omit<ProductVariantDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>): Promise<string> {
    const db = await this.getDb()
    const id = `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const variant: ProductVariantDocument = {
      ...variantData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _deleted: false
    }
    
    await db.productVariants.insert(variant)
    return id
  }
  
  async updateVariant(id: string, updates: Partial<ProductVariantDocument>): Promise<void> {
    const db = await this.getDb()
    const variant = await db.productVariants.findOne(id).exec()
    if (!variant) throw new Error('Variant not found')
    
    await variant.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  async getVariants(productId: string, tenantId?: string): Promise<ProductVariantDocument[]> {
    const db = await this.getDb()
    const selector: any = { productId, _deleted: { $ne: true } }
    if (tenantId) {
      selector.tenantId = tenantId
    }
    
    const variants = await db.productVariants.find({
      selector,
      sort: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { variantName: 'asc' }]
    }).exec()
    
    return variants.map(doc => doc.toJSON())
  }
  
  async getVariant(id: string): Promise<ProductVariantDocument | null> {
    const db = await this.getDb()
    const variant = await db.productVariants.findOne({
      selector: { id, _deleted: { $ne: true } }
    }).exec()
    
    return variant ? variant.toJSON() : null
  }
  
  async deleteVariant(id: string): Promise<void> {
    const db = await this.getDb()
    const variant = await db.productVariants.findOne(id).exec()
    if (!variant) throw new Error('Variant not found')
    
    await variant.update({
      $set: {
        _deleted: true,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  // Supplier operations
  async createSupplier(supplierData: Omit<SupplierDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>): Promise<string> {
    const db = await this.getDb()
    const id = `sup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const supplier: SupplierDocument = {
      ...supplierData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _deleted: false
    }
    
    await db.suppliers.insert(supplier)
    return id
  }
  
  async updateSupplier(id: string, updates: Partial<SupplierDocument>): Promise<void> {
    const db = await this.getDb()
    const supplier = await db.suppliers.findOne(id).exec()
    if (!supplier) throw new Error('Supplier not found')
    
    await supplier.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  async getSuppliers(tenantId?: string): Promise<SupplierDocument[]> {
    const db = await this.getDb()
    const selector: any = { _deleted: { $ne: true } }
    if (tenantId) {
      selector.tenantId = tenantId
    }
    
    const suppliers = await db.suppliers.find({
      selector,
      sort: [{ supplierName: 'asc' }]
    }).exec()
    
    return suppliers.map(doc => doc.toJSON())
  }
  
  async getSupplier(id: string): Promise<SupplierDocument | null> {
    const db = await this.getDb()
    const supplier = await db.suppliers.findOne({
      selector: { id, _deleted: { $ne: true } }
    }).exec()
    
    return supplier ? supplier.toJSON() : null
  }
  
  async deleteSupplier(id: string): Promise<void> {
    const db = await this.getDb()
    const supplier = await db.suppliers.findOne(id).exec()
    if (!supplier) throw new Error('Supplier not found')
    
    // Check if supplier has products
    const products = await db.products.find({
      selector: { supplierId: id, _deleted: { $ne: true } }
    }).exec()
    
    if (products.length > 0) {
      throw new Error('Cannot delete supplier that has associated products')
    }
    
    await supplier.update({
      $set: {
        _deleted: true,
        updatedAt: new Date().toISOString()
      }
    })
  }
  
  // Stock operations
  async updateStock(productId: string, locationId: string, stock: number): Promise<void> {
    const db = await this.getDb()
    
    // Find existing stock level or create new one
    const existingStock = await db.stockLevels.findOne({
      selector: { productId, locationId }
    }).exec()
    
    if (existingStock) {
      await existingStock.update({
        $set: {
          currentStock: stock,
          availableStock: Math.max(0, stock - (existingStock.get('reservedStock') || 0)),
          updatedAt: new Date().toISOString()
        }
      })
    } else {
      const id = `stk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const stockLevel: StockLevelDocument = {
        id,
        tenantId: this.getTenantId(),
        productId,
        locationId,
        currentStock: stock,
        reservedStock: 0,
        availableStock: stock,
        costPerUnit: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      }
      
      await db.stockLevels.insert(stockLevel)
    }
  }
  
  async getStockLevels(productId: string): Promise<StockLevelDocument[]> {
    const db = await this.getDb()
    const stockLevels = await db.stockLevels.find({
      selector: { productId, _deleted: { $ne: true } }
    }).exec()
    
    return stockLevels.map(doc => doc.toJSON())
  }
  
  async getStockLevel(productId: string, locationId: string): Promise<StockLevelDocument | null> {
    const db = await this.getDb()
    const stockLevel = await db.stockLevels.findOne({
      selector: { productId, locationId, _deleted: { $ne: true } }
    }).exec()
    
    return stockLevel ? stockLevel.toJSON() : null
  }
  
  // Utility operations
  generateSKU(categoryCode: string, productName: string, variantInfo?: string): string {
    // Generate SKU in format: CAT-PROD-VAR-RAND
    const catCode = categoryCode.toUpperCase().substr(0, 3)
    const prodCode = productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substr(0, 4)
    const varCode = variantInfo ? variantInfo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substr(0, 3) : ''
    const randomCode = Math.random().toString(36).substr(2, 4).toUpperCase()
    
    return `${catCode}-${prodCode}${varCode ? '-' + varCode : ''}-${randomCode}`
  }
  
  validateBarcode(barcode: string): boolean {
    // Basic barcode validation (EAN-13, UPC-A, etc.)
    if (!barcode || barcode.length < 8 || barcode.length > 14) {
      return false
    }
    
    // Check if all characters are digits
    return /^\d+$/.test(barcode)
  }
  
  async checkSKUExists(sku: string, tenantId: string): Promise<boolean> {
    const db = await this.getDb()
    
    // Check in products (now using the separate sku field)
    const productExists = await db.products.findOne({
      selector: { sku, tenantId, _deleted: { $ne: true } }
    }).exec()
    
    if (productExists) return true
    
    // Check in variants
    const variantExists = await db.productVariants.findOne({
      selector: { sku, tenantId, _deleted: { $ne: true } }
    }).exec()
    
    return !!variantExists
  }
  
  async checkBarcodeExists(barcode: string, tenantId: string): Promise<boolean> {
    const db = await this.getDb()
    
    // Check in products
    const productExists = await db.products.findOne({
      selector: { barcode, tenantId, _deleted: { $ne: true } }
    }).exec()
    
    if (productExists) return true
    
    // Check in variants
    const variantExists = await db.productVariants.findOne({
      selector: { barcode, tenantId, _deleted: { $ne: true } }
    }).exec()
    
    return !!variantExists
  }
  
  // Brand operations
  async getBrands(tenantId?: string): Promise<string[]> {
    const db = await this.getDb()
    const selector: any = { _deleted: { $ne: true } }
    if (tenantId) {
      selector.tenantId = tenantId
    }
    
    const products = await db.products.find({ selector }).exec()
    const brands = new Set<string>()
    
    products.forEach(product => {
      const productData = product.toJSON()
      if (productData.brand && productData.brand.trim()) {
        brands.add(productData.brand.trim())
      }
    })
    
    return Array.from(brands).sort()
  }
  
  async createBrand(brandName: string, tenantId: string): Promise<void> {
    // Brands are managed implicitly through products
    // This method is for consistency but doesn't need implementation
    // as brands are created when products are assigned brand names
  }
  
  async updateBrand(oldBrand: string, newBrand: string, tenantId: string): Promise<void> {
    const db = await this.getDb()
    const products = await db.products.find({
      selector: { 
        brand: oldBrand, 
        tenantId, 
        _deleted: { $ne: true } 
      }
    }).exec()
    
    for (const product of products) {
      await product.update({
        $set: {
          brand: newBrand,
          updatedAt: new Date().toISOString()
        }
      })
    }
  }
  
  async deleteBrand(brandName: string, tenantId: string): Promise<void> {
    const db = await this.getDb()
    const products = await db.products.find({
      selector: { 
        brand: brandName, 
        tenantId, 
        _deleted: { $ne: true } 
      }
    }).exec()
    
    for (const product of products) {
      await product.update({
        $set: {
          brand: '',
          updatedAt: new Date().toISOString()
        }
      })
    }
  }
  
  async searchBrands(query: string, tenantId?: string): Promise<string[]> {
    const brands = await this.getBrands(tenantId)
    return brands.filter(brand => 
      brand.toLowerCase().includes(query.toLowerCase())
    )
  }
  
  // Bulk variant operations
  async bulkCreateVariants(variants: Array<Omit<ProductVariantDocument, 'id' | 'createdAt' | 'updatedAt' | '_deleted'>>): Promise<string[]> {
    const db = await this.getDb()
    const createdIds: string[] = []
    
    for (const variantData of variants) {
      const id = `variant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const variant: ProductVariantDocument = {
        ...variantData,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      }
      
      await db.productVariants.insert(variant)
      createdIds.push(id)
    }
    
    return createdIds
  }
  
  async bulkUpdateVariants(updates: Array<{ id: string, updates: Partial<ProductVariantDocument> }>): Promise<void> {
    const db = await this.getDb()
    
    for (const { id, updates: variantUpdates } of updates) {
      const variant = await db.productVariants.findOne(id).exec()
      if (!variant) continue
      
      await variant.update({
        $set: {
          ...variantUpdates,
          updatedAt: new Date().toISOString()
        }
      })
    }
  }
  
  async bulkDeleteVariants(variantIds: string[]): Promise<void> {
    const db = await this.getDb()
    
    for (const id of variantIds) {
      const variant = await db.productVariants.findOne(id).exec()
      if (!variant) continue
      
      await variant.update({
        $set: {
          _deleted: true,
          updatedAt: new Date().toISOString()
        }
      })
    }
  }
  
  // Tenant management
  getTenantId(): string {
    // Get tenant ID from global context or environment
    // In a production app, this would come from authenticated user context
    if (typeof window !== 'undefined') {
      // Client-side: get from subdomain or localStorage
      const subdomain = window.location.hostname.split('.')[0]
      if (subdomain && subdomain !== 'localhost' && subdomain !== '127') {
        return subdomain
      }
      // Fallback to localStorage for development
      const storedTenantId = localStorage.getItem('tenantId')
      if (storedTenantId) {
        return storedTenantId
      }
    }
    
    // Server-side: get from environment or default
    return process.env.TENANT_ID || 'default'
  }
}

// Singleton instance
const inventoryService = new InventoryDatabaseService()

export { inventoryService }
export default inventoryService