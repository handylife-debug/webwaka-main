/**
 * WebWaka Cell Contracts - Complete Schema Definitions
 * Extended contracts for all remaining cells in the system
 */

import { z } from 'zod';
import { CellResponseSchema } from './types.js';

// =============================================================================
// AUTHENTICATION & JWT CELLS
// =============================================================================

export const AuthenticationRequestSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().optional(),
  password: z.string().min(8),
  strategy: z.enum(['email', 'username', 'social']).default('email'),
  twoFactorCode: z.string().optional(),
  rememberMe: z.boolean().default(false)
}).refine(
  (data) => data.email || data.username,
  { message: "Either email or username must be provided" }
);

export const AuthenticationResultSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email().optional(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.enum(['SuperAdmin', 'Admin', 'User']),
    twoFactorEnabled: z.boolean()
  }).optional(),
  requiresTwoFactor: z.boolean(),
  reason: z.string().optional()
});

export const JWTValidationRequestSchema = z.object({
  token: z.string(),
  operation: z.enum(['validate', 'refresh', 'revoke']),
  includeUserData: z.boolean().default(false)
});

export const JWTValidationResultSchema = z.object({
  isValid: z.boolean(),
  expired: z.boolean(),
  payload: z.record(z.any()).optional(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(['SuperAdmin', 'Admin', 'User']),
    tenantId: z.string().uuid()
  }).optional(),
  newToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().optional()
});

export const SocialLoginRequestSchema = z.object({
  provider: z.enum(['google', 'github', 'linkedin']),
  code: z.string(),
  redirectUri: z.string().url(),
  state: z.string().optional()
});

export const SocialLoginResultSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  refreshToken: z.string().optional(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().url().optional(),
    provider: z.string(),
    providerUserId: z.string()
  }).optional(),
  isNewUser: z.boolean(),
  reason: z.string().optional()
});

// =============================================================================
// PAYMENT PROCESSING CELLS
// =============================================================================

export const PaymentGatewayRequestSchema = z.object({
  amount: z.number().min(0),
  currency: z.string().length(3).default('NGN'),
  paymentMethod: z.enum(['card', 'bank_transfer', 'ussd', 'mobile_money', 'qr_code']),
  provider: z.enum(['paystack', 'flutterwave', 'interswitch']),
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
  callbackUrl: z.string().url().optional(),
  reference: z.string().optional()
});

export const PaymentGatewayResultSchema = z.object({
  success: z.boolean(),
  transactionId: z.string(),
  reference: z.string(),
  status: z.enum(['pending', 'processing', 'successful', 'failed', 'cancelled']),
  amount: z.number(),
  currency: z.string(),
  paymentMethod: z.string(),
  provider: z.string(),
  providerReference: z.string().optional(),
  authorizationUrl: z.string().url().optional(),
  accessCode: z.string().optional(),
  fees: z.object({
    providerFee: z.number(),
    applicationFee: z.number(),
    totalFee: z.number()
  }).optional(),
  customer: z.object({
    id: z.string().uuid(),
    email: z.string().email()
  }),
  paidAt: z.string().datetime().optional(),
  failureReason: z.string().optional()
});

export const SplitPaymentRequestSchema = z.object({
  totalAmount: z.number().min(0),
  currency: z.string().length(3).default('NGN'),
  splits: z.array(z.object({
    recipientId: z.string().uuid(),
    accountCode: z.string(),
    amount: z.number().min(0),
    percentage: z.number().min(0).max(100).optional(),
    description: z.string().optional()
  })),
  paymentMethod: z.enum(['card', 'bank_transfer', 'ussd']),
  customerId: z.string().uuid(),
  metadata: z.record(z.any()).optional()
});

export const SplitPaymentResultSchema = z.object({
  success: z.boolean(),
  transactionId: z.string(),
  totalAmount: z.number(),
  splits: z.array(z.object({
    recipientId: z.string().uuid(),
    amount: z.number(),
    status: z.enum(['pending', 'successful', 'failed']),
    reference: z.string(),
    transferCode: z.string().optional()
  })),
  status: z.enum(['pending', 'processing', 'successful', 'partial', 'failed']),
  processedAt: z.string().datetime().optional(),
  failureReason: z.string().optional()
});

// =============================================================================
// LOCATION & MULTI-STORE CELLS
// =============================================================================

export const MultiLocationRequestSchema = z.object({
  operation: z.enum(['list_locations', 'get_location', 'inventory_transfer', 'sales_report']),
  locationId: z.string().uuid().optional(),
  includeInventory: z.boolean().default(false),
  includeStaff: z.boolean().default(false),
  dateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }).optional()
});

export const LocationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  type: z.enum(['store', 'warehouse', 'office', 'popup']),
  status: z.enum(['active', 'inactive', 'maintenance']),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    country: z.string().default('Nigeria'),
    postalCode: z.string().optional()
  }),
  contact: z.object({
    phone: z.string(),
    email: z.string().email().optional(),
    manager: z.string().optional()
  }),
  settings: z.object({
    timezone: z.string().default('Africa/Lagos'),
    currency: z.string().default('NGN'),
    taxRate: z.number().default(7.5),
    allowNegativeInventory: z.boolean().default(false)
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const MultiLocationResultSchema = z.object({
  locations: z.array(LocationSchema),
  inventoryTransfers: z.array(z.object({
    id: z.string().uuid(),
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
    status: z.enum(['pending', 'in_transit', 'completed', 'cancelled']),
    transferredAt: z.string().datetime().optional()
  })).optional(),
  salesReports: z.array(z.object({
    locationId: z.string().uuid(),
    locationName: z.string(),
    totalSales: z.number(),
    totalOrders: z.number().int(),
    averageOrderValue: z.number(),
    currency: z.string(),
    period: z.string()
  })).optional()
});

// =============================================================================
// SPECIALIZED BUSINESS CELLS
// =============================================================================

export const RepairJobRequestSchema = z.object({
  operation: z.enum(['create_job', 'update_status', 'add_parts', 'generate_quote']),
  jobId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  deviceInfo: z.object({
    type: z.enum(['smartphone', 'laptop', 'tablet', 'desktop', 'accessory']),
    brand: z.string(),
    model: z.string(),
    serialNumber: z.string().optional(),
    issueDescription: z.string()
  }).optional(),
  partsRequired: z.array(z.object({
    partId: z.string().uuid(),
    quantity: z.number().int().min(1),
    cost: z.number().min(0)
  })).optional(),
  laborHours: z.number().min(0).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium')
});

export const RepairJobResultSchema = z.object({
  jobId: z.string().uuid(),
  jobNumber: z.string(),
  customerId: z.string().uuid(),
  status: z.enum(['received', 'diagnosed', 'quoted', 'approved', 'in_progress', 'testing', 'completed', 'picked_up']),
  deviceInfo: z.object({
    type: z.string(),
    brand: z.string(),
    model: z.string(),
    serialNumber: z.string().optional(),
    issueDescription: z.string(),
    diagnosis: z.string().optional()
  }),
  quote: z.object({
    partsTotal: z.number(),
    laborTotal: z.number(),
    taxAmount: z.number(),
    totalAmount: z.number(),
    currency: z.string(),
    validUntil: z.string().datetime()
  }).optional(),
  timeline: z.object({
    estimatedCompletion: z.string().datetime().optional(),
    actualCompletion: z.string().datetime().optional()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const RestaurantOrderRequestSchema = z.object({
  operation: z.enum(['place_order', 'update_status', 'kitchen_display', 'table_management']),
  orderId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
    modifications: z.array(z.string()).optional(),
    specialInstructions: z.string().optional()
  })).optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery']).default('dine_in'),
  priority: z.enum(['normal', 'rush', 'vip']).default('normal')
});

export const RestaurantOrderResultSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  tableId: z.string().uuid().optional(),
  tableName: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled']),
  items: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    quantity: z.number().int(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    modifications: z.array(z.string()),
    kitchenStatus: z.enum(['pending', 'preparing', 'ready', 'served']),
    estimatedTime: z.number().int().optional() // minutes
  })),
  orderType: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  placedAt: z.string().datetime(),
  estimatedReadyTime: z.string().datetime().optional(),
  actualReadyTime: z.string().datetime().optional()
});

// =============================================================================
// TRANSACTION & SALES HISTORY
// =============================================================================

export const TransactionHistoryRequestSchema = z.object({
  operation: z.enum(['list_transactions', 'get_transaction', 'sales_report', 'export_data']),
  transactionId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  dateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }).optional(),
  filters: z.object({
    paymentMethod: z.array(z.string()).optional(),
    status: z.array(z.enum(['pending', 'completed', 'failed', 'refunded'])).optional(),
    minAmount: z.number().min(0).optional(),
    maxAmount: z.number().min(0).optional()
  }).optional(),
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20)
  }).optional()
});

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  transactionNumber: z.string(),
  customerId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    discount: z.number().min(0).default(0),
    lineTotal: z.number().min(0)
  })),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  totalAmount: z.number().min(0),
  currency: z.string().length(3),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'pos', 'mobile_money']),
  paymentReference: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  salesRepId: z.string().uuid().optional(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  refundedAt: z.string().datetime().optional()
});

export const TransactionHistoryResultSchema = z.object({
  transactions: z.array(TransactionSchema),
  summary: z.object({
    totalTransactions: z.number().int(),
    totalAmount: z.number(),
    averageTransactionValue: z.number(),
    currency: z.string(),
    period: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime()
    })
  }),
  pagination: z.object({
    currentPage: z.number().int(),
    totalPages: z.number().int(),
    totalRecords: z.number().int(),
    hasMore: z.boolean()
  }).optional()
});

// =============================================================================
// RESPONSE SCHEMAS
// =============================================================================

export const AuthenticationResponseSchema = CellResponseSchema(AuthenticationResultSchema);
export const JWTValidationResponseSchema = CellResponseSchema(JWTValidationResultSchema);
export const SocialLoginResponseSchema = CellResponseSchema(SocialLoginResultSchema);
export const PaymentGatewayResponseSchema = CellResponseSchema(PaymentGatewayResultSchema);
export const SplitPaymentResponseSchema = CellResponseSchema(SplitPaymentResultSchema);
export const MultiLocationResponseSchema = CellResponseSchema(MultiLocationResultSchema);
export const RepairJobResponseSchema = CellResponseSchema(RepairJobResultSchema);
export const RestaurantOrderResponseSchema = CellResponseSchema(RestaurantOrderResultSchema);
export const TransactionHistoryResponseSchema = CellResponseSchema(TransactionHistoryResultSchema);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type AuthenticationRequest = z.infer<typeof AuthenticationRequestSchema>;
export type AuthenticationResult = z.infer<typeof AuthenticationResultSchema>;
export type JWTValidationRequest = z.infer<typeof JWTValidationRequestSchema>;
export type JWTValidationResult = z.infer<typeof JWTValidationResultSchema>;
export type SocialLoginRequest = z.infer<typeof SocialLoginRequestSchema>;
export type SocialLoginResult = z.infer<typeof SocialLoginResultSchema>;
export type PaymentGatewayRequest = z.infer<typeof PaymentGatewayRequestSchema>;
export type PaymentGatewayResult = z.infer<typeof PaymentGatewayResultSchema>;
export type SplitPaymentRequest = z.infer<typeof SplitPaymentRequestSchema>;
export type SplitPaymentResult = z.infer<typeof SplitPaymentResultSchema>;
export type MultiLocationRequest = z.infer<typeof MultiLocationRequestSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type MultiLocationResult = z.infer<typeof MultiLocationResultSchema>;
export type RepairJobRequest = z.infer<typeof RepairJobRequestSchema>;
export type RepairJobResult = z.infer<typeof RepairJobResultSchema>;
export type RestaurantOrderRequest = z.infer<typeof RestaurantOrderRequestSchema>;
export type RestaurantOrderResult = z.infer<typeof RestaurantOrderResultSchema>;
export type TransactionHistoryRequest = z.infer<typeof TransactionHistoryRequestSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionHistoryResult = z.infer<typeof TransactionHistoryResultSchema>;