import { cellBus } from '../loader/cell-bus';
import { cellLoader } from '../loader/cell-loader';
import { CellError } from '../core/cell';

// Tissue & Organ Composition - Higher-level biological assemblies
export class TissueOrchestrator {
  private compositions = new Map<string, TissueComposition>();
  private executionHistory = new Map<string, ExecutionResult[]>();

  // Register a Tissue composition
  async registerTissue(tissue: TissueDefinition): Promise<void> {
    this.validateTissueDefinition(tissue);
    
    const composition: TissueComposition = {
      definition: tissue,
      status: 'registered',
      cells: new Map(),
      dataflow: this.buildDataflowGraph(tissue),
      lastExecuted: null
    };

    this.compositions.set(tissue.id, composition);
    console.log(`[TissueOrchestrator] Registered Tissue ${tissue.id}`);
  }

  // Execute a Tissue composition
  async executeTissue(tissueId: string, input: any, options?: ExecutionOptions): Promise<TissueExecutionResult> {
    const composition = this.compositions.get(tissueId);
    if (!composition) {
      throw new Error(`Tissue ${tissueId} not found`);
    }

    const executionId = `${tissueId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[TissueOrchestrator] Executing Tissue ${tissueId} (${executionId})`);

    try {
      // Execute Tissue composition
      const result = await this.executeComposition(composition, input, executionId, options);
      
      // Record execution history
      this.recordExecution(tissueId, {
        executionId,
        tissueId,
        input,
        result: result.output,
        success: true,
        duration: result.duration,
        cellResults: result.cellResults,
        startTime: result.startTime,
        endTime: result.endTime
      });

      return result;
    } catch (error) {
      // Record failed execution
      this.recordExecution(tissueId, {
        executionId,
        tissueId,
        input,
        result: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: 0,
        cellResults: {},
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString()
      });

      throw error;
    }
  }

  // Create an Organ from multiple Tissues
  async createOrgan(organ: OrganDefinition): Promise<void> {
    this.validateOrganDefinition(organ);
    
    // Verify all constituent Tissues exist
    for (const tissueRef of organ.tissues) {
      if (!this.compositions.has(tissueRef.tissueId)) {
        throw new Error(`Tissue ${tissueRef.tissueId} not found for Organ ${organ.id}`);
      }
    }

    console.log(`[TissueOrchestrator] Created Organ ${organ.id} with ${organ.tissues.length} Tissues`);
  }

  // Execute an Organ composition
  async executeOrgan(organId: string, input: any): Promise<OrganExecutionResult> {
    // In a full implementation, this would orchestrate multiple Tissues
    // For now, return a placeholder structure
    
    const startTime = new Date().toISOString();
    
    // Placeholder execution
    const result = {
      organId,
      input,
      output: { organResult: 'placeholder' },
      tissueResults: {},
      startTime,
      endTime: new Date().toISOString(),
      duration: 100,
      success: true
    };

    console.log(`[TissueOrchestrator] Executed Organ ${organId}`);
    return result;
  }

  // Get Tissue execution history
  getExecutionHistory(tissueId: string, limit: number = 50): ExecutionResult[] {
    const history = this.executionHistory.get(tissueId) || [];
    return history.slice(-limit);
  }

  // Get Tissue health status
  async getTissueHealth(tissueId: string): Promise<TissueHealthStatus> {
    const composition = this.compositions.get(tissueId);
    if (!composition) {
      return { status: 'unknown', tissueId, message: 'Tissue not found' };
    }

    const history = this.getExecutionHistory(tissueId, 10);
    const recentFailures = history.filter(h => !h.success).length;
    const totalExecutions = history.length;
    
    let status: 'healthy' | 'degraded' | 'failed' | 'unknown' = 'healthy';
    let message = 'All systems operational';

    if (totalExecutions === 0) {
      status = 'unknown';
      message = 'No execution history';
    } else if (recentFailures > totalExecutions * 0.5) {
      status = 'failed';
      message = `High failure rate: ${recentFailures}/${totalExecutions}`;
    } else if (recentFailures > 0) {
      status = 'degraded';
      message = `Some failures detected: ${recentFailures}/${totalExecutions}`;
    }

    return {
      status,
      tissueId,
      message,
      recentFailures,
      totalExecutions,
      lastExecution: history[history.length - 1]?.endTime
    };
  }

  // List all registered compositions
  listCompositions(): { tissues: string[], organs: string[] } {
    const tissues = Array.from(this.compositions.keys());
    
    // In a full implementation, would track organs separately
    const organs: string[] = [];
    
    return { tissues, organs };
  }

  // Private helper methods

  private async executeComposition(
    composition: TissueComposition,
    input: any,
    executionId: string,
    options?: ExecutionOptions
  ): Promise<TissueExecutionResult> {
    const startTime = new Date().toISOString();
    const cellResults: Record<string, any> = {};
    
    // Execute cells according to dataflow graph
    const dataContext = { ...input };
    
    for (const step of composition.definition.steps) {
      try {
        // Execute Cell action
        const cellResult = await this.executeCellStep(step, dataContext, options);
        cellResults[step.id] = cellResult;
        
        // Update data context with outputs
        if (step.outputs) {
          for (const [outputKey, contextKey] of Object.entries(step.outputs)) {
            dataContext[contextKey] = cellResult[outputKey];
          }
        }
        
      } catch (error) {
        throw new CellError(step.cellId, step.action, 
          `Failed in Tissue ${composition.definition.id}, step ${step.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    
    // Extract final output
    const output = composition.definition.outputs ? 
      this.extractOutputs(dataContext, composition.definition.outputs) : 
      dataContext;

    return {
      executionId,
      tissueId: composition.definition.id,
      input,
      output,
      cellResults,
      startTime,
      endTime,
      duration,
      success: true
    };
  }

  private async executeCellStep(
    step: TissueStep,
    dataContext: any,
    options?: ExecutionOptions
  ): Promise<any> {
    // Prepare input from data context
    const stepInput = step.inputs ? 
      this.mapInputs(dataContext, step.inputs) : 
      dataContext;

    // Execute Cell action via Cell Bus
    const result = await cellBus.call(step.cellId, step.action, stepInput);
    
    console.log(`[TissueOrchestrator] Executed ${step.cellId}:${step.action} in step ${step.id}`);
    return result;
  }

  private mapInputs(dataContext: any, inputMapping: Record<string, string>): any {
    const mapped: any = {};
    
    for (const [stepKey, contextKey] of Object.entries(inputMapping)) {
      mapped[stepKey] = dataContext[contextKey];
    }
    
    return mapped;
  }

  private extractOutputs(dataContext: any, outputMapping: Record<string, string>): any {
    const outputs: any = {};
    
    for (const [outputKey, contextKey] of Object.entries(outputMapping)) {
      outputs[outputKey] = dataContext[contextKey];
    }
    
    return outputs;
  }

  private buildDataflowGraph(tissue: TissueDefinition): DataflowGraph {
    const nodes = tissue.steps.map(step => ({
      id: step.id,
      cellId: step.cellId,
      action: step.action,
      dependencies: this.findStepDependencies(step, tissue.steps)
    }));

    return { nodes, edges: [] };
  }

  private findStepDependencies(step: TissueStep, allSteps: TissueStep[]): string[] {
    if (!step.inputs) return [];
    
    const dependencies: string[] = [];
    
    // Find steps whose outputs are used as inputs for this step
    for (const [, contextKey] of Object.entries(step.inputs)) {
      for (const otherStep of allSteps) {
        if (otherStep.id !== step.id && otherStep.outputs) {
          for (const [, otherContextKey] of Object.entries(otherStep.outputs)) {
            if (otherContextKey === contextKey) {
              dependencies.push(otherStep.id);
            }
          }
        }
      }
    }
    
    return dependencies;
  }

  private validateTissueDefinition(tissue: TissueDefinition): void {
    if (!tissue.id || !tissue.name || !tissue.steps || tissue.steps.length === 0) {
      throw new Error('Invalid Tissue definition: missing required fields');
    }

    // Validate each step
    for (const step of tissue.steps) {
      if (!step.id || !step.cellId || !step.action) {
        throw new Error(`Invalid step in Tissue ${tissue.id}: missing required fields`);
      }
    }
  }

  private validateOrganDefinition(organ: OrganDefinition): void {
    if (!organ.id || !organ.name || !organ.tissues || organ.tissues.length === 0) {
      throw new Error('Invalid Organ definition: missing required fields');
    }
  }

  private recordExecution(tissueId: string, result: ExecutionResult): void {
    if (!this.executionHistory.has(tissueId)) {
      this.executionHistory.set(tissueId, []);
    }
    
    const history = this.executionHistory.get(tissueId)!;
    history.push(result);
    
    // Keep only last 100 executions
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }
}

// Types for Tissue & Organ composition

export interface TissueDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: TissueStep[];
  inputs?: Record<string, string>;  // input_name -> data_context_key
  outputs?: Record<string, string>; // output_name -> data_context_key
  metadata?: Record<string, any>;
}

export interface TissueStep {
  id: string;
  cellId: string;
  action: string;
  inputs?: Record<string, string>;  // cell_input -> data_context_key
  outputs?: Record<string, string>; // cell_output -> data_context_key
  condition?: string; // Optional execution condition
}

export interface OrganDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  tissues: TissueReference[];
  coordination: CoordinationStrategy;
  metadata?: Record<string, any>;
}

export interface TissueReference {
  tissueId: string;
  alias?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
}

export interface CoordinationStrategy {
  type: 'sequential' | 'parallel' | 'conditional' | 'event-driven';
  rules?: Record<string, any>;
}

export interface TissueComposition {
  definition: TissueDefinition;
  status: 'registered' | 'active' | 'paused' | 'error';
  cells: Map<string, any>;
  dataflow: DataflowGraph;
  lastExecuted: string | null;
}

export interface DataflowGraph {
  nodes: DataflowNode[];
  edges: DataflowEdge[];
}

export interface DataflowNode {
  id: string;
  cellId: string;
  action: string;
  dependencies: string[];
}

export interface DataflowEdge {
  from: string;
  to: string;
  dataKey: string;
}

export interface ExecutionOptions {
  timeout?: number;
  retryCount?: number;
  parallel?: boolean;
  skipFailures?: boolean;
}

export interface TissueExecutionResult {
  executionId: string;
  tissueId: string;
  input: any;
  output: any;
  cellResults: Record<string, any>;
  startTime: string;
  endTime: string;
  duration: number;
  success: boolean;
}

export interface OrganExecutionResult {
  organId: string;
  input: any;
  output: any;
  tissueResults: Record<string, TissueExecutionResult>;
  startTime: string;
  endTime: string;
  duration: number;
  success: boolean;
}

export interface ExecutionResult {
  executionId: string;
  tissueId: string;
  input: any;
  result: any;
  success: boolean;
  error?: string;
  duration: number;
  cellResults: Record<string, any>;
  startTime: string;
  endTime: string;
}

export interface TissueHealthStatus {
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  tissueId: string;
  message: string;
  recentFailures?: number;
  totalExecutions?: number;
  lastExecution?: string;
}

// Singleton orchestrator instance
export const tissueOrchestrator = new TissueOrchestrator();