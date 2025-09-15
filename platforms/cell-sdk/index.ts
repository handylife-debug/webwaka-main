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
  Cell as CellComponent,
  type CellProps,
  useCellAction,
  preloadCell
} from './components/Cell';

// SDK utilities
export * from './utils/cell-utils';

// Production Registry
export {
  ProductionCellRegistry,
  productionRegistry
} from './registry/production-registry';

// Channel Management
export {
  ChannelManager,
  channelManager,
  type ChannelAdvancementPolicy,
  type VersionPin,
  type ChannelAdvancement,
  type AdvancementResult
} from './management/channel-manager';

// Cell Scaffolding
export {
  CellGenerator,
  cellGenerator,
  type CellGenerationOptions,
  type CellConversionOptions,
  type CellBuildResult,
  type CellCandidate
} from './scaffolding/cell-generator';

// Tissue & Organ Composition
export {
  TissueOrchestrator,
  tissueOrchestrator,
  type TissueDefinition,
  type TissueStep,
  type OrganDefinition,
  type TissueExecutionResult,
  type OrganExecutionResult,
  type TissueHealthStatus
} from './composition/tissue-orchestrator';

// Version and metadata
export const CELL_SDK_VERSION = '1.0.0';
export const WEBWAKA_PROTOCOL_VERSION = '1.0.0';