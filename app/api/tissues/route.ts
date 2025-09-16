import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth-server';
import { TissueDefinition, tissueOrchestrator } from '../../../cell-sdk/composition/tissue-orchestrator';
import { execute_sql } from '../../../lib/database';
import { z } from 'zod';

// Validation schemas
const TissueDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  steps: z.array(z.object({
    id: z.string().min(1),
    cellId: z.string().min(1),
    action: z.string().min(1),
    inputs: z.record(z.string()).optional(),
    outputs: z.record(z.string()).optional(),
    condition: z.string().optional()
  })),
  inputs: z.record(z.string()).optional(),
  outputs: z.record(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

// GET /api/tissues - List all tissues
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get tissues from database using raw SQL
    const query = `
      SELECT tissue_id, name, description, version, definition, status, 
             tags, category, metadata, is_template, created_by, created_at, updated_at
      FROM tissues 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await execute_sql(query, [user.tenant_id]); // SECURITY FIX: Use proper tenant_id
    const tissueRecords = result.rows;

    // SECURITY FIX: Get runtime status from orchestrator with proper tenant scoping
    const compositions = tissueOrchestrator.listCompositions(user.tenant_id);
    
    const tissuesWithStatus = await Promise.all(tissueRecords.map(async (tissue: any) => ({
      ...tissue,
      registered: compositions.tissues.includes(tissue.tissue_id),
      health: compositions.tissues.includes(tissue.tissue_id) 
        ? await tissueOrchestrator.getTissueHealth(user.tenant_id, tissue.tissue_id)
        : null
    })));

    return NextResponse.json({
      success: true,
      tissues: tissuesWithStatus,
      totalCount: tissueRecords.length
    });

  } catch (error) {
    console.error('[Tissues API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tissues' },
      { status: 500 }
    );
  }
}

// POST /api/tissues - Create new tissue
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!['SuperAdmin', 'Admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const tissueDefinition = TissueDefinitionSchema.parse(body);

    // Save to database using raw SQL
    const insertQuery = `
      INSERT INTO tissues (
        tissue_id, tenant_id, name, description, version, 
        definition, status, tags, category, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const result = await execute_sql(insertQuery, [
      tissueDefinition.id,
      user.tenant_id, // SECURITY FIX: Use proper tenant_id
      tissueDefinition.name,
      tissueDefinition.description,
      tissueDefinition.version,
      JSON.stringify(tissueDefinition),
      'draft',
      JSON.stringify([]),
      'general',
      JSON.stringify({}),
      user.id
    ]);

    const tissueRecord = result.rows[0];

    // SECURITY FIX: Register with orchestrator using proper tenant scoping
    await tissueOrchestrator.registerTissue(user.tenant_id, tissueDefinition);

    return NextResponse.json({
      success: true,
      tissue: tissueRecord,
      message: 'Tissue created and registered successfully'
    });

  } catch (error) {
    console.error('[Tissues API] POST error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid tissue definition', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create tissue' },
      { status: 500 }
    );
  }
}