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

export interface PartnerApplication {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  company_name?: string;
  company_website?: string;
  experience_level?: string;
  marketing_experience?: string;
  why_partner?: string;
  referral_methods?: string;
  sponsor_email?: string;
  sponsor_id?: string;
  requested_partner_level_id?: string;
  application_status: string;
  application_date: string;
  reviewed_date?: string;
  reviewed_by?: string;
  approval_notes?: string;
  rejection_reason?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreatePartnerApplicationData {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  company_name?: string;
  company_website?: string;
  experience_level?: string;
  marketing_experience?: string;
  why_partner?: string;
  referral_methods?: string;
  sponsor_email?: string;
  requested_partner_level_id?: string;
}

export interface UpdatePartnerApplicationData {
  application_status?: string;
  reviewed_date?: string;
  reviewed_by?: string;
  approval_notes?: string;
  rejection_reason?: string;
}

export type PartnerApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

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
    
    // Create partner_applications table if it doesn't exist
    await execute_sql(`
      CREATE TABLE IF NOT EXISTS partner_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        email VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        company_name VARCHAR(200),
        company_website VARCHAR(255),
        experience_level VARCHAR(50),
        marketing_experience TEXT,
        why_partner TEXT,
        referral_methods TEXT,
        sponsor_email VARCHAR(255),
        sponsor_id UUID,
        requested_partner_level_id UUID,
        application_status VARCHAR(20) DEFAULT 'pending' CHECK (application_status IN ('pending', 'approved', 'rejected', 'withdrawn')),
        application_date DATE DEFAULT CURRENT_DATE,
        reviewed_date DATE,
        reviewed_by UUID,
        approval_notes TEXT,
        rejection_reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT unique_application_email_per_tenant UNIQUE (tenant_id, email),
        CONSTRAINT check_application_date_not_future CHECK (application_date <= CURRENT_DATE),
        CONSTRAINT check_reviewed_date_after_application CHECK (reviewed_date IS NULL OR reviewed_date >= application_date)
      );
    `);
    
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

/**
 * Create a new partner application
 */
export async function createPartnerApplication(applicationData: CreatePartnerApplicationData): Promise<string | null> {
  try {
    const result = await execute_sql(`
      INSERT INTO partner_applications (
        tenant_id, email, first_name, last_name, phone, company_name, 
        company_website, experience_level, marketing_experience, why_partner, 
        referral_methods, sponsor_email, requested_partner_level_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id;
    `, [
      '00000000-0000-0000-0000-000000000000', // Default tenant for now
      applicationData.email,
      applicationData.first_name,
      applicationData.last_name,
      applicationData.phone || null,
      applicationData.company_name || null,
      applicationData.company_website || null,
      applicationData.experience_level || null,
      applicationData.marketing_experience || null,
      applicationData.why_partner || null,
      applicationData.referral_methods || null,
      applicationData.sponsor_email || null,
      applicationData.requested_partner_level_id || null,
    ]);

    return result.rows[0]?.id || null;
  } catch (error: any) {
    console.error('Error creating partner application:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      if (error.constraint?.includes('email')) {
        throw new Error('An application with this email already exists');
      }
    }
    
    return null;
  }
}

/**
 * Get all partner applications
 */
export async function getAllPartnerApplications(): Promise<PartnerApplication[]> {
  try {
    const result = await execute_sql(`
      SELECT 
        id, tenant_id, email, first_name, last_name, phone, company_name,
        company_website, experience_level, marketing_experience, why_partner,
        referral_methods, sponsor_email, sponsor_id, requested_partner_level_id,
        application_status, application_date, reviewed_date, reviewed_by,
        approval_notes, rejection_reason, metadata, created_at, updated_at
      FROM partner_applications 
      ORDER BY created_at DESC;
    `);

    return result.rows.map((row: any) => ({
      ...row,
      metadata: row.metadata || {},
    }));
  } catch (error) {
    console.error('Error fetching partner applications:', error);
    return [];
  }
}

/**
 * Get pending partner applications
 */
export async function getPendingPartnerApplications(): Promise<PartnerApplication[]> {
  try {
    const result = await execute_sql(`
      SELECT 
        id, tenant_id, email, first_name, last_name, phone, company_name,
        company_website, experience_level, marketing_experience, why_partner,
        referral_methods, sponsor_email, sponsor_id, requested_partner_level_id,
        application_status, application_date, reviewed_date, reviewed_by,
        approval_notes, rejection_reason, metadata, created_at, updated_at
      FROM partner_applications 
      WHERE application_status = 'pending'
      ORDER BY created_at DESC;
    `);

    return result.rows.map((row: any) => ({
      ...row,
      metadata: row.metadata || {},
    }));
  } catch (error) {
    console.error('Error fetching pending partner applications:', error);
    return [];
  }
}

/**
 * Get a specific partner application by ID
 */
export async function getPartnerApplication(applicationId: string): Promise<PartnerApplication | null> {
  try {
    const result = await execute_sql(`
      SELECT 
        id, tenant_id, email, first_name, last_name, phone, company_name,
        company_website, experience_level, marketing_experience, why_partner,
        referral_methods, sponsor_email, sponsor_id, requested_partner_level_id,
        application_status, application_date, reviewed_date, reviewed_by,
        approval_notes, rejection_reason, metadata, created_at, updated_at
      FROM partner_applications 
      WHERE id = $1;
    `, [applicationId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      metadata: row.metadata || {},
    };
  } catch (error) {
    console.error('Error fetching partner application:', error);
    return null;
  }
}

/**
 * Update partner application status (approve/reject)
 */
export async function updatePartnerApplicationStatus(
  applicationId: string, 
  status: PartnerApplicationStatus, 
  reviewedBy: string,
  notes?: string
): Promise<boolean> {
  try {
    const result = await execute_sql(`
      UPDATE partner_applications 
      SET 
        application_status = $1, 
        reviewed_date = CURRENT_DATE,
        reviewed_by = $2,
        ${status === 'approved' ? 'approval_notes' : 'rejection_reason'} = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4;
    `, [status, reviewedBy, notes || null, applicationId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error updating partner application status:', error);
    return false;
  }
}

/**
 * Get partner application statistics
 */
export async function getPartnerApplicationStats(): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}> {
  try {
    const result = await execute_sql(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN application_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN application_status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN application_status = 'rejected' THEN 1 END) as rejected
      FROM partner_applications;
    `);

    const stats = result.rows[0];
    return {
      total: parseInt(stats.total) || 0,
      pending: parseInt(stats.pending) || 0,
      approved: parseInt(stats.approved) || 0,
      rejected: parseInt(stats.rejected) || 0,
    };
  } catch (error) {
    console.error('Error fetching partner application stats:', error);
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
}