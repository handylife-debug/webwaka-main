import React from 'react';
import { 
  Cell, 
  CellContract, 
  CellError, 
  CellValidationError,
  CellSDKConfig,
  DEFAULT_CELL_CONFIG 
} from '../core/cell';
import { cellRegistry } from '../registry/cell-registry';

// Client-side Cell Loader for dynamic imports
export class CellLoader implements CellContract {
  private config: CellSDKConfig;
  private loadedCells = new Map<string, any>();
  private schemaCache = new Map<string, any>();

  constructor(config: Partial<CellSDKConfig> = {}) {
    this.config = { ...DEFAULT_CELL_CONFIG, ...config };
  }

  // Client-side Cell actions must go through RPC to server (CellBus)
  async call(cellId: string, action: string, payload: any): Promise<any> {
    // On client-side, we need to make RPC call to server
    if (typeof window !== 'undefined') {
      // Browser environment - make HTTP request to Cell action endpoint
      try {
        const response = await fetch(`/api/cells/${cellId}/actions/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Cell-Channel': this.config.defaultChannel
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          throw new Error(`Cell ${cellId} action ${action} failed: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        throw new CellError(cellId, action, error instanceof Error ? error.message : 'RPC call failed');
      }
    } else {
      // Server environment - should use CellBus directly
      throw new Error('CellLoader.call() should not be used on server-side. Use CellBus instead.');
    }
  }

  // Render a Cell component (client-side)
  async render(cellId: string, props: any, channel: string = 'stable'): Promise<React.ComponentType<any>> {
    try {
      const [sector, name] = cellId.split('/');
      
      // For now, use static imports for known cells to avoid Next.js dynamic import issues
      const CellComponent = await this.loadKnownCell(cellId);
      
      if (!CellComponent) {
        throw new Error(`Cell ${cellId} not found or not registered`);
      }
      
      // Return wrapped component with error boundary
      return this.wrapWithErrorBoundary(CellComponent, cellId);
      
    } catch (error) {
      throw new CellError(cellId, 'render', error instanceof Error ? error.message : 'Render failed');
    }
  }

  // Validate payload against Cell schema (simplified for now)
  validate(payload: any, schema: any): boolean {
    // TODO: Implement proper schema validation
    // For now, just do basic type checking
    return payload !== null && payload !== undefined;
  }

  // Load Cell metadata (removed server cell loading from client)
  private async loadCellMetadata(cellId: string, channel: string): Promise<any> {
    const cacheKey = `${cellId}:${channel}`;
    
    if (this.loadedCells.has(cacheKey)) {
      return this.loadedCells.get(cacheKey);
    }

    const entry = await cellRegistry.resolveCell(cellId, channel);
    
    // Cache metadata only, not actual Cell instances
    this.loadedCells.set(cacheKey, entry);
    return entry;
  }

  // Load known cells with static imports (temporary solution)
  private async loadKnownCell(cellId: string): Promise<React.ComponentType<any> | null> {
    switch (cellId) {
      case 'inventory/TaxAndFee':
        // Use static import for TaxAndFee cell
        const { default: TaxAndFeeCell } = await import('../../cells/inventory/TaxAndFee/src/client');
        return TaxAndFeeCell;
      
      default:
        return null;
    }
  }

  private isAllowedOrigin(url: string): boolean {
    // For development - always allow local origins, in production add proper validation
    if (!this.config.enableSignatureVerification) {
      return true; // Skip origin checks in development
    }
    
    try {
      const origin = new URL(url).origin;
      return this.config.allowedOrigins.includes(origin);
    } catch {
      return false;
    }
  }

  private async validatePayload(cellId: string, action: string, payload: any, type: 'input' | 'output'): Promise<void> {
    // Skip validation for now due to schema format inconsistencies
    // TODO: Implement proper schema validation with consistent format
    return;
  }

  private wrapWithErrorBoundary(Component: React.ComponentType<any>, cellId: string): React.ComponentType<any> {
    return function CellWrapper(props: any) {
      try {
        return React.createElement(Component, props);
      } catch (error) {
        console.error(`Cell ${cellId} render error:`, error);
        return React.createElement('div', { 
          className: 'cell-error',
          children: `Error loading Cell: ${cellId}` 
        });
      }
    };
  }
}

// Singleton loader instance
export const cellLoader = new CellLoader();