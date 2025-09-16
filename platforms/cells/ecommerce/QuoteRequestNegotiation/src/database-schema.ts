/**
 * QuoteRequestNegotiation Cell Database Schema
 * CELLULAR REUSABILITY: Extends CustomerProfile, B2BAccessControl, and CustomerEngagement cells
 * Nigerian Market Focus: Naira currency, 7.5% VAT compliance, local payment terms
 */

export const INIT_QUOTE_NEGOTIATION_SCHEMA = `
-- ===================================================================
-- QUOTE REQUEST NEGOTIATION TABLES - Extending existing infrastructure
-- ===================================================================

-- 1. Quote Requests Table - Master quote request records
CREATE TABLE IF NOT EXISTS quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Customer and Business Context (EXTENDS CustomerProfile cell)
  customer_id UUID NOT NULL,
  customer_contact_id UUID, -- References CustomerContact for B2B
  
  -- Request Identification
  quote_number VARCHAR(50) NOT NULL, -- Auto-generated: QT-2024-001234
  request_title VARCHAR(200) NOT NULL,
  request_description TEXT,
  
  -- Quote Status Management
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'submitted', 'under_review', 'negotiating', 'quoted', 'approved', 'rejected', 'expired', 'converted', 'cancelled')
  ),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (
    priority IN ('low', 'medium', 'high', 'urgent')
  ),
  
  -- Business Requirements
  requested_delivery_date TIMESTAMP WITH TIME ZONE,
  delivery_location TEXT,
  special_requirements TEXT,
  
  -- Financial Information (Nigerian Market)
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  estimated_budget DECIMAL(15,2),
  budget_flexibility VARCHAR(20) DEFAULT 'flexible' CHECK (
    budget_flexibility IN ('strict', 'somewhat_flexible', 'flexible', 'no_limit')
  ),
  
  -- Sales Team Assignment (EXTENDS B2BAccessControl permissions)
  assigned_sales_rep_id UUID,
  sales_manager_id UUID,
  account_manager_id UUID,
  
  -- Quote Validity and Timing
  quote_validity_days INTEGER DEFAULT 30,
  response_deadline TIMESTAMP WITH TIME ZONE,
  
  -- Communication Preferences (REUSES CustomerProfile preferences)  
  preferred_communication VARCHAR(20) DEFAULT 'email' CHECK (
    preferred_communication IN ('sms', 'email', 'phone', 'whatsapp', 'in_person')
  ),
  notification_frequency VARCHAR(20) DEFAULT 'standard' CHECK (
    notification_frequency IN ('minimal', 'standard', 'frequent')
  ),
  
  -- Nigerian Business Compliance
  tax_id VARCHAR(50),
  business_registration_number VARCHAR(50),
  requires_proforma_invoice BOOLEAN DEFAULT true,
  requires_formal_quotation BOOLEAN DEFAULT true,
  payment_terms_requested VARCHAR(30) DEFAULT 'net_30' CHECK (
    payment_terms_requested IN ('immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', '2_10_net_30')
  ),
  
  -- Metadata and Tracking
  source VARCHAR(30) DEFAULT 'web_form' CHECK (
    source IN ('web_form', 'phone', 'email', 'referral', 'trade_show', 'cold_outreach', 'returning_customer')
  ),
  referral_source VARCHAR(100),
  campaign_id UUID,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Advanced Features
  metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[],
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_quote_requests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_requests_customer FOREIGN KEY (customer_id) REFERENCES customer_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_requests_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Business Logic Constraints
  CONSTRAINT unique_quote_number UNIQUE (tenant_id, quote_number),
  CONSTRAINT check_budget_positive CHECK (estimated_budget IS NULL OR estimated_budget >= 0),
  CONSTRAINT check_validity_positive CHECK (quote_validity_days > 0),
  CONSTRAINT check_response_deadline_future CHECK (response_deadline IS NULL OR response_deadline > created_at)
);

-- 2. Quote Items Table - Individual line items within each quote request
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  
  -- Product Information (EXTENDS ProductCatalog cell)
  product_id UUID,
  product_sku VARCHAR(100),
  product_name VARCHAR(200) NOT NULL,
  product_description TEXT,
  
  -- Quantity and Specifications
  requested_quantity DECIMAL(15,4) NOT NULL,
  unit_of_measure VARCHAR(50) NOT NULL DEFAULT 'piece',
  product_specifications TEXT,
  custom_requirements TEXT,
  
  -- Pricing Information (COMPOSES WholesalePricingTiers)
  estimated_unit_price DECIMAL(12,4),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  price_is_estimate BOOLEAN DEFAULT true,
  
  -- Delivery Requirements
  delivery_timeline VARCHAR(100),
  packaging_requirements TEXT,
  
  -- Item Status
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'available', 'special_order', 'discontinued', 'quoted', 'approved', 'rejected')
  ),
  availability_notes TEXT,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  line_number INTEGER NOT NULL,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_quote_items_quote FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Business Logic Constraints
  CONSTRAINT unique_quote_line UNIQUE (quote_request_id, line_number),
  CONSTRAINT check_quantity_positive CHECK (requested_quantity > 0),
  CONSTRAINT check_price_non_negative CHECK (estimated_unit_price IS NULL OR estimated_unit_price >= 0)
);

-- 3. Negotiation Messages Table - Real-time messaging between customer and sales team
CREATE TABLE IF NOT EXISTS negotiation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  
  -- Message Identification
  message_type VARCHAR(30) NOT NULL CHECK (
    message_type IN ('customer_inquiry', 'sales_response', 'price_negotiation', 'terms_discussion', 'specification_change', 'delivery_update', 'system_notification', 'approval_request')
  ),
  thread_id UUID, -- For grouping related messages
  
  -- Sender Information (REUSES auth system)
  sender_id UUID NOT NULL,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer', 'sales_rep', 'manager', 'system')),
  sender_name VARCHAR(100) NOT NULL,
  
  -- Message Content
  subject VARCHAR(200),
  message_content TEXT NOT NULL,
  content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'html', 'markdown')),
  
  -- Attachments and References
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of attachment metadata
  references_item_id UUID, -- Links to specific quote items
  references_offer_id UUID, -- Links to specific offers
  
  -- Message Status and Delivery
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  read_by UUID[],
  
  -- Communication Channel (COMPOSES communication infrastructure)
  delivery_channel VARCHAR(20) DEFAULT 'web' CHECK (
    delivery_channel IN ('web', 'email', 'sms', 'whatsapp', 'phone')
  ),
  external_message_id VARCHAR(200), -- For SMS/Email tracking
  delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')
  ),
  
  -- Nigerian Communication Features
  preferred_language VARCHAR(5) DEFAULT 'en' CHECK (
    preferred_language IN ('en', 'ha', 'yo', 'ig')
  ),
  auto_translate BOOLEAN DEFAULT false,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_negotiation_messages_quote FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_negotiation_messages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_negotiation_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 4. Quote Offers Table - Formal pricing offers generated by sales team
CREATE TABLE IF NOT EXISTS quote_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  
  -- Offer Identification
  offer_number VARCHAR(50) NOT NULL, -- Auto-generated: QO-2024-001234
  offer_version INTEGER NOT NULL DEFAULT 1,
  offer_title VARCHAR(200) NOT NULL,
  
  -- Offer Status
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'sent', 'viewed', 'under_review', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn')
  ),
  
  -- Sales Team Information
  offered_by UUID NOT NULL,
  approved_by UUID,
  approval_level VARCHAR(20) CHECK (
    approval_level IN ('sales_rep', 'sales_manager', 'finance_director', 'general_manager')
  ),
  
  -- Financial Terms (COMPOSES WholesalePricingTiers and TaxAndFee)
  subtotal_amount DECIMAL(15,2) NOT NULL,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  
  -- Payment and Delivery Terms
  payment_terms VARCHAR(30) NOT NULL DEFAULT 'net_30' CHECK (
    payment_terms IN ('immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', '2_10_net_30')
  ),
  payment_methods TEXT[], -- ['bank_transfer', 'pos', 'cash', 'mobile_money']
  delivery_terms VARCHAR(100),
  delivery_timeline VARCHAR(100),
  delivery_location TEXT,
  
  -- Offer Validity
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  auto_extend_validity BOOLEAN DEFAULT false,
  
  -- Nigerian Business Features
  includes_vat BOOLEAN DEFAULT true,
  vat_rate DECIMAL(5,4) DEFAULT 0.075, -- 7.5% Nigerian VAT
  withholding_tax_applicable BOOLEAN DEFAULT false,
  proforma_invoice_generated BOOLEAN DEFAULT false,
  formal_quotation_generated BOOLEAN DEFAULT false,
  
  -- Terms and Conditions
  terms_and_conditions TEXT,
  warranty_terms TEXT,
  return_policy TEXT,
  special_conditions TEXT,
  
  -- Document Generation
  pdf_generated BOOLEAN DEFAULT false,
  pdf_url VARCHAR(500),
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  
  -- Customer Interaction
  customer_viewed_at TIMESTAMP WITH TIME ZONE,
  customer_response_deadline TIMESTAMP WITH TIME ZONE,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Advanced Features
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_quote_offers_quote FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_offers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_offers_offered_by FOREIGN KEY (offered_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Business Logic Constraints
  CONSTRAINT unique_offer_number UNIQUE (tenant_id, offer_number),
  CONSTRAINT check_amounts_positive CHECK (
    subtotal_amount >= 0 AND 
    discount_amount >= 0 AND 
    tax_amount >= 0 AND 
    total_amount >= 0
  ),
  CONSTRAINT check_validity_future CHECK (valid_until > created_at),
  CONSTRAINT check_total_calculation CHECK (total_amount = subtotal_amount - discount_amount + tax_amount)
);

-- 5. Quote Approvals Table - Multi-level approval workflow for high-value quotes
CREATE TABLE IF NOT EXISTS quote_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID,
  quote_offer_id UUID,
  tenant_id UUID NOT NULL,
  
  -- Approval Workflow
  approval_level VARCHAR(30) NOT NULL CHECK (
    approval_level IN ('sales_rep', 'sales_manager', 'finance_director', 'general_manager', 'board_approval')
  ),
  approval_order INTEGER NOT NULL,
  approval_threshold DECIMAL(15,2), -- Amount threshold that triggered this approval
  
  -- Approver Information
  approver_id UUID NOT NULL,
  approver_role VARCHAR(50) NOT NULL,
  
  -- Approval Status
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'delegated', 'expired')
  ),
  
  -- Approval Details
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  approver_comments TEXT,
  conditions TEXT, -- Any conditions attached to approval
  
  -- Delegation (if applicable)
  delegated_to UUID,
  delegation_reason TEXT,
  delegation_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Notification and Reminders
  notification_sent BOOLEAN DEFAULT false,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMP WITH TIME ZONE,
  
  -- Nigerian Business Compliance
  requires_documentation BOOLEAN DEFAULT false,
  documentation_provided BOOLEAN DEFAULT false,
  compliance_notes TEXT,
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_quote_approvals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_approvals_approver FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Business Logic Constraints
  CONSTRAINT check_approval_references CHECK (
    (quote_request_id IS NOT NULL AND quote_offer_id IS NULL) OR 
    (quote_request_id IS NULL AND quote_offer_id IS NOT NULL)
  ),
  CONSTRAINT check_threshold_positive CHECK (approval_threshold IS NULL OR approval_threshold > 0),
  CONSTRAINT unique_approval_level UNIQUE (tenant_id, COALESCE(quote_request_id, quote_offer_id), approval_level)
);

-- 6. Quote Conversions Table - Tracking successful quote-to-order conversions
CREATE TABLE IF NOT EXISTS quote_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL,
  quote_offer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  
  -- Order Information (COMPOSES SalesEngine)
  order_id UUID,
  order_number VARCHAR(50),
  conversion_type VARCHAR(30) NOT NULL DEFAULT 'full_conversion' CHECK (
    conversion_type IN ('full_conversion', 'partial_conversion', 'modified_conversion')
  ),
  
  -- Financial Tracking
  quote_total_amount DECIMAL(15,2) NOT NULL,
  order_total_amount DECIMAL(15,2) NOT NULL,
  conversion_value DECIMAL(15,2) NOT NULL, -- Actual converted amount
  conversion_percentage DECIMAL(5,2) NOT NULL, -- Percentage of quote value converted
  
  -- Sales Performance Metrics
  sales_rep_id UUID NOT NULL,
  sales_manager_id UUID,
  commission_rate DECIMAL(5,4),
  commission_amount DECIMAL(10,2),
  
  -- Conversion Timeline
  quote_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  offer_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  customer_accepted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  order_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Performance Analysis
  negotiation_duration_days INTEGER,
  response_time_hours INTEGER,
  revision_count INTEGER DEFAULT 0,
  
  -- Customer Satisfaction
  customer_satisfaction_rating INTEGER CHECK (customer_satisfaction_rating BETWEEN 1 AND 5),
  customer_feedback TEXT,
  
  -- Nigerian Market Analytics
  territory VARCHAR(50),
  customer_segment VARCHAR(30),
  industry_sector VARCHAR(50),
  
  -- Audit Fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Advanced Analytics
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Multi-tenant Constraints
  CONSTRAINT fk_quote_conversions_quote FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_conversions_offer FOREIGN KEY (quote_offer_id) REFERENCES quote_offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_conversions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_conversions_sales_rep FOREIGN KEY (sales_rep_id) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Business Logic Constraints
  CONSTRAINT check_amounts_positive CHECK (
    quote_total_amount > 0 AND 
    order_total_amount > 0 AND 
    conversion_value > 0
  ),
  CONSTRAINT check_conversion_percentage CHECK (conversion_percentage BETWEEN 0 AND 100),
  CONSTRAINT check_timeline_logic CHECK (
    quote_created_at <= offer_sent_at AND
    offer_sent_at <= customer_accepted_at AND
    customer_accepted_at <= order_created_at
  )
);

-- ===================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ===================================================================

-- Quote Requests Indexes
CREATE INDEX IF NOT EXISTS idx_quote_requests_tenant_customer ON quote_requests(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status_created ON quote_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_assigned_rep ON quote_requests(tenant_id, assigned_sales_rep_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_requests_deadline ON quote_requests(tenant_id, response_deadline) WHERE response_deadline IS NOT NULL;

-- Quote Items Indexes  
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON quote_items(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_status ON quote_items(tenant_id, status);

-- Negotiation Messages Indexes
CREATE INDEX IF NOT EXISTS idx_negotiation_messages_quote_timestamp ON negotiation_messages(quote_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_negotiation_messages_sender ON negotiation_messages(tenant_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_negotiation_messages_unread ON negotiation_messages(quote_request_id, is_read, created_at) WHERE is_read = false;

-- Quote Offers Indexes
CREATE INDEX IF NOT EXISTS idx_quote_offers_validity_status ON quote_offers(tenant_id, valid_until, status) WHERE status IN ('sent', 'viewed', 'under_review');
CREATE INDEX IF NOT EXISTS idx_quote_offers_amount ON quote_offers(tenant_id, total_amount, created_at DESC);

-- Quote Approvals Indexes
CREATE INDEX IF NOT EXISTS idx_quote_approvals_pending ON quote_approvals(tenant_id, approver_id, status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_quote_approvals_level ON quote_approvals(tenant_id, approval_level, status);

-- Quote Conversions Indexes
CREATE INDEX IF NOT EXISTS idx_quote_conversions_success_rate ON quote_conversions(tenant_id, sales_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_conversions_performance ON quote_conversions(tenant_id, territory, customer_segment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_conversions_timeline ON quote_conversions(tenant_id, negotiation_duration_days, conversion_percentage);

-- ===================================================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ===================================================================

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_quote_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all main tables
CREATE TRIGGER trigger_quote_requests_updated_at BEFORE UPDATE ON quote_requests FOR EACH ROW EXECUTE FUNCTION update_quote_updated_at();
CREATE TRIGGER trigger_quote_items_updated_at BEFORE UPDATE ON quote_items FOR EACH ROW EXECUTE FUNCTION update_quote_updated_at();
CREATE TRIGGER trigger_negotiation_messages_updated_at BEFORE UPDATE ON negotiation_messages FOR EACH ROW EXECUTE FUNCTION update_quote_updated_at();
CREATE TRIGGER trigger_quote_offers_updated_at BEFORE UPDATE ON quote_offers FOR EACH ROW EXECUTE FUNCTION update_quote_updated_at();
CREATE TRIGGER trigger_quote_approvals_updated_at BEFORE UPDATE ON quote_approvals FOR EACH ROW EXECUTE FUNCTION update_quote_updated_at();
CREATE TRIGGER trigger_quote_conversions_updated_at BEFORE UPDATE ON quote_conversions FOR EACH ROW EXECUTE FUNCTION update_quote_updated_at();

-- Update last_activity_at when messages are added
CREATE OR REPLACE FUNCTION update_quote_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE quote_requests 
    SET last_activity_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.quote_request_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quote_activity AFTER INSERT ON negotiation_messages FOR EACH ROW EXECUTE FUNCTION update_quote_activity();
`;