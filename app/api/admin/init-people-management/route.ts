import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../lib/database'
import { 
  ALL_PEOPLE_MANAGEMENT_TABLES_SQL,
  ALL_PEOPLE_MANAGEMENT_INDEXES_SQL,
  ALL_PEOPLE_MANAGEMENT_TRIGGERS_SQL
} from '../../../../lib/schema'

/**
 * Initialize People Management Database Schema
 * Creates all tables, indexes, and triggers for CRM, Staff Management, and HRM
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting People Management schema initialization...');
    
    // Create all People Management tables
    console.log('Creating People Management tables...');
    await execute_sql(ALL_PEOPLE_MANAGEMENT_TABLES_SQL);
    console.log('✅ People Management tables created successfully');
    
    // Create all indexes for performance optimization
    console.log('Creating People Management indexes...');
    await execute_sql(ALL_PEOPLE_MANAGEMENT_INDEXES_SQL);
    console.log('✅ People Management indexes created successfully');
    
    // Create all triggers for business logic
    console.log('Creating People Management triggers...');
    await execute_sql(ALL_PEOPLE_MANAGEMENT_TRIGGERS_SQL);
    console.log('✅ People Management triggers created successfully');
    
    // Create default roles for the system
    console.log('Creating default system roles...');
    await createDefaultRoles();
    console.log('✅ Default roles created successfully');
    
    console.log('✅ People Management schema initialized successfully');
    
    return NextResponse.json({
      success: true,
      message: 'People Management schema initialized successfully',
      modules: ['CRM', 'Staff Management', 'HRM'],
      tables_created: 12,
      indexes_created: 12,
      triggers_created: 10,
      default_roles_created: 5
    });
    
  } catch (error) {
    console.error('❌ Error initializing People Management schema:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to initialize People Management schema',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function createDefaultRoles() {
  // Get the main tenant (we'll create roles for each tenant as needed)
  const tenantResult = await execute_sql(`
    SELECT id FROM tenants WHERE subdomain = 'main' OR id = '00000000-0000-0000-0000-000000000001' LIMIT 1
  `);
  
  if (!tenantResult.rows || tenantResult.rows.length === 0) {
    console.log('⚠️ No main tenant found, skipping default roles creation');
    return;
  }
  
  const tenantId = tenantResult.rows[0].id;
  
  const defaultRoles = [
    {
      name: 'Super Admin',
      description: 'Full system access with all permissions',
      level: 100,
      permissions: [
        'admin.all',
        'users.manage',
        'roles.manage',
        'customers.all',
        'employees.all',
        'reports.all',
        'settings.all'
      ]
    },
    {
      name: 'Admin',
      description: 'Administrative access to manage business operations',
      level: 80,
      permissions: [
        'customers.all',
        'employees.manage',
        'reports.view',
        'settings.business'
      ]
    },
    {
      name: 'Manager',
      description: 'Management access to oversee staff and operations',
      level: 60,
      permissions: [
        'customers.view',
        'customers.edit',
        'employees.view',
        'reports.basic',
        'attendance.manage'
      ]
    },
    {
      name: 'Staff',
      description: 'Standard staff access for daily operations',
      level: 40,
      permissions: [
        'customers.view',
        'customers.basic_edit',
        'attendance.own',
        'sales.process'
      ]
    },
    {
      name: 'Employee',
      description: 'Basic employee access for time tracking and personal data',
      level: 20,
      permissions: [
        'attendance.own',
        'profile.view',
        'profile.edit'
      ]
    }
  ];
  
  for (const role of defaultRoles) {
    await execute_sql(`
      INSERT INTO roles (tenant_id, role_name, role_description, role_level, is_system_role, permissions, created_by)
      VALUES ($1, $2, $3, $4, true, $5, null)
      ON CONFLICT (tenant_id, role_name) DO NOTHING
    `, [
      tenantId,
      role.name,
      role.description,
      role.level,
      JSON.stringify(role.permissions)
    ]);
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify People Management schema status
    const tableCheckResults = await Promise.all([
      execute_sql("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customers')"),
      execute_sql("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"),
      execute_sql("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'employees')"),
      execute_sql("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'roles')"),
      execute_sql("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'attendance_records')")
    ]);
    
    const allTablesExist = tableCheckResults.every(result => 
      result.rows && result.rows[0] && result.rows[0].exists
    );
    
    if (allTablesExist) {
      // Get statistics
      const stats = await execute_sql(`
        SELECT 
          (SELECT COUNT(*) FROM customers) as total_customers,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM employees) as total_employees,
          (SELECT COUNT(*) FROM roles) as total_roles,
          (SELECT COUNT(*) FROM communication_logs) as total_communications
      `);
      
      return NextResponse.json({
        initialized: true,
        message: 'People Management schema is properly initialized',
        statistics: stats.rows[0],
        modules: ['CRM', 'Staff Management', 'HRM']
      });
    } else {
      return NextResponse.json({
        initialized: false,
        message: 'People Management schema is not initialized',
        missing_tables: tableCheckResults.map((result, index) => 
          !result.rows?.[0]?.exists ? ['customers', 'users', 'employees', 'roles', 'attendance_records'][index] : null
        ).filter(Boolean)
      });
    }
    
  } catch (error) {
    console.error('Error checking People Management schema status:', error);
    
    return NextResponse.json({
      initialized: false,
      message: 'Error checking schema status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}