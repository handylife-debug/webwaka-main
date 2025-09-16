// Database schema for ProductTypesManager Cell
// Extends existing inventory_products table with advanced product type support

export const PRODUCT_TYPES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    product_type VARCHAR(20) NOT NULL CHECK (
      product_type IN ('simple', 'variable', 'digital', 'bundled', 'classified')
    ),
    type_specific_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Type-specific flags for efficient querying
    has_variations BOOLEAN NOT NULL DEFAULT false,
    has_digital_assets BOOLEAN NOT NULL DEFAULT false,
    has_bundle_items BOOLEAN NOT NULL DEFAULT false,
    has_access_controls BOOLEAN NOT NULL DEFAULT false,
    
    -- Status tracking
    is_active BOOLEAN NOT NULL DEFAULT true,
    validation_status VARCHAR(20) DEFAULT 'valid' CHECK (
      validation_status IN ('valid', 'invalid', 'pending', 'warning')
    ),
    validation_errors JSONB DEFAULT '[]'::jsonb,
    last_validated TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_product_types_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_types_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT unique_product_type_per_tenant UNIQUE (tenant_id, product_id)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_product_types_tenant ON product_types(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_types_product ON product_types(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_types_type ON product_types(product_type);
  CREATE INDEX IF NOT EXISTS idx_product_types_active ON product_types(is_active);
  CREATE INDEX IF NOT EXISTS idx_product_types_flags ON product_types(has_variations, has_digital_assets, has_bundle_items);
  
  -- GIN indexes for JSONB columns
  CREATE INDEX IF NOT EXISTS idx_product_types_specific_data ON product_types USING GIN (type_specific_data);
  CREATE INDEX IF NOT EXISTS idx_product_types_metadata ON product_types USING GIN (metadata);
  
  -- Trigger for automatic updated_at
  DROP TRIGGER IF EXISTS update_product_types_updated_at ON product_types;
  CREATE TRIGGER update_product_types_updated_at BEFORE UPDATE ON product_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_VARIATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    parent_variant_id UUID REFERENCES product_variations(id) ON DELETE CASCADE,
    
    -- Variation attributes (size, color, etc.)
    variation_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    variation_matrix_position VARCHAR(100),
    
    -- Pricing and inventory specific to this variation
    base_price DECIMAL(15,2),
    sale_price DECIMAL(15,2),
    cost_price DECIMAL(15,2),
    weight DECIMAL(10,3),
    dimensions VARCHAR(100),
    
    -- Stock management
    stock_managed BOOLEAN DEFAULT true,
    initial_stock INTEGER DEFAULT 0,
    
    -- Display and ordering
    display_order INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT true,
    
    -- Images and media
    images JSONB DEFAULT '[]'::jsonb,
    featured_image VARCHAR(500),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints  
    CONSTRAINT fk_product_variations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_variations_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT unique_variation_position_per_product UNIQUE (tenant_id, product_id, variation_matrix_position)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_product_variations_tenant ON product_variations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_variations_product ON product_variations(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_variations_enabled ON product_variations(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_product_variations_default ON product_variations(is_default);
  CREATE INDEX IF NOT EXISTS idx_product_variations_order ON product_variations(display_order);
  
  -- GIN indexes for JSONB columns
  CREATE INDEX IF NOT EXISTS idx_product_variations_attributes ON product_variations USING GIN (variation_attributes);
  CREATE INDEX IF NOT EXISTS idx_product_variations_images ON product_variations USING GIN (images);
  
  -- Trigger for automatic updated_at
  DROP TRIGGER IF EXISTS update_product_variations_updated_at ON product_variations;
  CREATE TRIGGER update_product_variations_updated_at BEFORE UPDATE ON product_variations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

export const DIGITAL_ASSETS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS digital_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    
    -- Asset details
    asset_name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    file_type VARCHAR(100) NOT NULL,
    mime_type VARCHAR(100),
    file_hash VARCHAR(256), -- For integrity verification
    
    -- Access controls
    download_limit INTEGER DEFAULT -1, -- -1 means unlimited
    downloads_count INTEGER DEFAULT 0,
    expiry_days INTEGER DEFAULT 365,
    
    -- License and access
    license_type VARCHAR(50) DEFAULT 'single_use' CHECK (
      license_type IN ('single_use', 'multi_use', 'unlimited', 'subscription', 'trial')
    ),
    access_instructions TEXT,
    support_contact VARCHAR(255),
    
    -- Delivery settings
    auto_delivery BOOLEAN DEFAULT true,
    delivery_method VARCHAR(50) DEFAULT 'download' CHECK (
      delivery_method IN ('download', 'email', 'streaming', 'api_access')
    ),
    
    -- Status and validation
    is_active BOOLEAN DEFAULT true,
    is_encrypted BOOLEAN DEFAULT false,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (
      verification_status IN ('pending', 'verified', 'failed', 'expired')
    ),
    last_verified TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_digital_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_digital_assets_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT check_file_size CHECK (file_size >= 0),
    CONSTRAINT check_download_limit CHECK (download_limit >= -1)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_digital_assets_tenant ON digital_assets(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_digital_assets_product ON digital_assets(product_id);
  CREATE INDEX IF NOT EXISTS idx_digital_assets_active ON digital_assets(is_active);
  CREATE INDEX IF NOT EXISTS idx_digital_assets_license ON digital_assets(license_type);
  CREATE INDEX IF NOT EXISTS idx_digital_assets_hash ON digital_assets(file_hash);
  CREATE INDEX IF NOT EXISTS idx_digital_assets_verification ON digital_assets(verification_status);
  
  -- Trigger for automatic updated_at
  DROP TRIGGER IF EXISTS update_digital_assets_updated_at ON digital_assets;
  CREATE TRIGGER update_digital_assets_updated_at BEFORE UPDATE ON digital_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

export const BUNDLE_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS bundle_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bundle_product_id UUID NOT NULL, -- The bundled product
    item_product_id UUID NOT NULL,   -- The individual item in the bundle
    item_variant_id UUID REFERENCES product_variations(id) ON DELETE SET NULL,
    
    -- Bundle configuration
    quantity INTEGER NOT NULL DEFAULT 1,
    is_optional BOOLEAN DEFAULT false,
    is_substitutable BOOLEAN DEFAULT false,
    
    -- Pricing within bundle
    bundle_price DECIMAL(15,2), -- Price of this item within the bundle
    discount_amount DECIMAL(15,2) DEFAULT 0,
    discount_type VARCHAR(20) DEFAULT 'fixed' CHECK (
      discount_type IN ('fixed', 'percentage')
    ),
    
    -- Display and ordering
    display_order INTEGER DEFAULT 0,
    display_label VARCHAR(200),
    description TEXT,
    
    -- Stock considerations
    enforce_stock BOOLEAN DEFAULT true,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_bundle_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_bundle_items_bundle_product FOREIGN KEY (bundle_product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_bundle_items_item_product FOREIGN KEY (item_product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT check_quantity CHECK (quantity > 0),
    CONSTRAINT check_discount_amount CHECK (discount_amount >= 0),
    -- Prevent circular bundles
    CONSTRAINT check_no_self_bundle CHECK (bundle_product_id != item_product_id)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_bundle_items_tenant ON bundle_items(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_product_id);
  CREATE INDEX IF NOT EXISTS idx_bundle_items_item ON bundle_items(item_product_id);
  CREATE INDEX IF NOT EXISTS idx_bundle_items_active ON bundle_items(is_active);
  CREATE INDEX IF NOT EXISTS idx_bundle_items_optional ON bundle_items(is_optional);
  CREATE INDEX IF NOT EXISTS idx_bundle_items_order ON bundle_items(display_order);
  
  -- Trigger for automatic updated_at
  DROP TRIGGER IF EXISTS update_bundle_items_updated_at ON bundle_items;
  CREATE TRIGGER update_bundle_items_updated_at BEFORE UPDATE ON bundle_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_CLASSIFICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    
    -- Classification levels
    classification_level VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (
      classification_level IN ('public', 'restricted', 'confidential', 'top_secret')
    ),
    classification_authority VARCHAR(200),
    classification_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    declassification_date TIMESTAMP WITH TIME ZONE,
    
    -- Compliance requirements
    compliance_standards JSONB DEFAULT '[]'::jsonb,
    certification_requirements JSONB DEFAULT '[]'::jsonb,
    audit_requirements JSONB DEFAULT '[]'::jsonb,
    
    -- Security settings
    encryption_required BOOLEAN DEFAULT false,
    data_retention_days INTEGER DEFAULT 2555, -- ~7 years default
    audit_trail_required BOOLEAN DEFAULT true,
    
    -- Access logging
    access_log_level VARCHAR(20) DEFAULT 'normal' CHECK (
      access_log_level IN ('none', 'basic', 'normal', 'detailed', 'forensic')
    ),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    validation_status VARCHAR(20) DEFAULT 'pending' CHECK (
      validation_status IN ('pending', 'approved', 'rejected', 'expired', 'under_review')
    ),
    validated_by UUID,
    validated_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_product_classifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_classifications_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT unique_classification_per_product UNIQUE (tenant_id, product_id),
    CONSTRAINT check_retention_days CHECK (data_retention_days > 0)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_product_classifications_tenant ON product_classifications(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_classifications_product ON product_classifications(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_classifications_level ON product_classifications(classification_level);
  CREATE INDEX IF NOT EXISTS idx_product_classifications_status ON product_classifications(validation_status);
  CREATE INDEX IF NOT EXISTS idx_product_classifications_active ON product_classifications(is_active);
  
  -- GIN indexes for JSONB columns
  CREATE INDEX IF NOT EXISTS idx_product_classifications_standards ON product_classifications USING GIN (compliance_standards);
  CREATE INDEX IF NOT EXISTS idx_product_classifications_certifications ON product_classifications USING GIN (certification_requirements);
  
  -- Trigger for automatic updated_at
  DROP TRIGGER IF EXISTS update_product_classifications_updated_at ON product_classifications;
  CREATE TRIGGER update_product_classifications_updated_at BEFORE UPDATE ON product_classifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_ACCESS_CONTROLS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_access_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    
    -- Role-based access
    required_roles JSONB DEFAULT '[]'::jsonb,
    required_permissions JSONB DEFAULT '[]'::jsonb,
    
    -- Location restrictions
    allowed_locations JSONB DEFAULT '[]'::jsonb,
    blocked_locations JSONB DEFAULT '[]'::jsonb,
    location_restriction_type VARCHAR(20) DEFAULT 'whitelist' CHECK (
      location_restriction_type IN ('whitelist', 'blacklist', 'none')
    ),
    
    -- Time restrictions
    allowed_time_ranges JSONB DEFAULT '[]'::jsonb, -- Array of {start_time, end_time, days_of_week}
    timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
    
    -- IP and network restrictions  
    allowed_ip_ranges JSONB DEFAULT '[]'::jsonb,
    blocked_ip_ranges JSONB DEFAULT '[]'::jsonb,
    
    -- Device and platform restrictions
    allowed_devices JSONB DEFAULT '[]'::jsonb,
    allowed_platforms JSONB DEFAULT '[]'::jsonb,
    
    -- Session controls
    max_concurrent_sessions INTEGER DEFAULT -1, -- -1 means unlimited
    session_timeout_minutes INTEGER DEFAULT 480, -- 8 hours default
    require_mfa BOOLEAN DEFAULT false,
    
    -- Approval workflows
    requires_approval BOOLEAN DEFAULT false,
    approval_workflow_id VARCHAR(100),
    auto_approve_roles JSONB DEFAULT '[]'::jsonb,
    
    -- Emergency access
    emergency_access_enabled BOOLEAN DEFAULT false,
    emergency_access_roles JSONB DEFAULT '[]'::jsonb,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_product_access_controls_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_access_controls_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT unique_access_control_per_product UNIQUE (tenant_id, product_id),
    CONSTRAINT check_session_timeout CHECK (session_timeout_minutes > 0),
    CONSTRAINT check_max_sessions CHECK (max_concurrent_sessions >= -1)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_tenant ON product_access_controls(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_product ON product_access_controls(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_active ON product_access_controls(is_active);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_effective ON product_access_controls(effective_from, effective_until);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_approval ON product_access_controls(requires_approval);
  
  -- GIN indexes for JSONB arrays
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_roles ON product_access_controls USING GIN (required_roles);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_permissions ON product_access_controls USING GIN (required_permissions);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_locations ON product_access_controls USING GIN (allowed_locations);
  CREATE INDEX IF NOT EXISTS idx_product_access_controls_times ON product_access_controls USING GIN (allowed_time_ranges);
  
  -- Trigger for automatic updated_at
  DROP TRIGGER IF EXISTS update_product_access_controls_updated_at ON product_access_controls;
  CREATE TRIGGER update_product_access_controls_updated_at BEFORE UPDATE ON product_access_controls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// Function to initialize all ProductTypesManager tables
export const INIT_PRODUCT_TYPES_SCHEMA = `
  ${PRODUCT_TYPES_TABLE_SQL}
  ${PRODUCT_VARIATIONS_TABLE_SQL}
  ${DIGITAL_ASSETS_TABLE_SQL}
  ${BUNDLE_ITEMS_TABLE_SQL}
  ${PRODUCT_CLASSIFICATIONS_TABLE_SQL}
  ${PRODUCT_ACCESS_CONTROLS_TABLE_SQL}
`;

// Export individual table creation functions for modular use
export const PRODUCT_TYPES_MANAGER_TABLES = {
  PRODUCT_TYPES: PRODUCT_TYPES_TABLE_SQL,
  PRODUCT_VARIATIONS: PRODUCT_VARIATIONS_TABLE_SQL,
  DIGITAL_ASSETS: DIGITAL_ASSETS_TABLE_SQL,
  BUNDLE_ITEMS: BUNDLE_ITEMS_TABLE_SQL,
  PRODUCT_CLASSIFICATIONS: PRODUCT_CLASSIFICATIONS_TABLE_SQL,
  PRODUCT_ACCESS_CONTROLS: PRODUCT_ACCESS_CONTROLS_TABLE_SQL
};