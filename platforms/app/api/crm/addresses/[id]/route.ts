import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Address update schema (all fields optional)
const addressUpdateSchema = z.object({
  // Address Classification
  address_type: z.enum(['billing', 'shipping', 'office', 'warehouse', 'home', 'mailing', 'other']).optional(),
  address_label: z.string().max(100).optional(),
  
  // Company/Organization Info
  company_name: z.string().max(200).optional(),
  attention_to: z.string().max(200).optional(),
  
  // Address Components
  address_line_1: z.string().min(1).max(255).optional(),
  address_line_2: z.string().max(255).optional(),
  address_line_3: z.string().max(255).optional(),
  city: z.string().min(1).max(100).optional(),
  state_province: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().min(2).max(100).optional(),
  
  // Contact Information
  phone: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  
  // Address Hierarchy & Preferences
  is_primary: z.boolean().optional(),
  is_billing_default: z.boolean().optional(),
  is_shipping_default: z.boolean().optional(),
  
  // Validation & Verification
  is_verified: z.boolean().optional(),
  verification_date: z.string().optional(),
  verification_source: z.enum(['manual', 'api', 'mail', 'visit', 'customer_confirmed']).optional(),
  
  // Geographic Data
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  timezone: z.string().max(50).optional(),
  
  // Business Context
  delivery_instructions: z.string().optional(),
  access_notes: z.string().optional(),
  business_hours: z.string().optional(),
  
  // Status & Metadata
  status: z.enum(['active', 'inactive', 'invalid', 'archived']).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.any()).optional()
});

// GET - Get specific address with detailed information
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const addressId = params.id;
    const { searchParams } = new URL(request.url);
    
    const includeNearbyAddresses = searchParams.get('include_nearby') === 'true';
    const radiusKm = parseFloat(searchParams.get('radius_km') || '10');
    
    // Get address details with customer information
    const addressQuery = `
      SELECT 
        ca.*,
        c.company_name as customer_company_name,
        c.customer_status,
        c.customer_tier,
        c.industry,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM customer_addresses ca
      LEFT JOIN customers c ON c.id = ca.customer_id
      LEFT JOIN users creator ON creator.id = ca.created_by
      WHERE ca.tenant_id = $1 AND ca.id = $2
    `;
    
    const addressResult = await execute_sql(addressQuery, [tenantId, addressId]);
    
    if (addressResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Address not found'
      }, { status: 404 });
    }
    
    const address = addressResult.rows[0];
    
    // Get nearby addresses if requested and current address has coordinates
    let nearbyAddresses = null;
    if (includeNearbyAddresses && address.latitude && address.longitude) {
      const nearbyQuery = `
        SELECT 
          ca.id, ca.address_label, ca.address_type, ca.address_line_1, ca.city,
          ca.state_province, ca.country, ca.latitude, ca.longitude,
          c.company_name as customer_company_name,
          (
            6371 * acos(
              cos(radians($3)) * cos(radians(ca.latitude)) *
              cos(radians(ca.longitude) - radians($4)) +
              sin(radians($3)) * sin(radians(ca.latitude))
            )
          ) AS distance_km
        FROM customer_addresses ca
        LEFT JOIN customers c ON c.id = ca.customer_id
        WHERE ca.tenant_id = $1 
          AND ca.id != $2
          AND ca.latitude IS NOT NULL 
          AND ca.longitude IS NOT NULL
          AND ca.status = 'active'
          AND (
            6371 * acos(
              cos(radians($3)) * cos(radians(ca.latitude)) *
              cos(radians(ca.longitude) - radians($4)) +
              sin(radians($3)) * sin(radians(ca.latitude))
            )
          ) <= $5
        ORDER BY distance_km
        LIMIT 20
      `;
      
      const nearbyResult = await execute_sql(nearbyQuery, [
        tenantId, 
        addressId, 
        address.latitude, 
        address.longitude, 
        radiusKm
      ]);
      nearbyAddresses = nearbyResult.rows;
    }
    
    // Get other addresses for the same customer
    const customerAddressesQuery = `
      SELECT 
        id, address_type, address_label, address_line_1, city, state_province, country,
        is_primary, is_billing_default, is_shipping_default, is_verified, status
      FROM customer_addresses
      WHERE tenant_id = $1 AND customer_id = $2 AND id != $3 AND status = 'active'
      ORDER BY is_primary DESC, is_billing_default DESC, is_shipping_default DESC, address_type
    `;
    
    const customerAddressesResult = await execute_sql(customerAddressesQuery, [
      tenantId, 
      address.customer_id, 
      addressId
    ]);
    
    // Generate address insights
    const insights = {
      address_completeness: calculateAddressCompleteness(address),
      verification_status: getVerificationStatus(address),
      geographic_context: await getGeographicContext(address),
      usage_recommendations: getUsageRecommendations(address),
      data_quality_score: calculateDataQualityScore(address)
    };
    
    return NextResponse.json({
      success: true,
      data: {
        address,
        customer_addresses: customerAddressesResult.rows,
        nearby_addresses: nearbyAddresses,
        insights
      }
    });
    
  } catch (error) {
    console.error('Error fetching address:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch address',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update address
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const addressId = params.id;
    const body = await request.json();
    const validatedData = addressUpdateSchema.parse(body);
    
    // Check if address exists and belongs to tenant
    const existingAddress = await execute_sql(`
      SELECT id, customer_id, address_type, is_primary, is_billing_default, is_shipping_default 
      FROM customer_addresses 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, addressId]);
    
    if (existingAddress.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Address not found'
      }, { status: 404 });
    }
    
    const address = existingAddress.rows[0];
    
    return await withTransaction(async (client) => {
      // Handle default address logic
      if (validatedData.is_primary === true) {
        await client.query(`
          UPDATE customer_addresses 
          SET is_primary = false, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND customer_id = $2 AND is_primary = true AND id != $3
        `, [tenantId, address.customer_id, addressId]);
      }
      
      if (validatedData.is_billing_default === true) {
        await client.query(`
          UPDATE customer_addresses 
          SET is_billing_default = false, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND customer_id = $2 AND is_billing_default = true AND id != $3
        `, [tenantId, address.customer_id, addressId]);
      }
      
      if (validatedData.is_shipping_default === true) {
        await client.query(`
          UPDATE customer_addresses 
          SET is_shipping_default = false, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND customer_id = $2 AND is_shipping_default = true AND id != $3
        `, [tenantId, address.customer_id, addressId]);
      }
      
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [tenantId, addressId];
      let paramCount = 2;
      
      Object.entries(validatedData).forEach(([key, value]) => {
        if (value !== undefined) {
          paramCount++;
          if (key === 'tags') {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(value);
          } else if (key === 'custom_fields') {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(value);
          }
        }
      });
      
      if (updateFields.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No fields to update'
        }, { status: 400 });
      }
      
      // Add updated_by and updated_at
      paramCount++;
      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(body.updated_by || null);
      
      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date().toISOString());
      
      const updateQuery = `
        UPDATE customer_addresses 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      const updatedAddress = result.rows[0];
      
      return NextResponse.json({
        success: true,
        message: 'Address updated successfully',
        data: updatedAddress
      });
    });
    
  } catch (error) {
    console.error('Error updating address:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update address',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete address
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const addressId = params.id;
    
    // Check if address exists
    const existingAddress = await execute_sql(`
      SELECT 
        ca.id, ca.address_label, ca.address_type, ca.is_primary, 
        ca.is_billing_default, ca.is_shipping_default,
        c.company_name as customer_company_name
      FROM customer_addresses ca
      LEFT JOIN customers c ON c.id = ca.customer_id
      WHERE ca.tenant_id = $1 AND ca.id = $2
    `, [tenantId, addressId]);
    
    if (existingAddress.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Address not found'
      }, { status: 404 });
    }
    
    const address = existingAddress.rows[0];
    
    // Check if this is a critical default address
    if (address.is_primary || address.is_billing_default || address.is_shipping_default) {
      return NextResponse.json({
        success: false,
        message: 'Cannot delete default address. Please set another address as default first.',
        details: {
          is_primary: address.is_primary,
          is_billing_default: address.is_billing_default,
          is_shipping_default: address.is_shipping_default
        }
      }, { status: 409 });
    }
    
    // Delete the address
    await execute_sql('DELETE FROM customer_addresses WHERE tenant_id = $1 AND id = $2', [tenantId, addressId]);
    
    return NextResponse.json({
      success: true,
      message: `Address '${address.address_label}' deleted successfully`,
      data: {
        id: addressId,
        address_label: address.address_label,
        address_type: address.address_type,
        customer_company_name: address.customer_company_name
      }
    });
    
  } catch (error) {
    console.error('Error deleting address:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete address',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper functions for address insights
function calculateAddressCompleteness(address: any): number {
  const requiredFields = ['address_line_1', 'city', 'country'];
  const optionalFields = ['address_line_2', 'state_province', 'postal_code', 'phone', 'email'];
  const geographicFields = ['latitude', 'longitude', 'timezone'];
  
  let score = 0;
  let maxScore = 0;
  
  // Required fields (60% weight)
  requiredFields.forEach(field => {
    maxScore += 20;
    if (address[field] && address[field].trim()) {
      score += 20;
    }
  });
  
  // Optional fields (30% weight)
  optionalFields.forEach(field => {
    maxScore += 5;
    if (address[field] && address[field].trim()) {
      score += 5;
    }
  });
  
  // Geographic fields (10% weight)
  geographicFields.forEach(field => {
    maxScore += 3.33;
    if (address[field]) {
      score += 3.33;
    }
  });
  
  return Math.round((score / maxScore) * 100);
}

function getVerificationStatus(address: any): any {
  return {
    is_verified: address.is_verified,
    verification_date: address.verification_date,
    verification_source: address.verification_source,
    verification_age_days: address.verification_date 
      ? Math.floor((new Date().getTime() - new Date(address.verification_date).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    needs_reverification: address.verification_date 
      ? Math.floor((new Date().getTime() - new Date(address.verification_date).getTime()) / (1000 * 60 * 60 * 24)) > 365
      : true
  };
}

async function getGeographicContext(address: any): Promise<any> {
  const context: any = {
    has_coordinates: !!(address.latitude && address.longitude),
    timezone: address.timezone,
    country: address.country,
    region: address.state_province
  };
  
  if (address.latitude && address.longitude) {
    context.coordinates = {
      latitude: address.latitude,
      longitude: address.longitude
    };
    
    // Could add more geographic context like nearby cities, time zone validation, etc.
    context.coordinate_precision = 'exact'; // In real implementation, could analyze coordinate precision
  }
  
  return context;
}

function getUsageRecommendations(address: any): string[] {
  const recommendations: string[] = [];
  
  if (!address.is_verified) {
    recommendations.push('Verify this address to ensure deliveries and communications reach the correct location');
  }
  
  if (address.is_verified && address.verification_date) {
    const daysSinceVerification = Math.floor((new Date().getTime() - new Date(address.verification_date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceVerification > 365) {
      recommendations.push('Consider re-verifying this address as it was last verified over a year ago');
    }
  }
  
  if (!address.latitude || !address.longitude) {
    recommendations.push('Add geographic coordinates for better routing and delivery optimization');
  }
  
  if (!address.timezone) {
    recommendations.push('Add timezone information for better scheduling and communication timing');
  }
  
  if (address.address_type === 'office' && !address.business_hours) {
    recommendations.push('Add business hours for office addresses to optimize visit scheduling');
  }
  
  if (!address.phone && !address.email) {
    recommendations.push('Add contact information for delivery coordination');
  }
  
  return recommendations;
}

function calculateDataQualityScore(address: any): number {
  let score = 0;
  let maxScore = 100;
  
  // Completeness (40 points)
  const completenessScore = calculateAddressCompleteness(address);
  score += (completenessScore / 100) * 40;
  
  // Verification (25 points)
  if (address.is_verified) {
    score += 25;
    
    // Reduce score if verification is old
    if (address.verification_date) {
      const daysSinceVerification = Math.floor((new Date().getTime() - new Date(address.verification_date).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceVerification > 365) {
        score -= 10; // Penalize old verifications
      }
    }
  }
  
  // Geographic precision (20 points)
  if (address.latitude && address.longitude) {
    score += 15;
    if (address.timezone) {
      score += 5;
    }
  }
  
  // Consistency (15 points)
  if (address.status === 'active') {
    score += 15;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}