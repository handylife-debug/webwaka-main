'use server';

import { z } from 'zod';
import { getSecureTenantId } from '@/lib/secure-auth';
import { productTypesManagerCell } from './server';

// CELLULAR REUSABILITY: Use server cell implementation for all operations

// Input validation schemas reused from server
const BaseProductSchema = z.object({
  productCode: z.string().min(1).max(100),
  productName: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().max(100).optional(),
  price: z.number().min(0),
  currency: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  weight: z.number().min(0).optional(),
  dimensions: z.string().max(100).optional(),
  images: z.array(z.string()).default([]),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  taxable: z.boolean().default(true),
  stockManaged: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({})
});

const VariableProductSchema = z.object({
  baseProduct: BaseProductSchema,
  variationAttributes: z.array(z.object({
    name: z.string().max(50),
    slug: z.string().max(50),
    values: z.array(z.string()),
    isRequired: z.boolean().default(true),
    displayType: z.enum(['dropdown', 'color_swatch', 'image_swatch', 'button', 'radio']).default('dropdown')
  })),
  variations: z.array(z.object({
    sku: z.string().max(100),
    attributes: z.record(z.string()),
    price: z.number().min(0),
    weight: z.number().min(0).optional(),
    dimensions: z.string().max(100).optional(),
    image: z.string().optional(),
    stockQuantity: z.number().int().min(0).default(0),
    enabled: z.boolean().default(true)
  }))
});

const DigitalProductSchema = z.object({
  baseProduct: BaseProductSchema,
  digitalAssets: z.array(z.object({
    fileName: z.string().max(255),
    fileUrl: z.string().max(500),
    fileSize: z.number().int().min(0),
    fileType: z.string().max(50),
    downloadLimit: z.number().int().min(-1).default(-1),
    expiryDays: z.number().int().min(0).default(365)
  })),
  licenseType: z.enum(['single_use', 'multi_use', 'unlimited', 'subscription']).default('single_use'),
  accessInstructions: z.string().optional(),
  supportEmail: z.string().email().optional(),
  autoFulfillment: z.boolean().default(true)
});

const BundledProductSchema = z.object({
  baseProduct: BaseProductSchema,
  bundleItems: z.array(z.object({
    productId: z.string().uuid(),
    variationId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).default(1),
    discountAmount: z.number().min(0).default(0),
    discountType: z.enum(['fixed', 'percentage']).default('fixed'),
    isOptional: z.boolean().default(false)
  })),
  bundleType: z.enum(['fixed', 'flexible']).default('fixed'),
  bundleDiscount: z.number().min(0).default(0),
  bundleDiscountType: z.enum(['fixed', 'percentage']).default('percentage'),
  minItems: z.number().int().min(1).optional(),
  maxItems: z.number().int().min(1).optional()
});

const ClassifiedProductSchema = z.object({
  baseProduct: BaseProductSchema,
  classificationLevel: z.enum(['public', 'restricted', 'confidential', 'top_secret']).default('public'),
  accessControls: z.object({
    requiredRoles: z.array(z.string()).default([]),
    requiredPermissions: z.array(z.string()).default([]),
    locationRestrictions: z.array(z.string()).default([]),
    timeRestrictions: z.object({
      allowedHours: z.string().regex(/^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$/).optional(),
      allowedDays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).default([]),
      timezone: z.string().default('Africa/Lagos')
    }).optional()
  }).optional(),
  complianceRequirements: z.array(z.object({
    standard: z.string().max(100),
    requirement: z.string(),
    verified: z.boolean().default(false),
    verifiedBy: z.string().uuid().optional(),
    verifiedDate: z.string().optional(),
    expiryDate: z.string().optional()
  })).default([]),
  auditTrail: z.boolean().default(true),
  encryptionRequired: z.boolean().default(false)
});

/**
 * Create a simple product (single variant, physical product)
 */
export async function createSimpleProduct(params: z.infer<typeof BaseProductSchema>) {
  try {
    const validated = BaseProductSchema.parse(params);
    const result = await productTypesManagerCell.createSimpleProduct(validated);
    return result;
  } catch (error) {
    console.error('Error in createSimpleProduct action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create simple product'
    };
  }
}

/**
 * Create a variable product (multiple variants with different attributes)
 */
export async function createVariableProduct(params: z.infer<typeof VariableProductSchema>) {
  try {
    const validated = VariableProductSchema.parse(params);
    const result = await productTypesManagerCell.createVariableProduct(validated);
    return result;
  } catch (error) {
    console.error('Error in createVariableProduct action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create variable product'
    };
  }
}

/**
 * Create a digital product (downloadable/streamable assets)
 */
export async function createDigitalProduct(params: z.infer<typeof DigitalProductSchema>) {
  try {
    const validated = DigitalProductSchema.parse(params);
    const result = await productTypesManagerCell.createDigitalProduct(validated);
    return result;
  } catch (error) {
    console.error('Error in createDigitalProduct action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create digital product'
    };
  }
}

/**
 * Create a bundled product (combination of other products)
 */
export async function createBundledProduct(params: z.infer<typeof BundledProductSchema>) {
  try {
    const validated = BundledProductSchema.parse(params);
    const result = await productTypesManagerCell.createBundledProduct(validated);
    return result;
  } catch (error) {
    console.error('Error in createBundledProduct action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create bundled product'
    };
  }
}

/**
 * Create a classified product (restricted access)
 */
export async function createClassifiedProduct(params: z.infer<typeof ClassifiedProductSchema>) {
  try {
    const validated = ClassifiedProductSchema.parse(params);
    const result = await productTypesManagerCell.createClassifiedProduct(validated);
    return result;
  } catch (error) {
    console.error('Error in createClassifiedProduct action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create classified product'
    };
  }
}

/**
 * Get products by type with filtering and pagination
 */
export async function getProductsByType(params: {
  productType: 'simple' | 'variable' | 'digital' | 'bundled' | 'classified';
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
}) {
  try {
    const result = await productTypesManagerCell.getProductsByType(params);
    return result;
  } catch (error) {
    console.error('Error in getProductsByType action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get products by type'
    };
  }
}

/**
 * Update product type (convert between types)
 */
export async function updateProductType(params: {
  productId: string;
  newProductType: 'simple' | 'variable' | 'digital' | 'bundled' | 'classified';
  typeSpecificData?: Record<string, any>;
}) {
  try {
    // This would be implemented in the server cell
    // For now, return placeholder
    return {
      success: false,
      error: 'Product type conversion not yet implemented'
    };
  } catch (error) {
    console.error('Error in updateProductType action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product type'
    };
  }
}

/**
 * Get product type definition and validation rules
 */
export async function getProductTypeDefinition(productType: 'simple' | 'variable' | 'digital' | 'bundled' | 'classified') {
  try {
    const definitions = {
      simple: {
        type: 'simple',
        name: 'Simple Product',
        description: 'Single variant physical product with basic inventory management',
        features: ['Basic inventory tracking', 'Single pricing', 'Stock management', 'Nigerian VAT support'],
        requiredFields: ['productCode', 'productName', 'price'],
        optionalFields: ['sku', 'barcode', 'weight', 'dimensions', 'images']
      },
      variable: {
        type: 'variable',
        name: 'Variable Product',
        description: 'Product with multiple variations (size, color, etc.) and complex pricing',
        features: ['Multiple variations', 'Attribute-based pricing', 'Variation-specific inventory', 'Matrix management'],
        requiredFields: ['baseProduct', 'variationAttributes', 'variations'],
        optionalFields: ['displayType', 'defaultVariation', 'variationImages']
      },
      digital: {
        type: 'digital',
        name: 'Digital Product',
        description: 'Downloadable or streamable digital assets with licensing controls',
        features: ['Digital asset management', 'Download controls', 'License management', 'Auto-fulfillment'],
        requiredFields: ['baseProduct', 'digitalAssets'],
        optionalFields: ['licenseType', 'accessInstructions', 'supportEmail']
      },
      bundled: {
        type: 'bundled',
        name: 'Bundled Product',
        description: 'Combination of multiple products with bundled pricing and inventory',
        features: ['Multi-product bundles', 'Bundle pricing', 'Stock synchronization', 'Optional items'],
        requiredFields: ['baseProduct', 'bundleItems'],
        optionalFields: ['bundleDiscount', 'minItems', 'maxItems']
      },
      classified: {
        type: 'classified',
        name: 'Classified Product',
        description: 'Products with access controls, compliance requirements, and audit trails',
        features: ['Access controls', 'Compliance tracking', 'Audit trails', 'Role-based access'],
        requiredFields: ['baseProduct', 'classificationLevel'],
        optionalFields: ['accessControls', 'complianceRequirements', 'auditTrail']
      }
    };

    return {
      success: true,
      definition: definitions[productType]
    };
  } catch (error) {
    console.error('Error in getProductTypeDefinition action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get product type definition'
    };
  }
}

/**
 * Validate product data against type requirements
 */
export async function validateProductType(params: {
  productType: 'simple' | 'variable' | 'digital' | 'bundled' | 'classified';
  productData: Record<string, any>;
}) {
  try {
    const { productType, productData } = params;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation based on type
    switch (productType) {
      case 'simple':
        if (!BaseProductSchema.safeParse(productData).success) {
          const parseResult = BaseProductSchema.safeParse(productData);
          if (!parseResult.success) {
            errors.push(...parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
          }
        }
        break;

      case 'variable':
        if (!VariableProductSchema.safeParse(productData).success) {
          const parseResult = VariableProductSchema.safeParse(productData);
          if (!parseResult.success) {
            errors.push(...parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
          }
        }
        break;

      case 'digital':
        if (!DigitalProductSchema.safeParse(productData).success) {
          const parseResult = DigitalProductSchema.safeParse(productData);
          if (!parseResult.success) {
            errors.push(...parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
          }
        }
        break;

      case 'bundled':
        if (!BundledProductSchema.safeParse(productData).success) {
          const parseResult = BundledProductSchema.safeParse(productData);
          if (!parseResult.success) {
            errors.push(...parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
          }
        }
        break;

      case 'classified':
        if (!ClassifiedProductSchema.safeParse(productData).success) {
          const parseResult = ClassifiedProductSchema.safeParse(productData);
          if (!parseResult.success) {
            errors.push(...parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
          }
        }
        break;
    }

    // Additional business logic validations
    if (productType === 'bundled' && productData.bundleItems) {
      if (productData.bundleItems.length === 0) {
        errors.push('Bundle products must have at least one bundle item');
      }
    }

    if (productType === 'variable' && productData.variations) {
      if (productData.variations.length === 0) {
        errors.push('Variable products must have at least one variation');
      }
    }

    if (productType === 'digital' && productData.digitalAssets) {
      if (productData.digitalAssets.length === 0) {
        errors.push('Digital products must have at least one digital asset');
      }
    }

    return {
      success: true,
      isValid: errors.length === 0,
      errors,
      warnings,
      validationStatus: errors.length === 0 ? 'valid' : 'invalid'
    };
  } catch (error) {
    console.error('Error in validateProductType action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate product type'
    };
  }
}

/**
 * Get product analytics by type
 */
export async function getProductTypeAnalytics(params: {
  productType?: 'simple' | 'variable' | 'digital' | 'bundled' | 'classified';
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}) {
  try {
    // This would be implemented with proper analytics queries
    // For now, return placeholder data
    return {
      success: true,
      analytics: {
        totalProducts: 0,
        activeProducts: 0,
        inactiveProducts: 0,
        averagePrice: 0,
        totalVariations: 0,
        productsByType: {
          simple: 0,
          variable: 0,
          digital: 0,
          bundled: 0,
          classified: 0
        },
        recentActivity: []
      }
    };
  } catch (error) {
    console.error('Error in getProductTypeAnalytics action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get product analytics'
    };
  }
}