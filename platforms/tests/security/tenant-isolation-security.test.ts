/**
 * CRITICAL SECURITY TESTS: Tenant Isolation Vulnerabilities
 * 🚨 FIXED: Now tests ACTUAL PRODUCTION CODE instead of fake duplicates
 * Validates that the real security enforcement in production is working correctly
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// 🚨 CRITICAL FIX: Import ACTUAL production security functions
// These are the REAL functions that run in production, not test duplicates
import { 
  validateSqlQuery, 
  parseQuery, 
  ParsedQuery, 
  execute_sql,
  execute_transaction,
  withTransaction
} from '../../lib/database';

describe('🚨 CRITICAL: Production Security Enforcement Tests', () => {
  const TENANT_ID = '12345678-1234-1234-1234-123456789012';
  
  describe('PRODUCTION FUNCTION: validateSqlQuery', () => {
    it('BLOCKS UPDATE without tenant_id even with $ parameters', () => {
      const maliciousQuery = 'UPDATE orders SET status = $1 WHERE id = $2';
      
      expect(() => {
        validateSqlQuery(maliciousQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: UPDATE on multi-tenant table');
    });

    it('BLOCKS DELETE without tenant_id even with $ parameters', () => {
      const maliciousQuery = 'DELETE FROM orders WHERE id = $1';
      
      expect(() => {
        validateSqlQuery(maliciousQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: DELETE on multi-tenant table');
    });

    it('ALLOWS UPDATE with proper tenant isolation', () => {
      const safeQuery = 'UPDATE orders SET status = $1 WHERE id = $2 AND tenant_id = $3';
      
      expect(() => {
        validateSqlQuery(safeQuery, TENANT_ID);
      }).not.toThrow();
    });

    it('ALLOWS DELETE with proper tenant isolation', () => {
      const safeQuery = 'DELETE FROM orders WHERE id = $1 AND tenant_id = $2';
      
      expect(() => {
        validateSqlQuery(safeQuery, TENANT_ID);
      }).not.toThrow();
    });
  });

  describe('PRODUCTION FUNCTION: parseQuery', () => {
    it('correctly identifies SELECT queries with security analysis', () => {
      const query = 'SELECT * FROM orders WHERE tenant_id = $1';
      const parsed = parseQuery(query);
      
      expect(parsed.type).toBe('SELECT');
      expect(parsed.tables).toContain('orders');
      expect(parsed.hasTenantPredicate).toBe(true);
      expect(parsed.hasWhereClause).toBe(true);
      expect(parsed.isMultiTenant).toBe(true);
      expect(parsed.securityRisk).toBe('SAFE');
    });

    it('correctly identifies security risks in unprotected queries', () => {
      const query = 'SELECT * FROM orders WHERE status = $1';
      const parsed = parseQuery(query);
      
      expect(parsed.type).toBe('SELECT');
      expect(parsed.hasTenantPredicate).toBe(false);
      expect(parsed.isMultiTenant).toBe(true);
      expect(parsed.securityRisk).toBe('HIGH');
    });

    it('correctly identifies OR-bypass attack patterns', () => {
      const query = 'SELECT * FROM orders WHERE tenant_id = $1 OR id = $2';
      const parsed = parseQuery(query);
      
      expect(parsed.hasOrBypassPattern).toBe(true);
      expect(parsed.securityRisk).toBe('CRITICAL');
    });

    it('ALLOWS safe OR patterns with tenant isolation', () => {
      const query = 'SELECT * FROM orders WHERE tenant_id = $1 AND (status = $2 OR priority = $3)';
      const parsed = parseQuery(query);
      
      expect(parsed.hasOrBypassPattern).toBe(false);
      expect(parsed.hasTenantPredicate).toBe(true);
      expect(parsed.securityRisk).toBe('SAFE');
    });
  });

  describe('ENHANCED OR-BYPASS DETECTION', () => {
    it('BLOCKS tenant_id = $1 OR id = $2 pattern', () => {
      const orBypassQuery = 'SELECT * FROM orders WHERE tenant_id = $1 OR id = $2';
      
      expect(() => {
        validateSqlQuery(orBypassQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: OR-bypass attack detected');
    });

    it('BLOCKS complex OR patterns with tenant_id', () => {
      const complexOrQuery = 'SELECT * FROM orders WHERE (tenant_id = $1 OR status = $2) AND created_at > $3';
      
      expect(() => {
        validateSqlQuery(complexOrQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK');
    });

    it('BLOCKS parenthesized OR bypass attempts', () => {
      const parenthesizedQuery = 'SELECT * FROM orders WHERE (tenant_id = $1 OR active = true)';
      
      expect(() => {
        validateSqlQuery(parenthesizedQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK');
    });

    it('ALLOWS proper AND-only tenant filtering', () => {
      const safeAndQuery = 'SELECT * FROM orders WHERE tenant_id = $1 AND status = $2 AND id = $3';
      
      expect(() => {
        validateSqlQuery(safeAndQuery, TENANT_ID);
      }).not.toThrow();
    });

    it('ALLOWS safe OR patterns in AND context', () => {
      const safeOrQuery = 'SELECT * FROM orders WHERE tenant_id = $1 AND (status = $2 OR priority = $3)';
      
      expect(() => {
        validateSqlQuery(safeOrQuery, TENANT_ID);
      }).not.toThrow();
    });
  });

  describe('DANGEROUS OPERATIONS BLOCKING', () => {
    it('BLOCKS TRUNCATE operations completely', () => {
      const truncateQuery = 'TRUNCATE TABLE orders';
      
      expect(() => {
        validateSqlQuery(truncateQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: Dangerous SQL operation detected');
    });

    it('BLOCKS DROP operations', () => {
      const dropQuery = 'DROP TABLE orders';
      
      expect(() => {
        validateSqlQuery(dropQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: Dangerous SQL operation detected');
    });

    it('BLOCKS SQL injection attempts with comments', () => {
      const injectionQuery = 'SELECT * FROM orders WHERE id = $1 -- AND tenant_id = $2';
      
      expect(() => {
        validateSqlQuery(injectionQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: Dangerous SQL operation detected');
    });

    it('BLOCKS OR TRUE bypass attempts', () => {
      const bypassQuery = 'SELECT * FROM orders WHERE tenant_id = $1 OR TRUE';
      
      expect(() => {
        validateSqlQuery(bypassQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK');
    });

    it('BLOCKS OR 1=1 bypass attempts', () => {
      const bypassQuery = 'SELECT * FROM orders WHERE tenant_id = $1 OR 1=1';
      
      expect(() => {
        validateSqlQuery(bypassQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK');
    });
  });

  describe('UNION BRANCH ATTACK PREVENTION', () => {
    it('BLOCKS UNION with unprotected second branch', () => {
      const unionBypassQuery = 'SELECT * FROM orders WHERE tenant_id = $1 UNION SELECT * FROM orders WHERE status = $2';
      
      expect(() => {
        validateSqlQuery(unionBypassQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: UNION branch lacks tenant isolation');
    });

    it('ALLOWS UNION with all branches properly protected', () => {
      const safeUnionQuery = `
        SELECT * FROM orders WHERE tenant_id = $1 AND status = 'pending'
        UNION
        SELECT * FROM orders WHERE tenant_id = $2 AND status = 'completed'
      `;
      
      expect(() => {
        validateSqlQuery(safeUnionQuery, TENANT_ID);
      }).not.toThrow();
    });
  });

  describe('INSERT OPERATIONS SECURITY', () => {
    it('BLOCKS INSERT without tenant_id column', () => {
      const maliciousQuery = 'INSERT INTO orders (id, total, status) VALUES ($1, $2, $3)';
      
      expect(() => {
        validateSqlQuery(maliciousQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: INSERT into multi-tenant table');
    });

    it('ALLOWS INSERT with tenant_id column', () => {
      const safeQuery = 'INSERT INTO orders (id, tenant_id, total, status) VALUES ($1, $2, $3, $4)';
      
      expect(() => {
        validateSqlQuery(safeQuery, TENANT_ID);
      }).not.toThrow();
    });
  });

  describe('SYSTEM TABLE EXEMPTIONS', () => {
    it('ALLOWS SELECT on system tables without tenant filter', () => {
      const systemQuery = 'SELECT version()';
      
      expect(() => {
        validateSqlQuery(systemQuery, TENANT_ID);
      }).not.toThrow();
    });

    it('ALLOWS migrations table access', () => {
      const migrationsQuery = 'SELECT * FROM migrations';
      
      expect(() => {
        validateSqlQuery(migrationsQuery, TENANT_ID);
      }).not.toThrow();
    });
  });

  describe('🚨 INTEGRATION: Production Database Functions', () => {
    // These tests verify that the actual execute_sql, execute_transaction, 
    // and withTransaction functions properly call security validation
    
    it('execute_sql calls validateSqlQuery and blocks malicious queries', async () => {
      const maliciousQuery = 'DELETE FROM orders WHERE id = $1';
      
      await expect(async () => {
        await execute_sql(maliciousQuery, ['123']);
      }).rejects.toThrow('SECURITY BLOCK');
    });

    it('execute_transaction validates all operations before execution', async () => {
      const maliciousOperations = [
        { query: 'UPDATE orders SET status = $1 WHERE id = $2', params: ['completed', '123'] },
        { query: 'DELETE FROM orders WHERE id = $1', params: ['456'] }
      ];
      
      await expect(async () => {
        await execute_transaction(maliciousOperations);
      }).rejects.toThrow('SECURITY BLOCK');
    });

    it('withTransaction validates queries through secured client', async () => {
      await expect(async () => {
        await withTransaction(async (client) => {
          return client.query('DELETE FROM orders WHERE id = $1', ['123']);
        });
      }).rejects.toThrow('SECURITY BLOCK');
    });
  });

  describe('REAL-WORLD ATTACK SIMULATION', () => {
    it('BLOCKS sophisticated multi-vector attack', () => {
      const sophisticatedAttack = `
        SELECT o.*, p.* FROM orders o 
        JOIN products p ON o.product_id = p.id 
        WHERE (o.tenant_id = $1 OR o.status = 'public') 
        UNION 
        SELECT o2.*, p2.* FROM orders o2 
        JOIN products p2 ON o2.product_id = p2.id
      `;
      
      expect(() => {
        validateSqlQuery(sophisticatedAttack, TENANT_ID);
      }).toThrow('SECURITY BLOCK');
    });

    it('BLOCKS admin escalation attempt', () => {
      const adminEscalationQuery = 'SELECT * FROM orders WHERE tenant_id = $1 OR user_role = \'admin\'';
      
      expect(() => {
        validateSqlQuery(adminEscalationQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK: OR-bypass attack detected');
    });

    it('BLOCKS data exfiltration via UNION', () => {
      const dataExfiltrationQuery = `
        SELECT id, customer_name FROM orders WHERE tenant_id = $1
        UNION ALL
        SELECT id, customer_name FROM orders WHERE tenant_id != $2
      `;
      
      expect(() => {
        validateSqlQuery(dataExfiltrationQuery, TENANT_ID);
      }).toThrow('SECURITY BLOCK');
    });
  });
});

describe('🚨 PRODUCTION SECURITY STATUS VERIFICATION', () => {
  it('verifies security functions are properly exported and available', () => {
    // These should be available if properly exported from production code
    expect(typeof validateSqlQuery).toBe('function');
    expect(typeof parseQuery).toBe('function');
    expect(typeof execute_sql).toBe('function');
    expect(typeof execute_transaction).toBe('function');
    expect(typeof withTransaction).toBe('function');
  });

  it('verifies production parseQuery returns enhanced security analysis', () => {
    const query = 'SELECT * FROM orders WHERE tenant_id = $1 OR id = $2';
    const parsed = parseQuery(query);
    
    // These properties should exist in the enhanced production version
    expect(parsed).toHaveProperty('hasOrBypassPattern');
    expect(parsed).toHaveProperty('unionBranches');
    expect(parsed).toHaveProperty('hasComplexBooleanLogic');
    expect(parsed).toHaveProperty('securityRisk');
    
    // This should be detected as a critical security risk
    expect(parsed.hasOrBypassPattern).toBe(true);
    expect(parsed.securityRisk).toBe('CRITICAL');
  });
});