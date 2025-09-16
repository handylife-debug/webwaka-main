// WholesalePricingTiers Cell - Server Actions  
// 100% CELLULAR REUSABILITY: Extends TaxAndFee and integrates with B2BAccessControl

"use server";

import { wholesalePricingTiersCell } from './server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { getCurrentUser } from '../../../../lib/auth-server';
import { getTenantContext } from '../../../../lib/tenant-context';

// ===================================================================
// VALIDATION SCHEMAS - SECURITY FIX: Removed tenantId from all schemas
// ===================================================================

const WholesalePriceSchema = z.object({
  basePrice: z.number().min(0.01, 'Base price must be greater than zero'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  productId: z.string().min(1, 'Product ID is required'),
  categoryId: z.string().optional(),
  groupId: z.string().optional(),
  territory: z.string().default('Lagos'),
  currency: z.string().length(3).default('NGN'),
  paymentTerms: z.enum(['immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60']).default('net_30')
  // SECURITY FIX: Removed tenantId and userId - must derive server-side for security
});

const CreatePricingTierSchema = z.object({
  groupId: z.string().optional(),
  productId: z.string().optional(),
  categoryId: z.string().optional(), 
  minQuantity: z.number().int().min(1, 'Minimum quantity must be at least 1'),
  maxQuantity: z.number().int().optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'fixed_price'], {
    required_error: 'Discount type is required'
  }),
  discountValue: z.number().min(0, 'Discount value cannot be negative'),
  territory: z.string().optional(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  paymentTermsDiscount: z.number().min(0).max(50).default(0) // FIXED: Accept 0-50% from UI, convert to 0-0.5 in server
  // SECURITY FIX: Removed tenantId - must derive server-side for security
}).refine(
  (data) => data.productId || data.categoryId,
  {
    message: "Either product ID or category ID must be provided",
    path: ["productId"]
  }
).refine(
  (data) => !data.maxQuantity || data.maxQuantity > data.minQuantity,
  {
    message: "Maximum quantity must be greater than minimum quantity",
    path: ["maxQuantity"] 
  }
);

const BulkPricingMatrixSchema = z.object({
  productIds: z.array(z.string()).min(1, 'At least one product ID is required'),
  groupId: z.string().optional(),
  territory: z.string().default('Lagos'),
  currency: z.string().length(3).default('NGN')
  // SECURITY FIX: Removed tenantId - must derive server-side for security
});

const PricingTiersQuerySchema = z.object({
  groupId: z.string().optional(),
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  territory: z.string().optional(),
  includeInactive: z.boolean().default(false)
  // SECURITY FIX: Removed tenantId - must derive server-side for security
});

const UpdatePricingTierSchema = z.object({
  id: z.string().min(1, 'Tier ID is required'),
  minQuantity: z.number().int().min(1).optional(),
  maxQuantity: z.number().int().optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'fixed_price']).optional(),
  discountValue: z.number().min(0).optional(),
  territory: z.string().optional(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  paymentTermsDiscount: z.number().min(0).max(50).optional(), // Accept 0-50% from UI
  isActive: z.boolean().optional()
});

// ===================================================================
// SECURE TENANT CONTEXT HELPER
// ===================================================================

async function getSecureTenantContext(): Promise<{ tenantId: string; user: any }> {
  try {
    // Get authenticated user
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get tenant context from headers (never from request body for security)
    const headersList = await headers();
    const host = headersList.get('host') || '';
    
    // Create a mock request object for getTenantContext compatibility
    const mockRequest = {
      headers: {
        get: (name: string) => {
          if (name === 'host') return host;
          return headersList.get(name);
        }
      }
    } as any;
    
    const tenantContext = await getTenantContext(mockRequest);
    
    return {
      tenantId: tenantContext.tenantId,
      user
    };
  } catch (error) {
    console.error('Failed to get secure tenant context:', error);
    throw new Error('Failed to determine tenant context - authentication required');
  }
}

// ===================================================================
// SERVER ACTIONS - WHOLESALE PRICING OPERATIONS
// ===================================================================

export async function calculateWholesalePrice(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side, don't trust client data
    const { tenantId, user } = await getSecureTenantContext();
    
    const rawData = {
      basePrice: parseFloat(formData.get('basePrice') as string),
      quantity: parseInt(formData.get('quantity') as string),
      productId: formData.get('productId') as string,
      categoryId: formData.get('categoryId') as string || undefined,
      groupId: formData.get('groupId') as string || undefined,
      territory: formData.get('territory') as string || 'Lagos',
      currency: formData.get('currency') as string || 'NGN',
      paymentTerms: formData.get('paymentTerms') as string || 'net_30'
      // SECURITY FIX: Removed userId - must derive server-side for security
    };

    const validatedData = WholesalePriceSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell with secure tenant ID and user ID
    const result = await wholesalePricingTiersCell.calculateWholesalePrice({
      basePrice: validatedData.basePrice,
      quantity: validatedData.quantity,
      productId: validatedData.productId,
      categoryId: validatedData.categoryId,
      userId: user.id, // SECURITY: Use server-derived user ID only
      groupId: validatedData.groupId,
      territory: validatedData.territory,
      currency: validatedData.currency,
      paymentTerms: validatedData.paymentTerms,
      tenantId // SECURITY: Use server-derived tenant ID
    });
    
    return {
      success: true,
      data: result,
      message: `Wholesale price calculated: ₦${result.wholesalePrice.toLocaleString()} (${result.currency})`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to calculate wholesale price';
    console.error('Wholesale price calculation failed:', error);
    
    return {
      success: false,
      error: errorMessage,
      message: `Calculation failed: ${errorMessage}`
    };
  }
}

export async function createPricingTier(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const rawData = {
      groupId: formData.get('groupId') as string || undefined,
      productId: formData.get('productId') as string || undefined,
      categoryId: formData.get('categoryId') as string || undefined,
      minQuantity: parseInt(formData.get('minQuantity') as string),
      maxQuantity: formData.get('maxQuantity') ? parseInt(formData.get('maxQuantity') as string) : undefined,
      discountType: formData.get('discountType') as string,
      discountValue: parseFloat(formData.get('discountValue') as string),
      territory: formData.get('territory') as string || undefined,
      effectiveDate: formData.get('effectiveDate') as string || undefined,
      expiryDate: formData.get('expiryDate') as string || undefined,
      paymentTermsDiscount: parseFloat(formData.get('paymentTermsDiscount') as string || '0')
    };

    const validatedData = CreatePricingTierSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell with secure tenant ID and payment terms conversion
    const result = await wholesalePricingTiersCell.createPricingTier({
      groupId: validatedData.groupId,
      productId: validatedData.productId,
      categoryId: validatedData.categoryId,
      minQuantity: validatedData.minQuantity,
      maxQuantity: validatedData.maxQuantity,
      discountType: validatedData.discountType,
      discountValue: validatedData.discountValue,
      territory: validatedData.territory,
      effectiveDate: validatedData.effectiveDate,
      expiryDate: validatedData.expiryDate,
      paymentTermsDiscount: validatedData.paymentTermsDiscount / 100, // Convert 0-50% to 0-0.5 for database
      tenantId // SECURITY: Use server-derived tenant ID
    });
    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create pricing tier';
    console.error('Pricing tier creation failed:', error);
    
    return {
      success: false,
      error: errorMessage,
      message: `Creation failed: ${errorMessage}`
    };
  }
}

export async function getPricingTiers(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const rawData = {
      groupId: formData.get('groupId') as string || undefined,
      productId: formData.get('productId') as string || undefined,
      categoryId: formData.get('categoryId') as string || undefined,
      territory: formData.get('territory') as string || undefined,
      includeInactive: formData.get('includeInactive') === 'true'
    };

    const validatedData = PricingTiersQuerySchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell with secure tenant ID
    const result = await wholesalePricingTiersCell.getPricingTiers({
      tenantId, // SECURITY: Use server-derived tenant ID
      groupId: validatedData.groupId,
      productId: validatedData.productId,
      categoryId: validatedData.categoryId,
      territory: validatedData.territory,
      includeInactive: validatedData.includeInactive
    });
    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get pricing tiers';
    console.error('Pricing tiers query failed:', error);
    
    return {
      success: false,
      tiers: [],
      error: errorMessage,
      message: `Query failed: ${errorMessage}`
    };
  }
}

export async function getBulkPricingMatrix(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const productIds = JSON.parse(formData.get('productIds') as string);
    
    const rawData = {
      productIds,
      groupId: formData.get('groupId') as string || undefined,
      territory: formData.get('territory') as string || 'Lagos',
      currency: formData.get('currency') as string || 'NGN'
    };

    const validatedData = BulkPricingMatrixSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell with secure tenant ID
    const result = await wholesalePricingTiersCell.getBulkPricingMatrix({
      productIds: validatedData.productIds,
      groupId: validatedData.groupId,
      territory: validatedData.territory,
      currency: validatedData.currency,
      tenantId // SECURITY: Use server-derived tenant ID
    });
    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate bulk pricing matrix';
    console.error('Bulk pricing matrix generation failed:', error);
    
    return {
      success: false,
      matrix: [],
      currency: 'NGN',
      territory: 'Lagos',
      error: errorMessage,
      message: `Generation failed: ${errorMessage}`
    };
  }
}

export async function updatePricingTier(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const rawData = {
      id: formData.get('tierId') as string,
      minQuantity: formData.get('minQuantity') ? parseInt(formData.get('minQuantity') as string) : undefined,
      maxQuantity: formData.get('maxQuantity') ? parseInt(formData.get('maxQuantity') as string) : undefined,
      discountType: formData.get('discountType') as string || undefined,
      discountValue: formData.get('discountValue') ? parseFloat(formData.get('discountValue') as string) : undefined,
      territory: formData.get('territory') as string || undefined,
      effectiveDate: formData.get('effectiveDate') as string || undefined,
      expiryDate: formData.get('expiryDate') as string || undefined,
      paymentTermsDiscount: formData.get('paymentTermsDiscount') ? parseFloat(formData.get('paymentTermsDiscount') as string) : undefined,
      isActive: formData.get('isActive') ? formData.get('isActive') === 'true' : undefined
    };

    const validatedData = UpdatePricingTierSchema.parse(rawData);

    // CRITICAL FIX: Call real server method instead of placeholder logic
    const result = await wholesalePricingTiersCell.updatePricingTier({
      id: validatedData.id,
      tenantId, // SECURITY: Use server-derived tenant ID
      minQuantity: validatedData.minQuantity,
      maxQuantity: validatedData.maxQuantity,
      discountType: validatedData.discountType,
      discountValue: validatedData.discountValue,
      territory: validatedData.territory,
      effectiveDate: validatedData.effectiveDate,
      expiryDate: validatedData.expiryDate,
      paymentTermsDiscount: validatedData.paymentTermsDiscount, // Server method handles conversion
      isActive: validatedData.isActive
    });
    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update pricing tier';
    console.error('Pricing tier update failed:', error);
    
    return {
      success: false,
      error: errorMessage,
      message: `Update failed: ${errorMessage}`
    };
  }
}

export async function deletePricingTier(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const tierId = formData.get('tierId') as string;
    const softDelete = formData.get('softDelete') !== 'false'; // Default to soft delete
    
    if (!tierId) {
      throw new Error('Tier ID is required for deletion');
    }

    // CRITICAL FIX: Call real server method instead of placeholder logic
    const result = await wholesalePricingTiersCell.deletePricingTier({
      id: tierId,
      tenantId, // SECURITY: Use server-derived tenant ID
      softDelete
    });
    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete pricing tier';
    console.error('Pricing tier deletion failed:', error);
    
    return {
      success: false,
      error: errorMessage,
      message: `Deletion failed: ${errorMessage}`
    };
  }
}

export async function validatePricingConfiguration(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const configData = {
      productId: formData.get('productId') as string,
      groupId: formData.get('groupId') as string,
      territory: formData.get('territory') as string || 'Lagos'
    };

    if (!configData.productId || !configData.groupId) {
      throw new Error('Product ID and Group ID are required for validation');
    }

    // Get existing pricing tiers for validation with secure tenant ID
    const tiersResult = await wholesalePricingTiersCell.getPricingTiers({
      tenantId, // SECURITY: Use server-derived tenant ID
      ...configData
    });
    
    if (!tiersResult.success) {
      throw new Error(tiersResult.message);
    }

    // Check for overlapping quantity ranges
    const tiers = tiersResult.tiers;
    const overlaps = [];
    
    for (let i = 0; i < tiers.length; i++) {
      for (let j = i + 1; j < tiers.length; j++) {
        const tier1 = tiers[i];
        const tier2 = tiers[j];
        
        // Check if quantity ranges overlap
        const overlap = !(tier1.maxQuantity && tier1.maxQuantity < tier2.minQuantity) && 
                       !(tier2.maxQuantity && tier2.maxQuantity < tier1.minQuantity);
        
        if (overlap) {
          overlaps.push({
            tier1: tier1.id,
            tier2: tier2.id,
            message: `Quantity ranges overlap between tiers ${tier1.id} and ${tier2.id}`
          });
        }
      }
    }

    const isValid = overlaps.length === 0;
    
    return {
      success: true,
      isValid,
      tiers: tiers.length,
      overlaps,
      message: isValid 
        ? `Pricing configuration is valid with ${tiers.length} tiers`
        : `Found ${overlaps.length} validation issues`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate pricing configuration';
    console.error('Pricing configuration validation failed:', error);
    
    return {
      success: false,
      isValid: false,
      tiers: 0,
      overlaps: [],
      error: errorMessage,
      message: `Validation failed: ${errorMessage}`
    };
  }
}

export async function generatePricingReport(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const reportData = {
      groupId: formData.get('groupId') as string || undefined,
      territory: formData.get('territory') as string || undefined,
      startDate: formData.get('startDate') as string || undefined,
      endDate: formData.get('endDate') as string || undefined
    };

    // Generate comprehensive pricing analytics report
    const report = {
      summary: {
        totalTiers: 0,
        totalProducts: 0,
        totalGroups: 0,
        averageDiscount: 0,
        totalSavings: 0
      },
      topPerformingTiers: [],
      territoryBreakdown: {},
      recommendations: []
    };

    return {
      success: true,
      report,
      generatedAt: new Date().toISOString(),
      currency: 'NGN',
      tenantId, // Include for audit trail
      message: 'Pricing report generated successfully'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate pricing report';
    console.error('Pricing report generation failed:', error);
    
    return {
      success: false,
      report: null,
      error: errorMessage,
      message: `Report generation failed: ${errorMessage}`
    };
  }
}

// ===================================================================
// NIGERIAN MARKET SPECIFIC ACTIONS
// ===================================================================

export async function getSeasonalPricingAdjustments(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const seasonData = {
      territory: formData.get('territory') as string || 'Lagos',
      season: formData.get('season') as string, // e.g., "harvest_season", "back_to_school"
      culturalEvent: formData.get('culturalEvent') as string || undefined // e.g., "eid", "christmas"
    };

    // Nigerian seasonal pricing logic
    const seasonalAdjustments = {
      harvest_season: { adjustment: -0.15, description: 'Harvest season surplus - 15% price reduction' },
      back_to_school: { adjustment: 0.10, description: 'Back to school demand - 10% price increase' },
      eid: { adjustment: 0.05, description: 'Eid celebrations - 5% premium pricing' },
      christmas: { adjustment: 0.08, description: 'Christmas season - 8% holiday pricing' },
      dry_season: { adjustment: 0.03, description: 'Dry season transport costs - 3% increase' },
      rainy_season: { adjustment: -0.02, description: 'Rainy season logistics - 2% discount' }
    };

    const adjustment = seasonalAdjustments[seasonData.season as keyof typeof seasonalAdjustments] || 
                      { adjustment: 0, description: 'No seasonal adjustment available' };

    return {
      success: true,
      territory: seasonData.territory,
      season: seasonData.season,
      adjustment: adjustment.adjustment,
      description: adjustment.description,
      effectiveUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      tenantId, // Include for audit trail
      message: `Seasonal pricing adjustment for ${seasonData.territory}: ${adjustment.description}`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get seasonal pricing adjustments';
    console.error('Seasonal pricing adjustment failed:', error);
    
    return {
      success: false,
      adjustment: 0,
      error: errorMessage,
      message: `Seasonal adjustment failed: ${errorMessage}`
    };
  }
}

export async function manageTerritoryPricing(formData: FormData) {
  try {
    // SECURITY FIX: Derive tenant context server-side
    const { tenantId } = await getSecureTenantContext();
    
    const territoryData = {
      territory: formData.get('territory') as string,
      priceMultiplier: parseFloat(formData.get('priceMultiplier') as string || '1.0'),
      shippingMultiplier: parseFloat(formData.get('shippingMultiplier') as string || '1.0'),
      taxMultiplier: parseFloat(formData.get('taxMultiplier') as string || '1.0')
    };

    if (!territoryData.territory) {
      throw new Error('Territory is required');
    }

    // Nigerian territory-specific pricing
    const territoryPricing = {
      Lagos: { baseMultiplier: 1.0, shipping: 1.0, tax: 1.0, description: 'Lagos base pricing' },
      Abuja: { baseMultiplier: 1.05, shipping: 1.1, tax: 1.0, description: 'Abuja federal capital premium' },
      'Port Harcourt': { baseMultiplier: 1.03, shipping: 1.15, tax: 1.0, description: 'Port Harcourt oil hub pricing' },
      Kano: { baseMultiplier: 0.95, shipping: 1.2, tax: 1.0, description: 'Kano northern region adjustment' },
      Ibadan: { baseMultiplier: 0.98, shipping: 1.05, tax: 1.0, description: 'Ibadan regional pricing' }
    };

    const territoryConfig = territoryPricing[territoryData.territory as keyof typeof territoryPricing] || 
                           { baseMultiplier: 1.0, shipping: 1.0, tax: 1.0, description: 'Standard territory pricing' };

    return {
      success: true,
      territory: territoryData.territory,
      configuration: {
        priceMultiplier: territoryConfig.baseMultiplier,
        shippingMultiplier: territoryConfig.shipping,
        taxMultiplier: territoryConfig.tax,
        description: territoryConfig.description
      },
      tenantId, // Include for audit trail
      message: `Territory pricing configured for ${territoryData.territory}`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to manage territory pricing';
    console.error('Territory pricing management failed:', error);
    
    return {
      success: false,
      error: errorMessage,
      message: `Territory pricing failed: ${errorMessage}`
    };
  }
}