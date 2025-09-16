/**
 * WebWaka Cell Contracts - Drift Detection System
 * Prevents breaking changes and ensures contract compatibility
 */

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { ContractRegistry, ContractDefinition } from './validation';

// =============================================================================
// CONTRACT DRIFT DETECTION TYPES
// =============================================================================

export enum ChangeType {
  BREAKING = 'BREAKING',
  NON_BREAKING = 'NON_BREAKING',
  ADDITION = 'ADDITION',
  REMOVAL = 'REMOVAL',
  MODIFICATION = 'MODIFICATION'
}

export enum ChangeSeverity {
  CRITICAL = 'CRITICAL',     // Breaks existing clients immediately
  MAJOR = 'MAJOR',           // Requires client updates  
  MINOR = 'MINOR',           // Backwards compatible
  PATCH = 'PATCH'            // Internal improvements only
}

export interface SchemaChange {
  path: string;              // JSON path to the change
  changeType: ChangeType;
  severity: ChangeSeverity;
  description: string;
  oldValue?: any;
  newValue?: any;
  impact: string;
  recommendation: string;
  affectedClients?: string[];
}

export interface ContractDrift {
  contractKey: string;       // e.g., "customer/profile/v1"
  operation: string;
  changesSinceBaseline: SchemaChange[];
  summary: {
    totalChanges: number;
    breakingChanges: number;
    nonBreakingChanges: number;
    overallSeverity: ChangeSeverity;
    compatibilityRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  recommendations: string[];
  timestamp: string;
}

export interface DriftDetectionReport {
  baseline: {
    timestamp: string;
    version: string;
    totalContracts: number;
  };
  current: {
    timestamp: string;
    version: string;
    totalContracts: number;
  };
  drifts: ContractDrift[];
  summary: {
    totalContractsChanged: number;
    totalChanges: number;
    criticalIssues: number;
    majorIssues: number;
    minorIssues: number;
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    canAutoMerge: boolean;
  };
  ciRecommendations: {
    shouldBlock: boolean;
    requiresManualReview: boolean;
    suggestedActions: string[];
  };
}

// =============================================================================
// SCHEMA COMPARISON ENGINE
// =============================================================================

export class SchemaComparator {
  
  // Compare two Zod schemas and detect changes
  compareSchemas(oldSchema: z.ZodSchema, newSchema: z.ZodSchema, context: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    
    try {
      // Get schema definitions (this would need deeper Zod introspection)
      const oldDef = this.getSchemaDefinition(oldSchema);
      const newDef = this.getSchemaDefinition(newSchema);
      
      // Compare field by field
      changes.push(...this.compareObjectProperties(oldDef, newDef, context));
      
    } catch (error) {
      changes.push({
        path: context,
        changeType: ChangeType.MODIFICATION,
        severity: ChangeSeverity.CRITICAL,
        description: 'Schema comparison failed',
        impact: 'Unable to validate compatibility',
        recommendation: 'Manual schema review required',
        oldValue: 'unknown',
        newValue: 'unknown'
      });
    }
    
    return changes;
  }

  private getSchemaDefinition(schema: z.ZodSchema): any {
    try {
      // Extract Zod schema information - this is a simplified approach
      // In production, consider using zod-to-json-schema package
      const zodSchema = schema as any;
      
      if (zodSchema._def?.typeName === 'ZodObject') {
        const shape = zodSchema._def.shape();
        const properties: Record<string, any> = {};
        const required: string[] = [];
        
        for (const [key, value] of Object.entries(shape)) {
          const fieldSchema = value as any;
          properties[key] = this.extractFieldType(fieldSchema);
          
          // Check if field is truly required by examining the Zod type
          if (!this.isOptionalField(fieldSchema)) {
            required.push(key);
          }
        }
        
        return {
          type: 'object',
          properties,
          required
        };
      }
      
      return this.extractFieldType(zodSchema);
      
    } catch (error) {
      console.warn('Schema definition extraction failed:', error);
      return {
        type: 'unknown',
        properties: {},
        required: []
      };
    }
  }

  private isOptionalField(schema: any): boolean {
    if (!schema?._def) return false;
    
    const typeName = schema._def.typeName;
    return typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodNullable';
  }

  private extractFieldType(schema: any): any {
    if (!schema?._def) {
      return { type: 'unknown' };
    }
    
    const typeName = schema._def.typeName;
    
    switch (typeName) {
      case 'ZodString':
        const stringConstraints: any = { type: 'string' };
        if (schema._def.checks) {
          const checks = schema._def.checks;
          for (const check of checks) {
            if (check.kind === 'min') stringConstraints.minLength = check.value;
            if (check.kind === 'max') stringConstraints.maxLength = check.value;
            if (check.kind === 'email') stringConstraints.format = 'email';
            if (check.kind === 'uuid') stringConstraints.format = 'uuid';
            if (check.kind === 'regex') stringConstraints.pattern = check.regex.source;
          }
        }
        return stringConstraints;
        
      case 'ZodNumber':
        const numberConstraints: any = { type: 'number' };
        if (schema._def.checks) {
          const checks = schema._def.checks;
          for (const check of checks) {
            if (check.kind === 'min') numberConstraints.minimum = check.value;
            if (check.kind === 'max') numberConstraints.maximum = check.value;
            if (check.kind === 'int') numberConstraints.multipleOf = 1;
          }
        }
        return numberConstraints;
        
      case 'ZodBoolean':
        return { type: 'boolean' };
        
      case 'ZodArray':
        const arrayConstraints: any = { 
          type: 'array',
          items: this.extractFieldType(schema._def.type)
        };
        if (schema._def.minLength !== null) arrayConstraints.minItems = schema._def.minLength.value;
        if (schema._def.maxLength !== null) arrayConstraints.maxItems = schema._def.maxLength.value;
        return arrayConstraints;
        
      case 'ZodObject':
        const shape = schema._def.shape();
        const properties: Record<string, any> = {};
        const required: string[] = [];
        
        for (const [key, value] of Object.entries(shape)) {
          const fieldSchema = value as any;
          properties[key] = this.extractFieldType(fieldSchema);
          
          if (!this.isOptionalField(fieldSchema)) {
            required.push(key);
          }
        }
        
        return {
          type: 'object',
          properties,
          required
        };
        
      case 'ZodEnum':
        return { 
          type: 'string',
          enum: schema._def.values
        };
        
      case 'ZodUnion':
        return {
          type: 'union',
          oneOf: schema._def.options.map((option: any) => this.extractFieldType(option))
        };
        
      case 'ZodOptional':
        return {
          ...this.extractFieldType(schema._def.innerType),
          optional: true
        };
        
      case 'ZodDefault':
        return {
          ...this.extractFieldType(schema._def.innerType),
          default: schema._def.defaultValue()
        };
        
      case 'ZodNullable':
        return {
          ...this.extractFieldType(schema._def.innerType),
          nullable: true
        };
        
      default:
        return { type: typeName?.replace('Zod', '').toLowerCase() || 'unknown' };
    }
  }

  private compareObjectProperties(oldDef: any, newDef: any, basePath: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    
    // Check for removed properties (breaking)
    for (const prop in oldDef.properties || {}) {
      if (!(prop in (newDef.properties || {}))) {
        changes.push({
          path: `${basePath}.${prop}`,
          changeType: ChangeType.REMOVAL,
          severity: ChangeSeverity.CRITICAL,
          description: `Property '${prop}' was removed`,
          oldValue: oldDef.properties[prop],
          newValue: undefined,
          impact: 'Existing clients will fail when accessing this property',
          recommendation: 'Consider deprecation instead of removal, or version the API'
        });
      }
    }
    
    // Check for added properties (non-breaking)
    for (const prop in newDef.properties || {}) {
      if (!(prop in (oldDef.properties || {}))) {
        const isRequired = newDef.required?.includes(prop);
        changes.push({
          path: `${basePath}.${prop}`,
          changeType: ChangeType.ADDITION,
          severity: isRequired ? ChangeSeverity.MAJOR : ChangeSeverity.MINOR,
          description: `Property '${prop}' was added${isRequired ? ' as required' : ''}`,
          oldValue: undefined,
          newValue: newDef.properties[prop],
          impact: isRequired 
            ? 'Clients must provide this property in requests'
            : 'Non-breaking addition - clients can ignore',
          recommendation: isRequired
            ? 'Consider adding with default value or making optional initially'
            : 'Safe to deploy'
        });
      }
    }
    
    // Check for modified properties
    for (const prop in oldDef.properties || {}) {
      if (prop in (newDef.properties || {})) {
        const oldType = oldDef.properties[prop]?.type;
        const newType = newDef.properties[prop]?.type;
        
        if (oldType !== newType) {
          changes.push({
            path: `${basePath}.${prop}`,
            changeType: ChangeType.MODIFICATION,
            severity: ChangeSeverity.CRITICAL,
            description: `Property '${prop}' type changed from ${oldType} to ${newType}`,
            oldValue: oldType,
            newValue: newType,
            impact: 'Type mismatch will cause client errors',
            recommendation: 'Use API versioning for type changes'
          });
        }
      }
    }
    
    return changes;
  }
  
  private compareFieldChanges(oldDef: any, newDef: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    
    // Type changes are MAJOR
    if (oldDef.type !== newDef.type) {
      changes.push({
        path,
        changeType: ChangeType.MODIFICATION,
        severity: ChangeSeverity.CRITICAL,
        description: `Type changed from ${oldDef.type} to ${newDef.type}`,
        oldValue: oldDef,
        newValue: newDef,
        impact: 'Type mismatch will cause client errors',
        recommendation: 'Use API versioning for type changes'
      });
      return changes;
    }
    
    // Handle specific type comparisons
    if (oldDef.type === 'object') {
      changes.push(...this.compareObjectProperties(oldDef, newDef, path));
    } else if (oldDef.type === 'array') {
      changes.push(...this.compareArrayChanges(oldDef, newDef, path));
    } else if (oldDef.type === 'string' && oldDef.enum && newDef.enum) {
      changes.push(...this.compareEnumChanges(oldDef, newDef, path));
    }
    
    // Check constraint changes
    changes.push(...this.compareConstraintChanges(oldDef, newDef, path));
    
    return changes;
  }
  
  private compareArrayChanges(oldDef: any, newDef: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    
    // Item type changes
    if (oldDef.items && newDef.items) {
      changes.push(...this.compareFieldChanges(oldDef.items, newDef.items, `${path}[]`));
    }
    
    // Min/max items changes
    if (oldDef.minItems !== newDef.minItems) {
      const severity = (newDef.minItems || 0) > (oldDef.minItems || 0) 
        ? ChangeSeverity.MAJOR 
        : ChangeSeverity.MINOR;
      changes.push({
        path,
        changeType: ChangeType.MODIFICATION,
        severity,
        description: `Array minItems changed from ${oldDef.minItems || 0} to ${newDef.minItems || 0}`,
        oldValue: oldDef,
        newValue: newDef,
        impact: severity === ChangeSeverity.MAJOR 
          ? 'Clients may need to provide more items' 
          : 'Less restrictive constraint',
        recommendation: 'Review client code for array size validation'
      });
    }
    
    return changes;
  }
  
  private compareEnumChanges(oldDef: any, newDef: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldValues = new Set(oldDef.enum || []);
    const newValues = new Set(newDef.enum || []);
    
    // Removed enum values = MAJOR
    for (const value of oldValues) {
      if (!newValues.has(value)) {
        changes.push({
          path,
          changeType: ChangeType.REMOVAL,
          severity: ChangeSeverity.CRITICAL,
          description: `Enum value '${value}' removed`,
          oldValue: oldDef,
          newValue: newDef,
          impact: 'Clients using this enum value will fail',
          recommendation: 'Deprecate enum values instead of removing them'
        });
      }
    }
    
    // Added enum values = MINOR
    for (const value of newValues) {
      if (!oldValues.has(value)) {
        changes.push({
          path,
          changeType: ChangeType.ADDITION,
          severity: ChangeSeverity.MINOR,
          description: `Enum value '${value}' added`,
          oldValue: oldDef,
          newValue: newDef,
          impact: 'Non-breaking addition - clients can ignore new values',
          recommendation: 'Safe to deploy'
        });
      }
    }
    
    return changes;
  }
  
  private compareConstraintChanges(oldDef: any, newDef: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const constraints = ['minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'format'];
    
    for (const constraint of constraints) {
      if (oldDef[constraint] !== newDef[constraint]) {
        // More restrictive = MAJOR, less restrictive = MINOR
        let severity = ChangeSeverity.MINOR;
        
        if (constraint === 'minLength' || constraint === 'minimum') {
          severity = (newDef[constraint] || 0) > (oldDef[constraint] || 0) 
            ? ChangeSeverity.MAJOR 
            : ChangeSeverity.MINOR;
        } else if (constraint === 'maxLength' || constraint === 'maximum') {
          severity = (newDef[constraint] || Infinity) < (oldDef[constraint] || Infinity) 
            ? ChangeSeverity.MAJOR 
            : ChangeSeverity.MINOR;
        } else if (constraint === 'pattern' || constraint === 'format') {
          severity = ChangeSeverity.MAJOR; // Pattern changes are typically breaking
        }
        
        changes.push({
          path,
          changeType: ChangeType.MODIFICATION,
          severity,
          description: `Constraint '${constraint}' changed from ${oldDef[constraint]} to ${newDef[constraint]}`,
          oldValue: oldDef,
          newValue: newDef,
          impact: severity === ChangeSeverity.MAJOR 
            ? 'More restrictive constraint may break existing clients'
            : 'Less restrictive constraint - backward compatible',
          recommendation: severity === ChangeSeverity.MAJOR 
            ? 'Consider gradual rollout or client-side validation updates'
            : 'Safe to deploy'
        });
      }
    }
    
    return changes;
  }
}

// =============================================================================
// CONTRACT DRIFT DETECTOR
// =============================================================================

export class ContractDriftDetector {
  private baselinePath: string;
  private comparator: SchemaComparator;

  constructor(baselinePath: string = 'platforms/lib/cell-contracts/baselines') {
    this.baselinePath = baselinePath;
    this.comparator = new SchemaComparator();
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.baselinePath)) {
      mkdirSync(this.baselinePath, { recursive: true });
    }
  }

  // Save current contracts as baseline
  saveBaseline(registry: ContractRegistry, version: string = 'v1'): void {
    this.ensureDirectoryExists();
    
    const baseline = {
      timestamp: new Date().toISOString(),
      version,
      contracts: this.serializeContracts(registry)
    };
    
    const baselineFile = join(this.baselinePath, `baseline-${version}.json`);
    writeFileSync(baselineFile, JSON.stringify(baseline, null, 2));
    
    console.log(`📋 Saved contract baseline: ${baselineFile}`);
  }

  // Load baseline for comparison
  loadBaseline(version: string = 'v1'): any | null {
    // First try exact match
    let baselineFile = join(this.baselinePath, `baseline-${version}.json`);
    
    if (!existsSync(baselineFile)) {
      // If exact match not found, look for the latest baseline with this version prefix
      try {
        const files = readdirSync(this.baselinePath);
        const matchingFiles = files
          .filter(f => f.startsWith(`baseline-${version}-`) && f.endsWith('.json'))
          .sort()
          .reverse(); // Get latest first
          
        if (matchingFiles.length > 0) {
          baselineFile = join(this.baselinePath, matchingFiles[0]);
          console.log(`📋 Using latest baseline: ${matchingFiles[0]}`);
        } else {
          console.warn(`⚠️ No baseline found for version ${version} in: ${this.baselinePath}`);
          return null;
        }
      } catch (error) {
        console.warn(`⚠️ No baseline found: ${baselineFile}`);
        return null;
      }
    }
    
    try {
      return JSON.parse(readFileSync(baselineFile, 'utf8'));
    } catch (error) {
      console.error(`❌ Failed to load baseline: ${baselineFile}`, error);
      return null;
    }
  }

  // Detect drifts between current and baseline contracts
  detectDrifts(currentRegistry: ContractRegistry, version: string = 'v1'): DriftDetectionReport {
    const baseline = this.loadBaseline(version);
    if (!baseline) {
      throw new Error(`No baseline found for version ${version}`);
    }

    const currentContracts = this.serializeContracts(currentRegistry);
    const drifts: ContractDrift[] = [];
    
    // Compare each contract
    for (const [contractKey, currentContract] of Object.entries(currentContracts)) {
      const baselineContract = baseline.contracts[contractKey];
      
      if (!baselineContract) {
        // New contract - non-breaking
        continue;
      }
      
      const contractDrift = this.compareContracts(
        contractKey,
        baselineContract,
        currentContract
      );
      
      if (contractDrift.changesSinceBaseline.length > 0) {
        drifts.push(contractDrift);
      }
    }
    
    // Check for removed contracts
    for (const contractKey in baseline.contracts) {
      if (!(contractKey in currentContracts)) {
        drifts.push({
          contractKey,
          operation: 'all',
          changesSinceBaseline: [{
            path: contractKey,
            changeType: ChangeType.REMOVAL,
            severity: ChangeSeverity.CRITICAL,
            description: `Entire contract was removed`,
            impact: 'All clients using this contract will fail',
            recommendation: 'Use API versioning instead of removing contracts'
          }],
          summary: {
            totalChanges: 1,
            breakingChanges: 1,
            nonBreakingChanges: 0,
            overallSeverity: ChangeSeverity.CRITICAL,
            compatibilityRisk: 'CRITICAL'
          },
          recommendations: ['Restore contract or provide migration path'],
          timestamp: new Date().toISOString()
        });
      }
    }

    return this.generateReport(baseline, currentContracts, drifts);
  }

  private serializeContracts(registry: ContractRegistry): Record<string, any> {
    const contracts: Record<string, any> = {};
    
    const allContracts = registry.listContracts();
    for (const { key, contract } of allContracts) {
      contracts[key] = {
        cellDomain: contract.cellDomain,
        cellName: contract.cellName,
        version: contract.version,
        operations: Object.keys(contract.operations).reduce((ops, opName) => {
          const op = contract.operations[opName];
          ops[opName] = {
            description: op.description,
            deprecated: op.deprecated,
            // Note: In real implementation, we'd serialize the Zod schemas
            requestSchema: 'serialized_schema',
            responseSchema: 'serialized_schema'
          };
          return ops;
        }, {} as any)
      };
    }
    
    return contracts;
  }

  private compareContracts(
    contractKey: string,
    baselineContract: any,
    currentContract: any
  ): ContractDrift {
    const changes: SchemaChange[] = [];
    
    // Compare operations
    const baselineOps = baselineContract.operations || {};
    const currentOps = currentContract.operations || {};
    
    // Check for removed operations
    for (const opName in baselineOps) {
      if (!(opName in currentOps)) {
        changes.push({
          path: `${contractKey}.${opName}`,
          changeType: ChangeType.REMOVAL,
          severity: ChangeSeverity.CRITICAL,
          description: `Operation '${opName}' was removed`,
          impact: 'Clients using this operation will fail',
          recommendation: 'Deprecate operation instead of removing'
        });
      }
    }
    
    // Check for added operations (non-breaking)
    for (const opName in currentOps) {
      if (!(opName in baselineOps)) {
        changes.push({
          path: `${contractKey}.${opName}`,
          changeType: ChangeType.ADDITION,
          severity: ChangeSeverity.MINOR,
          description: `Operation '${opName}' was added`,
          impact: 'New functionality available to clients',
          recommendation: 'Safe to deploy'
        });
      }
    }
    
    // Check for modified operations (would need schema comparison)
    for (const opName in baselineOps) {
      if (opName in currentOps) {
        // Here we would compare the schemas - simplified for now
        const baselineOp = baselineOps[opName];
        const currentOp = currentOps[opName];
        
        if (baselineOp.deprecated !== currentOp.deprecated) {
          changes.push({
            path: `${contractKey}.${opName}.deprecated`,
            changeType: ChangeType.MODIFICATION,
            severity: currentOp.deprecated ? ChangeSeverity.MAJOR : ChangeSeverity.MINOR,
            description: `Operation '${opName}' deprecation status changed`,
            oldValue: baselineOp.deprecated,
            newValue: currentOp.deprecated,
            impact: currentOp.deprecated 
              ? 'Operation is now deprecated - clients should migrate'
              : 'Operation is no longer deprecated',
            recommendation: currentOp.deprecated
              ? 'Provide migration guide and timeline'
              : 'Safe to deploy'
          });
        }
      }
    }

    const breakingChanges = changes.filter(c => 
      c.severity === ChangeSeverity.CRITICAL || c.changeType === ChangeType.REMOVAL
    ).length;
    
    const overallSeverity = this.calculateOverallSeverity(changes);
    
    return {
      contractKey,
      operation: 'multiple',
      changesSinceBaseline: changes,
      summary: {
        totalChanges: changes.length,
        breakingChanges,
        nonBreakingChanges: changes.length - breakingChanges,
        overallSeverity,
        compatibilityRisk: this.calculateCompatibilityRisk(changes)
      },
      recommendations: this.generateRecommendations(changes),
      timestamp: new Date().toISOString()
    };
  }

  private calculateOverallSeverity(changes: SchemaChange[]): ChangeSeverity {
    if (changes.some(c => c.severity === ChangeSeverity.CRITICAL)) return ChangeSeverity.CRITICAL;
    if (changes.some(c => c.severity === ChangeSeverity.MAJOR)) return ChangeSeverity.MAJOR;
    if (changes.some(c => c.severity === ChangeSeverity.MINOR)) return ChangeSeverity.MINOR;
    return ChangeSeverity.PATCH;
  }

  private calculateCompatibilityRisk(changes: SchemaChange[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const criticalChanges = changes.filter(c => c.severity === ChangeSeverity.CRITICAL).length;
    const majorChanges = changes.filter(c => c.severity === ChangeSeverity.MAJOR).length;
    
    if (criticalChanges > 0) return 'CRITICAL';
    if (majorChanges > 2) return 'HIGH';
    if (majorChanges > 0) return 'MEDIUM';
    return 'LOW';
  }

  private generateRecommendations(changes: SchemaChange[]): string[] {
    const recommendations: string[] = [];
    
    const criticalChanges = changes.filter(c => c.severity === ChangeSeverity.CRITICAL);
    if (criticalChanges.length > 0) {
      recommendations.push('⚠️ Breaking changes detected - requires new API version');
      recommendations.push('🔄 Provide migration guide for affected clients');
      recommendations.push('📅 Plan deprecation timeline for old version');
    }
    
    const removals = changes.filter(c => c.changeType === ChangeType.REMOVAL);
    if (removals.length > 0) {
      recommendations.push('❌ Avoid removing fields/operations - use deprecation instead');
    }
    
    const additions = changes.filter(c => c.changeType === ChangeType.ADDITION);
    if (additions.length > 0) {
      recommendations.push('✅ New additions detected - ensure backward compatibility');
    }
    
    return recommendations;
  }

  private generateReport(
    baseline: any,
    currentContracts: Record<string, any>,
    drifts: ContractDrift[]
  ): DriftDetectionReport {
    const totalChanges = drifts.reduce((sum, drift) => sum + drift.summary.totalChanges, 0);
    const criticalIssues = drifts.reduce((sum, drift) => 
      sum + drift.changesSinceBaseline.filter(c => c.severity === ChangeSeverity.CRITICAL).length, 0
    );
    const majorIssues = drifts.reduce((sum, drift) => 
      sum + drift.changesSinceBaseline.filter(c => c.severity === ChangeSeverity.MAJOR).length, 0
    );
    const minorIssues = drifts.reduce((sum, drift) => 
      sum + drift.changesSinceBaseline.filter(c => c.severity === ChangeSeverity.MINOR).length, 0
    );

    const overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 
      criticalIssues > 0 ? 'CRITICAL' :
      majorIssues > 2 ? 'HIGH' :
      majorIssues > 0 ? 'MEDIUM' : 'LOW';

    const canAutoMerge = overallRisk === 'LOW';
    const shouldBlock = overallRisk === 'CRITICAL';
    const requiresManualReview = overallRisk !== 'LOW';

    return {
      baseline: {
        timestamp: baseline.timestamp,
        version: baseline.version,
        totalContracts: Object.keys(baseline.contracts).length
      },
      current: {
        timestamp: new Date().toISOString(),
        version: 'current',
        totalContracts: Object.keys(currentContracts).length
      },
      drifts,
      summary: {
        totalContractsChanged: drifts.length,
        totalChanges,
        criticalIssues,
        majorIssues,
        minorIssues,
        overallRisk,
        canAutoMerge
      },
      ciRecommendations: {
        shouldBlock,
        requiresManualReview,
        suggestedActions: this.generateCiActions(overallRisk, criticalIssues, majorIssues)
      }
    };
  }

  private generateCiActions(
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    criticalIssues: number,
    majorIssues: number
  ): string[] {
    const actions: string[] = [];

    switch (overallRisk) {
      case 'CRITICAL':
        actions.push('🚨 BLOCK deployment - critical breaking changes detected');
        actions.push('📋 Require architecture review');
        actions.push('🔄 Plan API versioning strategy');
        actions.push('📞 Notify affected client teams');
        break;
        
      case 'HIGH':
        actions.push('⚠️ WARN - significant changes require review');
        actions.push('📋 Require senior engineer approval');
        actions.push('🧪 Run extended test suite');
        actions.push('📝 Update API documentation');
        break;
        
      case 'MEDIUM':
        actions.push('ℹ️ INFO - moderate changes detected');
        actions.push('🧪 Run contract tests');
        actions.push('📝 Update changelog');
        break;
        
      case 'LOW':
        actions.push('✅ PASS - safe to deploy');
        actions.push('📊 Update metrics dashboard');
        break;
    }

    return actions;
  }
}

// =============================================================================
// CI INTEGRATION UTILITIES
// =============================================================================

export function runContractDriftCheck(
  registry: ContractRegistry,
  version: string = 'v1'
): { exitCode: number; report: DriftDetectionReport | null } {
  try {
    const detector = new ContractDriftDetector();
    const report = detector.detectDrifts(registry, version);
    
    console.log('\n📊 CONTRACT DRIFT DETECTION REPORT');
    console.log('=====================================');
    console.log(`Baseline: ${report.baseline.timestamp} (${report.baseline.totalContracts} contracts)`);
    console.log(`Current:  ${report.current.timestamp} (${report.current.totalContracts} contracts)`);
    console.log(`Risk Level: ${report.summary.overallRisk}`);
    console.log(`Changes: ${report.summary.totalChanges} total (${report.summary.criticalIssues} critical, ${report.summary.majorIssues} major, ${report.summary.minorIssues} minor)`);
    
    if (report.drifts.length > 0) {
      console.log('\n📋 DETECTED CHANGES:');
      report.drifts.forEach(drift => {
        console.log(`\n🔍 ${drift.contractKey}:`);
        drift.changesSinceBaseline.forEach(change => {
          const severity = change.severity.padEnd(8);
          console.log(`  ${severity} ${change.path}: ${change.description}`);
        });
      });
    }
    
    console.log('\n🎯 CI RECOMMENDATIONS:');
    report.ciRecommendations.suggestedActions.forEach(action => {
      console.log(`  ${action}`);
    });
    
    // Return exit code based on recommendations
    const exitCode = report.ciRecommendations.shouldBlock ? 1 : 0;
    return { exitCode, report };
    
  } catch (error) {
    console.error('❌ Contract drift detection failed:', error);
    return { exitCode: 1, report: null };
  }
}