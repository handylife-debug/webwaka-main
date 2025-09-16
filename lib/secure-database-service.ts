/**
 * Secure Database Service - Transparent Encryption Integration
 * 
 * Provides transparent encryption/decryption for sensitive data fields
 * in database operations, integrating with the PCI compliance service.
 * 
 * Key features:
 * - Automatic encryption of sensitive fields before database storage
 * - Automatic decryption of sensitive fields after database retrieval
 * - Per-tenant encryption using tenant-specific DEKs
 * - Tamper-evident audit logging for all operations
 */

import { execute_sql, withTransaction } from './database'
import { SecurePCIComplianceService } from './pci-compliance-service'
import { getTenantFromContext } from './tenant-context'
import crypto from 'crypto'

// Define which fields contain sensitive data that requires encryption
export const SENSITIVE_FIELD_CONFIG = {
  pos_transactions: {
    customer_info: { purpose: 'customer_pii', required: false },
    payment_reference: { purpose: 'payment_data', required: false },
    items: { purpose: 'transaction_data', required: false, // Only encrypt if contains customer data
      shouldEncrypt: (data: any) => {
        // Encrypt if items contain customer PII or sensitive pricing data
        const jsonData = typeof data === 'string' ? JSON.parse(data) : data
        return Array.isArray(jsonData) && jsonData.some(item => 
          item.customer_name || item.customer_email || item.special_pricing || item.confidential_notes
        )
      }
    }
  },
  customer_addresses: {
    address_line_1: { purpose: 'customer_pii', required: false },
    address_line_2: { purpose: 'customer_pii', required: false },
    city: { purpose: 'customer_pii', required: false },
    postal_code: { purpose: 'customer_pii', required: false },
    phone: { purpose: 'customer_pii', required: false }
  },
  customers: {
    email: { purpose: 'customer_pii', required: false },
    phone: { purpose: 'customer_pii', required: false },
    notes: { purpose: 'customer_pii', required: false }
  }
} as const

export interface SecureInsertOptions {
  tenantId: string
  table: string
  data: Record<string, any>
  auditContext?: {
    userId?: string
    ipAddress?: string
    userAgent?: string
  }
}

export interface SecureQueryOptions {
  tenantId: string
  query: string
  params?: any[]
  auditContext?: {
    userId?: string
    ipAddress?: string
    userAgent?: string
  }
}

export class SecureDatabaseService {
  private pciService: SecurePCIComplianceService

  constructor(tenantId: string) {
    this.pciService = new SecurePCIComplianceService(tenantId)
  }

  /**
   * Securely insert data with automatic encryption of sensitive fields
   */
  async secureInsert(options: SecureInsertOptions): Promise<any> {
    const { tenantId, table, data, auditContext } = options
    
    try {
      // Check if this table has sensitive fields that need encryption
      const tableConfig = SENSITIVE_FIELD_CONFIG[table as keyof typeof SENSITIVE_FIELD_CONFIG]
      if (!tableConfig) {
        // No sensitive fields - use standard insert
        return this.executeStandardInsert(table, data, tenantId)
      }

      // Encrypt sensitive fields
      const encryptedData = await this.encryptSensitiveFields(table, data, tableConfig)
      
      // Perform the insert with encrypted data
      const result = await withTransaction(async (client) => {
        const columns = Object.keys(encryptedData)
        const values = Object.values(encryptedData)
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
        
        const insertQuery = `
          INSERT INTO ${table} (${columns.join(', ')})
          VALUES (${placeholders})
          RETURNING *
        `
        
        return await client.query(insertQuery, values)
      })

      // Audit the secure insertion
      await this.pciService.createAuditLog({
        eventType: 'secure_data_insert',
        eventAction: 'create',
        eventResult: 'success',
        userId: auditContext?.userId,
        ipAddress: auditContext?.ipAddress || '127.0.0.1',
        userAgent: auditContext?.userAgent || 'SecureDatabaseService',
        resourceType: 'database_record',
        resourceId: result.rows[0]?.id,
        eventDetails: {
          table,
          encryptedFields: Object.keys(tableConfig),
          recordId: result.rows[0]?.id
        },
        riskLevel: 'medium',
        pciRelevant: true
      })

      return result
      
    } catch (error) {
      // Audit the failure
      await this.pciService.createAuditLog({
        eventType: 'secure_data_insert',
        eventAction: 'create',
        eventResult: 'failure',
        userId: auditContext?.userId,
        ipAddress: auditContext?.ipAddress || '127.0.0.1',
        userAgent: auditContext?.userAgent || 'SecureDatabaseService',
        resourceType: 'database_record',
        eventDetails: {
          table,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        riskLevel: 'high',
        pciRelevant: true
      })
      
      throw new Error(`Secure insert failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Securely query data with automatic decryption of sensitive fields
   */
  async secureQuery(options: SecureQueryOptions): Promise<any> {
    const { tenantId, query, params, auditContext } = options
    
    try {
      // Execute the query first
      const result = await execute_sql(query, params)
      
      if (!result.rows || result.rows.length === 0) {
        return result
      }

      // Detect which table(s) are being queried to determine encryption needs
      const tableNames = this.extractTableNamesFromQuery(query)
      
      // Decrypt sensitive fields in all result rows
      const decryptedRows = await Promise.all(
        result.rows.map(async (row: any) => {
          return await this.decryptRowFields(row, tableNames)
        })
      )

      // Audit sensitive data access
      const hasSensitiveData = tableNames.some(table => 
        SENSITIVE_FIELD_CONFIG[table as keyof typeof SENSITIVE_FIELD_CONFIG]
      )
      
      if (hasSensitiveData) {
        await this.pciService.createAuditLog({
          eventType: 'secure_data_access',
          eventAction: 'read',
          eventResult: 'success',
          userId: auditContext?.userId,
          ipAddress: auditContext?.ipAddress || '127.0.0.1',
          userAgent: auditContext?.userAgent || 'SecureDatabaseService',
          resourceType: 'database_query',
          eventDetails: {
            tables: tableNames,
            recordCount: result.rows.length,
            queryHash: crypto.createHash('sha256').update(query).digest('hex').substring(0, 16)
          },
          riskLevel: 'medium',
          pciRelevant: true
        })
      }

      return { ...result, rows: decryptedRows }
      
    } catch (error) {
      // Audit the failure
      await this.pciService.createAuditLog({
        eventType: 'secure_data_access',
        eventAction: 'read',
        eventResult: 'failure',
        ipAddress: auditContext?.ipAddress || '127.0.0.1',
        userAgent: auditContext?.userAgent || 'SecureDatabaseService',
        resourceType: 'database_query',
        eventDetails: {
          error: error instanceof Error ? error.message : 'Unknown error',
          queryHash: crypto.createHash('sha256').update(query).digest('hex').substring(0, 16)
        },
        riskLevel: 'high',
        pciRelevant: true
      })
      
      throw new Error(`Secure query failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Encrypt sensitive fields in data object
   */
  private async encryptSensitiveFields(
    table: string, 
    data: Record<string, any>, 
    tableConfig: any
  ): Promise<Record<string, any>> {
    const result = { ...data }
    
    for (const [fieldName, config] of Object.entries(tableConfig)) {
      const fieldConfig = config as any
      const fieldValue = data[fieldName]
      
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        // Check if this field should be encrypted
        const shouldEncrypt = fieldConfig.shouldEncrypt 
          ? fieldConfig.shouldEncrypt(fieldValue)
          : true
          
        if (shouldEncrypt) {
          try {
            const stringValue = typeof fieldValue === 'string' 
              ? fieldValue 
              : JSON.stringify(fieldValue)
            
            const encryptedValue = await this.pciService.encryptCardData(
              stringValue, 
              fieldConfig.purpose
            )
            
            result[fieldName] = encryptedValue
          } catch (error) {
            throw new Error(`Failed to encrypt field ${fieldName}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }
    }
    
    return result
  }

  /**
   * Decrypt sensitive fields in a database row
   */
  private async decryptRowFields(
    row: Record<string, any>, 
    tableNames: string[]
  ): Promise<Record<string, any>> {
    const result = { ...row }
    
    for (const tableName of tableNames) {
      const tableConfig = SENSITIVE_FIELD_CONFIG[tableName as keyof typeof SENSITIVE_FIELD_CONFIG]
      if (!tableConfig) continue
      
      for (const [fieldName, fieldConfig] of Object.entries(tableConfig)) {
        const fieldValue = row[fieldName]
        
        if (fieldValue && typeof fieldValue === 'string' && fieldValue.startsWith('v2:')) {
          try {
            const decryptedValue = await this.pciService.decryptCardData(fieldValue)
            
            // Try to parse as JSON if it was originally a JSON field
            try {
              result[fieldName] = JSON.parse(decryptedValue)
            } catch {
              result[fieldName] = decryptedValue
            }
          } catch (error) {
            console.error(`Failed to decrypt field ${fieldName}:`, error)
            // Keep the encrypted value rather than failing completely
            result[fieldName] = fieldValue
          }
        }
      }
    }
    
    return result
  }

  /**
   * Extract table names from SQL query
   */
  private extractTableNamesFromQuery(query: string): string[] {
    const tableNames: string[] = []
    
    // Simple regex to extract table names from common SQL patterns
    const patterns = [
      /FROM\s+(\w+)/gi,
      /UPDATE\s+(\w+)/gi,
      /INSERT\s+INTO\s+(\w+)/gi,
      /JOIN\s+(\w+)/gi
    ]
    
    for (const pattern of patterns) {
      const matches = query.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) {
          tableNames.push(match[1].toLowerCase())
        }
      }
    }
    
    return [...new Set(tableNames)] // Remove duplicates
  }

  /**
   * Standard insert for tables without sensitive data
   */
  private async executeStandardInsert(
    table: string, 
    data: Record<string, any>, 
    tenantId: string
  ): Promise<any> {
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
    
    const insertQuery = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `
    
    return await execute_sql(insertQuery, values)
  }
}

/**
 * Factory function to create SecureDatabaseService with tenant context
 */
export async function createSecureDatabaseService(
  tenantId?: string
): Promise<SecureDatabaseService> {
  if (tenantId) {
    return new SecureDatabaseService(tenantId)
  }
  
  // If no tenant provided, try to get from current context
  // This would be implemented based on your context management
  throw new Error('Tenant ID is required for secure database operations')
}

/**
 * Convenience function for secure POS transaction operations
 */
export class SecurePOSService {
  private dbService: SecureDatabaseService

  constructor(tenantId: string) {
    this.dbService = new SecureDatabaseService(tenantId)
  }

  /**
   * Securely create a POS transaction with encrypted customer info
   */
  async createTransaction(transactionData: {
    transaction_number: string
    reference?: string
    items: any[]
    subtotal: number
    total: number
    payment_method: string
    customer_info?: any
    payment_reference?: string
    cashier: string
    tenant_id: string
    [key: string]: any
  }, auditContext?: any): Promise<any> {
    return await this.dbService.secureInsert({
      tenantId: transactionData.tenant_id,
      table: 'pos_transactions',
      data: transactionData,
      auditContext
    })
  }

  /**
   * Securely retrieve POS transactions with decrypted sensitive data
   */
  async getTransactions(
    tenantId: string,
    filters: {
      limit?: number
      offset?: number
      status?: string
    } = {},
    auditContext?: any
  ): Promise<any> {
    let query = `
      SELECT * FROM pos_transactions 
      WHERE tenant_id = $1
    `
    const params = [tenantId]
    let paramIndex = 2

    if (filters.status) {
      query += ` AND payment_status = $${paramIndex}`
      params.push(filters.status)
      paramIndex++
    }

    query += ` ORDER BY created_at DESC`

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`
      params.push(filters.limit.toString())
      paramIndex++
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`
      params.push(filters.offset.toString())
    }

    return await this.dbService.secureQuery({
      tenantId,
      query,
      params,
      auditContext
    })
  }
}