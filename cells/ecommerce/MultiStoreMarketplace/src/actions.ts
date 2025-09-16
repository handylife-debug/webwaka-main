'use server';

import { redis } from '@/lib/redis';
import { execute_sql } from '@/lib/database';
import { getAuthenticatedUser, getSecureTenantId, checkVendorOwnership } from '@/lib/secure-auth';

// Reuse existing interfaces and functions from partner management and inventory systems
interface VendorStore {
  id: string;
  vendorId: string;
  tenantId: string;
  storeName: string;
  storeSlug: string;
  description?: string;
  logo?: string;
  banner?: string;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    layout: 'grid' | 'list' | 'masonry';
  };
  settings: {
    isActive: boolean;
    allowReviews: boolean;
    autoApproveProducts: boolean;
    shippingZones: string[];
    paymentMethods: string[];
  };
  createdAt: string;
  updatedAt: string;
}

interface VendorProductMapping {
  id: string;
  vendorId: string;
  storeId: string;
  productId: string;
  tenantId: string;
  vendorPrice: number;
  vendorSKU: string;
  stock: number;
  isActive: boolean;
  customizations?: {
    description?: string;
    images?: string[];
    variants?: any[];
  };
  createdAt: string;
  updatedAt: string;
}

interface VendorDashboardMetrics {
  store: VendorStore;
  metrics: {
    totalSales: number;
    monthlyRevenue: number;
    totalProducts: number;
    activeProducts: number;
    pendingOrders: number;
    completedOrders: number;
    averageRating: number;
    reviewCount: number;
  };
  recentOrders: any[];
  topProducts: any[];
  analytics: {
    salesTrend: any[];
    categoryBreakdown: any[];
    customerInsights: any[];
  };
}

// SECURE Authorization helper using existing auth system
async function checkVendorAuthorization(vendorId: string): Promise<{ authorized: boolean; user: any; tenantId: string }> {
  try {
    // Use secure authentication instead of untrusted headers
    const user = await getAuthenticatedUser();
    if (!user) {
      return { authorized: false, user: null, tenantId: '' };
    }

    const tenantId = await getSecureTenantId();
    const authorized = await checkVendorOwnership(user, vendorId, tenantId);
    
    return { authorized, user, tenantId };
  } catch (error) {
    console.error('Authorization check failed:', error);
    return { authorized: false, user: null, tenantId: '' };
  }
}

// Generate unique store slug
function generateStoreSlug(storeName: string, vendorId: string): string {
  const baseSlug = storeName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 30);
  
  // Add vendor prefix to ensure uniqueness
  const vendorPrefix = vendorId.substring(0, 8);
  return `${vendorPrefix}-${baseSlug}`;
}

// Server actions matching cell.json contract

export async function createVendorStore(
  input: {
    vendorId: string;
    storeName: string;
    storeSlug: string;
    description?: string;
    logo?: string;
    banner?: string;
    theme?: {
      primaryColor?: string;
      secondaryColor?: string;
      fontFamily?: string;
      layout?: 'grid' | 'list' | 'masonry';
    };
    settings?: {
      isActive?: boolean;
      allowReviews?: boolean;
      autoApproveProducts?: boolean;
      shippingZones?: string[];
      paymentMethods?: string[];
    };
  }
): Promise<{ success: boolean; storeId?: string; storeUrl?: string; message: string }> {
  try {
    // Check authorization using secure authentication
    const auth = await checkVendorAuthorization(input.vendorId);
    if (!auth.authorized) {
      return {
        success: false,
        message: 'Unauthorized to create store for this vendor.'
      };
    }
    const { tenantId } = auth;

    // Generate unique store slug if not provided
    const storeSlug = input.storeSlug || generateStoreSlug(input.storeName, input.vendorId);
    
    // Check if store slug is already taken
    const existingStore = await execute_sql(
      'SELECT id FROM vendor_stores WHERE tenant_id = $1 AND store_slug = $2',
      [tenantId, storeSlug]
    );
    
    if (existingStore.rows.length > 0) {
      return {
        success: false,
        message: 'Store slug is already taken. Please choose a different name.'
      };
    }

    const storeId = `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const defaultTheme = {
      primaryColor: '#3B82F6',
      secondaryColor: '#1F2937',
      fontFamily: 'Inter',
      layout: 'grid' as const
    };
    
    const defaultSettings = {
      isActive: true,
      allowReviews: true,
      autoApproveProducts: false,
      shippingZones: [],
      paymentMethods: ['stripe', 'paypal']
    };

    const store: VendorStore = {
      id: storeId,
      vendorId: input.vendorId,
      tenantId,
      storeName: input.storeName,
      storeSlug,
      description: input.description,
      logo: input.logo,
      banner: input.banner,
      theme: { ...defaultTheme, ...input.theme },
      settings: { ...defaultSettings, ...input.settings },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in database
    await execute_sql(
      `INSERT INTO vendor_stores 
       (id, vendor_id, tenant_id, store_name, store_slug, description, logo, banner, theme, settings, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        store.id,
        store.vendorId,
        store.tenantId,
        store.storeName,
        store.storeSlug,
        store.description,
        store.logo,
        store.banner,
        JSON.stringify(store.theme),
        JSON.stringify(store.settings),
        store.createdAt,
        store.updatedAt
      ]
    );

    // Cache store info in Redis
    const cacheKey = `vendor_store:${tenantId}:${storeId}`;
    await redis.set(cacheKey, store);

    // Add to stores index
    const storesIndexKey = `vendor_stores:${tenantId}`;
    const existingStoreIds = await redis.get<string[]>(storesIndexKey) || [];
    existingStoreIds.push(storeId);
    await redis.set(storesIndexKey, existingStoreIds);

    const storeUrl = `/${tenantId}/store/${storeSlug}`;

    return {
      success: true,
      storeId,
      storeUrl,
      message: 'Vendor store created successfully!'
    };
  } catch (error) {
    console.error('Error creating vendor store:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create vendor store.'
    };
  }
}

export async function mapProductToVendor(
  input: {
    vendorId: string;
    storeId: string;
    productId: string;
    vendorPrice: number;
    vendorSKU: string;
    stock: number;
    isActive?: boolean;
    customizations?: {
      description?: string;
      images?: string[];
      variants?: any[];
    };
  }
): Promise<{ success: boolean; mappingId?: string; message: string }> {
  try {
    // Check authorization using secure authentication
    const auth = await checkVendorAuthorization(input.vendorId);
    if (!auth.authorized) {
      return {
        success: false,
        message: 'Unauthorized to map products for this vendor.'
      };
    }
    const { tenantId } = auth;

    // Verify store belongs to vendor
    const storeCheck = await execute_sql(
      'SELECT id FROM vendor_stores WHERE id = $1 AND vendor_id = $2 AND tenant_id = $3',
      [input.storeId, input.vendorId, tenantId]
    );
    
    if (storeCheck.rows.length === 0) {
      return {
        success: false,
        message: 'Store not found or does not belong to this vendor.'
      };
    }

    // Check if product exists
    const productCheck = await execute_sql(
      'SELECT id FROM products WHERE id = $1 AND tenant_id = $2',
      [input.productId, tenantId]
    );
    
    if (productCheck.rows.length === 0) {
      return {
        success: false,
        message: 'Product not found.'
      };
    }

    // Check if mapping already exists
    const existingMapping = await execute_sql(
      'SELECT id FROM vendor_product_mappings WHERE vendor_id = $1 AND store_id = $2 AND product_id = $3 AND tenant_id = $4',
      [input.vendorId, input.storeId, input.productId, tenantId]
    );
    
    if (existingMapping.rows.length > 0) {
      return {
        success: false,
        message: 'Product is already mapped to this vendor store.'
      };
    }

    const mappingId = `mapping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const mapping: VendorProductMapping = {
      id: mappingId,
      vendorId: input.vendorId,
      storeId: input.storeId,
      productId: input.productId,
      tenantId,
      vendorPrice: input.vendorPrice,
      vendorSKU: input.vendorSKU,
      stock: input.stock,
      isActive: input.isActive ?? true,
      customizations: input.customizations,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in database
    await execute_sql(
      `INSERT INTO vendor_product_mappings 
       (id, vendor_id, store_id, product_id, tenant_id, vendor_price, vendor_sku, stock, is_active, customizations, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        mapping.id,
        mapping.vendorId,
        mapping.storeId,
        mapping.productId,
        mapping.tenantId,
        mapping.vendorPrice,
        mapping.vendorSKU,
        mapping.stock,
        mapping.isActive,
        JSON.stringify(mapping.customizations || {}),
        mapping.createdAt,
        mapping.updatedAt
      ]
    );

    return {
      success: true,
      mappingId,
      message: 'Product successfully mapped to vendor store!'
    };
  } catch (error) {
    console.error('Error mapping product to vendor:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to map product to vendor.'
    };
  }
}

export async function getVendorDashboard(
  input: {
    vendorId: string;
    dateRange?: {
      startDate: string;
      endDate: string;
    };
  }
): Promise<{ success: boolean; dashboard?: VendorDashboardMetrics; message: string }> {
  try {
    // Check authorization using secure authentication
    const auth = await checkVendorAuthorization(input.vendorId);
    if (!auth.authorized) {
      return {
        success: false,
        message: 'Unauthorized to access this vendor dashboard.'
      };
    }
    const { tenantId } = auth;

    // Get vendor store
    const storeResult = await execute_sql(
      'SELECT * FROM vendor_stores WHERE vendor_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1',
      [input.vendorId, tenantId]
    );
    
    if (storeResult.rows.length === 0) {
      return {
        success: false,
        message: 'No store found for this vendor.'
      };
    }

    const storeRow = storeResult.rows[0];
    const store: VendorStore = {
      id: storeRow.id,
      vendorId: storeRow.vendor_id,
      tenantId: storeRow.tenant_id,
      storeName: storeRow.store_name,
      storeSlug: storeRow.store_slug,
      description: storeRow.description,
      logo: storeRow.logo,
      banner: storeRow.banner,
      theme: JSON.parse(storeRow.theme),
      settings: JSON.parse(storeRow.settings),
      createdAt: storeRow.created_at,
      updatedAt: storeRow.updated_at
    };

    // Get metrics (mock data for now - would be calculated from actual orders/sales)
    const metrics = {
      totalSales: 12450.75,
      monthlyRevenue: 3200.50,
      totalProducts: 45,
      activeProducts: 42,
      pendingOrders: 8,
      completedOrders: 127,
      averageRating: 4.7,
      reviewCount: 89
    };

    // Get recent orders (mock data)
    const recentOrders = [
      { id: 'ORD-001', customer: 'John Doe', amount: 125.00, status: 'pending', date: new Date().toISOString() },
      { id: 'ORD-002', customer: 'Jane Smith', amount: 89.50, status: 'completed', date: new Date().toISOString() }
    ];

    // Get top products (mock data)
    const topProducts = [
      { name: 'Premium Widget', sales: 125, revenue: 2500 },
      { name: 'Standard Widget', sales: 89, revenue: 1780 }
    ];

    // Analytics data (mock)
    const analytics = {
      salesTrend: [
        { date: '2025-01-01', sales: 1200 },
        { date: '2025-01-02', sales: 1450 }
      ],
      categoryBreakdown: [
        { category: 'Electronics', percentage: 45 },
        { category: 'Clothing', percentage: 35 }
      ],
      customerInsights: [
        { metric: 'Repeat Customers', value: '23%' },
        { metric: 'Average Order Value', value: '$67.50' }
      ]
    };

    const dashboard: VendorDashboardMetrics = {
      store,
      metrics,
      recentOrders,
      topProducts,
      analytics
    };

    return {
      success: true,
      dashboard,
      message: 'Vendor dashboard data retrieved successfully.'
    };
  } catch (error) {
    console.error('Error getting vendor dashboard:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get vendor dashboard.'
    };
  }
}

export async function getStoreProducts(
  input: {
    storeId: string;
    filters?: {
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      inStock?: boolean;
      search?: string;
    };
    pagination?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    };
  }
): Promise<{ success: boolean; products?: any[]; total?: number; pagination?: any; message: string }> {
  try {
    // Use secure tenant ID from authenticated user
    const tenantId = await getSecureTenantId();
    const { filters = {}, pagination = {} } = input;
    
    // Verify store exists
    const storeCheck = await execute_sql(
      'SELECT id FROM vendor_stores WHERE id = $1 AND tenant_id = $2',
      [input.storeId, tenantId]
    );
    
    if (storeCheck.rows.length === 0) {
      return {
        success: false,
        message: 'Store not found.'
      };
    }

    // Build query with filters
    let whereConditions = ['vpm.store_id = $1', 'vpm.tenant_id = $2', 'vpm.is_active = true'];
    let queryParams: any[] = [input.storeId, tenantId];
    let paramIndex = 3;

    if (filters.category) {
      whereConditions.push(`p.category_id = $${paramIndex++}`);
      queryParams.push(filters.category);
    }

    if (filters.minPrice !== undefined) {
      whereConditions.push(`vpm.vendor_price >= $${paramIndex++}`);
      queryParams.push(filters.minPrice);
    }

    if (filters.maxPrice !== undefined) {
      whereConditions.push(`vpm.vendor_price <= $${paramIndex++}`);
      queryParams.push(filters.maxPrice);
    }

    if (filters.inStock) {
      whereConditions.push(`vpm.stock > 0`);
    }

    if (filters.search) {
      whereConditions.push(`(LOWER(p.name) LIKE $${paramIndex++} OR LOWER(p.description) LIKE $${paramIndex++})`);
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM vendor_product_mappings vpm
      JOIN products p ON vpm.product_id = p.id
      WHERE ${whereClause}
    `;
    
    const countResult = await execute_sql(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get products with pagination
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const offset = (page - 1) * limit;
    const sortBy = pagination.sortBy || 'p.name';
    const sortOrder = pagination.sortOrder || 'asc';

    const productsQuery = `
      SELECT 
        p.*,
        vpm.vendor_price,
        vpm.vendor_sku,
        vpm.stock as vendor_stock,
        vpm.customizations
      FROM vendor_product_mappings vpm
      JOIN products p ON vpm.product_id = p.id
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    queryParams.push(limit, offset);
    const productsResult = await execute_sql(productsQuery, queryParams);

    const products = productsResult.rows.map((row: any) => ({
      ...row,
      customizations: row.customizations ? JSON.parse(row.customizations) : {}
    }));

    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      products,
      total,
      pagination: {
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      message: 'Store products retrieved successfully.'
    };
  } catch (error) {
    console.error('Error getting store products:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get store products.'
    };
  }
}

export async function manageStoreSettings(
  input: {
    storeId: string;
    vendorId: string;
    updates: {
      storeName?: string;
      description?: string;
      logo?: string;
      banner?: string;
      theme?: any;
      settings?: any;
    };
  }
): Promise<{ success: boolean; store?: VendorStore; message: string }> {
  try {
    // Check authorization using secure authentication
    const auth = await checkVendorAuthorization(input.vendorId);
    if (!auth.authorized) {
      return {
        success: false,
        message: 'Unauthorized to manage this store.'
      };
    }
    const { tenantId } = auth;

    // Verify store belongs to vendor
    const storeResult = await execute_sql(
      'SELECT * FROM vendor_stores WHERE id = $1 AND vendor_id = $2 AND tenant_id = $3',
      [input.storeId, input.vendorId, tenantId]
    );
    
    if (storeResult.rows.length === 0) {
      return {
        success: false,
        message: 'Store not found or does not belong to this vendor.'
      };
    }

    const currentStore = storeResult.rows[0];
    const currentTheme = JSON.parse(currentStore.theme);
    const currentSettings = JSON.parse(currentStore.settings);

    // Build update query
    const updates = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.updates.storeName) {
      updates.push(`store_name = $${paramIndex++}`);
      values.push(input.updates.storeName);
    }

    if (input.updates.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.updates.description);
    }

    if (input.updates.logo !== undefined) {
      updates.push(`logo = $${paramIndex++}`);
      values.push(input.updates.logo);
    }

    if (input.updates.banner !== undefined) {
      updates.push(`banner = $${paramIndex++}`);
      values.push(input.updates.banner);
    }

    if (input.updates.theme) {
      updates.push(`theme = $${paramIndex++}`);
      values.push(JSON.stringify({ ...currentTheme, ...input.updates.theme }));
    }

    if (input.updates.settings) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify({ ...currentSettings, ...input.updates.settings }));
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());

    // Add WHERE conditions
    values.push(input.storeId, input.vendorId, tenantId);

    const updateQuery = `
      UPDATE vendor_stores 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND vendor_id = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await execute_sql(updateQuery, values);
    
    if (result.rows.length === 0) {
      return {
        success: false,
        message: 'Failed to update store settings.'
      };
    }

    const updatedRow = result.rows[0];
    const store: VendorStore = {
      id: updatedRow.id,
      vendorId: updatedRow.vendor_id,
      tenantId: updatedRow.tenant_id,
      storeName: updatedRow.store_name,
      storeSlug: updatedRow.store_slug,
      description: updatedRow.description,
      logo: updatedRow.logo,
      banner: updatedRow.banner,
      theme: JSON.parse(updatedRow.theme),
      settings: JSON.parse(updatedRow.settings),
      createdAt: updatedRow.created_at,
      updatedAt: updatedRow.updated_at
    };

    // Update Redis cache
    const cacheKey = `vendor_store:${tenantId}:${input.storeId}`;
    await redis.set(cacheKey, store);

    return {
      success: true,
      store,
      message: 'Store settings updated successfully!'
    };
  } catch (error) {
    console.error('Error managing store settings:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update store settings.'
    };
  }
}

export async function getMarketplaceOverview(
  input: {
    tenantId: string;
    filters?: {
      status?: 'active' | 'inactive' | 'pending';
      category?: string;
      dateRange?: { startDate: string; endDate: string };
    };
  }
): Promise<{ success: boolean; overview?: any; message: string }> {
  try {
    // Use secure tenant ID from authenticated user
    const user = await getAuthenticatedUser();
    if (!user) {
      return {
        success: false,
        message: 'Authentication required.'
      };
    }
    
    const tenantId = await getSecureTenantId();
    
    // Get marketplace overview metrics
    const storesResult = await execute_sql(
      'SELECT COUNT(*) as total_stores, COUNT(CASE WHEN settings->>\'isActive\' = \'true\' THEN 1 END) as active_stores FROM vendor_stores WHERE tenant_id = $1',
      [tenantId]
    );
    
    const productsResult = await execute_sql(
      'SELECT COUNT(*) as total_products FROM vendor_product_mappings WHERE tenant_id = $1 AND is_active = true',
      [tenantId]
    );

    const overview = {
      totalStores: parseInt(storesResult.rows[0].total_stores),
      activeStores: parseInt(storesResult.rows[0].active_stores),
      totalProducts: parseInt(productsResult.rows[0].total_products),
      topVendors: [
        { name: 'Vendor A', sales: 15000, products: 25 },
        { name: 'Vendor B', sales: 12500, products: 18 }
      ],
      recentActivity: [
        { type: 'store_created', store: 'New Fashion Store', date: new Date().toISOString() },
        { type: 'product_added', product: 'Premium Widget', store: 'Tech Store', date: new Date().toISOString() }
      ]
    };

    return {
      success: true,
      overview,
      message: 'Marketplace overview retrieved successfully.'
    };
  } catch (error) {
    console.error('Error getting marketplace overview:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get marketplace overview.'
    };
  }
}