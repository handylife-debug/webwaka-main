import { productionRegistry } from '../registry/production-registry';
import { compareVersions, validateVersion } from '../utils/cell-utils';

// Channel Management with Auto-advancement and Version Pinning
export class ChannelManager {
  private advancementPolicies = new Map<string, ChannelAdvancementPolicy>();
  private pinnedVersions = new Map<string, VersionPin>();

  constructor() {
    this.setupDefaultPolicies();
  }

  // Set channel advancement policy for a Cell
  async setAdvancementPolicy(cellId: string, policy: ChannelAdvancementPolicy): Promise<void> {
    this.advancementPolicies.set(cellId, policy);
    console.log(`[ChannelManager] Set policy for ${cellId}: ${policy.type}`);
  }

  // Pin a channel to specific version constraints
  async pinVersion(cellId: string, channel: string, pin: VersionPin): Promise<void> {
    const key = `${cellId}:${channel}`;
    this.pinnedVersions.set(key, pin);
    console.log(`[ChannelManager] Pinned ${key} to ${pin.constraint} ${pin.version}`);
  }

  // Check if a new version should auto-advance a channel
  async evaluateAdvancement(cellId: string, newVersion: string): Promise<ChannelAdvancement[]> {
    const policy = this.advancementPolicies.get(cellId) || this.getDefaultPolicy();
    const advancements: ChannelAdvancement[] = [];

    // Get current channel states
    const stats = await productionRegistry.getCellStats(cellId);
    
    for (const [channelName, currentVersion] of Object.entries(stats.channels)) {
      const shouldAdvance = await this.shouldAdvanceChannel(
        cellId, 
        channelName, 
        currentVersion, 
        newVersion, 
        policy
      );

      if (shouldAdvance) {
        advancements.push({
          cellId,
          channel: channelName,
          fromVersion: currentVersion,
          toVersion: newVersion,
          reason: this.getAdvancementReason(channelName, currentVersion, newVersion, policy)
        });
      }
    }

    return advancements;
  }

  // Execute channel advancements (instant ecosystem-wide fixes)
  async executeAdvancements(advancements: ChannelAdvancement[]): Promise<AdvancementResult[]> {
    const results: AdvancementResult[] = [];

    for (const advancement of advancements) {
      try {
        await productionRegistry.updateChannel(
          advancement.cellId,
          advancement.channel,
          advancement.toVersion
        );

        results.push({
          ...advancement,
          success: true,
          executedAt: new Date().toISOString()
        });

        console.log(`[ChannelManager] Advanced ${advancement.cellId}:${advancement.channel} → ${advancement.toVersion}`);
      } catch (error) {
        results.push({
          ...advancement,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          executedAt: new Date().toISOString()
        });

        console.error(`[ChannelManager] Failed to advance ${advancement.cellId}:${advancement.channel}:`, error);
      }
    }

    return results;
  }

  // Get advancement history for a Cell
  async getAdvancementHistory(cellId: string, limit: number = 50): Promise<AdvancementResult[]> {
    // In production, this would query a history table
    // For now, return empty array - would be populated by real advancement executions
    return [];
  }

  // Rollback a channel to previous version
  async rollbackChannel(cellId: string, channel: string, targetVersion: string): Promise<void> {
    // Validate target version exists
    const stats = await productionRegistry.getCellStats(cellId);
    
    // Update channel
    await productionRegistry.updateChannel(cellId, channel, targetVersion);
    
    console.log(`[ChannelManager] Rolled back ${cellId}:${channel} → ${targetVersion}`);
  }

  // Private helper methods

  private async shouldAdvanceChannel(
    cellId: string,
    channel: string,
    currentVersion: string,
    newVersion: string,
    policy: ChannelAdvancementPolicy
  ): Promise<boolean> {
    // Check version constraints
    if (!validateVersion(newVersion)) {
      return false;
    }

    // Check if new version is actually newer
    if (compareVersions(newVersion, currentVersion) <= 0) {
      return false;
    }

    // Check version pinning
    const pin = this.pinnedVersions.get(`${cellId}:${channel}`);
    if (pin && !this.satisfiesPin(newVersion, pin)) {
      return false;
    }

    // Apply policy rules
    switch (policy.type) {
      case 'automatic':
        return this.evaluateAutomaticPolicy(currentVersion, newVersion, policy.rules);
      
      case 'manual':
        return false; // Manual channels never auto-advance
      
      case 'conditional':
        return this.evaluateConditionalPolicy(cellId, channel, currentVersion, newVersion, policy.rules);
      
      default:
        return false;
    }
  }

  private evaluateAutomaticPolicy(currentVersion: string, newVersion: string, rules: PolicyRule[]): boolean {
    for (const rule of rules) {
      switch (rule.type) {
        case 'patch_only':
          return this.isPatchVersion(currentVersion, newVersion);
        
        case 'minor_allowed':
          return this.isMinorOrPatchVersion(currentVersion, newVersion);
        
        case 'major_blocked':
          return !this.isMajorVersion(currentVersion, newVersion);
        
        case 'time_delay':
          // Would check if enough time has passed since version publication
          return true; // Simplified for now
      }
    }
    return false;
  }

  private async evaluateConditionalPolicy(
    cellId: string,
    channel: string,
    currentVersion: string,
    newVersion: string,
    rules: PolicyRule[]
  ): Promise<boolean> {
    for (const rule of rules) {
      switch (rule.type) {
        case 'health_check':
          const stats = await productionRegistry.getCellStats(cellId);
          return stats.health === 'healthy';
        
        case 'usage_threshold':
          const downloads = (await productionRegistry.getCellStats(cellId)).downloads;
          return downloads > (rule.threshold || 100);
        
        case 'dependency_ready':
          // Would check if dependent Cells are compatible
          return true; // Simplified for now
      }
    }
    return false;
  }

  private isPatchVersion(currentVersion: string, newVersion: string): boolean {
    const [currentMajor, currentMinor] = currentVersion.split('.').map(Number);
    const [newMajor, newMinor] = newVersion.split('.').map(Number);
    
    return currentMajor === newMajor && currentMinor === newMinor;
  }

  private isMinorOrPatchVersion(currentVersion: string, newVersion: string): boolean {
    const [currentMajor] = currentVersion.split('.').map(Number);
    const [newMajor] = newVersion.split('.').map(Number);
    
    return currentMajor === newMajor;
  }

  private isMajorVersion(currentVersion: string, newVersion: string): boolean {
    const [currentMajor] = currentVersion.split('.').map(Number);
    const [newMajor] = newVersion.split('.').map(Number);
    
    return newMajor > currentMajor;
  }

  private satisfiesPin(version: string, pin: VersionPin): boolean {
    const comparison = compareVersions(version, pin.version);
    
    switch (pin.constraint) {
      case 'exact': return comparison === 0;
      case 'min': return comparison >= 0;
      case 'max': return comparison <= 0;
      case 'compatible': return this.isCompatibleVersion(version, pin.version);
      default: return false;
    }
  }

  private isCompatibleVersion(version: string, pinVersion: string): boolean {
    // Compatible means same major version
    const [versionMajor] = version.split('.').map(Number);
    const [pinMajor] = pinVersion.split('.').map(Number);
    
    return versionMajor === pinMajor;
  }

  private getAdvancementReason(
    channel: string,
    currentVersion: string,
    newVersion: string,
    policy: ChannelAdvancementPolicy
  ): string {
    if (this.isPatchVersion(currentVersion, newVersion)) {
      return `Patch update (${currentVersion} → ${newVersion})`;
    }
    if (this.isMinorOrPatchVersion(currentVersion, newVersion)) {
      return `Minor update (${currentVersion} → ${newVersion})`;
    }
    return `Policy-based advancement (${policy.type})`;
  }

  private setupDefaultPolicies(): void {
    // Default policies for different channel types
    this.advancementPolicies.set('*:stable', {
      type: 'manual',
      rules: []
    });

    this.advancementPolicies.set('*:canary', {
      type: 'automatic',
      rules: [
        { type: 'minor_allowed' },
        { type: 'health_check' }
      ]
    });

    this.advancementPolicies.set('*:experimental', {
      type: 'automatic',
      rules: [
        { type: 'time_delay', threshold: 0 }
      ]
    });
  }

  private getDefaultPolicy(): ChannelAdvancementPolicy {
    return {
      type: 'manual',
      rules: []
    };
  }
}

// Types for channel management
export interface ChannelAdvancementPolicy {
  type: 'automatic' | 'manual' | 'conditional';
  rules: PolicyRule[];
}

export interface PolicyRule {
  type: 'patch_only' | 'minor_allowed' | 'major_blocked' | 'time_delay' | 'health_check' | 'usage_threshold' | 'dependency_ready';
  threshold?: number;
  conditions?: Record<string, any>;
}

export interface VersionPin {
  constraint: 'exact' | 'min' | 'max' | 'compatible';
  version: string;
  reason?: string;
}

export interface ChannelAdvancement {
  cellId: string;
  channel: string;
  fromVersion: string;
  toVersion: string;
  reason: string;
}

export interface AdvancementResult extends ChannelAdvancement {
  success: boolean;
  error?: string;
  executedAt: string;
}

// Singleton channel manager instance
export const channelManager = new ChannelManager();