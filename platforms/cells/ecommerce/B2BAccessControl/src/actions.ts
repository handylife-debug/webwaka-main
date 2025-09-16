/**
 * B2BAccessControl Cell Actions
 * CELLULAR REUSABILITY: Server actions that delegate to B2BAccessControl server functions
 * Nigerian Market: Complete B2B access control with local business compliance
 */

'use server';

import { z } from 'zod';
import { b2bAccessControlCell } from './server';

// ===================================================================
// ACTION SCHEMAS - Validation for all B2B operations
// ===================================================================

const CreateB2BGroupActionSchema = z.object({
  groupName: z.string().min(2).max(100),
  groupCode: z.string().min(2).max(50),
  description: z.string().optional(),
  groupType: z.enum(['wholesale', 'retail', 'vip', 'employee', 'guest', 'distributor', 'reseller']),
  priceVisibility: z.enum(['hidden', 'visible', 'partial', 'request_quote']),
  hideFromGuests: z.boolean().default(false),
  hidePriceText: z.string().optional(),
  loginPromptText: z.string().optional(),
  guestMessage: z.string().optional(),
  allowedCategories: z.array(z.string()).default([]),
  restrictedCategories: z.array(z.string()).default([]),
  categoryAccessType: z.enum(['whitelist', 'blacklist', 'unrestricted']).default('unrestricted'),
  currencyPreference: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  minOrderAmount: z.number().min(0).default(0),
  creditLimit: z.number().min(0).default(0),
  paymentTermsDays: z.number().min(0).default(30),
  requiresApproval: z.boolean().default(false),
  priorityLevel: z.number().min(1).max(10).default(5)
});

const AssignUserActionSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
  membershipType: z.enum(['regular', 'trial', 'premium', 'lifetime']).default('regular'),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  autoRenewal: z.boolean().default(true),
  renewalPeriodMonths: z.number().min(1).default(12),
  discountPercentage: z.number().min(0).max(100).default(0),
  territory: z.string().optional(),
  businessRegistration: z.string().optional(),
  taxIdentification: z.string().optional()
});

const CheckAccessActionSchema = z.object({
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  userId: z.string().optional(),
  action: z.enum(['view_price', 'view_product', 'add_to_cart', 'purchase']).default('view_price')
});

const UpdateSettingsActionSchema = z.object({
  hideFromGuests: z.boolean(),
  hidePriceText: z.string().optional(),
  loginPromptText: z.string().optional(),
  guestMessage: z.string().optional(),
  defaultCurrency: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  vatRate: z.number().min(0).max(1).default(0.075),
  autoApproveRegistrations: z.boolean().default(false),
  requireBusinessVerification: z.boolean().default(true),
  minimumOrderForB2B: z.number().min(0).default(0)
});

// ===================================================================
// B2B GROUP MANAGEMENT ACTIONS - CELLULAR REUSABILITY
// ===================================================================

/**
 * Create B2B Group Action
 * CELLULAR REUSABILITY: Delegates to server cell functions
 */
export async function createB2BGroup(formData: FormData) {
  try {
    const rawData = {
      groupName: formData.get('groupName') as string,
      groupCode: formData.get('groupCode') as string,
      description: formData.get('description') as string || undefined,
      groupType: formData.get('groupType') as string,
      priceVisibility: formData.get('priceVisibility') as string,
      hideFromGuests: formData.get('hideFromGuests') === 'true',
      hidePriceText: formData.get('hidePriceText') as string || undefined,
      loginPromptText: formData.get('loginPromptText') as string || undefined,
      guestMessage: formData.get('guestMessage') as string || undefined,
      allowedCategories: JSON.parse(formData.get('allowedCategories') as string || '[]'),
      restrictedCategories: JSON.parse(formData.get('restrictedCategories') as string || '[]'),
      categoryAccessType: formData.get('categoryAccessType') as string || 'unrestricted',
      currencyPreference: formData.get('currencyPreference') as string || 'NGN',
      minOrderAmount: parseFloat(formData.get('minOrderAmount') as string || '0'),
      creditLimit: parseFloat(formData.get('creditLimit') as string || '0'),
      paymentTermsDays: parseInt(formData.get('paymentTermsDays') as string || '30'),
      requiresApproval: formData.get('requiresApproval') === 'true',
      priorityLevel: parseInt(formData.get('priorityLevel') as string || '5')
    };

    const validatedData = CreateB2BGroupActionSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.createB2BGroup(validatedData);
    
    return result;

  } catch (error) {
    console.error('Error in createB2BGroup action:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to create B2B group'
    };
  }
}

/**
 * Assign User to B2B Group Action
 */
export async function assignUserToB2BGroup(formData: FormData) {
  try {
    const rawData = {
      userId: formData.get('userId') as string,
      groupId: formData.get('groupId') as string,
      membershipType: formData.get('membershipType') as string || 'regular',
      effectiveDate: formData.get('effectiveDate') as string || undefined,
      expiryDate: formData.get('expiryDate') as string || undefined,
      autoRenewal: formData.get('autoRenewal') !== 'false',
      discountPercentage: parseFloat(formData.get('discountPercentage') as string || '0'),
      territory: formData.get('territory') as string || undefined,
      businessRegistration: formData.get('businessRegistration') as string || undefined,
      taxIdentification: formData.get('taxIdentification') as string || undefined
    };

    const validatedData = AssignUserActionSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.assignUserToB2BGroup(validatedData);
    
    return result;

  } catch (error) {
    console.error('Error in assignUserToB2BGroup action:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to assign user to B2B group'
    };
  }
}

/**
 * Remove User from B2B Group Action
 */
export async function removeUserFromB2BGroup(params: { userId: string; groupId: string }) {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { hasPermission } = await import('@/lib/permission-middleware');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const hasRemovePermission = await hasPermission(user.id, tenantId, 'b2b.memberships.delete' as any);
    if (!hasRemovePermission) {
      return { success: false, error: 'Insufficient permissions to remove users from B2B groups' };
    }

    // Update membership status to 'revoked' instead of deleting
    const result = await execute_sql(`
      UPDATE b2b_group_memberships 
      SET membership_status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND user_id = $2 AND group_id = $3
    `, [tenantId, params.userId, params.groupId]);

    if (result.rowCount === 0) {
      return { success: false, error: 'Membership not found or already revoked' };
    }

    return {
      success: true,
      message: 'User successfully removed from B2B group'
    };

  } catch (error) {
    console.error('Error in removeUserFromB2BGroup action:', error);
    return {
      success: false,
      error: 'Failed to remove user from B2B group'
    };
  }
}

// ===================================================================
// ACCESS CHECK ACTIONS - Core B2B functionality
// ===================================================================

/**
 * Check Guest Price Access Action
 */
export async function checkGuestPriceAccess(params: { 
  productId?: string; 
  categoryId?: string; 
  userId?: string; 
  action?: string;
}) {
  try {
    const validatedData = CheckAccessActionSchema.parse(params);
    
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.checkGuestPriceAccess(validatedData);
    
    return result;

  } catch (error) {
    console.error('Error in checkGuestPriceAccess action:', error);
    return {
      success: false,
      error: 'Failed to check price access',
      canViewPrice: false,
      canViewProduct: false,
      loginRequired: true,
      groupRequired: false,
      appliedRules: ['error_fallback']
    };
  }
}

/**
 * Check Category Access Action
 */
export async function checkCategoryAccess(params: { categoryId: string; userId?: string }) {
  try {
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.checkCategoryAccess(params);
    
    return result;

  } catch (error) {
    console.error('Error in checkCategoryAccess action:', error);
    return {
      success: false,
      hasAccess: false,
      restrictionLevel: 'full' as const,
      restrictionReason: 'Category access check failed',
      allowedActions: []
    };
  }
}

/**
 * Check User B2B Status Action
 */
export async function checkUserB2BStatus(params: { userId?: string } = {}) {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    const targetUserId = params.userId || user?.id;

    if (!targetUserId) {
      return {
        success: true,
        isB2BCustomer: false,
        groups: [],
        status: 'guest',
        message: 'User not authenticated'
      };
    }

    // Get user's active B2B group memberships
    const result = await execute_sql(`
      SELECT 
        gm.id,
        gm.membership_status,
        gm.membership_type,
        gm.effective_date,
        gm.expiry_date,
        gm.discount_percentage,
        gm.territory,
        g.group_name,
        g.group_type,
        g.price_visibility,
        g.priority_level
      FROM b2b_group_memberships gm
      JOIN b2b_user_groups g ON g.id = gm.group_id
      WHERE gm.tenant_id = $1 AND gm.user_id = $2 
      AND gm.membership_status = 'active'
      AND (gm.expiry_date IS NULL OR gm.expiry_date >= CURRENT_DATE)
      ORDER BY g.priority_level DESC, gm.created_at ASC
    `, [tenantId, targetUserId]);

    const memberships = result.rows;
    const isB2BCustomer = memberships.length > 0;
    const primaryMembership = memberships[0];

    return {
      success: true,
      isB2BCustomer,
      groups: memberships.map((m: any) => ({
        id: m.id,
        groupName: m.group_name,
        groupType: m.group_type,
        membershipStatus: m.membership_status,
        membershipType: m.membership_type,
        priceVisibility: m.price_visibility,
        discountPercentage: m.discount_percentage,
        territory: m.territory,
        effectiveDate: m.effective_date,
        expiryDate: m.expiry_date
      })),
      status: isB2BCustomer ? 'b2b_customer' : 'regular_customer',
      primaryGroup: primaryMembership ? {
        groupName: primaryMembership.group_name,
        groupType: primaryMembership.group_type,
        priceVisibility: primaryMembership.price_visibility
      } : null,
      message: isB2BCustomer 
        ? `User has ${memberships.length} active B2B group membership(s)`
        : 'User is not a B2B customer'
    };

  } catch (error) {
    console.error('Error in checkUserB2BStatus action:', error);
    return {
      success: false,
      isB2BCustomer: false,
      groups: [],
      status: 'error',
      message: 'Failed to check user B2B status'
    };
  }
}

// ===================================================================
// B2B GROUP LISTING AND MANAGEMENT ACTIONS
// ===================================================================

/**
 * List B2B Groups Action
 */
export async function listB2BGroups(params: { 
  limit?: number; 
  offset?: number; 
  groupType?: string;
  status?: string;
} = {}) {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { hasPermission } = await import('@/lib/permission-middleware');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const hasViewPermission = await hasPermission(user.id, tenantId, 'b2b.groups.view' as any);
    if (!hasViewPermission) {
      return { success: false, error: 'Insufficient permissions to view B2B groups' };
    }

    let query = `
      SELECT 
        g.*,
        COUNT(gm.id) as member_count
      FROM b2b_user_groups g
      LEFT JOIN b2b_group_memberships gm ON gm.group_id = g.id AND gm.membership_status = 'active'
      WHERE g.tenant_id = $1
    `;
    
    const queryParams = [tenantId];
    let paramIndex = 2;

    if (params.groupType) {
      query += ` AND g.group_type = $${paramIndex}`;
      queryParams.push(params.groupType);
      paramIndex++;
    }

    if (params.status) {
      query += ` AND g.status = $${paramIndex}`;
      queryParams.push(params.status);
      paramIndex++;
    }

    query += ` GROUP BY g.id ORDER BY g.priority_level DESC, g.created_at ASC`;

    if (params.limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(params.limit.toString());
      paramIndex++;
    }

    if (params.offset) {
      query += ` OFFSET $${paramIndex}`;
      queryParams.push(params.offset.toString());
    }

    const result = await execute_sql(query, queryParams);

    return {
      success: true,
      groups: result.rows.map((row: any) => ({
        id: row.id,
        groupName: row.group_name,
        groupCode: row.group_code,
        description: row.description,
        groupType: row.group_type,
        priceVisibility: row.price_visibility,
        memberCount: parseInt(row.member_count) || 0,
        status: row.status,
        priorityLevel: row.priority_level,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      total: result.rows.length,
      message: `Found ${result.rows.length} B2B group(s)`
    };

  } catch (error) {
    console.error('Error in listB2BGroups action:', error);
    return {
      success: false,
      error: 'Failed to list B2B groups',
      groups: [],
      total: 0
    };
  }
}

/**
 * Get B2B Group Members Action
 */
export async function getB2BGroupMembers(params: { 
  groupId: string; 
  limit?: number; 
  offset?: number;
  status?: string;
}) {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { hasPermission } = await import('@/lib/permission-middleware');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const hasViewPermission = await hasPermission(user.id, tenantId, 'b2b.memberships.view' as any);
    if (!hasViewPermission) {
      return { success: false, error: 'Insufficient permissions to view group members' };
    }

    let query = `
      SELECT 
        gm.*,
        u.username,
        u.email,
        u.full_name,
        g.group_name,
        g.group_type
      FROM b2b_group_memberships gm
      JOIN users u ON u.id = gm.user_id
      JOIN b2b_user_groups g ON g.id = gm.group_id
      WHERE gm.tenant_id = $1 AND gm.group_id = $2
    `;
    
    const queryParams = [tenantId, params.groupId];
    let paramIndex = 3;

    if (params.status) {
      query += ` AND gm.membership_status = $${paramIndex}`;
      queryParams.push(params.status);
      paramIndex++;
    }

    query += ` ORDER BY gm.created_at DESC`;

    if (params.limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(params.limit.toString());
      paramIndex++;
    }

    if (params.offset) {
      query += ` OFFSET $${paramIndex}`;
      queryParams.push(params.offset.toString());
    }

    const result = await execute_sql(query, queryParams);

    return {
      success: true,
      members: result.rows.map((row: any) => ({
        membershipId: row.id,
        userId: row.user_id,
        username: row.username,
        email: row.email,
        fullName: row.full_name,
        membershipStatus: row.membership_status,
        membershipType: row.membership_type,
        effectiveDate: row.effective_date,
        expiryDate: row.expiry_date,
        discountPercentage: row.discount_percentage,
        territory: row.territory,
        businessRegistration: row.business_registration,
        taxIdentification: row.tax_identification,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      groupInfo: result.rows[0] ? {
        groupName: result.rows[0].group_name,
        groupType: result.rows[0].group_type
      } : null,
      total: result.rows.length,
      message: `Found ${result.rows.length} member(s) in group`
    };

  } catch (error) {
    console.error('Error in getB2BGroupMembers action:', error);
    return {
      success: false,
      error: 'Failed to get group members',
      members: [],
      total: 0
    };
  }
}

// ===================================================================
// B2B SETTINGS MANAGEMENT ACTIONS
// ===================================================================

/**
 * Update Price Visibility Settings Action
 */
export async function updatePriceVisibilitySettings(formData: FormData) {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { hasPermission } = await import('@/lib/permission-middleware');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const hasUpdatePermission = await hasPermission(user.id, tenantId, 'b2b.settings.edit' as any);
    if (!hasUpdatePermission) {
      return { success: false, error: 'Insufficient permissions to update B2B settings' };
    }

    const rawData = {
      hideFromGuests: formData.get('hideFromGuests') === 'true',
      hidePriceText: formData.get('hidePriceText') as string || undefined,
      loginPromptText: formData.get('loginPromptText') as string || undefined,
      guestMessage: formData.get('guestMessage') as string || undefined,
      defaultCurrency: formData.get('defaultCurrency') as string || 'NGN',
      vatRate: parseFloat(formData.get('vatRate') as string || '0.075'),
      autoApproveRegistrations: formData.get('autoApproveRegistrations') === 'true',
      requireBusinessVerification: formData.get('requireBusinessVerification') === 'true',
      minimumOrderForB2B: parseFloat(formData.get('minimumOrderForB2B') as string || '0')
    };

    const validatedData = UpdateSettingsActionSchema.parse(rawData);

    // Update or insert global B2B settings
    await execute_sql(`
      INSERT INTO b2b_global_settings (
        tenant_id, default_hide_from_guests, default_hide_price_text,
        default_login_prompt_text, default_guest_message, default_currency,
        vat_rate, auto_approve_b2b_registration, require_business_verification,
        minimum_order_for_b2b, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id) DO UPDATE SET
        default_hide_from_guests = EXCLUDED.default_hide_from_guests,
        default_hide_price_text = EXCLUDED.default_hide_price_text,
        default_login_prompt_text = EXCLUDED.default_login_prompt_text,
        default_guest_message = EXCLUDED.default_guest_message,
        default_currency = EXCLUDED.default_currency,
        vat_rate = EXCLUDED.vat_rate,
        auto_approve_b2b_registration = EXCLUDED.auto_approve_b2b_registration,
        require_business_verification = EXCLUDED.require_business_verification,
        minimum_order_for_b2b = EXCLUDED.minimum_order_for_b2b,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [
      tenantId,
      validatedData.hideFromGuests,
      validatedData.hidePriceText || `Login to view prices`,
      validatedData.loginPromptText || `Create account for pricing access`,
      validatedData.guestMessage || `Contact us for wholesale pricing in Nigerian Naira`,
      validatedData.defaultCurrency,
      validatedData.vatRate,
      validatedData.autoApproveRegistrations,
      validatedData.requireBusinessVerification,
      validatedData.minimumOrderForB2B,
      user.id
    ]);

    return {
      success: true,
      updatedSettings: {
        hideFromGuests: validatedData.hideFromGuests,
        hidePriceText: validatedData.hidePriceText || `Login to view prices`,
        loginPromptText: validatedData.loginPromptText || `Create account for pricing access`,
        guestMessage: validatedData.guestMessage || `Contact us for wholesale pricing`,
        defaultCurrency: validatedData.defaultCurrency,
        vatRate: validatedData.vatRate
      },
      message: 'B2B price visibility settings updated successfully'
    };

  } catch (error) {
    console.error('Error in updatePriceVisibilitySettings action:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to update price visibility settings'
    };
  }
}

/**
 * Get Price Visibility Settings Action
 */
export async function getPriceVisibilitySettings() {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { hasPermission } = await import('@/lib/permission-middleware');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const hasViewPermission = await hasPermission(user.id, tenantId, 'b2b.settings.view' as any);
    if (!hasViewPermission) {
      return { success: false, error: 'Insufficient permissions to view B2B settings' };
    }

    const result = await execute_sql(`
      SELECT * FROM b2b_global_settings WHERE tenant_id = $1
    `, [tenantId]);

    const settings = result.rows[0] || {
      default_hide_from_guests: false,
      default_hide_price_text: 'Login to view prices',
      default_login_prompt_text: 'Create account for pricing access',
      default_guest_message: 'Contact us for wholesale pricing in Nigerian Naira',
      default_currency: 'NGN',
      vat_rate: 0.075,
      auto_approve_b2b_registration: false,
      require_business_verification: true,
      minimum_order_for_b2b: 0
    };

    return {
      success: true,
      settings: {
        hideFromGuests: settings.default_hide_from_guests,
        hidePriceText: settings.default_hide_price_text,
        loginPromptText: settings.default_login_prompt_text,
        guestMessage: settings.default_guest_message,
        defaultCurrency: settings.default_currency,
        vatRate: settings.vat_rate,
        autoApproveRegistrations: settings.auto_approve_b2b_registration,
        requireBusinessVerification: settings.require_business_verification,
        minimumOrderForB2B: settings.minimum_order_for_b2b
      },
      message: 'B2B settings retrieved successfully'
    };

  } catch (error) {
    console.error('Error in getPriceVisibilitySettings action:', error);
    return {
      success: false,
      error: 'Failed to get price visibility settings',
      settings: null
    };
  }
}

// ===================================================================
// BULK OPERATIONS AND UTILITIES
// ===================================================================

/**
 * Get Bulk Category Access Action
 */
export async function getBulkCategoryAccess(params: { 
  userId: string; 
  categoryIds: string[];
}) {
  try {
    if (params.categoryIds.length === 0) {
      return {
        success: true,
        results: [],
        message: 'No categories provided'
      };
    }

    if (params.categoryIds.length > 100) {
      return {
        success: false,
        error: 'Too many categories requested (max 100)'
      };
    }

    const results = [];
    
    // Check access for each category
    for (const categoryId of params.categoryIds) {
      try {
        const accessResult = await checkCategoryAccess({ 
          categoryId, 
          userId: params.userId 
        });
        
        results.push({
          categoryId,
          hasAccess: accessResult.hasAccess,
          restrictionLevel: accessResult.restrictionLevel,
          restrictionReason: accessResult.restrictionReason,
          allowedActions: accessResult.allowedActions
        });
      } catch (error) {
        results.push({
          categoryId,
          hasAccess: false,
          restrictionLevel: 'full' as const,
          restrictionReason: 'Access check failed',
          allowedActions: []
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        total: results.length,
        allowed: results.filter((r: any) => r.hasAccess).length,
        restricted: results.filter((r: any) => !r.hasAccess).length
      },
      message: `Checked access for ${results.length} categories`
    };

  } catch (error) {
    console.error('Error in getBulkCategoryAccess action:', error);
    return {
      success: false,
      error: 'Failed to check bulk category access',
      results: []
    };
  }
}

/**
 * Generate Access Report Action
 */
export async function generateAccessReport(params: {
  startDate?: string;
  endDate?: string;
  resourceType?: string;
  accessGranted?: boolean;
  limit?: number;
}) {
  try {
    const { getSecureTenantId } = await import('@/lib/secure-auth');
    const { getCurrentUser } = await import('@/lib/auth-server');
    const { hasPermission } = await import('@/lib/permission-middleware');
    const { execute_sql } = await import('@/lib/database');

    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const hasReportPermission = await hasPermission(user.id, tenantId, 'b2b.reports.view' as any);
    if (!hasReportPermission) {
      return { success: false, error: 'Insufficient permissions to view B2B reports' };
    }

    let query = `
      SELECT 
        ba.*,
        u.username,
        u.email,
        g.group_name
      FROM b2b_access_audit ba
      LEFT JOIN users u ON u.id = ba.user_id
      LEFT JOIN b2b_user_groups g ON g.id = ba.group_id
      WHERE ba.tenant_id = $1
    `;
    
    const queryParams = [tenantId];
    let paramIndex = 2;

    if (params.startDate) {
      query += ` AND ba.created_at >= $${paramIndex}`;
      queryParams.push(params.startDate);
      paramIndex++;
    }

    if (params.endDate) {
      query += ` AND ba.created_at <= $${paramIndex}`;
      queryParams.push(params.endDate);
      paramIndex++;
    }

    if (params.resourceType) {
      query += ` AND ba.resource_type = $${paramIndex}`;
      queryParams.push(params.resourceType);
      paramIndex++;
    }

    if (params.accessGranted !== undefined) {
      query += ` AND ba.access_granted = $${paramIndex}`;
      queryParams.push(params.accessGranted.toString());
      paramIndex++;
    }

    query += ` ORDER BY ba.created_at DESC`;

    if (params.limit && params.limit <= 1000) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(params.limit.toString());
    } else {
      query += ` LIMIT 500`; // Default limit
    }

    const result = await execute_sql(query, queryParams);

    // Generate summary statistics
    const total = result.rows.length;
    const granted = result.rows.filter((r: any) => r.access_granted).length;
    const denied = total - granted;

    return {
      success: true,
      report: {
        entries: result.rows.map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          email: row.email,
          groupName: row.group_name,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          actionAttempted: row.action_attempted,
          accessGranted: row.access_granted,
          denialReason: row.denial_reason,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at
        })),
        summary: {
          total,
          granted,
          denied,
          grantRate: total > 0 ? ((granted / total) * 100).toFixed(1) : '0.0',
          period: {
            startDate: params.startDate,
            endDate: params.endDate
          }
        }
      },
      message: `Generated access report with ${total} entries`
    };

  } catch (error) {
    console.error('Error in generateAccessReport action:', error);
    return {
      success: false,
      error: 'Failed to generate access report',
      report: null
    };
  }
}

// Actions are already exported as async functions above - no duplicate exports needed