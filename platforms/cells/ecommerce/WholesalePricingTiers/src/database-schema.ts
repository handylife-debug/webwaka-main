/**
 * WholesalePricingTiers Cell Database Schema
 * CELLULAR REUSABILITY: Extends existing database structures without duplication
 * Nigerian Market Focus: Naira pricing, territorial adjustments, seasonal campaigns
 */

export const INIT_WHOLESALE_PRICING_SCHEMA = `
-- ===================================================================
-- WHOLESALE PRICING TIERS TABLES - Extending existing infrastructure
-- ===================================================================

-- 1. Wholesale Pricing Tiers Table
-- Defines quantity-based pricing rules extending TaxAndFee calculation logic
CREATE TABLE IF NOT EXISTS wholesale_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Product and Group Association (REUSES B2BAccessControl group structure)
  product_id UUID,
  category_id UUID,
  group_id UUID, -- References b2b_user_groups from B2BAccessControl
  
  -- Tier Configuration
  tier_name VARCHAR(100) NOT NULL,
  tier_description TEXT,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER, -- NULL means unlimited
  
  -- Discount Configuration
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed_price')),
  discount_value DECIMAL(10,4) NOT NULL,
  
  -- Nigerian Market Features
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  territory VARCHAR(50), -- Lagos, Abuja, etc.
  
  -- Payment Terms Integration (EXTENDS TaxAndFee logic)
  payment_terms VARCHAR(30) NOT NULL DEFAULT 'net_30' CHECK (payment_terms IN ('immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60')),
  payment_terms_discount DECIMAL(5,4) DEFAULT 0.0000,
  
  -- Validity and Status
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  
  -- Business Logic Fields
  minimum_order_value DECIMAL(12,2),
  maximum_order_value DECIMAL(12,2),
  stackable BOOLEAN NOT NULL DEFAULT false, -- Can combine with other discounts
  priority INTEGER NOT NULL DEFAULT 100, -- Lower number = higher priority
  
  -- Nigerian Business Compliance
  vat_applicable BOOLEAN NOT NULL DEFAULT true,
  withholding_tax_applicable BOOLEAN NOT NULL DEFAULT false,
  business_registration_required BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata for Advanced Features
  metadata JSONB DEFAULT '{}'::jsonb, -- Stores additional configuration like seasonal adjustments
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_wholesale_tiers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_wholesale_tiers_group FOREIGN KEY (group_id) REFERENCES b2b_user_groups(id) ON DELETE CASCADE,
  
  -- Business Logic Constraints
  CONSTRAINT unique_wholesale_tier UNIQUE (tenant_id, product_id, category_id, group_id, min_quantity, territory, payment_terms),
  
  -- Data Integrity Checks
  CONSTRAINT check_quantity_logic CHECK (min_quantity >= 1 AND (max_quantity IS NULL OR max_quantity >= min_quantity)),
  CONSTRAINT check_discount_value_positive CHECK (discount_value >= 0),
  CONSTRAINT check_payment_discount_range CHECK (payment_terms_discount >= 0 AND payment_terms_discount <= 0.5),
  CONSTRAINT check_order_value_logic CHECK (minimum_order_value IS NULL OR maximum_order_value IS NULL OR maximum_order_value >= minimum_order_value),
  CONSTRAINT check_priority_range CHECK (priority >= 1 AND priority <= 1000)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_tenant ON wholesale_pricing_tiers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_product ON wholesale_pricing_tiers(product_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_category ON wholesale_pricing_tiers(category_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_group ON wholesale_pricing_tiers(group_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_territory ON wholesale_pricing_tiers(territory);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_active ON wholesale_pricing_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_effective ON wholesale_pricing_tiers(effective_date);
CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_priority ON wholesale_pricing_tiers(tenant_id, priority);

-- 2. Territory Pricing Adjustments Table
-- Regional pricing multipliers extending TaxAndFee regional logic
CREATE TABLE IF NOT EXISTS territory_pricing_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Territory Configuration
  territory VARCHAR(50) NOT NULL,
  territory_display_name VARCHAR(100) NOT NULL,
  
  -- Pricing Adjustments
  price_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  shipping_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  tax_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000, -- EXTENDS TaxAndFee
  
  -- Nigerian Market Features
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  local_tax_rate DECIMAL(5,4) DEFAULT 0.0750, -- 7.5% VAT
  state_code VARCHAR(10),
  economic_zone VARCHAR(30), -- North, South-East, South-South, etc.
  
  -- Operational Details
  supported_payment_methods JSONB DEFAULT '["bank_transfer", "pos", "mobile_money"]'::jsonb,
  delivery_days INTEGER NOT NULL DEFAULT 3,
  minimum_order_free_shipping DECIMAL(10,2),
  
  -- Status and Validity
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Special territory considerations
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_territory_adjustments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Unique Constraints
  CONSTRAINT unique_territory_adjustment UNIQUE (tenant_id, territory),
  
  -- Data Integrity
  CONSTRAINT check_multipliers_positive CHECK (price_multiplier > 0 AND shipping_multiplier > 0 AND tax_multiplier > 0),
  CONSTRAINT check_local_tax_rate CHECK (local_tax_rate >= 0 AND local_tax_rate <= 1),
  CONSTRAINT check_delivery_days_positive CHECK (delivery_days > 0)
);

-- Indexes for Territory Pricing Adjustments
CREATE INDEX IF NOT EXISTS idx_territory_adjustments_tenant ON territory_pricing_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_territory_adjustments_territory ON territory_pricing_adjustments(territory);
CREATE INDEX IF NOT EXISTS idx_territory_adjustments_active ON territory_pricing_adjustments(is_active);
CREATE INDEX IF NOT EXISTS idx_territory_adjustments_state ON territory_pricing_adjustments(state_code);

-- 3. Pricing Performance Analytics Table
-- Tracks pricing effectiveness and margins extending SalesEngine analytics
CREATE TABLE IF NOT EXISTS pricing_performance_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Reference Data
  tier_id UUID, -- References wholesale_pricing_tiers
  product_id UUID NOT NULL,
  group_id UUID,
  territory VARCHAR(50),
  
  -- Time Period
  analytics_date TIMESTAMP WITH TIME ZONE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  
  -- Sales Metrics
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  total_revenue DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  average_order_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  
  -- Pricing Metrics
  average_discount DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
  total_savings_provided DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  profit_margin DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
  
  -- Customer Metrics
  unique_customers INTEGER NOT NULL DEFAULT 0,
  repeat_customers INTEGER NOT NULL DEFAULT 0,
  customer_acquisition_cost DECIMAL(10,2),
  
  -- Performance Indicators
  conversion_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
  competitiveness_score DECIMAL(5,2), -- 1-100
  customer_satisfaction_score DECIMAL(5,2), -- 1-10
  
  -- Nigerian Market Specific
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  vat_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  withholding_tax_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Additional Data
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional metrics and context
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_pricing_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pricing_analytics_tier FOREIGN KEY (tier_id) REFERENCES wholesale_pricing_tiers(id) ON DELETE CASCADE,
  CONSTRAINT fk_pricing_analytics_group FOREIGN KEY (group_id) REFERENCES b2b_user_groups(id) ON DELETE SET NULL,
  
  -- Unique Constraints
  CONSTRAINT unique_pricing_analytics UNIQUE (tenant_id, tier_id, product_id, analytics_date, period_type),
  
  -- Data Integrity
  CONSTRAINT check_metrics_non_negative CHECK (
    total_orders >= 0 AND total_quantity >= 0 AND total_revenue >= 0 AND 
    unique_customers >= 0 AND repeat_customers >= 0 AND repeat_customers <= unique_customers
  ),
  CONSTRAINT check_rates_valid CHECK (
    conversion_rate >= 0 AND conversion_rate <= 1 AND
    (competitiveness_score IS NULL OR (competitiveness_score >= 1 AND competitiveness_score <= 100)) AND
    (customer_satisfaction_score IS NULL OR (customer_satisfaction_score >= 1 AND customer_satisfaction_score <= 10))
  )
);

-- Indexes for Pricing Performance Analytics
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_tenant ON pricing_performance_analytics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_tier ON pricing_performance_analytics(tier_id);
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_product ON pricing_performance_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_date ON pricing_performance_analytics(analytics_date);
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_territory ON pricing_performance_analytics(territory);
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_period ON pricing_performance_analytics(tenant_id, period_type, analytics_date DESC);

-- 4. Competitive Pricing Intelligence Table
-- Market intelligence and competitive analysis for pricing optimization
CREATE TABLE IF NOT EXISTS competitive_pricing_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Product Reference
  product_id UUID NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(100),
  
  -- Competitor Information
  competitor_name VARCHAR(255) NOT NULL,
  competitor_type VARCHAR(50) NOT NULL CHECK (competitor_type IN ('direct', 'indirect', 'substitute', 'online', 'offline')),
  
  -- Pricing Data
  competitor_price DECIMAL(12,2) NOT NULL,
  our_price DECIMAL(12,2) NOT NULL,
  price_difference DECIMAL(12,2) NOT NULL,
  price_advantage DECIMAL(8,4) NOT NULL, -- % advantage
  
  -- Market Position
  market_share DECIMAL(5,2), -- Estimated %
  quality_score DECIMAL(5,2), -- 1-10
  brand_strength DECIMAL(5,2), -- 1-10
  
  -- Geographic and Temporal Context
  territory VARCHAR(50),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  price_date TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Intelligence Sources
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('manual', 'scraping', 'market_research', 'customer_feedback', 'mystery_shopping')),
  source_reliability DECIMAL(3,2) NOT NULL DEFAULT 1.00, -- 0-1
  source_url TEXT,
  
  -- Analysis Results
  recommended_action VARCHAR(50) CHECK (recommended_action IN ('increase', 'decrease', 'maintain', 'monitor', 'investigate')),
  price_optimization_score DECIMAL(5,2),
  
  -- Status and Validity
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_review_date TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Additional Context
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional competitive intelligence
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_competitive_intel_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Unique Constraints
  CONSTRAINT unique_competitive_intelligence UNIQUE (tenant_id, product_id, competitor_name, territory, price_date),
  
  -- Data Integrity
  CONSTRAINT check_prices_positive CHECK (competitor_price > 0 AND our_price > 0),
  CONSTRAINT check_source_reliability CHECK (source_reliability >= 0 AND source_reliability <= 1),
  CONSTRAINT check_scores_valid CHECK (
    (market_share IS NULL OR (market_share >= 0 AND market_share <= 100)) AND
    (quality_score IS NULL OR (quality_score >= 1 AND quality_score <= 10)) AND
    (brand_strength IS NULL OR (brand_strength >= 1 AND brand_strength <= 10)) AND
    (price_optimization_score IS NULL OR (price_optimization_score >= 1 AND price_optimization_score <= 100))
  )
);

-- Indexes for Competitive Pricing Intelligence
CREATE INDEX IF NOT EXISTS idx_competitive_intel_tenant ON competitive_pricing_intelligence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_competitive_intel_product ON competitive_pricing_intelligence(product_id);
CREATE INDEX IF NOT EXISTS idx_competitive_intel_competitor ON competitive_pricing_intelligence(competitor_name);
CREATE INDEX IF NOT EXISTS idx_competitive_intel_territory ON competitive_pricing_intelligence(territory);
CREATE INDEX IF NOT EXISTS idx_competitive_intel_date ON competitive_pricing_intelligence(price_date DESC);
CREATE INDEX IF NOT EXISTS idx_competitive_intel_active ON competitive_pricing_intelligence(is_active);

-- 5. Seasonal Pricing Calendar Table  
-- Manages time-based pricing adjustments and promotional periods
CREATE TABLE IF NOT EXISTS seasonal_pricing_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Season Definition
  season_name VARCHAR(100) NOT NULL,
  season_type VARCHAR(30) NOT NULL CHECK (season_type IN ('holiday', 'weather', 'business', 'cultural', 'economic')),
  
  -- Time Configuration
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern VARCHAR(50), -- yearly, monthly, custom
  
  -- Pricing Adjustments
  price_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  discount_percent DECIMAL(5,4) DEFAULT 0.0000,
  fixed_discount DECIMAL(10,2) DEFAULT 0.00,
  
  -- Applicability
  product_categories JSONB, -- Array of category IDs
  customer_groups JSONB, -- Array of B2B group IDs
  territories JSONB, -- Array of territory codes
  
  -- Nigerian Market Seasonality
  cultural_event VARCHAR(100), -- Eid, Christmas, New Yam Festival, etc.
  economic_factor VARCHAR(100), -- harvest_season, school_resumption, etc.
  weather_pattern VARCHAR(50), -- dry_season, rainy_season, harmattan
  
  -- Business Rules
  minimum_quantity INTEGER DEFAULT 1,
  maximum_quantity INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  stackable_with_other_offers BOOLEAN NOT NULL DEFAULT false,
  
  -- Performance Tracking
  budget_allocation DECIMAL(15,2),
  actual_spend DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  target_sales_increase DECIMAL(5,4),
  actual_sales_increase DECIMAL(5,4),
  
  -- Status and Control
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_apply BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  
  -- Additional Configuration
  metadata JSONB DEFAULT '{}'::jsonb, -- Seasonal campaign details and configurations
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_seasonal_calendar_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_seasonal_calendar_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Unique Constraints
  CONSTRAINT unique_seasonal_calendar UNIQUE (tenant_id, season_name, start_date),
  
  -- Data Integrity
  CONSTRAINT check_date_range CHECK (end_date > start_date),
  CONSTRAINT check_price_multiplier_positive CHECK (price_multiplier > 0),
  CONSTRAINT check_discount_percent_valid CHECK (discount_percent >= 0 AND discount_percent <= 1),
  CONSTRAINT check_quantities_valid CHECK (minimum_quantity >= 1 AND (maximum_quantity IS NULL OR maximum_quantity >= minimum_quantity)),
  CONSTRAINT check_budget_non_negative CHECK (budget_allocation IS NULL OR budget_allocation >= 0),
  CONSTRAINT check_actual_spend_non_negative CHECK (actual_spend >= 0)
);

-- Indexes for Seasonal Pricing Calendar
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_tenant ON seasonal_pricing_calendar(tenant_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_date_range ON seasonal_pricing_calendar(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_season_type ON seasonal_pricing_calendar(season_type);
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_active ON seasonal_pricing_calendar(is_active);
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_recurring ON seasonal_pricing_calendar(recurring);
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_priority ON seasonal_pricing_calendar(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_seasonal_calendar_approval ON seasonal_pricing_calendar(requires_approval, approved_by);

-- ===================================================================
-- CELLULAR REUSABILITY TRIGGERS - Auto-update timestamps
-- ===================================================================

-- Update timestamp trigger function (reusable across all tables)
CREATE OR REPLACE FUNCTION update_wholesale_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers to all tables
CREATE TRIGGER trigger_wholesale_tiers_timestamp
  BEFORE UPDATE ON wholesale_pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION update_wholesale_pricing_timestamp();

CREATE TRIGGER trigger_territory_adjustments_timestamp
  BEFORE UPDATE ON territory_pricing_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_wholesale_pricing_timestamp();

CREATE TRIGGER trigger_pricing_analytics_timestamp
  BEFORE UPDATE ON pricing_performance_analytics
  FOR EACH ROW EXECUTE FUNCTION update_wholesale_pricing_timestamp();

CREATE TRIGGER trigger_competitive_intel_timestamp
  BEFORE UPDATE ON competitive_pricing_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_wholesale_pricing_timestamp();

CREATE TRIGGER trigger_seasonal_calendar_timestamp
  BEFORE UPDATE ON seasonal_pricing_calendar
  FOR EACH ROW EXECUTE FUNCTION update_wholesale_pricing_timestamp();
`;

// Helper function to initialize the database schema
export const initWholesalePricingSchema = async (db: any): Promise<void> => {
  try {
    await db.query(INIT_WHOLESALE_PRICING_SCHEMA);
    console.log('✅ Wholesale Pricing Tiers schema initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Wholesale Pricing Tiers schema:', error);
    throw error;
  }
};

// Export schema metadata for integration with other cells
export const WHOLESALE_PRICING_TABLES = {
  wholesale_pricing_tiers: 'wholesale_pricing_tiers',
  territory_pricing_adjustments: 'territory_pricing_adjustments',
  pricing_performance_analytics: 'pricing_performance_analytics',
  competitive_pricing_intelligence: 'competitive_pricing_intelligence',
  seasonal_pricing_calendar: 'seasonal_pricing_calendar'
} as const;

// Export type definitions for TypeScript integration
export interface WholesalePricingTier {
  id: string;
  tenant_id: string;
  product_id?: string;
  category_id?: string;
  group_id?: string;
  tier_name: string;
  tier_description?: string;
  min_quantity: number;
  max_quantity?: number;
  discount_type: 'percentage' | 'fixed_amount' | 'fixed_price';
  discount_value: number;
  currency: string;
  territory?: string;
  payment_terms: string;
  payment_terms_discount: number;
  effective_date: Date;
  expiry_date?: Date;
  is_active: boolean;
  minimum_order_value?: number;
  maximum_order_value?: number;
  stackable: boolean;
  priority: number;
  vat_applicable: boolean;
  withholding_tax_applicable: boolean;
  business_registration_required: boolean;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface TerritoryPricingAdjustment {
  id: string;
  tenant_id: string;
  territory: string;
  territory_display_name: string;
  price_multiplier: number;
  shipping_multiplier: number;
  tax_multiplier: number;
  currency: string;
  local_tax_rate: number;
  state_code?: string;
  economic_zone?: string;
  supported_payment_methods: string[];
  delivery_days: number;
  minimum_order_free_shipping?: number;
  is_active: boolean;
  effective_date: Date;
  expiry_date?: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}