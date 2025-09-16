// WholesalePricingTiers Database Initialization Route
// Initializes wholesale pricing database tables for production deployment

import { NextRequest, NextResponse } from 'next/server';
import { execute_sql } from '../../../../lib/database';

// Import the comprehensive database schema
const INIT_WHOLESALE_PRICING_SCHEMA = `
-- ===================================================================
-- WHOLESALE PRICING TIERS DATABASE SCHEMA INITIALIZATION
-- 100% CELLULAR REUSABILITY: Extends existing tenant and B2B infrastructure
-- Nigerian Market Focus: NGN pricing, territories, cultural seasonality
-- ===================================================================

-- 1. Wholesale Pricing Tiers Table
-- Defines quantity-based pricing rules extending TaxAndFee calculation logic
CREATE TABLE IF NOT EXISTS wholesale_pricing_tiers (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Product and Group Association (REUSES B2BAccessControl group structure)
  product_id VARCHAR(255),
  category_id VARCHAR(255),
  group_id VARCHAR(255), -- References b2b_user_groups from B2BAccessControl
  
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
  payment_terms VARCHAR(30) NOT NULL DEFAULT 'net_30' CHECK (payment_terms IN ('immediate','net_7','net_15','net_30','net_45','net_60')),
  payment_terms_discount DECIMAL(5,4) DEFAULT 0.0000,
  
  -- Validity and Status
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  
  -- Business Logic Fields
  minimum_order_value DECIMAL(12,2),
  maximum_order_value DECIMAL(12,2),
  stackable BOOLEAN NOT NULL DEFAULT FALSE, -- Can combine with other discounts
  priority INTEGER NOT NULL DEFAULT 100, -- Lower number = higher priority
  
  -- Nigerian Business Compliance
  vat_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  withholding_tax_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  business_registration_required BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadata for Advanced Features
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Business Logic Constraints
  CONSTRAINT wholesale_pricing_tiers_quantity_check CHECK (min_quantity >= 1 AND (max_quantity IS NULL OR max_quantity >= min_quantity)),
  CONSTRAINT wholesale_pricing_tiers_discount_check CHECK (discount_value >= 0),
  CONSTRAINT wholesale_pricing_tiers_payment_discount_check CHECK (payment_terms_discount >= 0 AND payment_terms_discount <= 0.5),
  CONSTRAINT wholesale_pricing_tiers_order_value_check CHECK (minimum_order_value IS NULL OR maximum_order_value IS NULL OR maximum_order_value >= minimum_order_value),
  
  -- Unique constraint to prevent duplicate tiers
  CONSTRAINT wholesale_pricing_tiers_unique UNIQUE (tenant_id, product_id, category_id, group_id, min_quantity, territory, payment_terms)
);

-- Performance Indexes for wholesale_pricing_tiers
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_tenant_idx ON wholesale_pricing_tiers(tenant_id);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_product_idx ON wholesale_pricing_tiers(product_id);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_category_idx ON wholesale_pricing_tiers(category_id);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_group_idx ON wholesale_pricing_tiers(group_id);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_territory_idx ON wholesale_pricing_tiers(territory);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_active_idx ON wholesale_pricing_tiers(is_active);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_effective_idx ON wholesale_pricing_tiers(effective_date);
CREATE INDEX IF NOT EXISTS wholesale_pricing_tiers_priority_idx ON wholesale_pricing_tiers(priority);

-- 2. Territory Pricing Adjustments Table
-- Regional pricing multipliers extending TaxAndFee regional logic
CREATE TABLE IF NOT EXISTS territory_pricing_adjustments (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Territory Configuration
  territory VARCHAR(50) NOT NULL,
  territory_display_name VARCHAR(100) NOT NULL,
  
  -- Pricing Adjustments
  price_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  shipping_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  tax_multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000, -- EXTENDS TaxAndFee
  
  -- Nigerian Market Features
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  local_tax_rate DECIMAL(5,4) DEFAULT 0.075, -- 7.5% VAT
  state_code VARCHAR(10),
  economic_zone VARCHAR(30), -- North, South-East, South-South, etc.
  
  -- Operational Details
  supported_payment_methods JSONB DEFAULT '["bank_transfer", "pos", "mobile_money"]'::jsonb,
  delivery_days INTEGER NOT NULL DEFAULT 3,
  minimum_order_free_shipping DECIMAL(10,2),
  
  -- Status and Validity
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT territory_pricing_adjustments_multiplier_check CHECK (price_multiplier > 0 AND shipping_multiplier > 0 AND tax_multiplier > 0),
  CONSTRAINT territory_pricing_adjustments_unique UNIQUE (tenant_id, territory)
);

-- Performance Indexes for territory_pricing_adjustments
CREATE INDEX IF NOT EXISTS territory_pricing_adjustments_tenant_idx ON territory_pricing_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS territory_pricing_adjustments_territory_idx ON territory_pricing_adjustments(territory);
CREATE INDEX IF NOT EXISTS territory_pricing_adjustments_active_idx ON territory_pricing_adjustments(is_active);

-- 3. Pricing Performance Analytics Table
-- Tracks pricing effectiveness and margins extending SalesEngine analytics
CREATE TABLE IF NOT EXISTS pricing_performance_analytics (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Reference Data
  tier_id INTEGER REFERENCES wholesale_pricing_tiers(id) ON DELETE SET NULL,
  product_id VARCHAR(255) NOT NULL,
  group_id VARCHAR(255),
  territory VARCHAR(50),
  
  -- Time Period
  analytics_date TIMESTAMP WITH TIME ZONE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  
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
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Unique constraint
  CONSTRAINT pricing_performance_analytics_unique UNIQUE (tenant_id, tier_id, product_id, analytics_date, period_type)
);

-- Performance Indexes for pricing_performance_analytics  
CREATE INDEX IF NOT EXISTS pricing_performance_analytics_tenant_idx ON pricing_performance_analytics(tenant_id);
CREATE INDEX IF NOT EXISTS pricing_performance_analytics_tier_idx ON pricing_performance_analytics(tier_id);
CREATE INDEX IF NOT EXISTS pricing_performance_analytics_product_idx ON pricing_performance_analytics(product_id);
CREATE INDEX IF NOT EXISTS pricing_performance_analytics_date_idx ON pricing_performance_analytics(analytics_date);
CREATE INDEX IF NOT EXISTS pricing_performance_analytics_territory_idx ON pricing_performance_analytics(territory);

-- 4. Competitive Pricing Intelligence Table
-- Market intelligence and competitive analysis for pricing optimization
CREATE TABLE IF NOT EXISTS competitive_pricing_intelligence (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Product Reference
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(100),
  
  -- Competitor Information
  competitor_name VARCHAR(255) NOT NULL,
  competitor_type VARCHAR(50) NOT NULL CHECK (competitor_type IN ('direct', 'indirect', 'substitute')),
  
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
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('manual', 'scraping', 'market_research')),
  source_reliability DECIMAL(3,2) NOT NULL DEFAULT 1.00 CHECK (source_reliability >= 0 AND source_reliability <= 1), -- 0-1
  source_url TEXT,
  
  -- Analysis Results
  recommended_action VARCHAR(50) CHECK (recommended_action IN ('increase', 'decrease', 'maintain', 'monitor')),
  price_optimization_score DECIMAL(5,2),
  
  -- Status and Validity
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  next_review_date TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Additional Context
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Unique constraint
  CONSTRAINT competitive_pricing_intelligence_unique UNIQUE (tenant_id, product_id, competitor_name, territory, price_date)
);

-- Performance Indexes for competitive_pricing_intelligence
CREATE INDEX IF NOT EXISTS competitive_pricing_intelligence_tenant_idx ON competitive_pricing_intelligence(tenant_id);
CREATE INDEX IF NOT EXISTS competitive_pricing_intelligence_product_idx ON competitive_pricing_intelligence(product_id);
CREATE INDEX IF NOT EXISTS competitive_pricing_intelligence_competitor_idx ON competitive_pricing_intelligence(competitor_name);
CREATE INDEX IF NOT EXISTS competitive_pricing_intelligence_territory_idx ON competitive_pricing_intelligence(territory);
CREATE INDEX IF NOT EXISTS competitive_pricing_intelligence_date_idx ON competitive_pricing_intelligence(price_date);
CREATE INDEX IF NOT EXISTS competitive_pricing_intelligence_active_idx ON competitive_pricing_intelligence(is_active);

-- 5. Seasonal Pricing Calendar Table  
-- Manages time-based pricing adjustments and promotional periods
CREATE TABLE IF NOT EXISTS seasonal_pricing_calendar (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Season Definition
  season_name VARCHAR(100) NOT NULL,
  season_type VARCHAR(30) NOT NULL CHECK (season_type IN ('holiday', 'weather', 'business', 'cultural')),
  
  -- Time Configuration
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_pattern VARCHAR(50) CHECK (recurrence_pattern IN ('yearly', 'monthly', 'custom')),
  
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
  weather_pattern VARCHAR(50) CHECK (weather_pattern IN ('dry_season', 'rainy_season', 'harmattan')),
  
  -- Business Rules
  minimum_quantity INTEGER DEFAULT 1,
  maximum_quantity INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  stackable_with_other_offers BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Performance Tracking
  budget_allocation DECIMAL(15,2),
  actual_spend DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  target_sales_increase DECIMAL(5,4),
  actual_sales_increase DECIMAL(5,4),
  
  -- Status and Control
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  
  -- Additional Configuration
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT seasonal_pricing_calendar_date_check CHECK (end_date > start_date),
  CONSTRAINT seasonal_pricing_calendar_multiplier_check CHECK (price_multiplier > 0),
  CONSTRAINT seasonal_pricing_calendar_discount_check CHECK (discount_percent >= 0 AND discount_percent <= 1),
  CONSTRAINT seasonal_pricing_calendar_unique UNIQUE (tenant_id, season_name, start_date)
);

-- Performance Indexes for seasonal_pricing_calendar
CREATE INDEX IF NOT EXISTS seasonal_pricing_calendar_tenant_idx ON seasonal_pricing_calendar(tenant_id);
CREATE INDEX IF NOT EXISTS seasonal_pricing_calendar_date_range_idx ON seasonal_pricing_calendar(start_date, end_date);
CREATE INDEX IF NOT EXISTS seasonal_pricing_calendar_season_type_idx ON seasonal_pricing_calendar(season_type);
CREATE INDEX IF NOT EXISTS seasonal_pricing_calendar_active_idx ON seasonal_pricing_calendar(is_active);
CREATE INDEX IF NOT EXISTS seasonal_pricing_calendar_recurring_idx ON seasonal_pricing_calendar(recurring);
CREATE INDEX IF NOT EXISTS seasonal_pricing_calendar_priority_idx ON seasonal_pricing_calendar(priority);

-- Automatic timestamp update triggers for all tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to all tables
CREATE TRIGGER update_wholesale_pricing_tiers_updated_at BEFORE UPDATE ON wholesale_pricing_tiers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_territory_pricing_adjustments_updated_at BEFORE UPDATE ON territory_pricing_adjustments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pricing_performance_analytics_updated_at BEFORE UPDATE ON pricing_performance_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_competitive_pricing_intelligence_updated_at BEFORE UPDATE ON competitive_pricing_intelligence FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_seasonal_pricing_calendar_updated_at BEFORE UPDATE ON seasonal_pricing_calendar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON wholesale_pricing_tiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON territory_pricing_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pricing_performance_analytics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON competitive_pricing_intelligence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON seasonal_pricing_calendar TO authenticated;

-- Grant sequence usage permissions
GRANT USAGE, SELECT ON SEQUENCE wholesale_pricing_tiers_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE territory_pricing_adjustments_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE pricing_performance_analytics_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE competitive_pricing_intelligence_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE seasonal_pricing_calendar_id_seq TO authenticated;

-- Insert default territory pricing data for Nigerian market
INSERT INTO territory_pricing_adjustments (tenant_id, territory, territory_display_name, price_multiplier, shipping_multiplier, tax_multiplier, state_code, economic_zone, metadata) 
VALUES 
  ('00000000-0000-0000-0000-000000000000', 'Lagos', 'Lagos State', 1.0000, 1.0000, 1.0000, 'LA', 'South-West', '{"capital": true, "commercial_hub": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'Abuja', 'Federal Capital Territory', 1.0500, 1.1000, 1.0000, 'FC', 'North-Central', '{"capital": true, "federal_government": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'Port Harcourt', 'Rivers State', 1.0300, 1.1500, 1.0000, 'RI', 'South-South', '{"oil_hub": true, "industrial": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'Kano', 'Kano State', 0.9500, 1.2000, 1.0000, 'KN', 'North-West', '{"agricultural_hub": true, "traditional_commerce": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'Ibadan', 'Oyo State', 0.9800, 1.0500, 1.0000, 'OY', 'South-West', '{"regional_center": true, "educational_hub": true}'::jsonb)
ON CONFLICT (tenant_id, territory) DO NOTHING;
`;

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Initializing WholesalePricingTiers database schema...');
    
    // Execute the comprehensive database schema
    await execute_sql(INIT_WHOLESALE_PRICING_SCHEMA, []);
    
    console.log('✅ WholesalePricingTiers database schema initialized successfully');
    
    return NextResponse.json({
      success: true,
      message: 'WholesalePricingTiers database schema initialized successfully',
      tables: [
        'wholesale_pricing_tiers',
        'territory_pricing_adjustments', 
        'pricing_performance_analytics',
        'competitive_pricing_intelligence',
        'seasonal_pricing_calendar'
      ],
      features: [
        'Nigerian market territories (Lagos, Abuja, Port Harcourt, Kano, Ibadan)',
        'Quantity-based pricing tiers with percentage/fixed/price discounts',
        'Payment terms discounts (immediate, net_7, net_15, net_30, net_45, net_60)',
        'Seasonal pricing calendar with cultural events (Eid, Christmas, etc.)',
        'Competitive pricing intelligence tracking',
        'Performance analytics with conversion rates and margins',
        'Multi-tenant isolation with proper constraints and indexes',
        'Automatic timestamp triggers for audit trails'
      ]
    });

  } catch (error) {
    console.error('❌ Failed to initialize WholesalePricingTiers database schema:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to initialize WholesalePricingTiers database schema',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

// GET endpoint for status check
export async function GET() {
  try {
    // Check if tables exist
    const tableCheck = await execute_sql(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('wholesale_pricing_tiers', 'territory_pricing_adjustments', 'pricing_performance_analytics', 'competitive_pricing_intelligence', 'seasonal_pricing_calendar')
      ORDER BY table_name
    `, []);
    
    const existingTables = tableCheck.rows.map((row: any) => row.table_name);
    const requiredTables = ['wholesale_pricing_tiers', 'territory_pricing_adjustments', 'pricing_performance_analytics', 'competitive_pricing_intelligence', 'seasonal_pricing_calendar'];
    const isInitialized = requiredTables.every(table => existingTables.includes(table));
    
    return NextResponse.json({
      success: true,
      isInitialized,
      existingTables,
      requiredTables,
      message: isInitialized 
        ? 'WholesalePricingTiers database schema is fully initialized'
        : `Missing tables: ${requiredTables.filter(t => !existingTables.includes(t)).join(', ')}`
    });

  } catch (error) {
    console.error('Failed to check WholesalePricingTiers database status:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to check database status',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}