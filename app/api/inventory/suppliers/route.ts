import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

/**
 * SECURE Suppliers API with tenant isolation
 * All operations are tenant-scoped for security
 */

const supplierSchema = z.object({
  supplierCode: z.string().min(1, 'Supplier code is required').max(50),
  supplierName: z.string().min(1, 'Supplier name is required').max(200),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().optional(),
  taxId: z.string().max(50).optional(),
  paymentTerms: z.string().max(100).optional(),
  creditLimit: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  metadata: z.record(z.any()).default({})
})

const updateSupplierSchema = supplierSchema.partial().extend({
  id: z.string().uuid('Invalid supplier ID format')
})

/**
 * Create a new supplier
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
    const supplierData = supplierSchema.parse(body)
    
    console.log(`🏭 Creating supplier: ${supplierData.supplierName} for tenant ${tenantId}`)
    
    // Validate unique constraints before insertion
    const validationErrors = []
    
    // Check supplier code uniqueness
    const codeCheck = await execute_sql(
      'SELECT id FROM suppliers WHERE tenant_id = $1 AND supplier_code = $2 LIMIT 1',
      [tenantId, supplierData.supplierCode]
    )
    if (codeCheck.rows.length > 0) {
      validationErrors.push({
        field: 'supplierCode',
        message: `Supplier code '${supplierData.supplierCode}' already exists in this tenant`,
        conflictId: codeCheck.rows[0].id
      })
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      console.log(`❌ Supplier creation failed: validation errors for ${supplierData.supplierName}`)
      return NextResponse.json({
        success: false,
        error: 'Validation failed - duplicate values detected',
        validationErrors
      }, { status: 409 })
    }
    
    // Insert the supplier
    const insertQuery = `
      INSERT INTO suppliers (
        tenant_id, supplier_code, supplier_name, contact_person, email, phone,
        address, tax_id, payment_terms, credit_limit, is_active, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING id, created_at, updated_at
    `
    
    const insertValues = [
      tenantId,
      supplierData.supplierCode,
      supplierData.supplierName,
      supplierData.contactPerson || null,
      supplierData.email || null,
      supplierData.phone || null,
      supplierData.address || null,
      supplierData.taxId || null,
      supplierData.paymentTerms || null,
      supplierData.creditLimit,
      supplierData.isActive,
      JSON.stringify(supplierData.metadata)
    ]
    
    const result = await execute_sql(insertQuery, insertValues)
    const newSupplier = result.rows[0]
    
    console.log(`✅ Supplier created successfully: ${supplierData.supplierName} with ID ${newSupplier.id}`)
    
    return NextResponse.json({
      success: true,
      message: 'Supplier created successfully',
      supplier: {
        id: newSupplier.id,
        tenantId,
        ...supplierData,
        createdAt: newSupplier.created_at,
        updatedAt: newSupplier.updated_at
      }
    }, { status: 201 })
    
  } catch (error) {
    console.error('❌ Supplier creation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid supplier data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Supplier creation failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

/**
 * Get suppliers with optional filtering and pagination
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
      whereConditions.push(`(supplier_name ILIKE $${paramIndex} OR supplier_code ILIKE $${paramIndex} OR contact_person ILIKE $${paramIndex})`)
      queryParams.push(`%${search}%`)
      paramIndex++
    }
    
    if (isActive !== null && isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`)
      queryParams.push(isActive === 'true')
      paramIndex++
    }
    
    const query = `
      SELECT s.*, 
             (SELECT COUNT(*) FROM inventory_products WHERE supplier_id = s.id) as product_count
      FROM suppliers s
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY s.supplier_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    queryParams.push(limit, offset)
    
    const result = await execute_sql(query, queryParams)
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM suppliers
      WHERE ${whereConditions.join(' AND ')}
    `
    
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)) // Remove limit and offset
    const total = parseInt(countResult.rows[0].total)
    
    console.log(`🏭 Retrieved ${result.rows.length} suppliers for tenant ${tenantId}`)
    
    return NextResponse.json({
      success: true,
      suppliers: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total
      }
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Failed to retrieve suppliers:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve suppliers',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}