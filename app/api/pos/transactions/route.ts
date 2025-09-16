import { NextRequest, NextResponse } from 'next/server'
import { POS_TRANSACTIONS_TABLE_SQL, POS_TRANSACTION_ITEMS_TABLE_SQL } from '@/lib/schema'
import { execute_sql } from '@/lib/database'
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context'
import { SecurePOSService } from '@/lib/secure-database-service'
import { getCurrentUser } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from subdomain, never from client input
    const tenantContext = await getTenantContext(request)
    const tenantId = tenantContext.tenantId
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized access to tenant' }, { status: 403 })
    }
    
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status')

    // Ensure tables exist
    await execute_sql(POS_TRANSACTIONS_TABLE_SQL)

    // Use secure POS service for encrypted data retrieval
    const currentUser = await getCurrentUser()
    const securePOSService = new SecurePOSService(tenantId)
    
    const auditContext = {
      userId: currentUser?.id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1',
      userAgent: request.headers.get('user-agent') || 'Unknown'
    }

    const result = await securePOSService.getTransactions(
      tenantId,
      { limit, offset, status },
      auditContext
    )

    return NextResponse.json({
      success: true,
      data: result.rows || [],
      total: result.rows?.length || 0,
      limit,
      offset
    })

  } catch (error) {
    console.error('Failed to fetch transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from subdomain, never from client input
    const tenantContext = await getTenantContext(request)
    const tenantId = tenantContext.tenantId
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized access to tenant' }, { status: 403 })
    }
    
    const body = await request.json()
    const {
      transactionNumber,
      reference,
      items,
      subtotal,
      discounts = [],
      taxes = [],
      fees = [],
      total,
      paymentMethod,
      paymentStatus = 'pending',
      paymentReference,
      customerInfo = {},
      cashier,
      locationId,
      terminalId,
      notes,
      refunds = [],
      refundable = true,
      refundDeadline,
      offlineId,
      syncedFromOffline = false
    } = body

    if (!transactionNumber || !items || !total || !paymentMethod || !cashier) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['transactionNumber', 'items', 'total', 'paymentMethod', 'cashier']
      }, { status: 400 })
    }

    // Ensure tables exist
    await execute_sql(POS_TRANSACTIONS_TABLE_SQL)

    // Check for duplicate transaction numbers
    const duplicateCheck = await execute_sql(
      'SELECT id FROM pos_transactions WHERE tenant_id = $1 AND transaction_number = $2',
      [tenantId, transactionNumber]
    )

    if (duplicateCheck.rows && duplicateCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'Transaction number already exists', conflictId: duplicateCheck.rows[0].id },
        { status: 409 }
      )
    }

    // Use secure POS service for encrypted transaction creation
    const currentUser = await getCurrentUser()
    const securePOSService = new SecurePOSService(tenantId)
    
    const auditContext = {
      userId: currentUser?.id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1',
      userAgent: request.headers.get('user-agent') || 'Unknown'
    }

    const transactionData = {
      tenant_id: tenantId,
      transaction_number: transactionNumber,
      reference,
      items,
      subtotal,
      discounts,
      taxes,
      fees,
      total,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      payment_reference: paymentReference,
      customer_info: customerInfo,
      cashier,
      location_id: locationId,
      terminal_id: terminalId,
      notes,
      refunds,
      refundable,
      refund_deadline: refundDeadline,
      offline_id: offlineId,
      synced_at: syncedFromOffline ? new Date().toISOString() : null
    }

    const result = await securePOSService.createTransaction(transactionData, auditContext)

    const newTransaction = result.rows?.[0]

    if (!newTransaction) {
      throw new Error('Failed to create transaction')
    }

    return NextResponse.json({
      success: true,
      data: newTransaction,
      syncedFromOffline
    }, { status: 201 })

  } catch (error) {
    console.error('Failed to create transaction:', error)
    return NextResponse.json(
      { error: 'Failed to create transaction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // SECURITY: Get tenant context from subdomain, never from client input
    const tenantContext = await getTenantContext(request)
    const tenantId = tenantContext.tenantId
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized access to tenant' }, { status: 403 })
    }
    
    const body = await request.json()
    const { id, updates } = body

    if (!id || !updates) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Build update query
    const allowedFields = [
      'payment_status', 'payment_reference', 'notes', 'refunds', 'refundable'
    ]

    const setClause = []
    const params = [tenantId, id]
    let paramIndex = 3

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClause.push(`${field} = $${paramIndex}`)
        // Handle different field types properly - don't JSON.stringify everything
        if (field === 'refunds') {
          params.push(JSON.stringify(value))
        } else {
          params.push(value)
        }
        paramIndex++
      }
    }

    if (setClause.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updateQuery = `
      UPDATE pos_transactions 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `

    const result = await execute_sql(updateQuery, params)

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })

  } catch (error) {
    console.error('Failed to update transaction:', error)
    return NextResponse.json(
      { error: 'Failed to update transaction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}