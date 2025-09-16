/**
 * WebWaka Cell Gateway v2 - Production-Grade Inter-cell Communication
 * Enhanced with JSON Schema validation, advanced circuit breakers, correlation IDs, observability
 */

import { z } from 'zod';
import type { 
  CellResponse, 
  GetCustomerRequest, 
  GetCustomerResponse,
  B2BAccessCheckRequest,
  B2BAccessCheckResponse,
  TrackEngagementRequest,
  TrackEngagementResponse,
  WholesalePriceRequest,
  WholesalePriceResponse,
  CellHealthResponse,
  CellCapabilitiesResponse,
  CellError
} from '../cell-contracts/types';
import { CellResponseSchema } from '../cell-contracts/types';

// =============================================================================
// ENHANCED CIRCUIT BREAKER WITH METRICS & OBSERVABILITY
// =============================================================================

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  successThreshold: number; // Required successes in HALF_OPEN to close
  healthCheckInterval: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitMetrics {
  totalRequests: number;
  failedRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
  lastSuccessTime: number;
  lastFailureTime: number;
  stateChanges: Array<{
    fromState: CircuitState;
    toState: CircuitState;
    timestamp: number;
    reason: string;
  }>;
}

class EnhancedCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttempt = 0;
  private metrics: CircuitMetrics = {
    totalRequests: 0,
    failedRequests: 0,
    successfulRequests: 0,
    averageResponseTime: 0,
    lastSuccessTime: 0,
    lastFailureTime: 0,
    stateChanges: []
  };

  constructor(private config: CircuitBreakerConfig, private cellName: string) {}

  async execute<T>(operation: () => Promise<T>, correlationId: string): Promise<T> {
    this.metrics.totalRequests++;
    const startTime = Date.now();

    // Circuit breaker state logic
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        this.logCircuitEvent('BLOCKED', correlationId, 'Circuit OPEN - request blocked');
        throw new CellGatewayError('CIRCUIT_OPEN', `Circuit breaker OPEN for ${this.cellName}`, correlationId);
      }
      this.changeState(CircuitState.HALF_OPEN, 'Reset timeout reached, trying requests');
    }

    try {
      const result = await operation();
      const responseTime = Date.now() - startTime;
      this.onSuccess(responseTime, correlationId);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.onFailure(error as Error, responseTime, correlationId);
      throw error;
    }
  }

  private onSuccess(responseTime: number, correlationId: string) {
    this.successCount++;
    this.failureCount = 0; // Reset failure count on success
    this.metrics.successfulRequests++;
    this.metrics.lastSuccessTime = Date.now();
    this.updateAverageResponseTime(responseTime);

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.changeState(CircuitState.CLOSED, `${this.successCount} successful requests in HALF_OPEN`);
        this.successCount = 0;
      }
    }

    this.logCircuitEvent('SUCCESS', correlationId, `Response time: ${responseTime}ms`);
  }

  private onFailure(error: Error, responseTime: number, correlationId: string) {
    this.failureCount++;
    this.successCount = 0; // Reset success count on failure
    this.metrics.failedRequests++;
    this.metrics.lastFailureTime = Date.now();
    this.updateAverageResponseTime(responseTime);

    if (this.state === CircuitState.HALF_OPEN) {
      this.changeState(CircuitState.OPEN, 'Failure in HALF_OPEN state');
      this.nextAttempt = Date.now() + this.config.resetTimeout;
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
      this.changeState(CircuitState.OPEN, `${this.failureCount} consecutive failures`);
      this.nextAttempt = Date.now() + this.config.resetTimeout;
    }

    this.logCircuitEvent('FAILURE', correlationId, `Error: ${error.message}, Response time: ${responseTime}ms`);
  }

  private changeState(newState: CircuitState, reason: string) {
    const oldState = this.state;
    this.state = newState;
    
    this.metrics.stateChanges.push({
      fromState: oldState,
      toState: newState,
      timestamp: Date.now(),
      reason
    });

    // Keep only last 50 state changes to prevent memory bloat
    if (this.metrics.stateChanges.length > 50) {
      this.metrics.stateChanges = this.metrics.stateChanges.slice(-50);
    }

    console.log(`[CircuitBreaker:${this.cellName}] State change: ${oldState} → ${newState} (${reason})`);
  }

  private updateAverageResponseTime(responseTime: number) {
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageResponseTime = 
      ((this.metrics.averageResponseTime * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  private logCircuitEvent(eventType: string, correlationId: string, details: string) {
    console.log(`[CircuitBreaker:${this.cellName}:${eventType}] ${correlationId} - ${details}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitMetrics {
    return { ...this.metrics };
  }

  getHealthScore(): number {
    const totalRequests = this.metrics.totalRequests;
    if (totalRequests === 0) return 100;
    
    const successRate = (this.metrics.successfulRequests / totalRequests) * 100;
    const responsePenalty = Math.min(this.metrics.averageResponseTime / 100, 20); // Max 20 point penalty
    const statePenalty = this.state === CircuitState.OPEN ? 50 : (this.state === CircuitState.HALF_OPEN ? 25 : 0);
    
    return Math.max(0, Math.min(100, successRate - responsePenalty - statePenalty));
  }
}

// =============================================================================
// ENHANCED GATEWAY ERROR HANDLING
// =============================================================================

export class CellGatewayError extends Error {
  constructor(
    public code: string,
    message: string,
    public correlationId: string,
    public cellName?: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'CellGatewayError';
  }
}

// =============================================================================
// CORRELATION ID MANAGER
// =============================================================================

class CorrelationManager {
  private static currentId: string | null = null;

  static generate(): string {
    return crypto.randomUUID();
  }

  static getCurrent(): string {
    return this.currentId || this.generate();
  }

  static setCurrent(id: string): void {
    this.currentId = id;
  }

  static withCorrelation<T>(id: string, fn: () => T): T {
    const previousId = this.currentId;
    this.currentId = id;
    try {
      return fn();
    } finally {
      this.currentId = previousId;
    }
  }
}

// =============================================================================
// ENHANCED CELL GATEWAY CLIENT V2
// =============================================================================

interface CellGatewayV2Config {
  baseUrl: string;
  timeout: number;
  retries: number;
  circuitBreaker: CircuitBreakerConfig;
  headers: Record<string, string>;
  validation: {
    validateRequests: boolean;
    validateResponses: boolean;
    strictMode: boolean;
  };
  observability: {
    enableMetrics: boolean;
    enableTracing: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

const DEFAULT_V2_CONFIG: CellGatewayV2Config = {
  baseUrl: process.env.CELL_GATEWAY_URL || 'http://localhost:5000',
  timeout: 8000, // Increased from 5000
  retries: 3, // Increased from 2
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000,
    monitoringPeriod: 60000,
    successThreshold: 3, // New: required successes to close from HALF_OPEN
    healthCheckInterval: 10000 // New: health check interval
  },
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'WebWaka-CellGateway/v2',
    'Accept': 'application/json'
  },
  validation: {
    validateRequests: true,
    validateResponses: true,
    strictMode: true
  },
  observability: {
    enableMetrics: true,
    enableTracing: true,
    logLevel: 'info'
  }
};

export class CellGatewayV2Client {
  private config: CellGatewayV2Config;
  private circuitBreakers = new Map<string, EnhancedCircuitBreaker>();

  constructor(config?: Partial<CellGatewayV2Config>) {
    this.config = { ...DEFAULT_V2_CONFIG, ...config };
    
    if (this.config.observability.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  private getCircuitBreaker(cellName: string): EnhancedCircuitBreaker {
    const key = cellName;
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(key, new EnhancedCircuitBreaker(this.config.circuitBreaker, cellName));
    }
    return this.circuitBreakers.get(key)!;
  }

  private async makeValidatedRequest<TRequest, TResponse>(
    cellDomain: string,
    cellName: string,
    version: string,
    operation: string,
    data: TRequest & { tenantId: string; correlationId?: string },
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    requestSchema?: z.ZodSchema<TRequest>,
    responseSchema?: z.ZodSchema<TResponse>
  ): Promise<CellResponse<TResponse>> {
    const correlationId = data.correlationId || CorrelationManager.generate();
    const circuitBreaker = this.getCircuitBreaker(`${cellDomain}/${cellName}`);

    // Request validation
    if (this.config.validation.validateRequests && requestSchema) {
      try {
        requestSchema.parse(data);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new CellGatewayError(
            'VALIDATION_ERROR',
            `Request validation failed: ${error.errors.map(e => e.message).join(', ')}`,
            correlationId,
            `${cellDomain}/${cellName}`
          );
        }
      }
    }

    return circuitBreaker.execute(async () => {
      return this.executeHttpRequest<TResponse>(
        cellDomain, cellName, version, operation, data, method, correlationId, responseSchema
      );
    }, correlationId);
  }

  private async executeHttpRequest<TResponse>(
    cellDomain: string,
    cellName: string,
    version: string,
    operation: string,
    data: any,
    method: string,
    correlationId: string,
    responseSchema?: z.ZodSchema<TResponse>
  ): Promise<CellResponse<TResponse>> {
    const url = `${this.config.baseUrl}/api/cells/${cellDomain}/${cellName}/${version}/${operation}`;
    const startTime = Date.now();
    
    const headers = {
      ...this.config.headers,
      'X-Request-ID': data.requestId || crypto.randomUUID(),
      'X-Correlation-ID': correlationId,
      'X-Tenant-ID': data.tenantId || '',
      'X-User-ID': data.userId || '',
      'X-Timestamp': new Date().toISOString(),
      ...(data.idempotencyKey && { 'Idempotency-Key': data.idempotencyKey })
    };

    let attempt = 0;
    let lastError: Error;

    while (attempt <= this.config.retries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        this.log('debug', `[${correlationId}] Request attempt ${attempt + 1} to ${url}`, { headers, data });

        const response = await fetch(url, {
          method,
          headers,
          body: method !== 'GET' ? JSON.stringify(data) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        this.log('info', `[${correlationId}] Response received in ${responseTime}ms`, { 
          status: response.status,
          statusText: response.statusText
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new CellGatewayError(
            `HTTP_${response.status}`,
            `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
            correlationId,
            `${cellDomain}/${cellName}`,
            response.status,
            response.status >= 500 && response.status < 600 // 5xx errors are retryable
          );
        }

        const result = await response.json();

        // Response validation
        if (this.config.validation.validateResponses && responseSchema) {
          try {
            const cellResponseSchema = CellResponseSchema(responseSchema);
            cellResponseSchema.parse(result);
          } catch (error) {
            if (error instanceof z.ZodError) {
              this.log('warn', `[${correlationId}] Response validation failed`, { 
                errors: error.errors,
                response: result
              });
              
              if (this.config.validation.strictMode) {
                throw new CellGatewayError(
                  'RESPONSE_VALIDATION_ERROR',
                  `Response validation failed: ${error.errors.map(e => e.message).join(', ')}`,
                  correlationId,
                  `${cellDomain}/${cellName}`
                );
              }
            }
          }
        }

        return result as CellResponse<TResponse>;

      } catch (error) {
        const gatewayError = error as Error;
        lastError = gatewayError;
        attempt++;
        
        const isRetryable = gatewayError instanceof CellGatewayError ? gatewayError.retryable : true;
        
        if (attempt <= this.config.retries && isRetryable) {
          // Exponential backoff with jitter
          const baseDelay = Math.pow(2, attempt) * 100;
          const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
          const delay = baseDelay + jitter;
          
          this.log('warn', `[${correlationId}] Request failed, retrying in ${delay}ms`, { 
            error: gatewayError.message,
            attempt,
            maxRetries: this.config.retries
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          this.log('error', `[${correlationId}] Request failed after ${attempt} attempts`, { 
            error: gatewayError.message,
            isRetryable
          });
          break;
        }
      }
    }

    throw lastError!;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) {
    const levels: Record<'debug' | 'info' | 'warn' | 'error', number> = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.config.observability.logLevel]) {
      console.log(`[CellGatewayV2:${level.toUpperCase()}] ${message}`, data || '');
    }
  }

  private startMetricsCollection() {
    setInterval(() => {
      const allMetrics = this.getAllMetrics();
      this.log('info', 'Circuit breaker metrics collected', allMetrics);
    }, this.config.circuitBreaker.monitoringPeriod);
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  async getCustomer(request: GetCustomerRequest & { tenantId: string; correlationId?: string }): Promise<GetCustomerResponse> {
    const GetCustomerRequestSchema = z.object({
      customerId: z.string().uuid(),
      includeAddresses: z.boolean().default(false),
      includeContacts: z.boolean().default(false),
      includeStats: z.boolean().default(false),
      tenantId: z.string().uuid()
    });

    return this.makeValidatedRequest(
      'customer',
      'profile', 
      'v1',
      'get-customer',
      request,
      'POST',
      GetCustomerRequestSchema
    ) as Promise<GetCustomerResponse>;
  }

  // =============================================================================
  // OBSERVABILITY & MONITORING
  // =============================================================================

  getAllMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [cellName, circuitBreaker] of this.circuitBreakers) {
      metrics[cellName] = {
        ...circuitBreaker.getMetrics(),
        state: circuitBreaker.getState(),
        healthScore: circuitBreaker.getHealthScore()
      };
    }
    
    return metrics;
  }

  getCircuitBreakerStatus(cellName: string): { state: CircuitState; metrics: CircuitMetrics; healthScore: number } | null {
    const cb = this.circuitBreakers.get(cellName);
    if (!cb) return null;
    
    return {
      state: cb.getState(),
      metrics: cb.getMetrics(),
      healthScore: cb.getHealthScore()
    };
  }

  async healthCheck(): Promise<Record<string, any>> {
    const health: Record<string, any> = {
      status: 'healthy',
      version: 'v2',
      timestamp: new Date().toISOString(),
      circuits: {}
    };

    for (const [cellName, circuitBreaker] of this.circuitBreakers) {
      health.circuits[cellName] = {
        state: circuitBreaker.getState(),
        healthScore: circuitBreaker.getHealthScore()
      };
    }

    health.status = Object.values(health.circuits).some((circuit: any) => circuit.healthScore < 50) ? 'degraded' : 'healthy';
    
    return health;
  }
}

// =============================================================================
// SINGLETON & CONVENIENCE EXPORTS
// =============================================================================

let globalGatewayV2: CellGatewayV2Client;

export function getCellGatewayV2(config?: Partial<CellGatewayV2Config>): CellGatewayV2Client {
  if (!globalGatewayV2) {
    globalGatewayV2 = new CellGatewayV2Client(config);
  }
  return globalGatewayV2;
}

export { CorrelationManager };