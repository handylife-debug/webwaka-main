/**
 * WebWaka Cell Contracts - JSON Schema Validation Layer
 * Runtime validation for all cell communications
 */

import { z } from 'zod';
import {
  CellResponseSchema,
  GetCustomerRequestSchema,
  GetCustomerResponseSchema,
  B2BAccessCheckRequestSchema,
  B2BAccessCheckResponseSchema,
  TrackEngagementRequestSchema,
  TrackEngagementResponseSchema,
  WholesalePriceRequestSchema,
  WholesalePriceResponseSchema,
  CellHealthResponseSchema,
  CellCapabilitiesResponseSchema,
  CustomerBasicSchema,
  B2BAccessResultSchema,
  EngagementInteractionSchema
} from './types';

// =============================================================================
// CONTRACT VALIDATION REGISTRY
// =============================================================================

export interface ContractDefinition {
  cellDomain: string;
  cellName: string;
  version: string;
  operations: Record<string, {
    requestSchema: z.ZodSchema<any>;
    responseSchema: z.ZodSchema<any>;
    description: string;
    deprecated?: boolean;
  }>;
}

export class ContractRegistry {
  private contracts = new Map<string, ContractDefinition>();

  register(contract: ContractDefinition): void {
    const key = `${contract.cellDomain}/${contract.cellName}/${contract.version}`;
    this.contracts.set(key, contract);
  }

  getContract(cellDomain: string, cellName: string, version: string): ContractDefinition | undefined {
    const key = `${cellDomain}/${cellName}/${version}`;
    return this.contracts.get(key);
  }

  getOperationSchemas(cellDomain: string, cellName: string, version: string, operation: string) {
    const contract = this.getContract(cellDomain, cellName, version);
    if (!contract || !contract.operations[operation]) {
      return null;
    }
    return contract.operations[operation];
  }

  validateRequest<T>(cellDomain: string, cellName: string, version: string, operation: string, data: T): T {
    const schemas = this.getOperationSchemas(cellDomain, cellName, version, operation);
    if (!schemas) {
      throw new Error(`No contract found for ${cellDomain}/${cellName}/${version}/${operation}`);
    }
    
    return schemas.requestSchema.parse(data);
  }

  validateResponse<T>(cellDomain: string, cellName: string, version: string, operation: string, data: T): T {
    const schemas = this.getOperationSchemas(cellDomain, cellName, version, operation);
    if (!schemas) {
      throw new Error(`No contract found for ${cellDomain}/${cellName}/${version}/${operation}`);
    }
    
    return schemas.responseSchema.parse(data);
  }

  listContracts(): Array<{ key: string; contract: ContractDefinition }> {
    return Array.from(this.contracts.entries()).map(([key, contract]) => ({ key, contract }));
  }
}

// =============================================================================
// DEFAULT CONTRACT DEFINITIONS
// =============================================================================

const globalRegistry = new ContractRegistry();

// Customer Profile Cell Contract
globalRegistry.register({
  cellDomain: 'customer',
  cellName: 'profile',
  version: 'v1',
  operations: {
    'get-customer': {
      requestSchema: GetCustomerRequestSchema,
      responseSchema: GetCustomerResponseSchema,
      description: 'Retrieve customer profile by ID with optional related data'
    },
    'health': {
      requestSchema: z.object({}),
      responseSchema: CellHealthResponseSchema,
      description: 'Health check for customer profile cell'
    }
  }
});

// B2B Access Control Cell Contract
globalRegistry.register({
  cellDomain: 'ecommerce',
  cellName: 'b2b-access-control', 
  version: 'v1',
  operations: {
    'check-access': {
      requestSchema: B2BAccessCheckRequestSchema,
      responseSchema: B2BAccessCheckResponseSchema,
      description: 'Check B2B user access permissions for resources and actions'
    }
  }
});

// Customer Engagement Cell Contract
globalRegistry.register({
  cellDomain: 'customer',
  cellName: 'engagement',
  version: 'v1',
  operations: {
    'track-interaction': {
      requestSchema: TrackEngagementRequestSchema,
      responseSchema: TrackEngagementResponseSchema,
      description: 'Track customer engagement interactions and calculate scores'
    }
  }
});

// Wholesale Pricing Tiers Cell Contract
globalRegistry.register({
  cellDomain: 'ecommerce',
  cellName: 'wholesale-pricing',
  version: 'v1',
  operations: {
    'calculate-price': {
      requestSchema: WholesalePriceRequestSchema,
      responseSchema: WholesalePriceResponseSchema,
      description: 'Calculate wholesale pricing with quantity tiers and territory adjustments'
    },
    'health': {
      requestSchema: z.object({}),
      responseSchema: CellHealthResponseSchema,
      description: 'Health check for wholesale pricing cell'
    }
  }
});

// Tax and Fee Cell Contract
globalRegistry.register({
  cellDomain: 'inventory',
  cellName: 'tax-and-fee',
  version: 'v1',
  operations: {
    'calculate-tax': {
      requestSchema: z.object({
        amount: z.number().min(0),
        taxType: z.enum(['vat', 'sales_tax', 'import_duty', 'service_tax']).default('vat'),
        territory: z.string().default('lagos'),
        customerType: z.enum(['individual', 'business', 'government']).default('individual'),
        productCategory: z.string().optional()
      }),
      responseSchema: CellResponseSchema(z.object({
        baseAmount: z.number(),
        taxAmount: z.number(),
        taxRate: z.number(),
        taxType: z.string(),
        territory: z.string(),
        totalWithTax: z.number(),
        currency: z.string(),
        appliedRules: z.array(z.string()),
        breakdown: z.object({
          baseAmount: z.number(),
          vat: z.number(),
          salesTax: z.number(),
          otherFees: z.number()
        })
      })),
      description: 'Calculate taxes and fees for transactions with Nigerian compliance'
    }
  }
});

// Inventory Tracking Cell Contract
globalRegistry.register({
  cellDomain: 'inventory',
  cellName: 'tracking',
  version: 'v1',
  operations: {
    'check-stock': {
      requestSchema: z.object({
        productId: z.string().uuid(),
        locationId: z.string().uuid().optional(),
        quantity: z.number().int().min(1).default(1),
        reservationId: z.string().uuid().optional()
      }),
      responseSchema: CellResponseSchema(z.object({
        productId: z.string().uuid(),
        availableQuantity: z.number().int().min(0),
        reservedQuantity: z.number().int().min(0),
        inTransitQuantity: z.number().int().min(0),
        totalQuantity: z.number().int().min(0),
        canFulfill: z.boolean(),
        locationId: z.string().uuid().optional(),
        lastUpdated: z.string().datetime(),
        status: z.enum(['available', 'low_stock', 'out_of_stock', 'discontinued'])
      })),
      description: 'Check stock availability and reservation status for products'
    }
  }
});

// Product Catalog Cell Contract
globalRegistry.register({
  cellDomain: 'inventory',
  cellName: 'catalog',
  version: 'v1',
  operations: {
    'get-product': {
      requestSchema: z.object({
        productId: z.string().uuid().optional(),
        sku: z.string().optional(),
        includePricing: z.boolean().default(false),
        includeInventory: z.boolean().default(false),
        includeVariants: z.boolean().default(false)
      }).refine(
        (data) => data.productId || data.sku,
        { message: "Either productId or sku must be provided" }
      ),
      responseSchema: CellResponseSchema(z.object({
        id: z.string().uuid(),
        sku: z.string(),
        name: z.string(),
        description: z.string(),
        category: z.string(),
        status: z.enum(['active', 'inactive', 'discontinued']),
        basePrice: z.number().min(0).optional(),
        currency: z.string().length(3),
        images: z.array(z.string().url()),
        attributes: z.record(z.any()),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
      })),
      description: 'Retrieve product information from catalog with optional pricing and inventory'
    }
  }
});

// Sales Engine Cell Contract
globalRegistry.register({
  cellDomain: 'sales',
  cellName: 'engine',
  version: 'v1',
  operations: {
    'process-transaction': {
      requestSchema: z.object({
        customerId: z.string().uuid(),
        items: z.array(z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().min(1),
          unitPrice: z.number().min(0),
          discount: z.number().min(0).default(0)
        })),
        paymentMethod: z.enum(['cash', 'card', 'transfer', 'pos', 'mobile_money']),
        currency: z.string().length(3).default('NGN'),
        locationId: z.string().uuid().optional(),
        salesRepId: z.string().uuid().optional(),
        notes: z.string().optional()
      }),
      responseSchema: CellResponseSchema(z.object({
        transactionId: z.string().uuid(),
        customerId: z.string().uuid(),
        subtotal: z.number().min(0),
        taxAmount: z.number().min(0),
        discountAmount: z.number().min(0),
        totalAmount: z.number().min(0),
        currency: z.string().length(3),
        status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
        paymentMethod: z.string(),
        receiptNumber: z.string(),
        processedAt: z.string().datetime(),
        items: z.array(z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().min(1),
          unitPrice: z.number().min(0),
          discount: z.number().min(0),
          lineTotal: z.number().min(0)
        }))
      })),
      description: 'Process sales transaction with payment, inventory, and receipt generation'
    }
  }
});

export function getGlobalContractRegistry(): ContractRegistry {
  return globalRegistry;
}

// =============================================================================
// GOLDEN TESTS SUPPORT
// =============================================================================

export interface GoldenTest {
  contractKey: string;
  operation: string;
  testCases: Array<{
    name: string;
    request: any;
    expectedResponse: any;
    shouldPass: boolean;
    description?: string;
  }>;
}

export function generateGoldenTests(): GoldenTest[] {
  const goldenTests: GoldenTest[] = [];

  // Customer Profile Golden Tests
  goldenTests.push({
    contractKey: 'customer/profile/v1',
    operation: 'get-customer',
    testCases: [
      {
        name: 'valid_customer_request',
        request: {
          customerId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          includeAddresses: false,
          includeContacts: false,
          includeStats: false
        },
        expectedResponse: {
          version: 'v1',
          requestId: 'test-request-id',
          success: true,
          data: {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            tenantId: 'tenant-123',
            customerCode: 'CUST-001',
            firstName: 'John',
            lastName: 'Doe',
            primaryPhone: '+2348012345678',
            customerType: 'individual',
            status: 'active',
            tier: 'bronze',
            preferredLanguage: 'en',
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z'
          },
          meta: {
            tenantId: 'tenant-123',
            requestId: 'test-request-id'
          }
        },
        shouldPass: true,
        description: 'Valid customer profile request should pass validation'
      }
    ]
  });

  return goldenTests;
}

// =============================================================================
// CONTRACT DRIFT DETECTION
// =============================================================================

export function detectContractDrift(
  currentContracts: ContractRegistry,
  previousContracts: Record<string, any>
): Array<{ type: 'BREAKING' | 'NON_BREAKING'; change: string; impact: string }> {
  const changes: Array<{ type: 'BREAKING' | 'NON_BREAKING'; change: string; impact: string }> = [];

  // This would compare current vs previous contracts and detect changes
  // Implementation would analyze schema differences, new/removed fields, etc.
  
  return changes;
}