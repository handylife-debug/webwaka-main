/**
 * B2BAccessControl Cell Database Schema
 * CELLULAR REUSABILITY: Extends existing users, roles, and user_tenants tables
 * Nigerian Market Focus: Naira pricing, SMS notifications, local regulations
 */

export const INIT_B2B_ACCESS_CONTROL_SCHEMA = `
-- ===================================================================
-- B2B ACCESS CONTROL TABLES - Extending existing auth infrastructure
-- ===================================================================

-- B2B User Groups - Extends existing role system for wholesale/retail groupings
CREATE TABLE IF NOT EXISTS b2b_user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  group_code VARCHAR(50) NOT NULL,
  description TEXT,
  
  -- Group Configuration
  group_type VARCHAR(20) NOT NULL DEFAULT 'retail' CHECK (group_type IN ('wholesale', 'retail', 'vip', 'employee', 'guest', 'distributor', 'reseller')),
  group_tier INTEGER DEFAULT 1, -- Hierarchy level for nested groups
  parent_group_id UUID, -- For group hierarchies
  
  -- Price Visibility Controls (Nigerian Market)
  price_visibility VARCHAR(20) NOT NULL DEFAULT 'visible' CHECK (price_visibility IN ('hidden', 'visible', 'partial', 'request_quote')),
  hide_price_text VARCHAR(200) DEFAULT 'Price available on request',
  login_prompt_text VARCHAR(200) DEFAULT 'Please log in to view prices',
  guest_message TEXT DEFAULT 'Contact us for wholesale pricing in Naira (₦)',
  
  -- Category Access Controls
  allowed_categories UUID[], -- Array of category IDs this group can access
  restricted_categories UUID[], -- Array of category IDs this group cannot access
  category_access_type VARCHAR(20) DEFAULT 'whitelist' CHECK (category_access_type IN ('whitelist', 'blacklist', 'unrestricted')),
  
  -- Nigerian Market Features
  currency_preference VARCHAR(5) DEFAULT 'NGN',
  min_order_amount DECIMAL(15,2) DEFAULT 0,
  credit_limit DECIMAL(15,2) DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 0, -- Net payment terms
  requires_approval BOOLEAN DEFAULT false,
  
  -- Group Status and Metadata
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  priority_level INTEGER DEFAULT 5, -- 1-10, higher = more privileges
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_b2b_groups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_groups_parent FOREIGN KEY (parent_group_id) REFERENCES b2b_user_groups(id) ON DELETE SET NULL,
  
  -- Unique Constraints
  CONSTRAINT unique_group_name_per_tenant UNIQUE (tenant_id, group_name),
  CONSTRAINT unique_group_code_per_tenant UNIQUE (tenant_id, group_code),
  
  -- Data Integrity
  CONSTRAINT check_min_order_amount_non_negative CHECK (min_order_amount >= 0),
  CONSTRAINT check_credit_limit_non_negative CHECK (credit_limit >= 0),
  CONSTRAINT check_payment_terms_non_negative CHECK (payment_terms_days >= 0),
  CONSTRAINT check_priority_range CHECK (priority_level >= 1 AND priority_level <= 10),
  CONSTRAINT check_no_self_parent CHECK (id != parent_group_id)
);

-- Indexes for B2B Groups
CREATE INDEX IF NOT EXISTS idx_b2b_groups_tenant ON b2b_user_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_b2b_groups_type ON b2b_user_groups(tenant_id, group_type);
CREATE INDEX IF NOT EXISTS idx_b2b_groups_status ON b2b_user_groups(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_b2b_groups_parent ON b2b_user_groups(parent_group_id);

-- B2B Group Memberships - Links users to B2B groups (extends user_tenants)
CREATE TABLE IF NOT EXISTS b2b_group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  group_id UUID NOT NULL,
  
  -- Membership Details
  membership_status VARCHAR(20) DEFAULT 'active' CHECK (membership_status IN ('active', 'pending', 'suspended', 'expired', 'revoked')),
  membership_type VARCHAR(20) DEFAULT 'regular' CHECK (membership_type IN ('regular', 'trial', 'premium', 'lifetime')),
  
  -- Membership Validity (Nigerian business cycles)
  effective_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  auto_renewal BOOLEAN DEFAULT true,
  renewal_period_months INTEGER DEFAULT 12,
  
  -- Override Settings (specific to this user in this group)
  price_visibility_override VARCHAR(20) CHECK (price_visibility_override IN ('hidden', 'visible', 'partial', 'request_quote')),
  credit_limit_override DECIMAL(15,2),
  discount_percentage DECIMAL(5,2) DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  
  -- Nigerian Market Customizations
  preferred_currency VARCHAR(5) DEFAULT 'NGN',
  sales_rep_id UUID, -- Assigned sales representative
  territory VARCHAR(100), -- Nigerian state/region
  business_registration VARCHAR(100), -- CAC registration number
  tax_identification VARCHAR(50), -- Nigerian tax ID
  
  -- Approval Workflow
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,
  
  -- Multi-tenant Constraints  
  CONSTRAINT fk_b2b_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_memberships_group FOREIGN KEY (group_id) REFERENCES b2b_user_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_memberships_sales_rep FOREIGN KEY (sales_rep_id) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Unique Constraints
  CONSTRAINT unique_user_group_membership UNIQUE (tenant_id, user_id, group_id),
  
  -- Data Integrity
  CONSTRAINT check_effective_before_expiry CHECK (expiry_date IS NULL OR effective_date <= expiry_date),
  CONSTRAINT check_renewal_period_positive CHECK (renewal_period_months > 0),
  CONSTRAINT check_credit_override_non_negative CHECK (credit_limit_override IS NULL OR credit_limit_override >= 0)
);

-- Indexes for Group Memberships
CREATE INDEX IF NOT EXISTS idx_b2b_memberships_tenant ON b2b_group_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_b2b_memberships_user ON b2b_group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_b2b_memberships_group ON b2b_group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_b2b_memberships_status ON b2b_group_memberships(tenant_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_b2b_memberships_sales_rep ON b2b_group_memberships(sales_rep_id);

-- Category Access Rules - Fine-grained category restrictions
CREATE TABLE IF NOT EXISTS b2b_category_access_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Rule Target (can apply to groups, individual users, or globally)
  group_id UUID,
  user_id UUID,
  rule_scope VARCHAR(20) DEFAULT 'group' CHECK (rule_scope IN ('group', 'user', 'global')),
  
  -- Category Restrictions
  category_id UUID NOT NULL,
  access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('allow', 'deny', 'request_approval')),
  
  -- Access Conditions
  minimum_order_value DECIMAL(15,2) DEFAULT 0,
  maximum_order_quantity INTEGER,
  time_restrictions JSONB DEFAULT '{}'::jsonb, -- Business hours, days of week
  
  -- Nigerian Market Compliance
  requires_license BOOLEAN DEFAULT false,
  license_verification_required BOOLEAN DEFAULT false,
  age_verification_required BOOLEAN DEFAULT false,
  
  -- Rule Metadata
  rule_name VARCHAR(100),
  description TEXT,
  priority INTEGER DEFAULT 5, -- Higher priority rules take precedence
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_b2b_category_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_category_rules_group FOREIGN KEY (group_id) REFERENCES b2b_user_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_category_rules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- Data Integrity
  CONSTRAINT check_category_rules_target CHECK (
    (rule_scope = 'group' AND group_id IS NOT NULL AND user_id IS NULL) OR
    (rule_scope = 'user' AND user_id IS NOT NULL AND group_id IS NULL) OR
    (rule_scope = 'global' AND group_id IS NULL AND user_id IS NULL)
  ),
  CONSTRAINT check_min_order_value_non_negative CHECK (minimum_order_value >= 0),
  CONSTRAINT check_max_quantity_positive CHECK (maximum_order_quantity IS NULL OR maximum_order_quantity > 0),
  CONSTRAINT check_priority_range CHECK (priority >= 1 AND priority <= 10)
);

-- Indexes for Category Access Rules
CREATE INDEX IF NOT EXISTS idx_category_rules_tenant ON b2b_category_access_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_category_rules_category ON b2b_category_access_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_category_rules_group ON b2b_category_access_rules(group_id);
CREATE INDEX IF NOT EXISTS idx_category_rules_user ON b2b_category_access_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_category_rules_priority ON b2b_category_access_rules(tenant_id, priority DESC);

-- B2B Access Audit Log - Track all access attempts and decisions
CREATE TABLE IF NOT EXISTS b2b_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Access Attempt Details
  user_id UUID,
  session_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  
  -- Resource Access
  resource_type VARCHAR(50) NOT NULL, -- 'product', 'category', 'price', 'bulk_action'
  resource_id VARCHAR(100) NOT NULL,
  action_attempted VARCHAR(50) NOT NULL, -- 'view_price', 'view_product', 'add_to_cart', 'purchase'
  
  -- Access Decision
  access_granted BOOLEAN NOT NULL,
  denial_reason VARCHAR(100),
  applied_rule_id UUID,
  group_id UUID, -- Which group's rules were applied
  
  -- Context Information
  request_context JSONB DEFAULT '{}'::jsonb,
  additional_data JSONB DEFAULT '{}'::jsonb,
  
  -- Nigerian Market Tracking
  currency_context VARCHAR(5) DEFAULT 'NGN',
  price_shown DECIMAL(15,2),
  location_context VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_b2b_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_b2b_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_b2b_audit_group FOREIGN KEY (group_id) REFERENCES b2b_user_groups(id) ON DELETE SET NULL,
  CONSTRAINT fk_b2b_audit_rule FOREIGN KEY (applied_rule_id) REFERENCES b2b_category_access_rules(id) ON DELETE SET NULL
);

-- Indexes for Access Audit
CREATE INDEX IF NOT EXISTS idx_b2b_audit_tenant ON b2b_access_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_b2b_audit_user ON b2b_access_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_b2b_audit_resource ON b2b_access_audit(tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_b2b_audit_created_at ON b2b_access_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_audit_denied ON b2b_access_audit(tenant_id, access_granted, created_at DESC) WHERE access_granted = false;

-- Global B2B Settings - Tenant-wide B2B configuration
CREATE TABLE IF NOT EXISTS b2b_global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Global Price Visibility (defaults for all products)
  default_hide_from_guests BOOLEAN DEFAULT false,
  default_hide_price_text VARCHAR(200) DEFAULT 'Login to view prices',
  default_login_prompt_text VARCHAR(200) DEFAULT 'Create an account to access wholesale pricing',
  default_guest_message TEXT DEFAULT 'Contact our sales team for Nigerian wholesale rates',
  
  -- Global Category Access
  guest_allowed_categories UUID[] DEFAULT '{}',
  guest_restricted_categories UUID[] DEFAULT '{}',
  require_approval_categories UUID[] DEFAULT '{}',
  
  -- Nigerian Market Defaults
  default_currency VARCHAR(5) DEFAULT 'NGN',
  default_payment_terms_days INTEGER DEFAULT 30,
  default_credit_limit DECIMAL(15,2) DEFAULT 0,
  vat_rate DECIMAL(5,4) DEFAULT 0.075, -- 7.5% Nigerian VAT
  
  -- B2B Registration Settings
  auto_approve_b2b_registration BOOLEAN DEFAULT false,
  require_business_verification BOOLEAN DEFAULT true,
  require_tax_id BOOLEAN DEFAULT false,
  minimum_order_for_b2b DECIMAL(15,2) DEFAULT 0,
  
  -- Communication Settings
  welcome_email_template TEXT,
  approval_email_template TEXT,
  rejection_email_template TEXT,
  price_request_email_template TEXT,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID NOT NULL,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_b2b_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Unique constraint - one settings record per tenant
  CONSTRAINT unique_b2b_settings_per_tenant UNIQUE (tenant_id),
  
  -- Data Integrity
  CONSTRAINT check_payment_terms_non_negative CHECK (default_payment_terms_days >= 0),
  CONSTRAINT check_credit_limit_non_negative CHECK (default_credit_limit >= 0),
  CONSTRAINT check_vat_rate_valid CHECK (vat_rate >= 0 AND vat_rate <= 1),
  CONSTRAINT check_min_order_non_negative CHECK (minimum_order_for_b2b >= 0)
);

-- Index for Global Settings
CREATE INDEX IF NOT EXISTS idx_b2b_settings_tenant ON b2b_global_settings(tenant_id);

-- Update Triggers for all B2B tables
CREATE TRIGGER update_b2b_groups_updated_at BEFORE UPDATE ON b2b_user_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_b2b_memberships_updated_at BEFORE UPDATE ON b2b_group_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_b2b_category_rules_updated_at BEFORE UPDATE ON b2b_category_access_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_b2b_settings_updated_at BEFORE UPDATE ON b2b_global_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- EXTEND EXISTING PERMISSION SYSTEM WITH B2B PERMISSIONS
-- ===================================================================

-- Add B2B-specific permissions to the standard permissions system
-- These integrate with existing lib/permission-middleware.ts

INSERT INTO roles (id, tenant_id, role_name, description, permissions, is_system_role, created_by)
SELECT 
  gen_random_uuid(),
  t.id as tenant_id,
  'B2B_MANAGER',
  'B2B Access Control Manager - Manages wholesale groups, pricing visibility, and category access',
  '[
    "customers.view", "customers.edit", "customers.communicate",
    "sales.view", "sales.reports", 
    "inventory.view", "inventory.reports",
    "b2b.groups.create", "b2b.groups.edit", "b2b.groups.delete", "b2b.groups.view",
    "b2b.memberships.create", "b2b.memberships.edit", "b2b.memberships.delete", "b2b.memberships.view",
    "b2b.settings.edit", "b2b.settings.view",
    "b2b.reports.view", "b2b.reports.export",
    "b2b.audit.view", "b2b.pricing.manage"
  ]'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000001'::uuid
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roles r 
  WHERE r.tenant_id = t.id AND r.role_name = 'B2B_MANAGER'
);

INSERT INTO roles (id, tenant_id, role_name, description, permissions, is_system_role, created_by)
SELECT 
  gen_random_uuid(),
  t.id as tenant_id,
  'B2B_CUSTOMER',
  'B2B Customer - Wholesale customer with special pricing access',
  '[
    "products.view", "products.purchase",
    "orders.create", "orders.view", "orders.track",
    "quotes.request", "quotes.view",
    "b2b.prices.view", "b2b.bulk.order"
  ]'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000001'::uuid
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roles r 
  WHERE r.tenant_id = t.id AND r.role_name = 'B2B_CUSTOMER'
);

-- Default B2B Groups for new tenants
INSERT INTO b2b_user_groups (
  tenant_id, group_name, group_code, description, group_type,
  price_visibility, hide_price_text, login_prompt_text, guest_message,
  currency_preference, created_by
)
SELECT 
  t.id as tenant_id,
  'Default Wholesale',
  'WHOLESALE_DEFAULT',
  'Default wholesale customer group with Nigerian Naira pricing',
  'wholesale',
  'visible',
  'Wholesale prices available - Login required',
  'Access wholesale rates in Nigerian Naira (₦)',
  'Contact us for bulk pricing and wholesale terms in Nigeria',
  'NGN',
  '00000000-0000-0000-0000-000000000001'::uuid
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM b2b_user_groups g 
  WHERE g.tenant_id = t.id AND g.group_code = 'WHOLESALE_DEFAULT'
);

INSERT INTO b2b_user_groups (
  tenant_id, group_name, group_code, description, group_type,
  price_visibility, hide_price_text, login_prompt_text, guest_message,
  currency_preference, created_by
)
SELECT 
  t.id as tenant_id,
  'Guest Visitors',
  'GUEST_DEFAULT',
  'Default group for non-authenticated visitors',
  'guest',
  'hidden',
  'Login to view prices',
  'Create account for pricing access',
  'Register for wholesale pricing in Nigerian Naira',
  'NGN',
  '00000000-0000-0000-0000-000000000001'::uuid
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM b2b_user_groups g 
  WHERE g.tenant_id = t.id AND g.group_code = 'GUEST_DEFAULT'
);

-- Default Global Settings for all tenants
INSERT INTO b2b_global_settings (
  tenant_id, default_hide_from_guests, default_hide_price_text, 
  default_login_prompt_text, default_guest_message,
  default_currency, vat_rate, updated_by
)
SELECT 
  t.id as tenant_id,
  true,
  'Login to view prices',
  'Create an account to access wholesale pricing',
  'Contact our sales team for Nigerian wholesale rates and bulk discounts',
  'NGN',
  0.075,
  '00000000-0000-0000-0000-000000000001'::uuid
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM b2b_global_settings s 
  WHERE s.tenant_id = t.id
);
`;