/**
 * Partner Management Database Storage Initialization
 * 
 * This module provides database initialization functions for the Partner Management system.
 * It creates all necessary tables, indexes, constraints, and triggers with proper multi-tenant isolation.
 */

import { 
  ALL_PARTNER_TABLES_SQL,
  ALL_PARTNER_INDEXES_SQL,
  ALL_PARTNER_TRIGGERS_SQL,
  PARTNER_LEVELS_TABLE_SQL,
  PARTNERS_TABLE_SQL,
  PARTNER_RELATIONS_TABLE_SQL,
  PARTNER_LEVELS_INDEXES_SQL,
  PARTNERS_INDEXES_SQL,
  PARTNER_RELATIONS_INDEXES_SQL,
  UPDATED_AT_TRIGGER_FUNCTION_SQL,
  PARTNER_LEVELS_TRIGGERS_SQL,
  PARTNERS_TRIGGERS_SQL,
  PARTNER_RELATIONS_TRIGGERS_SQL,
  PARTNER_COMMISSION_RATE_TRIGGER_SQL
} from '../shared/schema';

// Import the database connection utility
import { execute_sql } from '../platforms/lib/database';

/**
 * Initialize all Partner Management database tables, indexes, constraints, and triggers
 * This function ensures the complete Partner Management schema is set up with proper:
 * - Multi-tenant isolation
 * - Data integrity constraints
 * - Foreign key relationships
 * - Performance indexes
 * - Automatic timestamp updates
 * - Business rule validation
 */
export async function initializePartnerManagementSchema(): Promise<void> {
  try {
    console.log('Initializing Partner Management database schema...');

    // Ensure required extensions are available
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS plpgsql;`);
    
    // Step 1: Create all tables with constraints
    console.log('Creating Partner Management tables...');
    await execute_sql(PARTNER_LEVELS_TABLE_SQL);
    await execute_sql(PARTNERS_TABLE_SQL);
    await execute_sql(PARTNER_RELATIONS_TABLE_SQL);
    
    // Step 2: Create performance indexes
    console.log('Creating indexes for optimal query performance...');
    await execute_sql(PARTNER_LEVELS_INDEXES_SQL);
    await execute_sql(PARTNERS_INDEXES_SQL);
    await execute_sql(PARTNER_RELATIONS_INDEXES_SQL);
    
    // Step 3: Create trigger functions and triggers
    console.log('Setting up automatic timestamp triggers...');
    await execute_sql(UPDATED_AT_TRIGGER_FUNCTION_SQL);
    await execute_sql(PARTNER_LEVELS_TRIGGERS_SQL);
    await execute_sql(PARTNERS_TRIGGERS_SQL);
    await execute_sql(PARTNER_RELATIONS_TRIGGERS_SQL);
    
    // Step 4: Create business logic triggers
    console.log('Setting up business validation triggers...');
    await execute_sql(PARTNER_COMMISSION_RATE_TRIGGER_SQL);

    console.log('✅ Partner Management database schema initialized successfully');
    console.log('✅ All tables, indexes, constraints, and triggers created');
    console.log('✅ Multi-tenant isolation and data integrity enforced');
    
  } catch (error) {
    console.error('❌ Error initializing Partner Management schema:', error);
    throw error;
  }
}

/**
 * Initialize only the Partner Levels table
 * Useful for step-by-step initialization or testing
 */
export async function initializePartnerLevelsTable(): Promise<void> {
  try {
    console.log('Initializing Partner Levels table...');
    
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await execute_sql(PARTNER_LEVELS_TABLE_SQL);
    await execute_sql(PARTNER_LEVELS_INDEXES_SQL);
    await execute_sql(UPDATED_AT_TRIGGER_FUNCTION_SQL);
    await execute_sql(PARTNER_LEVELS_TRIGGERS_SQL);
    
    console.log('✅ Partner Levels table initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Partner Levels table:', error);
    throw error;
  }
}

/**
 * Initialize only the Partners table
 * Requires Partner Levels table to exist first (foreign key dependency)
 */
export async function initializePartnersTable(): Promise<void> {
  try {
    console.log('Initializing Partners table...');
    
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await execute_sql(PARTNERS_TABLE_SQL);
    await execute_sql(PARTNERS_INDEXES_SQL);
    await execute_sql(UPDATED_AT_TRIGGER_FUNCTION_SQL);
    await execute_sql(PARTNERS_TRIGGERS_SQL);
    await execute_sql(PARTNER_COMMISSION_RATE_TRIGGER_SQL);
    
    console.log('✅ Partners table initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Partners table:', error);
    throw error;
  }
}

/**
 * Initialize only the Partner Relations table
 * Requires Partners table to exist first (foreign key dependency)
 */
export async function initializePartnerRelationsTable(): Promise<void> {
  try {
    console.log('Initializing Partner Relations table...');
    
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await execute_sql(PARTNER_RELATIONS_TABLE_SQL);
    await execute_sql(PARTNER_RELATIONS_INDEXES_SQL);
    await execute_sql(UPDATED_AT_TRIGGER_FUNCTION_SQL);
    await execute_sql(PARTNER_RELATIONS_TRIGGERS_SQL);
    
    console.log('✅ Partner Relations table initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Partner Relations table:', error);
    throw error;
  }
}

/**
 * Drop all Partner Management tables (for development/testing)
 * WARNING: This will permanently delete all partner data!
 */
export async function dropPartnerManagementSchema(): Promise<void> {
  try {
    console.log('⚠️  Dropping Partner Management schema...');
    
    // Drop tables in reverse dependency order
    await execute_sql(`DROP TABLE IF EXISTS partner_relations CASCADE;`);
    await execute_sql(`DROP TABLE IF EXISTS partners CASCADE;`);
    await execute_sql(`DROP TABLE IF EXISTS partner_levels CASCADE;`);
    
    // Drop trigger functions
    await execute_sql(`DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;`);
    await execute_sql(`DROP FUNCTION IF EXISTS validate_partner_commission_rate() CASCADE;`);
    
    console.log('✅ Partner Management schema dropped successfully');
  } catch (error) {
    console.error('❌ Error dropping Partner Management schema:', error);
    throw error;
  }
}

/**
 * Verify the Partner Management schema is properly set up
 * Returns information about table structures and constraints
 */
export async function verifyPartnerManagementSchema(): Promise<{
  tables: string[];
  constraints: Array<{ table: string; constraint: string; type: string }>;
  indexes: Array<{ table: string; index: string }>;
  triggers: Array<{ table: string; trigger: string }>;
}> {
  try {
    console.log('Verifying Partner Management schema...');
    
    // Check tables exist
    const tablesResult = await execute_sql(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('partner_levels', 'partners', 'partner_relations')
      ORDER BY table_name;
    `);
    
    // Check constraints
    const constraintsResult = await execute_sql(`
      SELECT conrelid::regclass AS table_name, conname AS constraint_name, contype AS constraint_type
      FROM pg_constraint 
      WHERE conrelid::regclass::text IN ('partner_levels', 'partners', 'partner_relations')
      ORDER BY table_name, constraint_name;
    `);
    
    // Check indexes
    const indexesResult = await execute_sql(`
      SELECT schemaname, tablename, indexname 
      FROM pg_indexes 
      WHERE tablename IN ('partner_levels', 'partners', 'partner_relations')
      ORDER BY tablename, indexname;
    `);
    
    // Check triggers
    const triggersResult = await execute_sql(`
      SELECT event_object_table AS table_name, trigger_name
      FROM information_schema.triggers 
      WHERE event_object_table IN ('partner_levels', 'partners', 'partner_relations')
      ORDER BY table_name, trigger_name;
    `);
    
    const verification = {
      tables: tablesResult.rows.map((row: any) => row.table_name),
      constraints: constraintsResult.rows.map((row: any) => ({
        table: row.table_name,
        constraint: row.constraint_name,
        type: row.constraint_type
      })),
      indexes: indexesResult.rows.map((row: any) => ({
        table: row.tablename,
        index: row.indexname
      })),
      triggers: triggersResult.rows.map((row: any) => ({
        table: row.table_name,
        trigger: row.trigger_name
      }))
    };
    
    console.log('✅ Schema verification completed');
    console.log(`Found ${verification.tables.length} tables`);
    console.log(`Found ${verification.constraints.length} constraints`);
    console.log(`Found ${verification.indexes.length} indexes`);
    console.log(`Found ${verification.triggers.length} triggers`);
    
    return verification;
    
  } catch (error) {
    console.error('❌ Error verifying Partner Management schema:', error);
    throw error;
  }
}