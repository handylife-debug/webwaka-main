import { execute_sql, withTransaction } from '@/lib/database';
import { getSecureTenantId } from '@/lib/secure-auth';
import { z } from 'zod';
import crypto from 'crypto';

// CELLULAR REUSABILITY: Import and reuse existing product management functionality  
// Note: Using direct database integration instead of cell instances for better compatibility

// Types for ProductTypesManager
export type ProductType = 'simple' | 'variable' | 'digital' | 'bundled' | 'classified';

export interface TypedProduct {
  id: string;
  tenantId: string;
  productType: ProductType;
  baseProductData: any;
  typeSpecificData: any;
  variations?: ProductVariation[];
  digitalAssets?: DigitalAsset[];
  bundleItems?: BundleItem[];
  classificationDetails?: ProductClassification;
  accessControls?: ProductAccessControl;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariation {
  id: string;
  productId: string;
  variationAttributes: Record<string, string>;
  basePrice: number;
  salePrice?: number;
  costPrice?: number;
  weight?: number;
  dimensions?: string;
  images: string[];
  featuredImage?: string;
  stockManaged: boolean;
  initialStock: number;
  isDefault: boolean;
  isEnabled: boolean;
  displayOrder: number;
}

export interface DigitalAsset {
  id: string;
  productId: string;
  assetName: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  mimeType?: string;
  fileHash?: string;
  downloadLimit: number;
  downloadsCount: number;
  expiryDays: number;
  licenseType: 'single_use' | 'multi_use' | 'unlimited' | 'subscription' | 'trial';
  accessInstructions?: string;
  supportContact?: string;
  autoDelivery: boolean;
  deliveryMethod: 'download' | 'email' | 'streaming' | 'api_access';
  isActive: boolean;
  isEncrypted: boolean;
}

export interface BundleItem {
  id: string;
  bundleProductId: string;
  itemProductId: string;
  itemVariantId?: string;
  quantity: number;
  isOptional: boolean;
  isSubstitutable: boolean;
  bundlePrice?: number;
  discountAmount: number;
  discountType: 'fixed' | 'percentage';
  displayOrder: number;
  displayLabel?: string;
  description?: string;
  enforceStock: boolean;
  isActive: boolean;
}

export interface ProductClassification {
  id: string;
  productId: string;
  classificationLevel: 'public' | 'restricted' | 'confidential' | 'top_secret';
  classificationAuthority?: string;
  classificationDate: string;
  declassificationDate?: string;
  complianceStandards: any[];
  certificationRequirements: any[];
  auditRequirements: any[];
  encryptionRequired: boolean;
  dataRetentionDays: number;
  auditTrailRequired: boolean;
  accessLogLevel: 'none' | 'basic' | 'normal' | 'detailed' | 'forensic';
  validationStatus: 'pending' | 'approved' | 'rejected' | 'expired' | 'under_review';
}

export interface ProductAccessControl {
  id: string;
  productId: string;
  requiredRoles: string[];
  requiredPermissions: string[];
  allowedLocations: string[];
  blockedLocations: string[];
  locationRestrictionType: 'whitelist' | 'blacklist' | 'none';
  allowedTimeRanges: any[];
  timezone: string;
  allowedIpRanges: string[];
  blockedIpRanges: string[];
  maxConcurrentSessions: number;
  sessionTimeoutMinutes: number;
  requireMfa: boolean;
  requiresApproval: boolean;
  approvalWorkflowId?: string;
  emergencyAccessEnabled: boolean;
  effectiveFrom: string;
  effectiveUntil?: string;
}

// Validation schemas
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
 * ProductTypesManager Cell - Advanced product type management
 * CELLULAR REUSABILITY: Extends existing ProductCatalog and InventoryTracking cells
 */
export class ProductTypesManagerCell {
  constructor() {
    // CELLULAR REUSABILITY: Reuses existing database structures and utilities
    // Integrates directly with inventory_products table and related structures
  }

  /**
   * Create a simple product (single variant, physical)
   * REUSE: Uses ProductCatalog for base product creation
   */
  async createSimpleProduct(params: z.infer<typeof BaseProductSchema>): Promise<{
    success: boolean;
    product?: TypedProduct;
    error?: string;
  }> {
    try {
      const tenantId = await getSecureTenantId();
      const validated = BaseProductSchema.parse(params);

      return await withTransaction(async (client) => {
        // REUSE: Create base product using existing inventory_products structure
        const productId = crypto.randomUUID();
        
        await execute_sql(`
          INSERT INTO inventory_products (
            id, tenant_id, product_code, product_name, sku, barcode,
            selling_price, currency, description, weight, dimensions,
            is_taxable, is_active, metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          productId,
          tenantId,
          validated.productCode,
          validated.productName,
          validated.sku,
          validated.barcode,
          validated.price,
          validated.currency,
          validated.description,
          validated.weight,
          validated.dimensions,
          validated.taxable,
          true,
          JSON.stringify({
            ...validated.metadata,
            productType: 'simple',
            images: validated.images,
            tags: validated.tags
          })
        ]);

        const baseProduct = {
          id: productId,
          tenantId,
          productCode: validated.productCode,
          productName: validated.productName,
          sku: validated.sku,
          barcode: validated.barcode,
          sellingPrice: validated.price,
          currency: validated.currency,
          description: validated.description,
          weight: validated.weight,
          dimensions: validated.dimensions,
          isTaxable: validated.taxable,
          isActive: true,
          metadata: {
            ...validated.metadata,
            productType: 'simple',
            images: validated.images,
            tags: validated.tags
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Create product type record
        await execute_sql(`
          INSERT INTO product_types (
            tenant_id, product_id, product_type, type_specific_data,
            has_variations, has_digital_assets, has_bundle_items, has_access_controls
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          tenantId,
          baseProduct.id,
          'simple',
          JSON.stringify({
            stockManaged: validated.stockManaged,
            images: validated.images,
            tags: validated.tags
          }),
          false, // simple products don't have variations
          false, // not digital
          false, // not bundled
          false  // not classified
        ]);

        // REUSE: Initialize inventory if stock managed using existing structure
        if (validated.stockManaged) {
          const defaultLocationId = await this.getDefaultLocationId(tenantId);
          
          // Create initial stock level record
          await execute_sql(`
            INSERT INTO inventory_stock_levels (
              tenant_id, product_id, location_id, current_stock,
              reserved_stock, available_stock, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING
          `, [tenantId, baseProduct.id, defaultLocationId, 0, 0, 0]);
        }

        return {
          success: true,
          product: {
            id: baseProduct.id,
            tenantId,
            productType: 'simple',
            baseProductData: baseProduct,
            typeSpecificData: {
              stockManaged: validated.stockManaged,
              images: validated.images,
              tags: validated.tags
            },
            createdAt: baseProduct.createdAt,
            updatedAt: baseProduct.updatedAt
          }
        };
      });

    } catch (error) {
      console.error('Error creating simple product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create simple product'
      };
    }
  }

  /**
   * Create a variable product (multiple variants with different attributes)
   * REUSE: Uses ProductCatalog for base product and variant creation
   */
  async createVariableProduct(params: z.infer<typeof VariableProductSchema>): Promise<{
    success: boolean;
    product?: TypedProduct;
    error?: string;
  }> {
    try {
      const tenantId = await getSecureTenantId();
      const validated = VariableProductSchema.parse(params);

      return await withTransaction(async (client) => {
        // REUSE: Create base product using existing ProductCatalog
        const baseProductResult = await this.createSimpleProduct(validated.baseProduct);
        if (!baseProductResult.success || !baseProductResult.product) {
          throw new Error('Failed to create base variable product');
        }

        const baseProduct = baseProductResult.product;

        // Update product type to variable
        await execute_sql(`
          UPDATE product_types SET
            product_type = $1,
            type_specific_data = $2,
            has_variations = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $4 AND product_id = $5
        `, [
          'variable',
          JSON.stringify({
            variationAttributes: validated.variationAttributes,
            stockManaged: validated.baseProduct.stockManaged,
            images: validated.baseProduct.images,
            tags: validated.baseProduct.tags
          }),
          true,
          tenantId,
          baseProduct.id
        ]);

        // Create variations
        const variations: ProductVariation[] = [];
        for (let i = 0; i < validated.variations.length; i++) {
          const variation = validated.variations[i];
          const variationId = crypto.randomUUID();

          // REUSE: Create product variant using existing ProductCatalog structure
          await execute_sql(`
            INSERT INTO product_variations (
              id, tenant_id, product_id, variation_attributes,
              base_price, cost_price, weight, dimensions,
              stock_managed, initial_stock, is_default, is_enabled,
              display_order, images, featured_image
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `, [
            variationId,
            tenantId,
            baseProduct.id,
            JSON.stringify(variation.attributes),
            variation.price,
            variation.price * 0.7, // Estimate cost price
            variation.weight,
            variation.dimensions,
            validated.baseProduct.stockManaged,
            variation.stockQuantity,
            i === 0, // First variation is default
            variation.enabled,
            i,
            JSON.stringify(variation.image ? [variation.image] : []),
            variation.image
          ]);

          // REUSE: Initialize inventory for each variation if stock managed
          if (validated.baseProduct.stockManaged && variation.stockQuantity > 0) {
            const defaultLocationId = await this.getDefaultLocationId(tenantId);
            
            // Create stock level for variation
            await execute_sql(`
              INSERT INTO inventory_stock_levels (
                tenant_id, product_id, variant_id, location_id, current_stock,
                reserved_stock, available_stock, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (tenant_id, product_id, variant_id, location_id) DO NOTHING
            `, [tenantId, baseProduct.id, variationId, defaultLocationId, variation.stockQuantity, 0, variation.stockQuantity]);
          }

          variations.push({
            id: variationId,
            productId: baseProduct.id,
            variationAttributes: variation.attributes,
            basePrice: variation.price,
            weight: variation.weight,
            dimensions: variation.dimensions,
            images: variation.image ? [variation.image] : [],
            featuredImage: variation.image,
            stockManaged: validated.baseProduct.stockManaged,
            initialStock: variation.stockQuantity,
            isDefault: i === 0,
            isEnabled: variation.enabled,
            displayOrder: i
          });
        }

        return {
          success: true,
          product: {
            ...baseProduct,
            productType: 'variable',
            variations,
            typeSpecificData: {
              variationAttributes: validated.variationAttributes,
              stockManaged: validated.baseProduct.stockManaged,
              images: validated.baseProduct.images,
              tags: validated.baseProduct.tags
            }
          }
        };
      });

    } catch (error) {
      console.error('Error creating variable product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create variable product'
      };
    }
  }

  /**
   * Create a digital product (downloadable/streamable assets)
   * REUSE: Uses ProductCatalog for base product creation
   */
  async createDigitalProduct(params: z.infer<typeof DigitalProductSchema>): Promise<{
    success: boolean;
    product?: TypedProduct;
    error?: string;
  }> {
    try {
      const tenantId = await getSecureTenantId();
      const validated = DigitalProductSchema.parse(params);

      return await withTransaction(async (client) => {
        // REUSE: Create base product (digital products don't need stock management)
        const baseProductParams = {
          ...validated.baseProduct,
          stockManaged: false // Digital products don't require stock management
        };

        const baseProductResult = await this.createSimpleProduct(baseProductParams);
        if (!baseProductResult.success || !baseProductResult.product) {
          throw new Error('Failed to create base digital product');
        }

        const baseProduct = baseProductResult.product;

        // Update product type to digital
        await execute_sql(`
          UPDATE product_types SET
            product_type = $1,
            type_specific_data = $2,
            has_digital_assets = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $4 AND product_id = $5
        `, [
          'digital',
          JSON.stringify({
            licenseType: validated.licenseType,
            accessInstructions: validated.accessInstructions,
            supportEmail: validated.supportEmail,
            autoFulfillment: validated.autoFulfillment,
            images: validated.baseProduct.images,
            tags: validated.baseProduct.tags
          }),
          true,
          tenantId,
          baseProduct.id
        ]);

        // Create digital assets
        const digitalAssets: DigitalAsset[] = [];
        for (const asset of validated.digitalAssets) {
          const assetId = crypto.randomUUID();

          await execute_sql(`
            INSERT INTO digital_assets (
              id, tenant_id, product_id, asset_name, original_filename,
              file_path, file_size, file_type, download_limit, expiry_days,
              license_type, auto_delivery, delivery_method, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `, [
            assetId,
            tenantId,
            baseProduct.id,
            asset.fileName,
            asset.fileName,
            asset.fileUrl,
            asset.fileSize,
            asset.fileType,
            asset.downloadLimit,
            asset.expiryDays,
            validated.licenseType,
            validated.autoFulfillment,
            'download',
            true
          ]);

          digitalAssets.push({
            id: assetId,
            productId: baseProduct.id,
            assetName: asset.fileName,
            originalFilename: asset.fileName,
            filePath: asset.fileUrl,
            fileSize: asset.fileSize,
            fileType: asset.fileType,
            downloadLimit: asset.downloadLimit,
            downloadsCount: 0,
            expiryDays: asset.expiryDays,
            licenseType: validated.licenseType,
            accessInstructions: validated.accessInstructions,
            supportContact: validated.supportEmail,
            autoDelivery: validated.autoFulfillment,
            deliveryMethod: 'download',
            isActive: true,
            isEncrypted: false
          });
        }

        return {
          success: true,
          product: {
            ...baseProduct,
            productType: 'digital',
            digitalAssets,
            typeSpecificData: {
              licenseType: validated.licenseType,
              accessInstructions: validated.accessInstructions,
              supportEmail: validated.supportEmail,
              autoFulfillment: validated.autoFulfillment,
              images: validated.baseProduct.images,
              tags: validated.baseProduct.tags
            }
          }
        };
      });

    } catch (error) {
      console.error('Error creating digital product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create digital product'
      };
    }
  }

  /**
   * Create a bundled product (combination of other products)
   * REUSE: Uses ProductCatalog for base product creation
   */
  async createBundledProduct(params: z.infer<typeof BundledProductSchema>): Promise<{
    success: boolean;
    product?: TypedProduct;
    error?: string;
  }> {
    try {
      const tenantId = await getSecureTenantId();
      const validated = BundledProductSchema.parse(params);

      return await withTransaction(async (client) => {
        // REUSE: Create base product
        const baseProductResult = await this.createSimpleProduct(validated.baseProduct);
        if (!baseProductResult.success || !baseProductResult.product) {
          throw new Error('Failed to create base bundled product');
        }

        const baseProduct = baseProductResult.product;

        // Validate bundle items exist
        for (const item of validated.bundleItems) {
          const itemExists = await execute_sql(
            'SELECT id FROM inventory_products WHERE id = $1 AND tenant_id = $2',
            [item.productId, tenantId]
          );
          if (itemExists.rows.length === 0) {
            throw new Error(`Bundle item product ${item.productId} not found`);
          }
        }

        // Update product type to bundled
        await execute_sql(`
          UPDATE product_types SET
            product_type = $1,
            type_specific_data = $2,
            has_bundle_items = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $4 AND product_id = $5
        `, [
          'bundled',
          JSON.stringify({
            bundleType: validated.bundleType,
            bundleDiscount: validated.bundleDiscount,
            bundleDiscountType: validated.bundleDiscountType,
            minItems: validated.minItems,
            maxItems: validated.maxItems,
            images: validated.baseProduct.images,
            tags: validated.baseProduct.tags
          }),
          true,
          tenantId,
          baseProduct.id
        ]);

        // Create bundle items
        const bundleItems: BundleItem[] = [];
        for (let i = 0; i < validated.bundleItems.length; i++) {
          const item = validated.bundleItems[i];
          const bundleItemId = crypto.randomUUID();

          await execute_sql(`
            INSERT INTO bundle_items (
              id, tenant_id, bundle_product_id, item_product_id, item_variant_id,
              quantity, is_optional, discount_amount, discount_type,
              display_order, enforce_stock, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            bundleItemId,
            tenantId,
            baseProduct.id,
            item.productId,
            item.variationId,
            item.quantity,
            item.isOptional,
            item.discountAmount,
            item.discountType,
            i,
            validated.baseProduct.stockManaged,
            true
          ]);

          bundleItems.push({
            id: bundleItemId,
            bundleProductId: baseProduct.id,
            itemProductId: item.productId,
            itemVariantId: item.variationId,
            quantity: item.quantity,
            isOptional: item.isOptional,
            isSubstitutable: false,
            bundlePrice: undefined,
            discountAmount: item.discountAmount,
            discountType: item.discountType,
            displayOrder: i,
            enforceStock: validated.baseProduct.stockManaged,
            isActive: true
          });
        }

        return {
          success: true,
          product: {
            ...baseProduct,
            productType: 'bundled',
            bundleItems,
            typeSpecificData: {
              bundleType: validated.bundleType,
              bundleDiscount: validated.bundleDiscount,
              bundleDiscountType: validated.bundleDiscountType,
              minItems: validated.minItems,
              maxItems: validated.maxItems,
              images: validated.baseProduct.images,
              tags: validated.baseProduct.tags
            }
          }
        };
      });

    } catch (error) {
      console.error('Error creating bundled product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create bundled product'
      };
    }
  }

  /**
   * Create a classified product (restricted access)
   * REUSE: Uses ProductCatalog for base product creation
   */
  async createClassifiedProduct(params: z.infer<typeof ClassifiedProductSchema>): Promise<{
    success: boolean;
    product?: TypedProduct;
    error?: string;
  }> {
    try {
      const tenantId = await getSecureTenantId();
      const validated = ClassifiedProductSchema.parse(params);

      return await withTransaction(async (client) => {
        // REUSE: Create base product
        const baseProductResult = await this.createSimpleProduct(validated.baseProduct);
        if (!baseProductResult.success || !baseProductResult.product) {
          throw new Error('Failed to create base classified product');
        }

        const baseProduct = baseProductResult.product;

        // Update product type to classified
        await execute_sql(`
          UPDATE product_types SET
            product_type = $1,
            type_specific_data = $2,
            has_access_controls = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $4 AND product_id = $5
        `, [
          'classified',
          JSON.stringify({
            classificationLevel: validated.classificationLevel,
            auditTrail: validated.auditTrail,
            encryptionRequired: validated.encryptionRequired,
            images: validated.baseProduct.images,
            tags: validated.baseProduct.tags
          }),
          true,
          tenantId,
          baseProduct.id
        ]);

        // Create classification record
        const classificationId = crypto.randomUUID();
        await execute_sql(`
          INSERT INTO product_classifications (
            id, tenant_id, product_id, classification_level,
            compliance_standards, certification_requirements, audit_requirements,
            encryption_required, audit_trail_required, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          classificationId,
          tenantId,
          baseProduct.id,
          validated.classificationLevel,
          JSON.stringify(validated.complianceRequirements),
          JSON.stringify([]),
          JSON.stringify([]),
          validated.encryptionRequired,
          validated.auditTrail,
          true
        ]);

        // Create access controls if specified
        let accessControls: ProductAccessControl | undefined;
        if (validated.accessControls) {
          const accessControlId = crypto.randomUUID();
          await execute_sql(`
            INSERT INTO product_access_controls (
              id, tenant_id, product_id, required_roles, required_permissions,
              allowed_locations, allowed_time_ranges, timezone,
              max_concurrent_sessions, session_timeout_minutes, require_mfa,
              is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            accessControlId,
            tenantId,
            baseProduct.id,
            JSON.stringify(validated.accessControls.requiredRoles),
            JSON.stringify(validated.accessControls.requiredPermissions),
            JSON.stringify(validated.accessControls.locationRestrictions),
            JSON.stringify(validated.accessControls.timeRestrictions ? [validated.accessControls.timeRestrictions] : []),
            validated.accessControls.timeRestrictions?.timezone || 'Africa/Lagos',
            -1, // unlimited sessions
            480, // 8 hours
            false,
            true
          ]);

          accessControls = {
            id: accessControlId,
            productId: baseProduct.id,
            requiredRoles: validated.accessControls.requiredRoles,
            requiredPermissions: validated.accessControls.requiredPermissions,
            allowedLocations: validated.accessControls.locationRestrictions,
            blockedLocations: [],
            locationRestrictionType: 'whitelist',
            allowedTimeRanges: validated.accessControls.timeRestrictions ? [validated.accessControls.timeRestrictions] : [],
            timezone: validated.accessControls.timeRestrictions?.timezone || 'Africa/Lagos',
            allowedIpRanges: [],
            blockedIpRanges: [],
            maxConcurrentSessions: -1,
            sessionTimeoutMinutes: 480,
            requireMfa: false,
            requiresApproval: false,
            emergencyAccessEnabled: false,
            effectiveFrom: new Date().toISOString()
          };
        }

        return {
          success: true,
          product: {
            ...baseProduct,
            productType: 'classified',
            classificationDetails: {
              id: classificationId,
              productId: baseProduct.id,
              classificationLevel: validated.classificationLevel,
              classificationDate: new Date().toISOString(),
              complianceStandards: validated.complianceRequirements,
              certificationRequirements: [],
              auditRequirements: [],
              encryptionRequired: validated.encryptionRequired,
              dataRetentionDays: 2555,
              auditTrailRequired: validated.auditTrail,
              accessLogLevel: 'normal',
              validationStatus: 'pending'
            },
            accessControls,
            typeSpecificData: {
              classificationLevel: validated.classificationLevel,
              auditTrail: validated.auditTrail,
              encryptionRequired: validated.encryptionRequired,
              images: validated.baseProduct.images,
              tags: validated.baseProduct.tags
            }
          }
        };
      });

    } catch (error) {
      console.error('Error creating classified product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create classified product'
      };
    }
  }

  /**
   * Get products by type with filtering
   */
  async getProductsByType(params: {
    productType: ProductType;
    filters?: Record<string, any>;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    products?: TypedProduct[];
    pagination?: any;
    typeStats?: any;
    error?: string;
  }> {
    try {
      const tenantId = await getSecureTenantId();
      const { productType, filters = {}, limit = 20, offset = 0 } = params;

      // Build WHERE clause based on filters
      let whereClause = 'WHERE pt.tenant_id = $1 AND pt.product_type = $2 AND pt.is_active = true';
      const queryParams: any[] = [tenantId, productType];
      let paramIndex = 3;

      if (filters.categoryId) {
        whereClause += ` AND p.category_id = $${paramIndex++}`;
        queryParams.push(filters.categoryId);
      }

      if (filters.brand) {
        whereClause += ` AND p.brand ILIKE $${paramIndex++}`;
        queryParams.push(`%${filters.brand}%`);
      }

      if (filters.priceRange) {
        if (filters.priceRange.min !== undefined) {
          whereClause += ` AND p.selling_price >= $${paramIndex++}`;
          queryParams.push(filters.priceRange.min);
        }
        if (filters.priceRange.max !== undefined) {
          whereClause += ` AND p.selling_price <= $${paramIndex++}`;
          queryParams.push(filters.priceRange.max);
        }
      }

      // Get total count
      const countResult = await execute_sql(`
        SELECT COUNT(*) as total
        FROM product_types pt
        JOIN inventory_products p ON pt.product_id = p.id
        ${whereClause}
      `, queryParams);

      // Get products with pagination
      const productsResult = await execute_sql(`
        SELECT 
          pt.*,
          p.product_code, p.product_name, p.sku, p.barcode,
          p.selling_price, p.currency, p.description, p.image_url,
          p.weight, p.dimensions, p.is_active as product_active,
          p.created_at as product_created_at, p.updated_at as product_updated_at
        FROM product_types pt
        JOIN inventory_products p ON pt.product_id = p.id
        ${whereClause}
        ORDER BY p.updated_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, [...queryParams, limit, offset]);

      const total = parseInt(countResult.rows[0].total);
      const products: TypedProduct[] = [];

      for (const row of productsResult.rows) {
        const product: TypedProduct = {
          id: row.product_id,
          tenantId: row.tenant_id,
          productType: row.product_type,
          baseProductData: {
            id: row.product_id,
            productCode: row.product_code,
            productName: row.product_name,
            sku: row.sku,
            barcode: row.barcode,
            sellingPrice: parseFloat(row.selling_price),
            currency: row.currency,
            description: row.description,
            imageUrl: row.image_url,
            weight: row.weight ? parseFloat(row.weight) : null,
            dimensions: row.dimensions,
            isActive: row.product_active,
            createdAt: row.product_created_at,
            updatedAt: row.product_updated_at
          },
          typeSpecificData: JSON.parse(row.type_specific_data || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };

        // Load type-specific data based on product type
        if (row.has_variations) {
          const variationsResult = await execute_sql(`
            SELECT * FROM product_variations 
            WHERE tenant_id = $1 AND product_id = $2 AND is_enabled = true
            ORDER BY display_order
          `, [tenantId, row.product_id]);
          
          product.variations = variationsResult.rows.map((v: any) => ({
            id: v.id,
            productId: v.product_id,
            variationAttributes: JSON.parse(v.variation_attributes || '{}'),
            basePrice: parseFloat(v.base_price || '0'),
            salePrice: v.sale_price ? parseFloat(v.sale_price) : undefined,
            costPrice: v.cost_price ? parseFloat(v.cost_price) : undefined,
            weight: v.weight ? parseFloat(v.weight) : undefined,
            dimensions: v.dimensions,
            images: JSON.parse(v.images || '[]'),
            featuredImage: v.featured_image,
            stockManaged: v.stock_managed,
            initialStock: v.initial_stock || 0,
            isDefault: v.is_default,
            isEnabled: v.is_enabled,
            displayOrder: v.display_order || 0
          }));
        }

        if (row.has_digital_assets) {
          const assetsResult = await execute_sql(`
            SELECT * FROM digital_assets 
            WHERE tenant_id = $1 AND product_id = $2 AND is_active = true
            ORDER BY created_at
          `, [tenantId, row.product_id]);
          
          product.digitalAssets = assetsResult.rows.map((a: any) => ({
            id: a.id,
            productId: a.product_id,
            assetName: a.asset_name,
            originalFilename: a.original_filename,
            filePath: a.file_path,
            fileSize: a.file_size,
            fileType: a.file_type,
            mimeType: a.mime_type,
            fileHash: a.file_hash,
            downloadLimit: a.download_limit,
            downloadsCount: a.downloads_count,
            expiryDays: a.expiry_days,
            licenseType: a.license_type,
            accessInstructions: a.access_instructions,
            supportContact: a.support_contact,
            autoDelivery: a.auto_delivery,
            deliveryMethod: a.delivery_method,
            isActive: a.is_active,
            isEncrypted: a.is_encrypted
          }));
        }

        if (row.has_bundle_items) {
          const bundleResult = await execute_sql(`
            SELECT bi.*, p.product_name, p.selling_price, p.image_url
            FROM bundle_items bi
            JOIN inventory_products p ON bi.item_product_id = p.id
            WHERE bi.tenant_id = $1 AND bi.bundle_product_id = $2 AND bi.is_active = true
            ORDER BY bi.display_order
          `, [tenantId, row.product_id]);
          
          product.bundleItems = bundleResult.rows.map((b: any) => ({
            id: b.id,
            bundleProductId: b.bundle_product_id,
            itemProductId: b.item_product_id,
            itemVariantId: b.item_variant_id,
            quantity: b.quantity,
            isOptional: b.is_optional,
            isSubstitutable: b.is_substitutable,
            bundlePrice: b.bundle_price ? parseFloat(b.bundle_price) : undefined,
            discountAmount: parseFloat(b.discount_amount || '0'),
            discountType: b.discount_type,
            displayOrder: b.display_order || 0,
            displayLabel: b.display_label,
            description: b.description,
            enforceStock: b.enforce_stock,
            isActive: b.is_active
          }));
        }

        products.push(product);
      }

      return {
        success: true,
        products,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        },
        typeStats: {
          totalProducts: total,
          // Additional stats could be calculated here
        }
      };

    } catch (error) {
      console.error('Error getting products by type:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get products by type'
      };
    }
  }

  // Helper method to get default location for inventory operations
  private async getDefaultLocationId(tenantId: string): Promise<string> {
    // REUSE: This would typically get the default location from MultiLocationManagement cell
    // For now, return a placeholder - in real implementation would query locations
    return crypto.randomUUID(); // Placeholder
  }
}

// Export singleton instance
export const productTypesManagerCell = new ProductTypesManagerCell();