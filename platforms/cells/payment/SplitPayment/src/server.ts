import { z } from 'zod';
import crypto from 'crypto';
import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';
import { 
  bankersRoundCurrency, 
  bankersRound, 
  reconcileSplitAmounts, 
  calculatePercentageAmount,
  validateAmountReconciliation 
} from '@/lib/banker-rounding';

// CRITICAL: Validate PaymentGatewayCore dependencies before proceeding
const REQUIRED_PAYMENT_ENV_VARS = [
  'PAYSTACK_SECRET_KEY',
  'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY', 
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_PUBLIC_KEY',
  'INTERSWITCH_CLIENT_ID',
  'INTERSWITCH_CLIENT_SECRET',
  'PAYSTACK_WEBHOOK_SECRET',
  'FLUTTERWAVE_WEBHOOK_SECRET',
  'INTERSWITCH_WEBHOOK_SECRET'
];

function validatePaymentGatewayDependencies(): { valid: boolean; missingVars: string[]; error?: string } {
  const missingVars = REQUIRED_PAYMENT_ENV_VARS.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const error = `🚨 CRITICAL: SplitPayment requires PaymentGatewayCore environment variables.\n` +
      `Missing: ${missingVars.join(', ')}\n` +
      `SplitPayment cannot process payments without these configured.`;
    
    console.error(error);
    return { valid: false, missingVars, error };
  }
  
  return { valid: true, missingVars: [] };
}

// CRITICAL: Import PaymentGatewayCore Cell for Nigerian payment processing
let paymentGatewayCell: any;
let paymentGatewayAvailable = false;
try {
  // First validate environment before attempting import
  const envCheck = validatePaymentGatewayDependencies();
  if (!envCheck.valid) {
    console.error('[SplitPayment] PaymentGatewayCore dependencies not satisfied');
    paymentGatewayCell = null;
    paymentGatewayAvailable = false;
  } else {
    const module = await import('../../PaymentGatewayCore/src/server');
    paymentGatewayCell = module.default || module;
    paymentGatewayAvailable = true;
    console.log('[SplitPayment] PaymentGatewayCore loaded successfully');
  }
} catch (error) {
  console.error('[SplitPayment] PaymentGatewayCore Cell not available:', error);
  paymentGatewayCell = null;
  paymentGatewayAvailable = false;
}

// Environment configuration with secure defaults
const SPLIT_PAYMENT_CONFIG = {
  MAX_PARTIES: parseInt(process.env.SPLIT_PAYMENT_MAX_PARTIES || '10'),
  LAYAWAY_DEFAULT_PERIOD_DAYS: parseInt(process.env.LAYAWAY_DEFAULT_PERIOD_DAYS || '90'),
  INSTALLMENT_MAX_DURATION_MONTHS: parseInt(process.env.INSTALLMENT_MAX_DURATION_MONTHS || '24'),
  PAYMENT_REMINDER_INTERVAL_DAYS: parseInt(process.env.PAYMENT_REMINDER_INTERVAL_DAYS || '7'),
  MIN_SPLIT_AMOUNT: 1.00,
  MIN_INSTALLMENT_AMOUNT: 10.00,
  MIN_DEPOSIT_PERCENTAGE: 10,
  MAX_DEPOSIT_PERCENTAGE: 50
};

// Enhanced validation schemas for complex payment scenarios
const PaymentSplitSchema = z.object({
  recipient: z.object({
    id: z.string().min(1),
    type: z.enum(['merchant', 'partner', 'platform', 'service_fee', 'tax', 'custom']),
    name: z.string().min(1),
    email: z.string().email().optional(),
    bankAccount: z.object({
      accountNumber: z.string().min(10),
      bankCode: z.string().min(3),
      accountName: z.string().min(1)
    }).optional()
  }),
  type: z.enum(['percentage', 'fixed_amount', 'remaining', 'commission']),
  value: z.number().min(0),
  minimumAmount: z.number().min(0).optional(),
  maximumAmount: z.number().min(0).optional(),
  description: z.string().max(200).optional(),
  metadata: z.record(z.any()).optional()
});

const SplitPaymentIntentSchema = z.object({
  totalAmount: z.number().min(1.00),
  currency: z.enum(['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']).default('NGN'),
  provider: z.enum(['paystack', 'flutterwave', 'interswitch']),
  splits: z.array(PaymentSplitSchema).min(2).max(SPLIT_PAYMENT_CONFIG.MAX_PARTIES),
  description: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  customerId: z.string().min(1),
  merchantId: z.string().min(1).optional(),
  reference: z.string().optional(),
  tenantId: z.string().min(1),
  userId: z.string().min(1)
});

const InstallmentPlanSchema = z.object({
  totalAmount: z.number().min(1.00),
  numberOfInstallments: z.number().int().min(2).max(SPLIT_PAYMENT_CONFIG.INSTALLMENT_MAX_DURATION_MONTHS),
  frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'custom']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  downPayment: z.number().min(0).optional().default(0),
  interestRate: z.number().min(0).max(50).optional().default(0),
  lateFeeAmount: z.number().min(0).optional().default(0),
  lateFeeType: z.enum(['fixed', 'percentage']).default('fixed'),
  earlyPaymentDiscount: z.number().min(0).max(100).optional().default(0),
  currency: z.enum(['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']).default('NGN'),
  customerId: z.string().min(1),
  description: z.string().max(500).optional(),
  tenantId: z.string().min(1),
  userId: z.string().min(1)
});

const LayawayOrderSchema = z.object({
  totalAmount: z.number().min(1.00),
  minimumDeposit: z.number().min(1.00),
  depositPercentage: z.number().min(SPLIT_PAYMENT_CONFIG.MIN_DEPOSIT_PERCENTAGE).max(SPLIT_PAYMENT_CONFIG.MAX_DEPOSIT_PERCENTAGE).default(10),
  layawayPeriodDays: z.number().int().min(7).max(SPLIT_PAYMENT_CONFIG.LAYAWAY_DEFAULT_PERIOD_DAYS * 2).default(SPLIT_PAYMENT_CONFIG.LAYAWAY_DEFAULT_PERIOD_DAYS),
  products: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    price: z.number().min(0.01),
    quantity: z.number().int().min(1),
    sku: z.string().optional(),
    category: z.string().optional()
  })).min(1),
  currency: z.enum(['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']).default('NGN'),
  customerId: z.string().min(1),
  merchantId: z.string().min(1).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reminderSchedule: z.array(z.number().int()).optional().default([14, 7, 3, 1]),
  autoRenew: z.boolean().default(false),
  tenantId: z.string().min(1),
  userId: z.string().min(1)
});

const MultiMethodPaymentSchema = z.object({
  totalAmount: z.number().min(1.00),
  currency: z.enum(['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']).default('NGN'),
  paymentMethods: z.array(z.object({
    method: z.enum(['card', 'bank', 'ussd', 'mobile_money', 'wallet', 'credit', 'points', 'gift_card']),
    amount: z.number().min(0.01),
    provider: z.enum(['paystack', 'flutterwave', 'interswitch']).optional(),
    accountDetails: z.record(z.any()).optional()
  })).min(2).max(5),
  customerId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1)
});

// Core interfaces for split payment system
interface SplitCalculationResult {
  splits: Array<{
    recipientId: string;
    recipientType: string;
    calculatedAmount: number;
    originalValue: number;
    splitType: string;
    roundingAdjustment?: number;
  }>;
  totalCalculated: number;
  roundingDifference: number;
  validationPassed: boolean;
  errors: string[];
}

interface InstallmentSchedule {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  remainingBalance: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidDate?: string;
  paidAmount?: number;
}

interface LayawayStatus {
  id: string;
  customerId: string;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  nextPaymentDue?: string;
  expiryDate: string;
  products: any[];
  paymentHistory: Array<{
    date: string;
    amount: number;
    method: string;
    reference: string;
  }>;
}

// Generate secure transaction references for multi-party payments
function generateSplitReference(tenantId?: string): string {
  const tenantPrefix = tenantId ? tenantId.substring(0, 8).toUpperCase() : 'MAIN';
  return `SPLIT_${tenantPrefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

function generateInstallmentReference(tenantId?: string): string {
  const tenantPrefix = tenantId ? tenantId.substring(0, 8).toUpperCase() : 'MAIN';
  return `INST_${tenantPrefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function generateLayawayReference(tenantId?: string): string {
  const tenantPrefix = tenantId ? tenantId.substring(0, 8).toUpperCase() : 'MAIN';
  return `LAY_${tenantPrefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

// Enterprise-grade split calculation with banker's rounding for financial precision
function calculateSplitAmounts(totalAmount: number, splits: any[]): SplitCalculationResult {
  const calculatedSplits: any[] = [];
  const errors: string[] = [];
  
  // Validate total amount
  if (totalAmount <= 0) {
    return {
      splits: [],
      totalCalculated: 0,
      roundingDifference: 0,
      validationPassed: false,
      errors: ['Total amount must be greater than zero']
    };
  }
  
  // Sort splits by type priority: fixed_amount > percentage > commission > remaining
  const sortedSplits = [...splits].sort((a, b) => {
    const priority = { fixed_amount: 1, percentage: 2, commission: 3, remaining: 4 };
    return (priority[a.type] || 5) - (priority[b.type] || 5);
  });
  
  let remainingAmount = totalAmount;
  
  // First pass: Calculate fixed amounts and percentages
  for (const split of sortedSplits) {
    if (split.type === 'remaining') continue; // Handle these in second pass
    
    let calculatedAmount = 0;
    
    try {
      switch (split.type) {
        case 'fixed_amount':
          calculatedAmount = Math.min(split.value, remainingAmount);
          if (split.minimumAmount && calculatedAmount < split.minimumAmount) {
            errors.push(`Fixed amount split for ${split.recipient.name} is below minimum: ${bankersRoundCurrency(calculatedAmount)} < ${split.minimumAmount}`);
          }
          break;
          
        case 'percentage':
          // Use banker's rounding for percentage calculations
          calculatedAmount = calculatePercentageAmount(totalAmount, split.value);
          
          // Apply minimum/maximum constraints with banker's rounding
          if (split.minimumAmount && calculatedAmount < split.minimumAmount) {
            calculatedAmount = bankersRoundCurrency(split.minimumAmount);
          }
          if (split.maximumAmount && calculatedAmount > split.maximumAmount) {
            calculatedAmount = bankersRoundCurrency(split.maximumAmount);
          }
          break;
          
        case 'commission':
          // Commission with banker's rounding for enterprise precision
          calculatedAmount = calculatePercentageAmount(totalAmount, split.value);
          break;
          
        default:
          errors.push(`Unknown split type: ${split.type}`);
          continue;
      }
      
      // Apply banker's rounding to calculated amount
      calculatedAmount = bankersRoundCurrency(calculatedAmount);
      
      // Ensure split doesn't exceed remaining amount
      if (calculatedAmount > remainingAmount) {
        const originalAmount = calculatedAmount;
        calculatedAmount = bankersRoundCurrency(remainingAmount);
        errors.push(`Split for ${split.recipient.name} reduced from ${originalAmount} to ${calculatedAmount} due to insufficient remaining amount`);
      }
      
      calculatedSplits.push({
        recipientId: split.recipient.id,
        recipientType: split.recipient.type,
        recipientName: split.recipient.name,
        calculatedAmount,
        originalValue: split.value,
        splitType: split.type,
        minimumAmount: split.minimumAmount,
        maximumAmount: split.maximumAmount,
        description: split.description,
        bankAccount: split.recipient.bankAccount
      });
      
      remainingAmount = bankersRoundCurrency(remainingAmount - calculatedAmount);
      
    } catch (error) {
      errors.push(`Error calculating split for ${split.recipient.name}: ${error.message}`);
    }
  }
  
  // Second pass: Handle remaining splits with perfect distribution
  const remainingSplits = sortedSplits.filter(s => s.type === 'remaining');
  if (remainingSplits.length > 0) {
    if (remainingAmount <= 0) {
      errors.push('No remaining amount available for "remaining" type splits');
    } else {
      // Distribute remaining amount equally with banker's rounding
      const baseAmount = remainingAmount / remainingSplits.length;
      let distributedTotal = 0;
      
      for (let i = 0; i < remainingSplits.length; i++) {
        const split = remainingSplits[i];
        let calculatedAmount;
        
        if (i === remainingSplits.length - 1) {
          // Last split gets exact remaining amount for perfect reconciliation
          calculatedAmount = bankersRoundCurrency(remainingAmount - distributedTotal);
        } else {
          calculatedAmount = bankersRoundCurrency(baseAmount);
          distributedTotal += calculatedAmount;
        }
        
        calculatedSplits.push({
          recipientId: split.recipient.id,
          recipientType: split.recipient.type,
          recipientName: split.recipient.name,
          calculatedAmount,
          originalValue: split.value,
          splitType: split.type,
          description: split.description,
          bankAccount: split.recipient.bankAccount
        });
      }
    }
  }
  
  // Final reconciliation with perfect precision
  try {
    const reconciledSplits = reconcileSplitAmounts(totalAmount, calculatedSplits);
    
    // Validate final reconciliation
    const validation = validateAmountReconciliation(
      reconciledSplits.map(s => s.calculatedAmount),
      totalAmount
    );
    
    return {
      splits: reconciledSplits,
      totalCalculated: validation.actualTotal,
      roundingDifference: validation.difference,
      validationPassed: validation.isValid && errors.length === 0,
      errors: validation.isValid ? errors : [...errors, validation.message]
    };
    
  } catch (reconciliationError) {
    errors.push(`Split reconciliation failed: ${reconciliationError.message}`);
    
    // Return unreconciled splits with errors
    const totalCalculated = calculatedSplits.reduce((sum, split) => sum + split.calculatedAmount, 0);
    
    return {
      splits: calculatedSplits,
      totalCalculated: bankersRoundCurrency(totalCalculated),
      roundingDifference: bankersRoundCurrency(Math.abs(totalAmount - totalCalculated)),
      validationPassed: false,
      errors
    };
  }
}

// Generate installment schedule with compound interest calculation
function generateInstallmentSchedule(planData: any): InstallmentSchedule[] {
  const { 
    totalAmount, 
    numberOfInstallments, 
    downPayment = 0, 
    interestRate = 0, 
    frequency, 
    startDate 
  } = planData;
  
  const schedule: InstallmentSchedule[] = [];
  const principalAmount = totalAmount - downPayment;
  const monthlyInterestRate = interestRate / 100 / 12;
  
  let frequencyDays: number;
  switch (frequency) {
    case 'weekly': frequencyDays = 7; break;
    case 'bi_weekly': frequencyDays = 14; break;
    case 'monthly': frequencyDays = 30; break;
    default: frequencyDays = 30; break;
  }
  
  if (interestRate > 0) {
    // Calculate payment amount using loan formula
    const paymentAmount = principalAmount * 
      (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfInstallments)) /
      (Math.pow(1 + monthlyInterestRate, numberOfInstallments) - 1);
    
    let remainingBalance = principalAmount;
    
    for (let i = 1; i <= numberOfInstallments; i++) {
      const interestAmount = remainingBalance * monthlyInterestRate;
      const principalPayment = paymentAmount - interestAmount;
      remainingBalance -= principalPayment;
      
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (i * frequencyDays));
      
      schedule.push({
        installmentNumber: i,
        dueDate: dueDate.toISOString().split('T')[0],
        principalAmount: bankersRoundCurrency(principalPayment),
        interestAmount: bankersRoundCurrency(interestAmount),
        totalAmount: bankersRoundCurrency(paymentAmount),
        remainingBalance: Math.max(0, bankersRoundCurrency(remainingBalance)),
        status: 'pending'
      });
    }
  } else {
    // Simple equal payment split for 0% interest
    const paymentAmount = principalAmount / numberOfInstallments;
    let remainingBalance = principalAmount;
    
    for (let i = 1; i <= numberOfInstallments; i++) {
      let installmentAmount = paymentAmount;
      
      // Last installment gets any rounding difference
      if (i === numberOfInstallments) {
        installmentAmount = remainingBalance;
      }
      
      remainingBalance -= installmentAmount;
      
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (i * frequencyDays));
      
      schedule.push({
        installmentNumber: i,
        dueDate: dueDate.toISOString().split('T')[0],
        principalAmount: bankersRoundCurrency(installmentAmount),
        interestAmount: 0,
        totalAmount: bankersRoundCurrency(installmentAmount),
        remainingBalance: Math.max(0, bankersRoundCurrency(remainingBalance)),
        status: 'pending'
      });
    }
  }
  
  return schedule;
}

// Calculate layaway payment schedule and expiry
function calculateLayawaySchedule(orderData: any): any {
  const { 
    totalAmount, 
    depositPercentage, 
    layawayPeriodDays, 
    minimumDeposit 
  } = orderData;
  
  const calculatedDeposit = (totalAmount * depositPercentage) / 100;
  const requiredDeposit = Math.max(calculatedDeposit, minimumDeposit);
  const remainingAmount = totalAmount - requiredDeposit;
  
  const startDate = new Date();
  const expiryDate = new Date();
  expiryDate.setDate(startDate.getDate() + layawayPeriodDays);
  
  // Suggest payment schedule (monthly payments)
  const monthsAvailable = Math.floor(layawayPeriodDays / 30);
  const suggestedMonthlyPayment = monthsAvailable > 0 ? remainingAmount / monthsAvailable : remainingAmount;
  
  return {
    requiredDeposit,
    remainingAmount,
    expiryDate: expiryDate.toISOString().split('T')[0],
    suggestedPaymentSchedule: {
      frequency: 'monthly',
      amount: bankersRoundCurrency(suggestedMonthlyPayment),
      payments: monthsAvailable
    },
    totalAmount
  };
}

// Main SplitPayment Cell class
export class SplitPaymentCell {
  private readonly redisPrefix = 'split_payment:';
  
  constructor() {
    console.log('[SplitPayment] Cell initialized with configuration:', SPLIT_PAYMENT_CONFIG);
  }
  
  // Initialize split payment with comprehensive validation
  async initializeSplitPayment(payload: unknown): Promise<any> {
    return safeRedisOperation(async () => {
      const validation = SplitPaymentIntentSchema.safeParse(payload);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid split payment data: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }
      
      const { totalAmount, currency, provider, splits, tenantId, userId, customerId } = validation.data;
      
      // Calculate split amounts with precision
      const splitCalculation = calculateSplitAmounts(totalAmount, splits);
      
      if (!splitCalculation.validationPassed) {
        return {
          success: false,
          message: 'Split calculation failed: ' + splitCalculation.errors.join(', '),
          data: { errors: splitCalculation.errors }
        };
      }
      
      const reference = generateSplitReference(tenantId);
      
      // Create split payment record
      const splitPayment = {
        id: reference,
        reference,
        tenantId,
        userId,
        customerId,
        totalAmount,
        currency,
        provider,
        status: 'initialized',
        splits: splitCalculation.splits,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: validation.data.metadata || {}
      };
      
      // Store in Redis with tenant isolation
      await redis.set(`${this.redisPrefix}${tenantId}:${reference}`, splitPayment);
      // Note: Replit Database doesn't support TTL, data will persist until manually cleaned
      
      // If PaymentGatewayCore is available, initialize the primary payment
      let paymentInitialization = null;
      if (paymentGatewayCell) {
        try {
          paymentInitialization = await paymentGatewayCell.call('initializePayment', {
            amount: totalAmount,
            currency,
            provider,
            email: validation.data.metadata?.email || `${customerId}@example.com`,
            reference,
            tenantId,
            userId,
            metadata: { 
              type: 'split_payment',
              splitCount: splits.length,
              ...validation.data.metadata 
            }
          });
        } catch (error) {
          console.warn('[SplitPayment] PaymentGatewayCore initialization failed:', error);
        }
      }
      
      return {
        success: true,
        message: 'Split payment initialized successfully',
        data: {
          reference,
          totalAmount,
          currency,
          provider,
          splits: splitCalculation.splits,
          splitCalculation: {
            totalCalculated: splitCalculation.totalCalculated,
            roundingDifference: splitCalculation.roundingDifference
          },
          paymentUrl: paymentInitialization?.data?.authorization_url || paymentInitialization?.data?.link,
          status: 'initialized'
        }
      };
    }, {
      success: false,
      message: 'Split payment service temporarily unavailable'
    });
  }
  
  // Calculate split amounts without initializing payment
  async calculateSplitAmounts(payload: unknown): Promise<any> {
    const validation = z.object({
      totalAmount: z.number().min(1.00),
      splits: z.array(PaymentSplitSchema).min(2).max(SPLIT_PAYMENT_CONFIG.MAX_PARTIES),
      currency: z.enum(['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'GHS', 'UGX', 'RWF']).default('NGN'),
      tenantId: z.string().min(1)
    }).safeParse(payload);
    
    if (!validation.success) {
      return {
        success: false,
        message: 'Invalid calculation data: ' + validation.error.errors.map(e => e.message).join(', ')
      };
    }
    
    const { totalAmount, splits } = validation.data;
    const splitCalculation = calculateSplitAmounts(totalAmount, splits);
    
    return {
      success: true,
      message: 'Split amounts calculated successfully',
      data: {
        totalAmount,
        splits: splitCalculation.splits,
        totalCalculated: splitCalculation.totalCalculated,
        roundingDifference: splitCalculation.roundingDifference,
        validationPassed: splitCalculation.validationPassed,
        errors: splitCalculation.errors
      }
    };
  }
  
  // Create installment payment plan
  async createInstallmentPlan(payload: unknown): Promise<any> {
    return safeRedisOperation(async () => {
      const validation = InstallmentPlanSchema.safeParse(payload);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid installment plan data: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }
      
      const planData = validation.data;
      const reference = generateInstallmentReference(planData.tenantId);
      
      // Generate installment schedule
      const schedule = generateInstallmentSchedule(planData);
      
      const installmentPlan = {
        id: reference,
        reference,
        tenantId: planData.tenantId,
        userId: planData.userId,
        customerId: planData.customerId,
        totalAmount: planData.totalAmount,
        downPayment: planData.downPayment || 0,
        numberOfInstallments: planData.numberOfInstallments,
        frequency: planData.frequency,
        interestRate: planData.interestRate || 0,
        currency: planData.currency,
        status: 'active',
        schedule,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { description: planData.description }
      };
      
      // Store installment plan
      await redis.set(`${this.redisPrefix}installment:${planData.tenantId}:${reference}`, installmentPlan);
      // Note: Replit Database doesn't support TTL, data will persist until manually cleaned
      
      return {
        success: true,
        message: 'Installment plan created successfully',
        data: {
          reference,
          totalAmount: planData.totalAmount,
          downPayment: planData.downPayment || 0,
          numberOfInstallments: planData.numberOfInstallments,
          schedule,
          nextPaymentDue: schedule[0]?.dueDate,
          nextPaymentAmount: schedule[0]?.totalAmount
        }
      };
    }, {
      success: false,
      message: 'Installment plan service temporarily unavailable'
    });
  }
  
  // Process partial payment for installments
  async processPartialPayment(payload: unknown): Promise<any> {
    return safeRedisOperation(async () => {
      const validation = z.object({
        installmentReference: z.string().min(1),
        amount: z.number().min(0.01),
        paymentMethod: z.enum(['card', 'bank', 'ussd', 'mobile_money', 'wallet']),
        provider: z.enum(['paystack', 'flutterwave', 'interswitch']),
        tenantId: z.string().min(1),
        userId: z.string().min(1)
      }).safeParse(payload);
      
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid partial payment data: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }
      
      const { installmentReference, amount, tenantId } = validation.data;
      
      // Get installment plan
      const installmentPlan = await redis.get(`${this.redisPrefix}installment:${tenantId}:${installmentReference}`);
      if (!installmentPlan) {
        return {
          success: false,
          message: 'Installment plan not found'
        };
      }
      
      // Find next unpaid installment
      const schedule = installmentPlan.schedule || [];
      const nextInstallment = schedule.find((inst: any) => inst.status === 'pending');
      
      if (!nextInstallment) {
        return {
          success: false,
          message: 'No pending installments found'
        };
      }
      
      // Validate payment amount
      if (amount < nextInstallment.totalAmount * 0.5) {
        return {
          success: false,
          message: `Minimum payment amount is ${nextInstallment.totalAmount * 0.5}`
        };
      }
      
      // Process payment through PaymentGatewayCore if available
      let paymentResult = null;
      if (paymentGatewayCell) {
        try {
          paymentResult = await paymentGatewayCell.call('initializePayment', {
            amount,
            currency: installmentPlan.currency,
            provider: validation.data.provider,
            email: `${installmentPlan.customerId}@example.com`,
            reference: `${installmentReference}_${nextInstallment.installmentNumber}`,
            tenantId,
            userId: validation.data.userId,
            metadata: {
              type: 'installment_payment',
              installmentReference,
              installmentNumber: nextInstallment.installmentNumber
            }
          });
        } catch (error) {
          console.warn('[SplitPayment] Payment processing failed:', error);
        }
      }
      
      return {
        success: true,
        message: 'Partial payment initialized successfully',
        data: {
          installmentReference,
          installmentNumber: nextInstallment.installmentNumber,
          amount,
          dueAmount: nextInstallment.totalAmount,
          paymentUrl: paymentResult?.data?.authorization_url || paymentResult?.data?.link,
          nextDueDate: nextInstallment.dueDate
        }
      };
    }, {
      success: false,
      message: 'Partial payment service temporarily unavailable'
    });
  }
  
  // Initialize layaway order
  async initializeLayaway(payload: unknown): Promise<any> {
    return safeRedisOperation(async () => {
      const validation = LayawayOrderSchema.safeParse(payload);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid layaway data: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }
      
      const orderData = validation.data;
      const reference = generateLayawayReference(orderData.tenantId);
      
      // Calculate layaway schedule
      const layawaySchedule = calculateLayawaySchedule(orderData);
      
      const layawayOrder = {
        id: reference,
        reference,
        tenantId: orderData.tenantId,
        userId: orderData.userId,
        customerId: orderData.customerId,
        merchantId: orderData.merchantId,
        totalAmount: orderData.totalAmount,
        paidAmount: 0,
        remainingAmount: orderData.totalAmount,
        requiredDeposit: layawaySchedule.requiredDeposit,
        status: 'active',
        products: orderData.products,
        expiryDate: layawaySchedule.expiryDate,
        reminderSchedule: orderData.reminderSchedule,
        autoRenew: orderData.autoRenew,
        paymentHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          suggestedPaymentSchedule: layawaySchedule.suggestedPaymentSchedule
        }
      };
      
      // Store layaway order
      await redis.set(`${this.redisPrefix}layaway:${orderData.tenantId}:${reference}`, layawayOrder);
      // Note: Replit Database doesn't support TTL, data will persist until manually cleaned
      
      return {
        success: true,
        message: 'Layaway order created successfully',
        data: {
          reference,
          totalAmount: orderData.totalAmount,
          requiredDeposit: layawaySchedule.requiredDeposit,
          remainingAmount: layawaySchedule.remainingAmount,
          expiryDate: layawaySchedule.expiryDate,
          products: orderData.products,
          suggestedPaymentSchedule: layawaySchedule.suggestedPaymentSchedule
        }
      };
    }, {
      success: false,
      message: 'Layaway service temporarily unavailable'
    });
  }
  
  // Get split payment status
  async getSplitPaymentStatus(payload: unknown): Promise<any> {
    return safeRedisOperation(async () => {
      const validation = z.object({
        reference: z.string().min(1),
        tenantId: z.string().min(1)
      }).safeParse(payload);
      
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid status request: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }
      
      const { reference, tenantId } = validation.data;
      
      const splitPayment = await redis.get(`${this.redisPrefix}${tenantId}:${reference}`);
      if (!splitPayment) {
        return {
          success: false,
          message: 'Split payment not found'
        };
      }
      
      return {
        success: true,
        message: 'Split payment status retrieved successfully',
        data: splitPayment
      };
    }, {
      success: false,
      message: 'Status service temporarily unavailable'
    });
  }
  
  // Process multi-method payment
  async processMultiMethodPayment(payload: unknown): Promise<any> {
    return safeRedisOperation(async () => {
      const validation = MultiMethodPaymentSchema.safeParse(payload);
      if (!validation.success) {
        return {
          success: false,
          message: 'Invalid multi-method payment data: ' + validation.error.errors.map(e => e.message).join(', ')
        };
      }
      
      const { totalAmount, paymentMethods, tenantId, userId, customerId } = validation.data;
      
      // Validate total amounts match
      const totalMethodAmount = paymentMethods.reduce((sum, method) => sum + method.amount, 0);
      if (Math.abs(totalAmount - totalMethodAmount) > 0.01) {
        return {
          success: false,
          message: `Payment method amounts (${totalMethodAmount}) do not match total amount (${totalAmount})`
        };
      }
      
      const reference = generateSplitReference(tenantId);
      
      // Create multi-method payment record
      const multiMethodPayment = {
        id: reference,
        reference,
        tenantId,
        userId,
        customerId,
        totalAmount,
        currency: validation.data.currency,
        paymentMethods,
        status: 'initialized',
        processedMethods: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Store multi-method payment
      await redis.set(`${this.redisPrefix}multi:${tenantId}:${reference}`, multiMethodPayment);
      // Note: Replit Database doesn't support TTL, data will persist until manually cleaned
      
      return {
        success: true,
        message: 'Multi-method payment initialized successfully',
        data: {
          reference,
          totalAmount,
          paymentMethods,
          status: 'initialized',
          nextSteps: 'Process each payment method individually using the reference'
        }
      };
    }, {
      success: false,
      message: 'Multi-method payment service temporarily unavailable'
    });
  }
  
  // Validate split configuration
  async validateSplitConfiguration(payload: unknown): Promise<any> {
    const validation = z.object({
      totalAmount: z.number().min(1.00),
      splits: z.array(PaymentSplitSchema).min(2).max(SPLIT_PAYMENT_CONFIG.MAX_PARTIES)
    }).safeParse(payload);
    
    if (!validation.success) {
      return {
        success: false,
        message: 'Invalid validation data: ' + validation.error.errors.map(e => e.message).join(', ')
      };
    }
    
    const { totalAmount, splits } = validation.data;
    const splitCalculation = calculateSplitAmounts(totalAmount, splits);
    
    return {
      success: splitCalculation.validationPassed,
      message: splitCalculation.validationPassed ? 'Split configuration is valid' : 'Split configuration has errors',
      data: {
        validationPassed: splitCalculation.validationPassed,
        errors: splitCalculation.errors,
        splits: splitCalculation.splits,
        totalCalculated: splitCalculation.totalCalculated,
        roundingDifference: splitCalculation.roundingDifference
      }
    };
  }
  
  // Generic call handler for Cell actions
  async call(action: string, payload: any): Promise<any> {
    console.log(`[SplitPayment] Processing action: ${action}`);
    
    try {
      switch (action) {
        case 'initializeSplitPayment':
          return await this.initializeSplitPayment(payload);
          
        case 'calculateSplitAmounts':
          return await this.calculateSplitAmounts(payload);
          
        case 'createInstallmentPlan':
          return await this.createInstallmentPlan(payload);
          
        case 'processPartialPayment':
          return await this.processPartialPayment(payload);
          
        case 'initializeLayaway':
          return await this.initializeLayaway(payload);
          
        case 'getSplitPaymentStatus':
          return await this.getSplitPaymentStatus(payload);
          
        case 'processMultiMethodPayment':
          return await this.processMultiMethodPayment(payload);
          
        case 'validateSplitConfiguration':
          return await this.validateSplitConfiguration(payload);
          
        default:
          return {
            success: false,
            message: `Unknown action: ${action}`,
            availableActions: [
              'initializeSplitPayment',
              'calculateSplitAmounts', 
              'createInstallmentPlan',
              'processPartialPayment',
              'initializeLayaway',
              'getSplitPaymentStatus',
              'processMultiMethodPayment',
              'validateSplitConfiguration'
            ]
          };
      }
    } catch (error) {
      console.error(`[SplitPayment] Action ${action} failed:`, error);
      return {
        success: false,
        message: `Action ${action} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: process.env.NODE_ENV === 'development' ? error : undefined
      };
    }
  }

  // Check PaymentGatewayCore dependencies
  checkPaymentGatewayDependencies(): { valid: boolean; missingVars: string[]; error?: string } {
    return validatePaymentGatewayDependencies();
  }
}

// Export singleton instance
export const splitPaymentCell = new SplitPaymentCell();
export default splitPaymentCell;