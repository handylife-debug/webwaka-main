'use server';

import { execute_sql } from '@/lib/database';

export interface PartnerLevel {
  id: string;
  level_name: string;
  level_code: string;
  description?: string;
  default_commission_rate: number;
  minimum_commission_rate: number;
  maximum_commission_rate: number;
  minimum_referrals: number;
  minimum_revenue: number;
  minimum_active_referrals: number;
  benefits: string[];
  permissions: string[];
  can_auto_upgrade: boolean;
  requires_approval: boolean;
  marketing_materials: Record<string, any>;
  level_order: number;
  is_active: boolean;
  max_referral_depth: number; // New field for referral depth
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by?: string;
}

export interface CreatePartnerLevelData {
  level_name: string;
  level_code: string;
  description?: string;
  default_commission_rate: number;
  minimum_commission_rate?: number;
  maximum_commission_rate?: number;
  minimum_referrals?: number;
  minimum_revenue?: number;
  minimum_active_referrals?: number;
  benefits?: string[];
  permissions?: string[];
  can_auto_upgrade?: boolean;
  requires_approval?: boolean;
  marketing_materials?: Record<string, any>;
  level_order: number;
  is_active?: boolean;
  max_referral_depth: number; // Required field for referral depth
  createdBy: string;
}

export interface UpdatePartnerLevelData {
  level_name?: string;
  level_code?: string;
  description?: string;
  default_commission_rate?: number;
  minimum_commission_rate?: number;
  maximum_commission_rate?: number;
  minimum_referrals?: number;
  minimum_revenue?: number;
  minimum_active_referrals?: number;
  benefits?: string[];
  permissions?: string[];
  can_auto_upgrade?: boolean;
  requires_approval?: boolean;
  marketing_materials?: Record<string, any>;
  level_order?: number;
  is_active?: boolean;
  max_referral_depth?: number;
  updatedBy?: string;
}

export type PartnerLevelStatus = 'active' | 'inactive';

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
        default_commission_rate, minimum_commission_rate, maximum_commission_rate,
        minimum_referrals, minimum_revenue, minimum_active_referrals,
        benefits, permissions, can_auto_upgrade, requires_approval,
        marketing_materials, level_order, is_active, max_referral_depth,
        created_at, updated_at, created_by, updated_by
      FROM partner_levels 
      ORDER BY level_order ASC, created_at DESC;
    `);

    return result.rows.map((row: any) => ({
      ...row,
      default_commission_rate: parseFloat(row.default_commission_rate),
      minimum_commission_rate: parseFloat(row.minimum_commission_rate),
      maximum_commission_rate: parseFloat(row.maximum_commission_rate),
      minimum_revenue: parseFloat(row.minimum_revenue),
      benefits: row.benefits || [],
      permissions: row.permissions || [],
      marketing_materials: row.marketing_materials || {},
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
        default_commission_rate, minimum_commission_rate, maximum_commission_rate,
        minimum_referrals, minimum_revenue, minimum_active_referrals,
        benefits, permissions, can_auto_upgrade, requires_approval,
        marketing_materials, level_order, is_active, max_referral_depth,
        created_at, updated_at, created_by, updated_by
      FROM partner_levels 
      WHERE id = $1;
    `, [levelId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      default_commission_rate: parseFloat(row.default_commission_rate),
      minimum_commission_rate: parseFloat(row.minimum_commission_rate),
      maximum_commission_rate: parseFloat(row.maximum_commission_rate),
      minimum_revenue: parseFloat(row.minimum_revenue),
      benefits: row.benefits || [],
      permissions: row.permissions || [],
      marketing_materials: row.marketing_materials || {},
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
        minimum_commission_rate, maximum_commission_rate,
        minimum_referrals, minimum_revenue, minimum_active_referrals,
        benefits, permissions, can_auto_upgrade, requires_approval,
        marketing_materials, level_order, is_active, max_referral_depth,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id;
    `, [
      levelData.level_name,
      levelData.level_code,
      levelData.description || null,
      levelData.default_commission_rate,
      levelData.minimum_commission_rate || 0.0000,
      levelData.maximum_commission_rate || 1.0000,
      levelData.minimum_referrals || 0,
      levelData.minimum_revenue || 0.00,
      levelData.minimum_active_referrals || 0,
      JSON.stringify(levelData.benefits || []),
      JSON.stringify(levelData.permissions || []),
      levelData.can_auto_upgrade !== false,
      levelData.requires_approval || false,
      JSON.stringify(levelData.marketing_materials || {}),
      levelData.level_order,
      levelData.is_active !== false,
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
    if (updates.minimum_commission_rate !== undefined) {
      setClauses.push(`minimum_commission_rate = $${paramCounter++}`);
      values.push(updates.minimum_commission_rate);
    }
    if (updates.maximum_commission_rate !== undefined) {
      setClauses.push(`maximum_commission_rate = $${paramCounter++}`);
      values.push(updates.maximum_commission_rate);
    }
    if (updates.minimum_referrals !== undefined) {
      setClauses.push(`minimum_referrals = $${paramCounter++}`);
      values.push(updates.minimum_referrals);
    }
    if (updates.minimum_revenue !== undefined) {
      setClauses.push(`minimum_revenue = $${paramCounter++}`);
      values.push(updates.minimum_revenue);
    }
    if (updates.minimum_active_referrals !== undefined) {
      setClauses.push(`minimum_active_referrals = $${paramCounter++}`);
      values.push(updates.minimum_active_referrals);
    }
    if (updates.benefits !== undefined) {
      setClauses.push(`benefits = $${paramCounter++}`);
      values.push(JSON.stringify(updates.benefits));
    }
    if (updates.permissions !== undefined) {
      setClauses.push(`permissions = $${paramCounter++}`);
      values.push(JSON.stringify(updates.permissions));
    }
    if (updates.can_auto_upgrade !== undefined) {
      setClauses.push(`can_auto_upgrade = $${paramCounter++}`);
      values.push(updates.can_auto_upgrade);
    }
    if (updates.requires_approval !== undefined) {
      setClauses.push(`requires_approval = $${paramCounter++}`);
      values.push(updates.requires_approval);
    }
    if (updates.marketing_materials !== undefined) {
      setClauses.push(`marketing_materials = $${paramCounter++}`);
      values.push(JSON.stringify(updates.marketing_materials));
    }
    if (updates.level_order !== undefined) {
      setClauses.push(`level_order = $${paramCounter++}`);
      values.push(updates.level_order);
    }
    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${paramCounter++}`);
      values.push(updates.is_active);
    }
    if (updates.max_referral_depth !== undefined) {
      setClauses.push(`max_referral_depth = $${paramCounter++}`);
      values.push(updates.max_referral_depth);
    }
    if (updates.updatedBy !== undefined) {
      setClauses.push(`updated_by = $${paramCounter++}`);
      values.push(updates.updatedBy);
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
    const isActive = status === 'active';
    const result = await execute_sql(`
      UPDATE partner_levels 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [isActive, levelId]);

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
        COUNT(CASE WHEN is_active = true THEN 1 END) as active,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive
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