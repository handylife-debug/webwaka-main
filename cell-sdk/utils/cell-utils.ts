import { CellManifest } from '../core/cell';

// Utility functions for Cell operations

// Generate Cell ID from sector and name
export function generateCellId(sector: string, name: string): string {
  return `${sector}/${name}`;
}

// Parse Cell ID into sector and name
export function parseCellId(cellId: string): { sector: string; name: string } {
  const [sector, name] = cellId.split('/');
  if (!sector || !name) {
    throw new Error(`Invalid Cell ID format: ${cellId}. Expected: sector/name`);
  }
  return { sector, name };
}

// Validate Cell version format (semver)
export function validateVersion(version: string): boolean {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}

// Compare versions (returns -1, 0, or 1)
export function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => v.split('.').map(Number);
  const versionA = parseVersion(a);
  const versionB = parseVersion(b);
  
  for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
    const numA = versionA[i] || 0;
    const numB = versionB[i] || 0;
    
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  
  return 0;
}

// Get latest version from a list
export function getLatestVersion(versions: string[]): string {
  return versions.sort(compareVersions).pop() || '0.0.0';
}

// Generate Cell manifest template
export function createCellManifestTemplate(
  sector: string, 
  name: string, 
  version: string = '1.0.0'
): Partial<CellManifest> {
  const id = generateCellId(sector, name);
  
  return {
    id,
    name,
    sector,
    version,
    description: `${name} Cell in ${sector} sector`,
    channels: ['stable', 'canary'],
    inputs: {},
    outputs: {},
    actions: [],
    dependencies: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };
}

// Validate Cell name (must be valid for URLs and file systems)
export function validateCellName(name: string): boolean {
  const validNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  return validNameRegex.test(name) && name.length >= 2 && name.length <= 50;
}

// Validate sector name
export function validateSectorName(sector: string): boolean {
  const validSectorRegex = /^[a-z][a-z0-9_]*$/;
  return validSectorRegex.test(sector) && sector.length >= 2 && sector.length <= 20;
}

// Calculate Cell health score based on metadata
export function calculateCellHealthScore(metadata: {
  downloads: number;
  lastAccessed: string;
  health: 'healthy' | 'degraded' | 'failed';
}): number {
  let score = 0;
  
  // Base health status
  switch (metadata.health) {
    case 'healthy': score += 50; break;
    case 'degraded': score += 25; break;
    case 'failed': score += 0; break;
  }
  
  // Usage score (downloads)
  if (metadata.downloads > 1000) score += 30;
  else if (metadata.downloads > 100) score += 20;
  else if (metadata.downloads > 10) score += 10;
  
  // Recency score (last accessed)
  const daysSinceAccess = (Date.now() - new Date(metadata.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceAccess < 1) score += 20;
  else if (daysSinceAccess < 7) score += 15;
  else if (daysSinceAccess < 30) score += 10;
  else if (daysSinceAccess < 90) score += 5;
  
  return Math.min(score, 100);
}

// Format Cell metadata for display
export function formatCellMetadata(manifest: CellManifest): {
  displayName: string;
  fullId: string;
  sector: string;
  version: string;
  description: string;
} {
  return {
    displayName: manifest.name,
    fullId: manifest.id,
    sector: manifest.sector,
    version: manifest.version,
    description: manifest.description
  };
}

// Deep clone Cell manifest (for safe mutations)
export function cloneCellManifest(manifest: CellManifest): CellManifest {
  return JSON.parse(JSON.stringify(manifest));
}

// Merge Cell manifest updates
export function mergeCellManifest(
  existing: CellManifest, 
  updates: Partial<CellManifest>
): CellManifest {
  const merged = cloneCellManifest(existing);
  
  // Update allowed fields
  const allowedUpdates: (keyof CellManifest)[] = [
    'description', 'channels', 'inputs', 'outputs', 'actions', 'dependencies'
  ];
  
  allowedUpdates.forEach(field => {
    if (updates[field] !== undefined) {
      (merged as any)[field] = updates[field];
    }
  });
  
  // Always update timestamp
  merged.updated = new Date().toISOString();
  
  return merged;
}