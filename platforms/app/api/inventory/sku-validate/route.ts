import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { z } from 'zod'

/**
 * Validation schema for SKU validation request
 */
const skuValidationSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(100, 'SKU must be 100 characters or less'),
  tenantId: z.string().uuid('Invalid tenant ID format'),
  excludeProductId: z.string().uuid().optional(), // For update operations
  excludeVariantId: z.string().uuid().optional()   // For variant update operations
})

/**
 * Validate SKU uniqueness within tenant scope
 * Checks both inventory_products and product_variants tables
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sku, tenantId, excludeProductId, excludeVariantId } = skuValidationSchema.parse(body)
    
    console.log(`🔍 Validating SKU uniqueness: ${sku} for tenant ${tenantId}`)
    
    // Check if SKU exists in inventory_products table
    const productCheckQuery = `
      SELECT id, product_name, sku 
      FROM inventory_products 
      WHERE tenant_id = $1 AND sku = $2 
      ${excludeProductId ? 'AND id != $3' : ''}
      LIMIT 1
    `
    
    const productParams = excludeProductId 
      ? [tenantId, sku, excludeProductId]
      : [tenantId, sku]
      
    const productResult = await execute_sql(productCheckQuery, productParams)
    
    // Check if SKU exists in product_variants table
    const variantCheckQuery = `
      SELECT v.id, v.variant_name, v.sku, p.product_name
      FROM product_variants v
      JOIN inventory_products p ON v.product_id = p.id
      WHERE v.tenant_id = $1 AND v.sku = $2 
      ${excludeVariantId ? 'AND v.id != $3' : ''}
      LIMIT 1
    `
    
    const variantParams = excludeVariantId 
      ? [tenantId, sku, excludeVariantId]
      : [tenantId, sku]
      
    const variantResult = await execute_sql(variantCheckQuery, variantParams)
    
    const productExists = productResult.rows.length > 0
    const variantExists = variantResult.rows.length > 0
    const isUnique = !productExists && !variantExists
    
    // Build response with conflict details
    const conflicts = []
    
    if (productExists) {
      const product = productResult.rows[0]
      conflicts.push({
        type: 'product',
        id: product.id,
        name: product.product_name,
        sku: product.sku
      })
    }
    
    if (variantExists) {
      const variant = variantResult.rows[0]
      conflicts.push({
        type: 'variant',
        id: variant.id,
        name: `${variant.product_name} - ${variant.variant_name}`,
        sku: variant.sku
      })
    }
    
    const response = {
      sku,
      tenantId,
      isUnique,
      conflicts: conflicts.length > 0 ? conflicts : undefined
    }
    
    if (!isUnique) {
      console.log(`❌ SKU conflict detected: ${sku} already exists in tenant ${tenantId}`)
      return NextResponse.json({
        success: false,
        message: `SKU '${sku}' already exists in this tenant`,
        ...response
      }, { status: 409 }) // 409 Conflict
    }
    
    console.log(`✅ SKU is unique: ${sku} for tenant ${tenantId}`)
    return NextResponse.json({
      success: true,
      message: `SKU '${sku}' is available`,
      ...response
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ SKU validation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'SKU validation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Batch validate multiple SKUs for bulk operations
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const batchSchema = z.object({
      skus: z.array(z.string().min(1).max(100)).min(1).max(100), // Max 100 SKUs per batch
      tenantId: z.string().uuid('Invalid tenant ID format')
    })
    
    const { skus, tenantId } = batchSchema.parse(body)
    
    console.log(`🔍 Batch validating ${skus.length} SKUs for tenant ${tenantId}`)
    
    // Check all SKUs in one query for efficiency
    const checkQuery = `
      SELECT 'product' as source, id, product_name as name, sku 
      FROM inventory_products 
      WHERE tenant_id = $1 AND sku = ANY($2)
      
      UNION ALL
      
      SELECT 'variant' as source, v.id, 
             (p.product_name || ' - ' || v.variant_name) as name, 
             v.sku
      FROM product_variants v
      JOIN inventory_products p ON v.product_id = p.id
      WHERE v.tenant_id = $1 AND v.sku = ANY($2)
    `
    
    const result = await execute_sql(checkQuery, [tenantId, skus])
    
    // Build results map
    const conflicts = new Map()
    result.rows.forEach((row: any) => {
      if (!conflicts.has(row.sku)) {
        conflicts.set(row.sku, [])
      }
      conflicts.get(row.sku).push({
        type: row.source,
        id: row.id,
        name: row.name,
        sku: row.sku
      })
    })
    
    const results = skus.map(sku => ({
      sku,
      isUnique: !conflicts.has(sku),
      conflicts: conflicts.get(sku) || []
    }))
    
    const uniqueCount = results.filter(r => r.isUnique).length
    const conflictCount = results.length - uniqueCount
    
    console.log(`✅ Batch validation complete: ${uniqueCount} unique, ${conflictCount} conflicts`)
    
    return NextResponse.json({
      success: true,
      tenantId,
      summary: {
        total: skus.length,
        unique: uniqueCount,
        conflicts: conflictCount
      },
      results
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Batch SKU validation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Batch SKU validation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}