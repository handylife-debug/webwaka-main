// TaxAndFee Cell - Server Actions

export interface TaxCalculationInput {
  amount: number;
  taxRate: number;
  region?: string;
  itemType?: string;
}

export interface TaxCalculationResult {
  subtotal: number;
  tax: number;
  fees: number;
  total: number;
  breakdown: {
    baseTax: number;
    regionTax: number;
    processingFee: number;
  };
}

// Tax rates by region (this would typically come from a database)
const REGION_TAX_MULTIPLIERS: Record<string, number> = {
  'CA': 1.1,   // California +10%
  'NY': 1.15,  // New York +15%
  'TX': 1.05,  // Texas +5%
  'FL': 1.02,  // Florida +2%
  'default': 1.0
};

// Fee structure by amount tiers
const FEE_STRUCTURE = [
  { min: 0, max: 50, fee: 1.25 },
  { min: 50, max: 100, fee: 2.00 },
  { min: 100, max: 500, fee: 2.50 },
  { min: 500, max: Infinity, fee: 5.00 }
];

// Cell Server Actions
export class TaxAndFeeCell {
  // Calculate tax and fees for a transaction
  async calculate(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    const { amount, taxRate, region = 'default', itemType = 'general' } = input;
    
    // Validate input
    if (amount < 0) {
      throw new Error('Amount must be non-negative');
    }
    
    if (taxRate < 0 || taxRate > 1) {
      throw new Error('Tax rate must be between 0 and 1');
    }
    
    // Calculate base tax
    const baseTax = amount * taxRate;
    
    // Apply regional tax adjustments
    const regionMultiplier = REGION_TAX_MULTIPLIERS[region] || REGION_TAX_MULTIPLIERS.default;
    const regionTax = baseTax * (regionMultiplier - 1);
    
    // Calculate processing fees based on amount tiers
    const processingFee = this.calculateProcessingFee(amount);
    
    // Apply item-type specific adjustments
    const itemAdjustment = this.getItemTypeAdjustment(itemType);
    const adjustedTax = (baseTax + regionTax) * itemAdjustment;
    
    const tax = parseFloat(adjustedTax.toFixed(2));
    const fees = parseFloat(processingFee.toFixed(2));
    const total = parseFloat((amount + tax + fees).toFixed(2));
    
    return {
      subtotal: amount,
      tax,
      fees,
      total,
      breakdown: {
        baseTax: parseFloat(baseTax.toFixed(2)),
        regionTax: parseFloat(regionTax.toFixed(2)),
        processingFee: parseFloat(processingFee.toFixed(2))
      }
    };
  }
  
  // Get tax rates for a specific region
  async getRegionRates(region: string): Promise<{ taxMultiplier: number; description: string }> {
    const multiplier = REGION_TAX_MULTIPLIERS[region] || REGION_TAX_MULTIPLIERS.default;
    
    const descriptions: Record<string, string> = {
      'CA': 'California state tax with additional local taxes',
      'NY': 'New York state and city tax combination',
      'TX': 'Texas state tax (no state income tax offset)',
      'FL': 'Florida minimal state tax',
      'default': 'Standard tax rate for unspecified regions'
    };
    
    return {
      taxMultiplier: multiplier,
      description: descriptions[region] || descriptions.default
    };
  }
  
  // Validate tax ID format for different regions
  async validateTaxId(taxId: string, region: string): Promise<{ valid: boolean; format: string }> {
    const formats: Record<string, RegExp> = {
      'CA': /^[0-9]{2}-[0-9]{7}$/,           // CA format: XX-XXXXXXX
      'NY': /^[0-9]{8}$/,                    // NY format: XXXXXXXX
      'TX': /^[0-9]{11}$/,                   // TX format: XXXXXXXXXXX
      'FL': /^[0-9]{12}$/,                   // FL format: XXXXXXXXXXXX
      'default': /^[0-9A-Z]{8,12}$/          // Generic format
    };
    
    const formatDescriptions: Record<string, string> = {
      'CA': 'XX-XXXXXXX (2 digits, dash, 7 digits)',
      'NY': 'XXXXXXXX (8 digits)',
      'TX': 'XXXXXXXXXXX (11 digits)',
      'FL': 'XXXXXXXXXXXX (12 digits)',
      'default': 'XXXXXXXX (8-12 alphanumeric characters)'
    };
    
    const format = formats[region] || formats.default;
    const valid = format.test(taxId);
    
    return {
      valid,
      format: formatDescriptions[region] || formatDescriptions.default
    };
  }
  
  // Private helper methods
  private calculateProcessingFee(amount: number): number {
    const tier = FEE_STRUCTURE.find(tier => amount >= tier.min && amount < tier.max);
    return tier ? tier.fee : FEE_STRUCTURE[FEE_STRUCTURE.length - 1].fee;
  }
  
  private getItemTypeAdjustment(itemType: string): number {
    // Different item types may have different tax treatments
    const adjustments: Record<string, number> = {
      'food': 0.5,        // Reduced tax for food items
      'medical': 0.0,     // No tax for medical items
      'luxury': 1.2,      // Higher tax for luxury items
      'digital': 0.8,     // Reduced tax for digital goods
      'general': 1.0      // Standard tax rate
    };
    
    return adjustments[itemType] || adjustments.general;
  }
}

// Export singleton instance
export const taxAndFeeCell = new TaxAndFeeCell();