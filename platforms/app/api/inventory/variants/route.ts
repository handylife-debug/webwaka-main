import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

/**
 * Schema for product variant creation/update
 */
const variantSchema = z.object({
  productId: z.string().uuid('Invalid product ID format'),
  variantCode: z.string().min(1, 'Variant code is required').max(100),
  variantName: z.string().min(1, 'Variant name is required').max(200),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  variantType: z.enum(['size', 'color', 'style', 'material', 'flavor', 'other']),
  variantValue: z.string().min(1, 'Variant value is required').max(100),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.string().max(100).optional(),
  imageUrl: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  metadata: z.record(z.any()).default({})
})

const updateVariantSchema = variantSchema.partial().extend({
  id: z.string().uuid('Invalid variant ID format')
})

const listVariantsSchema = z.object({
  productId: z.string().uuid('Invalid product ID format').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  variantType: z.enum(['size', 'color', 'style', 'material', 'flavor', 'other']).optional(),
  isActive: z.coerce.boolean().optional()
})

/**
 * Create a new product variant with tenant-scoped uniqueness validation
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
    const variantData = variantSchema.parse(body)
    
    console.log(`📦 Creating variant: ${variantData.variantName} for product ${variantData.productId} in tenant ${tenantId}`)
    
    // Verify product exists and belongs to tenant
    const productCheck = await execute_sql(
      'SELECT id, product_name FROM inventory_products WHERE id = $1 AND tenant_id = $2',
      [variantData.productId, tenantId]
    )
    
    if (productCheck.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found or access denied'
      }, { status: 404 })
    }
    
    // Validate unique constraints before insertion
    const validationErrors = []
    
    // Check variant code uniqueness
    const codeCheck = await execute_sql(
      'SELECT id FROM product_variants WHERE tenant_id = $1 AND variant_code = $2 LIMIT 1',
      [tenantId, variantData.variantCode]
    )
    if (codeCheck.rows.length > 0) {
      validationErrors.push({
        field: 'variantCode',
        message: `Variant code '${variantData.variantCode}' already exists in this tenant`,
        conflictId: codeCheck.rows[0].id
      })
    }
    
    // Check SKU uniqueness (across products and variants)
    if (variantData.sku) {
      const skuCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND sku = $2 LIMIT 1',
        [tenantId, variantData.sku]
      )
      if (skuCheckProduct.rows.length > 0) {
        validationErrors.push({
          field: 'sku',
          message: `SKU '${variantData.sku}' already exists in product: ${skuCheckProduct.rows[0].product_name}`,
          conflictId: skuCheckProduct.rows[0].id
        })
      }
      
      const skuCheckVariant = await execute_sql(`
        SELECT v.id, v.variant_name, p.product_name 
        FROM product_variants v 
        JOIN inventory_products p ON v.product_id = p.id 
        WHERE v.tenant_id = $1 AND v.sku = $2 LIMIT 1
      `, [tenantId, variantData.sku])
      if (skuCheckVariant.rows.length > 0) {
        const variant = skuCheckVariant.rows[0]
        validationErrors.push({
          field: 'sku',
          message: `SKU '${variantData.sku}' already exists in variant: ${variant.product_name} - ${variant.variant_name}`,
          conflictId: variant.id
        })
      }
    }
    
    // Check barcode uniqueness (across products and variants)
    if (variantData.barcode) {
      const barcodeCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND barcode = $2 LIMIT 1',
        [tenantId, variantData.barcode]
      )
      if (barcodeCheckProduct.rows.length > 0) {
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${variantData.barcode}' already exists in product: ${barcodeCheckProduct.rows[0].product_name}`,
          conflictId: barcodeCheckProduct.rows[0].id
        })
      }
      
      const barcodeCheckVariant = await execute_sql(`
        SELECT v.id, v.variant_name, p.product_name 
        FROM product_variants v 
        JOIN inventory_products p ON v.product_id = p.id 
        WHERE v.tenant_id = $1 AND v.barcode = $2 LIMIT 1
      `, [tenantId, variantData.barcode])
      if (barcodeCheckVariant.rows.length > 0) {
        const variant = barcodeCheckVariant.rows[0]
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${variantData.barcode}' already exists in variant: ${variant.product_name} - ${variant.variant_name}`,
          conflictId: variant.id
        })
      }
    }
    
    // Check variant type/value combination uniqueness for this product
    const variantComboCheck = await execute_sql(
      'SELECT id FROM product_variants WHERE tenant_id = $1 AND product_id = $2 AND variant_type = $3 AND variant_value = $4 LIMIT 1',
      [tenantId, variantData.productId, variantData.variantType, variantData.variantValue]
    )
    if (variantComboCheck.rows.length > 0) {
      validationErrors.push({
        field: 'variantValue',
        message: `A ${variantData.variantType} variant with value '${variantData.variantValue}' already exists for this product`,
        conflictId: variantComboCheck.rows[0].id
      })
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Variant creation failed: validation errors for ${variantData.variantName}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 }) // 409 Conflict
    }
    
    // If this variant is set as default, unset other defaults for this product
    if (variantData.isDefault) {
      await execute_sql(
        'UPDATE product_variants SET is_default = false WHERE tenant_id = $1 AND product_id = $2',
        [tenantId, variantData.productId]
      )
    }
    
    // Insert the variant
    const insertQuery = `
      INSERT INTO product_variants (
        tenant_id, product_id, variant_code, variant_name, sku, barcode,
        variant_type, variant_value, cost_price, selling_price, weight,
        dimensions, image_url, is_default, is_active, sort_order, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING id, created_at, updated_at
    `
    
    const insertValues = [
      tenantId,
      variantData.productId,
      variantData.variantCode,
      variantData.variantName,
      variantData.sku || null,
      variantData.barcode || null,
      variantData.variantType,
      variantData.variantValue,
      variantData.costPrice,
      variantData.sellingPrice || null,
      variantData.weight || null,
      variantData.dimensions || null,
      variantData.imageUrl || null,
      variantData.isDefault,
      variantData.isActive,
      variantData.sortOrder,
      JSON.stringify(variantData.metadata)
    ]
    
    const result = await execute_sql(insertQuery, insertValues)
    const newVariant = result.rows[0]
    
    console.log(`✅ Variant created successfully: ${variantData.variantName} with ID ${newVariant.id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Variant created successfully',
      variant: {
        id: newVariant.id,
        tenantId,
        ...variantData,
        createdAt: newVariant.created_at,
        updatedAt: newVariant.updated_at
      }
    }, { status: 201 })
    
  } catch (error) {
    console.error('❌ Variant creation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid variant data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Variant creation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Update an existing product variant with tenant-scoped validation
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
    const updateData = updateVariantSchema.parse(body)
    const { id, ...updates } = updateData
    
    console.log(`📦 Updating variant: ${id} for tenant ${tenantId}`)
    
    // Verify variant exists and belongs to tenant
    const existingVariant = await execute_sql(
      'SELECT * FROM product_variants WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (existingVariant.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Variant not found or access denied'
      }, { status: 404 })
    }
    
    const variant = existingVariant.rows[0]
    
    // Validate unique constraints for updates
    const validationErrors = []
    
    // Check variant code uniqueness (excluding current variant)
    if (updates.variantCode) {
      const codeCheck = await execute_sql(
        'SELECT id FROM product_variants WHERE tenant_id = $1 AND variant_code = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.variantCode, id]
      )
      if (codeCheck.rows.length > 0) {
        validationErrors.push({
          field: 'variantCode',
          message: `Variant code '${updates.variantCode}' already exists in this tenant`,
          conflictId: codeCheck.rows[0].id
        })
      }
    }
    
    // Check SKU uniqueness (excluding current variant)
    if (updates.sku) {
      const skuCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND sku = $2 LIMIT 1',
        [tenantId, updates.sku]
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
        WHERE v.tenant_id = $1 AND v.sku = $2 AND v.id != $3 LIMIT 1
      `, [tenantId, updates.sku, id])
      if (skuCheckVariant.rows.length > 0) {
        const conflictVariant = skuCheckVariant.rows[0]
        validationErrors.push({
          field: 'sku',
          message: `SKU '${updates.sku}' already exists in variant: ${conflictVariant.product_name} - ${conflictVariant.variant_name}`,
          conflictId: conflictVariant.id
        })
      }
    }
    
    // Check barcode uniqueness (excluding current variant)
    if (updates.barcode) {
      const barcodeCheckProduct = await execute_sql(
        'SELECT id, product_name FROM inventory_products WHERE tenant_id = $1 AND barcode = $2 LIMIT 1',
        [tenantId, updates.barcode]
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
        WHERE v.tenant_id = $1 AND v.barcode = $2 AND v.id != $3 LIMIT 1
      `, [tenantId, updates.barcode, id])
      if (barcodeCheckVariant.rows.length > 0) {
        const conflictVariant = barcodeCheckVariant.rows[0]
        validationErrors.push({
          field: 'barcode',
          message: `Barcode '${updates.barcode}' already exists in variant: ${conflictVariant.product_name} - ${conflictVariant.variant_name}`,
          conflictId: conflictVariant.id
        })
      }
    }
    
    // Check variant type/value combination uniqueness (excluding current variant)
    if (updates.variantType && updates.variantValue) {
      const variantComboCheck = await execute_sql(
        'SELECT id FROM product_variants WHERE tenant_id = $1 AND product_id = $2 AND variant_type = $3 AND variant_value = $4 AND id != $5 LIMIT 1',
        [tenantId, variant.product_id, updates.variantType, updates.variantValue, id]
      )
      if (variantComboCheck.rows.length > 0) {
        validationErrors.push({
          field: 'variantValue',
          message: `A ${updates.variantType} variant with value '${updates.variantValue}' already exists for this product`,
          conflictId: variantComboCheck.rows[0].id
        })
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Variant update failed: validation errors for ${id}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 }) // 409 Conflict
    }
    
    // If this variant is being set as default, unset other defaults for this product
    if (updates.isDefault === true) {
      await execute_sql(
        'UPDATE product_variants SET is_default = false WHERE tenant_id = $1 AND product_id = $2 AND id != $3',
        [tenantId, variant.product_id, id]
      )
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
      UPDATE product_variants 
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `
    
    const result = await execute_sql(updateQuery, [id, tenantId, ...updateValues])
    const updatedVariant = result.rows[0]
    
    console.log(`✅ Variant updated successfully: ${id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Variant updated successfully',
      variant: updatedVariant
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Variant update failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid update data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Variant update failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Get variants with optional filtering and pagination
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
    const queryData = listVariantsSchema.parse({
      productId: searchParams.get('productId'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      search: searchParams.get('search'),
      variantType: searchParams.get('variantType'),
      isActive: searchParams.get('isActive')
    })
    
    // Build dynamic query
    let whereConditions = ['v.tenant_id = $1']
    let queryParams: any[] = [tenantId]
    let paramIndex = 2
    
    if (queryData.productId) {
      whereConditions.push(`v.product_id = $${paramIndex}`)
      queryParams.push(queryData.productId)
      paramIndex++
    }
    
    if (queryData.search) {
      whereConditions.push(`(v.variant_name ILIKE $${paramIndex} OR v.sku ILIKE $${paramIndex} OR v.barcode ILIKE $${paramIndex} OR v.variant_value ILIKE $${paramIndex})`)
      queryParams.push(`%${queryData.search}%`)
      paramIndex++
    }
    
    if (queryData.variantType) {
      whereConditions.push(`v.variant_type = $${paramIndex}`)
      queryParams.push(queryData.variantType)
      paramIndex++
    }
    
    if (queryData.isActive !== undefined) {
      whereConditions.push(`v.is_active = $${paramIndex}`)
      queryParams.push(queryData.isActive)
      paramIndex++
    }
    
    const query = `
      SELECT v.*, 
             p.product_name,
             p.product_code
      FROM product_variants v
      JOIN inventory_products p ON v.product_id = p.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY v.is_default DESC, v.sort_order ASC, v.variant_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    queryParams.push(queryData.limit, queryData.offset)
    
    const result = await execute_sql(query, queryParams)
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM product_variants v
      JOIN inventory_products p ON v.product_id = p.id
      WHERE ${whereConditions.join(' AND ')}
    `
    
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)) // Remove limit and offset
    const total = parseInt(countResult.rows[0].total)
    
    console.log(`📦 Retrieved ${result.rows.length} variants for tenant ${tenantId}`)
    
    return NextResponse.json({
      success: true,
      variants: result.rows,
      pagination: {
        total,
        limit: queryData.limit,
        offset: queryData.offset,
        hasMore: queryData.offset + result.rows.length < total
      }
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Failed to retrieve variants:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve variants',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Delete a product variant with cascade checking
 */
export async function DELETE(request: NextRequest) {
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
    
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('id')
    
    if (!variantId) {
      return NextResponse.json({
        success: false,
        error: 'Variant ID is required'
      }, { status: 400 })
    }
    
    // Verify variant exists and belongs to tenant
    const existingVariant = await execute_sql(
      'SELECT id, variant_name, product_id FROM product_variants WHERE id = $1 AND tenant_id = $2',
      [variantId, tenantId]
    )
    
    if (existingVariant.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Variant not found or access denied'
      }, { status: 404 })
    }
    
    const variant = existingVariant.rows[0]
    
    // Check if variant has stock levels
    const stockCheck = await execute_sql(
      'SELECT COUNT(*) as count FROM stock_levels WHERE variant_id = $1',
      [variantId]
    )
    
    if (parseInt(stockCheck.rows[0].count) > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete variant that has stock records. Please remove stock first.'
      }, { status: 409 })
    }
    
    // Check if variant has purchase order items
    const poItemsCheck = await execute_sql(
      'SELECT COUNT(*) as count FROM purchase_order_items WHERE variant_id = $1',
      [variantId]
    )
    
    if (parseInt(poItemsCheck.rows[0].count) > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete variant that has purchase order history.'
      }, { status: 409 })
    }
    
    // Delete the variant
    await execute_sql(
      'DELETE FROM product_variants WHERE id = $1 AND tenant_id = $2',
      [variantId, tenantId]
    )
    
    console.log(`✅ Variant deleted successfully: ${variant.variant_name} (${variantId})`)
    
    return NextResponse.json({
      success: true,
      message: 'Variant deleted successfully'
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Variant deletion failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Variant deletion failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}