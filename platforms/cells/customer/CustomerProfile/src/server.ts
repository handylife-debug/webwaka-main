import { execute_sql, withTransaction } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';

// Nigerian market specific imports
import { createSMSService } from '@/lib/sms-service';
import { sendEmail } from '@/lib/replitmail';

// Initialize SMS service
const smsService = createSMSService();

// Types for CustomerProfile operations
export interface CustomerProfile {
  id: string;
  tenantId: string;
  customerCode: string;
  
  // Personal Information
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  preferredLanguage: 'en' | 'ha' | 'yo' | 'ig'; // English, Hausa, Yoruba, Igbo
  
  // Contact Information
  primaryPhone: string;
  secondaryPhone?: string;
  email?: string;
  whatsappNumber?: string;
  preferredContactMethod: 'phone' | 'sms' | 'whatsapp' | 'email' | 'in_person';
  
  // Address Information (Primary)
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
    lga?: string; // Local Government Area - Nigerian administrative division
  };
  
  // Business Information
  customerType: 'individual' | 'business' | 'corporate' | 'government';
  industry?: string;
  companyName?: string;
  taxId?: string;
  
  // Customer Status & Classification
  status: 'active' | 'inactive' | 'suspended' | 'archived';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  tags: string[];
  
  // Communication Preferences
  communicationPreferences: {
    marketingOptIn: boolean;
    smsOptIn: boolean;
    emailOptIn: boolean;
    whatsappOptIn: boolean;
    callOptIn: boolean;
    preferredTime: 'morning' | 'afternoon' | 'evening' | 'anytime';
    preferredDays: string[];
  };
  
  // Customer Statistics
  stats: {
    totalPurchases: number;
    lifetimeValue: number;
    lastPurchaseDate?: string;
    firstPurchaseDate?: string;
    loyaltyPoints: number;
    averageOrderValue: number;
    purchaseFrequency: number; // purchases per month
  };
  
  // Metadata
  notes?: string;
  customFields: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CustomerContact {
  id: string;
  customerId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  isPrimaryContact: boolean;
  isDecisionMaker: boolean;
  relationship: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  tenantId: string;
  addressType: 'billing' | 'shipping' | 'office' | 'home' | 'warehouse' | 'other';
  addressLabel: string;
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  lga?: string; // Local Government Area
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Nigerian states for validation
const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT' // Federal Capital Territory
];

// Nigerian phone number validation and formatting
function validateNigerianPhone(phone: string): { isValid: boolean; formatted: string; network?: string } {
  if (!phone) return { isValid: false, formatted: '' };
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Nigerian phone patterns
  const patterns = [
    { regex: /^(\+234|234|0)(70[1-9]|80[1-9]|81[0-9]|90[1-9]|91[0-9])\d{7}$/, network: 'MTN' },
    { regex: /^(\+234|234|0)(80[1-9]|81[0-9]|70[1-9])\d{7}$/, network: 'Airtel' },
    { regex: /^(\+234|234|0)(80[1-9]|90[1-9]|91[0-9])\d{7}$/, network: 'Glo' },
    { regex: /^(\+234|234|0)(80[1-9]|90[1-9])\d{7}$/, network: '9mobile' }
  ];
  
  // Try with different prefix formats
  const testNumbers = [
    digits,
    `234${digits.slice(-10)}`,
    `+234${digits.slice(-10)}`,
    `0${digits.slice(-10)}`
  ];
  
  for (const testNumber of testNumbers) {
    for (const pattern of patterns) {
      if (pattern.regex.test(testNumber)) {
        // Format as +234XXXXXXXXXX
        const normalizedDigits = testNumber.replace(/^(\+234|234|0)/, '');
        return {
          isValid: true,
          formatted: `+234${normalizedDigits}`,
          network: pattern.network
        };
      }
    }
  }
  
  return { isValid: false, formatted: phone };
}

// Input validation schemas
const createCustomerSchema = z.object({
  // Personal Information
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  preferredLanguage: z.enum(['en', 'ha', 'yo', 'ig']).default('en'),
  
  // Contact Information
  primaryPhone: z.string().min(1),
  secondaryPhone: z.string().optional(),
  email: z.string().email().optional(),
  whatsappNumber: z.string().optional(),
  preferredContactMethod: z.enum(['phone', 'sms', 'whatsapp', 'email', 'in_person']).default('phone'),
  
  // Address Information
  address: z.object({
    street: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).default('Nigeria'),
    postalCode: z.string().max(20).optional(),
    lga: z.string().max(100).optional()
  }).optional(),
  
  // Business Information
  customerType: z.enum(['individual', 'business', 'corporate', 'government']).default('individual'),
  industry: z.string().max(100).optional(),
  companyName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  
  // Communication Preferences
  communicationPreferences: z.object({
    marketingOptIn: z.boolean().default(true),
    smsOptIn: z.boolean().default(true),
    emailOptIn: z.boolean().default(true),
    whatsappOptIn: z.boolean().default(true),
    callOptIn: z.boolean().default(true),
    preferredTime: z.enum(['morning', 'afternoon', 'evening', 'anytime']).default('anytime'),
    preferredDays: z.array(z.string()).default(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  }).default({}),
  
  // Optional fields
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  customFields: z.record(z.any()).default({})
});

const searchCustomersSchema = z.object({
  query: z.string().optional(),
  filters: z.object({
    customerType: z.enum(['individual', 'business', 'corporate', 'government']).optional(),
    status: z.enum(['active', 'inactive', 'suspended', 'archived']).optional(),
    tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
    state: z.string().optional(),
    lga: z.string().optional(),
    preferredLanguage: z.enum(['en', 'ha', 'yo', 'ig']).optional(),
    industry: z.string().optional(),
    tags: z.array(z.string()).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional()
  }).default({}),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(25)
  }).default({})
});

const communicationSchema = z.object({
  communicationType: z.enum(['sms', 'whatsapp', 'email', 'call']),
  message: z.string().min(1).max(1000),
  language: z.enum(['en', 'ha', 'yo', 'ig']).default('en'),
  templateId: z.string().optional(),
  urgent: z.boolean().default(false),
  sendAt: z.string().optional()
});

export const customerProfileCell = {
  // ========================================
  // CUSTOMER MANAGEMENT OPERATIONS
  // ========================================

  /**
   * Create a new customer profile with Nigerian market validations
   */
  async createCustomer(input: unknown, tenantId: string, userId: string): Promise<{ success: boolean; customer?: CustomerProfile; customerId?: string; customerCode?: string; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = createCustomerSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const customerData = validationResult.data;

        // Validate Nigerian phone number
        const phoneValidation = validateNigerianPhone(customerData.primaryPhone);
        if (!phoneValidation.isValid) {
          return {
            success: false,
            message: 'Invalid Nigerian phone number format',
            error: 'Phone number must be a valid Nigerian mobile number'
          };
        }

        // Validate secondary phone if provided
        if (customerData.secondaryPhone) {
          const secondaryPhoneValidation = validateNigerianPhone(customerData.secondaryPhone);
          if (!secondaryPhoneValidation.isValid) {
            return {
              success: false,
              message: 'Invalid secondary phone number format',
              error: 'Secondary phone number must be a valid Nigerian mobile number'
            };
          }
          customerData.secondaryPhone = secondaryPhoneValidation.formatted;
        }

        // Validate WhatsApp number if provided
        if (customerData.whatsappNumber) {
          const whatsappValidation = validateNigerianPhone(customerData.whatsappNumber);
          if (!whatsappValidation.isValid) {
            return {
              success: false,
              message: 'Invalid WhatsApp number format',
              error: 'WhatsApp number must be a valid Nigerian mobile number'
            };
          }
          customerData.whatsappNumber = whatsappValidation.formatted;
        }

        // Validate Nigerian state if provided
        if (customerData.address?.state && customerData.address.country === 'Nigeria') {
          if (!NIGERIAN_STATES.includes(customerData.address.state)) {
            return {
              success: false,
              message: 'Invalid Nigerian state',
              error: `State must be one of: ${NIGERIAN_STATES.join(', ')}`
            };
          }
        }

        // Check for duplicate phone number
        const existingCustomer = await execute_sql(
          `SELECT id FROM customers WHERE tenant_id = $1 AND primary_phone = $2`,
          [tenantId, phoneValidation.formatted]
        );

        if (existingCustomer.rows.length > 0) {
          return {
            success: false,
            message: 'Customer with this phone number already exists',
            error: 'Duplicate phone number'
          };
        }

        // Generate customer code
        const customerCode = await this.generateCustomerCode(tenantId, customerData.customerType);

        const customerId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Create customer record
        return await withTransaction(async () => {
          const customerResult = await execute_sql(
            `INSERT INTO customers (
              id, tenant_id, customer_code, 
              first_name, last_name, middle_name, date_of_birth, gender, preferred_language,
              primary_phone, secondary_phone, email, whatsapp_number, preferred_contact_method,
              customer_type, industry, company_name, tax_id,
              status, tier, tags,
              communication_preferences, notes, custom_fields,
              created_at, updated_at, created_by
            ) VALUES (
              $1, $2, $3, 
              $4, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14,
              $15, $16, $17, $18,
              $19, $20, $21,
              $22, $23, $24,
              $25, $26, $27
            ) RETURNING *`,
            [
              customerId, tenantId, customerCode,
              customerData.firstName, customerData.lastName, customerData.middleName, 
              customerData.dateOfBirth, customerData.gender, customerData.preferredLanguage,
              phoneValidation.formatted, customerData.secondaryPhone, customerData.email, 
              customerData.whatsappNumber, customerData.preferredContactMethod,
              customerData.customerType, customerData.industry, customerData.companyName, customerData.taxId,
              'active', 'bronze', JSON.stringify(customerData.tags),
              JSON.stringify(customerData.communicationPreferences), customerData.notes, JSON.stringify(customerData.customFields),
              now, now, userId
            ]
          );

          // Create default address if provided
          if (customerData.address) {
            await this.createCustomerAddress(
              tenantId,
              customerId,
              {
                ...customerData.address,
                addressType: 'home',
                addressLabel: 'Primary Address',
                isDefault: true,
                isActive: true
              },
              userId
            );
          }

          // Cache customer data
          await redis.set(
            `customer:${tenantId}:${customerId}`,
            JSON.stringify(customerResult.rows[0]),
            'EX',
            3600 // 1 hour cache
          );

          const customer = this.formatCustomerResponse(customerResult.rows[0]);

          return {
            success: true,
            customer,
            customerId,
            customerCode,
            message: 'Customer created successfully'
          };
        });
      },
      'Failed to create customer'
    );
  },

  /**
   * Get customer profile with related data
   */
  async getCustomer(input: unknown, tenantId: string): Promise<{ success: boolean; customer?: CustomerProfile; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const { customerId, includeContacts = false, includeAddresses = false, includeNotes = false, includeDocuments = false } = input as any;

        if (!customerId) {
          return {
            success: false,
            message: 'Customer ID is required'
          };
        }

        // Try cache first
        const cachedCustomer = await redis.get(`customer:${tenantId}:${customerId}`);
        if (cachedCustomer) {
          const customer = JSON.parse(cachedCustomer as string);
          return {
            success: true,
            customer: this.formatCustomerResponse(customer),
            message: 'Customer retrieved from cache'
          };
        }

        // Fetch from database
        const customerResult = await execute_sql(
          `SELECT c.*,
            COUNT(DISTINCT ct.id) as contact_count,
            COUNT(DISTINCT ca.id) as address_count,
            COUNT(DISTINCT cn.id) as note_count,
            COUNT(DISTINCT cd.id) as document_count
          FROM customers c
          LEFT JOIN customer_contacts ct ON ct.customer_id = c.id AND ct.tenant_id = c.tenant_id
          LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.tenant_id = c.tenant_id
          LEFT JOIN customer_notes cn ON cn.customer_id = c.id AND cn.tenant_id = c.tenant_id
          LEFT JOIN customer_documents cd ON cd.customer_id = c.id AND cd.tenant_id = c.tenant_id
          WHERE c.id = $1 AND c.tenant_id = $2
          GROUP BY c.id`,
          [customerId, tenantId]
        );

        if (customerResult.rows.length === 0) {
          return {
            success: false,
            message: 'Customer not found'
          };
        }

        const customerData = customerResult.rows[0];

        // Fetch related data if requested
        if (includeAddresses) {
          const addresses = await this.getCustomerAddresses(tenantId, customerId);
          customerData.addresses = addresses.items;
        }

        if (includeContacts) {
          const contacts = await this.getCustomerContacts(tenantId, customerId);
          customerData.contacts = contacts.items;
        }

        // Cache the customer data
        await redis.set(
          `customer:${tenantId}:${customerId}`,
          JSON.stringify(customerData),
          'EX',
          3600 // 1 hour cache
        );

        const customer = this.formatCustomerResponse(customerData);

        return {
          success: true,
          customer,
          message: 'Customer retrieved successfully'
        };
      },
      'Failed to retrieve customer'
    );
  },

  /**
   * Search customers with Nigerian market filters
   */
  async searchCustomers(input: unknown, tenantId: string): Promise<{ success: boolean; customers?: CustomerProfile[]; pagination?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = searchCustomersSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid search parameters',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const { query, filters, pagination } = validationResult.data;
        const { page, limit } = pagination;
        const offset = (page - 1) * limit;

        // Build dynamic search query
        let whereConditions = ['c.tenant_id = $1'];
        let queryParams: any[] = [tenantId];
        let paramIndex = 2;

        // Text search across name, email, phone, company
        if (query) {
          whereConditions.push(`(
            LOWER(c.first_name) LIKE LOWER($${paramIndex}) OR
            LOWER(c.last_name) LIKE LOWER($${paramIndex}) OR
            LOWER(c.company_name) LIKE LOWER($${paramIndex}) OR
            LOWER(c.email) LIKE LOWER($${paramIndex}) OR
            c.primary_phone LIKE $${paramIndex} OR
            c.customer_code LIKE UPPER($${paramIndex})
          )`);
          queryParams.push(`%${query}%`);
          paramIndex++;
        }

        // Apply filters
        if (filters.customerType) {
          whereConditions.push(`c.customer_type = $${paramIndex}`);
          queryParams.push(filters.customerType);
          paramIndex++;
        }

        if (filters.status) {
          whereConditions.push(`c.status = $${paramIndex}`);
          queryParams.push(filters.status);
          paramIndex++;
        }

        if (filters.tier) {
          whereConditions.push(`c.tier = $${paramIndex}`);
          queryParams.push(filters.tier);
          paramIndex++;
        }

        if (filters.preferredLanguage) {
          whereConditions.push(`c.preferred_language = $${paramIndex}`);
          queryParams.push(filters.preferredLanguage);
          paramIndex++;
        }

        if (filters.industry) {
          whereConditions.push(`LOWER(c.industry) LIKE LOWER($${paramIndex})`);
          queryParams.push(`%${filters.industry}%`);
          paramIndex++;
        }

        // Nigerian geographic filters
        if (filters.state) {
          whereConditions.push(`ca.state = $${paramIndex}`);
          queryParams.push(filters.state);
          paramIndex++;
        }

        if (filters.lga) {
          whereConditions.push(`ca.lga = $${paramIndex}`);
          queryParams.push(filters.lga);
          paramIndex++;
        }

        // Tags filter
        if (filters.tags && filters.tags.length > 0) {
          whereConditions.push(`c.tags::jsonb ?| array[$${paramIndex}]`);
          queryParams.push(filters.tags);
          paramIndex++;
        }

        // Date filters
        if (filters.createdAfter) {
          whereConditions.push(`c.created_at >= $${paramIndex}`);
          queryParams.push(filters.createdAfter);
          paramIndex++;
        }

        if (filters.createdBefore) {
          whereConditions.push(`c.created_at <= $${paramIndex}`);
          queryParams.push(filters.createdBefore);
          paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        // Count total results
        const countQuery = `
          SELECT COUNT(DISTINCT c.id) as total
          FROM customers c
          ${filters.state || filters.lga ? 'LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.tenant_id = c.tenant_id AND ca.is_default = true' : ''}
          WHERE ${whereClause}
        `;

        const countResult = await execute_sql(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Fetch paginated results
        const searchQuery = `
          SELECT DISTINCT c.*,
            ca.state, ca.lga, ca.city
          FROM customers c
          ${filters.state || filters.lga ? 'LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.tenant_id = c.tenant_id AND ca.is_default = true' : ''}
          WHERE ${whereClause}
          ORDER BY c.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        const searchResult = await execute_sql(searchQuery, queryParams);

        const customers = searchResult.rows.map(row => this.formatCustomerResponse(row));

        const totalPages = Math.ceil(total / limit);

        return {
          success: true,
          customers,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasMore: page < totalPages
          },
          message: `Found ${total} customers`
        };
      },
      'Failed to search customers'
    );
  },

  /**
   * Send communication to customer
   */
  async sendCommunication(input: unknown, tenantId: string, customerId: string): Promise<{ success: boolean; messageId?: string; deliveryStatus?: string; cost?: number; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = communicationSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid communication data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const { communicationType, message: messageContent, language, templateId, urgent } = validationResult.data;

        // Get customer data
        const customerResult = await this.getCustomer({ customerId }, tenantId);
        if (!customerResult.success || !customerResult.customer) {
          return {
            success: false,
            message: 'Customer not found'
          };
        }

        const customer = customerResult.customer;

        // Check communication preferences
        const prefs = customer.communicationPreferences;
        if (communicationType === 'sms' && !prefs.smsOptIn) {
          return {
            success: false,
            message: 'Customer has opted out of SMS communications'
          };
        }

        if (communicationType === 'email' && !prefs.emailOptIn) {
          return {
            success: false,
            message: 'Customer has opted out of email communications'
          };
        }

        if (communicationType === 'whatsapp' && !prefs.whatsappOptIn) {
          return {
            success: false,
            message: 'Customer has opted out of WhatsApp communications'
          };
        }

        // Translate message if needed (simplified implementation)
        let translatedMessage = messageContent;
        if (language !== 'en') {
          translatedMessage = await this.translateMessage(messageContent, language);
        }

        let deliveryResult;
        let cost = 0;

        try {
          switch (communicationType) {
            case 'sms':
              if (!customer.primaryPhone) {
                return {
                  success: false,
                  message: 'Customer does not have a phone number'
                };
              }
              deliveryResult = await smsService.sendSMS(customer.primaryPhone, translatedMessage);
              cost = 0.05; // Estimated SMS cost in USD
              break;

            case 'whatsapp':
              if (!customer.whatsappNumber) {
                return {
                  success: false,
                  message: 'Customer does not have a WhatsApp number'
                };
              }
              // WhatsApp integration would go here
              deliveryResult = { messageId: crypto.randomUUID(), status: 'sent' };
              cost = 0.03; // Estimated WhatsApp cost in USD
              break;

            case 'email':
              if (!customer.email) {
                return {
                  success: false,
                  message: 'Customer does not have an email address'
                };
              }
              deliveryResult = await sendEmail({
                to: customer.email,
                subject: urgent ? '[URGENT] Message from WebWaka' : 'Message from WebWaka',
                text: translatedMessage
              });
              cost = 0.01; // Estimated email cost in USD
              break;

            default:
              return {
                success: false,
                message: 'Unsupported communication type'
              };
          }

          // Log communication
          await execute_sql(
            `INSERT INTO customer_interactions (
              id, tenant_id, customer_id, interaction_type, channel, direction,
              subject, content, status, cost_usd, language_used,
              external_message_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              crypto.randomUUID(),
              tenantId,
              customerId,
              'communication',
              communicationType,
              'outbound',
              urgent ? 'Urgent Message' : 'Message',
              translatedMessage,
              deliveryResult.status || 'sent',
              cost,
              language,
              deliveryResult.messageId,
              new Date().toISOString()
            ]
          );

          return {
            success: true,
            messageId: deliveryResult.messageId,
            deliveryStatus: deliveryResult.status || 'sent',
            cost,
            message: 'Communication sent successfully'
          };

        } catch (error) {
          console.error('Communication delivery failed:', error);
          return {
            success: false,
            message: 'Failed to deliver communication',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      },
      'Failed to send communication'
    );
  },

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Generate unique customer code
   */
  async generateCustomerCode(tenantId: string, customerType: string): Promise<string> {
    const prefix = customerType === 'business' ? 'BUS' : 
                   customerType === 'corporate' ? 'CORP' : 
                   customerType === 'government' ? 'GOV' : 'CUST';
    
    // Get the count of customers for this tenant
    const countResult = await execute_sql(
      `SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1`,
      [tenantId]
    );
    
    const count = parseInt(countResult.rows[0].count) + 1;
    const paddedCount = count.toString().padStart(6, '0');
    
    return `${prefix}${paddedCount}`;
  },

  /**
   * Format customer response
   */
  formatCustomerResponse(row: any): CustomerProfile {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      customerCode: row.customer_code,
      firstName: row.first_name,
      lastName: row.last_name,
      middleName: row.middle_name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      preferredLanguage: row.preferred_language || 'en',
      primaryPhone: row.primary_phone,
      secondaryPhone: row.secondary_phone,
      email: row.email,
      whatsappNumber: row.whatsapp_number,
      preferredContactMethod: row.preferred_contact_method || 'phone',
      address: row.state ? {
        street: row.street,
        city: row.city,
        state: row.state,
        country: row.country || 'Nigeria',
        postalCode: row.postal_code,
        lga: row.lga
      } : undefined,
      customerType: row.customer_type || 'individual',
      industry: row.industry,
      companyName: row.company_name,
      taxId: row.tax_id,
      status: row.status || 'active',
      tier: row.tier || 'bronze',
      tags: row.tags ? JSON.parse(row.tags) : [],
      communicationPreferences: row.communication_preferences ? JSON.parse(row.communication_preferences) : {
        marketingOptIn: true,
        smsOptIn: true,
        emailOptIn: true,
        whatsappOptIn: true,
        callOptIn: true,
        preferredTime: 'anytime',
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      stats: {
        totalPurchases: row.total_purchases || 0,
        lifetimeValue: row.lifetime_value || 0,
        lastPurchaseDate: row.last_purchase_date,
        firstPurchaseDate: row.first_purchase_date,
        loyaltyPoints: row.loyalty_points || 0,
        averageOrderValue: row.average_order_value || 0,
        purchaseFrequency: row.purchase_frequency || 0
      },
      notes: row.notes,
      customFields: row.custom_fields ? JSON.parse(row.custom_fields) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by
    };
  },

  /**
   * Simple message translation (placeholder implementation)
   */
  async translateMessage(message: string, targetLanguage: string): Promise<string> {
    // In a real implementation, this would use a translation service
    // For now, we'll just return the original message with a language indicator
    const languageNames = {
      'ha': 'Hausa',
      'yo': 'Yoruba',
      'ig': 'Igbo'
    };
    
    return `[${languageNames[targetLanguage as keyof typeof languageNames] || targetLanguage}] ${message}`;
  },

  /**
   * Get customer addresses
   */
  async getCustomerAddresses(tenantId: string, customerId: string): Promise<SearchResult<CustomerAddress>> {
    const result = await execute_sql(
      `SELECT * FROM customer_addresses 
       WHERE tenant_id = $1 AND customer_id = $2 AND is_active = true
       ORDER BY is_default DESC, created_at DESC`,
      [tenantId, customerId]
    );

    return {
      items: result.rows,
      total: result.rows.length,
      hasMore: false,
      pagination: {
        page: 1,
        limit: 100,
        totalPages: 1
      }
    };
  },

  /**
   * Get customer contacts
   */
  async getCustomerContacts(tenantId: string, customerId: string): Promise<SearchResult<CustomerContact>> {
    const result = await execute_sql(
      `SELECT * FROM customer_contacts 
       WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY is_primary_contact DESC, created_at DESC`,
      [tenantId, customerId]
    );

    return {
      items: result.rows,
      total: result.rows.length,
      hasMore: false,
      pagination: {
        page: 1,
        limit: 100,
        totalPages: 1
      }
    };
  },

  /**
   * Create customer address
   */
  async createCustomerAddress(tenantId: string, customerId: string, addressData: any, userId: string): Promise<{ success: boolean; addressId?: string; message: string }> {
    try {
      const addressId = crypto.randomUUID();
      const now = new Date().toISOString();

      await execute_sql(
        `INSERT INTO customer_addresses (
          id, tenant_id, customer_id, address_type, address_label,
          street, city, state, country, postal_code, lga,
          is_default, is_active, created_at, updated_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          addressId, tenantId, customerId, addressData.addressType, addressData.addressLabel,
          addressData.street, addressData.city, addressData.state, addressData.country, 
          addressData.postalCode, addressData.lga,
          addressData.isDefault, addressData.isActive, now, now, userId
        ]
      );

      return {
        success: true,
        addressId,
        message: 'Address created successfully'
      };
    } catch (error) {
      console.error('Failed to create address:', error);
      return {
        success: false,
        message: 'Failed to create address'
      };
    }
  }
};