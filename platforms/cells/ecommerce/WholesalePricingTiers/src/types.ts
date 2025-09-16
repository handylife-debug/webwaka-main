// Shared types for WholesalePricingTiers Cell to prevent circular dependencies
// 100% CELLULAR REUSABILITY: Extends existing type patterns

export interface WholesalePricingTier {
  id: string;
  tenantId: string;
  productId?: string;
  categoryId?: string;
  groupId?: string; // B2B group from B2BAccessControl Cell
  tierName: string;
  tierDescription?: string;
  minQuantity: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: number;
  currency: string;
  territory?: string;
  paymentTerms: 'immediate' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
  paymentTermsDiscount: number;
  effectiveDate: string;
  expiryDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  minimumOrderValue?: number;
  maximumOrderValue?: number;
  stackable: boolean;
  priority: number;
  vatApplicable: boolean;
  withholdingTaxApplicable: boolean;
  businessRegistrationRequired: boolean;
}

export interface Territory {
  id: string;
  territory: string;
  territoryDisplayName: string;
  priceMultiplier: number;
  shippingMultiplier: number;
  taxMultiplier: number;
  currency?: string;
  isActive: boolean;
  stateCode?: string;
  economicZone?: string;
}

export interface B2BGroup {
  id: string;
  name: string;
  tier: string;
  description?: string;
  isActive: boolean;
}

export interface WholesalePricingTierFormData {
  tierName: string;
  tierDescription: string;
  minQuantity: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: number;
  currency: string;
  territory?: string;
  paymentTerms: 'immediate' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
  paymentTermsDiscount: number;
  effectiveDate: string;
  expiryDate?: string;
  isActive: boolean;
  minimumOrderValue?: number;
  maximumOrderValue?: number;
  stackable: boolean;
  priority: number;
  vatApplicable: boolean;
  withholdingTaxApplicable: boolean;
  businessRegistrationRequired: boolean;
  productId?: string;
  categoryId?: string;
  groupId?: string;
}

export interface WholesalePricingTiersClientProps {
  tenantId: string;
  currentUser: {
    id: string;
    email: string;
    role: string;
  };
  initialTiers: WholesalePricingTier[];
  territories: Territory[];
  b2bGroups: B2BGroup[];
}

// Server Action Response Types
export interface ServerActionResponse<T = any> {
  success: boolean;
  message: string;
  error?: string;
  data?: T;
}

export interface CreateTierResponse extends ServerActionResponse {
  tier?: WholesalePricingTier;
}

export interface UpdateTierResponse extends ServerActionResponse {
  tier?: Partial<WholesalePricingTier>;
}

export interface DeleteTierResponse extends ServerActionResponse {}

// Form validation types
export interface ValidationError {
  field: string;
  message: string;
}

// Notification types  
export interface NotificationState {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

// Discount type options for forms
export const DISCOUNT_TYPE_OPTIONS = [
  { value: 'percentage', label: 'Percentage Discount', description: 'Discount as percentage (e.g., 10%)' },
  { value: 'fixed_amount', label: 'Fixed Amount Discount', description: 'Discount as fixed amount (e.g., ₦1,000)' },
  { value: 'fixed_price', label: 'Fixed Price Override', description: 'Set fixed price regardless of base price' }
] as const;

// Payment terms options for Nigerian market
export const PAYMENT_TERMS_OPTIONS = [
  { value: 'immediate', label: 'Immediate Payment', description: 'Payment required on delivery' },
  { value: 'net_7', label: 'Net 7 Days', description: 'Payment due within 7 days' },
  { value: 'net_15', label: 'Net 15 Days', description: 'Payment due within 15 days' },
  { value: 'net_30', label: 'Net 30 Days', description: 'Payment due within 30 days (standard)' },
  { value: 'net_45', label: 'Net 45 Days', description: 'Payment due within 45 days' },
  { value: 'net_60', label: 'Net 60 Days', description: 'Payment due within 60 days' }
] as const;

// Currency options for Nigerian market
export const CURRENCY_OPTIONS = [
  { value: 'NGN', label: '₦ Nigerian Naira', symbol: '₦' },
  { value: 'USD', label: '$ US Dollar', symbol: '$' },
  { value: 'EUR', label: '€ Euro', symbol: '€' },
  { value: 'GBP', label: '£ British Pound', symbol: '£' }
] as const;