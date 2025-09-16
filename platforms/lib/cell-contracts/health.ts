/**
 * WebWaka Cell Health System - Standardized Health Endpoints
 * Provides consistent health monitoring across all cells
 */

import { z } from 'zod';

// =============================================================================
// HEALTH CHECK SCHEMA DEFINITIONS
// =============================================================================

export const CellHealthStatusSchema = z.enum([
  'healthy',     // All systems operational
  'degraded',    // Some issues but still functional
  'unhealthy',   // Critical issues affecting functionality
  'unknown'      // Unable to determine health status
]);

export const CellDependencyHealthSchema = z.object({
  name: z.string(),                    // Dependency name
  type: z.enum(['database', 'redis', 'external_api', 'cell', 'service']),
  status: CellHealthStatusSchema,
  responseTime: z.number().optional(), // Response time in ms
  lastChecked: z.string().datetime(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const CellHealthCheckResultSchema = z.object({
  cellName: z.string(),
  cellDomain: z.string(),
  version: z.string(),
  status: CellHealthStatusSchema,
  timestamp: z.string().datetime(),
  uptime: z.number(),                  // Uptime in seconds
  dependencies: z.array(CellDependencyHealthSchema),
  metrics: z.object({
    requestCount: z.number().int().min(0),
    errorCount: z.number().int().min(0),
    averageResponseTime: z.number().min(0),
    successRate: z.number().min(0).max(100), // Percentage
    circuitBreakerState: z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']).optional(),
    memoryUsage: z.number().optional(),      // Memory usage in MB
    cpuUsage: z.number().optional()          // CPU usage percentage
  }),
  checks: z.array(z.object({
    name: z.string(),
    status: CellHealthStatusSchema,
    message: z.string().optional(),
    duration: z.number().optional(),         // Check duration in ms
    metadata: z.record(z.any()).optional()
  })),
  environment: z.object({
    nodeVersion: z.string().optional(),
    platform: z.string().optional(),
    memory: z.object({
      total: z.number(),
      used: z.number(),
      available: z.number()
    }).optional()
  }).optional()
});

export const CellHealthResponseSchema = z.object({
  version: z.literal('v1'),
  requestId: z.string().uuid(),
  success: z.boolean(),
  data: CellHealthCheckResultSchema,
  timestamp: z.string().datetime()
});

export type CellHealthStatus = z.infer<typeof CellHealthStatusSchema>;
export type CellDependencyHealth = z.infer<typeof CellDependencyHealthSchema>;
export type CellHealthCheckResult = z.infer<typeof CellHealthCheckResultSchema>;
export type CellHealthResponse = z.infer<typeof CellHealthResponseSchema>;

// =============================================================================
// HEALTH CHECK EXECUTOR
// =============================================================================

export interface HealthCheck {
  name: string;
  description: string;
  execute(): Promise<{
    status: CellHealthStatus;
    message?: string;
    duration: number;
    metadata?: Record<string, any>;
  }>;
}

export class CellHealthChecker {
  private checks: HealthCheck[] = [];
  private dependencies: CellDependencyHealth[] = [];
  private startTime = Date.now();
  
  constructor(
    private cellName: string,
    private cellDomain: string,
    private version: string = 'v1'
  ) {}

  addHealthCheck(check: HealthCheck): void {
    this.checks.push(check);
  }

  addDependency(dependency: Omit<CellDependencyHealth, 'lastChecked'>): void {
    this.dependencies.push({
      ...dependency,
      lastChecked: new Date().toISOString()
    });
  }

  async executeHealthCheck(): Promise<CellHealthCheckResult> {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Execute all health checks in parallel
    const checkResults = await Promise.all(
      this.checks.map(async (check) => {
        const startTime = Date.now();
        try {
          const result = await check.execute();
          return {
            name: check.name,
            status: result.status,
            message: result.message,
            duration: Date.now() - startTime,
            metadata: result.metadata
          };
        } catch (error) {
          return {
            name: check.name,
            status: 'unhealthy' as CellHealthStatus,
            message: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime
          };
        }
      })
    );

    // Check dependencies health
    const updatedDependencies = await Promise.all(
      this.dependencies.map(async (dep) => {
        try {
          const startTime = Date.now();
          const healthResult = await this.checkDependencyHealth(dep);
          return {
            ...dep,
            ...healthResult,
            responseTime: Date.now() - startTime,
            lastChecked: new Date().toISOString()
          };
        } catch (error) {
          return {
            ...dep,
            status: 'unhealthy' as CellHealthStatus,
            error: error instanceof Error ? error.message : 'Unknown error',
            lastChecked: new Date().toISOString()
          };
        }
      })
    );

    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(checkResults, updatedDependencies);

    // Collect metrics (mock data for now - would be replaced with actual metrics)
    const metrics = {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      successRate: 100,
      circuitBreakerState: 'CLOSED' as const,
      memoryUsage: process.memoryUsage?.().heapUsed / 1024 / 1024,
      cpuUsage: 0
    };

    const result: CellHealthCheckResult = {
      cellName: this.cellName,
      cellDomain: this.cellDomain,
      version: this.version,
      status: overallStatus,
      timestamp,
      uptime,
      dependencies: updatedDependencies,
      metrics,
      checks: checkResults,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          total: process.memoryUsage?.().heapTotal / 1024 / 1024 || 0,
          used: process.memoryUsage?.().heapUsed / 1024 / 1024 || 0,
          available: (process.memoryUsage?.().heapTotal - process.memoryUsage?.().heapUsed) / 1024 / 1024 || 0
        }
      }
    };

    return result;
  }

  private async checkDependencyHealth(dependency: CellDependencyHealth): Promise<Partial<CellDependencyHealth>> {
    switch (dependency.type) {
      case 'database':
        return this.checkDatabaseHealth(dependency);
      case 'redis':
        return this.checkRedisHealth(dependency);
      case 'external_api':
        return this.checkExternalApiHealth(dependency);
      case 'cell':
        return this.checkCellHealth(dependency);
      default:
        return { status: 'unknown' };
    }
  }

  private async checkDatabaseHealth(dependency: CellDependencyHealth): Promise<Partial<CellDependencyHealth>> {
    // Mock database health check - would be replaced with actual DB ping
    return {
      status: 'healthy',
      metadata: { tables: 'accessible', connections: 'available' }
    };
  }

  private async checkRedisHealth(dependency: CellDependencyHealth): Promise<Partial<CellDependencyHealth>> {
    // Mock Redis health check - would be replaced with actual Redis ping
    return {
      status: 'healthy',
      metadata: { ping: 'pong', connections: 'available' }
    };
  }

  private async checkExternalApiHealth(dependency: CellDependencyHealth): Promise<Partial<CellDependencyHealth>> {
    // Mock external API health check
    return {
      status: 'healthy',
      metadata: { endpoint: 'reachable', latency: '< 100ms' }
    };
  }

  private async checkCellHealth(dependency: CellDependencyHealth): Promise<Partial<CellDependencyHealth>> {
    // Mock cell health check - would make actual HTTP call to cell's health endpoint
    return {
      status: 'healthy',
      metadata: { endpoint: '/health', response: 'ok' }
    };
  }

  private calculateOverallStatus(
    checks: Array<{ status: CellHealthStatus }>,
    dependencies: Array<{ status: CellHealthStatus }>
  ): CellHealthStatus {
    const allStatuses = [...checks.map(c => c.status), ...dependencies.map(d => d.status)];
    
    if (allStatuses.some(s => s === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (allStatuses.some(s => s === 'degraded')) {
      return 'degraded';
    }
    
    if (allStatuses.some(s => s === 'unknown')) {
      return 'unknown';
    }
    
    return 'healthy';
  }
}

// =============================================================================
// COMMON HEALTH CHECKS
// =============================================================================

export const CommonHealthChecks = {
  // Database connectivity check
  databaseConnection: (testQuery: () => Promise<boolean>): HealthCheck => ({
    name: 'database_connection',
    description: 'Verify database connectivity',
    async execute() {
      const startTime = Date.now();
      try {
        const isConnected = await testQuery();
        return {
          status: isConnected ? 'healthy' : 'unhealthy',
          message: isConnected ? 'Database connection successful' : 'Database connection failed',
          duration: Date.now() - startTime,
          metadata: { connectionTest: isConnected }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: Date.now() - startTime
        };
      }
    }
  }),

  // Memory usage check
  memoryUsage: (thresholdMB: number = 500): HealthCheck => ({
    name: 'memory_usage',
    description: 'Monitor memory usage levels',
    async execute() {
      const used = process.memoryUsage().heapUsed / 1024 / 1024;
      const status: CellHealthStatus = used > thresholdMB ? 'degraded' : 'healthy';
      
      return {
        status,
        message: `Memory usage: ${used.toFixed(2)} MB`,
        duration: 1,
        metadata: {
          usedMB: Math.round(used),
          thresholdMB,
          withinLimits: used <= thresholdMB
        }
      };
    }
  }),

  // Disk space check
  diskSpace: (thresholdPercent: number = 90): HealthCheck => ({
    name: 'disk_space',
    description: 'Monitor available disk space',
    async execute() {
      // Mock disk space check - would use actual filesystem stats
      const usedPercent = 45; // Mock value
      const status: CellHealthStatus = usedPercent > thresholdPercent ? 'degraded' : 'healthy';
      
      return {
        status,
        message: `Disk usage: ${usedPercent}%`,
        duration: 5,
        metadata: {
          usedPercent,
          thresholdPercent,
          withinLimits: usedPercent <= thresholdPercent
        }
      };
    }
  })
};

// =============================================================================
// FACTORY FOR STANDARD CELL HEALTH CHECKERS
// =============================================================================

export function createCellHealthChecker(
  cellName: string,
  cellDomain: string,
  version: string = 'v1'
): CellHealthChecker {
  const checker = new CellHealthChecker(cellName, cellDomain, version);
  
  // Add common health checks
  checker.addHealthCheck(CommonHealthChecks.memoryUsage());
  checker.addHealthCheck(CommonHealthChecks.diskSpace());
  
  return checker;
}