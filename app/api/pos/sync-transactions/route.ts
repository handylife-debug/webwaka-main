import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { TransactionDocument } from '../../../../lib/offline-database'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transactions }: { transactions: TransactionDocument[] } = body

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Invalid transactions data' },
        { status: 400 }
      )
    }

    console.log(`Syncing ${transactions.length} transactions to PostgreSQL...`)

    // Create transactions table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS pos_transactions (
        id VARCHAR(100) PRIMARY KEY,
        items JSONB NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        discounts JSONB DEFAULT '[]'::jsonb,
        taxes JSONB DEFAULT '[]'::jsonb,
        fees JSONB DEFAULT '[]'::jsonb,
        total DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payment_status VARCHAR(20) NOT NULL DEFAULT 'completed',
        customer_info JSONB,
        cashier VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        synced_at TIMESTAMP DEFAULT NOW(),
        deleted BOOLEAN DEFAULT FALSE
      );
      
      CREATE INDEX IF NOT EXISTS idx_pos_transactions_status ON pos_transactions(payment_status);
      CREATE INDEX IF NOT EXISTS idx_pos_transactions_created ON pos_transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_pos_transactions_cashier ON pos_transactions(cashier);
    `

    await execute_sql(createTableQuery)

    // Create products table if it doesn't exist
    const createProductsTableQuery = `
      CREATE TABLE IF NOT EXISTS pos_products (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        image VARCHAR(500),
        barcode VARCHAR(100),
        updated_at TIMESTAMP NOT NULL,
        deleted BOOLEAN DEFAULT FALSE
      );
      
      CREATE INDEX IF NOT EXISTS idx_pos_products_category ON pos_products(category);
      CREATE INDEX IF NOT EXISTS idx_pos_products_barcode ON pos_products(barcode);
    `

    await execute_sql(createProductsTableQuery)

    // Insert/update transactions
    const insertedIds = []
    const errors = []

    for (const transaction of transactions) {
      try {
        // Check if transaction already exists
        const existingQuery = 'SELECT id FROM pos_transactions WHERE id = $1'
        const existing = await execute_sql(existingQuery, [transaction.id])

        if (existing.rows.length > 0) {
          // Update existing transaction
          const updateQuery = `
            UPDATE pos_transactions 
            SET 
              items = $2,
              subtotal = $3,
              discounts = $4,
              taxes = $5,
              fees = $6,
              total = $7,
              payment_method = $8,
              payment_status = $9,
              customer_info = $10,
              cashier = $11,
              notes = $12,
              updated_at = $13,
              synced_at = NOW()
            WHERE id = $1
          `
          
          await execute_sql(updateQuery, [
            transaction.id,
            JSON.stringify(transaction.items),
            transaction.subtotal,
            JSON.stringify(transaction.discounts),
            JSON.stringify(transaction.taxes),
            JSON.stringify(transaction.fees),
            transaction.total,
            transaction.paymentMethod,
            transaction.paymentStatus,
            transaction.customerInfo ? JSON.stringify(transaction.customerInfo) : null,
            transaction.cashier,
            transaction.notes || null,
            transaction.updatedAt
          ])
        } else {
          // Insert new transaction
          const insertQuery = `
            INSERT INTO pos_transactions (
              id, items, subtotal, discounts, taxes, fees, total,
              payment_method, payment_status, customer_info, cashier,
              notes, created_at, updated_at, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          `
          
          await execute_sql(insertQuery, [
            transaction.id,
            JSON.stringify(transaction.items),
            transaction.subtotal,
            JSON.stringify(transaction.discounts),
            JSON.stringify(transaction.taxes),
            JSON.stringify(transaction.fees),
            transaction.total,
            transaction.paymentMethod,
            transaction.paymentStatus,
            transaction.customerInfo ? JSON.stringify(transaction.customerInfo) : null,
            transaction.cashier,
            transaction.notes || null,
            transaction.createdAt,
            transaction.updatedAt
          ])
        }

        // Update product stock
        for (const item of transaction.items) {
          if (item.quantity > 0) {
            // Check if product exists
            const productQuery = 'SELECT stock FROM pos_products WHERE id = $1'
            const productResult = await execute_sql(productQuery, [item.productId])
            
            if (productResult.rows.length > 0) {
              // Update stock
              const updateStockQuery = `
                UPDATE pos_products 
                SET stock = stock - $1, updated_at = NOW()
                WHERE id = $2
              `
              await execute_sql(updateStockQuery, [item.quantity, item.productId])
            } else {
              // Insert product if it doesn't exist (from offline data)
              const insertProductQuery = `
                INSERT INTO pos_products (id, name, price, category, stock, updated_at)
                VALUES ($1, $2, $3, 'Unknown', 0, NOW())
                ON CONFLICT (id) DO NOTHING
              `
              await execute_sql(insertProductQuery, [
                item.productId,
                item.name,
                item.price
              ])
            }
          }
        }

        insertedIds.push(transaction.id)
      } catch (error) {
        console.error(`Error syncing transaction ${transaction.id}:`, error)
        errors.push({
          transactionId: transaction.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`Successfully synced ${insertedIds.length} transactions`)

    return NextResponse.json({
      success: true,
      syncedCount: insertedIds.length,
      syncedIds: insertedIds,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error) {
    console.error('Sync API error:', error)
    return NextResponse.json(
      { error: 'Internal server error during sync' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Get sync statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE payment_status = 'completed') as completed_transactions,
        SUM(total) FILTER (WHERE payment_status = 'completed') as total_revenue,
        MAX(synced_at) as last_sync_time
      FROM pos_transactions
      WHERE deleted = FALSE
    `
    
    const result = await execute_sql(statsQuery)
    const stats = result.rows[0]

    return NextResponse.json({
      totalTransactions: parseInt(stats.total_transactions) || 0,
      completedTransactions: parseInt(stats.completed_transactions) || 0,
      totalRevenue: parseFloat(stats.total_revenue) || 0,
      lastSyncTime: stats.last_sync_time
    })

  } catch (error) {
    console.error('Error getting sync stats:', error)
    return NextResponse.json(
      { error: 'Failed to get sync statistics' },
      { status: 500 }
    )
  }
}