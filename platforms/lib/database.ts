import { Pool, PoolClient } from 'pg';

// =============================================================================
// 🚨 CRITICAL SECURITY: Tenant Isolation Validation (EMBEDDED FOR SECURITY)
// Copied from gateway to ensure UNCONDITIONAL enforcement in ALL database calls
// =============================================================================

export interface ParsedQuery {
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | 'OTHER';
  tables: string[];
  hasTenantPredicate: boolean;
  hasWhereClause: boolean;
  isMultiTenant: boolean;
  hasOrBypassPattern: boolean;
  unionBranches: { hasValidTenantPredicate: boolean; query: string }[];
  hasComplexBooleanLogic: boolean;
  securityRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';
}

/**
 * 🚨 CRITICAL SECURITY: Detect OR-bypass attack patterns in SQL queries
 * REFINED: Blocks actual bypass attempts while allowing legitimate OR patterns
 * 
 * SAFE:    WHERE tenant_id=$1 AND (status=$2 OR priority=$3)
 * BLOCKED: WHERE tenant_id=$1 OR status=$2
 * BLOCKED: WHERE (tenant_id=$1 OR status=$2) AND other_condition=$3
 */
function detectOrBypassPatterns(normalizedQuery: string): boolean {
  // Pattern 1: Direct OR after tenant_id in same logical group (DANGEROUS)
  // tenant_id = $1 OR anything (no AND between them)
  if (/\btenant_id\s*=\s*\$\d+\s+or\b/i.test(normalizedQuery)) {
    return true;
  }
  
  // Pattern 2: Direct OR before tenant_id in same logical group (DANGEROUS)  
  // anything OR tenant_id = $1 (no AND between them)
  if (/\bor\s+tenant_id\s*=\s*\$\d+(?!\s+and)/i.test(normalizedQuery)) {
    return true;
  }
  
  // Pattern 3: tenant_id inside OR parentheses (DANGEROUS)
  // (tenant_id = $1 OR condition) - tenant isolation can be bypassed
  // BUT ALLOW: tenant_id = $1 AND (other_field = $2 OR other_field = $3)
  const parenthesizedOrWithTenantId = /\([^)]*tenant_id\s*=.*\bor\b[^)]*\)/i.test(normalizedQuery);
  if (parenthesizedOrWithTenantId) {
    // Check if this is the dangerous pattern vs safe pattern
    // SAFE pattern: tenant_id = $1 AND (other things OR other things)
    // DANGEROUS pattern: (tenant_id = $1 OR other things)
    
    // Look for the specific dangerous pattern where tenant_id is part of OR logic
    if (/\(\s*tenant_id\s*=.*\bor\b/i.test(normalizedQuery) || 
        /\([^)]*\bor\b[^)]*tenant_id\s*=/i.test(normalizedQuery)) {
      return true;
    }
  }
  
  // Pattern 4: OR immediately involving tenant_id operations (DANGEROUS)
  // tenant_id != $1 OR anything, tenant_id > $1 OR anything, etc.
  if (/\btenant_id\s*[!=<>]+[^,\s]*\s+or\b/i.test(normalizedQuery)) {
    return true;
  }
  
  // Pattern 5: Classic OR TRUE/1=1 bypass attempts (DANGEROUS)
  if (/\bor\s+true\b/i.test(normalizedQuery) || /\bor\s+1\s*=\s*1\b/i.test(normalizedQuery)) {
    return true;
  }
  
  // Pattern 6: OR NULL bypass attempts (DANGEROUS)
  if (/\bor\s+.*\s+is\s+null\b/i.test(normalizedQuery)) {
    return true;
  }
  
  return false;
}

/**
 * 🚨 CRITICAL SECURITY: Parse UNION branches and validate each has tenant filtering
 * Prevents attacks like: SELECT * FROM table WHERE tenant_id=$1 UNION SELECT * FROM table
 */
function parseUnionBranches(query: string): { hasValidTenantPredicate: boolean; query: string }[] {
  const branches: { hasValidTenantPredicate: boolean; query: string }[] = [];
  
  // Split on UNION (case insensitive)
  const unionParts = query.split(/\bunion\s+(?:all\s+)?/i);
  
  if (unionParts.length === 1) {
    // No UNION, return empty array
    return branches;
  }
  
  // Analyze each UNION branch
  for (const part of unionParts) {
    const normalizedPart = part.trim().toLowerCase();
    
    // Check if this branch has valid tenant predicate in AND context
    const hasValidTenantPredicate = validateTenantPredicateContext(normalizedPart);
    
    branches.push({
      hasValidTenantPredicate,
      query: part.trim().substring(0, 100) // First 100 chars for logging
    });
  }
  
  return branches;
}

/**
 * 🚨 CRITICAL SECURITY: Validate tenant predicate is in proper AND context
 * REFINED: Ensures tenant_id = $n is not in an OR relationship that could be bypassed
 * 
 * VALID:   WHERE tenant_id = $1 AND (status = $2 OR priority = $3)
 * INVALID: WHERE (tenant_id = $1 OR status = $2)
 * INVALID: WHERE condition = $1 OR tenant_id = $2
 */
function validateTenantPredicateContext(normalizedQuery: string): boolean {
  // Must have tenant_id = $n pattern
  if (!/\btenant_id\s*=\s*\$\d+/i.test(normalizedQuery)) {
    return false;
  }
  
  // CRITICAL: If query has OR patterns involving tenant_id, it's invalid
  if (detectOrBypassPatterns(normalizedQuery)) {
    return false;
  }
  
  // Extract WHERE clause for detailed analysis
  const whereMatch = normalizedQuery.match(/\bwhere\s+(.+?)(?:\s+(?:order|group|having|limit|offset|$))/i);
  if (!whereMatch) {
    // If no WHERE clause but tenant_id is present, it's likely in JOIN or other valid context
    return !!normalizedQuery.match(/\btenant_id\s*=\s*\$\d+/i);
  }
  
  const whereClause = whereMatch[1];
  
  // REFINED: Check for dangerous patterns more precisely
  
  // Pattern 1: tenant_id is part of OR group (DANGEROUS)
  // (condition OR tenant_id = $n) or (tenant_id = $n OR condition)
  if (/\([^)]*\bor\s+tenant_id\s*=/i.test(whereClause) || 
      /\(\s*tenant_id\s*=.*\bor\b/i.test(whereClause)) {
    return false;
  }
  
  // Pattern 2: Direct OR relationship with tenant_id (DANGEROUS)
  // anything OR tenant_id = $n, tenant_id = $n OR anything
  if (/(?:^|[^(])\s*[^=!<>]+\s+or\s+tenant_id\s*=/i.test(whereClause) ||
      /\btenant_id\s*=\s*\$\d+\s+or\s+/i.test(whereClause)) {
    return false;
  }
  
  // SAFE: tenant_id = $1 AND (other_field = $2 OR other_field = $3)
  // This pattern has tenant_id in AND relationship with a parenthesized OR group
  // The tenant_id constraint is enforced regardless of the OR outcome
  
  return true;
}

/**
 * 🚨 CRITICAL SECURITY: Parse and analyze SQL query for tenant isolation threats
 * EXPORTED FOR TESTING: Tests MUST use this actual production implementation
 */
export function parseQuery(query: string): ParsedQuery {
  const normalizedQuery = query.trim().toLowerCase();
  
  // Determine query type
  let type: ParsedQuery['type'] = 'OTHER';
  if (/^\s*select\s+/i.test(normalizedQuery)) type = 'SELECT';
  else if (/^\s*insert\s+/i.test(normalizedQuery)) type = 'INSERT';
  else if (/^\s*update\s+/i.test(normalizedQuery)) type = 'UPDATE';
  else if (/^\s*delete\s+/i.test(normalizedQuery)) type = 'DELETE';
  else if (/^\s*truncate\s+/i.test(normalizedQuery)) type = 'TRUNCATE';
  
  // Extract table names
  const tables: string[] = [];
  const fromMatch = normalizedQuery.match(/\bfrom\s+([\w_]+)/i);
  if (fromMatch) tables.push(fromMatch[1]);
  
  const updateMatch = normalizedQuery.match(/\bupdate\s+([\w_]+)/i);
  if (updateMatch) tables.push(updateMatch[1]);
  
  const insertMatch = normalizedQuery.match(/\binto\s+([\w_]+)/i);
  if (insertMatch) tables.push(insertMatch[1]);
  
  const truncateMatch = normalizedQuery.match(/\btruncate\s+(?:table\s+)?([\w_]+)/i);
  if (truncateMatch) tables.push(truncateMatch[1]);
  
  // CRITICAL: Detect OR-bypass attack patterns
  const hasOrBypassPattern = detectOrBypassPatterns(normalizedQuery);
  
  // CRITICAL: Parse UNION branches separately for security
  const unionBranches = parseUnionBranches(query);
  
  // CRITICAL: Detect complex boolean logic that could bypass security
  const hasComplexBooleanLogic = detectComplexBooleanLogic(normalizedQuery);
  
  // ENHANCED: Validate tenant predicate is in AND context, not OR
  const hasValidTenantPredicate = validateTenantPredicateContext(normalizedQuery);
  
  // Check for WHERE clause
  const hasWhereClause = /\bwhere\s+/i.test(normalizedQuery);
  
  // Determine if tables are multi-tenant (enhanced heuristics)
  const isMultiTenant = tables.some(table => {
    // Skip system tables and health check queries
    if (table.startsWith('pg_') || table.includes('information_schema')) return false;
    if (normalizedQuery.includes('health_check') || normalizedQuery.includes('version()')) return false;
    
    // Most application tables should be multi-tenant
    const singleTenantTables = ['migrations', 'schema_versions', 'system_config', 'audit_logs'];
    return !singleTenantTables.includes(table);
  });
  
  // CRITICAL: Assess security risk level
  const securityRisk = assessSecurityRisk({
    hasOrBypassPattern,
    unionBranches,
    hasComplexBooleanLogic,
    hasTenantPredicate: hasValidTenantPredicate,
    isMultiTenant,
    type
  });
  
  return {
    type,
    tables,
    hasTenantPredicate: hasValidTenantPredicate,
    hasWhereClause,
    isMultiTenant,
    hasOrBypassPattern,
    unionBranches,
    hasComplexBooleanLogic,
    securityRisk
  };
}

/**
 * 🚨 CRITICAL SECURITY: Detect complex boolean logic that could bypass tenant isolation
 */
function detectComplexBooleanLogic(normalizedQuery: string): boolean {
  // Count nested parentheses levels
  let parenDepth = 0;
  let maxDepth = 0;
  
  for (const char of normalizedQuery) {
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    maxDepth = Math.max(maxDepth, parenDepth);
  }
  
  // Complex nesting with OR/AND might hide bypass attempts
  if (maxDepth > 2 && /\b(or|and)\b/i.test(normalizedQuery)) {
    return true;
  }
  
  // Multiple OR/AND combinations
  const orCount = (normalizedQuery.match(/\bor\b/gi) || []).length;
  const andCount = (normalizedQuery.match(/\band\b/gi) || []).length;
  
  if (orCount > 1 || (orCount > 0 && andCount > 2)) {
    return true;
  }
  
  return false;
}

/**
 * 🚨 CRITICAL SECURITY: Assess overall security risk level of the query
 */
function assessSecurityRisk(context: {
  hasOrBypassPattern: boolean;
  unionBranches: { hasValidTenantPredicate: boolean; query: string }[];
  hasComplexBooleanLogic: boolean;
  hasTenantPredicate: boolean;
  isMultiTenant: boolean;
  type: ParsedQuery['type'];
}): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE' {
  // CRITICAL: OR-bypass patterns detected
  if (context.hasOrBypassPattern) {
    return 'CRITICAL';
  }
  
  // CRITICAL: UNION branches without proper tenant filtering
  if (context.unionBranches.length > 0) {
    const unprotectedBranches = context.unionBranches.filter(b => !b.hasValidTenantPredicate);
    if (unprotectedBranches.length > 0) {
      return 'CRITICAL';
    }
  }
  
  // HIGH: Multi-tenant table without tenant predicate
  if (context.isMultiTenant && !context.hasTenantPredicate) {
    return 'HIGH';
  }
  
  // MEDIUM: Complex boolean logic on multi-tenant tables
  if (context.isMultiTenant && context.hasComplexBooleanLogic) {
    return 'MEDIUM';
  }
  
  // LOW: Multi-tenant with tenant predicate but complex structure
  if (context.isMultiTenant && context.hasTenantPredicate && context.hasComplexBooleanLogic) {
    return 'LOW';
  }
  
  return 'SAFE';
}

/**
 * 🚨 CRITICAL SECURITY: Enhanced validation with OR-bypass and UNION attack prevention
 * This function implements ZERO-TOLERANCE tenant isolation - BLOCKS ALL BYPASS ATTEMPTS
 * EXPORTED FOR TESTING: Tests MUST use this actual production implementation
 */
export function validateSqlQuery(query: string, tenantId?: string): void {
  const normalizedQuery = query.trim().toLowerCase();
  const parsed = parseQuery(query);
  
  // Block ALL dangerous operations - NO EXCEPTIONS
  const dangerousPatterns = [
    /^\s*drop\s+/i,                    // DROP operations
    /^\s*truncate\s+/i,                // TRUNCATE operations
    /^\s*create\s+user\s+/i,           // User creation
    /^\s*alter\s+user\s+/i,            // User alteration
    /^\s*grant\s+/i,                   // Permission grants
    /^\s*revoke\s+/i,                  // Permission revokes
    /;\s*drop\s+/i,                    // Chained DROP
    /;\s*truncate\s+/i,                // Chained TRUNCATE
    /;\s*delete\s+from\s+/i,           // Chained DELETE
    /;\s*update\s+/i,                  // Chained UPDATE
    /information_schema/i,             // System schema access
    /pg_catalog/i,                     // PostgreSQL catalog
    /pg_roles/i,                       // Role information
    /pg_user/i,                        // User information
    /pg_shadow/i,                      // Shadow password table
    /--/,                              // SQL comments (potential injection)
    /\/\*/,                            // Block comments (potential injection)
    /\bxp_cmdshell\b/i,                // Command execution
    /\bsp_executesql\b/i,              // Dynamic SQL execution
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(normalizedQuery)) {
      throw new Error(`SECURITY BLOCK: Dangerous SQL operation detected: ${query.substring(0, 100)}...`);
    }
  }

  // 🚨 CRITICAL: Block ALL OR-bypass attack patterns IMMEDIATELY
  if (parsed.hasOrBypassPattern) {
    throw new Error(`SECURITY BLOCK: OR-bypass attack detected - tenant_id cannot be in OR relationship: ${query.substring(0, 100)}...`);
  }

  // 🚨 CRITICAL: Block UNION queries with unprotected branches
  if (parsed.unionBranches.length > 0) {
    const unprotectedBranches = parsed.unionBranches.filter(b => !b.hasValidTenantPredicate);
    if (unprotectedBranches.length > 0) {
      throw new Error(`SECURITY BLOCK: UNION branch lacks tenant isolation - all branches must have AND tenant_id = $n: ${query.substring(0, 100)}...`);
    }
  }

  // 🚨 CRITICAL: Block queries based on security risk assessment
  if (parsed.securityRisk === 'CRITICAL') {
    throw new Error(`SECURITY BLOCK: CRITICAL risk query blocked - contains tenant isolation bypass patterns: ${query.substring(0, 100)}...`);
  }

  // ENHANCED ENFORCEMENT: Multi-tenant table operations MUST have tenant predicates
  if (parsed.isMultiTenant) {
    switch (parsed.type) {
      case 'SELECT':
        if (!parsed.hasTenantPredicate) {
          throw new Error(`SECURITY BLOCK: SELECT on multi-tenant table '${parsed.tables.join(', ')}' lacks tenant isolation (WHERE tenant_id = $n): ${query.substring(0, 100)}...`);
        }
        break;
        
      case 'UPDATE':
      case 'DELETE':
        if (!parsed.hasTenantPredicate) {
          throw new Error(`SECURITY BLOCK: ${parsed.type} on multi-tenant table '${parsed.tables.join(', ')}' lacks tenant isolation (WHERE tenant_id = $n): ${query.substring(0, 100)}...`);
        }
        break;
        
      case 'INSERT':
        // INSERT operations should include tenant_id in VALUES or SELECT
        if (!normalizedQuery.includes('tenant_id')) {
          throw new Error(`SECURITY BLOCK: INSERT into multi-tenant table '${parsed.tables.join(', ')}' must include tenant_id column: ${query.substring(0, 100)}...`);
        }
        break;
        
      case 'TRUNCATE':
        // TRUNCATE is extremely dangerous for multi-tenant tables
        throw new Error(`SECURITY BLOCK: TRUNCATE on multi-tenant table '${parsed.tables.join(', ')}' is prohibited - use DELETE with tenant isolation: ${query.substring(0, 100)}...`);
    }
  }
  
  // 🚨 CRITICAL: Enhanced bypass pattern detection (legacy + new patterns)
  const enhancedBypassPatterns = [
    /tenant_id\s*is\s*null/i,          // tenant_id IS NULL
    /tenant_id\s*!=\s*/i,              // tenant_id != (not equals)
    /tenant_id\s*<>/i,                 // tenant_id <> (not equals)
    /not.*tenant_id\s*=/i,             // NOT tenant_id =
    /or\s+tenant_id\s*=/i,             // OR tenant_id = (legacy pattern)
    /tenant_id\s*=.*\s+or\b/i,         // tenant_id = $1 OR (new pattern)
    /\(.*tenant_id.*or.*\)/i,          // (tenant_id = $1 OR condition)
    /\bor\s+true\b/i,                  // OR TRUE bypass
    /\bor\s+1\s*=\s*1\b/i,            // OR 1=1 bypass
    /tenant_id\s*in\s*\(.*\)/i,       // tenant_id IN (...) could be bypass
  ];
  
  for (const pattern of enhancedBypassPatterns) {
    if (pattern.test(normalizedQuery)) {
      throw new Error(`SECURITY BLOCK: Enhanced bypass pattern detected - query attempts to circumvent tenant isolation: ${query.substring(0, 100)}...`);
    }
  }

  // Log security assessment for monitoring
  if (parsed.securityRisk !== 'SAFE') {
    console.warn(`[DATABASE] Security risk ${parsed.securityRisk} detected for tenant ${tenantId || 'unknown'}: ${query.substring(0, 100)}...`);
  }
}

// =============================================================================
// DATABASE CONNECTION AND POOL MANAGEMENT
// =============================================================================

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'require' || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

/**
 * Internal database function for system operations that bypass tenant validation
 * SECURITY NOTE: Only use for system queries like tenant lookup, migrations, etc.
 */
export async function execute_sql_internal(query: string, params?: any[]): Promise<any> {
  const client = getPool();
  try {
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error('Internal database query error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

export async function execute_sql(query: string, params?: any[], tenantId?: string): Promise<any> {
  // 🚨 CRITICAL SECURITY: MANDATORY validation BEFORE ANY database execution
  validateSqlQuery(query, tenantId);
  console.log(`[DATABASE] SECURITY VALIDATED: ${query.substring(0, 100)}...`);
  
  const client = getPool();
  try {
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute multiple SQL statements within a database transaction
 * Provides atomicity and consistency for multi-step operations
 */
export async function execute_transaction(operations: Array<{query: string, params?: any[]}>, tenantId?: string): Promise<any[]> {
  // 🚨 CRITICAL SECURITY: MANDATORY validation of ALL operations in transaction BEFORE execution
  for (const operation of operations) {
    validateSqlQuery(operation.query, tenantId);
    console.log(`[DATABASE] TRANSACTION SECURITY VALIDATED: ${operation.query.substring(0, 100)}...`);
  }
  
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results: any[] = [];
    for (const operation of operations) {
      const result = await client.query(operation.query, operation.params);
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute function within a database transaction with automatic rollback on error
 * Provides a higher-level interface for transaction management
 */
export async function withTransaction<T>(fn: (client: any) => Promise<T>, tenantId?: string): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  // 🚨 CRITICAL SECURITY: Create a SECURED client that validates ALL queries
  const securedClient = {
    ...client,
    query: async (text: string, params?: any[]) => {
      // MANDATORY security validation for ALL queries in transaction
      validateSqlQuery(text, tenantId);
      console.log(`[DATABASE] WITHTRANSACTION SECURITY VALIDATED: ${text.substring(0, 100)}...`);
      return client.query(text, params);
    }
  };
  
  try {
    await client.query('BEGIN');
    const result = await fn(securedClient);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction function error:', error);
    throw error;
  } finally {
    client.release();
  }
}