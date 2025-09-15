import { NextRequest, NextResponse } from 'next/server'
import { initOfflineDatabase } from '../../../lib/offline-database'

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting POS Demo Data Creation...')
    
    const db = await initOfflineDatabase()
    const tenantId = '00000000-0000-0000-0000-000000000001'
    
    // Clear existing demo data
    console.log('🧹 Clearing existing demo data...')
    await db.productCategories.find().remove()
    await db.suppliers.find().remove()
    await db.locations.find().remove()
    await db.products.find().remove()
    await db.productVariants.find().remove()
    await db.stockLevels.find().remove()
    await db.customers.find().remove()
    await db.transactions.find().remove()
    await db.drafts.find().remove()
    
    // 1. CREATE CATEGORIES
    console.log('📦 Creating product categories...')
    const categories = [
      { id: 'cat_beverages', code: 'BEV', name: 'Beverages', description: 'Hot and cold drinks', taxRate: 0.08, parentId: null },
      { id: 'cat_hot_beverages', code: 'HOT', name: 'Hot Beverages', description: 'Coffee, tea, hot chocolate', taxRate: 0.08, parentId: 'cat_beverages' },
      { id: 'cat_food', code: 'FOOD', name: 'Food', description: 'Fresh food items', taxRate: 0.0, parentId: null },
      { id: 'cat_pastries', code: 'PAST', name: 'Pastries', description: 'Baked goods and desserts', taxRate: 0.0, parentId: 'cat_food' },
      { id: 'cat_snacks', code: 'SNACK', name: 'Snacks', description: 'Quick bites and appetizers', taxRate: 0.05, parentId: null }
    ]
    
    for (const cat of categories) {
      await db.productCategories.insert({
        id: cat.id,
        tenantId,
        categoryCode: cat.code,
        categoryName: cat.name,
        parentCategoryId: cat.parentId || undefined,
        description: cat.description,
        taxRate: cat.taxRate,
        isActive: true,
        sortOrder: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 2. CREATE PRODUCTS
    console.log('☕ Creating products...')
    const products = [
      {
        id: 'prod_espresso',
        name: 'Espresso',
        sku: 'ESP001',
        barcode: '1234567890123',
        categoryId: 'cat_hot_beverages',
        brandName: 'House Blend',
        costPrice: 0.75,
        sellingPrice: 2.50,
        stock: 100
      },
      {
        id: 'prod_cappuccino',
        name: 'Cappuccino',
        sku: 'CAP001',
        barcode: '1234567890124',
        categoryId: 'cat_hot_beverages',
        brandName: 'House Blend',
        costPrice: 1.25,
        sellingPrice: 4.50,
        stock: 80
      },
      {
        id: 'prod_muffin_blueberry',
        name: 'Blueberry Muffin',
        sku: 'MUF001',
        barcode: '1234567890129',
        categoryId: 'cat_pastries',
        brandName: 'Fresh Daily',
        costPrice: 0.95,
        sellingPrice: 2.75,
        stock: 18
      },
      {
        id: 'prod_chips_bbq',
        name: 'BBQ Potato Chips',
        sku: 'CHI001',
        barcode: '1234567890132',
        categoryId: 'cat_snacks',
        brandName: 'Crispy Crunch',
        costPrice: 0.85,
        sellingPrice: 2.25,
        stock: 48
      }
    ]
    
    for (const product of products) {
      await db.products.insert({
        id: product.id,
        tenantId,
        name: product.name,
        price: product.sellingPrice,
        categoryId: product.categoryId,
        supplierId: undefined,
        brand: product.brandName,
        stock: product.stock,
        image: undefined,
        sku: product.sku,
        barcode: product.barcode,
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 3. CREATE CUSTOMERS
    console.log('👥 Creating customers...')
    const customers = [
      {
        id: 'cust_john_doe',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@email.com',
        phone: '+1-555-1001',
        loyaltyPoints: 450,
        totalSpent: 156.75,
        isVip: false
      },
      {
        id: 'cust_jane_smith',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@email.com',
        phone: '+1-555-1002',
        loyaltyPoints: 1250,
        totalSpent: 425.50,
        isVip: true
      }
    ]
    
    for (const customer of customers) {
      await db.customers.insert({
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName}`,
        phone: customer.phone,
        email: customer.email,
        loyaltyPoints: customer.loyaltyPoints,
        totalSpent: customer.totalSpent,
        tier: customer.isVip ? 'gold' : 'bronze',
        joinDate: '2025-01-01T00:00:00Z',
        lastVisit: undefined,
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    console.log('✅ POS Demo Data Creation Complete!')
    
    return NextResponse.json({
      success: true,
      message: 'Demo data created successfully',
      data: {
        categories: categories.length,
        products: products.length,
        customers: customers.length
      }
    })
    
  } catch (error) {
    console.error('❌ Error creating demo data:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}