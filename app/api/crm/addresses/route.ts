import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Address creation/update schema
const addressSchema = z.object({
  customer_id: z.string().uuid(),
  
  // Address Classification
  address_type: z.enum(['billing', 'shipping', 'office', 'warehouse', 'home', 'mailing', 'other']),
  address_label: z.string().max(100), // Custom label like "Main Office", "East Coast Warehouse"
  
  // Company/Organization Info
  company_name: z.string().max(200).optional(),
  attention_to: z.string().max(200).optional(), // "Attn: John Smith"
  
  // Address Components
  address_line_1: z.string().min(1).max(255),
  address_line_2: z.string().max(255).optional(),
  address_line_3: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state_province: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().min(2).max(100), // ISO country code or name
  
  // Contact Information
  phone: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  
  // Address Hierarchy & Preferences
  is_primary: z.boolean().default(false),
  is_billing_default: z.boolean().default(false),
  is_shipping_default: z.boolean().default(false),
  
  // Validation & Verification
  is_verified: z.boolean().default(false),
  verification_date: z.string().optional(), // ISO date string
  verification_source: z.enum(['manual', 'api', 'mail', 'visit', 'customer_confirmed']).optional(),
  
  // Geographic Data
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  timezone: z.string().max(50).optional(), // e.g., "America/New_York"
  
  // Business Context
  delivery_instructions: z.string().optional(),
  access_notes: z.string().optional(),
  business_hours: z.string().optional(),
  
  // Status & Metadata
  status: z.enum(['active', 'inactive', 'invalid', 'archived']).default('active'),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  custom_fields: z.record(z.any()).default({})
});

// Bulk operations schema
const bulkAddressActionSchema = z.object({
  action: z.enum(['update_status', 'verify_addresses', 'assign_tags', 'update_defaults']),
  address_ids: z.array(z.string().uuid()),
  parameters: z.record(z.any())
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'address_type', 'address_label', 'city', 'state_province', 'country',
  'is_primary', 'is_billing_default', 'is_shipping_default', 'is_verified',
  'status', 'created_at', 'updated_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List addresses with advanced filtering
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Sorting with security validation
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = (searchParams.get('sort_order') || 'DESC').toUpperCase();
    
    if (!VALID_SORT_COLUMNS.includes(sortBy)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sort column'
      }, { status: 400 });
    }
    
    if (!VALID_SORT_ORDERS.includes(sortOrder)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sort order'
      }, { status: 400 });
    }
    
    // Advanced Filters
    const search = searchParams.get('search') || '';
    const customerId = searchParams.get('customer_id') || '';
    const addressType = searchParams.get('address_type') || '';
    const country = searchParams.get('country') || '';
    const stateProvince = searchParams.get('state_province') || '';
    const city = searchParams.get('city') || '';
    const status = searchParams.get('status') || '';
    const isPrimary = searchParams.get('is_primary');
    const isBillingDefault = searchParams.get('is_billing_default');
    const isShippingDefault = searchParams.get('is_shipping_default');
    const isVerified = searchParams.get('is_verified');
    const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
    const includeCustomer = searchParams.get('include_customer') === 'true';
    const includeGeolocation = searchParams.get('include_geolocation') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['ca.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    // Text search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        ca.address_label ILIKE $${paramCount} OR 
        ca.company_name ILIKE $${paramCount} OR 
        ca.attention_to ILIKE $${paramCount} OR 
        ca.address_line_1 ILIKE $${paramCount} OR
        ca.address_line_2 ILIKE $${paramCount} OR
        ca.city ILIKE $${paramCount} OR
        ca.state_province ILIKE $${paramCount} OR
        ca.postal_code ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (customerId) {
      paramCount++;
      whereConditions.push(`ca.customer_id = $${paramCount}`);
      queryParams.push(customerId);
    }
    
    if (addressType) {
      paramCount++;
      whereConditions.push(`ca.address_type = $${paramCount}`);
      queryParams.push(addressType);
    }
    
    if (country) {
      paramCount++;
      whereConditions.push(`ca.country ILIKE $${paramCount}`);
      queryParams.push(`%${country}%`);
    }
    
    if (stateProvince) {
      paramCount++;
      whereConditions.push(`ca.state_province ILIKE $${paramCount}`);
      queryParams.push(`%${stateProvince}%`);
    }
    
    if (city) {
      paramCount++;
      whereConditions.push(`ca.city ILIKE $${paramCount}`);
      queryParams.push(`%${city}%`);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`ca.status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (isPrimary !== null) {
      paramCount++;
      whereConditions.push(`ca.is_primary = $${paramCount}`);
      queryParams.push(isPrimary === 'true');
    }
    
    if (isBillingDefault !== null) {
      paramCount++;
      whereConditions.push(`ca.is_billing_default = $${paramCount}`);
      queryParams.push(isBillingDefault === 'true');
    }
    
    if (isShippingDefault !== null) {
      paramCount++;
      whereConditions.push(`ca.is_shipping_default = $${paramCount}`);
      queryParams.push(isShippingDefault === 'true');
    }
    
    if (isVerified !== null) {
      paramCount++;
      whereConditions.push(`ca.is_verified = $${paramCount}`);
      queryParams.push(isVerified === 'true');
    }
    
    if (tags.length > 0) {
      paramCount++;
      whereConditions.push(`ca.tags && $${paramCount}`);
      queryParams.push(tags);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with customer details
    const query = `
      SELECT 
        ca.*,
        c.company_name as customer_company_name,
        c.customer_status,
        c.customer_tier
      FROM customer_addresses ca
      LEFT JOIN customers c ON c.id = ca.customer_id
      ${whereClause}
      ORDER BY ca.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Add distance calculations if geolocation requested and reference point provided
    if (includeGeolocation) {
      const refLat = parseFloat(searchParams.get('ref_latitude') || '0');
      const refLng = parseFloat(searchParams.get('ref_longitude') || '0');
      
      if (refLat !== 0 && refLng !== 0) {
        result.rows.forEach((address: any) => {
          if (address.latitude && address.longitude) {
            address.distance_km = calculateDistance(refLat, refLng, address.latitude, address.longitude);
          }
        });
      }
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_addresses ca
      LEFT JOIN customers c ON c.id = ca.customer_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get address analytics
    const analyticsQuery = `
      SELECT 
        COUNT(*) as total_addresses,
        COUNT(*) FILTER (WHERE address_type = 'billing') as billing_addresses,
        COUNT(*) FILTER (WHERE address_type = 'shipping') as shipping_addresses,
        COUNT(*) FILTER (WHERE address_type = 'office') as office_addresses,
        COUNT(*) FILTER (WHERE is_verified = true) as verified_addresses,
        COUNT(*) FILTER (WHERE status = 'active') as active_addresses,
        COUNT(DISTINCT country) as unique_countries,
        COUNT(DISTINCT state_province) FILTER (WHERE state_province IS NOT NULL) as unique_states,
        COUNT(DISTINCT city) as unique_cities,
        COUNT(DISTINCT customer_id) as customers_with_addresses
      FROM customer_addresses ca
      LEFT JOIN customers c ON c.id = ca.customer_id
      ${whereClause}
    `;
    
    const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
    const analytics = analyticsResult.rows[0];
    
    // Convert string numbers to proper types
    Object.keys(analytics).forEach(key => {
      if (analytics[key] !== null && !isNaN(analytics[key])) {
        analytics[key] = parseFloat(analytics[key]);
      }
    });
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      analytics: analytics,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      filters: {
        search, customerId, addressType, country, stateProvince, city, status,
        isPrimary, isBillingDefault, isShippingDefault, isVerified, tags
      }
    });
    
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch addresses',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create address or bulk operations
export const POST = withStaffPermissions('customers.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (body.action && body.address_ids) {
      return await handleBulkAddressAction(tenantId, body);
    } else {
      return await handleCreateAddress(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error creating address:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create address',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleCreateAddress(tenantId: string, body: any) {
  const validatedData = addressSchema.parse(body);
  
  // Validate customer exists and belongs to tenant
  const customerCheck = await execute_sql(`
    SELECT id, company_name FROM customers 
    WHERE tenant_id = $1 AND id = $2
  `, [tenantId, validatedData.customer_id]);
  
  if (customerCheck.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Customer not found'
    }, { status: 400 });
  }
  
  return await withTransaction(async (client) => {
    // Handle default address logic
    if (validatedData.is_primary) {
      await client.query(`
        UPDATE customer_addresses 
        SET is_primary = false, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND customer_id = $2 AND is_primary = true
      `, [tenantId, validatedData.customer_id]);
    }
    
    if (validatedData.is_billing_default) {
      await client.query(`
        UPDATE customer_addresses 
        SET is_billing_default = false, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND customer_id = $2 AND is_billing_default = true
      `, [tenantId, validatedData.customer_id]);
    }
    
    if (validatedData.is_shipping_default) {
      await client.query(`
        UPDATE customer_addresses 
        SET is_shipping_default = false, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND customer_id = $2 AND is_shipping_default = true
      `, [tenantId, validatedData.customer_id]);
    }
    
    // Insert address
    const insertQuery = `
      INSERT INTO customer_addresses (
        tenant_id, customer_id, address_type, address_label, company_name, attention_to,
        address_line_1, address_line_2, address_line_3, city, state_province, postal_code,
        country, phone, email, is_primary, is_billing_default, is_shipping_default,
        is_verified, verification_date, verification_source, latitude, longitude, timezone,
        delivery_instructions, access_notes, business_hours, status, notes, tags,
        custom_fields, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
      )
      RETURNING *
    `;
    
    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.customer_id,
      validatedData.address_type,
      validatedData.address_label,
      validatedData.company_name || null,
      validatedData.attention_to || null,
      validatedData.address_line_1,
      validatedData.address_line_2 || null,
      validatedData.address_line_3 || null,
      validatedData.city,
      validatedData.state_province || null,
      validatedData.postal_code || null,
      validatedData.country,
      validatedData.phone || null,
      validatedData.email || null,
      validatedData.is_primary,
      validatedData.is_billing_default,
      validatedData.is_shipping_default,
      validatedData.is_verified,
      validatedData.verification_date || null,
      validatedData.verification_source || null,
      validatedData.latitude || null,
      validatedData.longitude || null,
      validatedData.timezone || null,
      validatedData.delivery_instructions || null,
      validatedData.access_notes || null,
      validatedData.business_hours || null,
      validatedData.status,
      validatedData.notes || null,
      validatedData.tags,
      JSON.stringify(validatedData.custom_fields),
      body.created_by || null
    ]);
    
    const newAddress = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Address created successfully',
      data: newAddress
    }, { status: 201 });
  });
}

async function handleBulkAddressAction(tenantId: string, body: any) {
  const validatedData = bulkAddressActionSchema.parse(body);
  
  return await withTransaction(async (client) => {
    let affectedCount = 0;
    const results: any[] = [];
    
    switch (validatedData.action) {
      case 'update_status':
        const newStatus = validatedData.parameters.status;
        if (!['active', 'inactive', 'invalid', 'archived'].includes(newStatus)) {
          throw new Error('Invalid status value');
        }
        
        const statusResult = await client.query(`
          UPDATE customer_addresses 
          SET status = $3, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, address_label, address_type, city, status
        `, [tenantId, validatedData.address_ids, newStatus]);
        
        affectedCount = statusResult.rowCount;
        results.push(...statusResult.rows);
        break;
        
      case 'verify_addresses':
        const verificationSource = validatedData.parameters.verification_source || 'manual';
        const verificationDate = new Date().toISOString();
        
        const verifyResult = await client.query(`
          UPDATE customer_addresses 
          SET is_verified = true, verification_date = $3, verification_source = $4, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, address_label, address_type, city, is_verified
        `, [tenantId, validatedData.address_ids, verificationDate, verificationSource]);
        
        affectedCount = verifyResult.rowCount;
        results.push(...verifyResult.rows);
        break;
        
      case 'assign_tags':
        const tagsToAdd = validatedData.parameters.tags || [];
        if (!Array.isArray(tagsToAdd)) {
          throw new Error('Tags must be an array');
        }
        
        const assignTagsResult = await client.query(`
          UPDATE customer_addresses 
          SET tags = array(SELECT DISTINCT unnest(tags || $3)), updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, address_label, address_type, city, tags
        `, [tenantId, validatedData.address_ids, tagsToAdd]);
        
        affectedCount = assignTagsResult.rowCount;
        results.push(...assignTagsResult.rows);
        break;
        
      default:
        throw new Error(`Unsupported bulk action: ${validatedData.action}`);
    }
    
    return NextResponse.json({
      success: true,
      message: `Bulk ${validatedData.action} completed successfully`,
      data: {
        action: validatedData.action,
        affected_count: affectedCount,
        results: results
      }
    });
  });
}

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}