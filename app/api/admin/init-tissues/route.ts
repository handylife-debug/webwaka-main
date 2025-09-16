import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth-server';
import { execute_sql } from '../../../../lib/database';

// Database initialization for Tissue Orchestrator tables
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'SuperAdmin') {
      return NextResponse.json({ error: 'SuperAdmin access required' }, { status: 403 });
    }

    // SECURITY FIX: Ensure pgcrypto extension for UUID generation
    const ensureExtensions = `
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `;

    // SECURITY HARDENED: Create tissues table with proper constraints and foreign keys
    const createTissuesTable = `
      CREATE TABLE IF NOT EXISTS tissues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tissue_id VARCHAR(100) NOT NULL,
        tenant_id UUID NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        version VARCHAR(20) NOT NULL,
        definition JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'failed')),
        tags JSONB DEFAULT '[]'::jsonb,
        category VARCHAR(100) DEFAULT 'general',
        metadata JSONB DEFAULT '{}'::jsonb,
        is_template BOOLEAN DEFAULT false,
        created_by UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- SECURITY: Multi-tenant constraints - tenant_id must reference tenants table
        CONSTRAINT fk_tissues_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        
        -- SECURITY: Tenant-scoped unique constraints (not globally unique)
        CONSTRAINT unique_tissue_id_per_tenant UNIQUE (tenant_id, tissue_id),
        CONSTRAINT unique_tissue_name_per_tenant UNIQUE (tenant_id, name),
        
        -- DATA INTEGRITY: Business rule constraints
        CONSTRAINT check_tissue_id_format CHECK (tissue_id ~ '^[a-zA-Z][a-zA-Z0-9_-]*$'),
        CONSTRAINT check_tissue_id_length CHECK (char_length(tissue_id) >= 3 AND char_length(tissue_id) <= 100),
        CONSTRAINT check_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
        CONSTRAINT check_version_format CHECK (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$')
      );
    `;

    // SECURITY HARDENED: Create tissue executions table with foreign keys and constraints
    const createTissueExecutionsTable = `
      CREATE TABLE IF NOT EXISTS tissue_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id VARCHAR(100) NOT NULL,
        tissue_id VARCHAR(100) NOT NULL,
        tenant_id UUID NOT NULL,
        executed_by UUID NOT NULL,
        input JSONB NOT NULL,
        output JSONB,
        success BOOLEAN NOT NULL,
        error TEXT,
        duration INTEGER NOT NULL DEFAULT 0,
        cell_results JSONB DEFAULT '{}'::jsonb,
        step_count INTEGER DEFAULT 0,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- SECURITY: Multi-tenant foreign key constraints
        CONSTRAINT fk_tissue_executions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        
        -- CRITICAL: Reference tissue via composite key (tenant_id, tissue_id)
        -- This ensures cross-tenant tissue access is impossible
        CONSTRAINT fk_tissue_executions_tissue FOREIGN KEY (tenant_id, tissue_id) 
          REFERENCES tissues(tenant_id, tissue_id) ON DELETE CASCADE,
        
        -- SECURITY: Tenant-scoped unique execution IDs
        CONSTRAINT unique_execution_id_per_tenant UNIQUE (tenant_id, execution_id),
        
        -- DATA INTEGRITY: Business rule constraints
        CONSTRAINT check_execution_id_format CHECK (execution_id ~ '^[a-zA-Z0-9_-]+$'),
        CONSTRAINT check_duration_non_negative CHECK (duration >= 0),
        CONSTRAINT check_step_count_non_negative CHECK (step_count >= 0),
        CONSTRAINT check_end_time_after_start CHECK (end_time >= start_time),
        CONSTRAINT check_error_on_failure CHECK (
          (success = true AND error IS NULL) OR 
          (success = false AND error IS NOT NULL)
        )
      );
    `;

    // SECURITY HARDENED: Create organs table with proper constraints
    const createOrgansTable = `
      CREATE TABLE IF NOT EXISTS organs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organ_id VARCHAR(100) NOT NULL,
        tenant_id UUID NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        version VARCHAR(20) NOT NULL,
        definition JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'failed')),
        tags JSONB DEFAULT '[]'::jsonb,
        category VARCHAR(100) DEFAULT 'general',
        metadata JSONB DEFAULT '{}'::jsonb,
        is_template BOOLEAN DEFAULT false,
        created_by UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- SECURITY: Multi-tenant constraints
        CONSTRAINT fk_organs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        
        -- SECURITY: Tenant-scoped unique constraints
        CONSTRAINT unique_organ_id_per_tenant UNIQUE (tenant_id, organ_id),
        CONSTRAINT unique_organ_name_per_tenant UNIQUE (tenant_id, name),
        
        -- DATA INTEGRITY: Business rule constraints
        CONSTRAINT check_organ_id_format CHECK (organ_id ~ '^[a-zA-Z][a-zA-Z0-9_-]*$'),
        CONSTRAINT check_organ_id_length CHECK (char_length(organ_id) >= 3 AND char_length(organ_id) <= 100),
        CONSTRAINT check_organ_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
        CONSTRAINT check_organ_version_format CHECK (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$')
      );
    `;

    // SECURITY HARDENED: Create organ executions table with foreign keys and constraints
    const createOrganExecutionsTable = `
      CREATE TABLE IF NOT EXISTS organ_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id VARCHAR(100) NOT NULL,
        organ_id VARCHAR(100) NOT NULL,
        tenant_id UUID NOT NULL,
        executed_by UUID NOT NULL,
        input JSONB NOT NULL,
        output JSONB,
        success BOOLEAN NOT NULL,
        error TEXT,
        duration INTEGER NOT NULL DEFAULT 0,
        tissue_results JSONB DEFAULT '{}'::jsonb,
        tissue_count INTEGER DEFAULT 0,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- SECURITY: Multi-tenant foreign key constraints
        CONSTRAINT fk_organ_executions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        
        -- CRITICAL: Reference organ via composite key (tenant_id, organ_id)
        CONSTRAINT fk_organ_executions_organ FOREIGN KEY (tenant_id, organ_id) 
          REFERENCES organs(tenant_id, organ_id) ON DELETE CASCADE,
        
        -- SECURITY: Tenant-scoped unique execution IDs
        CONSTRAINT unique_organ_execution_id_per_tenant UNIQUE (tenant_id, execution_id),
        
        -- DATA INTEGRITY: Business rule constraints
        CONSTRAINT check_organ_execution_id_format CHECK (execution_id ~ '^[a-zA-Z0-9_-]+$'),
        CONSTRAINT check_organ_duration_non_negative CHECK (duration >= 0),
        CONSTRAINT check_organ_tissue_count_non_negative CHECK (tissue_count >= 0),
        CONSTRAINT check_organ_end_time_after_start CHECK (end_time >= start_time),
        CONSTRAINT check_organ_error_on_failure CHECK (
          (success = true AND error IS NULL) OR 
          (success = false AND error IS NOT NULL)
        )
      );
    `;

    // PERFORMANCE: Create optimized indexes for multi-tenant queries
    const createIndexes = `
      -- Primary tenant-scoped indexes for tissues
      CREATE INDEX IF NOT EXISTS idx_tissues_tenant_id ON tissues(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tissues_tenant_status ON tissues(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_tissues_tenant_category ON tissues(tenant_id, category);
      CREATE INDEX IF NOT EXISTS idx_tissues_tenant_template ON tissues(tenant_id, is_template);
      CREATE INDEX IF NOT EXISTS idx_tissues_created_at ON tissues(created_at DESC);
      
      -- Composite indexes for tissue executions
      CREATE INDEX IF NOT EXISTS idx_tissue_executions_tenant_tissue ON tissue_executions(tenant_id, tissue_id);
      CREATE INDEX IF NOT EXISTS idx_tissue_executions_tenant_success ON tissue_executions(tenant_id, success);
      CREATE INDEX IF NOT EXISTS idx_tissue_executions_tenant_created ON tissue_executions(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tissue_executions_executed_by ON tissue_executions(executed_by, created_at DESC);
      
      -- Primary tenant-scoped indexes for organs
      CREATE INDEX IF NOT EXISTS idx_organs_tenant_id ON organs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_organs_tenant_status ON organs(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_organs_tenant_category ON organs(tenant_id, category);
      
      -- Composite indexes for organ executions
      CREATE INDEX IF NOT EXISTS idx_organ_executions_tenant_organ ON organ_executions(tenant_id, organ_id);
      CREATE INDEX IF NOT EXISTS idx_organ_executions_tenant_success ON organ_executions(tenant_id, success);
      CREATE INDEX IF NOT EXISTS idx_organ_executions_tenant_created ON organ_executions(tenant_id, created_at DESC);
    `;

    // SECURITY: Create updated_at triggers for audit trail
    const createTriggers = `
      -- Trigger function for updating updated_at column
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Apply triggers to tissue tables
      DROP TRIGGER IF EXISTS trigger_update_tissues_updated_at ON tissues;
      CREATE TRIGGER trigger_update_tissues_updated_at
        BEFORE UPDATE ON tissues
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS trigger_update_organs_updated_at ON organs;
      CREATE TRIGGER trigger_update_organs_updated_at
        BEFORE UPDATE ON organs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `;

    // SECURITY: Execute all database hardening in proper order
    await execute_sql(ensureExtensions);
    await execute_sql(createTissuesTable);
    await execute_sql(createTissueExecutionsTable);
    await execute_sql(createOrgansTable);
    await execute_sql(createOrganExecutionsTable);
    await execute_sql(createIndexes);
    await execute_sql(createTriggers);

    console.log('[Tissues Init] Tissue Orchestrator database tables initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Tissue Orchestrator database tables initialized successfully',
      tables: ['tissues', 'tissue_executions', 'organs', 'organ_executions']
    });

  } catch (error) {
    console.error('[Tissues Init] Database initialization error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize Tissue Orchestrator database tables' },
      { status: 500 }
    );
  }
}