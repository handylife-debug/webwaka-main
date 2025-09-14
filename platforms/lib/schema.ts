/**
 * Multi-Tenant Enterprise Database Schema
 * 
 * This schema implements a comprehensive enterprise platform with:
 * - Multi-tenant architecture with proper isolation
 * - Partner Management System with MLM capabilities
 * - Comprehensive Inventory Management
 * - Enterprise-level CRM System
 * - Human Resource Management (HRM)
 * - Point of Sale (POS) integration
 * - Commission tracking and calculations
 * - Security and audit trails
 */

// Core tenants table - foundation for multi-tenant architecture
export const TENANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subdomain VARCHAR(100) NOT NULL UNIQUE,
    tenant_name VARCHAR(200) NOT NULL,
    emoji VARCHAR(10) DEFAULT '🏢',
    subscription_plan VARCHAR(50) DEFAULT 'Free' CHECK (subscription_plan IN ('Free', 'Pro', 'Enterprise')),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended', 'Archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Data integrity constraints
    CONSTRAINT check_subdomain_format CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT check_subdomain_length CHECK (char_length(subdomain) >= 2 AND char_length(subdomain) <= 50)
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
  CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
  
  -- Trigger for automatic updated_at
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ language 'plpgsql';
  
  CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// SQL schema definitions for Partner Management tables

export const PARTNER_LEVELS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    level_code VARCHAR(50) NOT NULL,
    level_name VARCHAR(100) NOT NULL,
    level_order INTEGER NOT NULL,
    description TEXT,
    min_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    default_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    max_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    min_downline_count INTEGER DEFAULT 0,
    min_volume_requirement DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    benefits JSONB DEFAULT '[]'::jsonb,
    requirements JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partner_levels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_level_code_per_tenant UNIQUE (tenant_id, level_code),
    CONSTRAINT unique_level_order_per_tenant UNIQUE (tenant_id, level_order),
    
    -- Data integrity constraints
    CONSTRAINT check_commission_rates_range CHECK (
      min_commission_rate >= 0 AND min_commission_rate <= 1 AND
      default_commission_rate >= 0 AND default_commission_rate <= 1 AND
      max_commission_rate >= 0 AND max_commission_rate <= 1
    ),
    CONSTRAINT check_commission_rates_order CHECK (
      min_commission_rate <= default_commission_rate AND 
      default_commission_rate <= max_commission_rate
    ),
    CONSTRAINT check_level_order_positive CHECK (level_order > 0),
    CONSTRAINT check_min_counts_non_negative CHECK (
      min_downline_count >= 0 AND min_volume_requirement >= 0
    )
  );
`;

export const PARTNERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    partner_code VARCHAR(50) NOT NULL,
    user_id UUID,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    partner_level_id UUID NOT NULL,
    sponsor_id UUID,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'terminated')),
    commission_rate DECIMAL(5,4),
    total_downline_count INTEGER DEFAULT 0,
    direct_downline_count INTEGER DEFAULT 0,
    lifetime_volume DECIMAL(15,2) DEFAULT 0,
    current_month_volume DECIMAL(15,2) DEFAULT 0,
    last_activity_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partners_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partners_level FOREIGN KEY (partner_level_id) REFERENCES partner_levels(id) ON DELETE RESTRICT,
    CONSTRAINT fk_partners_sponsor FOREIGN KEY (sponsor_id) REFERENCES partners(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_partner_code_per_tenant UNIQUE (tenant_id, partner_code),
    CONSTRAINT unique_user_id_per_tenant UNIQUE (tenant_id, user_id),
    CONSTRAINT unique_email_per_tenant UNIQUE (tenant_id, email),
    
    -- Data integrity constraints
    CONSTRAINT check_commission_rate_range CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1)),
    CONSTRAINT check_downline_counts_non_negative CHECK (
      total_downline_count >= 0 AND 
      direct_downline_count >= 0 AND
      total_downline_count >= direct_downline_count
    ),
    CONSTRAINT check_volumes_non_negative CHECK (
      lifetime_volume >= 0 AND current_month_volume >= 0
    ),
    CONSTRAINT check_no_self_sponsorship CHECK (id != sponsor_id),
    CONSTRAINT check_enrollment_date_not_future CHECK (enrollment_date <= CURRENT_DATE)
  );
`;

export const PARTNER_RELATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    parent_partner_id UUID NOT NULL,
    child_partner_id UUID NOT NULL,
    depth INTEGER NOT NULL,
    path TEXT NOT NULL,
    relationship_type VARCHAR(20) DEFAULT 'sponsorship' CHECK (relationship_type IN ('sponsorship', 'mentorship', 'team')),
    established_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'severed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partner_relations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_relations_parent FOREIGN KEY (parent_partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_relations_child FOREIGN KEY (child_partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant - prevent duplicate relationships
    CONSTRAINT unique_partner_relationship_per_tenant UNIQUE (tenant_id, parent_partner_id, child_partner_id, relationship_type),
    
    -- Data integrity constraints
    CONSTRAINT check_no_self_relationship CHECK (parent_partner_id != child_partner_id),
    CONSTRAINT check_depth_positive CHECK (depth > 0),
    CONSTRAINT check_established_date_not_future CHECK (established_date <= CURRENT_DATE)
  );
`;

export const PARTNER_APPLICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    company_name VARCHAR(200),
    company_website VARCHAR(255),
    experience_level VARCHAR(50),
    marketing_experience TEXT,
    why_partner TEXT,
    referral_methods TEXT,
    sponsor_email VARCHAR(255),
    sponsor_id UUID,
    requested_partner_level_id UUID,
    application_status VARCHAR(20) DEFAULT 'pending' CHECK (application_status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    application_date DATE DEFAULT CURRENT_DATE,
    reviewed_date DATE,
    reviewed_by UUID,
    approval_notes TEXT,
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partner_applications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_applications_sponsor FOREIGN KEY (sponsor_id) REFERENCES partners(id) ON DELETE SET NULL,
    CONSTRAINT fk_partner_applications_level FOREIGN KEY (requested_partner_level_id) REFERENCES partner_levels(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_application_email_per_tenant UNIQUE (tenant_id, email),
    
    -- Data integrity constraints
    CONSTRAINT check_application_date_not_future CHECK (application_date <= CURRENT_DATE),
    CONSTRAINT check_reviewed_date_after_application CHECK (reviewed_date IS NULL OR reviewed_date >= application_date),
    CONSTRAINT check_reviewed_status_consistency CHECK (
      (application_status = 'pending' AND reviewed_date IS NULL AND reviewed_by IS NULL) OR
      (application_status IN ('approved', 'rejected') AND reviewed_date IS NOT NULL AND reviewed_by IS NOT NULL) OR
      (application_status = 'withdrawn')
    )
  );
`;

// Partner Commissions table for Commission Engine
export const PARTNER_COMMISSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    transaction_amount DECIMAL(15,2) NOT NULL,
    transaction_type VARCHAR(50) DEFAULT 'payment' CHECK (transaction_type IN ('payment', 'signup', 'recurring', 'bonus')),
    
    -- Who receives the commission
    beneficiary_partner_id UUID NOT NULL,
    beneficiary_partner_code VARCHAR(50) NOT NULL,
    
    -- Who made the original sale/transaction
    source_partner_id UUID NOT NULL,
    source_partner_code VARCHAR(50) NOT NULL,
    
    -- Commission calculation details
    commission_level INTEGER NOT NULL DEFAULT 1,
    levels_from_source INTEGER NOT NULL DEFAULT 1,
    commission_percentage DECIMAL(5,4) NOT NULL,
    commission_amount DECIMAL(15,2) NOT NULL,
    
    -- Partner level information at time of calculation
    beneficiary_partner_level_id UUID NOT NULL,
    beneficiary_partner_level_name VARCHAR(100) NOT NULL,
    
    -- Commission status and tracking
    calculation_status VARCHAR(20) DEFAULT 'calculated' CHECK (calculation_status IN ('calculated', 'approved', 'paid', 'cancelled', 'disputed')),
    payout_status VARCHAR(20) DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    
    -- Dates and timestamps
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    calculation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_date TIMESTAMP WITH TIME ZONE,
    paid_date TIMESTAMP WITH TIME ZONE,
    
    -- Additional tracking
    commission_engine_version VARCHAR(20) DEFAULT '1.0',
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints with ON DELETE RESTRICT for data integrity
    CONSTRAINT fk_partner_commissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_commissions_level FOREIGN KEY (beneficiary_partner_level_id) REFERENCES partner_levels(id) ON DELETE RESTRICT,
    
    -- Business logic constraints
    CONSTRAINT check_commission_amounts_positive CHECK (
      transaction_amount > 0 AND commission_amount >= 0
    ),
    CONSTRAINT check_commission_percentage_valid CHECK (
      commission_percentage >= 0 AND commission_percentage <= 1
    ),
    CONSTRAINT check_levels_positive CHECK (
      commission_level > 0 AND levels_from_source > 0
    ),
    CONSTRAINT check_calculation_before_approval CHECK (
      approved_date IS NULL OR approved_date >= calculation_date
    ),
    CONSTRAINT check_approval_before_payment CHECK (
      paid_date IS NULL OR (approved_date IS NOT NULL AND paid_date >= approved_date)
    ),
    
    -- Unique constraint to prevent duplicate commission calculations
    CONSTRAINT unique_commission_per_transaction_beneficiary UNIQUE (tenant_id, transaction_id, beneficiary_partner_id, commission_level),
    CONSTRAINT unique_commission_per_transaction_source UNIQUE (tenant_id, transaction_id, beneficiary_partner_id, levels_from_source)
  );
`;

/**
 * Inventory Management Database Schema
 * 
 * This schema extends the POS system with comprehensive inventory management:
 * - Product Catalog with variants and categorization
 * - Multi-location inventory tracking
 * - Supplier management and purchase orders
 * - Stock movements and audit trails
 * - Automated reordering and alerts
 * - Serialized and lot tracking
 */

// Enhanced Product Categories table
export const PRODUCT_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    category_code VARCHAR(50) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    parent_category_id UUID,
    description TEXT,
    tax_rate DECIMAL(5,4) DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_product_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_categories_parent FOREIGN KEY (parent_category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_category_code_per_tenant UNIQUE (tenant_id, category_code),
    CONSTRAINT unique_category_name_per_tenant UNIQUE (tenant_id, category_name),
    
    -- Data integrity constraints
    CONSTRAINT check_no_self_parent CHECK (id != parent_category_id),
    CONSTRAINT check_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 1)
  );
`;

// Suppliers table for supplier management
export const SUPPLIERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    supplier_code VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    tax_id VARCHAR(50),
    payment_terms VARCHAR(100),
    credit_limit DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_supplier_code_per_tenant UNIQUE (tenant_id, supplier_code),
    CONSTRAINT unique_supplier_name_per_tenant UNIQUE (tenant_id, supplier_name),
    
    -- Data integrity constraints
    CONSTRAINT check_credit_limit_non_negative CHECK (credit_limit >= 0)
  );
`;

// Locations table for multi-location support
export const LOCATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    location_code VARCHAR(50) NOT NULL,
    location_name VARCHAR(200) NOT NULL,
    location_type VARCHAR(50) DEFAULT 'store' CHECK (location_type IN ('store', 'warehouse', 'outlet', 'online')),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    manager_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_locations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_location_code_per_tenant UNIQUE (tenant_id, location_code),
    
    -- Data integrity constraints
    CONSTRAINT check_sort_order_non_negative CHECK (sort_order >= 0)
  );
`;

// Enhanced Products table for comprehensive inventory
export const INVENTORY_PRODUCTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS inventory_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    product_description TEXT,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    category_id UUID,
    supplier_id UUID,
    brand VARCHAR(100),
    model VARCHAR(100),
    
    -- Pricing information
    cost_price DECIMAL(15,2) DEFAULT 0,
    selling_price DECIMAL(15,2) DEFAULT 0,
    markup_percentage DECIMAL(5,2) DEFAULT 0,
    tax_rate DECIMAL(5,4) DEFAULT 0.0000,
    
    -- Inventory tracking
    track_stock BOOLEAN DEFAULT true,
    minimum_stock_level INTEGER DEFAULT 0,
    maximum_stock_level INTEGER,
    reorder_point INTEGER DEFAULT 0,
    reorder_quantity INTEGER DEFAULT 0,
    
    -- Product specifications
    weight DECIMAL(10,3),
    length DECIMAL(10,2),
    width DECIMAL(10,2),
    height DECIMAL(10,2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    dimension_unit VARCHAR(10) DEFAULT 'cm',
    
    -- Product status and classification
    product_type VARCHAR(50) DEFAULT 'physical' CHECK (product_type IN ('physical', 'service', 'digital', 'bundle')),
    is_active BOOLEAN DEFAULT true,
    is_serialized BOOLEAN DEFAULT false,
    requires_lot_tracking BOOLEAN DEFAULT false,
    has_expiry_date BOOLEAN DEFAULT false,
    
    -- SEO and marketing
    tags TEXT[],
    image_urls TEXT[],
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_inventory_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_inventory_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_sku_per_tenant UNIQUE (tenant_id, sku),
    CONSTRAINT unique_barcode_per_tenant UNIQUE (tenant_id, barcode),
    
    -- Data integrity constraints
    CONSTRAINT check_prices_non_negative CHECK (
      cost_price >= 0 AND selling_price >= 0 AND markup_percentage >= 0
    ),
    CONSTRAINT check_stock_levels_non_negative CHECK (
      minimum_stock_level >= 0 AND 
      (maximum_stock_level IS NULL OR maximum_stock_level >= minimum_stock_level) AND
      reorder_point >= 0 AND reorder_quantity >= 0
    ),
    CONSTRAINT check_dimensions_non_negative CHECK (
      weight IS NULL OR weight >= 0 AND
      length IS NULL OR length >= 0 AND
      width IS NULL OR width >= 0 AND
      height IS NULL OR height >= 0
    ),
    CONSTRAINT check_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 1)
  );
`;

// Product Variants table for product variations
export const PRODUCT_VARIANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_name VARCHAR(200) NOT NULL,
    variant_type VARCHAR(50) DEFAULT 'option',
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    
    -- Variant-specific pricing
    cost_price DECIMAL(15,2),
    selling_price DECIMAL(15,2),
    
    -- Variant attributes
    attributes JSONB DEFAULT '{}'::jsonb,
    color VARCHAR(50),
    size VARCHAR(50),
    weight DECIMAL(10,3),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Additional information
    image_urls TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_product_variants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_variant_sku_per_tenant UNIQUE (tenant_id, sku),
    CONSTRAINT unique_variant_barcode_per_tenant UNIQUE (tenant_id, barcode),
    
    -- Data integrity constraints
    CONSTRAINT check_variant_prices_non_negative CHECK (
      cost_price IS NULL OR cost_price >= 0 AND
      selling_price IS NULL OR selling_price >= 0
    ),
    CONSTRAINT check_variant_weight_non_negative CHECK (weight IS NULL OR weight >= 0),
    CONSTRAINT check_variant_sort_order_non_negative CHECK (sort_order >= 0)
  );
`;

// Stock Levels table for multi-location inventory tracking
export const STOCK_LEVELS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    
    -- Stock quantities
    current_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    available_stock INTEGER GENERATED ALWAYS AS (current_stock - reserved_stock) STORED,
    
    -- Cost tracking
    cost_per_unit DECIMAL(15,2) DEFAULT 0,
    total_cost DECIMAL(15,2) GENERATED ALWAYS AS (current_stock * cost_per_unit) STORED,
    
    -- Tracking information
    last_movement_at TIMESTAMP WITH TIME ZONE,
    last_counted_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_levels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Unique constraints - one stock level per product/variant/location combination
    CONSTRAINT unique_stock_per_product_location UNIQUE (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id),
    
    -- Data integrity constraints
    CONSTRAINT check_stock_non_negative CHECK (
      current_stock >= 0 AND reserved_stock >= 0 AND reserved_stock <= current_stock
    ),
    CONSTRAINT check_cost_per_unit_non_negative CHECK (cost_per_unit >= 0)
  );
`;

// Purchase Orders table for supplier orders
export const PURCHASE_ORDERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    po_number VARCHAR(100) NOT NULL,
    supplier_id UUID NOT NULL,
    location_id UUID NOT NULL,
    
    -- Order details
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    received_date TIMESTAMP WITH TIME ZONE,
    completed_date TIMESTAMP WITH TIME ZONE,
    
    -- Financial information
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    shipping_cost DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'shipped', 'partially_received', 'received', 'completed', 'cancelled')),
    
    -- Additional information
    reference_number VARCHAR(100),
    notes TEXT,
    terms_and_conditions TEXT,
    created_by UUID NOT NULL,
    approved_by UUID,
    received_by UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_purchase_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_orders_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_po_number_per_tenant UNIQUE (tenant_id, po_number),
    
    -- Data integrity constraints
    CONSTRAINT check_po_amounts_non_negative CHECK (
      subtotal >= 0 AND tax_amount >= 0 AND shipping_cost >= 0 AND total_amount >= 0
    ),
    CONSTRAINT check_po_dates_logical CHECK (
      expected_delivery_date IS NULL OR expected_delivery_date >= order_date
    )
  );
`;

// Purchase Order Items table for order line items
export const PURCHASE_ORDER_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    
    -- Order quantities
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    
    -- Pricing
    unit_cost DECIMAL(15,2) NOT NULL,
    line_total DECIMAL(15,2) GENERATED ALWAYS AS (ordered_quantity * unit_cost) STORED,
    
    -- Additional information
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_po_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    
    -- Data integrity constraints
    CONSTRAINT check_po_item_quantities_positive CHECK (
      ordered_quantity > 0 AND received_quantity >= 0 AND received_quantity <= ordered_quantity
    ),
    CONSTRAINT check_po_item_unit_cost_positive CHECK (unit_cost > 0)
  );
`;

// Stock Movements table for audit trail
export const STOCK_MOVEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    
    -- Movement details
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment', 'sale', 'purchase', 'return', 'loss', 'audit')),
    movement_reason VARCHAR(100),
    quantity_change INTEGER NOT NULL,
    
    -- Cost information
    cost_per_unit DECIMAL(15,2),
    total_cost DECIMAL(15,2) GENERATED ALWAYS AS (ABS(quantity_change) * COALESCE(cost_per_unit, 0)) STORED,
    
    -- Reference information
    reference_type VARCHAR(50),
    reference_id UUID,
    reference_number VARCHAR(100),
    
    -- Batch and serial tracking
    batch_number VARCHAR(100),
    serial_number VARCHAR(100),
    
    -- Additional information
    notes TEXT,
    created_by UUID NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_movements_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Data integrity constraints
    CONSTRAINT check_movement_quantity_not_zero CHECK (quantity_change != 0),
    CONSTRAINT check_movement_cost_non_negative CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0)
  );
`;

// Stock Audits table for inventory auditing
export const STOCK_AUDITS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    audit_number VARCHAR(100) NOT NULL,
    location_id UUID NOT NULL,
    
    -- Audit scheduling
    planned_date DATE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit details
    audit_type VARCHAR(50) DEFAULT 'full' CHECK (audit_type IN ('full', 'partial', 'cycle', 'spot')),
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    
    -- Results summary
    total_items_counted INTEGER DEFAULT 0,
    total_discrepancies INTEGER DEFAULT 0,
    total_value_adjustment DECIMAL(15,2) DEFAULT 0,
    
    -- Additional information
    notes TEXT,
    conducted_by UUID NOT NULL,
    reviewed_by UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_audits_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_audits_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_audit_number_per_tenant UNIQUE (tenant_id, audit_number),
    
    -- Data integrity constraints
    CONSTRAINT check_audit_counts_non_negative CHECK (
      total_items_counted >= 0 AND total_discrepancies >= 0
    ),
    CONSTRAINT check_audit_dates_logical CHECK (
      started_at IS NULL OR started_at >= planned_date::TIMESTAMP AND
      completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
    )
  );
`;

// Product Serial Numbers table for serialized tracking
export const PRODUCT_SERIAL_NUMBERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_serial_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    serial_number VARCHAR(200) NOT NULL,
    
    -- Manufacturing and quality details
    batch_number VARCHAR(100),
    manufacture_date DATE,
    expiry_date DATE,
    
    -- Cost and procurement
    cost_price DECIMAL(15,2),
    purchase_order_id UUID,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'sold', 'reserved', 'damaged', 'recalled', 'expired')),
    
    -- Sales information
    sold_date TIMESTAMP WITH TIME ZONE,
    customer_id UUID,
    sale_price DECIMAL(15,2),
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_serial_numbers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_serial_number_per_tenant UNIQUE (tenant_id, serial_number),
    
    -- Data integrity constraints
    CONSTRAINT check_serial_cost_non_negative CHECK (cost_price >= 0),
    CONSTRAINT check_expiry_after_manufacture CHECK (
      expiry_date IS NULL OR manufacture_date IS NULL OR expiry_date > manufacture_date
    )
  );
`;

// Low Stock Alerts table for alert configuration
export const LOW_STOCK_ALERTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS low_stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    alert_threshold INTEGER NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_alerted_at TIMESTAMP WITH TIME ZONE,
    alert_frequency_hours INTEGER DEFAULT 24,
    notification_emails TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_low_stock_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_low_stock_alerts_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_low_stock_alerts_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_low_stock_alerts_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Unique constraints - one alert per product/variant/location combination
    CONSTRAINT unique_alert_per_product_location UNIQUE (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id),
    
    -- Data integrity constraints
    CONSTRAINT check_alert_threshold_positive CHECK (alert_threshold > 0),
    CONSTRAINT check_current_stock_non_negative CHECK (current_stock >= 0),
    CONSTRAINT check_alert_frequency_positive CHECK (alert_frequency_hours > 0)
  );
`;

/**
 * Enterprise Customer Relationship Management (CRM) Tables
 * 
 * Comprehensive CRM system for enterprise-level customer management with:
 * - Multi-tier customer hierarchy (companies and contacts)
 * - Advanced interaction tracking and communication history
 * - Flexible customer segmentation and targeting
 * - Multiple address management
 * - Document and note management
 * - Sales pipeline and opportunity tracking
 */

// Enterprise Customers table - Companies and Organizations
export const CUSTOMERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_code VARCHAR(50) NOT NULL,
    
    -- Company Information
    company_name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    industry VARCHAR(100),
    company_size VARCHAR(50) CHECK (company_size IN ('1-10', '11-50', '51-200', '201-1000', '1000+', 'unknown')),
    annual_revenue DECIMAL(15,2),
    website VARCHAR(500),
    tax_id VARCHAR(50),
    
    -- Primary Contact Information
    primary_contact_name VARCHAR(200),
    primary_email VARCHAR(255),
    primary_phone VARCHAR(20),
    
    -- Business Classification
    customer_type VARCHAR(50) DEFAULT 'prospect' CHECK (customer_type IN ('prospect', 'lead', 'customer', 'partner', 'vendor', 'inactive')),
    customer_status VARCHAR(50) DEFAULT 'active' CHECK (customer_status IN ('active', 'inactive', 'blacklisted', 'archived')),
    priority_level VARCHAR(20) DEFAULT 'medium' CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
    customer_tier VARCHAR(20) DEFAULT 'standard' CHECK (customer_tier IN ('bronze', 'silver', 'gold', 'platinum', 'enterprise', 'standard')),
    
    -- Sales Information
    lead_source VARCHAR(100),
    assigned_sales_rep_id UUID,
    territory VARCHAR(100),
    
    -- Financial Information
    credit_limit DECIMAL(15,2) DEFAULT 0,
    payment_terms INTEGER DEFAULT 30, -- Days
    currency_code VARCHAR(3) DEFAULT 'USD',
    
    -- Relationship Tracking
    acquisition_date DATE,
    first_purchase_date DATE,
    last_purchase_date DATE,
    total_purchase_amount DECIMAL(15,2) DEFAULT 0,
    lifetime_value DECIMAL(15,2) DEFAULT 0,
    last_contact_date DATE,
    next_follow_up_date DATE,
    
    -- Communication Preferences
    preferred_communication VARCHAR(20) DEFAULT 'email' CHECK (preferred_communication IN ('email', 'phone', 'sms', 'mail', 'in_person')),
    email_opt_in BOOLEAN DEFAULT true,
    sms_opt_in BOOLEAN DEFAULT false,
    marketing_opt_in BOOLEAN DEFAULT true,
    
    -- Additional Information
    description TEXT,
    notes TEXT,
    tags TEXT[], -- Array of tag names
    custom_fields JSONB DEFAULT '{}'::jsonb,
    social_media JSONB DEFAULT '{}'::jsonb, -- LinkedIn, Twitter, etc.
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_customer_code_per_tenant UNIQUE (tenant_id, customer_code),
    CONSTRAINT unique_company_name_per_tenant UNIQUE (tenant_id, company_name),
    
    -- Data integrity constraints
    CONSTRAINT check_email_format CHECK (primary_email IS NULL OR primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT check_credit_limit_non_negative CHECK (credit_limit >= 0),
    CONSTRAINT check_payment_terms_positive CHECK (payment_terms > 0),
    CONSTRAINT check_purchase_amounts_non_negative CHECK (
      total_purchase_amount >= 0 AND lifetime_value >= 0
    ),
    CONSTRAINT check_annual_revenue_non_negative CHECK (annual_revenue IS NULL OR annual_revenue >= 0)
  );
`;

// Customer Contacts table - Individual contacts within companies
export const CUSTOMER_CONTACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    contact_code VARCHAR(50) NOT NULL,
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(50),
    salutation VARCHAR(20), -- Mr., Ms., Dr., etc.
    
    -- Contact Information
    email VARCHAR(255),
    phone VARCHAR(20),
    mobile VARCHAR(20),
    direct_line VARCHAR(20),
    extension VARCHAR(10),
    
    -- Professional Information
    job_title VARCHAR(150),
    department VARCHAR(100),
    seniority_level VARCHAR(50) CHECK (seniority_level IN ('entry', 'mid', 'senior', 'executive', 'c_level')),
    reports_to_contact_id UUID,
    
    -- Contact Classification
    contact_type VARCHAR(50) DEFAULT 'business' CHECK (contact_type IN ('business', 'technical', 'financial', 'decision_maker', 'influencer', 'user')),
    is_primary BOOLEAN DEFAULT false,
    is_decision_maker BOOLEAN DEFAULT false,
    
    -- Relationship Information
    relationship_strength VARCHAR(20) DEFAULT 'unknown' CHECK (relationship_strength IN ('unknown', 'weak', 'moderate', 'strong', 'champion')),
    last_contact_date DATE,
    next_follow_up_date DATE,
    
    -- Communication Preferences
    preferred_communication VARCHAR(20) DEFAULT 'email' CHECK (preferred_communication IN ('email', 'phone', 'sms', 'linkedin', 'in_person')),
    email_opt_in BOOLEAN DEFAULT true,
    sms_opt_in BOOLEAN DEFAULT false,
    
    -- Personal Notes and Tracking
    personal_interests TEXT,
    communication_notes TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'left_company', 'bounced')),
    
    -- Additional Information
    linkedin_url VARCHAR(500),
    twitter_handle VARCHAR(100),
    custom_fields JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customer_contacts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_contacts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_contacts_reports_to FOREIGN KEY (reports_to_contact_id) REFERENCES customer_contacts(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_contact_code_per_tenant UNIQUE (tenant_id, contact_code),
    CONSTRAINT unique_contact_email_per_customer UNIQUE (customer_id, email),
    
    -- Data integrity constraints
    CONSTRAINT check_contact_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT check_no_self_reporting CHECK (id != reports_to_contact_id)
  );
`;

// Customer Interactions table - Complete communication history
export const CUSTOMER_INTERACTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    contact_id UUID,
    
    -- Interaction Details
    interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('call', 'email', 'meeting', 'demo', 'proposal', 'contract', 'support', 'social', 'event', 'webinar', 'other')),
    subject VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Timing and Duration
    interaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_minutes INTEGER,
    
    -- Participants
    conducted_by UUID NOT NULL, -- Employee who conducted the interaction
    attendees JSONB DEFAULT '[]'::jsonb, -- List of participants
    
    -- Interaction Status and Outcome
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    outcome VARCHAR(50) CHECK (outcome IN ('positive', 'neutral', 'negative', 'follow_up_required', 'closed_won', 'closed_lost')),
    
    -- Follow-up Information
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,
    follow_up_notes TEXT,
    
    -- Sales Pipeline Information
    opportunity_id UUID,
    sales_stage VARCHAR(50),
    deal_value DECIMAL(15,2),
    
    -- Communication Channel Details
    communication_channel VARCHAR(50) CHECK (communication_channel IN ('phone', 'email', 'in_person', 'video_call', 'social_media', 'website', 'chat', 'other')),
    external_reference_id VARCHAR(200), -- Reference to external system (email ID, calendar event, etc.)
    
    -- Content and Attachments
    attachments JSONB DEFAULT '[]'::jsonb,
    recording_url VARCHAR(500),
    transcript TEXT,
    
    -- Marketing and Campaign Tracking
    campaign_id UUID,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- Additional Classification
    tags TEXT[],
    priority_level VARCHAR(20) DEFAULT 'medium' CHECK (priority_level IN ('low', 'medium', 'high', 'urgent')),
    is_private BOOLEAN DEFAULT false,
    
    -- Metadata
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customer_interactions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_interactions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_interactions_contact FOREIGN KEY (contact_id) REFERENCES customer_contacts(id) ON DELETE SET NULL,
    
    -- Data integrity constraints
    CONSTRAINT check_interaction_duration_positive CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT check_deal_value_non_negative CHECK (deal_value IS NULL OR deal_value >= 0),
    CONSTRAINT check_follow_up_date_future CHECK (follow_up_date IS NULL OR follow_up_date >= interaction_date::DATE)
  );
`;

// Customer Segments table - Advanced customer segmentation
export const CUSTOMER_SEGMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    segment_code VARCHAR(50) NOT NULL,
    segment_name VARCHAR(150) NOT NULL,
    description TEXT,
    
    -- Segment Configuration
    segment_type VARCHAR(50) DEFAULT 'manual' CHECK (segment_type IN ('manual', 'dynamic', 'rule_based', 'behavioral', 'demographic')),
    is_active BOOLEAN DEFAULT true,
    
    -- Dynamic Segment Rules (for rule-based segments)
    filter_criteria JSONB DEFAULT '{}'::jsonb,
    sql_query TEXT, -- For complex dynamic segments
    
    -- Behavioral Analysis
    behavior_criteria JSONB DEFAULT '{}'::jsonb,
    time_window_days INTEGER DEFAULT 90,
    
    -- Marketing and Targeting
    target_use_case VARCHAR(100), -- What this segment is used for
    marketing_persona VARCHAR(100),
    
    -- Statistics (updated automatically)
    member_count INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP WITH TIME ZONE,
    calculation_frequency VARCHAR(20) DEFAULT 'daily' CHECK (calculation_frequency IN ('hourly', 'daily', 'weekly', 'monthly', 'manual')),
    
    -- Performance Metrics
    average_lifetime_value DECIMAL(15,2),
    average_purchase_frequency DECIMAL(10,2),
    conversion_rate DECIMAL(5,4),
    
    -- Access Control
    is_public BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    shared_with JSONB DEFAULT '[]'::jsonb, -- Array of user IDs who can access this segment
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customer_segments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_segment_code_per_tenant UNIQUE (tenant_id, segment_code),
    CONSTRAINT unique_segment_name_per_tenant UNIQUE (tenant_id, segment_name),
    
    -- Data integrity constraints
    CONSTRAINT check_member_count_non_negative CHECK (member_count >= 0),
    CONSTRAINT check_time_window_positive CHECK (time_window_days > 0),
    CONSTRAINT check_performance_metrics_valid CHECK (
      average_lifetime_value IS NULL OR average_lifetime_value >= 0 AND
      average_purchase_frequency IS NULL OR average_purchase_frequency >= 0 AND
      conversion_rate IS NULL OR (conversion_rate >= 0 AND conversion_rate <= 1)
    )
  );
`;

// Customer Segment Memberships table - Many-to-many relationship
export const CUSTOMER_SEGMENT_MEMBERSHIPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_segment_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    segment_id UUID NOT NULL,
    
    -- Membership Details
    added_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    added_by VARCHAR(50) DEFAULT 'system' CHECK (added_by IN ('system', 'manual', 'import', 'api')),
    
    -- Status and Validity
    is_active BOOLEAN DEFAULT true,
    membership_score DECIMAL(5,2), -- How well this customer fits the segment (0-100)
    
    -- Tracking
    last_evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    evaluation_count INTEGER DEFAULT 1,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_segment_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_segment_memberships_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_segment_memberships_segment FOREIGN KEY (segment_id) REFERENCES customer_segments(id) ON DELETE CASCADE,
    
    -- Unique constraints - one membership per customer per segment
    CONSTRAINT unique_customer_segment_membership UNIQUE (tenant_id, customer_id, segment_id),
    
    -- Data integrity constraints
    CONSTRAINT check_membership_score_valid CHECK (membership_score IS NULL OR (membership_score >= 0 AND membership_score <= 100)),
    CONSTRAINT check_evaluation_count_positive CHECK (evaluation_count > 0)
  );
`;

// Customer Addresses table - Multiple addresses per customer
export const CUSTOMER_ADDRESSES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    contact_id UUID, -- Optional: specific contact this address belongs to
    
    -- Address Classification
    address_type VARCHAR(50) NOT NULL CHECK (address_type IN ('billing', 'shipping', 'mailing', 'office', 'warehouse', 'home', 'other')),
    address_label VARCHAR(100), -- Custom label like "Main Office", "West Coast Branch"
    
    -- Address Information
    address_line_1 VARCHAR(200) NOT NULL,
    address_line_2 VARCHAR(200),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) NOT NULL,
    
    -- Geographic Information
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    timezone VARCHAR(50),
    
    -- Status and Preferences
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_date TIMESTAMP WITH TIME ZONE,
    
    -- Delivery and Shipping Information
    delivery_instructions TEXT,
    access_codes VARCHAR(100),
    contact_person VARCHAR(200),
    contact_phone VARCHAR(20),
    
    -- Business Hours (for office addresses)
    business_hours JSONB DEFAULT '{}'::jsonb,
    
    -- Additional Information
    notes TEXT,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customer_addresses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_addresses_contact FOREIGN KEY (contact_id) REFERENCES customer_contacts(id) ON DELETE SET NULL,
    
    -- Data integrity constraints
    CONSTRAINT check_coordinates_valid CHECK (
      (latitude IS NULL AND longitude IS NULL) OR 
      (latitude IS NOT NULL AND longitude IS NOT NULL AND 
       latitude >= -90 AND latitude <= 90 AND 
       longitude >= -180 AND longitude <= 180)
    )
  );
`;

// Customer Notes table - Internal notes and comments
export const CUSTOMER_NOTES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    contact_id UUID, -- Optional: note specific to a contact
    interaction_id UUID, -- Optional: note related to a specific interaction
    
    -- Note Content
    title VARCHAR(200),
    content TEXT NOT NULL,
    note_type VARCHAR(50) DEFAULT 'general' CHECK (note_type IN ('general', 'sales', 'support', 'billing', 'technical', 'personal', 'warning', 'opportunity')),
    
    -- Categorization and Organization
    category VARCHAR(100),
    tags TEXT[],
    priority_level VARCHAR(20) DEFAULT 'normal' CHECK (priority_level IN ('low', 'normal', 'high', 'critical')),
    
    -- Visibility and Access Control
    is_private BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    visible_to_roles TEXT[], -- Array of role names that can see this note
    
    -- Follow-up and Reminders
    is_reminder BOOLEAN DEFAULT false,
    reminder_date TIMESTAMP WITH TIME ZONE,
    reminder_sent BOOLEAN DEFAULT false,
    
    -- Status and Workflow
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    is_actionable BOOLEAN DEFAULT false,
    action_required_by DATE,
    action_completed BOOLEAN DEFAULT false,
    
    -- Authoring and Modification
    created_by UUID NOT NULL,
    updated_by UUID,
    last_viewed_by UUID,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customer_notes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_notes_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_notes_contact FOREIGN KEY (contact_id) REFERENCES customer_contacts(id) ON DELETE SET NULL,
    CONSTRAINT fk_customer_notes_interaction FOREIGN KEY (interaction_id) REFERENCES customer_interactions(id) ON DELETE SET NULL,
    
    -- Data integrity constraints
    CONSTRAINT check_reminder_date_future CHECK (reminder_date IS NULL OR reminder_date > created_at),
    CONSTRAINT check_action_date_future CHECK (action_required_by IS NULL OR action_required_by >= created_at::DATE)
  );
`;

// Customer Documents table - File attachments and document management
export const CUSTOMER_DOCUMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    contact_id UUID, -- Optional: document specific to a contact
    interaction_id UUID, -- Optional: document from a specific interaction
    
    -- Document Information
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(100) NOT NULL CHECK (document_type IN ('contract', 'proposal', 'invoice', 'receipt', 'nda', 'sow', 'presentation', 'specification', 'manual', 'certificate', 'license', 'other')),
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    file_extension VARCHAR(10),
    mime_type VARCHAR(100),
    
    -- Storage Information
    storage_path VARCHAR(500) NOT NULL,
    storage_provider VARCHAR(50) DEFAULT 'local' CHECK (storage_provider IN ('local', 's3', 'gcs', 'azure', 'cloudinary')),
    file_hash VARCHAR(128), -- For integrity checking
    
    -- Document Metadata
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0',
    document_date DATE,
    expiry_date DATE,
    
    -- Categorization
    category VARCHAR(100),
    tags TEXT[],
    
    -- Access Control and Security
    is_confidential BOOLEAN DEFAULT false,
    access_level VARCHAR(20) DEFAULT 'internal' CHECK (access_level IN ('public', 'internal', 'restricted', 'confidential')),
    password_protected BOOLEAN DEFAULT false,
    
    -- Status and Workflow
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'expired', 'deleted')),
    approval_status VARCHAR(20) DEFAULT 'none' CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected')),
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Tracking and Analytics
    download_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    last_accessed_by UUID,
    
    -- Relationships
    parent_document_id UUID, -- For document versions
    replaces_document_id UUID, -- For document replacements
    
    -- Additional Information
    custom_fields JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_customer_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_documents_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_documents_contact FOREIGN KEY (contact_id) REFERENCES customer_contacts(id) ON DELETE SET NULL,
    CONSTRAINT fk_customer_documents_interaction FOREIGN KEY (interaction_id) REFERENCES customer_interactions(id) ON DELETE SET NULL,
    CONSTRAINT fk_customer_documents_parent FOREIGN KEY (parent_document_id) REFERENCES customer_documents(id) ON DELETE SET NULL,
    CONSTRAINT fk_customer_documents_replaces FOREIGN KEY (replaces_document_id) REFERENCES customer_documents(id) ON DELETE SET NULL,
    
    -- Data integrity constraints
    CONSTRAINT check_file_size_positive CHECK (file_size > 0),
    CONSTRAINT check_download_count_non_negative CHECK (download_count >= 0),
    CONSTRAINT check_expiry_after_document_date CHECK (expiry_date IS NULL OR document_date IS NULL OR expiry_date > document_date),
    CONSTRAINT check_no_self_reference CHECK (id != parent_document_id AND id != replaces_document_id)
  );
`;

/**
 * User Management and Authentication Tables
 */

// Users table for authentication and user management
export const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Personal information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    avatar_url VARCHAR(500),
    
    -- Account status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Authentication details
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Password management
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    requires_password_change BOOLEAN DEFAULT false,
    
    -- Two-factor authentication
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(100),
    backup_codes TEXT[],
    
    -- Preferences and settings
    timezone VARCHAR(100) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'en',
    theme VARCHAR(20) DEFAULT 'light',
    preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Additional information
    phone VARCHAR(20),
    bio TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Data integrity constraints
    CONSTRAINT check_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT check_login_count_non_negative CHECK (login_count >= 0),
    CONSTRAINT check_failed_attempts_non_negative CHECK (failed_login_attempts >= 0)
  );
`;

// Roles table for role-based access control
export const ROLES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    role_code VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Role hierarchy and permissions
    role_level INTEGER NOT NULL DEFAULT 1,
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Permissions configuration
    permissions JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_role_name_per_tenant UNIQUE (tenant_id, role_name),
    
    -- Data integrity constraints
    CONSTRAINT check_role_level_positive CHECK (role_level > 0)
  );
`;

// User-Tenant associations with roles
export const USER_TENANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    role_id UUID NOT NULL,
    
    -- Membership details
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_access_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,
    
    -- Permissions and restrictions
    custom_permissions JSONB DEFAULT '[]'::jsonb,
    restrictions JSONB DEFAULT '{}'::jsonb,
    
    -- Additional information
    invitation_token VARCHAR(255),
    invitation_expires_at TIMESTAMP WITH TIME ZONE,
    invited_by UUID,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_user_tenants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_tenants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_tenants_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    
    -- Unique constraints - one active membership per user per tenant
    CONSTRAINT unique_user_tenant_membership UNIQUE (user_id, tenant_id),
    
    -- Data integrity constraints
    CONSTRAINT check_access_count_non_negative CHECK (access_count >= 0)
  );
`;

/**
 * Human Resource Management (HRM) Tables
 */

// Employees table for comprehensive HR management
export const EMPLOYEES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    employee_code VARCHAR(50) NOT NULL,
    
    -- Personal information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    mobile VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'other')),
    
    -- Address information
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    
    -- Emergency contact
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    
    -- Employment information
    employee_type VARCHAR(50) DEFAULT 'full_time' CHECK (employee_type IN ('full_time', 'part_time', 'contract', 'intern', 'consultant')),
    department VARCHAR(100),
    position_title VARCHAR(100),
    hire_date DATE NOT NULL,
    termination_date DATE,
    employment_status VARCHAR(20) DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive', 'terminated', 'suspended', 'on_leave')),
    
    -- Compensation
    base_salary DECIMAL(15,2),
    hourly_rate DECIMAL(10,2),
    commission_rate DECIMAL(5,4),
    overtime_rate DECIMAL(10,2),
    
    -- Work schedule
    work_schedule VARCHAR(50) DEFAULT 'standard',
    work_hours_per_week DECIMAL(5,2) DEFAULT 40.00,
    
    -- Additional information
    skills TEXT[],
    certifications JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    profile_picture_url VARCHAR(500),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_employee_code_per_tenant UNIQUE (tenant_id, employee_code),
    CONSTRAINT unique_employee_email_per_tenant UNIQUE (tenant_id, email),
    
    -- Data integrity constraints
    CONSTRAINT check_hire_before_termination CHECK (
      termination_date IS NULL OR hire_date <= termination_date
    ),
    CONSTRAINT check_rates_non_negative CHECK (
      base_salary IS NULL OR base_salary >= 0 AND
      hourly_rate IS NULL OR hourly_rate >= 0 AND
      overtime_rate IS NULL OR overtime_rate >= 0 AND
      commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1)
    ),
    CONSTRAINT check_work_hours_positive CHECK (work_hours_per_week > 0)
  );
`;

// Attendance Records for time tracking
export const ATTENDANCE_RECORDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    
    -- Date and shift information
    attendance_date DATE NOT NULL,
    shift_type VARCHAR(50) DEFAULT 'regular',
    scheduled_start_time TIME,
    scheduled_end_time TIME,
    
    -- Actual time tracking
    actual_start_time TIMESTAMP WITH TIME ZONE,
    actual_end_time TIMESTAMP WITH TIME ZONE,
    break_start_time TIMESTAMP WITH TIME ZONE,
    break_end_time TIMESTAMP WITH TIME ZONE,
    
    -- Calculated hours
    scheduled_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    break_hours DECIMAL(5,2) DEFAULT 0,
    
    -- Attendance status
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'half_day', 'sick', 'vacation', 'holiday', 'unpaid_leave')),
    is_overtime BOOLEAN DEFAULT false,
    
    -- Location tracking
    clock_in_location VARCHAR(200),
    clock_out_location VARCHAR(200),
    
    -- Additional information
    notes TEXT,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_attendance_records_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_records_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Unique constraints - one record per employee per date
    CONSTRAINT unique_attendance_per_employee_date UNIQUE (tenant_id, employee_id, attendance_date),
    
    -- Data integrity constraints
    CONSTRAINT check_hours_non_negative CHECK (
      scheduled_hours IS NULL OR scheduled_hours >= 0 AND
      actual_hours IS NULL OR actual_hours >= 0 AND
      overtime_hours >= 0 AND break_hours >= 0
    ),
    CONSTRAINT check_time_sequence CHECK (
      actual_start_time IS NULL OR actual_end_time IS NULL OR actual_start_time <= actual_end_time
    )
  );
`;

// Time Clock Entries for detailed time tracking
export const TIME_CLOCK_ENTRIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS time_clock_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    
    -- Clock entry details
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
    entry_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Location and device information
    location VARCHAR(200),
    ip_address INET,
    device_info JSONB DEFAULT '{}'::jsonb,
    gps_coordinates POINT,
    
    -- Verification and approval
    is_manual_entry BOOLEAN DEFAULT false,
    manual_entry_reason TEXT,
    verified_by UUID,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Photo verification (if enabled)
    photo_url VARCHAR(500),
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_time_clock_entries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_time_clock_entries_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );
`;

// Sales Commissions for employee commission tracking
export const SALES_COMMISSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sales_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    
    -- Sale details
    sale_date TIMESTAMP WITH TIME ZONE NOT NULL,
    gross_sale_amount DECIMAL(15,2) NOT NULL,
    net_sale_amount DECIMAL(15,2) NOT NULL,
    
    -- Commission calculation
    commission_rate DECIMAL(5,4) NOT NULL,
    commission_amount DECIMAL(15,2) NOT NULL,
    commission_type VARCHAR(50) DEFAULT 'sales' CHECK (commission_type IN ('sales', 'bonus', 'override', 'team', 'target')),
    
    -- Commission status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    calculated_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_date TIMESTAMP WITH TIME ZONE,
    paid_date TIMESTAMP WITH TIME ZONE,
    
    -- Payment information
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_sales_commissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints - prevent duplicate commission calculations
    CONSTRAINT unique_commission_per_transaction UNIQUE (tenant_id, employee_id, transaction_id),
    
    -- Data integrity constraints
    CONSTRAINT check_amounts_positive CHECK (
      gross_sale_amount >= 0 AND net_sale_amount >= 0 AND commission_amount >= 0
    ),
    CONSTRAINT check_commission_rate_valid CHECK (commission_rate >= 0 AND commission_rate <= 1),
    CONSTRAINT check_date_sequence CHECK (
      approved_date IS NULL OR approved_date >= calculated_date
    )
  );
`;

// Purchase History for customer transaction tracking
export const PURCHASE_HISTORY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    
    -- Purchase details
    purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    net_amount DECIMAL(15,2) NOT NULL,
    
    -- Transaction details
    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
    currency_code VARCHAR(3) DEFAULT 'USD',
    
    -- Location and staff
    location_id UUID,
    served_by_employee_id UUID,
    
    -- Items purchased (JSON array of items)
    items JSONB DEFAULT '[]'::jsonb,
    
    -- Additional information
    notes TEXT,
    receipt_url VARCHAR(500),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_purchase_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_history_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_history_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_purchase_history_employee FOREIGN KEY (served_by_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    
    -- Unique constraints
    CONSTRAINT unique_transaction_id_per_tenant UNIQUE (tenant_id, transaction_id),
    
    -- Data integrity constraints
    CONSTRAINT check_purchase_amounts_non_negative CHECK (
      total_amount >= 0 AND tax_amount >= 0 AND discount_amount >= 0 AND net_amount >= 0
    )
  );
`;

// Communication Logs for customer interaction tracking
export const COMMUNICATION_LOGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    
    -- Communication details
    communication_type VARCHAR(50) NOT NULL CHECK (communication_type IN ('email', 'phone', 'sms', 'meeting', 'chat', 'social', 'mail', 'other')),
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject VARCHAR(200),
    content TEXT,
    
    -- Timing
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    communication_status VARCHAR(20) DEFAULT 'sent' CHECK (communication_status IN ('draft', 'sent', 'delivered', 'read', 'failed', 'bounced')),
    
    -- Participants
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    cc_addresses TEXT[],
    bcc_addresses TEXT[],
    
    -- Campaign and tracking
    campaign_id UUID,
    is_automated BOOLEAN DEFAULT false,
    template_id UUID,
    
    -- Engagement tracking
    click_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    
    -- Additional information
    attachments JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_communication_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_communication_logs_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Data integrity constraints
    CONSTRAINT check_engagement_counts_non_negative CHECK (
      click_count >= 0 AND open_count >= 0
    )
  );
`;

// Performance indexes for all tables
export const ALL_INDEXES_SQL = `
  -- Partner Management Indexes
  CREATE INDEX IF NOT EXISTS idx_partner_levels_tenant_id ON partner_levels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_status ON partner_levels(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_order ON partner_levels(tenant_id, level_order);

  CREATE INDEX IF NOT EXISTS idx_partners_tenant_id ON partners(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partners_level_id ON partners(partner_level_id);
  CREATE INDEX IF NOT EXISTS idx_partners_sponsor_id ON partners(sponsor_id);
  CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(tenant_id, email);

  CREATE INDEX IF NOT EXISTS idx_partner_relations_tenant_id ON partner_relations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_parent ON partner_relations(parent_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_child ON partner_relations(child_partner_id);

  CREATE INDEX IF NOT EXISTS idx_partner_applications_tenant_id ON partner_applications(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(tenant_id, application_status);

  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_id ON partner_commissions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_beneficiary ON partner_commissions(beneficiary_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_payout_status ON partner_commissions(tenant_id, payout_status);

  -- Inventory Management Indexes
  CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id ON product_categories(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_locations_tenant_id ON locations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_tenant_id ON inventory_products(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_sku ON inventory_products(sku);
  CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id ON product_variants(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_tenant_id ON stock_levels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_product_location ON stock_levels(tenant_id, product_id, location_id);

  -- CRM Indexes
  CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(tenant_id, primary_email);
  CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(tenant_id, customer_status);
  CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(tenant_id, customer_type);
  CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(tenant_id, company_name);
  CREATE INDEX IF NOT EXISTS idx_customers_sales_rep ON customers(assigned_sales_rep_id);

  CREATE INDEX IF NOT EXISTS idx_customer_contacts_tenant_id ON customer_contacts(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(customer_id, email);
  CREATE INDEX IF NOT EXISTS idx_customer_contacts_primary ON customer_contacts(customer_id, is_primary);

  CREATE INDEX IF NOT EXISTS idx_customer_interactions_tenant_id ON customer_interactions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_interactions_contact ON customer_interactions(contact_id);
  CREATE INDEX IF NOT EXISTS idx_customer_interactions_date ON customer_interactions(interaction_date);
  CREATE INDEX IF NOT EXISTS idx_customer_interactions_type ON customer_interactions(tenant_id, interaction_type);

  CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant_id ON customer_segments(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customer_segments_active ON customer_segments(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_customer_segments_type ON customer_segments(tenant_id, segment_type);

  CREATE INDEX IF NOT EXISTS idx_segment_memberships_tenant_id ON customer_segment_memberships(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_segment_memberships_customer ON customer_segment_memberships(customer_id);
  CREATE INDEX IF NOT EXISTS idx_segment_memberships_segment ON customer_segment_memberships(segment_id);

  CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant_id ON customer_addresses(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_addresses_type ON customer_addresses(customer_id, address_type);

  CREATE INDEX IF NOT EXISTS idx_customer_notes_tenant_id ON customer_notes(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_notes_type ON customer_notes(tenant_id, note_type);

  CREATE INDEX IF NOT EXISTS idx_customer_documents_tenant_id ON customer_documents(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_documents_type ON customer_documents(tenant_id, document_type);

  -- User Management Indexes
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

  CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_roles_active ON roles(tenant_id, is_active);

  CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_user_tenants_role ON user_tenants(role_id);

  -- HR Management Indexes
  CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(tenant_id, employment_status);

  CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_id ON attendance_records(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_records_employee ON attendance_records(employee_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(attendance_date);

  CREATE INDEX IF NOT EXISTS idx_time_clock_entries_tenant_id ON time_clock_entries(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_time_clock_entries_employee ON time_clock_entries(employee_id);
  CREATE INDEX IF NOT EXISTS idx_time_clock_entries_timestamp ON time_clock_entries(entry_timestamp);

  CREATE INDEX IF NOT EXISTS idx_sales_commissions_tenant_id ON sales_commissions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_sales_commissions_employee ON sales_commissions(employee_id);
  CREATE INDEX IF NOT EXISTS idx_sales_commissions_status ON sales_commissions(tenant_id, status);

  CREATE INDEX IF NOT EXISTS idx_purchase_history_tenant_id ON purchase_history(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_history_customer ON purchase_history(customer_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_history_date ON purchase_history(purchase_date);

  CREATE INDEX IF NOT EXISTS idx_communication_logs_tenant_id ON communication_logs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_communication_logs_customer ON communication_logs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_communication_logs_type ON communication_logs(tenant_id, communication_type);
`;

// Automatic triggers for updated_at timestamps
export const ALL_TRIGGERS_SQL = `
  -- Create triggers for updated_at columns
  CREATE TRIGGER trigger_update_partner_levels_updated_at BEFORE UPDATE ON partner_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_partners_updated_at BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_partner_relations_updated_at BEFORE UPDATE ON partner_relations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_partner_applications_updated_at BEFORE UPDATE ON partner_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_partner_commissions_updated_at BEFORE UPDATE ON partner_commissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_product_categories_updated_at BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_inventory_products_updated_at BEFORE UPDATE ON inventory_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_product_variants_updated_at BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_stock_levels_updated_at BEFORE UPDATE ON stock_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_contacts_updated_at BEFORE UPDATE ON customer_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_interactions_updated_at BEFORE UPDATE ON customer_interactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_segments_updated_at BEFORE UPDATE ON customer_segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_segment_memberships_updated_at BEFORE UPDATE ON customer_segment_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_notes_updated_at BEFORE UPDATE ON customer_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_customer_documents_updated_at BEFORE UPDATE ON customer_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_user_tenants_updated_at BEFORE UPDATE ON user_tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_time_clock_entries_updated_at BEFORE UPDATE ON time_clock_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_sales_commissions_updated_at BEFORE UPDATE ON sales_commissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_purchase_history_updated_at BEFORE UPDATE ON purchase_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER trigger_update_communication_logs_updated_at BEFORE UPDATE ON communication_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// Aggregate collections for easy deployment
export const ALL_PARTNER_TABLES_SQL = [
  PARTNER_LEVELS_TABLE_SQL,
  PARTNERS_TABLE_SQL,
  PARTNER_RELATIONS_TABLE_SQL,
  PARTNER_APPLICATIONS_TABLE_SQL,
  PARTNER_COMMISSIONS_TABLE_SQL
].join('\n\n');

export const ALL_INVENTORY_TABLES_SQL = [
  PRODUCT_CATEGORIES_TABLE_SQL,
  SUPPLIERS_TABLE_SQL,
  LOCATIONS_TABLE_SQL,
  INVENTORY_PRODUCTS_TABLE_SQL,
  PRODUCT_VARIANTS_TABLE_SQL,
  STOCK_LEVELS_TABLE_SQL,
  PURCHASE_ORDERS_TABLE_SQL,
  PURCHASE_ORDER_ITEMS_TABLE_SQL,
  STOCK_MOVEMENTS_TABLE_SQL,
  STOCK_AUDITS_TABLE_SQL,
  PRODUCT_SERIAL_NUMBERS_TABLE_SQL,
  LOW_STOCK_ALERTS_TABLE_SQL
].join('\n\n');

export const ALL_CRM_TABLES_SQL = [
  CUSTOMERS_TABLE_SQL,
  CUSTOMER_CONTACTS_TABLE_SQL,
  CUSTOMER_INTERACTIONS_TABLE_SQL,
  CUSTOMER_SEGMENTS_TABLE_SQL,
  CUSTOMER_SEGMENT_MEMBERSHIPS_TABLE_SQL,
  CUSTOMER_ADDRESSES_TABLE_SQL,
  CUSTOMER_NOTES_TABLE_SQL,
  CUSTOMER_DOCUMENTS_TABLE_SQL
].join('\n\n');

export const ALL_USER_TABLES_SQL = [
  USERS_TABLE_SQL,
  ROLES_TABLE_SQL,
  USER_TENANTS_TABLE_SQL
].join('\n\n');

export const ALL_HR_TABLES_SQL = [
  EMPLOYEES_TABLE_SQL,
  ATTENDANCE_RECORDS_TABLE_SQL,
  TIME_CLOCK_ENTRIES_TABLE_SQL,
  SALES_COMMISSIONS_TABLE_SQL,
  PURCHASE_HISTORY_TABLE_SQL,
  COMMUNICATION_LOGS_TABLE_SQL
].join('\n\n');

// Complete system schema aggregation
export const ALL_SYSTEM_TABLES_SQL = [
  TENANTS_TABLE_SQL,
  ALL_PARTNER_TABLES_SQL,
  ALL_INVENTORY_TABLES_SQL,
  ALL_CRM_TABLES_SQL,
  ALL_USER_TABLES_SQL,
  ALL_HR_TABLES_SQL
].join('\n\n');

export const ALL_SYSTEM_INDEXES_SQL = ALL_INDEXES_SQL;
export const ALL_SYSTEM_TRIGGERS_SQL = ALL_TRIGGERS_SQL;