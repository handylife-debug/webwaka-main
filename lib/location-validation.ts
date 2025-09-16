import { z } from 'zod';

/**
 * Zod validation schemas for Multi-Location Management API routes
 * Provides comprehensive input validation and type safety
 */

// Base schema for IDs that must be valid UUIDs
const uuidSchema = z.string().uuid('Invalid UUID format');

// Transfer request creation schema
export const transferRequestSchema = z.object({
  fromLocationId: uuidSchema.describe('Source location ID'),
  toLocationId: uuidSchema.describe('Destination location ID'),
  productId: uuidSchema.describe('Product ID to transfer'),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(10000, 'Quantity cannot exceed 10,000'),
  reason: z.enum([
    'stockout', 
    'rebalancing', 
    'seasonal', 
    'promotion', 
    'audit', 
    'customer_request'
  ]).default('rebalancing').describe('Reason for transfer'),
  priority: z.enum(['urgent', 'high', 'medium', 'low'])
    .default('medium').describe('Priority level'),
  requestedBy: uuidSchema.describe('User ID of requester'),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional()
});

// Transfer approval schema
export const transferApprovalSchema = z.object({
  transferId: uuidSchema.describe('Transfer request ID'),
  action: z.enum(['approve', 'reject']).describe('Approval action'),
  approvedBy: uuidSchema.describe('User ID of approver'),
  approvedQuantity: z.number()
    .int('Approved quantity must be a whole number')
    .min(1, 'Approved quantity must be at least 1')
    .max(10000, 'Approved quantity cannot exceed 10,000')
    .optional().describe('Quantity approved (if different from requested)'),
  rejectionReason: z.string()
    .min(10, 'Rejection reason must be at least 10 characters')
    .max(500, 'Rejection reason cannot exceed 500 characters')
    .optional().describe('Reason for rejection')
}).refine(
  (data) => {
    // If action is 'reject', rejectionReason is required
    if (data.action === 'reject' && !data.rejectionReason) {
      return false;
    }
    // If action is 'approve', approvedQuantity can be optional
    return true;
  },
  {
    message: 'Rejection reason is required when rejecting a transfer',
    path: ['rejectionReason']
  }
);

// Stock audit creation schema
export const stockAuditSchema = z.object({
  auditType: z.enum(['full', 'partial', 'cycle']).describe('Type of audit'),
  locationIds: z.array(uuidSchema)
    .min(1, 'At least one location must be specified')
    .max(50, 'Cannot audit more than 50 locations at once')
    .describe('Array of location IDs to audit'),
  productCategories: z.array(z.string())
    .max(20, 'Cannot specify more than 20 categories')
    .optional()
    .describe('Optional product categories to include'),
  createdBy: uuidSchema.describe('User ID of audit creator'),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional()
});

// Query parameter validation schemas
export const locationQuerySchema = z.object({
  locationId: uuidSchema.optional().describe('Optional specific location ID'),
  status: z.enum(['pending', 'approved', 'in_transit', 'completed', 'cancelled', 'rejected'])
    .optional().describe('Optional status filter'),
  timeRange: z.enum(['7d', '30d', '90d', '180d', '1y'])
    .default('30d').describe('Time range for analysis'),
  productFilter: z.string()
    .max(100, 'Product filter cannot exceed 100 characters')
    .optional().describe('Optional product name/SKU filter')
});

// Rate limiting configuration per endpoint
export const RATE_LIMITS = {
  // Read operations - more lenient
  GET_OVERVIEW: { requests: 100, window: '15m' },
  GET_DISTRIBUTION: { requests: 100, window: '15m' },
  GET_TRANSFERS: { requests: 100, window: '15m' },
  GET_PERFORMANCE: { requests: 50, window: '15m' },
  GET_OPTIMIZATION: { requests: 30, window: '15m' },
  
  // Write operations - more restrictive  
  CREATE_TRANSFER: { requests: 20, window: '15m' },
  APPROVE_TRANSFER: { requests: 30, window: '15m' },
  CREATE_AUDIT: { requests: 10, window: '15m' }
} as const;

// Error response schemas for consistent error handling
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string(),
  details: z.record(z.any()).optional()
});

export const successResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  message: z.string().optional()
});

// Type exports for TypeScript usage
export type TransferRequestInput = z.infer<typeof transferRequestSchema>;
export type TransferApprovalInput = z.infer<typeof transferApprovalSchema>;
export type StockAuditInput = z.infer<typeof stockAuditSchema>;
export type LocationQueryParams = z.infer<typeof locationQuerySchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;

/**
 * Helper function to validate and parse request body with proper error handling
 */
export function validateRequestBody<T>(
  schema: z.ZodSchema<T>, 
  body: unknown,
  endpoint: string
): { success: true; data: T } | { success: false; error: ErrorResponse } {
  try {
    const validatedData = schema.parse(body);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.errors.reduce((acc, err) => {
        const path = err.path.join('.');
        acc[path] = err.message;
        return acc;
      }, {} as Record<string, string>);

      return {
        success: false,
        error: {
          success: false,
          error: `Invalid request data for ${endpoint}`,
          code: 'VALIDATION_ERROR',
          details: errorDetails
        }
      };
    }

    return {
      success: false,
      error: {
        success: false,
        error: 'Request validation failed',
        code: 'PARSING_ERROR'
      }
    };
  }
}

/**
 * Helper function to validate query parameters
 */
export function validateQueryParams(
  searchParams: URLSearchParams,
  endpoint: string
): { success: true; data: LocationQueryParams } | { success: false; error: ErrorResponse } {
  try {
    const params = Object.fromEntries(searchParams.entries());
    const validatedParams = locationQuerySchema.parse(params);
    return { success: true, data: validatedParams };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.errors.reduce((acc, err) => {
        const path = err.path.join('.');
        acc[path] = err.message;
        return acc;
      }, {} as Record<string, string>);

      return {
        success: false,
        error: {
          success: false,
          error: `Invalid query parameters for ${endpoint}`,
          code: 'QUERY_VALIDATION_ERROR',
          details: errorDetails
        }
      };
    }

    return {
      success: false,
      error: {
        success: false,
        error: 'Query parameter validation failed',
        code: 'QUERY_PARSING_ERROR'
      }
    };
  }
}