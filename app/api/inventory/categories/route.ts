import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

/**
 * SECURE Product Categories API with tenant isolation
 * All operations are tenant-scoped for security
 */

const categorySchema = z.object({
  categoryCode: z.string().min(1, 'Category code is required').max(50),
  categoryName: z.string().min(1, 'Category name is required').max(200),
  parentCategoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  imageUrl: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  metadata: z.record(z.any()).default({})
})

const updateCategorySchema = categorySchema.partial().extend({
  id: z.string().uuid('Invalid category ID format')
})

/**
 * Create a new product category
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
    const categoryData = categorySchema.parse(body)
    
    console.log(`📂 Creating category: ${categoryData.categoryName} for tenant ${tenantId}`)
    
    // Validate unique constraints before insertion
    const validationErrors = []
    
    // Check category code uniqueness
    const codeCheck = await execute_sql(
      'SELECT id FROM product_categories WHERE tenant_id = $1 AND category_code = $2 LIMIT 1',
      [tenantId, categoryData.categoryCode]
    )
    if (codeCheck.rows.length > 0) {
      validationErrors.push({
        field: 'categoryCode',
        message: `Category code '${categoryData.categoryCode}' already exists in this tenant`,
        conflictId: codeCheck.rows[0].id
      })
    }
    
    // Check category name uniqueness
    const nameCheck = await execute_sql(
      'SELECT id FROM product_categories WHERE tenant_id = $1 AND category_name = $2 LIMIT 1',
      [tenantId, categoryData.categoryName]
    )
    if (nameCheck.rows.length > 0) {
      validationErrors.push({
        field: 'categoryName',
        message: `Category name '${categoryData.categoryName}' already exists in this tenant`,
        conflictId: nameCheck.rows[0].id
      })
    }
    
    // Validate parent category exists and belongs to same tenant
    if (categoryData.parentCategoryId) {
      const parentCheck = await execute_sql(
        'SELECT id FROM product_categories WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenantId, categoryData.parentCategoryId]
      )
      if (parentCheck.rows.length === 0) {
        validationErrors.push({
          field: 'parentCategoryId',
          message: 'Parent category not found or access denied'
        })
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Category creation failed: validation errors for ${categoryData.categoryName}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate or invalid values detected',
        validationErrors
      }, { status: 409 })
    }
    
    // Insert the category
    const insertQuery = `
      INSERT INTO product_categories (
        tenant_id, category_code, category_name, parent_category_id, description,
        image_url, is_active, sort_order, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING id, created_at, updated_at
    `
    
    const insertValues = [
      tenantId,
      categoryData.categoryCode,
      categoryData.categoryName,
      categoryData.parentCategoryId || null,
      categoryData.description || null,
      categoryData.imageUrl || null,
      categoryData.isActive,
      categoryData.sortOrder,
      JSON.stringify(categoryData.metadata)
    ]
    
    const result = await execute_sql(insertQuery, insertValues)
    const newCategory = result.rows[0]
    
    console.log(`✅ Category created successfully: ${categoryData.categoryName} with ID ${newCategory.id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Category created successfully',
      category: {
        id: newCategory.id,
        tenantId,
        ...categoryData,
        createdAt: newCategory.created_at,
        updatedAt: newCategory.updated_at
      }
    }, { status: 201 })
    
  } catch (error) {
    console.error('❌ Category creation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid category data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Category creation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Update an existing category
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
    const updateData = updateCategorySchema.parse(body)
    const { id, ...updates } = updateData
    
    console.log(`📂 Updating category: ${id} for tenant ${tenantId}`)
    
    // Verify category exists and belongs to tenant
    const existingCategory = await execute_sql(
      'SELECT * FROM product_categories WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (existingCategory.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Category not found or access denied'
      }, { status: 404 })
    }
    
    // Validate unique constraints for updates
    const validationErrors = []
    
    // Check category code uniqueness (excluding current category)
    if (updates.categoryCode) {
      const codeCheck = await execute_sql(
        'SELECT id FROM product_categories WHERE tenant_id = $1 AND category_code = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.categoryCode, id]
      )
      if (codeCheck.rows.length > 0) {
        validationErrors.push({
          field: 'categoryCode',
          message: `Category code '${updates.categoryCode}' already exists in this tenant`,
          conflictId: codeCheck.rows[0].id
        })
      }
    }
    
    // Check category name uniqueness (excluding current category)
    if (updates.categoryName) {
      const nameCheck = await execute_sql(
        'SELECT id FROM product_categories WHERE tenant_id = $1 AND category_name = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.categoryName, id]
      )
      if (nameCheck.rows.length > 0) {
        validationErrors.push({
          field: 'categoryName',
          message: `Category name '${updates.categoryName}' already exists in this tenant`,
          conflictId: nameCheck.rows[0].id
        })
      }
    }
    
    // Validate parent category exists and belongs to same tenant (and prevent circular reference)
    if (updates.parentCategoryId) {
      const parentCheck = await execute_sql(
        'SELECT id FROM product_categories WHERE tenant_id = $1 AND id = $2 AND id != $3 LIMIT 1',
        [tenantId, updates.parentCategoryId, id]
      )
      if (parentCheck.rows.length === 0) {
        validationErrors.push({
          field: 'parentCategoryId',
          message: 'Parent category not found, access denied, or circular reference'
        })
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Category update failed: validation errors for ${id}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate or invalid values detected',
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
      UPDATE product_categories 
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `
    
    const result = await execute_sql(updateQuery, [id, tenantId, ...updateValues])
    const updatedCategory = result.rows[0]
    
    console.log(`✅ Category updated successfully: ${id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Category updated successfully',
      category: updatedCategory
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Category update failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid update data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Category update failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Get categories with optional filtering and pagination
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
    const parentId = searchParams.get('parentId')
    const isActive = searchParams.get('isActive')
    const includeHierarchy = searchParams.get('includeHierarchy') === 'true'
    
    // Build dynamic query
    let whereConditions = ['tenant_id = $1']
    let queryParams: any[] = [tenantId]
    let paramIndex = 2
    
    if (search) {
      whereConditions.push(`(category_name ILIKE $${paramIndex} OR category_code ILIKE $${paramIndex})`)
      queryParams.push(`%${search}%`)
      paramIndex++
    }
    
    if (parentId) {
      whereConditions.push(`parent_category_id = $${paramIndex}`)
      queryParams.push(parentId)
      paramIndex++
    }
    
    if (isActive !== null && isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`)
      queryParams.push(isActive === 'true')
      paramIndex++
    }
    
    let query = `
      SELECT c.*, 
             pc.category_name as parent_category_name,
             (SELECT COUNT(*) FROM product_categories WHERE parent_category_id = c.id) as child_count,
             (SELECT COUNT(*) FROM inventory_products WHERE category_id = c.id) as product_count
      FROM product_categories c
      LEFT JOIN product_categories pc ON c.parent_category_id = pc.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY c.sort_order ASC, c.category_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    queryParams.push(limit, offset)
    
    const result = await execute_sql(query, queryParams)
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM product_categories
      WHERE ${whereConditions.join(' AND ')}
    `
    
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)) // Remove limit and offset
    const total = parseInt(countResult.rows[0].total)
    
    console.log(`📂 Retrieved ${result.rows.length} categories for tenant ${tenantId}`)
    
    return NextResponse.json({
      success: true,
      categories: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total
      }
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Failed to retrieve categories:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve categories',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Delete a category (soft delete by setting is_active = false)
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
        error: 'Category ID is required'
      }, { status: 400 })
    }
    
    console.log(`📂 Deleting category: ${id} for tenant ${tenantId}`)
    
    // Check if category exists and belongs to tenant
    const existingCategory = await execute_sql(
      'SELECT * FROM product_categories WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (existingCategory.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Category not found or access denied'
      }, { status: 404 })
    }
    
    // Check if category has child categories
    const childCheck = await execute_sql(
      'SELECT COUNT(*) as count FROM product_categories WHERE parent_category_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (parseInt(childCheck.rows[0].count) > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete category with child categories. Delete or reassign child categories first.'
      }, { status: 400 })
    }
    
    // Check if category has products
    const productCheck = await execute_sql(
      'SELECT COUNT(*) as count FROM inventory_products WHERE category_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    
    if (parseInt(productCheck.rows[0].count) > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete category with associated products. Reassign products to other categories first.'
      }, { status: 400 })
    }
    
    // Soft delete - set is_active = false
    const result = await execute_sql(
      'UPDATE product_categories SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId]
    )
    
    console.log(`✅ Category soft deleted successfully: ${id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
      category: result.rows[0]
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Category deletion failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Category deletion failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}