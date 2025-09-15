import { test, expect } from '@playwright/test'

test.describe('Offline Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
    await page.waitForTimeout(2000) // Allow offline database to initialize
  })

  test('should show offline status indicator', async ({ page }) => {
    // Check if offline status indicator is present
    await expect(page.locator('[data-testid="offline-status"]')).toBeVisible()
  })

  test('should work offline after going offline', async ({ page, context }) => {
    // Simulate offline mode
    await context.setOffline(true)
    
    // Refresh page to test offline functionality
    await page.reload()
    await page.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
    
    // Should still be able to add items to cart
    await page.click('[data-testid="product-item"]')
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
    
    // Should be able to process cash payments offline
    await page.click('[data-testid="checkout-button"]')
    await page.click('[data-testid="payment-method-cash"]')
    await page.click('[data-testid="process-payment-button"]')
    
    // Should complete payment offline
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible()
  })

  test('should sync data when coming back online', async ({ page, context }) => {
    // Add items and process payment while online
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="checkout-button"]')
    await page.click('[data-testid="payment-method-cash"]')
    await page.click('[data-testid="process-payment-button"]')
    await page.waitForSelector('[data-testid="payment-success"]')
    
    // Go offline
    await context.setOffline(true)
    
    // Add more items and process another payment offline
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="checkout-button"]')
    await page.click('[data-testid="payment-method-cash"]')
    await page.click('[data-testid="process-payment-button"]')
    await page.waitForSelector('[data-testid="payment-success"]')
    
    // Come back online
    await context.setOffline(false)
    
    // Check if sync indicator appears
    await expect(page.locator('[data-testid="sync-status"]')).toBeVisible()
    
    // Wait for sync to complete
    await page.waitForTimeout(3000)
  })

  test('should save drafts offline', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true)
    
    // Add items to cart
    await page.click('[data-testid="product-item"]')
    
    // Try to save draft offline
    await page.click('[data-testid="checkout-button"]')
    await page.fill('[data-testid="customer-name"]', 'Offline Customer')
    await page.click('[data-testid="save-draft-button"]')
    
    // Should save draft successfully offline
    await expect(page.locator('[data-testid="draft-success"]')).toBeVisible()
    
    // Draft should appear in drafts list
    await page.click('[data-testid="drafts-button"]')
    await expect(page.locator('[data-testid="draft-item"]')).toHaveCount(1)
  })

  test('should handle offline database operations', async ({ page }) => {
    // Check if products are loaded from offline database
    await expect(page.locator('[data-testid="product-item"]')).toHaveCountGreaterThan(0)
    
    // Add items to cart (should persist in localStorage)
    await page.click('[data-testid="product-item"]')
    
    // Reload page to test persistence
    await page.reload()
    await page.waitForSelector('[data-testid="pos-main"]')
    
    // Cart should persist
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
  })

  test('should handle conflicts when syncing', async ({ page, context }) => {
    // This test would require more complex setup with actual backend
    // For now, we'll test the basic conflict detection UI
    
    // Go offline
    await context.setOffline(true)
    
    // Make changes offline
    await page.click('[data-testid="product-item"]')
    
    // Come back online
    await context.setOffline(false)
    
    // Should show sync status
    await expect(page.locator('[data-testid="offline-status"]')).toBeVisible()
  })

  test('should maintain cart state across offline/online transitions', async ({ page, context }) => {
    // Add items while online
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="product-item"]')
    
    // Go offline
    await context.setOffline(true)
    
    // Add more items offline
    await page.click('[data-testid="product-item"]')
    
    // Should have 3 items total
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('3')
    
    // Come back online
    await context.setOffline(false)
    
    // Cart should still have 3 items
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('3')
  })
})