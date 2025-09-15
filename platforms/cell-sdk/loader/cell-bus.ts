import { 
  CellContract, 
  CellError, 
  CellValidationError,
  CellSDKConfig,
  DEFAULT_CELL_CONFIG 
} from '../core/cell';
import { cellRegistry } from '../registry/cell-registry';

// Server-side Cell Bus for RPC calls between Cells
export class CellBus implements CellContract {
  private config: CellSDKConfig;
  private connectionPool = new Map<string, any>();
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(config: Partial<CellSDKConfig> = {}) {
    this.config = { ...DEFAULT_CELL_CONFIG, ...config };
  }

  // Call a remote Cell action via RPC
  async call(cellId: string, action: string, payload: any): Promise<any> {
    const circuitBreaker = this.getCircuitBreaker(cellId);
    
    if (circuitBreaker.isOpen()) {
      throw new CellError(cellId, action, 'Circuit breaker is open - Cell unavailable');
    }

    try {
      const result = await circuitBreaker.execute(async () => {
        return await this.executeRemoteCall(cellId, action, payload);
      });
      
      return result;
    } catch (error) {
      throw new CellError(
        cellId, 
        action, 
        error instanceof Error ? error.message : 'Remote call failed'
      );
    }
  }

  // Render method not applicable for server-side
  async render(cellId: string, props: any): Promise<any> {
    throw new Error('Render not supported on server-side Cell Bus');
  }

  // Validate payload using Cell schema (simplified for now)
  validate(payload: any, schema: any): boolean {
    // TODO: Implement proper schema validation with consistent format
    // For now, just do basic validation
    return payload !== null && payload !== undefined;
  }

  // Health check for Cell
  async healthCheck(cellId: string): Promise<boolean> {
    try {
      const entry = await cellRegistry.resolveCell(cellId);
      const response = await fetch(`${entry.artifacts.serverBundle}/health`, {
        method: 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Batch call multiple Cells
  async batchCall(calls: Array<{cellId: string, action: string, payload: any}>): Promise<any[]> {
    const promises = calls.map(({ cellId, action, payload }) => 
      this.call(cellId, action, payload).catch(error => ({ error: error.message }))
    );
    
    return await Promise.all(promises);
  }

  // Private helper methods
  private async executeRemoteCall(cellId: string, action: string, payload: any): Promise<any> {
    const entry = await cellRegistry.resolveCell(cellId, this.config.defaultChannel);
    
    if (!entry.artifacts.serverBundle) {
      throw new Error(`No server bundle available for Cell ${cellId}`);
    }

    // Validate input payload
    await this.validatePayload(cellId, action, payload, 'input');

    // Make RPC call to Cell's server endpoint
    const response = await fetch(`${entry.artifacts.serverBundle}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cell-Version': entry.manifest.version,
        'X-Cell-Channel': this.config.defaultChannel
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Cell ${cellId} action ${action} failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Validate output
    await this.validatePayload(cellId, action, result, 'output');
    
    return result;
  }

  private async validatePayload(cellId: string, action: string, payload: any, type: 'input' | 'output'): Promise<void> {
    // Skip validation for now due to schema format inconsistencies
    // TODO: Implement proper schema validation with consistent format
    return;
  }

  private getCircuitBreaker(cellId: string): CircuitBreaker {
    if (!this.circuitBreakers.has(cellId)) {
      this.circuitBreakers.set(cellId, new CircuitBreaker({
        threshold: 5,
        timeout: 60000,
        resetTimeout: 30000
      }));
    }
    return this.circuitBreakers.get(cellId)!;
  }
}

// Simple Circuit Breaker implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(private options: {
    threshold: number;
    timeout: number;
    resetTimeout: number;
  }) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), this.options.timeout)
        )
      ]);
      
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.options.threshold) {
      this.state = 'open';
    }
  }
}

// Singleton bus instance
export const cellBus = new CellBus();