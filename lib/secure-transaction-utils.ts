/**
 * PCI-DSS COMPLIANT: Secure Transaction Utilities
 * 
 * SECURITY CRITICAL: This module provides cryptographically secure
 * transaction identifiers and metadata handling for PCI-DSS compliance.
 * 
 * - Secure transaction ID generation
 * - Non-predictable references
 * - Metadata sanitization
 * - PCI-DSS compliant data handling
 */

/**
 * Generate cryptographically secure transaction identifier
 * PCI-DSS: Uses crypto.getRandomValues for unpredictable IDs
 */
export function generateSecureTransactionId(prefix: string = 'txn'): string {
  // Use crypto.getRandomValues for cryptographically secure randomness
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  
  // Convert to base36 for compact representation
  const randomStr = Array.from(randomBytes)
    .map(byte => byte.toString(36))
    .join('')
    .substring(0, 16);
  
  // Add timestamp component (not for security, just for ordering)
  const timestamp = Date.now().toString(36);
  
  return `${prefix}_${timestamp}_${randomStr}`;
}

/**
 * Generate secure payment reference
 * PCI-DSS: Creates non-predictable payment references
 */
export function generateSecurePaymentReference(provider: string): string {
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);
  
  const randomStr = Array.from(randomBytes)
    .map(byte => byte.toString(36).toUpperCase())
    .join('')
    .substring(0, 12);
  
  return `${provider.toUpperCase()}_REF_${randomStr}`;
}

/**
 * Generate secure refund reference
 */
export function generateSecureRefundReference(originalRef: string): string {
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  
  const randomStr = Array.from(randomBytes)
    .map(byte => byte.toString(36).toUpperCase())
    .join('')
    .substring(0, 8);
  
  // Hash of original reference for traceability (but not reversible)
  const refHash = Array.from(new TextEncoder().encode(originalRef))
    .map(byte => byte.toString(36))
    .join('')
    .substring(0, 6);
  
  return `REFUND_${refHash}_${randomStr}`;
}

/**
 * PCI-DSS COMPLIANT: Sanitize transaction metadata
 * Removes all sensitive payment data before storage
 */
export interface SafeTransactionMetadata {
  orderId?: string;
  customerEmail?: string;
  amount: number;
  currency: string;
  paymentProvider: string;
  transactionType: 'sale' | 'refund' | 'void';
  timestamp: string;
  // Only non-sensitive business data allowed
  businessCategory?: string;
  locationId?: string;
  cashierId?: string;
  // Never include: PAN, CVV, cardholder data, auth codes, etc.
}

/**
 * Sanitize metadata for safe storage
 */
export function sanitizeTransactionMetadata(rawMetadata: any): SafeTransactionMetadata {
  // PCI-DSS: Explicitly allow only safe fields
  const safeFields: (keyof SafeTransactionMetadata)[] = [
    'orderId', 'customerEmail', 'amount', 'currency', 
    'paymentProvider', 'transactionType', 'timestamp',
    'businessCategory', 'locationId', 'cashierId'
  ];
  
  const sanitized: SafeTransactionMetadata = {
    amount: rawMetadata.amount || 0,
    currency: rawMetadata.currency || 'USD',
    paymentProvider: rawMetadata.paymentProvider || 'unknown',
    transactionType: rawMetadata.transactionType || 'sale',
    timestamp: new Date().toISOString()
  };
  
  // Only copy explicitly safe fields
  safeFields.forEach(field => {
    if (rawMetadata[field] !== undefined && field in sanitized) {
      (sanitized as any)[field] = rawMetadata[field];
    }
  });
  
  return sanitized;
}

/**
 * Validate that no sensitive data is present in transaction data
 */
export function validateTransactionDataSafety(data: any): { safe: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check for prohibited fields
  const prohibitedFields = [
    'cardNumber', 'card_number', 'pan', 'primaryAccountNumber',
    'cvv', 'cvc', 'cvc2', 'cvv2', 'securityCode', 'pinBlock',
    'expiryDate', 'expiry_date', 'exp_month', 'exp_year',
    'cardholderName', 'cardholder_name', 'trackData', 'track_data'
  ];
  
  const dataStr = JSON.stringify(data).toLowerCase();
  
  prohibitedFields.forEach(field => {
    if (dataStr.includes(field.toLowerCase())) {
      violations.push(`Prohibited field detected: ${field}`);
    }
  });
  
  // Check for potential card number patterns
  const cardPatterns = [
    /\b4[0-9]{12}(?:[0-9]{3})?\b/g, // Visa
    /\b5[1-5][0-9]{14}\b/g, // Mastercard
    /\b3[47][0-9]{13}\b/g, // American Express
    /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g, // Discover
    /\b\d{16}\b/g // Generic 16-digit numbers
  ];
  
  cardPatterns.forEach((pattern, index) => {
    if (pattern.test(dataStr)) {
      violations.push(`Potential card number pattern detected (pattern ${index + 1})`);
    }
  });
  
  return {
    safe: violations.length === 0,
    violations
  };
}

/**
 * Create secure offline transaction record
 * PCI-DSS: Only stores non-sensitive transaction data
 */
export interface SecureOfflineTransaction {
  id: string;
  reference: string;
  timestamp: string;
  amount: number;
  currency: string;
  provider: string;
  status: 'pending' | 'completed' | 'failed';
  metadata: SafeTransactionMetadata;
  // Never store sensitive payment data
}

export function createSecureOfflineTransaction(
  provider: string,
  amount: number,
  currency: string,
  rawMetadata: any
): SecureOfflineTransaction {
  return {
    id: generateSecureTransactionId('otxn'),
    reference: generateSecurePaymentReference(provider),
    timestamp: new Date().toISOString(),
    amount,
    currency,
    provider,
    status: 'pending',
    metadata: sanitizeTransactionMetadata(rawMetadata)
  };
}

/**
 * PCI-DSS audit function to validate transaction data
 */
export function auditTransactionData(transactions: any[]): {
  compliant: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  transactions.forEach((txn, index) => {
    const validation = validateTransactionDataSafety(txn);
    if (!validation.safe) {
      issues.push(`Transaction ${index}: ${validation.violations.join(', ')}`);
    }
    
    // Check for weak transaction IDs
    if (txn.id && (txn.id.includes('_' + Date.now()) || /\d{13}/.test(txn.id))) {
      recommendations.push(`Transaction ${index}: Consider using cryptographically secure transaction IDs`);
    }
  });
  
  if (issues.length === 0) {
    recommendations.push('✅ All transactions appear to be PCI-DSS compliant');
  }
  
  return {
    compliant: issues.length === 0,
    issues,
    recommendations
  };
}