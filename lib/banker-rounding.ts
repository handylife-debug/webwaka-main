/**
 * Financial Precision Utilities - Banker's Rounding Implementation
 * 
 * Implements IEEE 754 "round half to even" banker's rounding algorithm
 * for enterprise-grade financial calculations. This prevents bias that
 * occurs with traditional rounding in high-volume financial transactions.
 */

/**
 * Banker's rounding (round half to even) - IEEE 754 standard
 * 
 * Examples:
 * - 2.5 rounds to 2 (even)
 * - 3.5 rounds to 4 (even) 
 * - 2.51 rounds to 3
 * - 2.49 rounds to 2
 * 
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 2 for currency)
 * @returns Rounded number using banker's rounding
 */
export function bankersRound(value: number, decimals: number = 2): number {
  if (isNaN(value) || !isFinite(value)) {
    throw new Error(`Invalid value for banker's rounding: ${value}`);
  }
  
  if (decimals < 0 || decimals > 10) {
    throw new Error(`Invalid decimal places: ${decimals}. Must be between 0-10`);
  }
  
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  
  // Check if we're exactly at the halfway point
  const fractionalPart = scaled - Math.floor(scaled);
  
  if (Math.abs(fractionalPart - 0.5) < Number.EPSILON) {
    // We're at exactly 0.5, apply banker's rounding (round to even)
    const floor = Math.floor(scaled);
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  } else {
    // Normal rounding for non-halfway values
    return Math.round(scaled) / factor;
  }
}

/**
 * Currency-specific banker's rounding (always 2 decimal places)
 * @param value - The currency amount to round
 * @returns Rounded amount using banker's rounding
 */
export function bankersRoundCurrency(value: number): number {
  return bankersRound(value, 2);
}

/**
 * Split amount calculation with perfect reconciliation
 * Ensures the sum of all splits equals the original amount exactly
 * 
 * @param totalAmount - The original amount to split
 * @param splits - Array of split objects with calculated amounts
 * @returns Adjusted splits with perfect reconciliation
 */
export function reconcileSplitAmounts(
  totalAmount: number, 
  splits: Array<{ calculatedAmount: number; [key: string]: any }>
): Array<{ calculatedAmount: number; roundingAdjustment?: number; [key: string]: any }> {
  // Apply banker's rounding to all splits
  const roundedSplits = splits.map(split => ({
    ...split,
    calculatedAmount: bankersRoundCurrency(split.calculatedAmount)
  }));
  
  // Calculate total after rounding
  const totalAfterRounding = roundedSplits.reduce(
    (sum, split) => sum + split.calculatedAmount, 
    0
  );
  
  // Calculate the difference that needs to be reconciled
  const difference = bankersRoundCurrency(totalAmount - totalAfterRounding);
  
  if (Math.abs(difference) < 0.01) {
    // No adjustment needed - perfect reconciliation
    return roundedSplits;
  }
  
  // Find the largest split to adjust (most fair distribution of rounding difference)
  const largestSplitIndex = roundedSplits.reduce(
    (maxIndex, split, index, arr) => 
      split.calculatedAmount > arr[maxIndex].calculatedAmount ? index : maxIndex,
    0
  );
  
  // Apply the adjustment to the largest split
  const adjustedSplits = [...roundedSplits];
  adjustedSplits[largestSplitIndex] = {
    ...adjustedSplits[largestSplitIndex],
    calculatedAmount: bankersRoundCurrency(
      adjustedSplits[largestSplitIndex].calculatedAmount + difference
    ),
    roundingAdjustment: difference
  } as { calculatedAmount: number; roundingAdjustment?: number; [key: string]: any };
  
  // Verify perfect reconciliation
  const finalTotal = adjustedSplits.reduce(
    (sum, split) => sum + split.calculatedAmount, 
    0
  );
  
  if (Math.abs(finalTotal - totalAmount) >= 0.01) {
    throw new Error(
      `Split reconciliation failed: expected ${totalAmount}, got ${finalTotal}, difference: ${finalTotal - totalAmount}`
    );
  }
  
  return adjustedSplits;
}

/**
 * Percentage calculation with banker's rounding
 * @param amount - Base amount
 * @param percentage - Percentage (0-100)
 * @returns Calculated percentage amount with banker's rounding
 */
export function calculatePercentageAmount(amount: number, percentage: number): number {
  if (percentage < 0 || percentage > 100) {
    throw new Error(`Invalid percentage: ${percentage}. Must be between 0-100`);
  }
  
  const result = (amount * percentage) / 100;
  return bankersRoundCurrency(result);
}

/**
 * Validate that a collection of amounts sum to expected total
 * @param amounts - Array of amounts to validate
 * @param expectedTotal - Expected sum
 * @param tolerance - Allowed tolerance (default: 0.01 for currency)
 * @returns Validation result with details
 */
export function validateAmountReconciliation(
  amounts: number[], 
  expectedTotal: number, 
  tolerance: number = 0.01
): { isValid: boolean; actualTotal: number; difference: number; message: string } {
  const actualTotal = amounts.reduce((sum, amount) => sum + amount, 0);
  const difference = Math.abs(actualTotal - expectedTotal);
  const isValid = difference <= tolerance;
  
  return {
    isValid,
    actualTotal: bankersRoundCurrency(actualTotal),
    difference: bankersRoundCurrency(difference),
    message: isValid 
      ? 'Amounts reconcile correctly' 
      : `Reconciliation failed: expected ${expectedTotal}, got ${actualTotal}, difference: ${difference}`
  };
}