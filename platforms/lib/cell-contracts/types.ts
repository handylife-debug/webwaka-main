/**
 * WebWaka Biological Cell System - API Contracts v1
 * Standardized interfaces for cellular independence
 */

import { z } from 'zod';

// =============================================================================
// STANDARD CELL RESPONSE ENVELOPE
// =============================================================================

export const CellErrorSchema = z.object({
  code: z.enum([
    'VALIDATION_ERROR',
    'NOT_FOUND', 
    'CONFLICT',
    'UNAUTHORIZED',
    'RATE_LIMITED',
    'DEPENDENCY_UNAVAILABLE',
    'INTERNAL_ERROR'
  ]),
  message: z.string(),
  details: z.record(z.any()).optional()
});

export const CellMetaSchema = z.object({
  tenantId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    hasMore: z.boolean()
  }).optional()
});

export const CellResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  version: z.literal('v1'),
  requestId: z.string().uuid(),
  success: z.boolean(),
  data: dataSchema.optional(),
  error: CellErrorSchema.optional(),
  meta: CellMetaSchema
}).refine(
  (response) => response.success ? !!response.data : !!response.error,
  { message: "Success responses must have data, error responses must have error" }
);

export type CellError = z.infer<typeof CellErrorSchema>;
export type CellMeta = z.infer<typeof CellMetaSchema>;
export type CellResponse<T> = {
  version: 'v1';
  requestId: string;
  success: boolean;
  data?: T;
  error?: CellError;
  meta: CellMeta;
};

// =============================================================================
// CUSTOMER PROFILE CELL CONTRACTS
// =============================================================================

export const CustomerBasicSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  primaryPhone: z.string(),
  customerType: z.enum(['individual', 'business', 'corporate', 'government']),
  status: z.enum(['active', 'inactive', 'suspended', 'archived']),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  preferredLanguage: z.enum(['en', 'ha', 'yo', 'ig']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const GetCustomerRequestSchema = z.object({
  customerId: z.string().uuid(),
  includeAddresses: z.boolean().default(false),
  includeContacts: z.boolean().default(false),
  includeStats: z.boolean().default(false)
});

export const GetCustomerResponseSchema = CellResponseSchema(CustomerBasicSchema);

export type CustomerBasic = z.infer<typeof CustomerBasicSchema>;
export type GetCustomerRequest = z.infer<typeof GetCustomerRequestSchema>;
export type GetCustomerResponse = z.infer<typeof GetCustomerResponseSchema>;

// =============================================================================
// B2B ACCESS CONTROL CELL CONTRACTS  
// =============================================================================

export const B2BAccessCheckRequestSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['view_price', 'request_quote', 'place_order', 'view_analytics']),
  resource: z.string().optional(),
  context: z.record(z.any()).optional()
});

export const B2BAccessResultSchema = z.object({
  hasAccess: z.boolean(),
  userGroup: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  restrictions: z.array(z.string()).default([]),
  reason: z.string().optional()
});

export const B2BAccessCheckResponseSchema = CellResponseSchema(B2BAccessResultSchema);

export type B2BAccessCheckRequest = z.infer<typeof B2BAccessCheckRequestSchema>;
export type B2BAccessResult = z.infer<typeof B2BAccessResultSchema>;
export type B2BAccessCheckResponse = z.infer<typeof B2BAccessCheckResponseSchema>;

// =============================================================================
// CUSTOMER ENGAGEMENT CELL CONTRACTS
// =============================================================================

export const EngagementInteractionSchema = z.object({
  interactionType: z.string(),
  description: z.string(),
  metadata: z.record(z.any()).optional(),
  outcome: z.enum(['positive', 'neutral', 'negative']).optional(),
  value: z.number().optional()
});

export const TrackEngagementRequestSchema = z.object({
  customerId: z.string().uuid(),
  interaction: EngagementInteractionSchema
});

export const TrackEngagementResultSchema = z.object({
  interactionId: z.string().uuid(),
  engagementScore: z.number().min(0).max(100),
  customerTier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  recommendedActions: z.array(z.string()).default([])
});

export const TrackEngagementResponseSchema = CellResponseSchema(TrackEngagementResultSchema);

export type EngagementInteraction = z.infer<typeof EngagementInteractionSchema>;
export type TrackEngagementRequest = z.infer<typeof TrackEngagementRequestSchema>;
export type TrackEngagementResult = z.infer<typeof TrackEngagementResultSchema>;
export type TrackEngagementResponse = z.infer<typeof TrackEngagementResponseSchema>;

// =============================================================================
// WHOLESALE PRICING TIERS CELL CONTRACTS
// =============================================================================

export const WholesalePriceRequestSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
  userId: z.string().uuid(),
  territory: z.string().optional(),
  currency: z.string().length(3).default('NGN')
});

export const WholesalePriceResultSchema = z.object({
  productId: z.string().uuid(),
  basePrice: z.number().min(0),
  wholesalePrice: z.number().min(0),
  discountApplied: z.number().min(0),
  tier: z.string().optional(),
  territory: z.string().optional(),
  paymentTermsDiscount: z.number().min(0).max(0.5).optional(),
  taxAmount: z.number().min(0),
  finalPrice: z.number().min(0),
  currency: z.string().length(3),
  validUntil: z.string().datetime().optional()
});

export const WholesalePriceResponseSchema = CellResponseSchema(WholesalePriceResultSchema);

export type WholesalePriceRequest = z.infer<typeof WholesalePriceRequestSchema>;
export type WholesalePriceResult = z.infer<typeof WholesalePriceResultSchema>;
export type WholesalePriceResponse = z.infer<typeof WholesalePriceResponseSchema>;

// =============================================================================
// CELL HEALTH & CAPABILITIES
// =============================================================================

export const CellHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  dependencies: z.array(z.object({
    name: z.string(),
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    responseTime: z.number().optional()
  })),
  lastChecked: z.string().datetime()
});

export const CellCapabilitiesSchema = z.object({
  operations: z.array(z.string()),
  supportedVersions: z.array(z.string()),
  features: z.array(z.string()),
  rateLimit: z.object({
    requests: z.number(),
    window: z.string()
  }).optional()
});

export const CellHealthResponseSchema = CellResponseSchema(CellHealthSchema);
export const CellCapabilitiesResponseSchema = CellResponseSchema(CellCapabilitiesSchema);

export type CellHealth = z.infer<typeof CellHealthSchema>;
export type CellCapabilities = z.infer<typeof CellCapabilitiesSchema>;
export type CellHealthResponse = z.infer<typeof CellHealthResponseSchema>;
export type CellCapabilitiesResponse = z.infer<typeof CellCapabilitiesResponseSchema>;

// =============================================================================
// CELL EVENT SCHEMAS (for Event-Driven Communication)
// =============================================================================

export const CellEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  version: z.literal('v1'),
  source: z.object({
    cell: z.string(),
    tenantId: z.string().uuid()
  }),
  data: z.record(z.any()),
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional()
});

export type CellEvent = z.infer<typeof CellEventSchema>;

// Common Event Types
export const CELL_EVENTS = {
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated', 
  QUOTE_REQUESTED: 'quote.requested',
  QUOTE_OFFERED: 'quote.offered',
  QUOTE_ACCEPTED: 'quote.accepted',
  QUOTE_REJECTED: 'quote.rejected',
  ENGAGEMENT_TRACKED: 'engagement.tracked',
  PRICING_CALCULATED: 'pricing.calculated'
} as const;