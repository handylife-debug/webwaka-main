import { execute_sql } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';

// Types for ProductCatalog operations
export interface Product {
  id: string;
  tenantId: string;
  productCode: string;
  productName: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  supplierId?: string;
  brand?: string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  currency: 'NGN' | 'USD' | 'GBP';
  bulkPricing?: BulkPricing[];
  unitConversions?: UnitConversions;
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint: number;
  reorderQuantity: number;
  isTaxable: boolean;
  description?: string;
  imageUrl?: string;
  weight?: number;
  dimensions?: string;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  categoryCode: string;
  categoryName: string;
  parentCategoryId?: string;
  description?: string;
  taxRate: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  variantCode: string;
  variantName: string;
  sku?: string;
  barcode?: string;
  variantType: 'size' | 'color' | 'style' | 'material' | 'flavor' | 'other';
  variantValue: string;
  costPrice: number;
  sellingPrice?: number;
  weight?: number;
  dimensions?: string;
  imageUrl?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BulkPricing {
  minQuantity: number;
  unitPrice: number;
}

export interface UnitConversions {
  piecesPerCarton?: number;
  cartonsPerPallet?: number;
  gramPerUnit?: number;
  mlPerUnit?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// Nigerian market exchange rates (would typically come from external API)
const EXCHANGE_RATES = {
  'NGN-USD': 0.0012,  // 1 NGN = 0.0012 USD (approximate)
  'NGN-GBP': 0.0010,  // 1 NGN = 0.0010 GBP (approximate)
  'USD-NGN': 850.0,   // 1 USD = 850 NGN (approximate)
  'USD-GBP': 0.82,    // 1 USD = 0.82 GBP (approximate)
  'GBP-NGN': 1050.0,  // 1 GBP = 1050 NGN (approximate)
  'GBP-USD': 1.22     // 1 GBP = 1.22 USD (approximate)
};

// Nigerian VAT rates by product category
const NIGERIAN_VAT_RATES = {
  'default': 0.075,        // 7.5% standard VAT
  'food': 0.0,             // Food items are VAT-exempt
  'medicine': 0.0,         // Medicines are VAT-exempt
  'books': 0.0,           // Books are VAT-exempt
  'luxury': 0.075,        // Luxury goods 7.5%
  'electronics': 0.075,   // Electronics 7.5%
  'automotive': 0.075,    // Automotive parts 7.5%
  'textiles': 0.075       // Textiles 7.5%
};

// Input validation schemas
const createProductSchema = z.object({
  productCode: z.string().min(1).max(100),
  productName: z.string().min(1).max(200),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  brand: z.string().max(100).optional(),
  unitOfMeasure: z.string().max(50).default('each'),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0),
  currency: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  bulkPricing: z.array(z.object({
    minQuantity: z.number().int().min(1),
    unitPrice: z.number().min(0)
  })).optional(),
  unitConversions: z.object({
    piecesPerCarton: z.number().int().min(1).optional(),
    cartonsPerPallet: z.number().int().min(1).optional(),
    gramPerUnit: z.number().min(0).optional(),
    mlPerUnit: z.number().min(0).optional()
  }).optional(),
  minStockLevel: z.number().int().min(0).default(0),
  maxStockLevel: z.number().int().min(0).default(1000),
  reorderPoint: z.number().int().min(0).default(10),
  reorderQuantity: z.number().int().min(1).default(50),
  isTaxable: z.boolean().default(true),
  description: z.string().optional(),
  imageUrl: z.string().max(500).optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.any()).default({})
});

const createCategorySchema = z.object({
  categoryCode: z.string().min(1).max(50),
  categoryName: z.string().min(1).max(100),
  parentCategoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  taxRate: z.number().min(0).max(1).default(0.075), // Nigerian standard VAT
  isActive: z.boolean().default(true)
});

const createVariantSchema = z.object({
  productId: z.string().uuid(),
  variantCode: z.string().min(1).max(100),
  variantName: z.string().min(1).max(200),
  variantType: z.enum(['size', 'color', 'style', 'material', 'flavor', 'other']),
  variantValue: z.string().min(1).max(100),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.string().max(100).optional(),
  imageUrl: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0)
});

export const productCatalogCell = {
  // ========================================
  // PRODUCT MANAGEMENT OPERATIONS
  // ========================================

  /**
   * Create a new product with Nigerian market features
   */
  async createProduct(input: unknown, tenantId: string): Promise<{ success: boolean; product?: Product; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = createProductSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const productData = validationResult.data;

        // Validate uniqueness constraints
        const uniqueChecks = await Promise.all([
          productData.productCode ? this.checkUniqueProductCode(tenantId, productData.productCode) : Promise.resolve(true),
          productData.sku ? this.checkUniqueSKU(tenantId, productData.sku) : Promise.resolve(true),
          productData.barcode ? this.checkUniqueBarcode(tenantId, productData.barcode) : Promise.resolve(true)
        ]);

        if (!uniqueChecks.every(check => check)) {
          return {
            success: false,
            message: 'Validation failed',
            error: 'Product code, SKU, or barcode already exists'
          };
        }

        // Validate category and supplier references if provided
        if (productData.categoryId) {
          const categoryExists = await this.validateCategoryExists(tenantId, productData.categoryId);
          if (!categoryExists) {
            return {
              success: false,
              message: 'Invalid category reference',
              error: 'Category does not exist'
            };
          }
        }

        if (productData.supplierId) {
          const supplierExists = await this.validateSupplierExists(tenantId, productData.supplierId);
          if (!supplierExists) {
            return {
              success: false,
              message: 'Invalid supplier reference',
              error: 'Supplier does not exist'
            };
          }
        }

        // Auto-generate SKU if not provided
        if (!productData.sku) {
          productData.sku = await this.generateSKU(tenantId, productData.categoryId, productData.productName);
        }

        // Convert prices to NGN if different currency provided
        let ngnCostPrice = productData.costPrice;
        let ngnSellingPrice = productData.sellingPrice;

        if (productData.currency && productData.currency !== 'NGN') {
          const conversionRate = EXCHANGE_RATES[`${productData.currency}-NGN` as keyof typeof EXCHANGE_RATES];
          if (conversionRate) {
            ngnCostPrice = productData.costPrice * conversionRate;
            ngnSellingPrice = productData.sellingPrice * conversionRate;
          }
        }

        const productId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Insert product into database
        const result = await execute_sql(
          `INSERT INTO inventory_products (
            id, tenant_id, product_code, product_name, sku, barcode,
            category_id, supplier_id, brand, unit_of_measure,
            cost_price, selling_price, min_stock_level, max_stock_level,
            reorder_point, reorder_quantity, track_serial_numbers, track_lots,
            description, image_url, weight, dimensions, is_active, is_taxable,
            metadata, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
          ) RETURNING *`,
          [
            productId, tenantId, productData.productCode, productData.productName,
            productData.sku, productData.barcode, productData.categoryId, productData.supplierId,
            productData.brand, productData.unitOfMeasure, ngnCostPrice, ngnSellingPrice,
            productData.minStockLevel, productData.maxStockLevel, productData.reorderPoint,
            productData.reorderQuantity, false, false, productData.description,
            productData.imageUrl, productData.weight, productData.dimensions,
            productData.isActive, productData.isTaxable,
            JSON.stringify({
              ...productData.metadata,
              originalCurrency: productData.currency,
              originalCostPrice: productData.costPrice,
              originalSellingPrice: productData.sellingPrice,
              bulkPricing: productData.bulkPricing,
              unitConversions: productData.unitConversions
            }),
            now, now
          ]
        );

        if (result.rows.length === 0) {
          return {
            success: false,
            message: 'Failed to create product',
            error: 'Database insertion failed'
          };
        }

        // Cache product for quick access
        const cacheKey = `product:${tenantId}:${productId}`;
        await redis.set(cacheKey, JSON.stringify(result.rows[0]), { ex: 300 }); // Cache for 5 minutes

        const createdProduct = this.mapDatabaseRowToProduct(result.rows[0]);

        console.log(`[ProductCatalog] Created product: ${createdProduct.productName} (${createdProduct.id}) for tenant ${tenantId}`);

        return {
          success: true,
          product: createdProduct,
          message: 'Product created successfully'
        };
      },
      {
        success: false,
        message: 'Product catalog service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Update an existing product
   */
  async updateProduct(input: unknown, tenantId: string): Promise<{ success: boolean; product?: Product; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { id, updates } = input as { id: string; updates: any };
        
        if (!id || !updates) {
          return {
            success: false,
            message: 'Invalid input data',
            error: 'Product ID and updates are required'
          };
        }

        // Validate updates schema (partial)
        const validationResult = createProductSchema.partial().safeParse(updates);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid update data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const updateData = validationResult.data;

        // Check if product exists and belongs to tenant
        const existingProduct = await execute_sql(
          'SELECT * FROM inventory_products WHERE id = $1 AND tenant_id = $2',
          [id, tenantId]
        );

        if (existingProduct.rows.length === 0) {
          return {
            success: false,
            message: 'Product not found',
            error: 'Product does not exist or access denied'
          };
        }

        // Build dynamic update query
        const updateFields = [];
        const updateValues = [];
        let paramCounter = 1;

        for (const [key, value] of Object.entries(updateData)) {
          if (value !== undefined) {
            updateFields.push(`${this.camelToSnake(key)} = $${paramCounter}`);
            updateValues.push(value);
            paramCounter++;
          }
        }

        if (updateFields.length === 0) {
          return {
            success: false,
            message: 'No valid updates provided',
            error: 'No fields to update'
          };
        }

        updateFields.push(`updated_at = $${paramCounter}`);
        updateValues.push(new Date().toISOString());
        paramCounter++;

        // Add WHERE clause parameters
        updateValues.push(id, tenantId);

        const updateQuery = `
          UPDATE inventory_products 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCounter - 1} AND tenant_id = $${paramCounter}
          RETURNING *
        `;

        const result = await execute_sql(updateQuery, updateValues);

        if (result.rows.length === 0) {
          return {
            success: false,
            message: 'Failed to update product',
            error: 'Database update failed'
          };
        }

        // Invalidate cache
        const cacheKey = `product:${tenantId}:${id}`;
        await redis.del(cacheKey);

        const updatedProduct = this.mapDatabaseRowToProduct(result.rows[0]);

        return {
          success: true,
          product: updatedProduct,
          message: 'Product updated successfully'
        };
      },
      {
        success: false,
        message: 'Product update service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get a single product by ID
   */
  async getProduct(productId: string, tenantId: string): Promise<{ success: boolean; product?: Product; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        // Try cache first
        const cacheKey = `product:${tenantId}:${productId}`;
        const cachedProduct = await redis.get<any>(cacheKey);

        if (cachedProduct) {
          return {
            success: true,
            product: this.mapDatabaseRowToProduct(cachedProduct),
            message: 'Product retrieved from cache'
          };
        }

        // Fetch from database
        const result = await execute_sql(
          `SELECT p.*, c.category_name, s.supplier_name 
           FROM inventory_products p 
           LEFT JOIN product_categories c ON p.category_id = c.id 
           LEFT JOIN suppliers s ON p.supplier_id = s.id 
           WHERE p.id = $1 AND p.tenant_id = $2`,
          [productId, tenantId]
        );

        if (result.rows.length === 0) {
          return {
            success: false,
            message: 'Product not found',
            error: 'Product does not exist or access denied'
          };
        }

        // Cache the result
        await redis.set(cacheKey, JSON.stringify(result.rows[0]), { ex: 300 });

        const product = this.mapDatabaseRowToProduct(result.rows[0]);

        return {
          success: true,
          product,
          message: 'Product retrieved successfully'
        };
      },
      {
        success: false,
        message: 'Product retrieval service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Search products with advanced filtering
   */
  async searchProducts(input: unknown, tenantId: string): Promise<{ success: boolean; products?: Product[]; pagination?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          query = '',
          categoryId,
          supplierId,
          brand,
          priceRange,
          isActive,
          limit = 20,
          offset = 0
        } = input as any;

        // Build dynamic WHERE clause
        const whereConditions = ['p.tenant_id = $1'];
        const queryParams = [tenantId];
        let paramCounter = 2;

        if (query && query.trim()) {
          whereConditions.push(`(
            p.product_name ILIKE $${paramCounter} OR 
            p.product_code ILIKE $${paramCounter} OR 
            p.sku ILIKE $${paramCounter} OR 
            p.barcode ILIKE $${paramCounter}
          )`);
          queryParams.push(`%${query.trim()}%`);
          paramCounter++;
        }

        if (categoryId) {
          whereConditions.push(`p.category_id = $${paramCounter}`);
          queryParams.push(categoryId);
          paramCounter++;
        }

        if (supplierId) {
          whereConditions.push(`p.supplier_id = $${paramCounter}`);
          queryParams.push(supplierId);
          paramCounter++;
        }

        if (brand) {
          whereConditions.push(`p.brand ILIKE $${paramCounter}`);
          queryParams.push(`%${brand}%`);
          paramCounter++;
        }

        if (priceRange) {
          if (priceRange.min !== undefined) {
            whereConditions.push(`p.selling_price >= $${paramCounter}`);
            queryParams.push(priceRange.min);
            paramCounter++;
          }
          if (priceRange.max !== undefined) {
            whereConditions.push(`p.selling_price <= $${paramCounter}`);
            queryParams.push(priceRange.max);
            paramCounter++;
          }
        }

        if (isActive !== undefined) {
          whereConditions.push(`p.is_active = $${paramCounter}`);
          queryParams.push(isActive);
          paramCounter++;
        }

        // Count query
        const countQuery = `
          SELECT COUNT(*) as total
          FROM inventory_products p
          WHERE ${whereConditions.join(' AND ')}
        `;

        const countResult = await execute_sql(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query with pagination
        const dataQuery = `
          SELECT p.*, c.category_name, s.supplier_name 
          FROM inventory_products p 
          LEFT JOIN product_categories c ON p.category_id = c.id 
          LEFT JOIN suppliers s ON p.supplier_id = s.id 
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY p.updated_at DESC, p.product_name ASC
          LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        queryParams.push(limit, offset);

        const dataResult = await execute_sql(dataQuery, queryParams);

        const products = dataResult.rows.map((row: any) => this.mapDatabaseRowToProduct(row));

        return {
          success: true,
          products,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          },
          message: `Found ${products.length} products`
        };
      },
      {
        success: false as const,
        products: [] as Product[],
        pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
        message: 'Product search service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  // ========================================
  // CATEGORY MANAGEMENT OPERATIONS
  // ========================================

  /**
   * Create a new product category
   */
  async createCategory(input: unknown, tenantId: string): Promise<{ success: boolean; category?: Category; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = createCategorySchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const categoryData = validationResult.data;

        // Check uniqueness
        const existingCategory = await execute_sql(
          'SELECT id FROM product_categories WHERE tenant_id = $1 AND (category_code = $2 OR category_name = $3)',
          [tenantId, categoryData.categoryCode, categoryData.categoryName]
        );

        if (existingCategory.rows.length > 0) {
          return {
            success: false,
            message: 'Category already exists',
            error: 'Category code or name already exists'
          };
        }

        // Validate parent category if provided
        if (categoryData.parentCategoryId) {
          const parentExists = await execute_sql(
            'SELECT id FROM product_categories WHERE id = $1 AND tenant_id = $2',
            [categoryData.parentCategoryId, tenantId]
          );

          if (parentExists.rows.length === 0) {
            return {
              success: false,
              message: 'Invalid parent category',
              error: 'Parent category does not exist'
            };
          }
        }

        const categoryId = crypto.randomUUID();
        const now = new Date().toISOString();

        const result = await execute_sql(
          `INSERT INTO product_categories (
            id, tenant_id, category_code, category_name, parent_category_id,
            description, tax_rate, is_active, sort_order, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
          ) RETURNING *`,
          [
            categoryId, tenantId, categoryData.categoryCode, categoryData.categoryName,
            categoryData.parentCategoryId, categoryData.description, categoryData.taxRate,
            categoryData.isActive, 0, now, now
          ]
        );

        const category = this.mapDatabaseRowToCategory(result.rows[0]);

        return {
          success: true,
          category,
          message: 'Category created successfully'
        };
      },
      {
        success: false,
        message: 'Category creation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get category hierarchy for tenant
   */
  async getCategoryHierarchy(tenantId: string): Promise<{ success: boolean; categories?: Category[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        // Try cache first
        const cacheKey = `categories:${tenantId}`;
        const cachedCategories = await redis.get<any[]>(cacheKey);

        if (cachedCategories && cachedCategories.length > 0) {
          return {
            success: true,
            categories: cachedCategories.map(row => this.mapDatabaseRowToCategory(row)),
            message: 'Categories retrieved from cache'
          };
        }

        const result = await execute_sql(
          `SELECT * FROM product_categories 
           WHERE tenant_id = $1 AND is_active = true 
           ORDER BY sort_order ASC, category_name ASC`,
          [tenantId]
        );

        // Cache the result
        await redis.set(cacheKey, JSON.stringify(result.rows), { ex: 600 }); // Cache for 10 minutes

        const categories = result.rows.map((row: any) => this.mapDatabaseRowToCategory(row));

        return {
          success: true,
          categories,
          message: `Found ${categories.length} categories`
        };
      },
      {
        success: false as const,
        categories: [] as Category[],
        message: 'Category hierarchy service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  // ========================================
  // VARIANT MANAGEMENT OPERATIONS
  // ========================================

  /**
   * Create a product variant
   */
  async createVariant(input: unknown, tenantId: string): Promise<{ success: boolean; variant?: ProductVariant; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = createVariantSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const variantData = validationResult.data;

        // Verify product exists and belongs to tenant
        const productCheck = await execute_sql(
          'SELECT id FROM inventory_products WHERE id = $1 AND tenant_id = $2',
          [variantData.productId, tenantId]
        );

        if (productCheck.rows.length === 0) {
          return {
            success: false,
            message: 'Product not found',
            error: 'Product does not exist or access denied'
          };
        }

        // Check variant uniqueness
        const uniqueChecks = await Promise.all([
          this.checkUniqueVariantCode(tenantId, variantData.variantCode),
          variantData.sku ? this.checkUniqueVariantSKU(tenantId, variantData.sku) : Promise.resolve(true),
          variantData.barcode ? this.checkUniqueVariantBarcode(tenantId, variantData.barcode) : Promise.resolve(true)
        ]);

        if (!uniqueChecks.every(check => check)) {
          return {
            success: false,
            message: 'Validation failed',
            error: 'Variant code, SKU, or barcode already exists'
          };
        }

        // Check for duplicate variant type/value combination for this product
        const duplicateCheck = await execute_sql(
          'SELECT id FROM product_variants WHERE tenant_id = $1 AND product_id = $2 AND variant_type = $3 AND variant_value = $4',
          [tenantId, variantData.productId, variantData.variantType, variantData.variantValue]
        );

        if (duplicateCheck.rows.length > 0) {
          return {
            success: false,
            message: 'Variant already exists',
            error: `${variantData.variantType} variant with value '${variantData.variantValue}' already exists for this product`
          };
        }

        const variantId = crypto.randomUUID();
        const now = new Date().toISOString();

        const result = await execute_sql(
          `INSERT INTO product_variants (
            id, tenant_id, product_id, variant_code, variant_name,
            sku, barcode, variant_type, variant_value, cost_price, selling_price,
            weight, dimensions, image_url, is_default, is_active, sort_order,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          ) RETURNING *`,
          [
            variantId, tenantId, variantData.productId, variantData.variantCode,
            variantData.variantName, variantData.sku, variantData.barcode,
            variantData.variantType, variantData.variantValue, variantData.costPrice,
            variantData.sellingPrice, variantData.weight, variantData.dimensions,
            variantData.imageUrl, variantData.isDefault, variantData.isActive,
            variantData.sortOrder, now, now
          ]
        );

        const variant = this.mapDatabaseRowToVariant(result.rows[0]);

        return {
          success: true,
          variant,
          message: 'Variant created successfully'
        };
      },
      {
        success: false,
        message: 'Variant creation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Get all variants for a product
   */
  async getProductVariants(productId: string, tenantId: string): Promise<{ success: boolean; variants?: ProductVariant[]; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const result = await execute_sql(
          `SELECT * FROM product_variants 
           WHERE product_id = $1 AND tenant_id = $2 AND is_active = true 
           ORDER BY sort_order ASC, variant_name ASC`,
          [productId, tenantId]
        );

        const variants = result.rows.map((row: any) => this.mapDatabaseRowToVariant(row));

        return {
          success: true,
          variants,
          message: `Found ${variants.length} variants`
        };
      },
      {
        success: false as const,
        variants: [] as ProductVariant[],
        message: 'Variant retrieval service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  // ========================================
  // NIGERIAN MARKET OPERATIONS
  // ========================================

  /**
   * Convert currency using Nigerian market rates
   */
  async convertCurrency(input: unknown): Promise<{ success: boolean; originalAmount: number; convertedAmount: number; exchangeRate: number; fromCurrency: string; toCurrency: string; conversionDate: string; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { amount, fromCurrency, toCurrency } = input as { amount: number; fromCurrency: string; toCurrency: string };

        if (amount < 0) {
          return {
            success: false,
            originalAmount: amount,
            convertedAmount: 0,
            exchangeRate: 0,
            fromCurrency,
            toCurrency,
            conversionDate: new Date().toISOString(),
            message: 'Invalid amount',
            error: 'Amount must be non-negative'
          };
        }

        if (fromCurrency === toCurrency) {
          return {
            success: true,
            originalAmount: amount,
            convertedAmount: amount,
            exchangeRate: 1,
            fromCurrency,
            toCurrency,
            conversionDate: new Date().toISOString(),
            message: 'No conversion needed'
          };
        }

        const rateKey = `${fromCurrency}-${toCurrency}` as keyof typeof EXCHANGE_RATES;
        const exchangeRate = EXCHANGE_RATES[rateKey];

        if (!exchangeRate) {
          return {
            success: false,
            originalAmount: amount,
            convertedAmount: 0,
            exchangeRate: 0,
            fromCurrency,
            toCurrency,
            conversionDate: new Date().toISOString(),
            message: 'Currency conversion not supported',
            error: `No exchange rate available for ${fromCurrency} to ${toCurrency}`
          };
        }

        const convertedAmount = Math.round((amount * exchangeRate) * 100) / 100; // Round to 2 decimal places

        return {
          success: true,
          originalAmount: amount,
          convertedAmount,
          exchangeRate,
          fromCurrency,
          toCurrency,
          conversionDate: new Date().toISOString(),
          message: 'Currency converted successfully'
        };
      },
      {
        success: false,
        originalAmount: 0,
        convertedAmount: 0,
        exchangeRate: 0,
        fromCurrency: '',
        toCurrency: '',
        conversionDate: new Date().toISOString(),
        message: 'Currency conversion service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Calculate VAT according to Nigerian tax regulations
   */
  async calculateVAT(input: unknown, tenantId: string): Promise<{ success: boolean; subtotal: number; vatAmount: number; vatRate: number; total: number; breakdown: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { productId, amount, region = 'Nigeria' } = input as { productId?: string; amount: number; region?: string };

        if (amount < 0) {
          return {
            success: false,
            subtotal: 0,
            vatAmount: 0,
            vatRate: 0,
            total: 0,
            breakdown: {},
            message: 'Invalid amount',
            error: 'Amount must be non-negative'
          };
        }

        let vatRate = NIGERIAN_VAT_RATES.default; // Default 7.5%

        // If productId provided, get category-specific VAT rate
        if (productId) {
          const productResult = await execute_sql(
            `SELECT p.is_taxable, c.category_code, c.tax_rate 
             FROM inventory_products p 
             LEFT JOIN product_categories c ON p.category_id = c.id 
             WHERE p.id = $1 AND p.tenant_id = $2`,
            [productId, tenantId]
          );

          if (productResult.rows.length > 0) {
            const product = productResult.rows[0];
            
            if (!product.is_taxable) {
              vatRate = 0; // Product is not taxable
            } else if (product.category_code) {
              // Use category-specific VAT rate
              const categoryVatRate = NIGERIAN_VAT_RATES[product.category_code.toLowerCase() as keyof typeof NIGERIAN_VAT_RATES];
              if (categoryVatRate !== undefined) {
                vatRate = categoryVatRate;
              } else if (product.tax_rate) {
                vatRate = product.tax_rate;
              }
            }
          }
        }

        const subtotal = amount;
        const vatAmount = Math.round((subtotal * vatRate) * 100) / 100;
        const total = Math.round((subtotal + vatAmount) * 100) / 100;

        return {
          success: true,
          subtotal,
          vatAmount,
          vatRate,
          total,
          breakdown: {
            standardVAT: vatAmount,
            exemptions: vatRate === 0 ? subtotal : 0,
            additionalTaxes: 0
          },
          message: 'VAT calculated successfully'
        };
      },
      {
        success: false,
        subtotal: 0,
        vatAmount: 0,
        vatRate: 0,
        total: 0,
        breakdown: {},
        message: 'VAT calculation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Generate SKU using Nigerian business patterns
   */
  async generateSKU(tenantId: string, categoryId?: string, productName?: string): Promise<string> {
    try {
      let prefix = 'PRD';

      if (categoryId) {
        const categoryResult = await execute_sql(
          'SELECT category_code FROM product_categories WHERE id = $1 AND tenant_id = $2',
          [categoryId, tenantId]
        );

        if (categoryResult.rows.length > 0) {
          prefix = categoryResult.rows[0].category_code.toUpperCase().substring(0, 3);
        }
      }

      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substring(2, 5).toUpperCase();

      let productCode = '';
      if (productName) {
        productCode = productName
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 3)
          .toUpperCase();
      }

      return `${prefix}${productCode}${timestamp}${random}`;
    } catch (error) {
      console.error('[ProductCatalog] Error generating SKU:', error);
      return `PRD${Date.now()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    }
  },

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * Check if product code is unique within tenant
   */
  async checkUniqueProductCode(tenantId: string, productCode: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM inventory_products WHERE tenant_id = $1 AND product_code = $2 LIMIT 1',
        [tenantId, productCode]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('[ProductCatalog] Error checking product code uniqueness:', error);
      return false;
    }
  },

  /**
   * Check if SKU is unique within tenant
   */
  async checkUniqueSKU(tenantId: string, sku: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM inventory_products WHERE tenant_id = $1 AND sku = $2 LIMIT 1',
        [tenantId, sku]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('[ProductCatalog] Error checking SKU uniqueness:', error);
      return false;
    }
  },

  /**
   * Check if barcode is unique within tenant
   */
  async checkUniqueBarcode(tenantId: string, barcode: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM inventory_products WHERE tenant_id = $1 AND barcode = $2 LIMIT 1',
        [tenantId, barcode]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('[ProductCatalog] Error checking barcode uniqueness:', error);
      return false;
    }
  },

  /**
   * Check if variant code is unique within tenant
   */
  async checkUniqueVariantCode(tenantId: string, variantCode: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM product_variants WHERE tenant_id = $1 AND variant_code = $2 LIMIT 1',
        [tenantId, variantCode]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('[ProductCatalog] Error checking variant code uniqueness:', error);
      return false;
    }
  },

  /**
   * Check if variant SKU is unique within tenant
   */
  async checkUniqueVariantSKU(tenantId: string, sku: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM product_variants WHERE tenant_id = $1 AND sku = $2 LIMIT 1',
        [tenantId, sku]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('[ProductCatalog] Error checking variant SKU uniqueness:', error);
      return false;
    }
  },

  /**
   * Check if variant barcode is unique within tenant
   */
  async checkUniqueVariantBarcode(tenantId: string, barcode: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM product_variants WHERE tenant_id = $1 AND barcode = $2 LIMIT 1',
        [tenantId, barcode]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('[ProductCatalog] Error checking variant barcode uniqueness:', error);
      return false;
    }
  },

  /**
   * Validate category exists
   */
  async validateCategoryExists(tenantId: string, categoryId: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM product_categories WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1',
        [categoryId, tenantId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('[ProductCatalog] Error validating category:', error);
      return false;
    }
  },

  /**
   * Validate supplier exists
   */
  async validateSupplierExists(tenantId: string, supplierId: string): Promise<boolean> {
    try {
      const result = await execute_sql(
        'SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1',
        [supplierId, tenantId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('[ProductCatalog] Error validating supplier:', error);
      return false;
    }
  },

  /**
   * Convert camelCase to snake_case
   */
  camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  },

  /**
   * Map database row to Product object
   */
  mapDatabaseRowToProduct(row: any): Product {
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
    
    return {
      id: row.id,
      tenantId: row.tenant_id,
      productCode: row.product_code,
      productName: row.product_name,
      sku: row.sku,
      barcode: row.barcode,
      categoryId: row.category_id,
      supplierId: row.supplier_id,
      brand: row.brand,
      unitOfMeasure: row.unit_of_measure,
      costPrice: parseFloat(row.cost_price || 0),
      sellingPrice: parseFloat(row.selling_price || 0),
      currency: metadata.originalCurrency || 'NGN',
      bulkPricing: metadata.bulkPricing,
      unitConversions: metadata.unitConversions,
      minStockLevel: row.min_stock_level,
      maxStockLevel: row.max_stock_level,
      reorderPoint: row.reorder_point,
      reorderQuantity: row.reorder_quantity,
      isTaxable: row.is_taxable,
      description: row.description,
      imageUrl: row.image_url,
      weight: row.weight ? parseFloat(row.weight) : undefined,
      dimensions: row.dimensions,
      isActive: row.is_active,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  /**
   * Map database row to Category object
   */
  mapDatabaseRowToCategory(row: any): Category {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      parentCategoryId: row.parent_category_id,
      description: row.description,
      taxRate: parseFloat(row.tax_rate || 0),
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  /**
   * Map database row to ProductVariant object
   */
  mapDatabaseRowToVariant(row: any): ProductVariant {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      productId: row.product_id,
      variantCode: row.variant_code,
      variantName: row.variant_name,
      sku: row.sku,
      barcode: row.barcode,
      variantType: row.variant_type,
      variantValue: row.variant_value,
      costPrice: parseFloat(row.cost_price || 0),
      sellingPrice: row.selling_price ? parseFloat(row.selling_price) : undefined,
      weight: row.weight ? parseFloat(row.weight) : undefined,
      dimensions: row.dimensions,
      imageUrl: row.image_url,
      isDefault: row.is_default,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
};