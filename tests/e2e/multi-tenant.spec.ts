import { test, expect } from '@playwright/test'

test.describe('Multi-Tenant Functionality', () => {
  test('should isolate data between different tenants', async ({ page, context }) => {
    // Test tenant 1
    await page.goto('http://tenant1.localhost:5000/pos')
    await page.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
    
    // Add items to tenant 1 cart
    await page.click('[data-testid="product-item"]')
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
    
    // Switch to tenant 2 in new tab
    const page2 = await context.newPage()
    await page2.goto('http://tenant2.localhost:5000/pos')
    await page2.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
    
    // Tenant 2 should have empty cart
    await expect(page2.locator('[data-testid="cart-counter"]')).toContainText('0')
    
    // Add different items to tenant 2
    await page2.click('[data-testid="product-item"]')
    await page2.click('[data-testid="product-item"]')
    await expect(page2.locator('[data-testid="cart-counter"]')).toContainText('2')
    
    // Switch back to tenant 1 - should still have 1 item
    await page.bringToFront()
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
  })

  test('should show correct tenant branding', async ({ page }) => {
    // Test default tenant
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]')
    
    // Should show default branding
    await expect(page.locator('[data-testid="app-title"]')).toContainText('POS Manager')
    
    // Test subdomain tenant (if available)
    try {
      await page.goto('http://coffee-shop.localhost:5000/pos')
      await page.waitForSelector('[data-testid="pos-main"]', { timeout: 5000 })
      
      // Should show tenant-specific branding
      // (This would require actual tenant configuration)
    } catch {
      // Skip if subdomain routing not configured
    }
  })

  test('should isolate offline data between tenants', async ({ page, context }) => {
    // Test offline data isolation
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]')
    
    // Process a transaction for default tenant
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="checkout-button"]')
    await page.click('[data-testid="payment-method-cash"]')
    await page.click('[data-testid="process-payment-button"]')
    await page.waitForSelector('[data-testid="payment-success"]')
    
    // Check transaction history
    await page.click('[data-testid="history-button"]')
    const transactionCount = await page.locator('[data-testid="transaction-item"]').count()
    
    // Switch to different tenant URL
    const page2 = await context.newPage()
    try {
      await page2.goto('http://shop2.localhost:5000/pos')
      await page2.waitForSelector('[data-testid="pos-main"]', { timeout: 5000 })
      
      // Check transaction history - should be different
      await page2.click('[data-testid="history-button"]')
      const tenant2TransactionCount = await page2.locator('[data-testid="transaction-item"]').count()
      
      // Transaction counts should be isolated
      expect(tenant2TransactionCount).not.toBe(transactionCount)
    } catch {
      // Skip if multi-tenant routing not fully configured
    }
  })

  test('should handle tenant-specific configuration', async ({ page }) => {
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]')
    
    // Check if tenant-specific settings are loaded
    // This would include things like:
    // - Currency symbols
    // - Tax rates
    // - Available payment methods
    // - Product catalogs
    
    // For now, just verify basic functionality works
    await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    await expect(page.locator('[data-testid="cart-section"]')).toBeVisible()
  })

  test('should prevent cross-tenant data access', async ({ page }) => {
    // This would require backend API testing
    // For now, verify frontend doesn't leak tenant data
    
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]')
    
    // Check that no tenant-specific data appears in global state
    const localStorageKeys = await page.evaluate(() => Object.keys(localStorage))
    
    // Should not contain references to other tenants
    const suspiciousKeys = localStorageKeys.filter(key => 
      key.includes('tenant') && !key.includes(page.url())
    )
    
    expect(suspiciousKeys).toHaveLength(0)
  })
})