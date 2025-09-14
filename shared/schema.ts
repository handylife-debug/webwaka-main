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
  PARTNER_APPLICATIONS_TABLE_SQL
].join('\n\n');

export const ALL_PARTNER_INDEXES_SQL = [
  PARTNER_LEVELS_INDEXES_SQL,
  PARTNERS_INDEXES_SQL,
  PARTNER_RELATIONS_INDEXES_SQL,
  PARTNER_APPLICATIONS_INDEXES_SQL
].join('\n\n');

export const ALL_PARTNER_TRIGGERS_SQL = [
  UPDATED_AT_TRIGGER_FUNCTION_SQL,
  PARTNER_LEVELS_TRIGGERS_SQL,
  PARTNERS_TRIGGERS_SQL,
  PARTNER_RELATIONS_TRIGGERS_SQL,
  PARTNER_APPLICATIONS_TRIGGERS_SQL,
  PARTNER_COMMISSION_RATE_TRIGGER_SQL
].join('\n\n');