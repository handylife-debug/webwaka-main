import { 
  CellManifest, 
  CellRegistryEntry, 
  CellChannel, 
  CellNotFoundError,
  CellSDKConfig,
  DEFAULT_CELL_CONFIG 
} from '../core/cell';

// Cell Registry - manages Cell versions, channels, and artifacts
export class CellRegistry {
  private config: CellSDKConfig;
  private cache = new Map<string, CellRegistryEntry>();
  private channelCache = new Map<string, string>(); // channel -> resolved version

  constructor(config: Partial<CellSDKConfig> = {}) {
    this.config = { ...DEFAULT_CELL_CONFIG, ...config };
  }

  // Resolve Cell by ID and channel to specific version
  async resolveCell(cellId: string, channel: string = 'stable'): Promise<CellRegistryEntry> {
    const cacheKey = `${cellId}:${channel}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - new Date(cached.metadata.lastAccessed).getTime() < this.config.cacheTimeout) {
        return cached;
      }
    }

    // Fetch from registry
    const entry = await this.fetchCellFromRegistry(cellId, channel);
    
    // Update cache
    this.cache.set(cacheKey, entry);
    entry.metadata.lastAccessed = new Date().toISOString();
    
    return entry;
  }

  // Register a new Cell or update existing Cell
  async registerCell(manifest: CellManifest, artifacts: { 
    clientBundle?: Buffer, 
    serverBundle?: Buffer, 
    schema: object 
  }): Promise<void> {
    const cellId = `${manifest.sector}/${manifest.name}`;
    
    // Validate manifest
    if (!this.validateManifest(manifest)) {
      throw new Error(`Invalid manifest for Cell ${cellId}`);
    }

    // Upload artifacts and create registry entry
    const entry: CellRegistryEntry = {
      manifest,
      channels: this.initializeChannels(manifest),
      artifacts: {
        clientBundle: artifacts.clientBundle ? await this.uploadArtifact(artifacts.clientBundle, 'client') : undefined,
        serverBundle: artifacts.serverBundle ? await this.uploadArtifact(artifacts.serverBundle, 'server') : undefined,
        schema: JSON.stringify(artifacts.schema)
      },
      metadata: {
        downloads: 0,
        lastAccessed: new Date().toISOString(),
        health: 'healthy'
      }
    };

    // Store in registry
    await this.storeInRegistry(cellId, entry);
    
    // Update local cache
    this.cache.set(cellId, entry);
  }

  // Update channel alias (e.g., move stable from v1.2.3 to v1.2.4)
  async updateChannel(cellId: string, channel: string, version: string): Promise<void> {
    const entry = await this.resolveCell(cellId, channel);
    
    if (!entry.channels[channel]) {
      throw new Error(`Channel ${channel} not found for Cell ${cellId}`);
    }

    // Update channel to point to new version
    entry.channels[channel].version = version;
    entry.channels[channel].alias = version;
    
    // Store updated entry
    await this.storeInRegistry(cellId, entry);
    
    // Invalidate cache to force refetch
    this.cache.delete(`${cellId}:${channel}`);
    this.channelCache.delete(`${cellId}:${channel}`);
  }

  // List Cells by sector
  async listCellsBySector(sector: string): Promise<string[]> {
    // In a real implementation, this would query the registry database
    return Array.from(this.cache.keys())
      .filter(key => key.startsWith(`${sector}/`))
      .map(key => key.split(':')[0]);
  }

  // Get Cell health status
  async getCellHealth(cellId: string): Promise<'healthy' | 'degraded' | 'failed'> {
    try {
      const entry = await this.resolveCell(cellId);
      return entry.metadata.health;
    } catch (error) {
      return 'failed';
    }
  }

  // Private helper methods
  private async fetchCellFromRegistry(cellId: string, channel: string): Promise<CellRegistryEntry> {
    try {
      // Mock implementation for development - check cache first, then create default
      const cacheKey = `${cellId}:${channel}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }
      
      // For development - create mock entry for TaxAndFee cell
      if (cellId === 'inventory/TaxAndFee') {
        const mockEntry: CellRegistryEntry = {
          manifest: {
            id: cellId,
            name: 'TaxAndFee',
            sector: 'inventory',
            version: '1.0.0',
            description: 'Tax and Fee calculation cell',
            channels: ['stable'],
            inputs: {},
            outputs: {},
            actions: ['calculate'],
            schemaUrl: '/cells/inventory/TaxAndFee/schema.json',
            created: new Date().toISOString(),
            updated: new Date().toISOString()
          },
          channels: {
            stable: {
              name: 'stable',
              version: '1.0.0',
              alias: '1.0.0',
              autoAdvance: false
            }
          },
          artifacts: {
            clientBundle: '/cells/inventory/TaxAndFee/client.js',
            serverBundle: '/api/cells/inventory/TaxAndFee',
            schema: JSON.stringify({ inputs: {}, outputs: {} })
          },
          metadata: {
            downloads: 0,
            lastAccessed: new Date().toISOString(),
            health: 'healthy'
          }
        };
        this.cache.set(cacheKey, mockEntry);
        return mockEntry;
      }
      
      throw new CellNotFoundError(cellId);
    } catch (error) {
      throw new CellNotFoundError(cellId);
    }
  }

  private async storeInRegistry(cellId: string, entry: CellRegistryEntry): Promise<void> {
    // Mock implementation for development - store in memory cache
    this.cache.set(cellId, entry);
    
    // Also store with channel-specific key for proper caching
    Object.keys(entry.channels).forEach(channel => {
      const cacheKey = `${cellId}:${channel}`;
      this.cache.set(cacheKey, entry);
    });
    
    console.log(`[MockRegistry] Stored Cell ${cellId} in registry with channels: ${Object.keys(entry.channels).join(', ')}`);
  }

  private async uploadArtifact(artifact: Buffer, type: 'client' | 'server'): Promise<string> {
    // Mock implementation for development - generate URL without actual upload
    const artifactId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const mockUrl = `/artifacts/${type}/${artifactId}.mjs`;
    
    console.log(`[MockRegistry] Mock uploaded ${type} artifact (${artifact.length} bytes): ${mockUrl}`);
    return mockUrl;
  }

  private validateManifest(manifest: CellManifest): boolean {
    // Validate required fields and structure
    return !!(
      manifest.id && 
      manifest.name && 
      manifest.sector && 
      manifest.version &&
      manifest.actions && 
      Array.isArray(manifest.actions)
    );
  }

  private initializeChannels(manifest: CellManifest): Record<string, CellChannel> {
    const channels: Record<string, CellChannel> = {};
    
    manifest.channels.forEach(channelName => {
      channels[channelName] = {
        name: channelName as any,
        version: manifest.version,
        alias: manifest.version,
        autoAdvance: channelName === 'stable' ? false : true // Stable requires manual promotion
      };
    });
    
    return channels;
  }
}

// Singleton registry instance
export const cellRegistry = new CellRegistry();