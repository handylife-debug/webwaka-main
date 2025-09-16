/**
 * WebWaka Cell Service Registry
 * Discovery and routing for cellular independence
 */

export interface CellRegistryEntry {
  name: string;
  domain: string;
  version: string;
  baseUrl: string;
  healthUrl: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'maintenance';
  lastHealthCheck?: Date;
  metadata?: Record<string, any>;
}

export class CellRegistry {
  private entries = new Map<string, CellRegistryEntry>();
  
  register(entry: CellRegistryEntry): void {
    const key = `${entry.domain}/${entry.name}`;
    this.entries.set(key, entry);
  }

  find(domain: string, name: string, version?: string): CellRegistryEntry | undefined {
    const key = `${domain}/${name}`;
    const entry = this.entries.get(key);
    
    if (!entry) return undefined;
    if (version && entry.version !== version) return undefined;
    
    return entry;
  }

  listAll(): CellRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  listByDomain(domain: string): CellRegistryEntry[] {
    return Array.from(this.entries.values())
      .filter(entry => entry.domain === domain);
  }

  updateStatus(domain: string, name: string, status: CellRegistryEntry['status']): void {
    const key = `${domain}/${name}`;
    const entry = this.entries.get(key);
    if (entry) {
      entry.status = status;
      entry.lastHealthCheck = new Date();
    }
  }
}

// Global registry instance
const globalRegistry = new CellRegistry();

// Register our current cells
globalRegistry.register({
  name: 'profile',
  domain: 'customer',
  version: 'v1',
  baseUrl: '/api/cells/customer/profile/v1',
  healthUrl: '/api/cells/customer/profile/v1/health',
  capabilities: ['get-customer', 'create-customer', 'update-customer'],
  status: 'active'
});

globalRegistry.register({
  name: 'engagement', 
  domain: 'customer',
  version: 'v1',
  baseUrl: '/api/cells/customer/engagement/v1',
  healthUrl: '/api/cells/customer/engagement/v1/health',
  capabilities: ['track-interaction', 'get-analytics', 'loyalty-management'],
  status: 'active'
});

globalRegistry.register({
  name: 'b2b-access-control',
  domain: 'ecommerce',
  version: 'v1', 
  baseUrl: '/api/cells/ecommerce/b2b-access-control/v1',
  healthUrl: '/api/cells/ecommerce/b2b-access-control/v1/health',
  capabilities: ['check-access', 'manage-groups', 'validate-business'],
  status: 'active'
});

globalRegistry.register({
  name: 'wholesale-pricing',
  domain: 'ecommerce',
  version: 'v1',
  baseUrl: '/api/cells/ecommerce/wholesale-pricing/v1', 
  healthUrl: '/api/cells/ecommerce/wholesale-pricing/v1/health',
  capabilities: ['calculate-price', 'manage-tiers', 'analytics'],
  status: 'active'
});

globalRegistry.register({
  name: 'quote-negotiation',
  domain: 'ecommerce',
  version: 'v1',
  baseUrl: '/api/cells/ecommerce/quote-negotiation/v1',
  healthUrl: '/api/cells/ecommerce/quote-negotiation/v1/health', 
  capabilities: ['create-quote', 'negotiate-terms', 'generate-offer'],
  status: 'active'
});

export function getCellRegistry(): CellRegistry {
  return globalRegistry;
}