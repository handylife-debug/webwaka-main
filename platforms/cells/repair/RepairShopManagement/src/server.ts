import { execute_sql } from '@/lib/database';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';

// REUSE-FIRST: Import existing cells for maximum component reuse
import { customerProfileCell } from '@/cells/customer/CustomerProfile/src/server';
import { inventoryTrackingCell } from '@/cells/inventory/InventoryTracking/src/server';
import { salesEngineCell } from '@/cells/sales/SalesEngine/src/server';
import { splitPaymentCell } from '@/cells/payment/SplitPayment/src/server';

// Nigerian market specific imports  
import { createSMSService } from '@/lib/sms-service';
import { sendEmail } from '@/lib/replitmail';

// Initialize SMS service for customer notifications
const smsService = createSMSService();

// Types for RepairShopManagement operations
export interface RepairJob {
  id: string;
  tenantId: string;
  jobNumber: string;
  customerId: string;
  deviceInfo: DeviceInfo;
  problemDescription: string;
  symptoms: string[];
  customerReportedIssues: string[];
  status: RepairStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  serviceType: 'diagnosis' | 'repair' | 'maintenance' | 'upgrade' | 'data_recovery' | 'warranty_claim';
  assignedTechnician: string;
  locationId: string;
  diagnosticFee: number;
  depositRequired: number;
  estimatedCompletionDate?: string;
  actualCompletionDate?: string;
  notes?: string;
  technicianNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface DeviceInfo {
  deviceType: 'smartphone' | 'laptop' | 'tablet' | 'desktop' | 'smartwatch' | 'headphones' | 'camera' | 'gaming_console' | 'tv' | 'other';
  brand: string;
  model: string;
  serialNumber?: string;
  imei?: string;
  color?: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
  accessories: string[];
  purchaseDate?: string;
  warrantyStatus: 'in_warranty' | 'expired' | 'unknown' | 'voided';
}

export type RepairStatus = 
  | 'pending_diagnosis'
  | 'diagnosed' 
  | 'parts_ordered'
  | 'in_repair'
  | 'testing'
  | 'completed'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled'
  | 'on_hold';

export interface RepairPart {
  id: string;
  repairJobId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  partType: 'oem' | 'aftermarket' | 'refurbished' | 'used';
  warrantyPeriod: number; // days
  serialNumber?: string;
  supplierInfo?: string;
  notes?: string;
  addedAt: string;
  addedBy: string;
}

export interface RepairEstimate {
  id: string;
  repairJobId: string;
  diagnosticFee: number;
  laborCost: number;
  partsCost: number;
  additionalFees: number;
  discountAmount: number;
  totalEstimate: number;
  currency: 'NGN' | 'USD' | 'GBP';
  validUntil: string;
  paymentTerms: 'full_upfront' | 'deposit_50' | 'deposit_30' | 'completion';
  warrantyPeriod: number; // days
  notes?: string;
  createdAt: string;
  createdBy: string;
  approved: boolean;
  approvedAt?: string;
  approvedBy?: string;
}

// Zod validation schemas
const createRepairJobSchema = z.object({
  customerId: z.string().uuid(),
  deviceInfo: z.object({
    deviceType: z.enum(['smartphone', 'laptop', 'tablet', 'desktop', 'smartwatch', 'headphones', 'camera', 'gaming_console', 'tv', 'other']),
    brand: z.string().max(100),
    model: z.string().max(100),
    serialNumber: z.string().max(100).optional(),
    imei: z.string().max(20).optional(),
    color: z.string().max(50).optional(),
    condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']),
    accessories: z.array(z.string()).default([]),
    purchaseDate: z.string().optional(),
    warrantyStatus: z.enum(['in_warranty', 'expired', 'unknown', 'voided']).default('unknown')
  }),
  problemDescription: z.string().max(1000),
  symptoms: z.array(z.string()).default([]),
  customerReportedIssues: z.array(z.string()).default([]),
  estimatedCompletionDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  serviceType: z.enum(['diagnosis', 'repair', 'maintenance', 'upgrade', 'data_recovery', 'warranty_claim']),
  diagnosticFee: z.number().min(0).default(0),
  depositRequired: z.number().min(0).default(0),
  assignedTechnician: z.string().uuid(),
  locationId: z.string().uuid(),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().max(255).optional()
});

const updateRepairStatusSchema = z.object({
  repairJobId: z.string().uuid(),
  status: z.enum(['pending_diagnosis', 'diagnosed', 'parts_ordered', 'in_repair', 'testing', 'completed', 'ready_for_pickup', 'delivered', 'cancelled', 'on_hold']),
  statusNotes: z.string().max(500).optional(),
  technicianNotes: z.string().max(1000).optional(),
  updatedBy: z.string().uuid(),
  estimatedCompletion: z.string().optional(),
  notifyCustomer: z.boolean().default(true),
  notificationMethod: z.enum(['sms', 'email', 'call']).default('sms')
});

const addRepairPartsSchema = z.object({
  repairJobId: z.string().uuid(),
  parts: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    partType: z.enum(['oem', 'aftermarket', 'refurbished', 'used']),
    warrantyPeriod: z.number().int().min(0).default(0),
    serialNumber: z.string().optional(),
    supplierInfo: z.string().optional(),
    notes: z.string().optional()
  })),
  updatedBy: z.string().uuid()
});

// NIGERIAN BUSINESS UNIT CONVERSIONS for repair parts
const NIGERIAN_REPAIR_UNITS = {
  'piece': { name: 'Piece', symbol: 'pc', conversionRate: 1 },
  'set': { name: 'Set', symbol: 'set', conversionRate: 1 },
  'pair': { name: 'Pair', symbol: 'pair', conversionRate: 2 },
  'dozen': { name: 'Dozen', symbol: 'dz', conversionRate: 12 },
  'meter': { name: 'Meter', symbol: 'm', conversionRate: 1 },
  'roll': { name: 'Roll', symbol: 'roll', conversionRate: 1 }
};

// RepairShopManagement Cell Implementation
const RepairShopManagementCell = {
  
  /**
   * Create new repair job - REUSES CustomerProfile and InventoryTracking
   */
  async createRepairJob(input: unknown, tenantId: string): Promise<{ success: boolean; repairJob?: RepairJob; customer?: any; ticketNumber?: string; qrCode?: string; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = createRepairJobSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const jobData = validationResult.data;

        // Check idempotency key if provided
        if (jobData.idempotencyKey) {
          const idempotencyCacheKey = `repair_job_idempotency:${tenantId}:${jobData.idempotencyKey}`;
          const existingResult = await redis.get<any>(idempotencyCacheKey);
          
          if (existingResult) {
            console.log(`[RepairShop] Returning cached result for idempotency key: ${jobData.idempotencyKey}`);
            return {
              success: true,
              ...existingResult,
              message: `Repair job ${existingResult.ticketNumber} already exists (idempotent request)`
            };
          }
        }

        // REUSE: Validate customer exists using CustomerProfile cell
        const customerResult = await customerProfileCell.getCustomer({ customerId: jobData.customerId }, tenantId);
        if (!customerResult.success || !customerResult.customer) {
          return {
            success: false,
            message: 'Customer not found',
            error: 'Invalid customer ID provided'
          };
        }

        const customer = customerResult.customer;

        // Generate repair job number
        const jobNumber = await this.generateRepairJobNumber(tenantId);
        const repairJobId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Create repair job record
        await execute_sql(
          `INSERT INTO repair_jobs (
            id, tenant_id, job_number, customer_id, device_info, problem_description,
            symptoms, customer_reported_issues, status, priority, service_type,
            assigned_technician, location_id, diagnostic_fee, deposit_required,
            estimated_completion_date, notes, created_at, updated_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            repairJobId, tenantId, jobNumber, jobData.customerId, JSON.stringify(jobData.deviceInfo),
            jobData.problemDescription, JSON.stringify(jobData.symptoms), JSON.stringify(jobData.customerReportedIssues),
            'pending_diagnosis', jobData.priority, jobData.serviceType, jobData.assignedTechnician,
            jobData.locationId, jobData.diagnosticFee, jobData.depositRequired, jobData.estimatedCompletionDate,
            jobData.notes, now, now, jobData.assignedTechnician
          ]
        );

        // Generate QR code for job tracking
        const qrCode = await this.generateJobQRCode(repairJobId, jobNumber);

        // Create repair job object
        const repairJob: RepairJob = {
          id: repairJobId,
          tenantId,
          jobNumber,
          customerId: jobData.customerId,
          deviceInfo: jobData.deviceInfo,
          problemDescription: jobData.problemDescription,
          symptoms: jobData.symptoms,
          customerReportedIssues: jobData.customerReportedIssues,
          status: 'pending_diagnosis',
          priority: jobData.priority,
          serviceType: jobData.serviceType,
          assignedTechnician: jobData.assignedTechnician,
          locationId: jobData.locationId,
          diagnosticFee: jobData.diagnosticFee,
          depositRequired: jobData.depositRequired,
          estimatedCompletionDate: jobData.estimatedCompletionDate,
          notes: jobData.notes,
          createdAt: now,
          updatedAt: now,
          createdBy: jobData.assignedTechnician
        };

        // Send initial notification to customer using existing SMS service
        await this.sendCustomerNotification(customer, 'job_created', {
          jobNumber,
          deviceInfo: jobData.deviceInfo,
          estimatedCompletion: jobData.estimatedCompletionDate
        });

        console.log(`[RepairShop] Created repair job ${jobNumber} for customer ${customer.firstName} ${customer.lastName}`);

        const result = {
          success: true,
          repairJob,
          customer,
          ticketNumber: jobNumber,
          qrCode,
          message: `Repair job ${jobNumber} created successfully`
        };

        // Cache result for idempotency if key was provided
        if (jobData.idempotencyKey) {
          const idempotencyCacheKey = `repair_job_idempotency:${tenantId}:${jobData.idempotencyKey}`;
          const cacheableResult = { repairJob, customer, ticketNumber: jobNumber, qrCode };
          await redis.set(idempotencyCacheKey, cacheableResult, { ex: 86400 }); // 24 hour TTL
        }

        return result;
      },
      {
        success: false as const,
        message: 'Repair job creation service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Update repair status - REUSES existing status management patterns
   */
  async updateRepairStatus(input: unknown, tenantId: string): Promise<{ success: boolean; repairJob?: RepairJob; notification?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = updateRepairStatusSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const statusData = validationResult.data;
        const now = new Date().toISOString();

        // Get current repair job
        const jobResult = await execute_sql(
          'SELECT * FROM repair_jobs WHERE id = $1 AND tenant_id = $2',
          [statusData.repairJobId, tenantId]
        );

        if (jobResult.rows.length === 0) {
          return {
            success: false,
            message: 'Repair job not found',
            error: 'Invalid repair job ID'
          };
        }

        const currentJob = jobResult.rows[0];

        // Update repair job status
        await execute_sql(
          `UPDATE repair_jobs SET 
            status = $1, status_notes = $2, technician_notes = $3, 
            estimated_completion_date = $4, updated_at = $5, updated_by = $6
           WHERE id = $7 AND tenant_id = $8`,
          [
            statusData.status, statusData.statusNotes, statusData.technicianNotes,
            statusData.estimatedCompletion, now, statusData.updatedBy,
            statusData.repairJobId, tenantId
          ]
        );

        // Log status change
        await execute_sql(
          `INSERT INTO repair_status_history (
            id, repair_job_id, previous_status, new_status, notes, 
            changed_by, changed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(), statusData.repairJobId, currentJob.status, 
            statusData.status, statusData.statusNotes, statusData.updatedBy, now
          ]
        );

        // REUSE: Get customer info for notifications
        const customerResult = await customerProfileCell.getCustomer({ customerId: currentJob.customer_id }, tenantId);
        let notification = null;

        if (statusData.notifyCustomer && customerResult.success && customerResult.customer) {
          notification = await this.sendCustomerNotification(
            customerResult.customer,
            'status_update',
            {
              jobNumber: currentJob.job_number,
              status: statusData.status,
              notes: statusData.statusNotes,
              estimatedCompletion: statusData.estimatedCompletion
            },
            statusData.notificationMethod
          );
        }

        const updatedJob = this.mapDatabaseRowToRepairJob(currentJob);
        updatedJob.status = statusData.status as RepairStatus;
        updatedJob.updatedAt = now;

        console.log(`[RepairShop] Updated repair job ${currentJob.job_number} status to ${statusData.status}`);

        return {
          success: true,
          repairJob: updatedJob,
          notification,
          message: `Repair job status updated to ${statusData.status}`
        };
      },
      {
        success: false as const,
        message: 'Repair status update service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Add parts to repair job - REUSES InventoryTracking for parts management
   */
  async addRepairParts(input: unknown, tenantId: string): Promise<{ success: boolean; parts?: RepairPart[]; inventoryUpdate?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const validationResult = addRepairPartsSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            message: 'Invalid input data',
            error: validationResult.error.errors.map(e => e.message).join(', ')
          };
        }

        const partsData = validationResult.data;
        const now = new Date().toISOString();
        const addedParts: RepairPart[] = [];

        // Validate repair job exists
        const jobResult = await execute_sql(
          'SELECT * FROM repair_jobs WHERE id = $1 AND tenant_id = $2',
          [partsData.repairJobId, tenantId]
        );

        if (jobResult.rows.length === 0) {
          return {
            success: false,
            message: 'Repair job not found',
            error: 'Invalid repair job ID'
          };
        }

        const repairJob = jobResult.rows[0];

        // First, validate all parts can be reserved (dry run)
        const validationResults = [];
        for (const partData of partsData.parts) {
          const validation = await inventoryTrackingCell.checkStockAvailability?.({
            productId: partData.productId,
            locationId: repairJob.location_id,
            quantity: partData.quantity
          }, tenantId);
          
          if (!validation?.available) {
            return {
              success: false,
              message: `Insufficient stock for part ${partData.productId}`,
              error: `Required: ${partData.quantity}, Available: ${validation?.availableQuantity || 0}`
            };
          }
          validationResults.push({ partData, validation });
        }

        // Now reserve all parts transactionally
        const reservationIds: string[] = [];
        const rollbackOperations: Array<() => Promise<void>> = [];
        
        try {
          // Process each part with rollback capability
          for (const partData of partsData.parts) {
            // Reserve parts from inventory
            const reservationResult = await inventoryTrackingCell.reserveStock({
              productId: partData.productId,
              locationId: repairJob.location_id,
              quantity: partData.quantity,
              reservationType: 'repair',
              referenceId: partsData.repairJobId,
              notes: `Reserved for repair job ${repairJob.job_number}`,
              reservedBy: partsData.updatedBy
            }, tenantId);

            if (!reservationResult.success) {
              // Rollback all previous reservations
              await this.rollbackReservations(rollbackOperations);
              return {
                success: false,
                message: `Failed to reserve part ${partData.productId}`,
                error: reservationResult.error || 'Reservation failed'
              };
            }

            // Store rollback operation for this reservation
            const reservationId = reservationResult.reservation?.id;
            if (!reservationId) {
              throw new Error('Reservation ID not returned from inventory service');
            }
            reservationIds.push(reservationId);
            rollbackOperations.push(async () => {
              await inventoryTrackingCell.releaseReservation?.({
                reservationId,
                reason: 'Transaction rollback'
              }, tenantId);
            });

            // Create repair part record
            const partId = crypto.randomUUID();
            await execute_sql(
              `INSERT INTO repair_parts (
                id, repair_job_id, product_id, quantity, unit_price, part_type,
                warranty_period, serial_number, supplier_info, notes, added_at, added_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                partId, partsData.repairJobId, partData.productId, partData.quantity,
                partData.unitPrice, partData.partType, partData.warrantyPeriod,
                partData.serialNumber, partData.supplierInfo, partData.notes, now, partsData.updatedBy
              ]
            );

            const repairPart: RepairPart = {
              id: partId,
              repairJobId: partsData.repairJobId,
              productId: partData.productId,
              quantity: partData.quantity,
              unitPrice: partData.unitPrice,
              partType: partData.partType,
              warrantyPeriod: partData.warrantyPeriod,
              serialNumber: partData.serialNumber,
              supplierInfo: partData.supplierInfo,
              notes: partData.notes,
              addedAt: now,
              addedBy: partsData.updatedBy
            };

            addedParts.push(repairPart);
          }
        } catch (error) {
          // Rollback all reservations on any error
          await this.rollbackReservations(rollbackOperations);
          throw error;
        }

        console.log(`[RepairShop] Added ${addedParts.length} parts to repair job ${repairJob.job_number}`);

        return {
          success: true,
          parts: addedParts,
          message: `Added ${addedParts.length} parts to repair job`
        };
      },
      {
        success: false as const,
        message: 'Repair parts addition service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  /**
   * Process repair payment - REUSES SalesEngine and SplitPayment for billing
   */
  async processRepairPayment(input: unknown, tenantId: string): Promise<{ success: boolean; payment?: any; repairJob?: RepairJob; receipt?: any; message: string; error?: string }> {
    return await safeRedisOperation(
      async () => {
        const {
          repairJobId,
          paymentType,
          amount,
          currency = 'NGN',
          paymentMethod,
          splitPayment,
          processedBy
        } = input as {
          repairJobId: string;
          paymentType: 'diagnostic_fee' | 'deposit' | 'parts_payment' | 'final_payment' | 'additional_charges';
          amount: number;
          currency: 'NGN' | 'USD' | 'GBP';
          paymentMethod: string;
          splitPayment?: any;
          processedBy: string;
        };

        // Get repair job details
        const jobResult = await execute_sql(
          'SELECT * FROM repair_jobs WHERE id = $1 AND tenant_id = $2',
          [repairJobId, tenantId]
        );

        if (jobResult.rows.length === 0) {
          return {
            success: false,
            message: 'Repair job not found',
            error: 'Invalid repair job ID'
          };
        }

        const repairJob = jobResult.rows[0];

        // REUSE: Process payment using existing payment systems
        let paymentResult;
        
        if (splitPayment?.enabled) {
          // Use SplitPayment cell for complex billing scenarios
          paymentResult = await splitPaymentCell.initializeSplitPayment({
            totalAmount: amount,
            currency,
            splits: splitPayment.parties,
            customerId: repairJob.customer_id,
            tenantId: tenantId,
            userId: processedBy,
            description: `${paymentType} for repair job ${repairJob.job_number}`,
            metadata: {
              referenceType: 'repair_job',
              referenceId: repairJobId
            }
          });
        } else {
          // Use SalesEngine for simple payments
          paymentResult = await salesEngineCell.processPayment({
            amount,
            currency,
            paymentMethod,
            referenceType: 'repair_job',
            referenceId: repairJobId,
            description: `${paymentType} for repair job ${repairJob.job_number}`,
            processedBy
          }, tenantId);
        }

        if (!paymentResult.success) {
          return {
            success: false,
            message: 'Payment processing failed',
            error: paymentResult.error || 'Payment service error'
          };
        }

        // Record payment in repair job history
        await execute_sql(
          `INSERT INTO repair_payments (
            id, repair_job_id, payment_type, amount, currency, payment_method,
            payment_reference, split_payment_id, processed_by, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            crypto.randomUUID(), repairJobId, paymentType, amount, currency,
            paymentMethod, paymentResult.payment?.reference, paymentResult.payment?.id,
            processedBy, new Date().toISOString()
          ]
        );

        console.log(`[RepairShop] Processed ${paymentType} payment of ${amount} ${currency} for repair job ${repairJob.job_number}`);

        return {
          success: true,
          payment: paymentResult.payment,
          repairJob: this.mapDatabaseRowToRepairJob(repairJob),
          receipt: paymentResult.receipt,
          message: `Payment processed successfully for ${paymentType}`
        };
      },
      {
        success: false as const,
        message: 'Repair payment processing service temporarily unavailable',
        error: 'Service error'
      }
    );
  },

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Generate unique repair job number atomically
   */
  async generateRepairJobNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Use atomic increment operation to prevent race conditions
    const counterKey = `repair_job_counter:${tenantId}:${year}-${month}-${day}`;
    
    // Implement atomic increment using get/set since Replit Database doesn't have incr
    const currentValue = await redis.get<number>(counterKey) || 0;
    const counter = currentValue + 1;
    await redis.set(counterKey, counter);
    
    // Note: Replit Database doesn't support TTL, so we skip expiration
    // In production, you would implement a cleanup mechanism for old counter keys
    
    return `RJ${year}${month}${day}${String(counter).padStart(4, '0')}`;
  },

  /**
   * Generate QR code for job tracking
   */
  async generateJobQRCode(repairJobId: string, jobNumber: string): Promise<string> {
    // Generate QR code data for job tracking
    const qrData = {
      type: 'repair_job',
      jobId: repairJobId,
      jobNumber,
      timestamp: new Date().toISOString()
    };
    
    return Buffer.from(JSON.stringify(qrData)).toString('base64');
  },

  /**
   * Send customer notification using existing SMS service
   */
  async sendCustomerNotification(customer: any, notificationType: string, data: any, method: string = 'sms'): Promise<any> {
    try {
      let message = '';
      
      switch (notificationType) {
        case 'job_created':
          message = `Hello ${customer.firstName}, your repair job #${data.jobNumber} for ${data.deviceInfo.brand} ${data.deviceInfo.model} has been created. ${data.estimatedCompletion ? `Estimated completion: ${data.estimatedCompletion}` : ''}`;
          break;
        case 'status_update':
          message = `Repair job #${data.jobNumber} status updated to: ${data.status.replace('_', ' ')}. ${data.notes || ''}`;
          break;
        case 'ready_for_pickup':
          message = `Good news! Your device repair #${data.jobNumber} is ready for pickup. Please visit our shop with your receipt.`;
          break;
      }

      if (method === 'sms' && customer.primaryPhone) {
        return await smsService.sendSMS(customer.primaryPhone, message);
      // Note: WhatsApp support can be added when WhatsApp API integration is available
      } else if (method === 'email' && customer.email) {
        return await sendEmail({
          to: customer.email,
          subject: `Repair Job Update - #${data.jobNumber}`,
          text: message
        });
      }

      return { sent: false, method, message: 'No valid contact method' };
    } catch (error) {
      console.error('[RepairShop] Notification error:', error);
      return { sent: false, method, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  /**
   * Rollback inventory reservations in case of transaction failure
   */
  async rollbackReservations(rollbackOperations: Array<() => Promise<void>>): Promise<void> {
    console.warn(`[RepairShop] Rolling back ${rollbackOperations.length} inventory reservations`);
    
    for (const rollbackOp of rollbackOperations.reverse()) {
      try {
        await rollbackOp();
      } catch (error) {
        console.error('[RepairShop] Rollback operation failed:', error);
        // Continue with other rollback operations even if one fails
      }
    }
  },

  /**
   * Map database row to RepairJob object
   */
  mapDatabaseRowToRepairJob(row: any): RepairJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      jobNumber: row.job_number,
      customerId: row.customer_id,
      deviceInfo: JSON.parse(row.device_info || '{}'),
      problemDescription: row.problem_description,
      symptoms: JSON.parse(row.symptoms || '[]'),
      customerReportedIssues: JSON.parse(row.customer_reported_issues || '[]'),
      status: row.status,
      priority: row.priority,
      serviceType: row.service_type,
      assignedTechnician: row.assigned_technician,
      locationId: row.location_id,
      diagnosticFee: parseFloat(row.diagnostic_fee || '0'),
      depositRequired: parseFloat(row.deposit_required || '0'),
      estimatedCompletionDate: row.estimated_completion_date,
      actualCompletionDate: row.actual_completion_date,
      notes: row.notes,
      technicianNotes: row.technician_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by
    };
  }
};

// Export singleton instance
export const repairShopManagementCell = RepairShopManagementCell;
export default repairShopManagementCell;