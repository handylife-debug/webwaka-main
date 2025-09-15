import { execute_sql } from '@/lib/database';

export type PlanInterval = 'monthly' | 'yearly';
export type PlanStatus = 'active' | 'inactive' | 'archived';

export interface PlanFeature {
  id: string;
  name: string;
  description?: string;
  limit?: number; // null means unlimited
  included: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price: number; // Price in NGN (kobo for precision)
  currency: 'NGN';
  interval: PlanInterval;
  status: PlanStatus;
  features: PlanFeature[];
  limits: Record<string, number>; // e.g., { users: 10, products: 100 }
  isPopular?: boolean;
  trialDays?: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CreatePlanData {
  name: string;
  description?: string;
  price: number; // Price in NGN
  interval: PlanInterval;
  features: Omit<PlanFeature, 'id'>[];
  limits: Record<string, number>;
  isPopular?: boolean;
  trialDays?: number;
  createdBy: string;
}

export interface UpdatePlanData {
  name?: string;
  description?: string;
  price?: number;
  interval?: PlanInterval;
  features?: Omit<PlanFeature, 'id'>[];
  limits?: Record<string, number>;
  isPopular?: boolean;
  trialDays?: number;
  status?: PlanStatus;
}

// Initialize database tables
export async function initializePlansTables(): Promise<void> {
  try {
    // Ensure pgcrypto extension is available for UUID generation
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    
    // Create plans table
    await execute_sql(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        price INTEGER NOT NULL, -- Price in kobo for precision
        currency VARCHAR(3) DEFAULT 'NGN',
        interval VARCHAR(20) NOT NULL CHECK (interval IN ('monthly', 'yearly')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
        features JSONB DEFAULT '[]'::jsonb,
        limits JSONB DEFAULT '{}'::jsonb,
        is_popular BOOLEAN DEFAULT false,
        trial_days INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255) NOT NULL
      );
    `);

    // Create index for faster queries
    await execute_sql(`
      CREATE INDEX IF NOT EXISTS idx_plans_status ON subscription_plans(status);
      CREATE INDEX IF NOT EXISTS idx_plans_created_at ON subscription_plans(created_at);
    `);

    console.log('Subscription plans tables initialized successfully');
  } catch (error) {
    console.error('Error initializing plans tables:', error);
    throw error;
  }
}

export async function createPlan(planData: CreatePlanData): Promise<string> {
  try {
    const features = planData.features.map((feature, index) => ({
      ...feature,
      id: `feature_${Date.now()}_${index}`
    }));

    const result = await execute_sql(`
      INSERT INTO subscription_plans (
        name, description, price, interval, features, limits, 
        is_popular, trial_days, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `, [
      planData.name,
      planData.description || null,
      Math.round(planData.price * 100), // Convert to kobo
      planData.interval,
      JSON.stringify(features),
      JSON.stringify(planData.limits),
      planData.isPopular || false,
      planData.trialDays || 0,
      planData.createdBy
    ]);

    return result.rows[0].id;
  } catch (error: any) {
    console.error('Error creating plan:', error);
    
    // Handle unique constraint violation for plan name
    if (error.code === '23505' && error.constraint === 'subscription_plans_name_key') {
      throw new Error('A plan with this name already exists');
    }
    
    throw new Error('Failed to create subscription plan');
  }
}

export async function getAllPlans(): Promise<SubscriptionPlan[]> {
  try {
    const result = await execute_sql(`
      SELECT * FROM subscription_plans 
      WHERE status != 'archived'
      ORDER BY created_at DESC;
    `);

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price / 100, // Convert from kobo to NGN
      currency: row.currency as 'NGN',
      interval: row.interval as PlanInterval,
      status: row.status as PlanStatus,
      features: row.features || [],
      limits: row.limits || {},
      isPopular: row.is_popular,
      trialDays: row.trial_days,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by
    }));
  } catch (error) {
    console.error('Error fetching plans:', error);
    return [];
  }
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  try {
    const result = await execute_sql(`
      SELECT * FROM subscription_plans WHERE id = $1;
    `, [planId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price / 100, // Convert from kobo to NGN
      currency: row.currency as 'NGN',
      interval: row.interval as PlanInterval,
      status: row.status as PlanStatus,
      features: row.features || [],
      limits: row.limits || {},
      isPopular: row.is_popular,
      trialDays: row.trial_days,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by
    };
  } catch (error) {
    console.error('Error fetching plan:', error);
    return null;
  }
}

export async function updatePlan(planId: string, updates: UpdatePlanData): Promise<boolean> {
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramCounter++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramCounter++}`);
      values.push(updates.description);
    }
    if (updates.price !== undefined) {
      setClauses.push(`price = $${paramCounter++}`);
      values.push(Math.round(updates.price * 100)); // Convert to kobo
    }
    if (updates.interval !== undefined) {
      setClauses.push(`interval = $${paramCounter++}`);
      values.push(updates.interval);
    }
    if (updates.features !== undefined) {
      const features = updates.features.map((feature: any, index) => ({
        ...feature,
        id: feature.id || `feature_${Date.now()}_${index}`
      }));
      setClauses.push(`features = $${paramCounter++}`);
      values.push(JSON.stringify(features));
    }
    if (updates.limits !== undefined) {
      setClauses.push(`limits = $${paramCounter++}`);
      values.push(JSON.stringify(updates.limits));
    }
    if (updates.isPopular !== undefined) {
      setClauses.push(`is_popular = $${paramCounter++}`);
      values.push(updates.isPopular);
    }
    if (updates.trialDays !== undefined) {
      setClauses.push(`trial_days = $${paramCounter++}`);
      values.push(updates.trialDays);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramCounter++}`);
      values.push(updates.status);
    }

    if (setClauses.length === 0) {
      return true; // No updates to make
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(planId);

    const query = `
      UPDATE subscription_plans 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCounter};
    `;

    await execute_sql(query, values);
    return true;
  } catch (error) {
    console.error('Error updating plan:', error);
    return false;
  }
}

export async function deletePlan(planId: string): Promise<boolean> {
  try {
    // Soft delete by marking as archived
    await execute_sql(`
      UPDATE subscription_plans 
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, [planId]);
    
    return true;
  } catch (error) {
    console.error('Error deleting plan:', error);
    return false;
  }
}

export async function getPlansStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  totalRevenue: number; // Monthly revenue potential
}> {
  try {
    const result = await execute_sql(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COALESCE(SUM(price) FILTER (WHERE status = 'active' AND interval = 'monthly'), 0) as monthly_revenue
      FROM subscription_plans 
      WHERE status != 'archived';
    `);

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      active: parseInt(row.active),
      inactive: parseInt(row.inactive),
      totalRevenue: row.monthly_revenue / 100 // Convert from kobo to NGN
    };
  } catch (error) {
    console.error('Error fetching plans stats:', error);
    return { total: 0, active: 0, inactive: 0, totalRevenue: 0 };
  }
}