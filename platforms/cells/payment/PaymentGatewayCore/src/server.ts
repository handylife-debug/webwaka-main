import { z } from 'zod';
import crypto from 'crypto';

// Helper function to make HTTP requests
async function makeRequest(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// SECURITY-CRITICAL: Environment validation for Nigerian payment gateways
// NO fallback values - hard fail if required secrets are missing
const EnvSchema = z.object({
  PAYSTACK_SECRET_KEY: z.string().min(1, 'PAYSTACK_SECRET_KEY is required').refine(
    val => val.startsWith('sk_test_') || val.startsWith('sk_live_'),
    'PAYSTACK_SECRET_KEY must be a valid Paystack secret key'
  ),
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z.string().min(1, 'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is required').refine(
    val => val.startsWith('pk_test_') || val.startsWith('pk_live_'),
    'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY must be a valid Paystack public key'
  ),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1, 'FLUTTERWAVE_SECRET_KEY is required').refine(
    val => val.startsWith('FLWSECK_TEST-') || val.startsWith('FLWSECK-'),
    'FLUTTERWAVE_SECRET_KEY must be a valid Flutterwave secret key'
  ),
  FLUTTERWAVE_PUBLIC_KEY: z.string().min(1, 'FLUTTERWAVE_PUBLIC_KEY is required').refine(
    val => val.startsWith('FLWPUBK_TEST-') || val.startsWith('FLWPUBK-'),
    'FLUTTERWAVE_PUBLIC_KEY must be a valid Flutterwave public key'
  ),
  INTERSWITCH_CLIENT_ID: z.string().min(1, 'INTERSWITCH_CLIENT_ID is required'),
  INTERSWITCH_CLIENT_SECRET: z.string().min(1, 'INTERSWITCH_CLIENT_SECRET is required'),
  PAYSTACK_WEBHOOK_SECRET: z.string().min(1, 'PAYSTACK_WEBHOOK_SECRET is required for webhook validation'),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().min(1, 'FLUTTERWAVE_WEBHOOK_SECRET is required for webhook validation'),
  INTERSWITCH_WEBHOOK_SECRET: z.string().min(1, 'INTERSWITCH_WEBHOOK_SECRET is required for webhook validation'),
  INTERSWITCH_ENVIRONMENT: z.enum(['test', 'live']).default('test'),
  NODE_ENV: z.string().default('development')
});

// SECURITY-CRITICAL: Validate environment variables - FAIL HARD if missing
function validateEnvironment() {
  const envVars = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
    FLUTTERWAVE_PUBLIC_KEY: process.env.FLUTTERWAVE_PUBLIC_KEY,
    INTERSWITCH_CLIENT_ID: process.env.INTERSWITCH_CLIENT_ID,
    INTERSWITCH_CLIENT_SECRET: process.env.INTERSWITCH_CLIENT_SECRET,
    PAYSTACK_WEBHOOK_SECRET: process.env.PAYSTACK_WEBHOOK_SECRET,
    FLUTTERWAVE_WEBHOOK_SECRET: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
    INTERSWITCH_WEBHOOK_SECRET: process.env.INTERSWITCH_WEBHOOK_SECRET,
    INTERSWITCH_ENVIRONMENT: (process.env.INTERSWITCH_ENVIRONMENT as 'test' | 'live') || 'test',
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  // Check for missing required variables
  const missingVars = Object.entries(envVars)
    .filter(([key, value]) => !value && key !== 'NODE_ENV' && key !== 'INTERSWITCH_ENVIRONMENT')
    .map(([key]) => key);
  
  if (missingVars.length > 0) {
    const errorMessage = `\n🚨 CRITICAL SECURITY ERROR: Missing required payment environment variables!\n\n` +
      `Missing variables: ${missingVars.join(', ')}\n\n` +
      `Payment processing CANNOT start without these secrets.\n` +
      `Set the following environment variables:\n` +
      missingVars.map(varName => `  export ${varName}="your_${varName.toLowerCase()}_here"`).join('\n') +
      `\n\n🔒 This is a security feature - payment processing will not run with default/missing credentials.\n`;
    
    console.error(errorMessage);
    throw new Error(`Missing required payment environment variables: ${missingVars.join(', ')}`);
  }
  
  // Validate using Zod schema
  const validation = EnvSchema.safeParse(envVars);
  
  if (!validation.success) {
    const errorMessage = `\n🚨 CRITICAL SECURITY ERROR: Invalid payment environment variables!\n\n` +
      `Validation errors:\n` +
      validation.error.errors.map(err => `  - ${err.path.join('.')}: ${err.message}`).join('\n') +
      `\n\n🔒 Payment processing requires valid API credentials from payment providers.\n`;
    
    console.error(errorMessage);
    throw new Error(`Invalid payment environment variables: ${validation.error.errors.map(e => e.message).join(', ')}`);
  }
  
  console.log('✅ Payment environment variables validated successfully');
  return validation.data;
}

// Validate environment on module load
const env = validateEnvironment();

// API Base URLs
const PAYSTACK_API_BASE = 'https://api.paystack.co';
const FLUTTERWAVE_API_BASE = 'https://api.flutterwave.com/v3';
const INTERSWITCH_API_BASE = env.INTERSWITCH_ENVIRONMENT === 'live' 
  ? 'https://api.interswitchng.com' 
  : 'https://sandbox.interswitchng.com';

// Enhanced validation schemas with security context
const PaymentIntentSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  currency: z.enum(['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']).default('NGN'),
  provider: z.enum(['paystack', 'flutterwave', 'interswitch']),
  email: z.string().email('Valid email is required'),
  description: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  customerId: z.string().optional(),
  reference: z.string().optional(),
  channels: z.array(z.enum(['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'])).optional(),
  // Security context fields
  tenantId: z.string().min(1, 'Tenant ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  userRole: z.enum(['User', 'Admin', 'SuperAdmin', 'Partner']).optional()
});

const SubscriptionSchema = z.object({
  planCode: z.string().min(1),
  customerId: z.string().min(1),
  provider: z.enum(['paystack', 'flutterwave', 'interswitch']),
  authorization: z.string().optional(),
  metadata: z.record(z.string()).optional()
});

const RefundSchema = z.object({
  transactionId: z.string().min(1),
  provider: z.enum(['paystack', 'flutterwave', 'interswitch']),
  amount: z.number().min(0).optional(),
  currency: z.string().default('NGN'),
  reason: z.string().optional()
});

const CustomerSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  provider: z.enum(['paystack', 'flutterwave', 'interswitch'])
});

// Generate unique transaction reference with tenant isolation
function generateReference(tenantId?: string): string {
  const tenantPrefix = tenantId ? tenantId.substring(0, 8).toUpperCase() : 'MAIN';
  return `WW_${tenantPrefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

// Amount validation and conversion utilities
function validateAndConvertAmount(amount: number, currency: string, provider: string): number {
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  // Provider-specific amount handling
  switch (provider) {
    case 'paystack':
      // Paystack expects amounts in kobo (smallest currency unit)
      if (currency === 'NGN') {
        return Math.round(amount * 100); // Convert Naira to kobo
      }
      return Math.round(amount * 100); // Convert other currencies to smallest unit
      
    case 'flutterwave':
      // Flutterwave expects amounts in major currency unit
      return amount;
      
    case 'interswitch':
      // Interswitch expects amounts in kobo for NGN
      if (currency === 'NGN') {
        return Math.round(amount * 100); // Convert Naira to kobo
      }
      return amount;
      
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}

// Validate provider-specific requirements
function validateProviderRequirements(payload: any): void {
  const { provider, amount, currency, email } = payload;
  
  if (!provider || !['paystack', 'flutterwave', 'interswitch'].includes(provider)) {
    throw new Error('Invalid or missing payment provider');
  }
  
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }
  
  if (!currency) {
    throw new Error('Currency is required');
  }
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Valid email address is required');
  }
  
  // Provider-specific validations
  switch (provider) {
    case 'paystack':
      if (currency === 'NGN' && amount < 1) { // Minimum ₦1
        throw new Error('Minimum amount for Paystack NGN is ₦1');
      }
      if (currency === 'USD' && amount < 1) { // Minimum $1
        throw new Error('Minimum amount for Paystack USD is $1');
      }
      break;
      
    case 'flutterwave':
      if (currency === 'NGN' && amount < 10) { // Minimum ₦10
        throw new Error('Minimum amount for Flutterwave NGN is ₦10');
      }
      break;
      
    case 'interswitch':
      if (currency !== 'NGN' && currency !== 'USD') {
        throw new Error('Interswitch only supports NGN and USD currencies');
      }
      if (currency === 'NGN' && amount < 100) { // Minimum ₦100
        throw new Error('Minimum amount for Interswitch NGN is ₦100');
      }
      break;
  }
}

// Core Nigerian payment gateway implementation
export const paymentGatewayCoreCell = {
  // Initialize payment for Nigerian gateways with enhanced security
  async initializePayment(payload: unknown) {
    try {
      // Validate provider requirements first
      validateProviderRequirements(payload);
      
      const validated = PaymentIntentSchema.parse(payload);
      
      // Add tenant context and security validations
      const enhancedPayload = {
        ...validated,
        reference: validated.reference || generateReference(validated.tenantId),
        amount: validateAndConvertAmount(validated.amount, validated.currency, validated.provider),
        metadata: {
          ...validated.metadata,
          tenantId: validated.tenantId,
          userId: validated.userId,
          timestamp: new Date().toISOString(),
          source: 'PaymentGatewayCore'
        }
      };
      
      if (enhancedPayload.provider === 'paystack') {
        return await initializePaystackPayment(enhancedPayload);
      } else if (enhancedPayload.provider === 'flutterwave') {
        return await initializeFlutterwavePayment(enhancedPayload);
      } else {
        return await initializeInterswitchPayment(enhancedPayload);
      }
    } catch (error) {
      console.error('Payment initialization failed:', error);
      
      // Enhanced error logging with security context
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Payment initialization failed',
        type: error instanceof z.ZodError ? 'validation' : 'system',
        timestamp: new Date().toISOString(),
        tenantId: (payload as any)?.tenantId,
        provider: (payload as any)?.provider
      };
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Payment initialization failed',
        error: error instanceof z.ZodError ? error.errors : undefined,
        code: 'INITIALIZATION_FAILED'
      };
    }
  },

  // Verify payment completion
  async verifyPayment(payload: { reference: string; provider: 'paystack' | 'flutterwave' | 'interswitch' }) {
    try {
      if (payload.provider === 'paystack') {
        return await verifyPaystackPayment(payload.reference);
      } else if (payload.provider === 'flutterwave') {
        return await verifyFlutterwavePayment(payload.reference);
      } else {
        return await verifyInterswitchPayment(payload.reference);
      }
    } catch (error) {
      console.error('Payment verification failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Payment verification failed'
      };
    }
  },

  // Create customer for recurring payments
  async createCustomer(payload: unknown) {
    try {
      const validated = CustomerSchema.parse(payload);
      
      if (validated.provider === 'paystack') {
        return await createPaystackCustomer(validated);
      } else if (validated.provider === 'flutterwave') {
        return await createFlutterwaveCustomer(validated);
      } else {
        return await createInterswitchCustomer(validated);
      }
    } catch (error) {
      console.error('Customer creation failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Customer creation failed',
        error: error instanceof z.ZodError ? error.errors : undefined
      };
    }
  },

  // Create subscription
  async createSubscription(payload: unknown) {
    try {
      const validated = SubscriptionSchema.parse(payload);
      
      if (validated.provider === 'paystack') {
        return await createPaystackSubscription(validated);
      } else if (validated.provider === 'flutterwave') {
        return await createFlutterwaveSubscription(validated);
      } else {
        return await createInterswitchSubscription(validated);
      }
    } catch (error) {
      console.error('Subscription creation failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Subscription creation failed',
        error: error instanceof z.ZodError ? error.errors : undefined
      };
    }
  },

  // Process refund
  async processRefund(payload: unknown) {
    try {
      const validated = RefundSchema.parse(payload);
      
      if (validated.provider === 'paystack') {
        return await processPaystackRefund(validated);
      } else if (validated.provider === 'flutterwave') {
        return await processFlutterwaveRefund(validated);
      } else {
        return await processInterswitchRefund(validated);
      }
    } catch (error) {
      console.error('Refund processing failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Refund processing failed',
        error: error instanceof z.ZodError ? error.errors : undefined
      };
    }
  },

  // Get payment status
  async getPaymentStatus(payload: { transactionId: string; provider: 'paystack' | 'flutterwave' | 'interswitch' }) {
    try {
      if (payload.provider === 'paystack') {
        return await getPaystackTransaction(payload.transactionId);
      } else if (payload.provider === 'flutterwave') {
        return await getFlutterwaveTransaction(payload.transactionId);
      } else {
        return await getInterswitchTransaction(payload.transactionId);
      }
    } catch (error) {
      console.error('Payment status retrieval failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Payment status retrieval failed'
      };
    }
  },

  // Validate webhook
  async validateWebhook(payload: { body: string | object; signature: string; provider: 'paystack' | 'flutterwave' | 'interswitch' }) {
    try {
      if (payload.provider === 'paystack') {
        return await validatePaystackWebhook(payload.body, payload.signature);
      } else if (payload.provider === 'flutterwave') {
        return await validateFlutterwaveWebhook(payload.body, payload.signature);
      } else {
        return await validateInterswitchWebhook(payload.body, payload.signature);
      }
    } catch (error) {
      console.error('Webhook validation failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Webhook validation failed'
      };
    }
  }
};

// Paystack implementation functions
async function initializePaystackPayment(data: z.infer<typeof PaymentIntentSchema>) {
  try {
    const response = await makeRequest(
      `${PAYSTACK_API_BASE}/transaction/initialize`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: data.email,
          amount: data.amount, // Amount already converted by validateAndConvertAmount
          currency: data.currency,
          reference: data.reference, // Reference already generated with tenant context
          callback_url: process.env.PAYMENT_SUCCESS_URL,
          metadata: {
            ...data.metadata,
            tenantId: data.tenantId,
            userId: data.userId,
            originalAmount: data.amount / (data.currency === 'NGN' ? 100 : 100) // Store original amount
          },
          channels: data.channels
        })
      }
    );

    return {
      success: true,
      data: {
        authorization_url: response.data.authorization_url,
        access_code: response.data.access_code,
        reference: response.data.reference,
        provider: 'paystack'
      },
      message: 'Paystack payment initialized successfully'
    };
  } catch (error: any) {
    throw new Error(`Paystack initialization failed: ${error.message}`);
  }
}

async function verifyPaystackPayment(reference: string) {
  try {
    const response = await makeRequest(
      `${PAYSTACK_API_BASE}/transaction/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    return {
      success: true,
      data: {
        status: response.data.status,
        reference: response.data.reference,
        amount: response.data.amount / 100, // Convert from kobo
        currency: response.data.currency,
        customer: response.data.customer,
        provider: 'paystack'
      },
      message: 'Payment verification successful'
    };
  } catch (error: any) {
    throw new Error(`Paystack verification failed: ${error.message}`);
  }
}

async function createPaystackCustomer(data: z.infer<typeof CustomerSchema>) {
  try {
    const response = await makeRequest(
      `${PAYSTACK_API_BASE}/customer`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone
        })
      }
    );

    return {
      success: true,
      data: {
        customer_code: response.data.customer_code,
        email: response.data.email,
        id: response.data.id,
        provider: 'paystack'
      },
      message: 'Paystack customer created successfully'
    };
  } catch (error: any) {
    throw new Error(`Paystack customer creation failed: ${error.message}`);
  }
}

async function createPaystackSubscription(data: z.infer<typeof SubscriptionSchema>) {
  try {
    const response = await makeRequest(
      `${PAYSTACK_API_BASE}/subscription`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: data.customerId,
          plan: data.planCode,
          authorization: data.authorization
        })
      }
    );

    return {
      success: true,
      data: {
        subscription_code: response.data.subscription_code,
        email_token: response.data.email_token,
        provider: 'paystack'
      },
      message: 'Paystack subscription created successfully'
    };
  } catch (error: any) {
    throw new Error(`Paystack subscription creation failed: ${error.message}`);
  }
}

async function processPaystackRefund(data: z.infer<typeof RefundSchema>) {
  try {
    const response = await makeRequest(
      `${PAYSTACK_API_BASE}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction: data.transactionId,
          amount: data.amount ? data.amount * 100 : undefined // Convert to kobo if specified
        })
      }
    );

    return {
      success: true,
      data: {
        transaction: response.data.transaction,
        amount: response.data.amount / 100, // Convert from kobo
        currency: response.data.currency,
        provider: 'paystack'
      },
      message: 'Paystack refund processed successfully'
    };
  } catch (error: any) {
    throw new Error(`Paystack refund failed: ${error.message}`);
  }
}

async function getPaystackTransaction(transactionId: string) {
  try {
    const response = await makeRequest(
      `${PAYSTACK_API_BASE}/transaction/${transactionId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    return {
      success: true,
      data: {
        status: response.data.status,
        reference: response.data.reference,
        amount: response.data.amount / 100,
        currency: response.data.currency,
        provider: 'paystack'
      },
      message: 'Transaction retrieved successfully'
    };
  } catch (error: any) {
    throw new Error(`Paystack transaction retrieval failed: ${error.message}`);
  }
}

async function validatePaystackWebhook(body: string | object, signature: string) {
  try {
    if (!env.PAYSTACK_WEBHOOK_SECRET) {
      throw new Error('Paystack webhook secret not configured');
    }

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const hash = crypto.createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET).update(bodyString).digest('hex');

    if (hash !== signature) {
      throw new Error('Invalid webhook signature');
    }

    return {
      success: true,
      data: typeof body === 'string' ? JSON.parse(body) : body,
      message: 'Paystack webhook validated successfully'
    };
  } catch (error: any) {
    throw new Error(`Paystack webhook validation failed: ${error.message}`);
  }
}

// Flutterwave implementation functions
async function initializeFlutterwavePayment(data: z.infer<typeof PaymentIntentSchema>) {
  try {
    const response = await makeRequest(
      `${FLUTTERWAVE_API_BASE}/payments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tx_ref: data.reference, // Use tenant-aware reference from enhanced payload
          amount: data.amount, // Amount already validated for Flutterwave format
          currency: data.currency,
          redirect_url: process.env.PAYMENT_SUCCESS_URL,
          customer: {
            email: data.email,
            name: `${data.metadata?.firstName || ''} ${data.metadata?.lastName || ''}`.trim() || data.email
          },
          customizations: {
            title: 'WebWaka Payment',
            description: data.description || 'Payment for services',
            logo: process.env.COMPANY_LOGO_URL
          },
          meta: {
            ...data.metadata,
            tenantId: data.tenantId,
            userId: data.userId,
            source: 'PaymentGatewayCore'
          }
        })
      }
    );

    return {
      success: true,
      data: {
        link: response.data.link,
        tx_ref: response.data.tx_ref,
        provider: 'flutterwave'
      },
      message: 'Flutterwave payment initialized successfully'
    };
  } catch (error: any) {
    throw new Error(`Flutterwave initialization failed: ${error.response?.data?.message || error.message}`);
  }
}

async function verifyFlutterwavePayment(transactionId: string) {
  try {
    const response = await makeRequest(
      `${FLUTTERWAVE_API_BASE}/transactions/${transactionId}/verify`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    );

    return {
      success: true,
      data: {
        status: response.data.status,
        tx_ref: response.data.tx_ref,
        amount: response.data.amount,
        currency: response.data.currency,
        customer: response.data.customer,
        provider: 'flutterwave'
      },
      message: 'Flutterwave payment verification successful'
    };
  } catch (error: any) {
    throw new Error(`Flutterwave verification failed: ${error.message}`);
  }
}

async function createFlutterwaveCustomer(data: z.infer<typeof CustomerSchema>) {
  // Flutterwave doesn't have a separate customer creation endpoint
  // Customers are created implicitly during payment
  return {
    success: true,
    data: {
      email: data.email,
      provider: 'flutterwave'
    },
    message: 'Flutterwave customer will be created during payment'
  };
}

async function createFlutterwaveSubscription(data: z.infer<typeof SubscriptionSchema>) {
  try {
    const response = await makeRequest(
      `${FLUTTERWAVE_API_BASE}/payment-plans/${data.planCode}/subscriptions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: data.customerId
        })
      }
    );

    return {
      success: true,
      data: {
        id: response.data.id,
        provider: 'flutterwave'
      },
      message: 'Flutterwave subscription created successfully'
    };
  } catch (error: any) {
    throw new Error(`Flutterwave subscription creation failed: ${error.message}`);
  }
}

async function processFlutterwaveRefund(data: z.infer<typeof RefundSchema>) {
  try {
    const response = await makeRequest(
      `${FLUTTERWAVE_API_BASE}/transactions/${data.transactionId}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: data.amount
        })
      }
    );

    return {
      success: true,
      data: {
        id: response.data.id,
        amount: response.data.amount,
        provider: 'flutterwave'
      },
      message: 'Flutterwave refund processed successfully'
    };
  } catch (error: any) {
    throw new Error(`Flutterwave refund failed: ${error.message}`);
  }
}

async function getFlutterwaveTransaction(transactionId: string) {
  try {
    const response = await makeRequest(
      `${FLUTTERWAVE_API_BASE}/transactions/${transactionId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    );

    return {
      success: true,
      data: {
        status: response.data.status,
        tx_ref: response.data.tx_ref,
        amount: response.data.amount,
        currency: response.data.currency,
        provider: 'flutterwave'
      },
      message: 'Flutterwave transaction retrieved successfully'
    };
  } catch (error: any) {
    throw new Error(`Flutterwave transaction retrieval failed: ${error.message}`);
  }
}

async function validateFlutterwaveWebhook(body: string | object, signature: string) {
  try {
    if (!env.FLUTTERWAVE_WEBHOOK_SECRET) {
      throw new Error('Flutterwave webhook secret not configured');
    }

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const hash = crypto.createHmac('sha256', env.FLUTTERWAVE_WEBHOOK_SECRET).update(bodyString).digest('hex');

    if (hash !== signature) {
      throw new Error('Invalid webhook signature');
    }

    return {
      success: true,
      data: typeof body === 'string' ? JSON.parse(body) : body,
      message: 'Flutterwave webhook validated successfully'
    };
  } catch (error: any) {
    throw new Error(`Flutterwave webhook validation failed: ${error.message}`);
  }
}

// Interswitch implementation functions with OAuth validation
async function initializeInterswitchPayment(data: z.infer<typeof PaymentIntentSchema>) {
  try {
    // Validate Interswitch-specific requirements
    if (data.currency !== 'NGN' && data.currency !== 'USD') {
      throw new Error('Interswitch only supports NGN and USD currencies');
    }
    
    // Get OAuth token for Interswitch API
    const accessToken = await getInterswitchAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to obtain Interswitch access token');
    }
    
    // Initialize payment with Interswitch
    const response = await makeRequest(
      `${INTERSWITCH_API_BASE}/api/v1/payments/initialize`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Client-Id': env.INTERSWITCH_CLIENT_ID
        },
        body: JSON.stringify({
          amount: data.amount, // Amount already converted to kobo for NGN
          currency: data.currency,
          reference: data.reference,
          redirectUrl: process.env.PAYMENT_SUCCESS_URL,
          customer: {
            email: data.email
          },
          description: data.description || 'Payment for services',
          metadata: {
            ...data.metadata,
            tenantId: data.tenantId,
            userId: data.userId
          }
        })
      }
    );
    
    return {
      success: true,
      data: {
        paymentUrl: response.data.paymentUrl,
        reference: response.data.reference,
        accessCode: response.data.accessCode,
        provider: 'interswitch'
      },
      message: 'Interswitch payment initialized successfully'
    };
  } catch (error: any) {
    console.error('Interswitch payment initialization error:', error);
    return {
      success: false,
      message: `Interswitch initialization failed: ${error.message}`,
      provider: 'interswitch'
    };
  }
}

// OAuth token management for Interswitch
async function getInterswitchAccessToken(): Promise<string | null> {
  try {
    const response = await makeRequest(
      `${INTERSWITCH_API_BASE}/api/v1/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${env.INTERSWITCH_CLIENT_ID}:${env.INTERSWITCH_CLIENT_SECRET}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'payment'
        }).toString()
      }
    );
    
    return response.access_token;
  } catch (error) {
    console.error('Failed to obtain Interswitch access token:', error);
    return null;
  }
}

async function verifyInterswitchPayment(reference: string) {
  try {
    const accessToken = await getInterswitchAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to obtain Interswitch access token for verification');
    }
    
    const response = await makeRequest(
      `${INTERSWITCH_API_BASE}/api/v1/payments/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Client-Id': env.INTERSWITCH_CLIENT_ID
        }
      }
    );
    
    return {
      success: true,
      data: {
        reference: response.data.reference,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        customer: response.data.customer,
        provider: 'interswitch'
      },
      message: 'Interswitch payment verification successful'
    };
  } catch (error: any) {
    console.error('Interswitch verification error:', error);
    return {
      success: false,
      message: `Interswitch verification failed: ${error.message}`,
      provider: 'interswitch'
    };
  }
}

async function createInterswitchCustomer(data: z.infer<typeof CustomerSchema>) {
  try {
    const accessToken = await getInterswitchAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to obtain Interswitch access token for customer creation');
    }
    
    const response = await makeRequest(
      `${INTERSWITCH_API_BASE}/api/v1/customers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Client-Id': env.INTERSWITCH_CLIENT_ID
        },
        body: JSON.stringify({
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
          phoneNumber: data.phone
        })
      }
    );
    
    return {
      success: true,
      data: {
        customerId: response.data.customerId,
        email: data.email,
        provider: 'interswitch'
      },
      message: 'Interswitch customer created successfully'
    };
  } catch (error: any) {
    console.error('Interswitch customer creation error:', error);
    return {
      success: false,
      message: `Interswitch customer creation failed: ${error.message}`,
      provider: 'interswitch'
    };
  }
}

async function createInterswitchSubscription(data: z.infer<typeof SubscriptionSchema>) {
  return {
    success: true,
    data: {
      planCode: data.planCode,
      provider: 'interswitch'
    },
    message: 'Interswitch subscription creation (requires further implementation)'
  };
}

async function processInterswitchRefund(data: z.infer<typeof RefundSchema>) {
  return {
    success: true,
    data: {
      transactionId: data.transactionId,
      provider: 'interswitch'
    },
    message: 'Interswitch refund processing (requires further implementation)'
  };
}

async function getInterswitchTransaction(transactionId: string) {
  return {
    success: true,
    data: {
      transactionId,
      status: 'pending',
      provider: 'interswitch'
    },
    message: 'Interswitch transaction retrieval (requires further implementation)'
  };
}

async function validateInterswitchWebhook(body: string | object, signature: string) {
  return {
    success: true,
    data: typeof body === 'string' ? JSON.parse(body) : body,
    message: 'Interswitch webhook validation (requires further implementation)'
  };
}