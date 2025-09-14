/**
 * Partner Management Database Schema
 * 
 * This schema implements a secure, multi-tenant partner management system with:
 * - Proper tenant isolation with tenant_id foreign keys
 * - Comprehensive unique constraints scoped by tenant
 * - Data integrity constraints and business rule validation
 * - Proper foreign key behaviors for data consistency
 * - Automatic timestamp updates via triggers
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

// Indexes for performance optimization
export const PARTNER_LEVELS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partner_levels_tenant_id ON partner_levels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_status ON partner_levels(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_order ON partner_levels(tenant_id, level_order);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_created_at ON partner_levels(created_at);
`;

export const PARTNERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partners_tenant_id ON partners(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partners_level_id ON partners(partner_level_id);
  CREATE INDEX IF NOT EXISTS idx_partners_sponsor_id ON partners(sponsor_id);
  CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_partners_enrollment_date ON partners(enrollment_date);
  CREATE INDEX IF NOT EXISTS idx_partners_last_activity ON partners(last_activity_date);
  CREATE INDEX IF NOT EXISTS idx_partners_created_at ON partners(created_at);
`;

export const PARTNER_RELATIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partner_relations_tenant_id ON partner_relations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_parent ON partner_relations(parent_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_child ON partner_relations(child_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_depth ON partner_relations(tenant_id, depth);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_type ON partner_relations(tenant_id, relationship_type);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_status ON partner_relations(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_path_gin ON partner_relations USING GIN (to_tsvector('english', path));
`;

export const PARTNER_APPLICATIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partner_applications_tenant_id ON partner_applications(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(tenant_id, application_status);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_email ON partner_applications(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_sponsor ON partner_applications(sponsor_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_level ON partner_applications(requested_partner_level_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_date ON partner_applications(application_date);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_reviewed ON partner_applications(reviewed_date);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_created_at ON partner_applications(created_at);
`;

// Triggers for automatic updated_at timestamp updates
export const UPDATED_AT_TRIGGER_FUNCTION_SQL = `
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ language 'plpgsql';
`;

export const PARTNER_LEVELS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partner_levels_updated_at ON partner_levels;
  CREATE TRIGGER trigger_update_partner_levels_updated_at
    BEFORE UPDATE ON partner_levels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PARTNERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partners_updated_at ON partners;
  CREATE TRIGGER trigger_update_partners_updated_at
    BEFORE UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PARTNER_RELATIONS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partner_relations_updated_at ON partner_relations;
  CREATE TRIGGER trigger_update_partner_relations_updated_at
    BEFORE UPDATE ON partner_relations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PARTNER_APPLICATIONS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partner_applications_updated_at ON partner_applications;
  CREATE TRIGGER trigger_update_partner_applications_updated_at
    BEFORE UPDATE ON partner_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
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

export const PARTNER_COMMISSIONS_INDEXES_SQL = `
  -- Performance indexes for partner commissions
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_id ON partner_commissions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_transaction_id ON partner_commissions(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_beneficiary ON partner_commissions(beneficiary_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_source ON partner_commissions(source_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_calculation_status ON partner_commissions(calculation_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_payout_status ON partner_commissions(payout_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_transaction_date ON partner_commissions(transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_calculation_date ON partner_commissions(calculation_date);
  
  -- Critical composite indexes for multi-tenant performance optimization
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_beneficiary ON partner_commissions(tenant_id, beneficiary_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_source ON partner_commissions(tenant_id, source_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_payout_status ON partner_commissions(tenant_id, payout_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_transaction_date ON partner_commissions(tenant_id, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_transaction_id ON partner_commissions(tenant_id, transaction_id);
  
  -- Additional composite indexes for common query patterns
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_beneficiary_status ON partner_commissions(beneficiary_partner_id, payout_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_source_date ON partner_commissions(source_partner_id, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_pending_payouts ON partner_commissions(tenant_id, payout_status, calculation_date) 
    WHERE payout_status = 'pending';
  
  -- Covering indexes for high-performance tenant-scoped queries
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_beneficiary_covering ON partner_commissions(tenant_id, beneficiary_partner_id) 
    INCLUDE (commission_amount, payout_status, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_transaction_covering ON partner_commissions(tenant_id, transaction_id) 
    INCLUDE (beneficiary_partner_id, source_partner_id, commission_amount);
`;

export const PARTNER_COMMISSIONS_TRIGGERS_SQL = `
  -- Security validation function for cross-tenant reference prevention
  CREATE OR REPLACE FUNCTION validate_partner_commissions_tenant_references()
  RETURNS TRIGGER AS $$
  DECLARE
    beneficiary_tenant_id UUID;
    source_tenant_id UUID;
    level_tenant_id UUID;
  BEGIN
    -- Validate beneficiary partner exists and belongs to same tenant
    SELECT tenant_id INTO beneficiary_tenant_id
    FROM partners 
    WHERE id = NEW.beneficiary_partner_id;
    
    IF beneficiary_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Beneficiary partner ID % does not exist', NEW.beneficiary_partner_id;
    END IF;
    
    IF beneficiary_tenant_id != NEW.tenant_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Beneficiary partner % belongs to tenant % but commission is for tenant %', 
        NEW.beneficiary_partner_id, beneficiary_tenant_id, NEW.tenant_id;
    END IF;
    
    -- Validate source partner exists and belongs to same tenant  
    SELECT tenant_id INTO source_tenant_id
    FROM partners 
    WHERE id = NEW.source_partner_id;
    
    IF source_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Source partner ID % does not exist', NEW.source_partner_id;
    END IF;
    
    IF source_tenant_id != NEW.tenant_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Source partner % belongs to tenant % but commission is for tenant %', 
        NEW.source_partner_id, source_tenant_id, NEW.tenant_id;
    END IF;
    
    -- Validate partner level exists and belongs to same tenant
    SELECT tenant_id INTO level_tenant_id
    FROM partner_levels 
    WHERE id = NEW.beneficiary_partner_level_id;
    
    IF level_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Partner level ID % does not exist', NEW.beneficiary_partner_level_id;
    END IF;
    
    IF level_tenant_id != NEW.tenant_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Partner level % belongs to tenant % but commission is for tenant %', 
        NEW.beneficiary_partner_level_id, level_tenant_id, NEW.tenant_id;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  -- Create security validation trigger for INSERT
  DROP TRIGGER IF EXISTS trigger_validate_partner_commissions_tenant_refs_insert ON partner_commissions;
  CREATE TRIGGER trigger_validate_partner_commissions_tenant_refs_insert
    BEFORE INSERT ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION validate_partner_commissions_tenant_references();

  -- Create security validation trigger for UPDATE
  DROP TRIGGER IF EXISTS trigger_validate_partner_commissions_tenant_refs_update ON partner_commissions;
  CREATE TRIGGER trigger_validate_partner_commissions_tenant_refs_update
    BEFORE UPDATE ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION validate_partner_commissions_tenant_references();

  -- Standard updated_at trigger
  DROP TRIGGER IF EXISTS trigger_update_partner_commissions_updated_at ON partner_commissions;
  CREATE TRIGGER trigger_update_partner_commissions_updated_at
    BEFORE UPDATE ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// Additional business logic triggers
export const PARTNER_COMMISSION_RATE_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION validate_partner_commission_rate()
  RETURNS TRIGGER AS $$
  DECLARE
    level_min_rate DECIMAL(5,4);
    level_max_rate DECIMAL(5,4);
  BEGIN
    -- Get the commission rate limits for the partner's level
    SELECT min_commission_rate, max_commission_rate
    INTO level_min_rate, level_max_rate
    FROM partner_levels
    WHERE id = NEW.partner_level_id;
    
    -- If commission rate is not explicitly set, use the default from the level
    IF NEW.commission_rate IS NULL THEN
      SELECT default_commission_rate INTO NEW.commission_rate
      FROM partner_levels
      WHERE id = NEW.partner_level_id;
    END IF;
    
    -- Validate commission rate is within level bounds
    IF NEW.commission_rate < level_min_rate OR NEW.commission_rate > level_max_rate THEN
      RAISE EXCEPTION 'Commission rate %.4f is outside the allowed range [%.4f, %.4f] for this partner level',
        NEW.commission_rate, level_min_rate, level_max_rate;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_validate_partner_commission_rate ON partners;
  CREATE TRIGGER trigger_validate_partner_commission_rate
    BEFORE INSERT OR UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION validate_partner_commission_rate();
`;

// Aggregate table creation SQL
export const ALL_PARTNER_TABLES_SQL = [
  PARTNER_LEVELS_TABLE_SQL,
  PARTNERS_TABLE_SQL,
  PARTNER_RELATIONS_TABLE_SQL,
  PARTNER_APPLICATIONS_TABLE_SQL,
  PARTNER_COMMISSIONS_TABLE_SQL
].join('\n\n');

export const ALL_PARTNER_INDEXES_SQL = [
  PARTNER_LEVELS_INDEXES_SQL,
  PARTNERS_INDEXES_SQL,
  PARTNER_RELATIONS_INDEXES_SQL,
  PARTNER_APPLICATIONS_INDEXES_SQL,
  PARTNER_COMMISSIONS_INDEXES_SQL
].join('\n\n');

export const ALL_PARTNER_TRIGGERS_SQL = [
  UPDATED_AT_TRIGGER_FUNCTION_SQL,
  PARTNER_LEVELS_TRIGGERS_SQL,
  PARTNERS_TRIGGERS_SQL,
  PARTNER_RELATIONS_TRIGGERS_SQL,
  PARTNER_APPLICATIONS_TRIGGERS_SQL,
  PARTNER_COMMISSIONS_TRIGGERS_SQL,
  PARTNER_COMMISSION_RATE_TRIGGER_SQL
].join('\n\n');

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
    CONSTRAINT unique_location_name_per_tenant UNIQUE (tenant_id, location_name)
  );
`;

// Enhanced Products table with full inventory features
export const INVENTORY_PRODUCTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS inventory_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    category_id UUID,
    supplier_id UUID,
    brand VARCHAR(100),
    unit_of_measure VARCHAR(50) DEFAULT 'each',
    cost_price DECIMAL(15,2) DEFAULT 0,
    selling_price DECIMAL(15,2) NOT NULL,
    min_stock_level INTEGER DEFAULT 0,
    max_stock_level INTEGER DEFAULT 1000,
    reorder_point INTEGER DEFAULT 10,
    reorder_quantity INTEGER DEFAULT 50,
    track_serial_numbers BOOLEAN DEFAULT false,
    track_lots BOOLEAN DEFAULT false,
    description TEXT,
    image_url VARCHAR(500),
    weight DECIMAL(10,3),
    dimensions VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_taxable BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_inventory_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_inventory_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_product_code_per_tenant UNIQUE (tenant_id, product_code),
    CONSTRAINT unique_sku_per_tenant UNIQUE (tenant_id, sku),
    CONSTRAINT unique_barcode_per_tenant UNIQUE (tenant_id, barcode),
    
    -- Data integrity constraints
    CONSTRAINT check_prices_non_negative CHECK (cost_price >= 0 AND selling_price >= 0),
    CONSTRAINT check_stock_levels_valid CHECK (
      min_stock_level >= 0 AND 
      max_stock_level >= min_stock_level AND
      reorder_point >= 0 AND 
      reorder_quantity > 0
    ),
    CONSTRAINT check_weight_non_negative CHECK (weight IS NULL OR weight >= 0)
  );
`;

// Product Variants table for size, color, style variations
export const PRODUCT_VARIANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_code VARCHAR(100) NOT NULL,
    variant_name VARCHAR(200) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    variant_type VARCHAR(50) NOT NULL CHECK (variant_type IN ('size', 'color', 'style', 'material', 'flavor', 'other')),
    variant_value VARCHAR(100) NOT NULL,
    cost_price DECIMAL(15,2) DEFAULT 0,
    selling_price DECIMAL(15,2),
    weight DECIMAL(10,3),
    dimensions VARCHAR(100),
    image_url VARCHAR(500),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_product_variants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_variant_code_per_tenant UNIQUE (tenant_id, variant_code),
    CONSTRAINT unique_variant_sku_per_tenant UNIQUE (tenant_id, sku),
    CONSTRAINT unique_variant_barcode_per_tenant UNIQUE (tenant_id, barcode),
    CONSTRAINT unique_variant_type_value_per_product UNIQUE (tenant_id, product_id, variant_type, variant_value),
    
    -- Data integrity constraints
    CONSTRAINT check_variant_prices_non_negative CHECK (cost_price >= 0 AND (selling_price IS NULL OR selling_price >= 0)),
    CONSTRAINT check_variant_weight_non_negative CHECK (weight IS NULL OR weight >= 0)
  );
`;

// Stock levels table for multi-location inventory tracking with generated variant_key
export const STOCK_LEVELS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    variant_key UUID GENERATED ALWAYS AS (COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID)) STORED,
    location_id UUID NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    available_stock INTEGER GENERATED ALWAYS AS (current_stock - reserved_stock) STORED,
    cost_per_unit DECIMAL(15,2) DEFAULT 0,
    last_counted_at TIMESTAMP WITH TIME ZONE,
    last_movement_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_levels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Unique constraints using generated variant_key for proper conflict handling
    CONSTRAINT unique_stock_per_product_location UNIQUE (tenant_id, product_id, variant_key, location_id),
    
    -- Data integrity constraints
    CONSTRAINT check_stock_levels_non_negative CHECK (
      current_stock >= 0 AND 
      reserved_stock >= 0 AND
      reserved_stock <= current_stock
    ),
    CONSTRAINT check_cost_per_unit_non_negative CHECK (cost_per_unit >= 0)
  );
`;

// Purchase Orders table
export const PURCHASE_ORDERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    po_number VARCHAR(100) NOT NULL,
    supplier_id UUID NOT NULL,
    location_id UUID NOT NULL,
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'partial', 'completed', 'cancelled')),
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    shipping_cost DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    payment_terms VARCHAR(100),
    notes TEXT,
    created_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
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
      subtotal >= 0 AND tax_amount >= 0 AND shipping_cost >= 0 AND 
      discount_amount >= 0 AND total_amount >= 0
    ),
    CONSTRAINT check_delivery_dates CHECK (
      expected_delivery_date IS NULL OR expected_delivery_date >= order_date
    ),
    CONSTRAINT check_approval_consistency CHECK (
      (approved_by IS NULL AND approved_at IS NULL) OR
      (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
  );
`;

// Purchase Order Items table
export const PURCHASE_ORDER_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_cost DECIMAL(15,2) NOT NULL,
    line_total DECIMAL(15,2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_po_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    
    -- Unique constraints - one line item per product/variant per PO
    CONSTRAINT unique_po_item_per_product_variant UNIQUE (tenant_id, purchase_order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID)),
    
    -- Data integrity constraints
    CONSTRAINT check_po_item_quantities_positive CHECK (
      quantity_ordered > 0 AND 
      quantity_received >= 0 AND
      quantity_received <= quantity_ordered
    ),
    CONSTRAINT check_po_item_unit_cost_positive CHECK (unit_cost > 0)
  );
`;

// Stock Movements table for tracking all inventory changes
export const STOCK_MOVEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment', 'audit')),
    movement_reason VARCHAR(50) NOT NULL CHECK (movement_reason IN (
      'purchase', 'sale', 'return', 'transfer_in', 'transfer_out', 
      'adjustment_positive', 'adjustment_negative', 'audit_correction', 
      'damaged', 'expired', 'theft', 'promotion', 'sample'
    )),
    quantity_change INTEGER NOT NULL,
    cost_per_unit DECIMAL(15,2) DEFAULT 0,
    reference_type VARCHAR(50),
    reference_id UUID,
    batch_id UUID,
    serial_number VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_movements_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_movements_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Data integrity constraints
    CONSTRAINT check_quantity_change_not_zero CHECK (quantity_change != 0),
    CONSTRAINT check_cost_per_unit_non_negative CHECK (cost_per_unit >= 0),
    CONSTRAINT check_movement_direction CHECK (
      (movement_type = 'in' AND quantity_change > 0) OR
      (movement_type = 'out' AND quantity_change < 0) OR
      (movement_type IN ('transfer', 'adjustment', 'audit'))
    )
  );
`;

// Stock Audits table for audit functionality
export const STOCK_AUDITS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    audit_number VARCHAR(100) NOT NULL,
    location_id UUID NOT NULL,
    audit_type VARCHAR(20) DEFAULT 'full' CHECK (audit_type IN ('full', 'partial', 'cycle')),
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    planned_date DATE DEFAULT CURRENT_DATE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_items_planned INTEGER DEFAULT 0,
    total_items_counted INTEGER DEFAULT 0,
    discrepancy_count INTEGER DEFAULT 0,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_audits_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_audits_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_audit_number_per_tenant UNIQUE (tenant_id, audit_number),
    
    -- Data integrity constraints
    CONSTRAINT check_audit_counts_non_negative CHECK (
      total_items_planned >= 0 AND total_items_counted >= 0 AND discrepancy_count >= 0
    ),
    CONSTRAINT check_audit_date_sequence CHECK (
      started_at IS NULL OR started_at >= planned_date::timestamp
    )
  );
`;

// Product Serial Numbers table for individual item tracking
export const PRODUCT_SERIAL_NUMBERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_serial_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    serial_number VARCHAR(100) NOT NULL,
    batch_number VARCHAR(100),
    manufacture_date DATE,
    expiry_date DATE,
    cost_price DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'damaged', 'expired', 'returned')),
    purchase_order_id UUID,
    transaction_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_serial_numbers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
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

// Indexes for performance optimization

export const PRODUCT_CATEGORIES_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id ON product_categories(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_category_id);
  CREATE INDEX IF NOT EXISTS idx_product_categories_active ON product_categories(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_product_categories_sort_order ON product_categories(tenant_id, sort_order);
`;

export const SUPPLIERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(tenant_id, supplier_name);
  CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);
`;

export const LOCATIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_locations_tenant_id ON locations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(tenant_id, location_type);
  CREATE INDEX IF NOT EXISTS idx_locations_default ON locations(tenant_id, is_default);
`;

export const INVENTORY_PRODUCTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_inventory_products_tenant_id ON inventory_products(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_category ON inventory_products(category_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_supplier ON inventory_products(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_active ON inventory_products(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_brand ON inventory_products(tenant_id, brand);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_barcode ON inventory_products(barcode);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_sku ON inventory_products(sku);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_name_search ON inventory_products USING GIN (to_tsvector('english', product_name));
`;

export const PRODUCT_VARIANTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id ON product_variants(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_product_variants_type ON product_variants(tenant_id, variant_type);
  CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
  CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
`;

export const STOCK_LEVELS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_stock_levels_tenant_id ON stock_levels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_variant ON stock_levels(variant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_location ON stock_levels(location_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_low_stock ON stock_levels(tenant_id, current_stock) WHERE current_stock <= 10;
  CREATE INDEX IF NOT EXISTS idx_stock_levels_product_location ON stock_levels(tenant_id, product_id, location_id);
`;

export const PURCHASE_ORDERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_id ON purchase_orders(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_location ON purchase_orders(location_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(po_number);
`;

export const PURCHASE_ORDER_ITEMS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_po_items_tenant_id ON purchase_order_items(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order ON purchase_order_items(purchase_order_id);
  CREATE INDEX IF NOT EXISTS idx_po_items_product ON purchase_order_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_po_items_variant ON purchase_order_items(variant_id);
`;

export const STOCK_MOVEMENTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id ON stock_movements(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements(location_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(tenant_id, movement_type);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_reason ON stock_movements(tenant_id, movement_reason);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_serial ON stock_movements(serial_number);
`;

export const STOCK_AUDITS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_stock_audits_tenant_id ON stock_audits(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_location ON stock_audits(location_id);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_status ON stock_audits(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_date ON stock_audits(planned_date);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_number ON stock_audits(audit_number);
`;

export const PRODUCT_SERIAL_NUMBERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_tenant_id ON product_serial_numbers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_product ON product_serial_numbers(product_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_variant ON product_serial_numbers(variant_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_location ON product_serial_numbers(location_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_status ON product_serial_numbers(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_batch ON product_serial_numbers(batch_number);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_expiry ON product_serial_numbers(expiry_date);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_po ON product_serial_numbers(purchase_order_id);
`;

export const LOW_STOCK_ALERTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_tenant_id ON low_stock_alerts(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_product ON low_stock_alerts(product_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_variant ON low_stock_alerts(variant_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_location ON low_stock_alerts(location_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_active ON low_stock_alerts(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_triggered ON low_stock_alerts(tenant_id, is_active) WHERE current_stock <= alert_threshold;
`;

// Triggers for automatic updated_at timestamp updates

export const PRODUCT_CATEGORIES_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_product_categories_updated_at ON product_categories;
  CREATE TRIGGER trigger_update_product_categories_updated_at
    BEFORE UPDATE ON product_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const SUPPLIERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_suppliers_updated_at ON suppliers;
  CREATE TRIGGER trigger_update_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const LOCATIONS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_locations_updated_at ON locations;
  CREATE TRIGGER trigger_update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const INVENTORY_PRODUCTS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_inventory_products_updated_at ON inventory_products;
  CREATE TRIGGER trigger_update_inventory_products_updated_at
    BEFORE UPDATE ON inventory_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_VARIANTS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_product_variants_updated_at ON product_variants;
  CREATE TRIGGER trigger_update_product_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const STOCK_LEVELS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_stock_levels_updated_at ON stock_levels;
  CREATE TRIGGER trigger_update_stock_levels_updated_at
    BEFORE UPDATE ON stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PURCHASE_ORDERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_purchase_orders_updated_at ON purchase_orders;
  CREATE TRIGGER trigger_update_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PURCHASE_ORDER_ITEMS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_purchase_order_items_updated_at ON purchase_order_items;
  CREATE TRIGGER trigger_update_purchase_order_items_updated_at
    BEFORE UPDATE ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const STOCK_AUDITS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_stock_audits_updated_at ON stock_audits;
  CREATE TRIGGER trigger_update_stock_audits_updated_at
    BEFORE UPDATE ON stock_audits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_SERIAL_NUMBERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_product_serial_numbers_updated_at ON product_serial_numbers;
  CREATE TRIGGER trigger_update_product_serial_numbers_updated_at
    BEFORE UPDATE ON product_serial_numbers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const LOW_STOCK_ALERTS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_low_stock_alerts_updated_at ON low_stock_alerts;
  CREATE TRIGGER trigger_update_low_stock_alerts_updated_at
    BEFORE UPDATE ON low_stock_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// Business logic triggers for inventory management

// Concurrency-safe stock movement trigger with improved UPSERT safety
export const STOCK_MOVEMENT_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION update_stock_levels_on_movement()
  RETURNS TRIGGER AS $$
  DECLARE
    stock_record RECORD;
    current_stock_val INTEGER;
    alert_record RECORD;
  BEGIN
    -- Use row-level locking to prevent concurrent updates
    SELECT id, current_stock INTO stock_record
    FROM stock_levels
    WHERE tenant_id = NEW.tenant_id
      AND product_id = NEW.product_id
      AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
      AND location_id = NEW.location_id
    FOR UPDATE;
    
    IF FOUND THEN
      -- Calculate new stock level and prevent negative stock
      current_stock_val := stock_record.current_stock + NEW.quantity_change;
      
      -- Prevent negative stock unless it's an adjustment or audit movement
      IF current_stock_val < 0 AND NEW.movement_type NOT IN ('adjustment', 'audit', 'loss') THEN
        RAISE EXCEPTION 'STOCK_INSUFFICIENT: Cannot reduce stock below zero. Current: %, Requested change: %, Product ID: %', 
          stock_record.current_stock, NEW.quantity_change, NEW.product_id;
      END IF;
      
      -- Update existing stock level with atomic operation
      UPDATE stock_levels
      SET current_stock = GREATEST(0, current_stock_val),
          last_movement_at = NEW.created_at,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = stock_record.id;
      
      current_stock_val := GREATEST(0, current_stock_val);
    ELSE
      -- Create new stock level record with improved UPSERT safety
      current_stock_val := GREATEST(0, NEW.quantity_change);
      
      INSERT INTO stock_levels (
        tenant_id, product_id, variant_id, location_id,
        current_stock, cost_per_unit, last_movement_at
      ) VALUES (
        NEW.tenant_id, NEW.product_id, NEW.variant_id, NEW.location_id,
        current_stock_val, COALESCE(NEW.cost_per_unit, 0.00), NEW.created_at
      )
      ON CONFLICT ON CONSTRAINT unique_stock_per_product_location
      DO UPDATE SET
        current_stock = GREATEST(0, stock_levels.current_stock + NEW.quantity_change),
        last_movement_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE NEW.movement_type IN ('adjustment','audit','loss')
         OR stock_levels.current_stock + NEW.quantity_change >= 0
      RETURNING current_stock INTO current_stock_val;
      
      -- Check if the UPSERT succeeded and handle negative stock violations
      IF NOT FOUND THEN
        RAISE EXCEPTION 'STOCK_INSUFFICIENT: Cannot reduce stock below zero. Current: %, Change: %, Product: %', 
          (SELECT current_stock FROM stock_levels 
           WHERE tenant_id = NEW.tenant_id AND product_id = NEW.product_id 
           AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL)) 
           AND location_id = NEW.location_id), 
          NEW.quantity_change, NEW.product_id;
      END IF;
    END IF;
    
    -- Update low stock alerts with row-level locking
    SELECT id, alert_threshold, is_active INTO alert_record
    FROM low_stock_alerts
    WHERE tenant_id = NEW.tenant_id
      AND product_id = NEW.product_id
      AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
      AND location_id = NEW.location_id
    FOR UPDATE;
    
    IF FOUND THEN
      UPDATE low_stock_alerts
      SET current_stock = current_stock_val,
          last_alerted_at = CASE 
            WHEN current_stock_val <= alert_threshold AND is_active = true 
            THEN CURRENT_TIMESTAMP 
            ELSE last_alerted_at 
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = alert_record.id;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_update_stock_on_movement ON stock_movements;
  CREATE TRIGGER trigger_update_stock_on_movement
    AFTER INSERT ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_levels_on_movement();
`;

// Negative stock prevention trigger
export const PREVENT_NEGATIVE_STOCK_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION prevent_negative_stock()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Prevent negative stock unless it's an administrative adjustment
    IF NEW.current_stock < 0 AND TG_OP = 'UPDATE' THEN
      -- Allow negative stock only for specific movement types via context
      IF current_setting('inventory.allow_negative_stock', true) != 'true' THEN
        RAISE EXCEPTION 'NEGATIVE_STOCK_PREVENTED: Stock cannot go below zero. Current attempt: %, Product ID: %', 
          NEW.current_stock, NEW.product_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_prevent_negative_stock ON stock_levels;
  CREATE TRIGGER trigger_prevent_negative_stock
    BEFORE UPDATE ON stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION prevent_negative_stock();
`;

// Purchase order status transition validation trigger
export const PO_STATUS_VALIDATION_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION validate_po_status_transitions()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Validate status transitions are logical
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
      -- Define valid status transitions
      CASE OLD.status
        WHEN 'draft' THEN
          IF NEW.status NOT IN ('pending', 'cancelled') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'pending' THEN
          IF NEW.status NOT IN ('approved', 'cancelled') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'approved' THEN
          IF NEW.status NOT IN ('shipped', 'cancelled') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'shipped' THEN
          IF NEW.status NOT IN ('received', 'partially_received') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'partially_received' THEN
          IF NEW.status NOT IN ('received', 'shipped') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'received' THEN
          IF NEW.status NOT IN ('completed') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'cancelled' THEN
          RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from cancelled to %', NEW.status;
        WHEN 'completed' THEN
          RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from completed to %', NEW.status;
        ELSE
          RAISE EXCEPTION 'INVALID_PO_STATUS: Unknown status %', OLD.status;
      END CASE;
      
      -- Set completion date when status becomes completed
      IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_date = CURRENT_TIMESTAMP;
      END IF;
      
      -- Set received date when status becomes received
      IF NEW.status = 'received' AND OLD.status != 'received' THEN
        NEW.received_date = CURRENT_TIMESTAMP;
      END IF;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_validate_po_status ON purchase_orders;
  CREATE TRIGGER trigger_validate_po_status
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION validate_po_status_transitions();
`;

// Automatic low stock alert trigger
export const LOW_STOCK_ALERT_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION manage_low_stock_alerts()
  RETURNS TRIGGER AS $$
  DECLARE
    alert_exists BOOLEAN := false;
    should_alert BOOLEAN := false;
  BEGIN
    -- Only process when stock level changes
    IF TG_OP = 'UPDATE' AND OLD.current_stock = NEW.current_stock THEN
      RETURN NEW;
    END IF;
    
    -- Check if alert exists for this product/location combination
    SELECT EXISTS(
      SELECT 1 FROM low_stock_alerts 
      WHERE tenant_id = NEW.tenant_id
        AND product_id = NEW.product_id
        AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        AND location_id = NEW.location_id
    ) INTO alert_exists;
    
    -- Get product details to determine alert threshold
    WITH product_info AS (
      SELECT 
        ip.product_name,
        ip.minimum_stock_level,
        COALESCE(pv.variant_name, '') as variant_name
      FROM inventory_products ip
      LEFT JOIN product_variants pv ON pv.id = NEW.variant_id
      WHERE ip.id = NEW.product_id
    )
    SELECT NEW.current_stock <= COALESCE(pi.minimum_stock_level, 10) INTO should_alert
    FROM product_info pi;
    
    IF should_alert AND NOT alert_exists THEN
      -- Create new low stock alert
      INSERT INTO low_stock_alerts (
        tenant_id, product_id, variant_id, location_id,
        alert_threshold, current_stock, is_active,
        last_alerted_at, alert_frequency_hours
      )
      SELECT 
        NEW.tenant_id, NEW.product_id, NEW.variant_id, NEW.location_id,
        COALESCE(ip.minimum_stock_level, 10), NEW.current_stock, true,
        CURRENT_TIMESTAMP, 24
      FROM inventory_products ip
      WHERE ip.id = NEW.product_id
      ON CONFLICT (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id)
      DO UPDATE SET
        current_stock = NEW.current_stock,
        is_active = true,
        last_alerted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
        
    ELSIF alert_exists THEN
      -- Update existing alert
      UPDATE low_stock_alerts
      SET current_stock = NEW.current_stock,
          is_active = should_alert,
          last_alerted_at = CASE 
            WHEN should_alert AND is_active = false THEN CURRENT_TIMESTAMP
            WHEN should_alert THEN last_alerted_at
            ELSE last_alerted_at
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = NEW.tenant_id
        AND product_id = NEW.product_id
        AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        AND location_id = NEW.location_id;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_manage_low_stock_alerts ON stock_levels;
  CREATE TRIGGER trigger_manage_low_stock_alerts
    AFTER INSERT OR UPDATE ON stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION manage_low_stock_alerts();
`;

// Purchase order receipt stock adjustment trigger
export const PO_RECEIPT_STOCK_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION update_stock_on_po_receipt()
  RETURNS TRIGGER AS $$
  DECLARE
    po_record RECORD;
    item_record RECORD;
  BEGIN
    -- Only process when PO status changes to received or partially_received
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('received', 'partially_received') THEN
      
      SELECT tenant_id, location_id INTO po_record
      FROM purchase_orders
      WHERE id = NEW.id;
      
      -- Process all items in the purchase order
      FOR item_record IN 
        SELECT product_id, variant_id, quantity_ordered, quantity_received, cost_per_unit
        FROM purchase_order_items
        WHERE purchase_order_id = NEW.id AND quantity_received > 0
      LOOP
        -- Create stock movement for received items
        INSERT INTO stock_movements (
          tenant_id, product_id, variant_id, location_id,
          movement_type, movement_reason, quantity_change,
          cost_per_unit, reference_type, reference_id,
          notes, created_at
        ) VALUES (
          po_record.tenant_id, item_record.product_id, item_record.variant_id, po_record.location_id,
          'receipt', 'purchase_order_receipt', item_record.quantity_received,
          item_record.cost_per_unit, 'purchase_order', NEW.id,
          'Automatic stock receipt from PO #' || NEW.po_number, CURRENT_TIMESTAMP
        );
      END LOOP;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_update_stock_on_po_receipt ON purchase_orders;
  CREATE TRIGGER trigger_update_stock_on_po_receipt
    AFTER UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_on_po_receipt();
`;

// Consolidated SQL exports for inventory management

export const ALL_INVENTORY_TABLES_SQL = [
  TENANTS_TABLE_SQL,
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

export const ALL_INVENTORY_INDEXES_SQL = [
  PRODUCT_CATEGORIES_INDEXES_SQL,
  SUPPLIERS_INDEXES_SQL,
  LOCATIONS_INDEXES_SQL,
  INVENTORY_PRODUCTS_INDEXES_SQL,
  PRODUCT_VARIANTS_INDEXES_SQL,
  STOCK_LEVELS_INDEXES_SQL,
  PURCHASE_ORDERS_INDEXES_SQL,
  PURCHASE_ORDER_ITEMS_INDEXES_SQL,
  STOCK_MOVEMENTS_INDEXES_SQL,
  STOCK_AUDITS_INDEXES_SQL,
  PRODUCT_SERIAL_NUMBERS_INDEXES_SQL,
  LOW_STOCK_ALERTS_INDEXES_SQL
].join('\n\n');

export const ALL_INVENTORY_TRIGGERS_SQL = [
  UPDATED_AT_TRIGGER_FUNCTION_SQL,
  PRODUCT_CATEGORIES_TRIGGERS_SQL,
  SUPPLIERS_TRIGGERS_SQL,
  LOCATIONS_TRIGGERS_SQL,
  INVENTORY_PRODUCTS_TRIGGERS_SQL,
  PRODUCT_VARIANTS_TRIGGERS_SQL,
  STOCK_LEVELS_TRIGGERS_SQL,
  PURCHASE_ORDERS_TRIGGERS_SQL,
  PURCHASE_ORDER_ITEMS_TRIGGERS_SQL,
  STOCK_AUDITS_TRIGGERS_SQL,
  PRODUCT_SERIAL_NUMBERS_TRIGGERS_SQL,
  LOW_STOCK_ALERTS_TRIGGERS_SQL,
  // Business Logic Triggers for Production-Ready Inventory Management
  STOCK_MOVEMENT_TRIGGER_SQL,
  PREVENT_NEGATIVE_STOCK_TRIGGER_SQL,
  PO_STATUS_VALIDATION_TRIGGER_SQL,
  LOW_STOCK_ALERT_TRIGGER_SQL,
  PO_RECEIPT_STOCK_TRIGGER_SQL
].join('\n\n');

// Comprehensive verification function for inventory business logic
export const VERIFY_INVENTORY_BUSINESS_LOGIC_FUNCTION_SQL = `
  CREATE OR REPLACE FUNCTION verify_inventory_business_logic(
    test_tenant_id UUID DEFAULT gen_random_uuid()
  )
  RETURNS TABLE(
    test_name TEXT,
    status TEXT,
    details TEXT,
    execution_time_ms INTEGER
  ) AS $$
  DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    test_product_id UUID;
    test_variant_id UUID;
    test_location_id UUID;
    test_supplier_id UUID;
    test_category_id UUID;
    test_po_id UUID;
    initial_stock INTEGER;
    updated_stock INTEGER;
    alert_count INTEGER;
    error_caught BOOLEAN;
  BEGIN
    
    -- Test 1: Setup test data
    start_time := clock_timestamp();
    
    -- Create test tenant
    INSERT INTO tenants (id, subdomain, tenant_name) 
    VALUES (test_tenant_id, 'test-inventory-' || extract(epoch from now())::text, 'Test Tenant')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test category
    INSERT INTO product_categories (id, tenant_id, category_name, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Category', true)
    RETURNING id INTO test_category_id;
    
    -- Create test supplier
    INSERT INTO suppliers (id, tenant_id, supplier_name, email, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Supplier', 'test@example.com', true)
    RETURNING id INTO test_supplier_id;
    
    -- Create test location
    INSERT INTO locations (id, tenant_id, location_name, location_type, is_active, is_default)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Warehouse', 'warehouse', true, true)
    RETURNING id INTO test_location_id;
    
    -- Create test product
    INSERT INTO inventory_products (id, tenant_id, product_name, sku, category_id, supplier_id, minimum_stock_level, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Product', 'TEST-001', test_category_id, test_supplier_id, 5, true)
    RETURNING id INTO test_product_id;
    
    -- Create test variant
    INSERT INTO product_variants (id, tenant_id, product_id, variant_name, variant_type, sku, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, test_product_id, 'Test Variant', 'size', 'TEST-001-L', true)
    RETURNING id INTO test_variant_id;
    
    end_time := clock_timestamp();
    RETURN QUERY SELECT 
      'Setup test data'::TEXT,
      'PASSED'::TEXT,
      'Created test tenant, category, supplier, location, product, and variant'::TEXT,
      extract(milliseconds from (end_time - start_time))::INTEGER;
    
    -- Test 2: Stock movement creates stock level record
    start_time := clock_timestamp();
    BEGIN
      INSERT INTO stock_movements (
        tenant_id, product_id, variant_id, location_id,
        movement_type, movement_reason, quantity_change, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        'receipt', 'initial_stock', 100, 10.50
      );
      
      SELECT current_stock INTO initial_stock
      FROM stock_levels
      WHERE tenant_id = test_tenant_id 
        AND product_id = test_product_id
        AND variant_id = test_variant_id 
        AND location_id = test_location_id;
      
      IF initial_stock = 100 THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Stock movement trigger'::TEXT,
          'PASSED'::TEXT,
          format('Stock level correctly created with quantity %s', initial_stock)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Stock movement trigger'::TEXT,
          'FAILED'::TEXT,
          format('Expected stock 100, got %s', COALESCE(initial_stock::TEXT, 'NULL'))::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Stock movement trigger'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Test 3: Low stock alert creation
    start_time := clock_timestamp();
    BEGIN
      -- Reduce stock below minimum threshold (5)
      INSERT INTO stock_movements (
        tenant_id, product_id, variant_id, location_id,
        movement_type, movement_reason, quantity_change, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        'shipment', 'sale', -97, 10.50
      );
      
      SELECT COUNT(*) INTO alert_count
      FROM low_stock_alerts
      WHERE tenant_id = test_tenant_id 
        AND product_id = test_product_id
        AND variant_id = test_variant_id 
        AND location_id = test_location_id
        AND is_active = true;
      
      IF alert_count > 0 THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Low stock alert trigger'::TEXT,
          'PASSED'::TEXT,
          format('Low stock alert created when stock dropped below threshold')::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Low stock alert trigger'::TEXT,
          'FAILED'::TEXT,
          format('Low stock alert not created')::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Low stock alert trigger'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Test 4: Negative stock prevention
    start_time := clock_timestamp();
    BEGIN
      error_caught := false;
      
      -- Try to reduce stock below zero
      INSERT INTO stock_movements (
        tenant_id, product_id, variant_id, location_id,
        movement_type, movement_reason, quantity_change, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        'shipment', 'sale', -10, 10.50
      );
      
      end_time := clock_timestamp();
      RETURN QUERY SELECT 
        'Negative stock prevention'::TEXT,
        'FAILED'::TEXT,
        'Negative stock was allowed when it should have been prevented'::TEXT,
        extract(milliseconds from (end_time - start_time))::INTEGER;
        
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%STOCK_INSUFFICIENT%' THEN
          error_caught := true;
          end_time := clock_timestamp();
          RETURN QUERY SELECT 
            'Negative stock prevention'::TEXT,
            'PASSED'::TEXT,
            'Correctly prevented negative stock with proper error message'::TEXT,
            extract(milliseconds from (end_time - start_time))::INTEGER;
        ELSE
          end_time := clock_timestamp();
          RETURN QUERY SELECT 
            'Negative stock prevention'::TEXT,
            'FAILED'::TEXT,
            format('Unexpected exception: %s', SQLERRM)::TEXT,
            extract(milliseconds from (end_time - start_time))::INTEGER;
        END IF;
    END;
    
    -- Test 5: Purchase order status transitions
    start_time := clock_timestamp();
    BEGIN
      -- Create purchase order
      INSERT INTO purchase_orders (id, tenant_id, supplier_id, location_id, po_number, status)
      VALUES (gen_random_uuid(), test_tenant_id, test_supplier_id, test_location_id, 'PO-TEST-001', 'draft')
      RETURNING id INTO test_po_id;
      
      -- Valid transition: draft -> pending
      UPDATE purchase_orders SET status = 'pending' WHERE id = test_po_id;
      
      -- Valid transition: pending -> approved
      UPDATE purchase_orders SET status = 'approved' WHERE id = test_po_id;
      
      -- Try invalid transition: approved -> completed (should fail)
      error_caught := false;
      BEGIN
        UPDATE purchase_orders SET status = 'completed' WHERE id = test_po_id;
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM LIKE '%INVALID_PO_TRANSITION%' THEN
            error_caught := true;
          END IF;
      END;
      
      IF error_caught THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'PO status validation'::TEXT,
          'PASSED'::TEXT,
          'Correctly prevented invalid status transition'::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'PO status validation'::TEXT,
          'FAILED'::TEXT,
          'Invalid status transition was allowed'::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'PO status validation'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Test 6: Concurrency safety test
    start_time := clock_timestamp();
    BEGIN
      -- This would be better tested with actual concurrent connections
      -- For now, we test the UPSERT functionality
      
      -- Try to create duplicate stock level (should use ON CONFLICT)
      INSERT INTO stock_levels (
        tenant_id, product_id, variant_id, location_id,
        current_stock, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        50, 12.00
      )
      ON CONFLICT (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id)
      DO UPDATE SET current_stock = stock_levels.current_stock + EXCLUDED.current_stock;
      
      SELECT current_stock INTO updated_stock
      FROM stock_levels
      WHERE tenant_id = test_tenant_id 
        AND product_id = test_product_id
        AND variant_id = test_variant_id 
        AND location_id = test_location_id;
      
      -- Should be 3 (from previous test) + 50 = 53
      IF updated_stock = 53 THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Concurrency safety (UPSERT)'::TEXT,
          'PASSED'::TEXT,
          format('UPSERT worked correctly, stock level: %s', updated_stock)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Concurrency safety (UPSERT)'::TEXT,
          'FAILED'::TEXT,
          format('Expected stock 53, got %s', updated_stock)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Concurrency safety (UPSERT)'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Cleanup test data
    start_time := clock_timestamp();
    DELETE FROM low_stock_alerts WHERE tenant_id = test_tenant_id;
    DELETE FROM stock_movements WHERE tenant_id = test_tenant_id;
    DELETE FROM stock_levels WHERE tenant_id = test_tenant_id;
    DELETE FROM purchase_order_items WHERE tenant_id = test_tenant_id;
    DELETE FROM purchase_orders WHERE tenant_id = test_tenant_id;
    DELETE FROM product_serial_numbers WHERE tenant_id = test_tenant_id;
    DELETE FROM product_variants WHERE tenant_id = test_tenant_id;
    DELETE FROM inventory_products WHERE tenant_id = test_tenant_id;
    DELETE FROM locations WHERE tenant_id = test_tenant_id;
    DELETE FROM suppliers WHERE tenant_id = test_tenant_id;
    DELETE FROM product_categories WHERE tenant_id = test_tenant_id;
    DELETE FROM tenants WHERE id = test_tenant_id;
    
    end_time := clock_timestamp();
    RETURN QUERY SELECT 
      'Cleanup test data'::TEXT,
      'PASSED'::TEXT,
      'Test data cleaned up successfully'::TEXT,
      extract(milliseconds from (end_time - start_time))::INTEGER;
      
  END;
  $$ language 'plpgsql';
`;