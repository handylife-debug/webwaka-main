'use client';

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { cellLoader } from '../loader/cell-loader';
import { CellError } from '../core/cell';

// Props for the Cell component
export interface CellProps {
  name: string;                    // Cell ID (sector/name)
  channel?: 'stable' | 'canary' | 'experimental';
  props?: Record<string, any>;     // Props to pass to the Cell
  fallback?: React.ReactNode;      // Loading fallback
  errorFallback?: React.ComponentType<{ error: Error; cellId: string }>;
  onError?: (error: Error) => void;
}

// Cell Component - renders a WebWaka Biological Cell
export function Cell({
  name,
  channel = 'stable',
  props = {},
  fallback = <CellLoadingSpinner />,
  errorFallback: ErrorFallback = DefaultCellErrorBoundary,
  onError
}: CellProps) {
  const [CellComponent, setCellComponent] = useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCellComponent();
  }, [name, channel]);

  const loadCellComponent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load Cell component dynamically with proper channel
      const component = await cellLoader.render(name, props, channel);
      setCellComponent(() => component);
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load Cell');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return <>{fallback}</>;
  }

  // Error state
  if (error) {
    return <ErrorFallback error={error} cellId={name} />;
  }

  // Render Cell component
  if (CellComponent) {
    return (
      <Suspense fallback={fallback}>
        <CellWrapper>
          <CellComponent {...props} />
        </CellWrapper>
      </Suspense>
    );
  }

  return null;
}

// Cell Wrapper for isolation and telemetry
function CellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="webwaka-cell" data-cell-boundary="true">
      {children}
    </div>
  );
}

// Default loading spinner
function CellLoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      <span className="ml-2 text-sm text-gray-600">Loading Cell...</span>
    </div>
  );
}

// Default error boundary for Cells
function DefaultCellErrorBoundary({ error, cellId }: { error: Error; cellId: string }) {
  return (
    <div className="border border-red-200 rounded-lg p-4 bg-red-50">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">
            Cell Error: {cellId}
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <p>{error.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for calling Cell actions from client components
export function useCellAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const callCell = async (cellId: string, action: string, payload: any) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await cellLoader.call(cellId, action, payload);
      return result;
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Cell action failed');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    callCell,
    loading,
    error
  };
}

// Preload Cell for better performance
export async function preloadCell(cellId: string, channel: string = 'stable'): Promise<void> {
  try {
    await cellLoader.render(cellId, {});
  } catch (error) {
    console.warn(`Failed to preload Cell ${cellId}:`, error);
  }
}