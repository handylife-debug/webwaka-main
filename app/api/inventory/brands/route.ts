import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

/**
 * SECURE Brands API with tenant isolation
 * All operations are tenant-scoped for security
 */

const brandSchema = z.object({
  brandCode: z.string().min(1, 'Brand code is required').max(50),
  brandName: z.string().min(1, 'Brand name is required').max(200),
  description: z.string().optional(),
  logoUrl: z.string().max(500).optional(),
  website: z.string().max(300).optional(),
  contactEmail: z.string().email().max(255).optional(),
  contactPhone: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.any()).default({})
})

const updateBrandSchema = brandSchema.partial().extend({
  id: z.string().uuid('Invalid brand ID format')
})

/**
 * Create a new brand
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain, NOT from body
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Tenant access denied or inactive'
      }, { status: 403 })
    }
    
    const body = await request.json()
    const brandData = brandSchema.parse(body)
    
    console.log(`🏷️ Creating brand: ${brandData.brandName} for tenant ${tenantId}`)
    
    // Validate unique constraints before insertion
    const validationErrors = []
    
    // Check brand code uniqueness
    const codeCheck = await execute_sql(
      'SELECT id FROM brands WHERE tenant_id = $1 AND brand_code = $2 LIMIT 1',
      [tenantId, brandData.brandCode]
    )
    if (codeCheck.rows.length > 0) {
      validationErrors.push({
        field: 'brandCode',
        message: `Brand code '${brandData.brandCode}' already exists in this tenant`,
        conflictId: codeCheck.rows[0].id
      })
    }
    
    // Check brand name uniqueness
    const nameCheck = await execute_sql(
      'SELECT id FROM brands WHERE tenant_id = $1 AND brand_name = $2 LIMIT 1',
      [tenantId, brandData.brandName]
    )
    if (nameCheck.rows.length > 0) {
      validationErrors.push({
        field: 'brandName',
        message: `Brand name '${brandData.brandName}' already exists in this tenant`,
        conflictId: nameCheck.rows[0].id
      })
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Brand creation failed: validation errors for ${brandData.brandName}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 })
    }
    
    // Insert the brand
    const insertQuery = `
      INSERT INTO brands (
        tenant_id, brand_code, brand_name, description, logo_url, website,
        contact_email, contact_phone, is_active, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING id, created_at, updated_at
    `
    
    const insertValues = [
      tenantId,
      brandData.brandCode,
      brandData.brandName,
      brandData.description || null,
      brandData.logoUrl || null,
      brandData.website || null,
      brandData.contactEmail || null,
      brandData.contactPhone || null,
      brandData.isActive,
      JSON.stringify(brandData.metadata)
    ]
    
    const result = await execute_sql(insertQuery, insertValues)
    const newBrand = result.rows[0]
    
    console.log(`✅ Brand created successfully: ${brandData.brandName} with ID ${newBrand.id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Brand created successfully',
      brand: {
        id: newBrand.id,
        tenantId,
        ...brandData,
        createdAt: newBrand.created_at,
        updatedAt: newBrand.updated_at
      }
    }, { status: 201 })
    
  } catch (error) {
    console.error('❌ Brand creation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid brand data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Brand creation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Update an existing brand
 */
export async function PUT(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain, NOT from body
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Tenant access denied or inactive'
      }, { status: 403 })
    }
    
    const body = await request.json()
    const updateData = updateBrandSchema.parse(body)
    const { id, ...updates } = updateData
    
    console.log(`🏷️ Updating brand: ${id} for tenant ${tenantId}`)
    
    // Verify brand exists and belongs to tenant
    const existingBrand = await execute_sql(
      'SELECT * FROM brands WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (existingBrand.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }
    
    // Validate unique constraints for updates
    const validationErrors = []
    
    // Check brand code uniqueness (excluding current brand)
    if (updates.brandCode) {
      const codeCheck = await execute_sql(
        'SELECT id FROM brands WHERE tenant_id = $1 AND brand_code = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.brandCode, id]
      )
      if (codeCheck.rows.length > 0) {
        validationErrors.push({
          field: 'brandCode',
          message: `Brand code '${updates.brandCode}' already exists in this tenant`,
          conflictId: codeCheck.rows[0].id
        })
      }
    }
    
    // Check brand name uniqueness (excluding current brand)
    if (updates.brandName) {
      const nameCheck = await execute_sql(
        'SELECT id FROM brands WHERE tenant_id = $1 AND brand_name = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.brandName, id]
      )
      if (nameCheck.rows.length > 0) {
        validationErrors.push({
          field: 'brandName',
          message: `Brand name '${updates.brandName}' already exists in this tenant`,
          conflictId: nameCheck.rows[0].id
        })
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Brand update failed: validation errors for ${id}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 })
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
      UPDATE brands 
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `
    
    const result = await execute_sql(updateQuery, [id, tenantId, ...updateValues])
    const updatedBrand = result.rows[0]
    
    console.log(`✅ Brand updated successfully: ${id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Brand updated successfully',
      brand: updatedBrand
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Brand update failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid update data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Brand update failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Get brands with optional filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain, NOT from query params
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Tenant access denied or inactive'
      }, { status: 403 })
    }
    
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')
    
    // Build dynamic query
    let whereConditions = ['tenant_id = $1']
    let queryParams: any[] = [tenantId]
    let paramIndex = 2
    
    if (search) {
      whereConditions.push(`(brand_name ILIKE $${paramIndex} OR brand_code ILIKE $${paramIndex})`)
      queryParams.push(`%${search}%`)
      paramIndex++
    }
    
    if (isActive !== null && isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`)
      queryParams.push(isActive === 'true')
      paramIndex++
    }
    
    const query = `
      SELECT b.*, 
             (SELECT COUNT(*) FROM inventory_products WHERE brand_id = b.id) as product_count
      FROM brands b
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY b.brand_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    queryParams.push(limit, offset)
    
    const result = await execute_sql(query, queryParams)
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM brands
      WHERE ${whereConditions.join(' AND ')}
    `
    
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)) // Remove limit and offset
    const total = parseInt(countResult.rows[0].total)
    
    console.log(`🏷️ Retrieved ${result.rows.length} brands for tenant ${tenantId}`)
    
    return NextResponse.json({
      success: true,
      brands: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total
      }
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Failed to retrieve brands:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve brands',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Delete a brand (soft delete by setting is_active = false)
 */
export async function DELETE(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from request headers/subdomain
    const tenantContext = await getTenantContext(request)
    const { tenantId } = tenantContext
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId)
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Tenant access denied or inactive'
      }, { status: 403 })
    }
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }
    
    console.log(`🏷️ Deleting brand: ${id} for tenant ${tenantId}`)
    
    // Check if brand exists and belongs to tenant
    const existingBrand = await execute_sql(
      'SELECT * FROM brands WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (existingBrand.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }
    
    // Check if brand has associated products
    const productCheck = await execute_sql(
      'SELECT COUNT(*) as count FROM inventory_products WHERE brand_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (parseInt(productCheck.rows[0].count) > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete brand with associated products. Reassign products to other brands first.'
      }, { status: 400 })
    }
    
    // Soft delete - set is_active = false
    const result = await execute_sql(
      'UPDATE brands SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId]
    )
    
    console.log(`✅ Brand soft deleted successfully: ${id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Brand deleted successfully',
      brand: result.rows[0]
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Brand deletion failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Brand deletion failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}