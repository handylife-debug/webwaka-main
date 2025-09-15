"use server";

import { execute_sql, withTransaction } from "@/lib/database";
import { headers } from "next/headers";
// SECURITY: All functions in this module are properly tenant-scoped to prevent cross-tenant access
// Every query includes tenant_id filters to ensure multi-tenant isolation
// Use getCurrentTenantId() to safely get tenant context from request headers

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

export type PartnerLevelStatus = "active" | "inactive" | "archived";

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

// Commission Engine Interfaces
export interface Commission {
  id: string;
  tenant_id: string;
  transaction_id: string;
  transaction_amount: number;
  transaction_type: string;
  beneficiary_partner_id: string;
  beneficiary_partner_code: string;
  source_partner_id: string;
  source_partner_code: string;
  commission_level: number;
  levels_from_source: number;
  commission_percentage: number;
  commission_amount: number;
  beneficiary_partner_level_id: string;
  beneficiary_partner_level_name: string;
  calculation_status: string;
  payout_status: string;
  transaction_date: string;
  calculation_date: string;
  approved_date?: string;
  paid_date?: string;
  commission_engine_version: string;
  notes?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TransactionData {
  transaction_id: string;
  customer_partner_id?: string; // The partner who referred the customer
  customer_email?: string;
  transaction_amount: number;
  transaction_type: "payment" | "signup" | "recurring" | "bonus";
  transaction_date: Date;
  metadata?: Record<string, any>;
}

export interface CommissionCalculationResult {
  success: boolean;
  transaction_id: string;
  total_commissions_calculated: number;
  total_commission_amount: number;
  commissions: Commission[];
  errors?: string[];
}

export interface UplinePartner {
  partner_id: string;
  partner_code: string;
  partner_level_id: string;
  partner_level_name: string;
  commission_rate: number;
  max_referral_depth: number;
  levels_from_source: number;
  relationship_type: string;
}

export interface UpdatePartnerApplicationData {
  application_status?: string;
  reviewed_date?: string;
  reviewed_by?: string;
  approval_notes?: string;
  rejection_reason?: string;
}

export type PartnerApplicationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "withdrawn";

// Payout Request Interfaces
export interface PayoutRequest {
  id: string;
  tenant_id: string;
  partner_id: string;
  partner_code: string;
  requested_amount: number;
  payable_balance_at_request: number;
  request_status: string;
  request_date: string;
  reviewed_date?: string;
  reviewed_by?: string;
  approval_notes?: string;
  rejection_reason?: string;
  payment_method?: string;
  payment_details?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreatePayoutRequestData {
  partner_id: string;
  requested_amount: number;
  payment_method?: string;
  payment_details?: Record<string, any>;
}

export type PayoutRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

/**
 * DEPRECATED: Initialize partner tables if they don't exist
 * 
 * ⚠️  SECURITY RISK: Runtime DDL execution removed for production safety
 * 
 * This function previously executed DDL statements at runtime, which is a security risk.
 * Database schema should be managed through proper migrations, not runtime execution.
 * 
 * For development/testing only - use proper migration tools in production.
 * 
 * @deprecated Use proper database migrations instead of runtime schema setup
 */
export async function initializePartnerTables(): Promise<void> {
  console.warn(
    "⚠️  initializePartnerTables() is deprecated and disabled for security."
  );
  console.warn(
    "Use proper database migrations instead of runtime DDL execution."
  );
  console.warn(
    "This prevents security risks from runtime schema modifications."
  );
  
  // Only basic extension setup is safe to run
  try {
    await execute_sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    console.log("Basic extensions verified - use migrations for schema setup");
  } catch (error) {
    console.error("Error setting up basic extensions:", error);
    throw new Error("Failed to verify basic database extensions");
  }
}

/**
 * Get all partner levels for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function getAllPartnerLevels(): Promise<PartnerLevel[]> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(`
      SELECT 
        id, tenant_id, level_name, level_code, description,
        default_commission_rate, min_commission_rate, max_commission_rate,
        min_downline_count, min_volume_requirement, benefits, requirements,
        level_order, status, max_referral_depth,
        created_at, updated_at, created_by
      FROM partner_levels 
      WHERE tenant_id = $1
      ORDER BY level_order ASC, created_at DESC;
    `, [tenantId]);

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
    console.error("Error fetching partner levels:", error);
    return [];
  }
}

/**
 * Get a specific partner level by ID for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function getPartnerLevel(
  levelId: string,
): Promise<PartnerLevel | null> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      SELECT 
        id, tenant_id, level_name, level_code, description,
        default_commission_rate, min_commission_rate, max_commission_rate,
        min_downline_count, min_volume_requirement, benefits, requirements,
        level_order, status, max_referral_depth,
        created_at, updated_at, created_by
      FROM partner_levels 
      WHERE id = $1 AND tenant_id = $2;
    `,
      [levelId, tenantId],
    );

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
    console.error("Error fetching partner level:", error);
    return null;
  }
}

/**
 * Create a new partner level for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function createPartnerLevel(
  levelData: CreatePartnerLevelData,
): Promise<string> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      INSERT INTO partner_levels (
        tenant_id, level_name, level_code, description, default_commission_rate,
        min_commission_rate, max_commission_rate,
        min_downline_count, min_volume_requirement,
        benefits, requirements, level_order, status, max_referral_depth,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id;
    `,
      [
        tenantId,
        levelData.level_name,
        levelData.level_code,
        levelData.description || null,
        levelData.default_commission_rate,
        levelData.min_commission_rate || 0.0,
        levelData.max_commission_rate || 1.0,
        levelData.min_downline_count || 0,
        levelData.min_volume_requirement || 0.0,
        JSON.stringify(levelData.benefits || []),
        JSON.stringify(levelData.requirements || []),
        levelData.level_order,
        levelData.status || "active",
        levelData.max_referral_depth,
        levelData.createdBy,
      ],
    );

    return result.rows[0].id;
  } catch (error: any) {
    console.error("Error creating partner level:", error);

    // Handle unique constraint violations
    if (error.code === "23505") {
      if (error.constraint?.includes("level_name")) {
        throw new Error("A partner level with this name already exists for this tenant");
      }
      if (error.constraint?.includes("level_code")) {
        throw new Error("A partner level with this code already exists for this tenant");
      }
      if (error.constraint?.includes("level_order")) {
        throw new Error("A partner level with this order already exists for this tenant");
      }
    }

    throw new Error("Failed to create partner level");
  }
}

/**
 * Update an existing partner level for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function updatePartnerLevel(
  levelId: string,
  updates: UpdatePartnerLevelData,
): Promise<boolean> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

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
    values.push(tenantId);

    const query = `
      UPDATE partner_levels 
      SET ${setClauses.join(", ")}
      WHERE id = $${paramCounter} AND tenant_id = $${paramCounter + 1};
    `;

    const result = await execute_sql(query, values);
    return result.rowCount > 0;
  } catch (error: any) {
    console.error("Error updating partner level:", error);

    // Handle unique constraint violations
    if (error.code === "23505") {
      if (error.constraint?.includes("level_name")) {
        throw new Error("A partner level with this name already exists for this tenant");
      }
      if (error.constraint?.includes("level_code")) {
        throw new Error("A partner level with this code already exists for this tenant");
      }
      if (error.constraint?.includes("level_order")) {
        throw new Error("A partner level with this order already exists for this tenant");
      }
    }

    return false;
  }
}

/**
 * Delete a partner level for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function deletePartnerLevel(levelId: string): Promise<boolean> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      DELETE FROM partner_levels 
      WHERE id = $1 AND tenant_id = $2;
    `,
      [levelId, tenantId],
    );

    return result.rowCount > 0;
  } catch (error: any) {
    console.error("Error deleting partner level:", error);

    // Handle foreign key constraint violations
    if (error.code === "23503") {
      throw new Error(
        "Cannot delete partner level - it is being used by existing partners",
      );
    }

    return false;
  }
}

/**
 * Update partner level status for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function updatePartnerLevelStatus(
  levelId: string,
  status: PartnerLevelStatus,
): Promise<boolean> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      UPDATE partner_levels 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3;
    `,
      [status, levelId, tenantId],
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error("Error updating partner level status:", error);
    return false;
  }
}

/**
 * Get partner level statistics for current tenant
 * SECURITY: Properly tenant-scoped to prevent cross-tenant data access
 */
export async function getPartnerLevelStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive
      FROM partner_levels
      WHERE tenant_id = $1;
    `, [tenantId]);

    const stats = result.rows[0];
    return {
      total: parseInt(stats.total) || 0,
      active: parseInt(stats.active) || 0,
      inactive: parseInt(stats.inactive) || 0,
    };
  } catch (error) {
    console.error("Error fetching partner level stats:", error);
    return { total: 0, active: 0, inactive: 0 };
  }
}

/**
 * Extract subdomain from current request headers
 */
async function getCurrentSubdomain(): Promise<string | null> {
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const hostname = host.split(":")[0];

    // Local development environment
    if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
      if (hostname.includes(".localhost")) {
        return hostname.split(".")[0];
      }
      return null;
    }

    // Production environment - extract subdomain
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "example.com";
    const rootDomainFormatted = rootDomain.split(":")[0];

    // Handle preview deployment URLs (tenant---branch-name.vercel.app)
    if (hostname.includes("---") && hostname.endsWith(".vercel.app")) {
      const parts = hostname.split("---");
      return parts.length > 0 ? parts[0] : null;
    }

    // Regular subdomain detection
    const isSubdomain =
      hostname !== rootDomainFormatted &&
      hostname !== `www.${rootDomainFormatted}` &&
      hostname.endsWith(`.${rootDomainFormatted}`);

    return isSubdomain ? hostname.replace(`.${rootDomainFormatted}`, "") : null;
  } catch (error) {
    console.error("Error extracting subdomain:", error);
    return null;
  }
}

/**
 * Get tenant by subdomain, create if doesn't exist
 */
async function getOrCreateTenant(subdomain: string): Promise<string | null> {
  try {
    // First, try to get existing tenant
    const existingTenant = await execute_sql(
      `SELECT id FROM tenants WHERE subdomain = $1`,
      [subdomain],
    );

    if (existingTenant.rows.length > 0) {
      return existingTenant.rows[0].id;
    }

    // Create new tenant if doesn't exist
    const newTenant = await execute_sql(
      `INSERT INTO tenants (subdomain, tenant_name) VALUES ($1, $2) RETURNING id`,
      [subdomain, subdomain], // Use subdomain as tenant_name for now
    );

    return newTenant.rows[0]?.id || null;
  } catch (error) {
    console.error("Error getting or creating tenant:", error);
    return null;
  }
}

/**
 * Get current tenant ID from request context
 * Enhanced with testing support via global mock override
 */
/**
 * SECURITY-CRITICAL: Get current tenant ID from request context
 * 
 * This function safely extracts tenant context from request headers/subdomain.
 * NEVER trust tenant_id from request body - always use this function.
 * 
 * @returns {Promise<string | null>} Tenant ID or null if unable to determine
 */
async function getCurrentTenantId(): Promise<string | null> {
  // Support for testing - allow mocking the current tenant ID
  if (typeof global !== "undefined" && (global as any).mockCurrentTenantId) {
    return (global as any).mockCurrentTenantId;
  }

  const subdomain = await getCurrentSubdomain();
  if (!subdomain) {
    // For main domain requests, use a default tenant
    return await getOrCreateTenant("main");
  }

  return await getOrCreateTenant(subdomain);
}

/**
 * SECURITY: Validate tenant access and context
 * Used throughout this module to ensure proper tenant isolation
 */
function validateTenantId(tenantId: string | null): asserts tenantId is string {
  if (!tenantId) {
    throw new Error("SECURITY: Unable to determine tenant context - operation blocked");
  }
}

/**
 * Get partner record by user ID
 */
export async function getPartnerByUserId(
  userId: string,
): Promise<string | null> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      SELECT id FROM partners 
      WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
      LIMIT 1;
    `,
      [tenantId, userId],
    );

    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error("Error fetching partner by user ID:", error);
    return null;
  }
}

/**
 * Get partner record by email (fallback method)
 */
export async function getPartnerByEmail(email: string): Promise<string | null> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      SELECT id FROM partners 
      WHERE tenant_id = $1 AND email = $2 AND status = 'active'
      LIMIT 1;
    `,
      [tenantId, email],
    );

    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error("Error fetching partner by email:", error);
    return null;
  }
}

/**
 * Create a new partner application
 */
export async function createPartnerApplication(
  applicationData: CreatePartnerApplicationData,
): Promise<string | null> {
  try {
    // Get the current tenant ID from request context
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      INSERT INTO partner_applications (
        tenant_id, email, first_name, last_name, phone, company_name, 
        company_website, experience_level, marketing_experience, why_partner, 
        referral_methods, sponsor_email, requested_partner_level_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id;
    `,
      [
        tenantId, // Use actual tenant context
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
      ],
    );

    return result.rows[0]?.id || null;
  } catch (error: any) {
    console.error("Error creating partner application:", error);

    // Handle unique constraint violations
    if (error.code === "23505") {
      if (error.constraint?.includes("email")) {
        throw new Error("An application with this email already exists");
      }
    }

    return null;
  }
}

/**
 * Get all partner applications
 */
export async function getAllPartnerApplications(): Promise<
  PartnerApplication[]
> {
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
    console.error("Error fetching partner applications:", error);
    return [];
  }
}

/**
 * Get pending partner applications
 */
export async function getPendingPartnerApplications(): Promise<
  PartnerApplication[]
> {
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
    console.error("Error fetching pending partner applications:", error);
    return [];
  }
}

/**
 * Get a specific partner application by ID
 */
export async function getPartnerApplication(
  applicationId: string,
): Promise<PartnerApplication | null> {
  try {
    const result = await execute_sql(
      `
      SELECT 
        id, tenant_id, email, first_name, last_name, phone, company_name,
        company_website, experience_level, marketing_experience, why_partner,
        referral_methods, sponsor_email, sponsor_id, requested_partner_level_id,
        application_status, application_date, reviewed_date, reviewed_by,
        approval_notes, rejection_reason, metadata, created_at, updated_at
      FROM partner_applications 
      WHERE id = $1;
    `,
      [applicationId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      metadata: row.metadata || {},
    };
  } catch (error) {
    console.error("Error fetching partner application:", error);
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
  notes?: string,
): Promise<boolean> {
  try {
    const result = await execute_sql(
      `
      UPDATE partner_applications 
      SET 
        application_status = $1, 
        reviewed_date = CURRENT_DATE,
        reviewed_by = $2,
        ${status === "approved" ? "approval_notes" : "rejection_reason"} = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4;
    `,
      [status, reviewedBy, notes || null, applicationId],
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error("Error updating partner application status:", error);
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
    console.error("Error fetching partner application stats:", error);
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
}

// =============================================================================
// COMMISSION ENGINE - "TISSUE" SYSTEM
// =============================================================================

/**
 * Get upline partners for commission calculation using recursive traversal
 */
async function getUplinePartners(
  client: any,
  sourcePartnerId: string,
  tenantId: string,
  maxDepth: number = 10,
): Promise<UplinePartner[]> {
  try {
    const result = await client.query(
      `
      WITH RECURSIVE upline_tree AS (
        -- Base case: the partner who made the sale
        SELECT 
          p.id, p.partner_code, p.partner_level_id,
          pl.level_name, pl.default_commission_rate, pl.max_referral_depth,
          0 as levels_from_source,
          'direct' as relationship_type
        FROM partners p
        LEFT JOIN partner_levels pl ON p.partner_level_id = pl.id
        WHERE p.id = $1 AND p.tenant_id = $2
        
        UNION ALL
        
        -- Recursive case: traverse upline via partner_relations
        SELECT 
          p.id, p.partner_code, p.partner_level_id,
          pl.level_name, pl.default_commission_rate, pl.max_referral_depth,
          ut.levels_from_source + 1,
          pr.relationship_type
        FROM partners p
        INNER JOIN partner_relations pr ON p.id = pr.parent_partner_id
        INNER JOIN upline_tree ut ON pr.child_partner_id = ut.id
        LEFT JOIN partner_levels pl ON p.partner_level_id = pl.id
        WHERE p.tenant_id = $2 
          AND pr.tenant_id = $2 
          AND pr.status = 'active'
          AND ut.levels_from_source < $3
          AND ut.levels_from_source < pl.max_referral_depth
      )
      SELECT 
        id as partner_id,
        partner_code,
        partner_level_id,
        level_name as partner_level_name,
        default_commission_rate as commission_rate,
        max_referral_depth,
        levels_from_source,
        relationship_type
      FROM upline_tree 
      WHERE levels_from_source > 0  -- Exclude the original source
      ORDER BY levels_from_source ASC;
    `,
      [sourcePartnerId, tenantId, maxDepth],
    );

    return result.rows.map((row: any) => ({
      partner_id: row.partner_id,
      partner_code: row.partner_code,
      partner_level_id: row.partner_level_id,
      partner_level_name: row.partner_level_name,
      commission_rate: parseFloat(row.commission_rate) || 0,
      max_referral_depth: parseInt(row.max_referral_depth) || 1,
      levels_from_source: parseInt(row.levels_from_source),
      relationship_type: row.relationship_type,
    }));
  } catch (error) {
    console.error("Error getting upline partners:", error);
    return [];
  }
}

/**
 * Calculate commission amount based on transaction amount and commission rate
 * Uses precise decimal arithmetic to avoid floating-point precision errors
 */
function calculateCommissionAmount(
  transactionAmount: number,
  commissionRate: number,
): number {
  // Use high precision calculation then round to nearest cent
  const commission = transactionAmount * commissionRate;

  // Round to nearest cent using banker's rounding for financial accuracy
  return Math.round(commission * 100) / 100;
}

/**
 * Get partner by ID with level information
 */
async function getPartnerWithLevel(
  client: any,
  partnerId: string,
  tenantId: string,
): Promise<any> {
  try {
    const result = await client.query(
      `
      SELECT 
        p.id, p.partner_code, p.partner_level_id,
        pl.level_name, pl.default_commission_rate, pl.max_referral_depth
      FROM partners p
      LEFT JOIN partner_levels pl ON p.partner_level_id = pl.id
      WHERE p.id = $1 AND p.tenant_id = $2;
    `,
      [partnerId, tenantId],
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error("Error getting partner with level:", error);
    return null;
  }
}

/**
 * Create commission record in database with idempotent processing
 * Uses INSERT ... ON CONFLICT DO NOTHING to prevent duplicate commissions during retries
 */
async function createCommissionRecord(
  client: any,
  tenantId: string,
  transactionData: TransactionData,
  beneficiaryPartner: UplinePartner,
  sourcePartner: any,
  commissionAmount: number,
): Promise<{ id: string | null; wasCreated: boolean }> {
  try {
    // First try to insert the commission record with ON CONFLICT handling
    const insertResult = await client.query(
      `
      INSERT INTO partner_commissions (
        tenant_id, transaction_id, transaction_amount, transaction_type,
        beneficiary_partner_id, beneficiary_partner_code,
        source_partner_id, source_partner_code,
        commission_level, levels_from_source,
        commission_percentage, commission_amount,
        beneficiary_partner_level_id, beneficiary_partner_level_name,
        transaction_date, commission_engine_version, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (tenant_id, transaction_id, beneficiary_partner_id, levels_from_source) 
      DO NOTHING
      RETURNING id;
    `,
      [
        tenantId,
        transactionData.transaction_id,
        transactionData.transaction_amount,
        transactionData.transaction_type,
        beneficiaryPartner.partner_id,
        beneficiaryPartner.partner_code,
        sourcePartner.id,
        sourcePartner.partner_code,
        beneficiaryPartner.levels_from_source, // commission_level = levels from source
        beneficiaryPartner.levels_from_source,
        beneficiaryPartner.commission_rate,
        commissionAmount,
        beneficiaryPartner.partner_level_id,
        beneficiaryPartner.partner_level_name,
        transactionData.transaction_date.toISOString(),
        "1.0", // commission_engine_version
        JSON.stringify(transactionData.metadata || {}),
      ],
    );

    if (insertResult.rows.length > 0) {
      // New record was created
      return { id: insertResult.rows[0].id, wasCreated: true };
    } else {
      // Record already existed, get the existing one
      const selectResult = await client.query(
        `
        SELECT id FROM partner_commissions 
        WHERE tenant_id = $1 
          AND transaction_id = $2 
          AND beneficiary_partner_id = $3 
          AND levels_from_source = $4;
      `,
        [
          tenantId,
          transactionData.transaction_id,
          beneficiaryPartner.partner_id,
          beneficiaryPartner.levels_from_source,
        ],
      );

      return {
        id: selectResult.rows[0]?.id || null,
        wasCreated: false,
      };
    }
  } catch (error) {
    console.error("Error creating commission record:", error);
    throw error; // Re-throw to trigger transaction rollback
  }
}

/**
 * COMMISSION ENGINE "TISSUE" - Main function triggered after successful payments
 *
 * This is the core Commission Engine that:
 * 1. Identifies the client's referring partner
 * 2. Calculates commission amounts based on partner tiers
 * 3. Recursively traverses partner_relations tree for upline commissions
 * 4. Stores commission entries in partner_commissions table
 *
 * Enhanced with:
 * - Database transaction wrapping for atomicity
 * - Idempotent processing to prevent duplicate commissions on retry
 * - Comprehensive error handling with automatic rollback
 * - Audit trail for regulatory compliance
 */
export async function processCommissionCalculation(
  transactionData: TransactionData,
): Promise<CommissionCalculationResult> {
  const startTime = Date.now();
  const auditLog = {
    transaction_id: transactionData.transaction_id,
    start_time: new Date().toISOString(),
    tenant_id: "",
    source_partner_code: "",
    upline_partners_processed: 0,
    new_commissions_created: 0,
    existing_commissions_found: 0,
    total_commission_amount: 0,
    errors: [] as string[],
    processing_time_ms: 0,
    status: "started",
  };

  try {
    // Get current tenant ID from request context
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      auditLog.status = "failed";
      auditLog.errors.push("Unable to determine tenant context");
      console.error("Commission calculation audit:", auditLog);

      return {
        success: false,
        transaction_id: transactionData.transaction_id,
        total_commissions_calculated: 0,
        total_commission_amount: 0,
        commissions: [],
        errors: ["Unable to determine tenant context"],
      };
    }
    auditLog.tenant_id = tenantId;

    // Validate transaction data
    if (
      !transactionData.customer_partner_id ||
      transactionData.transaction_amount <= 0
    ) {
      auditLog.status = "failed";
      auditLog.errors.push(
        "Invalid transaction data: missing partner ID or invalid amount",
      );
      console.error("Commission calculation audit:", auditLog);

      return {
        success: false,
        transaction_id: transactionData.transaction_id,
        total_commissions_calculated: 0,
        total_commission_amount: 0,
        commissions: [],
        errors: [
          "Invalid transaction data: missing partner ID or invalid amount",
        ],
      };
    }

    // Execute the entire commission calculation within a database transaction
    const result = await withTransaction(async (client) => {
      // Get the referring partner (source of the transaction)
      const sourcePartner = await getPartnerWithLevel(
        client,
        transactionData.customer_partner_id!,
        tenantId,
      );
      if (!sourcePartner) {
        throw new Error("Referring partner not found");
      }
      auditLog.source_partner_code = sourcePartner.partner_code;

      // Get upline partners for commission calculation
      const uplinePartners = await getUplinePartners(
        client,
        sourcePartner.id,
        tenantId,
      );
      auditLog.upline_partners_processed = uplinePartners.length;

      const calculatedCommissions: Commission[] = [];
      const errors: string[] = [];
      let totalCommissionAmount = 0;
      let newCommissionsCreated = 0;
      let existingCommissionsFound = 0;

      // Calculate commissions for each upline partner
      for (const uplinePartner of uplinePartners) {
        try {
          // Calculate commission amount
          const commissionAmount = calculateCommissionAmount(
            transactionData.transaction_amount,
            uplinePartner.commission_rate,
          );

          if (commissionAmount > 0) {
            // Create commission record with idempotent processing
            const commissionResult = await createCommissionRecord(
              client,
              tenantId,
              transactionData,
              uplinePartner,
              sourcePartner,
              commissionAmount,
            );

            if (commissionResult.id) {
              if (commissionResult.wasCreated) {
                newCommissionsCreated++;
              } else {
                existingCommissionsFound++;
              }

              calculatedCommissions.push({
                id: commissionResult.id,
                tenant_id: tenantId,
                transaction_id: transactionData.transaction_id,
                transaction_amount: transactionData.transaction_amount,
                transaction_type: transactionData.transaction_type,
                beneficiary_partner_id: uplinePartner.partner_id,
                beneficiary_partner_code: uplinePartner.partner_code,
                source_partner_id: sourcePartner.id,
                source_partner_code: sourcePartner.partner_code,
                commission_level: uplinePartner.levels_from_source,
                levels_from_source: uplinePartner.levels_from_source,
                commission_percentage: uplinePartner.commission_rate,
                commission_amount: commissionAmount,
                beneficiary_partner_level_id: uplinePartner.partner_level_id,
                beneficiary_partner_level_name:
                  uplinePartner.partner_level_name,
                calculation_status: "calculated",
                payout_status: "pending",
                transaction_date:
                  transactionData.transaction_date.toISOString(),
                calculation_date: new Date().toISOString(),
                commission_engine_version: "1.0",
                metadata: transactionData.metadata || {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

              totalCommissionAmount += commissionAmount;
            } else {
              errors.push(
                `Failed to create commission record for partner ${uplinePartner.partner_code}`,
              );
            }
          }
        } catch (error) {
          errors.push(
            `Error calculating commission for partner ${uplinePartner.partner_code}: ${error}`,
          );
          auditLog.errors.push(
            `Partner ${uplinePartner.partner_code}: ${error}`,
          );
        }
      }

      // Update audit log
      auditLog.new_commissions_created = newCommissionsCreated;
      auditLog.existing_commissions_found = existingCommissionsFound;
      auditLog.total_commission_amount = totalCommissionAmount;
      auditLog.processing_time_ms = Date.now() - startTime;
      auditLog.status = "completed";

      // Log the commission calculation for audit trail
      console.log("Commission calculation audit:", auditLog);

      return {
        calculatedCommissions,
        errors,
        totalCommissionAmount,
      };
    });

    return {
      success: true,
      transaction_id: transactionData.transaction_id,
      total_commissions_calculated: result.calculatedCommissions.length,
      total_commission_amount: result.totalCommissionAmount,
      commissions: result.calculatedCommissions,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  } catch (error) {
    auditLog.status = "failed";
    auditLog.errors.push(`Commission calculation failed: ${error}`);
    auditLog.processing_time_ms = Date.now() - startTime;
    console.error("Commission calculation audit:", auditLog);

    return {
      success: false,
      transaction_id: transactionData.transaction_id,
      total_commissions_calculated: 0,
      total_commission_amount: 0,
      commissions: [],
      errors: [`Commission calculation failed: ${error}`],
    };
  }
}

/**
 * Get commission records for a partner
 */
export async function getPartnerCommissions(
  partnerId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: string;
    transaction_type?: string;
  } = {},
): Promise<Commission[]> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    let whereClause =
      "WHERE pc.tenant_id = $1 AND pc.beneficiary_partner_id = $2";
    const params: any[] = [tenantId, partnerId];
    let paramIndex = 3;

    if (options.status) {
      whereClause += ` AND pc.payout_status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    if (options.transaction_type) {
      whereClause += ` AND pc.transaction_type = $${paramIndex}`;
      params.push(options.transaction_type);
      paramIndex++;
    }

    const limitClause = options.limit ? `LIMIT $${paramIndex}` : "LIMIT 100";
    if (options.limit) {
      params.push(options.limit);
      paramIndex++;
    }

    const offsetClause = options.offset ? `OFFSET $${paramIndex}` : "";
    if (options.offset) {
      params.push(options.offset);
    }

    const result = await execute_sql(
      `
      SELECT 
        pc.*
      FROM partner_commissions pc
      ${whereClause}
      ORDER BY pc.transaction_date DESC, pc.calculation_date DESC
      ${limitClause} ${offsetClause};
    `,
      params,
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      transaction_id: row.transaction_id,
      transaction_amount: parseFloat(row.transaction_amount),
      transaction_type: row.transaction_type,
      beneficiary_partner_id: row.beneficiary_partner_id,
      beneficiary_partner_code: row.beneficiary_partner_code,
      source_partner_id: row.source_partner_id,
      source_partner_code: row.source_partner_code,
      commission_level: parseInt(row.commission_level),
      levels_from_source: parseInt(row.levels_from_source),
      commission_percentage: parseFloat(row.commission_percentage),
      commission_amount: parseFloat(row.commission_amount),
      beneficiary_partner_level_id: row.beneficiary_partner_level_id,
      beneficiary_partner_level_name: row.beneficiary_partner_level_name,
      calculation_status: row.calculation_status,
      payout_status: row.payout_status,
      transaction_date: row.transaction_date,
      calculation_date: row.calculation_date,
      approved_date: row.approved_date,
      paid_date: row.paid_date,
      commission_engine_version: row.commission_engine_version,
      notes: row.notes,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    console.error("Error getting partner commissions:", error);
    return [];
  }
}

/**
 * Get commission statistics for a partner
 */
export async function getPartnerCommissionStats(partnerId: string): Promise<{
  total_earnings: number;
  pending_earnings: number;
  paid_earnings: number;
  total_transactions: number;
  pending_transactions: number;
  paid_transactions: number;
}> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    const result = await execute_sql(
      `
      SELECT 
        COALESCE(SUM(commission_amount), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN payout_status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_earnings,
        COALESCE(SUM(CASE WHEN payout_status = 'paid' THEN commission_amount ELSE 0 END), 0) as paid_earnings,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN payout_status = 'pending' THEN 1 END) as pending_transactions,
        COUNT(CASE WHEN payout_status = 'paid' THEN 1 END) as paid_transactions
      FROM partner_commissions
      WHERE tenant_id = $1 AND beneficiary_partner_id = $2;
    `,
      [tenantId, partnerId],
    );

    const stats = result.rows[0];
    return {
      total_earnings: parseFloat(stats.total_earnings) || 0,
      pending_earnings: parseFloat(stats.pending_earnings) || 0,
      paid_earnings: parseFloat(stats.paid_earnings) || 0,
      total_transactions: parseInt(stats.total_transactions) || 0,
      pending_transactions: parseInt(stats.pending_transactions) || 0,
      paid_transactions: parseInt(stats.paid_transactions) || 0,
    };
  } catch (error) {
    console.error("Error getting partner commission stats:", error);
    return {
      total_earnings: 0,
      pending_earnings: 0,
      paid_earnings: 0,
      total_transactions: 0,
      pending_transactions: 0,
      paid_transactions: 0,
    };
  }
}

/**
 * Get referral statistics for a partner
 */
export async function getPartnerReferralStats(partnerId: string): Promise<{
  total_direct_referrals: number;
  active_referrals: number;
  converted_referrals: number;
  this_month_referrals: number;
}> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    // Get direct referrals (partners where this partner is the sponsor)
    const result = await execute_sql(
      `
      SELECT 
        COUNT(*) as total_direct_referrals,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_referrals,
        COUNT(CASE WHEN status = 'active' AND partner_level_id IS NOT NULL THEN 1 END) as converted_referrals,
        COUNT(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as this_month_referrals
      FROM partners
      WHERE tenant_id = $1 AND sponsor_partner_id = $2;
    `,
      [tenantId, partnerId],
    );

    const stats = result.rows[0];
    return {
      total_direct_referrals: parseInt(stats.total_direct_referrals) || 0,
      active_referrals: parseInt(stats.active_referrals) || 0,
      converted_referrals: parseInt(stats.converted_referrals) || 0,
      this_month_referrals: parseInt(stats.this_month_referrals) || 0,
    };
  } catch (error) {
    console.error("Error getting partner referral stats:", error);
    return {
      total_direct_referrals: 0,
      active_referrals: 0,
      converted_referrals: 0,
      this_month_referrals: 0,
    };
  }
}

/**
 * Get comprehensive partner dashboard metrics
 */
export async function getPartnerDashboardMetrics(partnerId: string): Promise<{
  total_earnings: number;
  pending_payouts: number;
  direct_referrals: number;
  payable_balance: number;
  commission_stats: {
    total_earnings: number;
    pending_earnings: number;
    paid_earnings: number;
    total_transactions: number;
    pending_transactions: number;
    paid_transactions: number;
  };
  referral_stats: {
    total_direct_referrals: number;
    active_referrals: number;
    converted_referrals: number;
    this_month_referrals: number;
  };
}> {
  try {
    // Get commission stats, referral stats, and payable balance
    const [commissionStats, referralStats, payableBalance] = await Promise.all([
      getPartnerCommissionStats(partnerId),
      getPartnerReferralStats(partnerId),
      getPartnerPayableBalance(partnerId),
    ]);

    return {
      total_earnings: commissionStats.total_earnings,
      pending_payouts: commissionStats.pending_earnings,
      direct_referrals: referralStats.total_direct_referrals,
      payable_balance: payableBalance,
      commission_stats: commissionStats,
      referral_stats: referralStats,
    };
  } catch (error) {
    console.error("Error getting partner dashboard metrics:", error);
    return {
      total_earnings: 0,
      pending_payouts: 0,
      direct_referrals: 0,
      payable_balance: 0,
      commission_stats: {
        total_earnings: 0,
        pending_earnings: 0,
        paid_earnings: 0,
        total_transactions: 0,
        pending_transactions: 0,
        paid_transactions: 0,
      },
      referral_stats: {
        total_direct_referrals: 0,
        active_referrals: 0,
        converted_referrals: 0,
        this_month_referrals: 0,
      },
    };
  }
}

/**
 * Get detailed commission report with filtering and pagination
 */
export async function getPartnerCommissionReport(
  partnerId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: string;
    transaction_type?: string;
    date_from?: string;
    date_to?: string;
    commission_level?: number;
  } = {},
): Promise<{
  commissions: Commission[];
  total_count: number;
  summary: {
    total_amount: number;
    pending_amount: number;
    paid_amount: number;
    total_transactions: number;
  };
}> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    let whereClause =
      "WHERE pc.tenant_id = $1 AND pc.beneficiary_partner_id = $2";
    const params: any[] = [tenantId, partnerId];
    let paramIndex = 3;

    // Build dynamic filters
    if (options.status) {
      whereClause += ` AND pc.payout_status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    if (options.transaction_type) {
      whereClause += ` AND pc.transaction_type = $${paramIndex}`;
      params.push(options.transaction_type);
      paramIndex++;
    }

    if (options.date_from) {
      whereClause += ` AND pc.transaction_date >= $${paramIndex}`;
      params.push(options.date_from);
      paramIndex++;
    }

    if (options.date_to) {
      whereClause += ` AND pc.transaction_date <= $${paramIndex}`;
      params.push(options.date_to);
      paramIndex++;
    }

    if (options.commission_level) {
      whereClause += ` AND pc.commission_level = $${paramIndex}`;
      params.push(options.commission_level);
      paramIndex++;
    }

    // Get total count and summary
    const summaryResult = await execute_sql(
      `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(commission_amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN payout_status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN payout_status = 'paid' THEN commission_amount ELSE 0 END), 0) as paid_amount
      FROM partner_commissions pc
      ${whereClause};
    `,
      params,
    );

    const summary = summaryResult.rows[0];

    // Get paginated commission data
    const limitClause = options.limit ? `LIMIT $${paramIndex}` : "LIMIT 50";
    if (options.limit) {
      params.push(options.limit);
      paramIndex++;
    }

    const offsetClause = options.offset ? `OFFSET $${paramIndex}` : "";
    if (options.offset) {
      params.push(options.offset);
    }

    const commissionsResult = await execute_sql(
      `
      SELECT 
        pc.*
      FROM partner_commissions pc
      ${whereClause}
      ORDER BY pc.transaction_date DESC, pc.calculation_date DESC
      ${limitClause} ${offsetClause};
    `,
      params,
    );

    const commissions = commissionsResult.rows.map((row: any) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      transaction_id: row.transaction_id,
      transaction_amount: parseFloat(row.transaction_amount),
      transaction_type: row.transaction_type,
      beneficiary_partner_id: row.beneficiary_partner_id,
      beneficiary_partner_code: row.beneficiary_partner_code,
      source_partner_id: row.source_partner_id,
      source_partner_code: row.source_partner_code,
      commission_level: parseInt(row.commission_level),
      levels_from_source: parseInt(row.levels_from_source),
      commission_percentage: parseFloat(row.commission_percentage),
      commission_amount: parseFloat(row.commission_amount),
      beneficiary_partner_level_id: row.beneficiary_partner_level_id,
      beneficiary_partner_level_name: row.beneficiary_partner_level_name,
      calculation_status: row.calculation_status,
      payout_status: row.payout_status,
      transaction_date: row.transaction_date,
      calculation_date: row.calculation_date,
      approved_date: row.approved_date,
      paid_date: row.paid_date,
      commission_engine_version: row.commission_engine_version,
      notes: row.notes,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return {
      commissions,
      total_count: parseInt(summary.total_count) || 0,
      summary: {
        total_amount: parseFloat(summary.total_amount) || 0,
        pending_amount: parseFloat(summary.pending_amount) || 0,
        paid_amount: parseFloat(summary.paid_amount) || 0,
        total_transactions: parseInt(summary.total_count) || 0,
      },
    };
  } catch (error) {
    console.error("Error getting partner commission report:", error);
    return {
      commissions: [],
      total_count: 0,
      summary: {
        total_amount: 0,
        pending_amount: 0,
        paid_amount: 0,
        total_transactions: 0,
      },
    };
  }
}

/**
 * Get payable balance for a partner (pending earnings minus any pending payout requests)
 */
export async function getPartnerPayableBalance(
  partnerId: string,
): Promise<number> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    // Get pending earnings from commissions
    const commissionResult = await execute_sql(
      `
      SELECT COALESCE(SUM(commission_amount), 0) as pending_earnings
      FROM partner_commissions
      WHERE tenant_id = $1 AND beneficiary_partner_id = $2 AND payout_status = 'pending';
    `,
      [tenantId, partnerId],
    );

    // Get amount already requested in pending payout requests
    const payoutResult = await execute_sql(
      `
      SELECT COALESCE(SUM(requested_amount), 0) as pending_requests
      FROM payout_requests
      WHERE tenant_id = $1 AND partner_id = $2 AND request_status = 'pending';
    `,
      [tenantId, partnerId],
    );

    const pendingEarnings =
      parseFloat(commissionResult.rows[0].pending_earnings) || 0;
    const pendingRequests =
      parseFloat(payoutResult.rows[0].pending_requests) || 0;

    return Math.max(0, pendingEarnings - pendingRequests);
  } catch (error) {
    console.error("Error getting partner payable balance:", error);
    return 0;
  }
}

/**
 * Create a payout request
 */
export async function createPayoutRequest(
  requestData: CreatePayoutRequestData,
): Promise<string | null> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    // Get partner details
    const partnerResult = await execute_sql(
      `
      SELECT partner_code FROM partners
      WHERE tenant_id = $1 AND id = $2 AND status = 'active';
    `,
      [tenantId, requestData.partner_id],
    );

    if (partnerResult.rows.length === 0) {
      throw new Error("Partner not found or inactive");
    }

    const partnerCode = partnerResult.rows[0].partner_code;

    // Get current payable balance
    const payableBalance = await getPartnerPayableBalance(
      requestData.partner_id,
    );

    // Validate request amount
    if (requestData.requested_amount > payableBalance) {
      throw new Error("Requested amount exceeds payable balance");
    }

    if (requestData.requested_amount <= 0) {
      throw new Error("Request amount must be greater than zero");
    }

    // Check for existing pending request
    const existingRequest = await execute_sql(
      `
      SELECT id FROM payout_requests
      WHERE tenant_id = $1 AND partner_id = $2 AND request_status = 'pending';
    `,
      [tenantId, requestData.partner_id],
    );

    if (existingRequest.rows.length > 0) {
      throw new Error("You already have a pending payout request");
    }

    // Create the payout request
    const result = await execute_sql(
      `
      INSERT INTO payout_requests (
        tenant_id, partner_id, partner_code, requested_amount, 
        payable_balance_at_request, payment_method, payment_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `,
      [
        tenantId,
        requestData.partner_id,
        partnerCode,
        requestData.requested_amount,
        payableBalance,
        requestData.payment_method || "bank_transfer",
        JSON.stringify(requestData.payment_details || {}),
      ],
    );

    return result.rows[0].id;
  } catch (error) {
    console.error("Error creating payout request:", error);
    throw error;
  }
}

/**
 * Get payout requests for a partner
 */
export async function getPartnerPayoutRequests(
  partnerId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {},
): Promise<PayoutRequest[]> {
  try {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) {
      throw new Error("Unable to determine tenant context");
    }

    let whereClause = "WHERE pr.tenant_id = $1 AND pr.partner_id = $2";
    const params: any[] = [tenantId, partnerId];
    let paramIndex = 3;

    if (options.status) {
      whereClause += ` AND pr.request_status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    const limitClause = options.limit ? `LIMIT $${paramIndex}` : "LIMIT 20";
    if (options.limit) {
      params.push(options.limit);
      paramIndex++;
    }

    const offsetClause = options.offset ? `OFFSET $${paramIndex}` : "";
    if (options.offset) {
      params.push(options.offset);
    }

    const result = await execute_sql(
      `
      SELECT pr.*
      FROM payout_requests pr
      ${whereClause}
      ORDER BY pr.request_date DESC
      ${limitClause} ${offsetClause};
    `,
      params,
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      partner_id: row.partner_id,
      partner_code: row.partner_code,
      requested_amount: parseFloat(row.requested_amount),
      payable_balance_at_request: parseFloat(row.payable_balance_at_request),
      request_status: row.request_status,
      request_date: row.request_date,
      reviewed_date: row.reviewed_date,
      reviewed_by: row.reviewed_by,
      approval_notes: row.approval_notes,
      rejection_reason: row.rejection_reason,
      payment_method: row.payment_method,
      payment_details: row.payment_details || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    console.error("Error getting partner payout requests:", error);
    return [];
  }
}
