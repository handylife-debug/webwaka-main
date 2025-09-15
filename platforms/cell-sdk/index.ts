// WebWaka Biological Hierarchical System - Cell SDK
// Core exports for the cellular architecture

// Core Cell interfaces and types
export {
  type Cell,
  type CellManifest,
  type CellContract,
  type CellChannel,
  type CellRegistryEntry,
  type CellSDKConfig,
  CellError,
  CellNotFoundError,
  CellValidationError,
  CellManifestSchema,
  DEFAULT_CELL_CONFIG
} from './core/cell';

// Registry system
export {
  CellRegistry,
  cellRegistry
} from './registry/cell-registry';

// Client-side loader
export {
  CellLoader,
  cellLoader
} from './loader/cell-loader';

// Server-side bus
export {
  CellBus,
  cellBus
} from './loader/cell-bus';

// React components
export {
  Cell,
  type CellProps,
  useCellAction,
  preloadCell
} from './components/Cell';

// SDK utilities
export * from './utils/cell-utils';

// Version and metadata
export const CELL_SDK_VERSION = '1.0.0';
export const WEBWAKA_PROTOCOL_VERSION = '1.0.0';