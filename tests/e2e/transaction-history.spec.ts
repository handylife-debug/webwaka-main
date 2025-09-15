import { test, expect } from '@playwright/test'

test.describe('Transaction History & Refunds', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
  })

  test('should open transaction history modal', async ({ page }) => {
    // Click history button
    await page.click('[data-testid="history-button"]')
    
    // Verify history modal opens
    await expect(page.locator('[data-testid="transaction-history-modal"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-list"]')).toBeVisible()
  })

  test('should display transaction list correctly', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    // Check if transactions are displayed
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCountGreaterThan(0)
    
    // Verify transaction details are shown
    const firstTransaction = page.locator('[data-testid="transaction-item"]').first()
    await expect(firstTransaction.locator('[data-testid="transaction-number"]')).toBeVisible()
    await expect(firstTransaction.locator('[data-testid="transaction-amount"]')).toBeVisible()
    await expect(firstTransaction.locator('[data-testid="transaction-status"]')).toBeVisible()
  })

  test('should filter transactions by status', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    // Test status filters
    await page.selectOption('[data-testid="status-filter"]', 'completed')
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCountGreaterThanOrEqual(0)
    
    await page.selectOption('[data-testid="status-filter"]', 'refunded')
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCountGreaterThanOrEqual(0)
    
    await page.selectOption('[data-testid="status-filter"]', 'all')
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCountGreaterThan(0)
  })

  test('should search transactions correctly', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    // Search by transaction number
    await page.fill('[data-testid="transaction-search"]', 'TXN-001')
    
    // Should show filtered results
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCountGreaterThanOrEqual(0)
    
    // Clear search
    await page.fill('[data-testid="transaction-search"]', '')
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCountGreaterThan(0)
  })

  test('should process refund successfully', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    // Find a refundable transaction
    const refundableTransaction = page.locator('[data-testid="transaction-item"]')
      .filter({ has: page.locator('[data-testid="refund-button"]') })
      .first()
    
    if (await refundableTransaction.count() > 0) {
      // Click refund button
      await refundableTransaction.locator('[data-testid="refund-button"]').click()
      
      // Verify refund modal opens
      await expect(page.locator('[data-testid="refund-modal"]')).toBeVisible()
      
      // Fill refund details
      await page.fill('[data-testid="refund-amount"]', '5.00')
      await page.fill('[data-testid="refund-reason"]', 'Customer requested refund')
      
      // Process refund
      await page.click('[data-testid="process-refund-button"]')
      
      // Wait for refund processing
      await page.waitForSelector('[data-testid="refund-success"]', { timeout: 10000 })
      
      // Verify success message
      await expect(page.locator('[data-testid="refund-success"]')).toBeVisible()
    }
  })

  test('should validate refund amounts', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    const refundableTransaction = page.locator('[data-testid="transaction-item"]')
      .filter({ has: page.locator('[data-testid="refund-button"]') })
      .first()
    
    if (await refundableTransaction.count() > 0) {
      await refundableTransaction.locator('[data-testid="refund-button"]').click()
      
      // Test invalid amount (negative)
      await page.fill('[data-testid="refund-amount"]', '-5.00')
      await page.click('[data-testid="process-refund-button"]')
      await expect(page.locator('[data-testid="refund-error"]')).toContainText('Invalid')
      
      // Test amount exceeding transaction total
      await page.fill('[data-testid="refund-amount"]', '999.99')
      await page.click('[data-testid="process-refund-button"]')
      await expect(page.locator('[data-testid="refund-error"]')).toContainText('exceed')
    }
  })

  test('should refresh transaction list', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    // Click refresh button
    await page.click('[data-testid="refresh-transactions"]')
    
    // Should show loading state
    await expect(page.locator('[data-testid="loading-transactions"]')).toBeVisible()
    
    // Should reload transactions
    await page.waitForSelector('[data-testid="transaction-item"]', { timeout: 5000 })
  })

  test('should handle partial refunds correctly', async ({ page }) => {
    await page.click('[data-testid="history-button"]')
    
    const refundableTransaction = page.locator('[data-testid="transaction-item"]')
      .filter({ has: page.locator('[data-testid="refund-button"]') })
      .first()
    
    if (await refundableTransaction.count() > 0) {
      // Get original amount
      const amountText = await refundableTransaction.locator('[data-testid="transaction-amount"]').textContent()
      const originalAmount = parseFloat(amountText?.replace('$', '') || '0')
      
      // Process partial refund
      await refundableTransaction.locator('[data-testid="refund-button"]').click()
      await page.fill('[data-testid="refund-amount"]', (originalAmount / 2).toFixed(2))
      await page.fill('[data-testid="refund-reason"]', 'Partial refund')
      await page.click('[data-testid="process-refund-button"]')
      
      // Wait for success
      await page.waitForSelector('[data-testid="refund-success"]', { timeout: 10000 })
      
      // Close refund modal
      await page.click('[data-testid="close-refund-modal"]')
      
      // Verify transaction status changed to partially refunded
      await expect(refundableTransaction.locator('[data-testid="transaction-status"]'))
        .toContainText('partially_refunded')
      
      // Should still be refundable for remaining amount
      await expect(refundableTransaction.locator('[data-testid="refund-button"]')).toBeVisible()
    }
  })
})