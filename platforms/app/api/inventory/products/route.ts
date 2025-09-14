import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

/**
 * Schema for product creation/update
 */
const productSchema = z.object({
  productCode: z.string().min(1, 'Product code is required').max(100),
  productName: z.string().min(1, 'Product name is required').max(200),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  brand: z.string().max(100).optional(),
  unitOfMeasure: z.string().max(50).default('each'),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0),
  minStockLevel: z.number().int().min(0).default(0),
  maxStockLevel: z.number().int().min(0).default(1000),
  reorderPoint: z.number().int().min(0).default(10),
  reorderQuantity: z.number().int().min(1).default(50),
  trackSerialNumbers: z.boolean().default(false),
  trackLots: z.boolean().default(false),
  description: z.string().optional(),
  imageUrl: z.string().max(500).optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
  isTaxable: z.boolean().default(true),
  metadata: z.record(z.any()).default({})
})

const updateProductSchema = productSchema.partial().extend({
  id: z.string().uuid('Invalid product ID format')
})

/**
 * Create a new product with tenant-scoped uniqueness validation
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain, NOT from body
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access with authentication
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required or access denied'
      }, { status: 401 })
    }
    
    const body = await request.json()
    const productData = productSchema.parse(body)
    
    console.log(`📦 Creating product: ${productData.productName} for tenant ${tenantId}`)
    
    // Validate unique constraints before insertion
    const validationErrors = []
    
    // Check product code uniqueness
    if (productData.productCode) {
      const codeCheck = await execute_sql(
        'SELECT id FROM inventory_products WHERE tenant_id = $1 AND product_code = $2 LIMIT 1',
        [tenantId, productData.productCode]
      )
      if (codeCheck.rows.length > 0) {
        validationErrors.push({
          field: 'productCode',
          message: `Product code '${productData.productCode}' already exists in this tenant`,
          conflictId: codeCheck.rows[0].id
        })
      }
    }
    
    // Check SKU uniqueness
    if (productData.sku) {
      const skuCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND sku = $2 LIMIT 1',
        [tenantId, productData.sku]
      )
      if (skuCheckProduct.rows.length > 0) {
        validationErrors.push({
          field: 'sku',
          message: `SKU '${productData.sku}' already exists in product: ${skuCheckProduct.rows[0].product_name}`,
          conflictId: skuCheckProduct.rows[0].id
        })
      }
      
      const skuCheckVariant = await execute_sql(`
        SELECT v.id, v.variant_name, p.product_name 
        FROM product_variants v 
        JOIN inventory_products p ON v.product_id = p.id 
        WHERE v.tenant_id = $1 AND v.sku = $2 LIMIT 1
      `, [tenantId, productData.sku])
      if (skuCheckVariant.rows.length > 0) {
        const variant = skuCheckVariant.rows[0]
        validationErrors.push({
          field: 'sku',
          message: `SKU '${productData.sku}' already exists in variant: ${variant.product_name} - ${variant.variant_name}`,
          conflictId: variant.id
        })
      }
    }
    
    // Check barcode uniqueness
    if (productData.barcode) {
      const barcodeCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND barcode = $2 LIMIT 1',
        [tenantId, productData.barcode]
      )
      if (barcodeCheckProduct.rows.length > 0) {
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${productData.barcode}' already exists in product: ${barcodeCheckProduct.rows[0].product_name}`,
          conflictId: barcodeCheckProduct.rows[0].id
        })
      }
      
      const barcodeCheckVariant = await execute_sql(`
        SELECT v.id, v.variant_name, p.product_name 
        FROM product_variants v 
        JOIN inventory_products p ON v.product_id = p.id 
        WHERE v.tenant_id = $1 AND v.barcode = $2 LIMIT 1
      `, [tenantId, productData.barcode])
      if (barcodeCheckVariant.rows.length > 0) {
        const variant = barcodeCheckVariant.rows[0]
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${productData.barcode}' already exists in variant: ${variant.product_name} - ${variant.variant_name}`,
          conflictId: variant.id
        })
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Product creation failed: validation errors for ${productData.productName}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 }) // 409 Conflict
    }
    
    // Insert the product
    const insertQuery = `
      INSERT INTO inventory_products (
        tenant_id, product_code, product_name, sku, barcode, category_id, supplier_id,
        brand, unit_of_measure, cost_price, selling_price, min_stock_level, max_stock_level,
        reorder_point, reorder_quantity, track_serial_numbers, track_lots, description,
        image_url, weight, dimensions, is_active, is_taxable, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      ) RETURNING id, created_at, updated_at
    `
    
    const insertValues = [
      tenantId,
      productData.productCode,
      productData.productName,
      productData.sku || null,
      productData.barcode || null,
      productData.categoryId || null,
      productData.supplierId || null,
      productData.brand || null,
      productData.unitOfMeasure,
      productData.costPrice,
      productData.sellingPrice,
      productData.minStockLevel,
      productData.maxStockLevel,
      productData.reorderPoint,
      productData.reorderQuantity,
      productData.trackSerialNumbers,
      productData.trackLots,
      productData.description || null,
      productData.imageUrl || null,
      productData.weight || null,
      productData.dimensions || null,
      productData.isActive,
      productData.isTaxable,
      JSON.stringify(productData.metadata)
    ]
    
    const result = await execute_sql(insertQuery, insertValues)
    const newProduct = result.rows[0]
    
    console.log(`✅ Product created successfully: ${productData.productName} with ID ${newProduct.id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Product created successfully',
      product: {
        id: newProduct.id,
        tenantId,
        ...productData,
        createdAt: newProduct.created_at,
        updatedAt: newProduct.updated_at
      }
    }, { status: 201 })
    
  } catch (error) {
    console.error('❌ Product creation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid product data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Product creation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Update an existing product with tenant-scoped validation
 */
export async function PUT(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain, NOT from body
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access with authentication
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required or access denied'
      }, { status: 401 })
    }
    
    const body = await request.json()
    const updateData = updateProductSchema.parse(body)
    const { id, ...updates } = updateData
    
    console.log(`📦 Updating product: ${id} for tenant ${tenantId}`)
    
    // Verify product exists and belongs to tenant
    const existingProduct = await execute_sql(
      'SELECT * FROM inventory_products WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (existingProduct.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found or access denied'
      }, { status: 404 })
    }
    
    // Validate unique constraints for updates
    const validationErrors = []
    
    // Check product code uniqueness (excluding current product)
    if (updates.productCode) {
      const codeCheck = await execute_sql(
        'SELECT id FROM inventory_products WHERE tenant_id = $1 AND product_code = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.productCode, id]
      )
      if (codeCheck.rows.length > 0) {
        validationErrors.push({
          field: 'productCode',
          message: `Product code '${updates.productCode}' already exists in this tenant`,
          conflictId: codeCheck.rows[0].id
        })
      }
    }
    
    // Check SKU uniqueness (excluding current product)
    if (updates.sku) {
      const skuCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND sku = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.sku, id]
      )
      if (skuCheckProduct.rows.length > 0) {
        validationErrors.push({
          field: 'sku',
          message: `SKU '${updates.sku}' already exists in product: ${skuCheckProduct.rows[0].product_name}`,
          conflictId: skuCheckProduct.rows[0].id
        })
      }
      
      const skuCheckVariant = await execute_sql(`
        SELECT v.id, v.variant_name, p.product_name 
        FROM product_variants v 
        JOIN inventory_products p ON v.product_id = p.id 
        WHERE v.tenant_id = $1 AND v.sku = $2 LIMIT 1
      `, [tenantId, updates.sku])
      if (skuCheckVariant.rows.length > 0) {
        const variant = skuCheckVariant.rows[0]
        validationErrors.push({
          field: 'sku',
          message: `SKU '${updates.sku}' already exists in variant: ${variant.product_name} - ${variant.variant_name}`,
          conflictId: variant.id
        })
      }
    }
    
    // Check barcode uniqueness (excluding current product)
    if (updates.barcode) {
      const barcodeCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND barcode = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.barcode, id]
      )
      if (barcodeCheckProduct.rows.length > 0) {
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${updates.barcode}' already exists in product: ${barcodeCheckProduct.rows[0].product_name}`,
          conflictId: barcodeCheckProduct.rows[0].id
        })
      }
      
      const barcodeCheckVariant = await execute_sql(`
        SELECT v.id, v.variant_name, p.product_name 
        FROM product_variants v 
        JOIN inventory_products p ON v.product_id = p.id 
        WHERE v.tenant_id = $1 AND v.barcode = $2 LIMIT 1
      `, [tenantId, updates.barcode])
      if (barcodeCheckVariant.rows.length > 0) {
        const variant = barcodeCheckVariant.rows[0]
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${updates.barcode}' already exists in variant: ${variant.product_name} - ${variant.variant_name}`,
          conflictId: variant.id
        })
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Product update failed: validation errors for ${id}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 }) // 409 Conflict
    }
    
    // Build dynamic update query
    const updateFields = []
    const updateValues: any[] = []
    let paramIndex = 3 // Start after id and tenantId
    
    Object.entries(updates).forEach(([key, value]: [string, any]) => {
      // Convert camelCase to snake_case
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      updateFields.push(`${dbField} = $${paramIndex}`)
      updateValues.push(key === 'metadata' ? JSON.stringify(value) : value)
      paramIndex++
    })
    
    if (updateFields.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid fields to update'
      }, { status: 400 })
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP')
    
    const updateQuery = `
      UPDATE inventory_products 
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `
    
    const result = await execute_sql(updateQuery, [id, tenantId, ...updateValues])
    const updatedProduct = result.rows[0]
    
    console.log(`✅ Product updated successfully: ${id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Product update failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid update data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Product update failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Get products with optional filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain, NOT from query params
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access with authentication
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required or access denied'
      }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')
    const categoryId = searchParams.get('categoryId')
    const isActive = searchParams.get('isActive')
    
    // Build dynamic query
    let whereConditions = ['tenant_id = $1']
    let queryParams: any[] = [tenantId]
    let paramIndex = 2
    
    if (search) {
      whereConditions.push(`(product_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR barcode ILIKE $${paramIndex})`)
      queryParams.push(`%${search}%`)
      paramIndex++
    }
    
    if (categoryId) {
      whereConditions.push(`category_id = $${paramIndex}`)
      queryParams.push(categoryId)
      paramIndex++
    }
    
    if (isActive !== null && isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`)
      queryParams.push(isActive === 'true')
      paramIndex++
    }
    
    const query = `
      SELECT ip.*, 
             pc.category_name,
             s.supplier_name
      FROM inventory_products ip
      LEFT JOIN product_categories pc ON ip.category_id = pc.id
      LEFT JOIN suppliers s ON ip.supplier_id = s.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ip.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    queryParams.push(limit, offset)
    
    const result = await execute_sql(query, queryParams)
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_products
      WHERE ${whereConditions.join(' AND ')}
    `
    
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)) // Remove limit and offset
    const total = parseInt(countResult.rows[0].total)
    
    console.log(`📦 Retrieved ${result.rows.length} products for tenant ${tenantId}`)
    
    return NextResponse.json({
      success: true,
      products: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total
      }
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Failed to retrieve products:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve products',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}