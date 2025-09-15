import crypto from 'crypto';
import Database from '@replit/database';
import { 
  CellManifest, 
  CellRegistryEntry, 
  CellChannel, 
  CellNotFoundError,
  CellSDKConfig,
  DEFAULT_CELL_CONFIG 
} from '../core/cell';

// Production Cell Registry with CDN storage and signing
export class ProductionCellRegistry {
  private config: CellSDKConfig;
  private db: Database;
  private cache = new Map<string, CellRegistryEntry>();
  private cdnBaseUrl: string;
  private signingKey: string;

  constructor(config: Partial<CellSDKConfig> = {}) {
    this.config = { ...DEFAULT_CELL_CONFIG, ...config };
    this.db = new Database();
    this.cdnBaseUrl = process.env.REPLIT_DB_URL || 'https://registry.webwaka.bio/cdn';
    this.signingKey = process.env.CELL_SIGNING_KEY || crypto.randomBytes(32).toString('hex');
  }

  // Register a new Cell with CDN artifact storage
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

    // Upload artifacts to CDN with signing
    const artifactUrls = await this.uploadArtifactsToStorage(cellId, manifest.version, artifacts);
    
    // Create signed manifest
    const signedManifest = await this.signManifest(manifest);
    
    // Create registry entry
    const entry: CellRegistryEntry = {
      manifest: signedManifest,
      channels: this.initializeChannels(manifest),
      artifacts: artifactUrls,
      metadata: {
        downloads: 0,
        lastAccessed: new Date().toISOString(),
        health: 'healthy'
      }
    };

    // Store in database and cache
    await this.storeInDatabase(cellId, entry);
    this.cache.set(cellId, entry);
    
    console.log(`[Registry] Registered Cell ${cellId} v${manifest.version}`);
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

    // Fetch from database
    const entry = await this.fetchFromDatabase(cellId);
    if (!entry) {
      throw new CellNotFoundError(cellId);
    }

    // Resolve channel to specific version
    const channelInfo = entry.channels[channel];
    if (!channelInfo) {
      throw new Error(`Channel ${channel} not found for Cell ${cellId}`);
    }

    // Update access metadata
    entry.metadata.lastAccessed = new Date().toISOString();
    entry.metadata.downloads++;
    
    // Cache resolved entry
    this.cache.set(cacheKey, entry);
    
    // Update database asynchronously
    this.storeInDatabase(cellId, entry).catch(console.error);
    
    return entry;
  }

  // Update channel alias (enables instant ecosystem fixes)
  async updateChannel(cellId: string, channel: string, version: string): Promise<void> {
    const entry = await this.fetchFromDatabase(cellId);
    if (!entry) {
      throw new CellNotFoundError(cellId);
    }

    if (!entry.channels[channel]) {
      throw new Error(`Channel ${channel} not found for Cell ${cellId}`);
    }

    // Update channel to point to new version
    entry.channels[channel].version = version;
    entry.channels[channel].alias = version;
    
    // Store updated entry
    await this.storeInDatabase(cellId, entry);
    
    // Invalidate cache to force refetch
    this.invalidateCache(cellId);
    
    console.log(`[Registry] Updated ${cellId}:${channel} → ${version}`);
  }

  // List all Cells in a sector
  async listCellsBySector(sector: string): Promise<string[]> {
    // For now, return cached cell IDs - production would query database properly
    return Array.from(this.cache.keys())
      .filter(key => key.startsWith(`${sector}/`))
      .map(key => key.split(':')[0]);
  }

  // Get Cell health and usage statistics
  async getCellStats(cellId: string): Promise<{
    health: 'healthy' | 'degraded' | 'failed';
    downloads: number;
    lastAccessed: string;
    channels: Record<string, string>;
  }> {
    const entry = await this.fetchFromDatabase(cellId);
    if (!entry) {
      throw new CellNotFoundError(cellId);
    }

    return {
      health: entry.metadata.health,
      downloads: entry.metadata.downloads,
      lastAccessed: entry.metadata.lastAccessed,
      channels: Object.fromEntries(
        Object.entries(entry.channels).map(([name, info]) => [name, info.version])
      )
    };
  }

  // Private helper methods

  private async uploadArtifactsToStorage(cellId: string, version: string, artifacts: {
    clientBundle?: Buffer,
    serverBundle?: Buffer,
    schema: object
  }): Promise<{ clientBundle?: string, serverBundle?: string, schema: string }> {
    const prefix = `cells/${cellId}/${version}`;
    const results: any = {};

    // Upload client bundle if provided
    if (artifacts.clientBundle) {
      const clientKey = `${prefix}/client.mjs`;
      await this.db.set(clientKey, artifacts.clientBundle.toString('base64'));
      results.clientBundle = `${this.cdnBaseUrl}/${clientKey}`;
    }

    // Upload server bundle if provided
    if (artifacts.serverBundle) {
      const serverKey = `${prefix}/server.mjs`;
      await this.db.set(serverKey, artifacts.serverBundle.toString('base64'));
      results.serverBundle = `${this.cdnBaseUrl}/${serverKey}`;
    }

    // Upload schema (always required)
    const schemaKey = `${prefix}/schema.json`;
    await this.db.set(schemaKey, JSON.stringify(artifacts.schema));
    results.schema = JSON.stringify(artifacts.schema);

    return results;
  }

  private async signManifest(manifest: CellManifest): Promise<CellManifest> {
    if (!this.config.enableSignatureVerification) {
      return manifest;
    }

    const manifestString = JSON.stringify(manifest);
    const signature = crypto
      .createHmac('sha256', this.signingKey)
      .update(manifestString)
      .digest('hex');

    return {
      ...manifest,
      signature
    };
  }

  private async storeInDatabase(cellId: string, entry: CellRegistryEntry): Promise<void> {
    const key = `cell:${cellId}`;
    await this.db.set(key, JSON.stringify(entry));
  }

  private async fetchFromDatabase(cellId: string): Promise<CellRegistryEntry | null> {
    const key = `cell:${cellId}`;
    try {
      const data = await this.db.get(key);
      return data ? JSON.parse(data as unknown as string) : null;
    } catch (error) {
      console.error(`Failed to fetch ${cellId} from database:`, error);
      return null;
    }
  }

  private validateManifest(manifest: CellManifest): boolean {
    return !!(
      manifest.id && 
      manifest.name && 
      manifest.sector && 
      manifest.version &&
      manifest.actions && 
      Array.isArray(manifest.actions) &&
      manifest.channels &&
      Array.isArray(manifest.channels)
    );
  }

  private initializeChannels(manifest: CellManifest): Record<string, CellChannel> {
    const channels: Record<string, CellChannel> = {};
    
    manifest.channels.forEach(channelName => {
      channels[channelName] = {
        name: channelName as any,
        version: manifest.version,
        alias: manifest.version,
        autoAdvance: channelName === 'stable' ? false : true
      };
    });
    
    return channels;
  }

  private invalidateCache(cellId: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(`${cellId}:`));
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

// Singleton production registry instance
export const productionRegistry = new ProductionCellRegistry();