import { z } from 'zod';

// Core Cell Interface - the fundamental unit of the WebWaka Biological system
export interface Cell {
  id: string;
  sector: string;
  name: string;
  version: string;
  manifest: CellManifest;
  execute(action: string, payload: any): Promise<any>;
}

// Cell Manifest Schema - defines Cell structure and capabilities
export const CellManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  sector: z.string(),
  version: z.string(),
  description: z.string(),
  channels: z.array(z.enum(['stable', 'canary', 'experimental'])),
  inputs: z.record(z.any()),
  outputs: z.record(z.any()),
  actions: z.array(z.string()),
  dependencies: z.array(z.string()).optional(),
  clientBundleUrl: z.string().optional(),
  serverBundleUrl: z.string().optional(),
  schemaUrl: z.string(),
  signature: z.string().optional(),
  created: z.string(),
  updated: z.string()
});

export type CellManifest = z.infer<typeof CellManifestSchema>;

// Cell Runtime Contract - defines how Cells communicate
export interface CellContract {
  call(cellId: string, action: string, payload: any): Promise<any>;
  render(cellId: string, props: any): Promise<any>;
  validate(payload: any, schema: any): boolean;
}

// Cell Channel - manages version and deployment channels
export interface CellChannel {
  name: 'stable' | 'canary' | 'experimental';
  version: string;
  alias: string;
  autoAdvance: boolean;
  pinnedMajor?: number;
  pinnedMinor?: number;
}

// Cell Registry Entry - how Cells are stored in the registry
export interface CellRegistryEntry {
  manifest: CellManifest;
  channels: Record<string, CellChannel>;
  artifacts: {
    clientBundle?: string;
    serverBundle?: string;
    schema: string;
  };
  metadata: {
    downloads: number;
    lastAccessed: string;
    health: 'healthy' | 'degraded' | 'failed';
  };
}

// Cell Error Types - standardized error handling
export class CellError extends Error {
  constructor(
    public cellId: string, 
    public action: string, 
    message: string,
    public code: string = 'CELL_ERROR'
  ) {
    super(`[${cellId}:${action}] ${message}`);
    this.name = 'CellError';
  }
}

export class CellNotFoundError extends CellError {
  constructor(cellId: string) {
    super(cellId, '', `Cell ${cellId} not found in registry`, 'CELL_NOT_FOUND');
  }
}

export class CellValidationError extends CellError {
  constructor(cellId: string, action: string, details: string) {
    super(cellId, action, `Validation failed: ${details}`, 'CELL_VALIDATION_ERROR');
  }
}

// Cell SDK Configuration
export interface CellSDKConfig {
  registryUrl: string;
  defaultChannel: 'stable' | 'canary' | 'experimental';
  cacheTimeout: number;
  maxRetries: number;
  enableSignatureVerification: boolean;
  allowedOrigins: string[];
}

export const DEFAULT_CELL_CONFIG: CellSDKConfig = {
  registryUrl: process.env.CELL_REGISTRY_URL || 'https://registry.webwaka.bio',
  defaultChannel: 'stable',
  cacheTimeout: 300000, // 5 minutes
  maxRetries: 3,
  enableSignatureVerification: process.env.NODE_ENV === 'production', // Disabled in development
  allowedOrigins: ['https://registry.webwaka.bio', 'http://localhost:3000', 'http://localhost:5000']
};