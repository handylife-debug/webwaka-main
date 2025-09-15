/**
 * Comprehensive POS Demo Data Creation Script
 * Creates realistic demo data for all user roles and POS functionalities
 */

import { initOfflineDatabase } from '../lib/offline-database'

// Types for demo data
interface DemoProduct {
  id: string
  tenantId: string
  name: string
  description: string
  sku: string
  barcode: string
  categoryId: string
  brandName: string
  costPrice: number
  sellingPrice: number
  compareAtPrice?: number
  profitMargin: number
  stock: number
  lowStockThreshold: number
  isActive: boolean
  isFeatured: boolean
  weight?: number
  dimensions?: string
  imageUrl?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface DemoCustomer {
  id: string
  tenantId: string
  customerCode: string
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth?: string
  address: string
  city: string
  postalCode: string
  loyaltyNumber: string
  loyaltyPoints: number
  totalSpent: number
  purchaseCount: number
  lastPurchaseDate?: string
  customerSince: string
  isVip: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

interface DemoTransaction {
  id: string
  tenantId: string
  transactionNumber: string
  items: Array<{
    productId: string
    name: string
    price: number
    quantity: number
    subtotal: number
  }>
  subtotal: number
  discounts: Array<{
    id: string
    type: string
    name: string
    amount: number
  }>
  taxes: Array<{
    id: string
    name: string
    rate: number
    amount: number
  }>
  fees: Array<{
    id: string
    name: string
    amount: number
  }>
  total: number
  paymentMethod: string
  paymentStatus: 'completed' | 'pending' | 'failed' | 'cancelled'
  customerInfo?: {
    id: string
    name: string
    phone: string
    email: string
  }
  cashier: string
  location: string
  notes?: string
  createdAt: string
  updatedAt: string
  syncedAt: string
}

export async function createPOSDemoData() {
  console.log('🚀 Starting POS Demo Data Creation...')
  
  try {
    const db = await initOfflineDatabase()
    const tenantId = '00000000-0000-0000-0000-000000000001' // Default tenant
    
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
      { id: 'cat_cold_beverages', code: 'COLD', name: 'Cold Beverages', description: 'Iced drinks, juices, sodas', taxRate: 0.08, parentId: 'cat_beverages' },
      { id: 'cat_food', code: 'FOOD', name: 'Food', description: 'Fresh food items', taxRate: 0.0, parentId: null },
      { id: 'cat_pastries', code: 'PAST', name: 'Pastries', description: 'Baked goods and desserts', taxRate: 0.0, parentId: 'cat_food' },
      { id: 'cat_sandwiches', code: 'SAND', name: 'Sandwiches', description: 'Fresh sandwiches and wraps', taxRate: 0.0, parentId: 'cat_food' },
      { id: 'cat_snacks', code: 'SNACK', name: 'Snacks', description: 'Quick bites and appetizers', taxRate: 0.05, parentId: null },
      { id: 'cat_retail', code: 'RET', name: 'Retail Items', description: 'Merchandise and gifts', taxRate: 0.10, parentId: null }
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
    
    // 2. CREATE SUPPLIERS
    console.log('🏭 Creating suppliers...')
    const suppliers = [
      {
        id: 'sup_coffee_roasters',
        code: 'COFFEE001',
        name: 'Premium Coffee Roasters',
        contactPerson: 'John Smith',
        email: 'orders@premiumcoffee.com',
        phone: '+1-555-0101',
        address: '123 Coffee Street',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
        country: 'USA',
        paymentTerms: 'Net 30'
      },
      {
        id: 'sup_bakery_fresh',
        code: 'BAKERY001',
        name: 'Fresh Daily Bakery',
        contactPerson: 'Maria Lopez',
        email: 'supply@freshdaily.com',
        phone: '+1-555-0102',
        address: '456 Bakery Lane',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'USA',
        paymentTerms: 'Net 15'
      },
      {
        id: 'sup_beverage_dist',
        code: 'BEVDIST001',
        name: 'National Beverage Distributors',
        contactPerson: 'Robert Johnson',
        email: 'orders@natbevdist.com',
        phone: '+1-555-0103',
        address: '789 Distribution Blvd',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'USA',
        paymentTerms: 'Net 30'
      }
    ]
    
    for (const supplier of suppliers) {
      await db.suppliers.insert({
        id: supplier.id,
        tenantId,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        contactPerson: supplier.contactPerson,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        city: supplier.city,
        state: supplier.state,
        postalCode: supplier.postalCode,
        country: supplier.country,
        taxId: `TAX${supplier.code}`,
        paymentTerms: supplier.paymentTerms,
        creditLimit: 10000,
        isActive: true,
        notes: `Reliable supplier for ${supplier.name}`,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 3. CREATE LOCATIONS
    console.log('🏪 Creating locations...')
    const locations = [
      {
        id: 'loc_main_store',
        code: 'MAIN001',
        name: 'Main Store - Downtown',
        type: 'store' as const,
        address: '100 Main Street',
        city: 'Anytown',
        state: 'NY',
        postalCode: '10001',
        phone: '+1-555-0200',
        email: 'main@webwaka.com',
        manager: 'Alice Johnson'
      },
      {
        id: 'loc_warehouse',
        code: 'WARE001',
        name: 'Central Warehouse',
        type: 'warehouse' as const,
        address: '500 Industrial Ave',
        city: 'Anytown',
        state: 'NY',
        postalCode: '10002',
        phone: '+1-555-0201',
        email: 'warehouse@webwaka.com',
        manager: 'Bob Wilson'
      },
      {
        id: 'loc_outlet_mall',
        code: 'OUT001',
        name: 'Mall Outlet',
        type: 'outlet' as const,
        address: '200 Shopping Center Dr',
        city: 'Anytown',
        state: 'NY',
        postalCode: '10003',
        phone: '+1-555-0202',
        email: 'outlet@webwaka.com',
        manager: 'Carol Davis'
      }
    ]
    
    for (const location of locations) {
      await db.locations.insert({
        id: location.id,
        tenantId,
        locationCode: location.code,
        locationName: location.name,
        locationType: location.type,
        address: location.address,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        country: 'USA',
        phone: location.phone,
        email: location.email,
        managerName: location.manager,
        isActive: true,
        isDefault: location.id === 'loc_main_store',
        sortOrder: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 4. CREATE PRODUCTS
    console.log('☕ Creating products...')
    const products = [
      // Hot Beverages
      {
        id: 'prod_espresso',
        name: 'Espresso',
        description: 'Rich, bold shot of espresso',
        sku: 'ESP001',
        barcode: '1234567890123',
        categoryId: 'cat_hot_beverages',
        brandName: 'House Blend',
        costPrice: 0.75,
        sellingPrice: 2.50,
        compareAtPrice: 3.00,
        stock: 100,
        lowStockThreshold: 20,
        isActive: true,
        isFeatured: true,
        tags: ['coffee', 'hot', 'popular']
      },
      {
        id: 'prod_cappuccino',
        name: 'Cappuccino',
        description: 'Espresso with steamed milk and foam',
        sku: 'CAP001',
        barcode: '1234567890124',
        categoryId: 'cat_hot_beverages',
        brandName: 'House Blend',
        costPrice: 1.25,
        sellingPrice: 4.50,
        compareAtPrice: 5.00,
        stock: 80,
        lowStockThreshold: 15,
        isActive: true,
        isFeatured: true,
        tags: ['coffee', 'hot', 'milk', 'popular']
      },
      {
        id: 'prod_latte',
        name: 'Caffe Latte',
        description: 'Espresso with steamed milk',
        sku: 'LAT001',
        barcode: '1234567890125',
        categoryId: 'cat_hot_beverages',
        brandName: 'House Blend',
        costPrice: 1.50,
        sellingPrice: 5.25,
        compareAtPrice: 6.00,
        stock: 75,
        lowStockThreshold: 15,
        isActive: true,
        isFeatured: false,
        tags: ['coffee', 'hot', 'milk']
      },
      // Cold Beverages
      {
        id: 'prod_iced_coffee',
        name: 'Iced Coffee',
        description: 'Cold brew coffee over ice',
        sku: 'ICE001',
        barcode: '1234567890126',
        categoryId: 'cat_cold_beverages',
        brandName: 'House Blend',
        costPrice: 1.00,
        sellingPrice: 3.75,
        compareAtPrice: 4.25,
        stock: 60,
        lowStockThreshold: 10,
        isActive: true,
        isFeatured: false,
        tags: ['coffee', 'cold', 'ice']
      },
      {
        id: 'prod_smoothie_berry',
        name: 'Mixed Berry Smoothie',
        description: 'Blend of strawberries, blueberries, and banana',
        sku: 'SMO001',
        barcode: '1234567890127',
        categoryId: 'cat_cold_beverages',
        brandName: 'Fresh Blend',
        costPrice: 2.25,
        sellingPrice: 6.95,
        compareAtPrice: 7.50,
        stock: 35,
        lowStockThreshold: 5,
        isActive: true,
        isFeatured: true,
        tags: ['smoothie', 'healthy', 'fruit', 'cold']
      },
      // Pastries
      {
        id: 'prod_croissant',
        name: 'Butter Croissant',
        description: 'Flaky, buttery French pastry',
        sku: 'CRO001',
        barcode: '1234567890128',
        categoryId: 'cat_pastries',
        brandName: 'Fresh Daily',
        costPrice: 1.20,
        sellingPrice: 3.25,
        compareAtPrice: 3.75,
        stock: 24,
        lowStockThreshold: 5,
        isActive: true,
        isFeatured: false,
        tags: ['pastry', 'french', 'breakfast']
      },
      {
        id: 'prod_muffin_blueberry',
        name: 'Blueberry Muffin',
        description: 'Fresh baked muffin with real blueberries',
        sku: 'MUF001',
        barcode: '1234567890129',
        categoryId: 'cat_pastries',
        brandName: 'Fresh Daily',
        costPrice: 0.95,
        sellingPrice: 2.75,
        compareAtPrice: 3.25,
        stock: 18,
        lowStockThreshold: 3,
        isActive: true,
        isFeatured: true,
        tags: ['muffin', 'blueberry', 'breakfast', 'popular']
      },
      // Sandwiches
      {
        id: 'prod_sandwich_turkey',
        name: 'Turkey Club Sandwich',
        description: 'Sliced turkey with lettuce, tomato, and bacon',
        sku: 'SAN001',
        barcode: '1234567890130',
        categoryId: 'cat_sandwiches',
        brandName: 'Deli Fresh',
        costPrice: 3.50,
        sellingPrice: 8.95,
        compareAtPrice: 9.95,
        stock: 12,
        lowStockThreshold: 2,
        isActive: true,
        isFeatured: false,
        tags: ['sandwich', 'turkey', 'lunch', 'meat']
      },
      {
        id: 'prod_wrap_veggie',
        name: 'Veggie Wrap',
        description: 'Fresh vegetables in a whole wheat tortilla',
        sku: 'WRA001',
        barcode: '1234567890131',
        categoryId: 'cat_sandwiches',
        brandName: 'Healthy Choice',
        costPrice: 2.75,
        sellingPrice: 7.50,
        compareAtPrice: 8.25,
        stock: 15,
        lowStockThreshold: 3,
        isActive: true,
        isFeatured: true,
        tags: ['wrap', 'vegetarian', 'healthy', 'lunch']
      },
      // Snacks
      {
        id: 'prod_chips_bbq',
        name: 'BBQ Potato Chips',
        description: 'Crispy potato chips with BBQ seasoning',
        sku: 'CHI001',
        barcode: '1234567890132',
        categoryId: 'cat_snacks',
        brandName: 'Crispy Crunch',
        costPrice: 0.85,
        sellingPrice: 2.25,
        compareAtPrice: 2.75,
        stock: 48,
        lowStockThreshold: 10,
        isActive: true,
        isFeatured: false,
        tags: ['chips', 'snack', 'bbq', 'salty']
      },
      // Retail Items
      {
        id: 'prod_mug_branded',
        name: 'WebWaka Coffee Mug',
        description: 'Ceramic mug with WebWaka logo',
        sku: 'MUG001',
        barcode: '1234567890133',
        categoryId: 'cat_retail',
        brandName: 'WebWaka',
        costPrice: 4.50,
        sellingPrice: 12.95,
        compareAtPrice: 15.00,
        stock: 25,
        lowStockThreshold: 5,
        isActive: true,
        isFeatured: true,
        tags: ['mug', 'merchandise', 'gift', 'branded']
      }
    ]
    
    for (const product of products) {
      const profitMargin = ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100
      
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
    
    // 5. CREATE PRODUCT VARIANTS
    console.log('🎯 Creating product variants...')
    const variants = [
      // Coffee size variants
      {
        id: 'var_esp_small',
        productId: 'prod_espresso',
        code: 'ESP-S',
        name: 'Small Espresso',
        type: 'size' as const,
        value: 'Small',
        sku: 'ESP001-S',
        barcode: 'ESP001S',
        costPrice: 0.75,
        sellingPrice: 2.50,
        isDefault: true
      },
      {
        id: 'var_esp_double',
        productId: 'prod_espresso',
        code: 'ESP-D',
        name: 'Double Espresso',
        type: 'size' as const,
        value: 'Double',
        sku: 'ESP001-D',
        barcode: 'ESP001D',
        costPrice: 1.25,
        sellingPrice: 3.75,
        isDefault: false
      },
      {
        id: 'var_cap_small',
        productId: 'prod_cappuccino',
        code: 'CAP-S',
        name: 'Small Cappuccino',
        type: 'size' as const,
        value: 'Small',
        sku: 'CAP001-S',
        barcode: 'CAP001S',
        costPrice: 1.25,
        sellingPrice: 4.50,
        isDefault: true
      },
      {
        id: 'var_cap_large',
        productId: 'prod_cappuccino',
        code: 'CAP-L',
        name: 'Large Cappuccino',
        type: 'size' as const,
        value: 'Large',
        sku: 'CAP001-L',
        barcode: 'CAP001L',
        costPrice: 1.75,
        sellingPrice: 6.25,
        isDefault: false
      },
      // Mug color variants
      {
        id: 'var_mug_blue',
        productId: 'prod_mug_branded',
        code: 'MUG-BLU',
        name: 'Blue Coffee Mug',
        type: 'color' as const,
        value: 'Blue',
        sku: 'MUG001-BLU',
        barcode: 'MUG001BLU',
        costPrice: 4.50,
        sellingPrice: 12.95,
        isDefault: true
      },
      {
        id: 'var_mug_red',
        productId: 'prod_mug_branded',
        code: 'MUG-RED',
        name: 'Red Coffee Mug',
        type: 'color' as const,
        value: 'Red',
        sku: 'MUG001-RED',
        barcode: 'MUG001RED',
        costPrice: 4.50,
        sellingPrice: 12.95,
        isDefault: false
      }
    ]
    
    for (const variant of variants) {
      await db.productVariants.insert({
        id: variant.id,
        tenantId,
        productId: variant.productId,
        variantCode: variant.code,
        variantName: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        variantType: variant.type,
        variantValue: variant.value,
        costPrice: variant.costPrice,
        sellingPrice: variant.sellingPrice,
        weight: 0,
        dimensions: '',
        imageUrl: '',
        isDefault: variant.isDefault,
        isActive: true,
        sortOrder: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 6. CREATE STOCK LEVELS
    console.log('📊 Creating stock levels...')
    const allProductIds = products.map(p => p.id)
    const allVariantIds = variants.map(v => v.id)
    const mainLocationId = 'loc_main_store'
    
    // Stock levels for main products
    for (const product of products) {
      await db.stockLevels.insert({
        id: `stock_${product.id}_${mainLocationId}`,
        tenantId,
        productId: product.id,
        variantId: undefined,
        locationId: mainLocationId,
        currentStock: product.stock,
        reservedStock: Math.floor(product.stock * 0.1), // 10% reserved
        availableStock: Math.floor(product.stock * 0.9),
        costPerUnit: product.costPrice,
        lastCountedAt: new Date().toISOString(),
        lastMovementAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // Stock levels for variants
    for (const variant of variants) {
      const baseStock = 25
      await db.stockLevels.insert({
        id: `stock_${variant.id}_${mainLocationId}`,
        tenantId,
        productId: variant.productId,
        variantId: variant.id,
        locationId: mainLocationId,
        currentStock: baseStock,
        reservedStock: 2,
        availableStock: baseStock - 2,
        costPerUnit: variant.costPrice,
        lastCountedAt: new Date().toISOString(),
        lastMovementAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 7. CREATE CUSTOMERS
    console.log('👥 Creating customers...')
    const customers = [
      {
        id: 'cust_john_doe',
        code: 'CUST001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@email.com',
        phone: '+1-555-1001',
        dateOfBirth: '1985-06-15',
        address: '123 Oak Street',
        city: 'Anytown',
        postalCode: '10001',
        loyaltyNumber: 'LOY001',
        loyaltyPoints: 450,
        totalSpent: 156.75,
        purchaseCount: 12,
        lastPurchaseDate: '2025-09-10',
        isVip: false,
        notes: 'Regular customer, prefers oat milk'
      },
      {
        id: 'cust_jane_smith',
        code: 'CUST002',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@email.com',
        phone: '+1-555-1002',
        dateOfBirth: '1990-03-22',
        address: '456 Pine Avenue',
        city: 'Anytown',
        postalCode: '10002',
        loyaltyNumber: 'LOY002',
        loyaltyPoints: 1250,
        totalSpent: 425.50,
        purchaseCount: 28,
        lastPurchaseDate: '2025-09-14',
        isVip: true,
        notes: 'VIP customer, loves our seasonal drinks'
      },
      {
        id: 'cust_mike_wilson',
        code: 'CUST003',
        firstName: 'Mike',
        lastName: 'Wilson',
        email: 'mike.wilson@email.com',
        phone: '+1-555-1003',
        dateOfBirth: '1978-11-08',
        address: '789 Maple Drive',
        city: 'Anytown',
        postalCode: '10003',
        loyaltyNumber: 'LOY003',
        loyaltyPoints: 180,
        totalSpent: 89.25,
        purchaseCount: 7,
        lastPurchaseDate: '2025-09-12',
        isVip: false,
        notes: 'Business customer, usually orders multiple items'
      },
      {
        id: 'cust_sarah_davis',
        code: 'CUST004',
        firstName: 'Sarah',
        lastName: 'Davis',
        email: 'sarah.davis@email.com',
        phone: '+1-555-1004',
        dateOfBirth: '1995-07-30',
        address: '321 Elm Street',
        city: 'Anytown',
        postalCode: '10004',
        loyaltyNumber: 'LOY004',
        loyaltyPoints: 320,
        totalSpent: 198.00,
        purchaseCount: 15,
        lastPurchaseDate: '2025-09-13',
        isVip: false,
        notes: 'Health-conscious, prefers smoothies and wraps'
      },
      {
        id: 'cust_robert_brown',
        code: 'CUST005',
        firstName: 'Robert',
        lastName: 'Brown',
        email: 'robert.brown@email.com',
        phone: '+1-555-1005',
        dateOfBirth: '1982-12-05',
        address: '654 Cedar Lane',
        city: 'Anytown',
        postalCode: '10005',
        loyaltyNumber: 'LOY005',
        loyaltyPoints: 875,
        totalSpent: 312.25,
        purchaseCount: 22,
        lastPurchaseDate: '2025-09-11',
        isVip: true,
        notes: 'Corporate account, orders for entire office'
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
        lastVisit: customer.lastPurchaseDate ? new Date(customer.lastPurchaseDate).toISOString() : undefined,
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    // 8. CREATE SAMPLE TRANSACTIONS
    console.log('🧾 Creating sample transactions...')
    const sampleTransactions = [
      {
        id: 'txn_001',
        number: 'TXN-2025-001',
        customerId: 'cust_john_doe',
        customerName: 'John Doe',
        items: [
          { productId: 'prod_cappuccino', name: 'Cappuccino', price: 4.50, quantity: 1, subtotal: 4.50 },
          { productId: 'prod_muffin_blueberry', name: 'Blueberry Muffin', price: 2.75, quantity: 1, subtotal: 2.75 }
        ],
        subtotal: 7.25,
        total: 7.83, // With tax
        paymentMethod: 'Cash',
        cashier: 'Alice Manager',
        date: '2025-09-14T08:30:00Z'
      },
      {
        id: 'txn_002',
        number: 'TXN-2025-002',
        customerId: 'cust_jane_smith',
        customerName: 'Jane Smith',
        items: [
          { productId: 'prod_latte', name: 'Caffe Latte', price: 5.25, quantity: 2, subtotal: 10.50 },
          { productId: 'prod_croissant', name: 'Butter Croissant', price: 3.25, quantity: 1, subtotal: 3.25 }
        ],
        subtotal: 13.75,
        total: 14.85, // With tax and 10% loyalty discount
        paymentMethod: 'Credit Card',
        cashier: 'Bob Cashier',
        date: '2025-09-14T09:15:00Z'
      },
      {
        id: 'txn_003',
        number: 'TXN-2025-003',
        customerId: 'cust_sarah_davis',
        customerName: 'Sarah Davis',
        items: [
          { productId: 'prod_smoothie_berry', name: 'Mixed Berry Smoothie', price: 6.95, quantity: 1, subtotal: 6.95 },
          { productId: 'prod_wrap_veggie', name: 'Veggie Wrap', price: 7.50, quantity: 1, subtotal: 7.50 }
        ],
        subtotal: 14.45,
        total: 15.21, // With tax
        paymentMethod: 'Mobile Wallet',
        cashier: 'Carol Staff',
        date: '2025-09-14T12:20:00Z'
      }
    ]
    
    for (const txn of sampleTransactions) {
      await db.transactions.insert({
        id: txn.id,
        items: txn.items,
        subtotal: txn.subtotal,
        discounts: txn.id === 'txn_002' ? [{ id: 'loyalty_10', type: 'loyalty', name: '10% Loyalty Discount', amount: 1.375 }] : [],
        taxes: [{ id: 'sales_tax', name: 'Sales Tax', rate: 0.08, amount: txn.total - txn.subtotal }],
        fees: [],
        total: txn.total,
        paymentMethod: txn.paymentMethod,
        paymentStatus: 'completed' as const,
        customerInfo: {
          name: txn.customerName,
          phone: customers.find(c => c.id === txn.customerId)?.phone || '',
          email: customers.find(c => c.id === txn.customerId)?.email || ''
        },
        cashier: txn.cashier,
        notes: `Transaction processed by ${txn.cashier}`,
        createdAt: txn.date,
        updatedAt: txn.date,
        syncedAt: txn.date,
        _deleted: false
      })
    }
    
    // 9. CREATE DRAFT TRANSACTIONS
    console.log('📝 Creating draft transactions...')
    const draftTransactions = [
      {
        id: 'draft_001',
        customerId: 'cust_mike_wilson',
        customerName: 'Mike Wilson',
        items: [
          { productId: 'prod_sandwich_turkey', name: 'Turkey Club Sandwich', price: 8.95, quantity: 3, subtotal: 26.85 },
          { productId: 'prod_iced_coffee', name: 'Iced Coffee', price: 3.75, quantity: 3, subtotal: 11.25 }
        ],
        subtotal: 38.10,
        total: 41.15,
        paidAmount: 20.00,
        remainingAmount: 21.15,
        status: 'layaway' as const,
        notes: 'Corporate lunch order - partial payment received'
      },
      {
        id: 'draft_002',
        customerId: 'cust_robert_brown',
        customerName: 'Robert Brown',
        items: [
          { productId: 'prod_mug_branded', name: 'WebWaka Coffee Mug', price: 12.95, quantity: 5, subtotal: 64.75 }
        ],
        subtotal: 64.75,
        total: 71.23,
        paidAmount: 0.00,
        remainingAmount: 71.23,
        status: 'draft' as const,
        notes: 'Corporate gift order - waiting for approval'
      }
    ]
    
    for (const draft of draftTransactions) {
      await db.drafts.insert({
        id: draft.id,
        items: draft.items,
        customerInfo: {
          name: draft.customerName,
          phone: customers.find(c => c.id === draft.customerId)?.phone || '',
          email: customers.find(c => c.id === draft.customerId)?.email || ''
        },
        subtotal: draft.subtotal,
        total: draft.total,
        paidAmount: draft.paidAmount,
        remainingAmount: draft.remainingAmount,
        status: draft.status,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        notes: draft.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
      })
    }
    
    console.log('✅ POS Demo Data Creation Complete!')
    console.log(`
📊 Demo Data Summary:
• ${categories.length} Product Categories
• ${suppliers.length} Suppliers  
• ${locations.length} Locations
• ${products.length} Products
• ${variants.length} Product Variants
• ${products.length + variants.length} Stock Level Records
• ${customers.length} Customers
• ${sampleTransactions.length} Completed Transactions
• ${draftTransactions.length} Draft Transactions

🎯 Ready for comprehensive POS testing across all user roles!
    `)
    
    return {
      categories: categories.length,
      suppliers: suppliers.length,
      locations: locations.length,
      products: products.length,
      variants: variants.length,
      stockLevels: products.length + variants.length,
      customers: customers.length,
      transactions: sampleTransactions.length,
      drafts: draftTransactions.length
    }
    
  } catch (error) {
    console.error('❌ Error creating POS demo data:', error)
    throw error
  }
}

// Export for use in other scripts
export default createPOSDemoData