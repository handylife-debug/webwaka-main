import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { z } from 'zod'

// Valid columns for sorting customers
const VALID_SORT_COLUMNS = [
  'id', 'customer_code', 'email', 'first_name', 'last_name', 'phone', 'mobile',
  'company_name', 'customer_status', 'customer_type', 'preferred_contact_method',
  'total_purchases', 'total_orders', 'last_purchase_date', 'loyalty_points',
  'created_at', 'updated_at'
] as const;

// Valid sort orders
const VALID_SORT_ORDERS = ['ASC', 'DESC'] as const;

// Customer validation schema
const customerSchema = z.object({
  customer_code: z.string().min(1).max(50).optional(),
  email: z.string().email(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  mobile: z.string().max(20).optional(),
  date_of_birth: z.string().optional(), // ISO date string
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  
  // Address information
  billing_address: z.string().optional(),
  billing_city: z.string().max(100).optional(),
  billing_state: z.string().max(100).optional(),
  billing_postal_code: z.string().max(20).optional(),
  billing_country: z.string().max(100).optional(),
  shipping_address: z.string().optional(),
  shipping_city: z.string().max(100).optional(),
  shipping_state: z.string().max(100).optional(),
  shipping_postal_code: z.string().max(20).optional(),
  shipping_country: z.string().max(100).optional(),
  
  // Business information
  company_name: z.string().max(200).optional(),
  tax_id: z.string().max(50).optional(),
  credit_limit: z.number().min(0).optional(),
  payment_terms: z.string().max(50).optional(),
  
  // Customer preferences
  customer_status: z.enum(['active', 'inactive', 'suspended', 'vip']).optional(),
  customer_type: z.enum(['individual', 'business', 'wholesale', 'retail']).optional(),
  preferred_contact_method: z.enum(['email', 'sms', 'phone', 'mail']).optional(),
  marketing_consent: z.boolean().optional(),
  
  // Additional information
  notes: z.string().optional(),
  tags: z.array(z.string()).optional()
});

// GET - List customers with search and filtering
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Search and filters
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const type = searchParams.get('type') || '';
    
    // Validate and sanitize sorting parameters
    const requestedSortBy = searchParams.get('sortBy') || 'created_at';
    const requestedSortOrder = (searchParams.get('sortOrder') || 'DESC').toUpperCase();
    
    const sortBy = VALID_SORT_COLUMNS.includes(requestedSortBy as any) ? requestedSortBy : 'created_at';
    const sortOrder = VALID_SORT_ORDERS.includes(requestedSortOrder as any) ? requestedSortOrder : 'DESC';
    
    // Build WHERE clause
    let whereConditions = ['tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      whereConditions.push(`(
        first_name ILIKE $${paramCount} OR 
        last_name ILIKE $${paramCount} OR 
        email ILIKE $${paramCount} OR 
        customer_code ILIKE $${paramCount} OR
        company_name ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`customer_status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (type) {
      paramCount++;
      whereConditions.push(`customer_type = $${paramCount}`);
      queryParams.push(type);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Execute query
    const query = `
      SELECT 
        id, customer_code, email, first_name, last_name, phone, mobile,
        company_name, customer_status, customer_type, preferred_contact_method,
        total_purchases, total_orders, last_purchase_date, loyalty_points,
        marketing_consent, tags, created_at, updated_at
      FROM customers 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM customers ${whereClause}`;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset params
    const total = parseInt(countResult.rows[0].total);
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customers',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Create new customer
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const validatedData = customerSchema.parse(body);
    
    // Check for duplicate customer code or email
    const duplicateCheck = await execute_sql(`
      SELECT id FROM customers 
      WHERE tenant_id = $1 AND (customer_code = $2 OR email = $3)
    `, [tenantId, validatedData.customer_code, validatedData.email]);
    
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer code or email already exists'
      }, { status: 409 });
    }
    
    // Generate automatic customer code if not provided
    if (!validatedData.customer_code) {
      const codeResult = await execute_sql(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 5) AS INTEGER)), 0) + 1 as next_code
        FROM customers 
        WHERE tenant_id = $1 AND customer_code ~ '^CUST[0-9]+$'
      `, [tenantId]);
      
      validatedData.customer_code = `CUST${String(codeResult.rows[0].next_code).padStart(4, '0')}`;
    }
    
    // Insert new customer
    const insertQuery = `
      INSERT INTO customers (
        tenant_id, customer_code, email, first_name, last_name, phone, mobile,
        date_of_birth, gender, billing_address, billing_city, billing_state,
        billing_postal_code, billing_country, shipping_address, shipping_city,
        shipping_state, shipping_postal_code, shipping_country, company_name,
        tax_id, credit_limit, payment_terms, customer_status, customer_type,
        preferred_contact_method, marketing_consent, notes, tags
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
      ) RETURNING *
    `;
    
    const result = await execute_sql(insertQuery, [
      tenantId,
      validatedData.customer_code,
      validatedData.email,
      validatedData.first_name,
      validatedData.last_name,
      validatedData.phone || null,
      validatedData.mobile || null,
      validatedData.date_of_birth || null,
      validatedData.gender || null,
      validatedData.billing_address || null,
      validatedData.billing_city || null,
      validatedData.billing_state || null,
      validatedData.billing_postal_code || null,
      validatedData.billing_country || null,
      validatedData.shipping_address || null,
      validatedData.shipping_city || null,
      validatedData.shipping_state || null,
      validatedData.shipping_postal_code || null,
      validatedData.shipping_country || null,
      validatedData.company_name || null,
      validatedData.tax_id || null,
      validatedData.credit_limit || 0,
      validatedData.payment_terms || 'cash',
      validatedData.customer_status || 'active',
      validatedData.customer_type || 'individual',
      validatedData.preferred_contact_method || 'email',
      validatedData.marketing_consent || false,
      validatedData.notes || null,
      validatedData.tags ? JSON.stringify(validatedData.tags) : '[]'
    ]);
    
    return NextResponse.json({
      success: true,
      message: 'Customer created successfully',
      data: result.rows[0]
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating customer:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}