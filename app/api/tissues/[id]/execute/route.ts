import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth-server';
import { tissueOrchestrator } from '../../../../cell-sdk/composition/tissue-orchestrator';
import { execute_sql } from '../../../../lib/database';
import { z } from 'zod';

// Validation schema for execution input
const ExecuteRequestSchema = z.object({
  input: z.record(z.any()),
  options: z.object({
    timeout: z.number().optional(),
    retryCount: z.number().optional(),
    parallel: z.boolean().optional(),
    skipFailures: z.boolean().optional()
  }).optional()
});

interface RouteParams {
  params: {
    id: string;
  };
}

// POST /api/tissues/[id]/execute - Execute tissue workflow
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tissueId = params.id;
    const body = await request.json();
    const { input, options } = ExecuteRequestSchema.parse(body);

    // Verify tissue exists and user has access using raw SQL
    const verifyQuery = `
      SELECT * FROM tissues 
      WHERE tissue_id = $1 AND tenant_id = $2 
      LIMIT 1
    `;
    
    const verifyResult = await execute_sql(verifyQuery, [tissueId, user.tenant_id]); // SECURITY FIX: Use proper tenant_id
    
    if (verifyResult.rows.length === 0) {
      return NextResponse.json({ error: 'Tissue not found' }, { status: 404 });
    }

    const tissue = verifyResult.rows[0];

    // COMPLIANCE FIX: Ensure ALL executions are logged (success AND failure)
    let executionResult: any = null;
    let executionError: string | null = null;
    const executionId = `${tissueId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date().toISOString();
    let endTime = startTime;
    let duration = 0;

    try {
      // SECURITY FIX: Ensure tissue is registered before execution with proper tenant scoping
      const isRegistered = await tissueOrchestrator.ensureTissueRegistered(user.tenant_id, tissueId);
      if (!isRegistered) {
        throw new Error(`Tissue ${tissueId} not found in database or failed to register for tenant ${user.tenant_id}`);
      }

      // SECURITY FIX: Execute tissue via orchestrator with proper tenant scoping
      executionResult = await tissueOrchestrator.executeTissue(
        user.tenant_id,
        tissueId,
        input,
        options
      );
      endTime = new Date().toISOString();
      duration = new Date(endTime).getTime() - new Date(startTime).getTime();

      // Log successful execution to database
      const logExecutionQuery = `
        INSERT INTO tissue_executions (
          execution_id, tissue_id, tenant_id, executed_by, input, output, 
          success, duration, cell_results, step_count, start_time, end_time, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `;
      
      await execute_sql(logExecutionQuery, [
        executionResult.executionId,
        tissueId,
        user.tenant_id, // SECURITY FIX: Use proper tenant_id
        user.id, // Keep user.id for executed_by field
        JSON.stringify(executionResult.input),
        JSON.stringify(executionResult.output),
        executionResult.success,
        executionResult.duration,
        JSON.stringify(executionResult.cellResults),
        executionResult.cellResults ? Object.keys(executionResult.cellResults).length : 0,
        executionResult.startTime,
        executionResult.endTime,
        JSON.stringify({ options, steps: executionResult.cellResults ? Object.keys(executionResult.cellResults).length : 0 })
      ]);

      return NextResponse.json({
        success: true,
        execution: executionResult,
        message: 'Tissue executed successfully'
      });

    } catch (error) {
      // COMPLIANCE FIX: Log failed executions to database
      endTime = new Date().toISOString();
      duration = new Date(endTime).getTime() - new Date(startTime).getTime();
      executionError = error instanceof Error ? error.message : 'Unknown error';

      const logFailedExecutionQuery = `
        INSERT INTO tissue_executions (
          execution_id, tissue_id, tenant_id, executed_by, input, output, 
          success, error, duration, cell_results, step_count, start_time, end_time, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;
      
      try {
        await execute_sql(logFailedExecutionQuery, [
          executionId,
          tissueId,
          user.tenant_id,
          user.id,
          JSON.stringify(input),
          null, // No output for failed execution
          false, // success = false
          executionError,
          duration,
          JSON.stringify({}), // Empty cell results for failure
          0, // No steps completed
          startTime,
          endTime,
          JSON.stringify({ options, error: executionError, failed: true })
        ]);
      } catch (logError) {
        console.error('[AUDIT LOG FAILURE] Failed to log execution failure:', logError);
        // Continue with original error response - don't let audit logging failure mask the original error
      }

      // Re-throw the original error for proper error handling
      throw error;
    }

  } catch (error) {
    console.error('[Tissues Execute API] POST error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid execution request', details: error.errors },
        { status: 400 }
      );
    }

    // Check if it's a tissue orchestrator error
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Tissue not registered in orchestrator' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('Failed in Tissue')) {
        return NextResponse.json(
          { error: 'Tissue execution failed', details: error.message },
          { status: 422 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to execute tissue' },
      { status: 500 }
    );
  }
}

// GET /api/tissues/[id]/execute - Get execution history
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tissueId = params.id;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    // Verify tissue exists and user has access using raw SQL
    const verifyQuery = `
      SELECT * FROM tissues 
      WHERE tissue_id = $1 AND tenant_id = $2 
      LIMIT 1
    `;
    
    const verifyResult = await execute_sql(verifyQuery, [tissueId, user.tenant_id]); // SECURITY FIX: Use proper tenant_id
    
    if (verifyResult.rows.length === 0) {
      return NextResponse.json({ error: 'Tissue not found' }, { status: 404 });
    }

    // Get execution history from database using raw SQL
    const executionsQuery = `
      SELECT * FROM tissue_executions 
      WHERE tissue_id = $1 AND tenant_id = $2 
      ORDER BY created_at DESC 
      LIMIT $3
    `;
    
    const executionsResult = await execute_sql(executionsQuery, [tissueId, user.tenant_id, limit]); // SECURITY FIX: Use proper tenant_id
    const executions = executionsResult.rows;

    // SECURITY FIX: Get current health status from orchestrator with proper tenant scoping
    const healthStatus = await tissueOrchestrator.getTissueHealth(user.tenant_id, tissueId);

    return NextResponse.json({
      success: true,
      tissueId,
      executions,
      health: healthStatus,
      totalCount: executions.length
    });

  } catch (error) {
    console.error('[Tissues Execute API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution history' },
      { status: 500 }
    );
  }
}