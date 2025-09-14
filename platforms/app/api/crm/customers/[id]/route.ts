import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { z } from 'zod'

// Customer update schema (all fields optional)
const customerUpdateSchema = z.object({
  customer_code: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  mobile: z.string().max(20).optional(),
  date_of_birth: z.string().optional(),
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

// GET - Get specific customer details with purchase history
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const customerId = params.id;
    
    // Get customer details
    const customerQuery = `
      SELECT * FROM customers 
      WHERE tenant_id = $1 AND id = $2
    `;
    
    const customerResult = await execute_sql(customerQuery, [tenantId, customerId]);
    
    if (customerResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found'
      }, { status: 404 });
    }
    
    const customer = customerResult.rows[0];
    
    // Get purchase history summary
    const purchaseHistoryQuery = `
      SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(net_amount), 0) as total_spent,
        COALESCE(AVG(net_amount), 0) as average_order_value,
        MAX(purchase_date) as last_purchase_date,
        MIN(purchase_date) as first_purchase_date
      FROM purchase_history 
      WHERE tenant_id = $1 AND customer_id = $2
    `;
    
    const purchaseResult = await execute_sql(purchaseHistoryQuery, [tenantId, customerId]);
    const purchaseSummary = purchaseResult.rows[0];
    
    // Get recent transactions
    const recentTransactionsQuery = `
      SELECT 
        id, transaction_id, purchase_date, total_amount, net_amount,
        payment_method, payment_status, items
      FROM purchase_history 
      WHERE tenant_id = $1 AND customer_id = $2
      ORDER BY purchase_date DESC
      LIMIT 10
    `;
    
    const recentTransactions = await execute_sql(recentTransactionsQuery, [tenantId, customerId]);
    
    // Get communication history
    const communicationQuery = `
      SELECT 
        id, communication_type, direction, subject, sent_at,
        communication_status, campaign_id
      FROM communication_logs 
      WHERE tenant_id = $1 AND customer_id = $2
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const communicationHistory = await execute_sql(communicationQuery, [tenantId, customerId]);
    
    // Get customer segments
    const segmentsQuery = `
      SELECT cs.segment_name, cs.segment_description
      FROM customer_segment_members csm
      JOIN customer_segments cs ON cs.id = csm.segment_id
      WHERE csm.tenant_id = $1 AND csm.customer_id = $2 AND csm.is_active = true
    `;
    
    const segments = await execute_sql(segmentsQuery, [tenantId, customerId]);
    
    return NextResponse.json({
      success: true,
      data: {
        customer,
        purchase_summary: purchaseSummary,
        recent_transactions: recentTransactions.rows,
        communication_history: communicationHistory.rows,
        segments: segments.rows
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer details:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customer details',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PUT - Update customer details
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const customerId = params.id;
    const body = await request.json();
    const validatedData = customerUpdateSchema.parse(body);
    
    // Check if customer exists
    const existingCustomer = await execute_sql(`
      SELECT id FROM customers WHERE tenant_id = $1 AND id = $2
    `, [tenantId, customerId]);
    
    if (existingCustomer.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found'
      }, { status: 404 });
    }
    
    // Check for duplicate customer code or email (excluding current customer)
    if (validatedData.customer_code || validatedData.email) {
      const duplicateCheck = await execute_sql(`
        SELECT id FROM customers 
        WHERE tenant_id = $1 AND id != $2 AND (
          ($3::text IS NOT NULL AND customer_code = $3) OR 
          ($4::text IS NOT NULL AND email = $4)
        )
      `, [tenantId, customerId, validatedData.customer_code || null, validatedData.email || null]);
      
      if (duplicateCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Customer code or email already exists'
        }, { status: 409 });
      }
    }
    
    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [tenantId, customerId];
    let paramCount = 2;
    
    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        if (key === 'tags') {
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
    
    // Add updated_at field
    paramCount++;
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date().toISOString());
    
    const updateQuery = `
      UPDATE customers 
      SET ${updateFields.join(', ')}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
    
    const result = await execute_sql(updateQuery, updateValues);
    
    return NextResponse.json({
      success: true,
      message: 'Customer updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating customer:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE - Delete customer (soft delete by setting status to inactive)
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const customerId = params.id;
    
    // Check if customer exists
    const existingCustomer = await execute_sql(`
      SELECT id, customer_status FROM customers WHERE tenant_id = $1 AND id = $2
    `, [tenantId, customerId]);
    
    if (existingCustomer.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer not found'
      }, { status: 404 });
    }
    
    // Soft delete by setting status to inactive
    const result = await execute_sql(`
      UPDATE customers 
      SET customer_status = 'inactive', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, customer_code, email, first_name, last_name, customer_status
    `, [tenantId, customerId]);
    
    return NextResponse.json({
      success: true,
      message: 'Customer deactivated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}