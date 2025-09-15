/**
 * Enhanced Tax Calculation Service
 * Handles complex tax scenarios, edge cases, and compliance requirements
 */

export interface TaxRule {
  id: string
  name: string
  type: 'percentage' | 'fixed' | 'tiered' | 'compound'
  rate: number | TieredRate[]
  applicable: 'all' | 'category' | 'product' | 'customer_type'
  exemptCategories?: string[]
  exemptProducts?: string[]
  exemptCustomerTypes?: string[]
  minimumAmount?: number
  maximumAmount?: number
  roundingRule: 'normal' | 'up' | 'down' | 'banker' | 'currency'
  compoundable: boolean
  priority: number // Lower numbers calculated first
  description: string
  jurisdictionCode?: string
  effectiveDate?: string
  expiryDate?: string
  active: boolean
}

export interface TieredRate {
  threshold: number
  rate: number
}

export interface TaxCalculationResult {
  rule: TaxRule
  baseAmount: number
  taxableAmount: number
  calculatedTax: number
  roundedTax: number
  exemptionReason?: string
  compoundedOn?: string[]
  itemBreakdown: ItemTaxBreakdown[]
}

export interface ItemTaxBreakdown {
  itemId: string
  itemName: string
  basePrice: number
  quantity: number
  taxableAmount: number
  exemptAmount: number
  calculatedTax: number
  exemptionReason?: string
}

export interface EnhancedCartItem {
  id: string
  name: string
  price: number
  quantity: number
  category: string
  taxExempt?: boolean
  exemptionCode?: string
  customerType?: string
  jurisdictionCode?: string
}

export interface TaxCalculationInput {
  items: EnhancedCartItem[]
  customerType?: 'individual' | 'business' | 'nonprofit' | 'government'
  jurisdictionCode?: string
  date?: Date
  discountAmount?: number
  includeCompoundTax?: boolean
}

export class EnhancedTaxService {
  private taxRules: TaxRule[] = []
  
  constructor() {
    this.initializeDefaultTaxRules()
  }

  private initializeDefaultTaxRules(): void {
    this.taxRules = [
      {
        id: 'vat_standard',
        name: 'VAT Standard Rate',
        type: 'percentage',
        rate: 7.5,
        applicable: 'all',
        exemptCategories: ['groceries', 'medicine', 'books'],
        roundingRule: 'normal',
        compoundable: false,
        priority: 1,
        description: 'Standard VAT rate applicable to most goods and services',
        jurisdictionCode: 'NG',
        active: true
      },
      {
        id: 'luxury_tax',
        name: 'Luxury Tax',
        type: 'percentage',
        rate: 5.0,
        applicable: 'category',
        exemptCategories: [],
        minimumAmount: 100.00,
        roundingRule: 'up',
        compoundable: true,
        priority: 2,
        description: 'Additional tax on luxury items above $100',
        active: true
      },
      {
        id: 'service_charge',
        name: 'Service Charge',
        type: 'percentage',
        rate: 2.5,
        applicable: 'all',
        maximumAmount: 10.00,
        roundingRule: 'normal',
        compoundable: false,
        priority: 3,
        description: 'Service charge with maximum cap of $10',
        active: true
      },
      {
        id: 'tiered_business_tax',
        name: 'Tiered Business Tax',
        type: 'tiered',
        rate: [
          { threshold: 0, rate: 0 },
          { threshold: 50, rate: 2.0 },
          { threshold: 200, rate: 4.0 },
          { threshold: 500, rate: 6.0 }
        ],
        applicable: 'customer_type',
        exemptCustomerTypes: ['individual'],
        roundingRule: 'banker',
        compoundable: false,
        priority: 4,
        description: 'Progressive tax rate for business customers',
        active: true
      }
    ]
  }

  public calculateTaxes(input: TaxCalculationInput): TaxCalculationResult[] {
    const results: TaxCalculationResult[] = []
    const { items, customerType = 'individual', jurisdictionCode = 'NG', date = new Date() } = input
    
    // Filter applicable tax rules
    const applicableRules = this.getApplicableRules(input, date)
    
    // Sort by priority
    applicableRules.sort((a, b) => a.priority - b.priority)
    
    let cumulativeTaxBase = this.calculateSubtotal(items)
    if (input.discountAmount) {
      cumulativeTaxBase -= input.discountAmount
    }

    for (const rule of applicableRules) {
      const result = this.calculateTaxForRule(rule, items, cumulativeTaxBase, results, input)
      if (result.calculatedTax > 0) {
        results.push(result)
        
        // For compound taxes, add this tax to the base for next calculations
        if (rule.compoundable && input.includeCompoundTax) {
          cumulativeTaxBase += result.roundedTax
        }
      }
    }

    return results
  }

  private getApplicableRules(input: TaxCalculationInput, date: Date): TaxRule[] {
    return this.taxRules.filter(rule => {
      // Check if rule is active
      if (!rule.active) return false
      
      // Check effective date
      if (rule.effectiveDate && new Date(rule.effectiveDate) > date) return false
      if (rule.expiryDate && new Date(rule.expiryDate) < date) return false
      
      // Check jurisdiction
      if (rule.jurisdictionCode && rule.jurisdictionCode !== input.jurisdictionCode) return false
      
      // Check customer type applicability
      if (rule.exemptCustomerTypes?.includes(input.customerType || 'individual')) return false
      
      return true
    })
  }

  private calculateTaxForRule(
    rule: TaxRule,
    items: EnhancedCartItem[],
    baseAmount: number,
    previousResults: TaxCalculationResult[],
    input: TaxCalculationInput
  ): TaxCalculationResult {
    const itemBreakdown: ItemTaxBreakdown[] = []
    let totalTaxableAmount = 0
    let totalExemptAmount = 0

    // Calculate taxable amount per item
    for (const item of items) {
      const itemTotal = item.price * item.quantity
      const breakdown = this.calculateItemTaxability(item, rule, itemTotal)
      itemBreakdown.push(breakdown)
      totalTaxableAmount += breakdown.taxableAmount
      totalExemptAmount += breakdown.exemptAmount
    }

    // Apply minimum/maximum amount constraints
    if (rule.minimumAmount && totalTaxableAmount < rule.minimumAmount) {
      totalTaxableAmount = 0
    }
    if (rule.maximumAmount && totalTaxableAmount > rule.maximumAmount) {
      totalTaxableAmount = rule.maximumAmount
    }

    // Calculate tax based on type
    let calculatedTax = 0
    if (rule.type === 'percentage') {
      calculatedTax = totalTaxableAmount * (rule.rate as number) / 100
    } else if (rule.type === 'fixed') {
      calculatedTax = rule.rate as number
    } else if (rule.type === 'tiered') {
      calculatedTax = this.calculateTieredTax(totalTaxableAmount, rule.rate as TieredRate[])
    } else if (rule.type === 'compound') {
      // For compound taxes, calculate on previous tax base
      const compoundBase = baseAmount + previousResults
        .filter(r => r.rule.compoundable)
        .reduce((sum, r) => sum + r.roundedTax, 0)
      calculatedTax = compoundBase * (rule.rate as number) / 100
    }

    // Apply rounding rule
    const roundedTax = this.applyRounding(calculatedTax, rule.roundingRule)

    // Determine compounds
    const compoundedOn = rule.type === 'compound' 
      ? previousResults.filter(r => r.rule.compoundable).map(r => r.rule.id)
      : []

    return {
      rule,
      baseAmount,
      taxableAmount: totalTaxableAmount,
      calculatedTax,
      roundedTax,
      compoundedOn,
      itemBreakdown
    }
  }

  private calculateItemTaxability(item: EnhancedCartItem, rule: TaxRule, itemTotal: number): ItemTaxBreakdown {
    let taxableAmount = itemTotal
    let exemptAmount = 0
    let exemptionReason: string | undefined

    // Check product-level exemptions
    if (item.taxExempt) {
      taxableAmount = 0
      exemptAmount = itemTotal
      exemptionReason = item.exemptionCode || 'Product tax exempt'
    }
    // Check category exemptions
    else if (rule.exemptCategories?.includes(item.category)) {
      taxableAmount = 0
      exemptAmount = itemTotal
      exemptionReason = `Category "${item.category}" exempt from ${rule.name}`
    }
    // Check product ID exemptions
    else if (rule.exemptProducts?.includes(item.id)) {
      taxableAmount = 0
      exemptAmount = itemTotal
      exemptionReason = `Product exempt from ${rule.name}`
    }

    // Calculate tax for taxable amount
    let calculatedTax = 0
    if (taxableAmount > 0) {
      if (rule.type === 'percentage') {
        calculatedTax = taxableAmount * (rule.rate as number) / 100
      } else if (rule.type === 'tiered') {
        calculatedTax = this.calculateTieredTax(taxableAmount, rule.rate as TieredRate[])
      }
    }

    return {
      itemId: item.id,
      itemName: item.name,
      basePrice: item.price,
      quantity: item.quantity,
      taxableAmount,
      exemptAmount,
      calculatedTax,
      exemptionReason
    }
  }

  private calculateTieredTax(amount: number, tiers: TieredRate[]): number {
    let tax = 0
    let remainingAmount = amount

    for (let i = 0; i < tiers.length; i++) {
      const currentTier = tiers[i]
      const nextTier = tiers[i + 1]
      
      if (remainingAmount <= 0) break

      const tierLimit = nextTier ? nextTier.threshold : Infinity
      const tierAmount = Math.min(remainingAmount, tierLimit - currentTier.threshold)
      
      if (tierAmount > 0) {
        tax += tierAmount * currentTier.rate / 100
        remainingAmount -= tierAmount
      }
    }

    return tax
  }

  private applyRounding(amount: number, rule: string): number {
    switch (rule) {
      case 'up':
        return Math.ceil(amount * 100) / 100
      case 'down':
        return Math.floor(amount * 100) / 100
      case 'banker':
        // Banker's rounding (round half to even)
        const factor = 100
        const scaled = amount * factor
        const rounded = Math.round(scaled)
        if (Math.abs(scaled - rounded) === 0.5) {
          return (rounded % 2 === 0 ? rounded : rounded + (scaled > rounded ? 1 : -1)) / factor
        }
        return rounded / factor
      case 'currency':
        // Round to nearest cent/currency unit
        return Math.round(amount * 100) / 100
      case 'normal':
      default:
        return Math.round(amount * 100) / 100
    }
  }

  private calculateSubtotal(items: EnhancedCartItem[]): number {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  }

  // Validation and edge case handling methods
  public validateTaxCalculation(results: TaxCalculationResult[]): {
    isValid: boolean
    warnings: string[]
    errors: string[]
  } {
    const warnings: string[] = []
    const errors: string[] = []

    // Check for circular dependencies in compound taxes
    const compoundChain = this.detectCompoundCycles(results)
    if (compoundChain.length > 0) {
      errors.push(`Circular compound tax dependency detected: ${compoundChain.join(' -> ')}`)
    }

    // Check for excessive tax rates
    const totalTaxRate = results.reduce((sum, result) => {
      if (result.rule.type === 'percentage') {
        return sum + (result.rule.rate as number)
      }
      return sum
    }, 0)

    if (totalTaxRate > 50) {
      warnings.push(`Total tax rate of ${totalTaxRate}% exceeds 50% - please review`)
    }

    // Check for negative tax amounts
    const negativeTaxes = results.filter(r => r.roundedTax < 0)
    if (negativeTaxes.length > 0) {
      errors.push(`Negative tax amounts detected: ${negativeTaxes.map(r => r.rule.name).join(', ')}`)
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    }
  }

  private detectCompoundCycles(results: TaxCalculationResult[]): string[] {
    // Simplified cycle detection - in production would use proper graph algorithms
    const compoundTaxes = results.filter(r => r.rule.type === 'compound')
    const visited = new Set<string>()
    const path: string[] = []

    for (const tax of compoundTaxes) {
      if (this.hasCycle(tax, results, visited, path)) {
        return path
      }
    }

    return []
  }

  private hasCycle(
    current: TaxCalculationResult,
    allResults: TaxCalculationResult[],
    visited: Set<string>,
    path: string[]
  ): boolean {
    if (path.includes(current.rule.id)) {
      return true
    }

    if (visited.has(current.rule.id)) {
      return false
    }

    visited.add(current.rule.id)
    path.push(current.rule.id)

    // Check if this tax compounds on any taxes that also compound on this one
    for (const compoundedRuleId of current.compoundedOn || []) {
      const compoundedResult = allResults.find(r => r.rule.id === compoundedRuleId)
      if (compoundedResult && this.hasCycle(compoundedResult, allResults, visited, path)) {
        return true
      }
    }

    path.pop()
    return false
  }

  // Tax rule management methods
  public addTaxRule(rule: TaxRule): void {
    this.taxRules.push(rule)
  }

  public updateTaxRule(ruleId: string, updates: Partial<TaxRule>): boolean {
    const index = this.taxRules.findIndex(r => r.id === ruleId)
    if (index === -1) return false
    
    this.taxRules[index] = { ...this.taxRules[index], ...updates }
    return true
  }

  public deleteTaxRule(ruleId: string): boolean {
    const index = this.taxRules.findIndex(r => r.id === ruleId)
    if (index === -1) return false
    
    this.taxRules.splice(index, 1)
    return true
  }

  public getTaxRules(): TaxRule[] {
    return [...this.taxRules]
  }

  // Reporting and audit methods
  public generateTaxReport(results: TaxCalculationResult[]): {
    totalTax: number
    taxByRule: { [ruleId: string]: number }
    exemptionsSummary: { [reason: string]: number }
    itemLevelBreakdown: ItemTaxBreakdown[]
  } {
    const totalTax = results.reduce((sum, r) => sum + r.roundedTax, 0)
    const taxByRule: { [ruleId: string]: number } = {}
    const exemptionsSummary: { [reason: string]: number } = {}
    const itemLevelBreakdown: ItemTaxBreakdown[] = []

    results.forEach(result => {
      taxByRule[result.rule.id] = result.roundedTax
      
      result.itemBreakdown.forEach(item => {
        itemLevelBreakdown.push(item)
        if (item.exemptionReason) {
          exemptionsSummary[item.exemptionReason] = 
            (exemptionsSummary[item.exemptionReason] || 0) + item.exemptAmount
        }
      })
    })

    return {
      totalTax,
      taxByRule,
      exemptionsSummary,
      itemLevelBreakdown
    }
  }
}