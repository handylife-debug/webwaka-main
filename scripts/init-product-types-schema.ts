#!/usr/bin/env ts-node

/**
 * Initialize ProductTypesManager database schema
 * Creates specialized tables for advanced product types management
 */

import { execute_sql } from '@/lib/database';
import { INIT_PRODUCT_TYPES_SCHEMA } from '@/cells/ecommerce/ProductTypesManager/src/database-schema';

async function initProductTypesSchema() {
  console.log('🚀 Initializing ProductTypesManager schema...');

  try {
    // Execute the complete schema initialization
    await execute_sql(INIT_PRODUCT_TYPES_SCHEMA);
    
    console.log('✅ ProductTypesManager schema initialized successfully!');
    console.log('\nTables created:');
    console.log('  • product_types - Advanced product type management');
    console.log('  • product_variations - Variable product variations');
    console.log('  • digital_assets - Digital product asset management');
    console.log('  • bundle_items - Bundled product components');
    console.log('  • product_classifications - Classified product security');
    console.log('  • product_access_controls - Access control and restrictions');
    
    // Test that tables were created
    const result = await execute_sql(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN (
        'product_types', 'product_variations', 'digital_assets', 
        'bundle_items', 'product_classifications', 'product_access_controls'
      )
      ORDER BY table_name
    `);
    
    console.log('\n🔍 Verified tables:');
    result.rows.forEach((row: any) => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    console.log('\n🧬 ProductTypesManager Cell is ready for advanced product management!');
    console.log('\n🎯 Supported Product Types:');
    console.log('  • Simple Products - Single variant physical products');
    console.log('  • Variable Products - Multiple variations (size, color, etc.)');
    console.log('  • Digital Products - Downloadable/streamable assets');
    console.log('  • Bundled Products - Multi-product combinations');
    console.log('  • Classified Products - Security-controlled access');
    
    console.log('\n🔧 Features:');
    console.log('  • 100% Cellular Reusability - Extends existing ProductCatalog');
    console.log('  • Nigerian Market Support - NGN currency, VAT compliance');
    console.log('  • Advanced Inventory - Multi-location, variation-specific stock');
    console.log('  • Security Framework - Role-based access, audit trails');
    console.log('  • Comprehensive API - Full CRUD operations for all types');
    
  } catch (error) {
    console.error('❌ Error initializing schema:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initProductTypesSchema().then(() => process.exit(0));
}

export { initProductTypesSchema };