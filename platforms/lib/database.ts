import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

export async function execute_sql(query: string, params?: any[]): Promise<any> {
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
export async function execute_transaction(operations: Array<{query: string, params?: any[]}>): Promise<any[]> {
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
export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await fn(client);
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