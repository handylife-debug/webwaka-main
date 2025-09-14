'use server';

import { execute_sql } from '@/lib/database';

export interface PartnerLevel {
  id: string;
  tenant_id: string;
  level_name: string;
  level_code: string;
  description?: string;
  default_commission_rate: number;
  min_commission_rate: number;
  max_commission_rate: number;
  min_downline_count: number;
  min_volume_requirement: number;
  benefits: string[];
  requirements: string[];
  level_order: number;
  status: string;
  max_referral_depth: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CreatePartnerLevelData {
  level_name: string;
  level_code: string;
  description?: string;
  default_commission_rate: number;
  min_commission_rate?: number;
  max_commission_rate?: number;
  min_downline_count?: number;
  min_volume_requirement?: number;
  benefits?: string[];
  requirements?: string[];
  level_order: number;
  status?: string;
  max_referral_depth: number;
  createdBy: string;
}

export interface UpdatePartnerLevelData {
  level_name?: string;
  level_code?: string;
  description?: string;
  default_commission_rate?: number;
  min_commission_rate?: number;
  max_commission_rate?: number;
  min_downline_count?: number;
  min_volume_requirement?: number;
  benefits?: string[];
  requirements?: string[];
  level_order?: number;
  status?: string;
  max_referral_depth?: number;
  updatedBy?: string;
}

export type PartnerLevelStatus = 'active' | 'inactive' | 'archived';

/**
 * Initialize partner tables if they don't exist
 */
export async function initializePartnerTables(): Promise<void> {
  try {
    // Ensure pgcrypto extension is available for UUID generation
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    
    // Check if partner_levels table has max_referral_depth column
    const columnExists = await execute_sql(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'partner_levels' 
      AND column_name = 'max_referral_depth';
    `);
    
    // Add max_referral_depth column if it doesn't exist
    if (columnExists.rows.length === 0) {
      await execute_sql(`
        ALTER TABLE partner_levels 
        ADD COLUMN IF NOT EXISTS max_referral_depth INTEGER DEFAULT 1;
      `);
    }
    
    console.log('Partner tables initialized successfully');
  } catch (error) {
    console.error('Error initializing partner tables:', error);
    throw new Error('Failed to initialize partner tables');
  }
}

/**
 * Get all partner levels
 */
export async function getAllPartnerLevels(): Promise<PartnerLevel[]> {
  try {
    const result = await execute_sql(`
      SELECT 
        id, level_name, level_code, description,
        default_commission_rate, min_commission_rate, max_commission_rate,
        min_downline_count, min_volume_requirement, benefits, requirements,
        level_order, status, max_referral_depth,
        created_at, updated_at, created_by
      FROM partner_levels 
      ORDER BY level_order ASC, created_at DESC;
    `);

    return result.rows.map((row: any) => ({
      ...row,
      default_commission_rate: parseFloat(row.default_commission_rate),
      min_commission_rate: parseFloat(row.min_commission_rate),
      max_commission_rate: parseFloat(row.max_commission_rate),
      min_volume_requirement: parseFloat(row.min_volume_requirement),
      benefits: row.benefits || [],
      requirements: row.requirements || [],
      max_referral_depth: parseInt(row.max_referral_depth) || 1,
    }));
  } catch (error) {
    console.error('Error fetching partner levels:', error);
    return [];
  }
}

/**
 * Get a specific partner level by ID
 */
export async function getPartnerLevel(levelId: string): Promise<PartnerLevel | null> {
  try {
    const result = await execute_sql(`
      SELECT 
        id, level_name, level_code, description,
        default_commission_rate, min_commission_rate, max_commission_rate,
        min_downline_count, min_volume_requirement, benefits, requirements,
        level_order, status, max_referral_depth,
        created_at, updated_at, created_by
      FROM partner_levels 
      WHERE id = $1;
    `, [levelId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      default_commission_rate: parseFloat(row.default_commission_rate),
      min_commission_rate: parseFloat(row.min_commission_rate),
      max_commission_rate: parseFloat(row.max_commission_rate),
      min_volume_requirement: parseFloat(row.min_volume_requirement),
      benefits: row.benefits || [],
      requirements: row.requirements || [],
      max_referral_depth: parseInt(row.max_referral_depth) || 1,
    };
  } catch (error) {
    console.error('Error fetching partner level:', error);
    return null;
  }
}

/**
 * Create a new partner level
 */
export async function createPartnerLevel(levelData: CreatePartnerLevelData): Promise<string> {
  try {
    const result = await execute_sql(`
      INSERT INTO partner_levels (
        level_name, level_code, description, default_commission_rate,
        min_commission_rate, max_commission_rate,
        min_downline_count, min_volume_requirement,
        benefits, requirements, level_order, status, max_referral_depth,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id;
    `, [
      levelData.level_name,
      levelData.level_code,
      levelData.description || null,
      levelData.default_commission_rate,
      levelData.min_commission_rate || 0.0000,
      levelData.max_commission_rate || 1.0000,
      levelData.min_downline_count || 0,
      levelData.min_volume_requirement || 0.00,
      JSON.stringify(levelData.benefits || []),
      JSON.stringify(levelData.requirements || []),
      levelData.level_order,
      levelData.status || 'active',
      levelData.max_referral_depth,
      levelData.createdBy
    ]);

    return result.rows[0].id;
  } catch (error: any) {
    console.error('Error creating partner level:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      if (error.constraint?.includes('level_name')) {
        throw new Error('A partner level with this name already exists');
      }
      if (error.constraint?.includes('level_code')) {
        throw new Error('A partner level with this code already exists');
      }
      if (error.constraint?.includes('level_order')) {
        throw new Error('A partner level with this order already exists');
      }
    }
    
    throw new Error('Failed to create partner level');
  }
}

/**
 * Update an existing partner level
 */
export async function updatePartnerLevel(levelId: string, updates: UpdatePartnerLevelData): Promise<boolean> {
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    if (updates.level_name !== undefined) {
      setClauses.push(`level_name = $${paramCounter++}`);
      values.push(updates.level_name);
    }
    if (updates.level_code !== undefined) {
      setClauses.push(`level_code = $${paramCounter++}`);
      values.push(updates.level_code);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramCounter++}`);
      values.push(updates.description);
    }
    if (updates.default_commission_rate !== undefined) {
      setClauses.push(`default_commission_rate = $${paramCounter++}`);
      values.push(updates.default_commission_rate);
    }
    if (updates.min_commission_rate !== undefined) {
      setClauses.push(`min_commission_rate = $${paramCounter++}`);
      values.push(updates.min_commission_rate);
    }
    if (updates.max_commission_rate !== undefined) {
      setClauses.push(`max_commission_rate = $${paramCounter++}`);
      values.push(updates.max_commission_rate);
    }
    if (updates.min_downline_count !== undefined) {
      setClauses.push(`min_downline_count = $${paramCounter++}`);
      values.push(updates.min_downline_count);
    }
    if (updates.min_volume_requirement !== undefined) {
      setClauses.push(`min_volume_requirement = $${paramCounter++}`);
      values.push(updates.min_volume_requirement);
    }
    if (updates.benefits !== undefined) {
      setClauses.push(`benefits = $${paramCounter++}`);
      values.push(JSON.stringify(updates.benefits));
    }
    if (updates.requirements !== undefined) {
      setClauses.push(`requirements = $${paramCounter++}`);
      values.push(JSON.stringify(updates.requirements));
    }
    if (updates.level_order !== undefined) {
      setClauses.push(`level_order = $${paramCounter++}`);
      values.push(updates.level_order);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramCounter++}`);
      values.push(updates.status);
    }
    if (updates.max_referral_depth !== undefined) {
      setClauses.push(`max_referral_depth = $${paramCounter++}`);
      values.push(updates.max_referral_depth);
    }

    if (setClauses.length === 0) {
      return true; // No updates to make
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(levelId);

    const query = `
      UPDATE partner_levels 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCounter};
    `;

    await execute_sql(query, values);
    return true;
  } catch (error: any) {
    console.error('Error updating partner level:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      if (error.constraint?.includes('level_name')) {
        throw new Error('A partner level with this name already exists');
      }
      if (error.constraint?.includes('level_code')) {
        throw new Error('A partner level with this code already exists');
      }
      if (error.constraint?.includes('level_order')) {
        throw new Error('A partner level with this order already exists');
      }
    }
    
    return false;
  }
}

/**
 * Delete a partner level
 */
export async function deletePartnerLevel(levelId: string): Promise<boolean> {
  try {
    const result = await execute_sql(`
      DELETE FROM partner_levels 
      WHERE id = $1;
    `, [levelId]);

    return result.rowCount > 0;
  } catch (error: any) {
    console.error('Error deleting partner level:', error);
    
    // Handle foreign key constraint violations
    if (error.code === '23503') {
      throw new Error('Cannot delete partner level - it is being used by existing partners');
    }
    
    return false;
  }
}

/**
 * Update partner level status
 */
export async function updatePartnerLevelStatus(levelId: string, status: PartnerLevelStatus): Promise<boolean> {
  try {
    const result = await execute_sql(`
      UPDATE partner_levels 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [status, levelId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error updating partner level status:', error);
    return false;
  }
}

/**
 * Get partner level statistics
 */
export async function getPartnerLevelStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  try {
    const result = await execute_sql(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive
      FROM partner_levels;
    `);

    const stats = result.rows[0];
    return {
      total: parseInt(stats.total) || 0,
      active: parseInt(stats.active) || 0,
      inactive: parseInt(stats.inactive) || 0,
    };
  } catch (error) {
    console.error('Error fetching partner level stats:', error);
    return { total: 0, active: 0, inactive: 0 };
  }
}