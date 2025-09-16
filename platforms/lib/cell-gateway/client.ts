/**
 * WebWaka Cell Gateway - API-driven Inter-cell Communication
 * Replaces direct cell imports with versioned HTTP APIs
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
  CellCapabilitiesResponse
} from '../cell-contracts/types';

// =============================================================================
// CIRCUIT BREAKER CONFIGURATION
// =============================================================================

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttempt = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.resetTimeout;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// =============================================================================
// CELL GATEWAY CLIENT
// =============================================================================

interface CellGatewayConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  circuitBreaker: CircuitBreakerConfig;
  headers: Record<string, string>;
}

const DEFAULT_CONFIG: CellGatewayConfig = {
  baseUrl: process.env.CELL_GATEWAY_URL || 'http://localhost:5000',
  timeout: 5000,
  retries: 2,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000,
    monitoringPeriod: 60000
  },
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'WebWaka-CellGateway/v1'
  }
};

export class CellGatewayClient {
  private config: CellGatewayConfig;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(config?: Partial<CellGatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getCircuitBreaker(cellName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(cellName)) {
      this.circuitBreakers.set(cellName, new CircuitBreaker(this.config.circuitBreaker));
    }
    return this.circuitBreakers.get(cellName)!;
  }

  private async makeRequest<T>(
    cellDomain: string,
    cellName: string,
    version: string,
    operation: string,
    data?: any,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST'
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(`${cellDomain}/${cellName}`);
    const requestId = crypto.randomUUID();
    
    return circuitBreaker.execute(async () => {
      const url = `${this.config.baseUrl}/api/cells/${cellDomain}/${cellName}/${version}/${operation}`;
      
      const headers = {
        ...this.config.headers,
        'X-Request-ID': requestId,
        'X-Tenant-ID': data?.tenantId || '',
        'X-User-ID': data?.userId || '',
        ...(data?.idempotencyKey && { 'Idempotency-Key': data.idempotencyKey })
      };

      let attempt = 0;
      let lastError: Error;

      while (attempt <= this.config.retries) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

          const response = await fetch(url, {
            method,
            headers,
            body: method !== 'GET' ? JSON.stringify(data) : undefined,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          return result as T;

        } catch (error) {
          lastError = error as Error;
          attempt++;
          
          if (attempt <= this.config.retries) {
            // Exponential backoff
            const delay = Math.pow(2, attempt) * 100;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError!;
    });
  }

  // =============================================================================
  // CUSTOMER PROFILE CELL CLIENT
  // =============================================================================

  async getCustomer(request: GetCustomerRequest & { tenantId: string }): Promise<GetCustomerResponse> {
    return this.makeRequest<GetCustomerResponse>(
      'customer', 
      'profile', 
      'v1', 
      'get-customer',
      request,
      'POST'
    );
  }

  // =============================================================================
  // B2B ACCESS CONTROL CELL CLIENT
  // =============================================================================

  async checkB2BAccess(request: B2BAccessCheckRequest & { tenantId: string }): Promise<B2BAccessCheckResponse> {
    return this.makeRequest<B2BAccessCheckResponse>(
      'ecommerce',
      'b2b-access-control',
      'v1',
      'check-access',
      request,
      'POST'
    );
  }

  // =============================================================================
  // CUSTOMER ENGAGEMENT CELL CLIENT
  // =============================================================================

  async trackEngagement(request: TrackEngagementRequest & { tenantId: string }): Promise<TrackEngagementResponse> {
    return this.makeRequest<TrackEngagementResponse>(
      'customer',
      'engagement', 
      'v1',
      'track-interaction',
      request,
      'POST'
    );
  }

  // =============================================================================
  // WHOLESALE PRICING TIERS CELL CLIENT
  // =============================================================================

  async calculateWholesalePrice(request: WholesalePriceRequest & { tenantId: string }): Promise<WholesalePriceResponse> {
    return this.makeRequest<WholesalePriceResponse>(
      'ecommerce',
      'wholesale-pricing',
      'v1', 
      'calculate-price',
      request,
      'POST'
    );
  }

  // =============================================================================
  // CELL HEALTH & CAPABILITIES
  // =============================================================================

  async getCellHealth(cellDomain: string, cellName: string): Promise<CellHealthResponse> {
    return this.makeRequest<CellHealthResponse>(
      cellDomain,
      cellName,
      'v1',
      'health',
      undefined,
      'GET'
    );
  }

  async getCellCapabilities(cellDomain: string, cellName: string): Promise<CellCapabilitiesResponse> {
    return this.makeRequest<CellCapabilitiesResponse>(
      cellDomain,
      cellName,
      'v1',
      'capabilities', 
      undefined,
      'GET'
    );
  }

  // =============================================================================
  // CIRCUIT BREAKER STATUS
  // =============================================================================

  getCircuitBreakerStatus(cellName: string): { state: CircuitState; failureCount: number } {
    const cb = this.circuitBreakers.get(cellName);
    return {
      state: cb?.getState() || CircuitState.CLOSED,
      failureCount: (cb as any)?.failureCount || 0
    };
  }

  getAllCircuitBreakerStatus(): Record<string, { state: CircuitState; failureCount: number }> {
    const status: Record<string, { state: CircuitState; failureCount: number }> = {};
    
    for (const [cellName] of this.circuitBreakers) {
      status[cellName] = this.getCircuitBreakerStatus(cellName);
    }
    
    return status;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let globalCellGateway: CellGatewayClient;

export function getCellGateway(config?: Partial<CellGatewayConfig>): CellGatewayClient {
  if (!globalCellGateway) {
    globalCellGateway = new CellGatewayClient(config);
  }
  return globalCellGateway;
}

// =============================================================================
// CONVENIENCE FUNCTIONS FOR COMMON OPERATIONS
// =============================================================================

export async function getCustomerFromCell(tenantId: string, customerId: string) {
  const gateway = getCellGateway();
  const response = await gateway.getCustomer({
    tenantId,
    customerId,
    includeAddresses: false,
    includeContacts: false,
    includeStats: false
  });
  
  if (!response.success) {
    throw new Error(`Customer fetch failed: ${response.error?.message}`);
  }
  
  return response.data!;
}

export async function checkB2BAccessFromCell(tenantId: string, userId: string, action: string) {
  const gateway = getCellGateway();
  const response = await gateway.checkB2BAccess({
    tenantId,
    userId,
    action: action as any
  });
  
  if (!response.success) {
    throw new Error(`B2B access check failed: ${response.error?.message}`);
  }
  
  return response.data!;
}

export async function trackEngagementFromCell(tenantId: string, customerId: string, interaction: any) {
  const gateway = getCellGateway();
  const response = await gateway.trackEngagement({
    tenantId,
    customerId,
    interaction
  });
  
  if (!response.success) {
    console.warn(`Engagement tracking failed: ${response.error?.message}`);
    return null; // Non-critical failure
  }
  
  return response.data!;
}

export async function calculateWholesalePriceFromCell(tenantId: string, request: WholesalePriceRequest) {
  const gateway = getCellGateway();
  const response = await gateway.calculateWholesalePrice({
    tenantId,
    ...request
  });
  
  if (!response.success) {
    throw new Error(`Wholesale price calculation failed: ${response.error?.message}`);
  }
  
  return response.data!;
}