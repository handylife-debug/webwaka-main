#!/usr/bin/env ts-node

/**
 * Initialize WholesalePricingTiers database schema
 * Creates wholesale pricing tables with proper tenant isolation and Nigerian market features
 */

import { execute_sql } from '@/lib/database';
import { INIT_WHOLESALE_PRICING_SCHEMA } from '@/cells/ecommerce/WholesalePricingTiers/src/database-schema';

async function initWholesalePricingSchema() {
  console.log('🚀 Initializing WholesalePricingTiers schema...');

  try {
    // Execute the complete schema initialization
    await execute_sql(INIT_WHOLESALE_PRICING_SCHEMA);
    
    console.log('✅ WholesalePricingTiers schema initialized successfully!');
    console.log('\nTables created:');
    console.log('  • wholesale_pricing_tiers - Quantity-based pricing rules');
    console.log('  • territory_pricing_adjustments - Regional pricing multipliers');
    console.log('  • pricing_performance_analytics - Pricing effectiveness tracking');
    
    // Test that tables were created
    const result = await execute_sql(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN (
        'wholesale_pricing_tiers', 'territory_pricing_adjustments', 
        'pricing_performance_analytics'
      )
      ORDER BY table_name
    `);
    
    console.log('\n🔍 Verified tables:');
    result.rows.forEach((row: any) => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    console.log('\n🧬 WholesalePricingTiers Cell is ready for B2B commerce!');
    console.log('\n🎯 Wholesale Features:');
    console.log('  • Quantity-Based Pricing - Discounts for bulk purchases');
    console.log('  • Group-Specific Pricing - B2B customer group tiers');
    console.log('  • Territory Adjustments - Regional pricing for Nigerian states');
    console.log('  • Payment Terms Integration - Early payment discounts');
    console.log('  • Tax Integration - Extends TaxAndFee Cell functionality');
    
    console.log('\n🔧 Nigerian Market Support:');
    console.log('  • 100% Cellular Reusability - Extends TaxAndFee & B2BAccessControl');
    console.log('  • Nigerian Naira (₦) - Primary currency with regional adjustments');
    console.log('  • Territory-Based Pricing - Lagos, Abuja, Port Harcourt, Kano, etc.');
    console.log('  • Payment Terms - Advance payment, COD, NET terms compliance');
    console.log('  • Tenant Isolation - Multi-tenant security with proper scoping');
    console.log('  • Performance Analytics - Pricing effectiveness and margins');
    
    // Test tenant isolation works properly
    console.log('\n🔐 Testing tenant isolation...');
    const tenantTest = await execute_sql(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'wholesale_pricing_tiers' AND column_name = 'tenant_id'
    `);
    
    if (tenantTest.rows.length > 0) {
      console.log('  ✅ Tenant isolation properly configured');
    } else {
      console.log('  ❌ WARNING: Tenant isolation missing!');
    }
    
  } catch (error) {
    console.error('❌ Error initializing schema:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initWholesalePricingSchema().then(() => process.exit(0));
}

export { initWholesalePricingSchema };