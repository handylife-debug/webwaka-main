import { test, expect } from '@playwright/test'

test.describe('Payment Processing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await page.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
    
    // Add items to cart for payment testing
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="product-item"]')
  })

  test('should open payment processing modal', async ({ page }) => {
    // Click checkout/pay button
    await page.click('[data-testid="checkout-button"]')
    
    // Verify payment modal opens
    await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible()
    await expect(page.locator('[data-testid="payment-methods"]')).toBeVisible()
  })

  test('should process cash payment successfully', async ({ page }) => {
    await page.click('[data-testid="checkout-button"]')
    
    // Select cash payment
    await page.click('[data-testid="payment-method-cash"]')
    
    // Process payment
    await page.click('[data-testid="process-payment-button"]')
    
    // Wait for payment processing
    await page.waitForSelector('[data-testid="payment-success"]', { timeout: 5000 })
    
    // Verify success message
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible()
    
    // Verify cart is cleared
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('0')
  })

  test('should handle payment provider selection', async ({ page }) => {
    await page.click('[data-testid="checkout-button"]')
    
    // Test different payment methods
    const paymentMethods = ['cash', 'paystack', 'mobile_wallet']
    
    for (const method of paymentMethods) {
      await page.click(`[data-testid="payment-method-${method}"]`)
      await expect(page.locator(`[data-testid="payment-method-${method}"]`)).toHaveClass(/border-blue-500|bg-blue-50/)
    }
  })

  test('should validate gift card input', async ({ page }) => {
    await page.click('[data-testid="checkout-button"]')
    
    // Select gift card payment
    await page.click('[data-testid="payment-method-gift_card"]')
    
    // Test invalid gift card number
    await page.fill('[data-testid="gift-card-input"]', '123')
    await page.click('[data-testid="process-payment-button"]')
    
    // Should show error for invalid card
    await expect(page.locator('[data-testid="payment-error"]')).toContainText('Invalid gift card')
    
    // Test valid gift card number
    await page.fill('[data-testid="gift-card-input"]', '123456789012')
    await page.click('[data-testid="process-payment-button"]')
    
    // Should process successfully or show balance error
    // (depending on mock balance implementation)
  })

  test('should handle split payments', async ({ page }) => {
    await page.click('[data-testid="checkout-button"]')
    
    // Enable split payment mode
    await page.click('[data-testid="split-payment-toggle"]')
    
    // Add first payment method
    await page.click('[data-testid="payment-method-cash"]')
    await page.fill('[data-testid="split-amount-input"]', '10.00')
    await page.click('[data-testid="add-split-payment"]')
    
    // Verify split payment was added
    await expect(page.locator('[data-testid="split-payment-item"]')).toHaveCount(1)
    
    // Add second payment method for remaining amount
    await page.click('[data-testid="payment-method-paystack"]')
    // Amount should be auto-calculated for remaining balance
    await page.click('[data-testid="add-split-payment"]')
    
    // Complete split payment
    await page.click('[data-testid="complete-split-payment"]')
    
    // Verify success
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible()
  })

  test('should save draft sales', async ({ page }) => {
    await page.click('[data-testid="checkout-button"]')
    
    // Fill customer information
    await page.fill('[data-testid="customer-name"]', 'John Doe')
    await page.fill('[data-testid="customer-email"]', 'john@example.com')
    
    // Save as draft
    await page.click('[data-testid="save-draft-button"]')
    
    // Verify draft saved
    await expect(page.locator('[data-testid="draft-success"]')).toBeVisible()
    
    // Check if draft appears in drafts list
    await page.click('[data-testid="drafts-button"]')
    await expect(page.locator('[data-testid="draft-item"]')).toHaveCount(1)
  })

  test('should handle payment failures gracefully', async ({ page }) => {
    await page.goto('/pos')
    
    // Mock payment failure by intercepting API calls
    await page.route('/api/payments/**', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Payment failed' })
      })
    })
    
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="checkout-button"]')
    await page.click('[data-testid="payment-method-paystack"]')
    await page.click('[data-testid="process-payment-button"]')
    
    // Should show error message
    await expect(page.locator('[data-testid="payment-error"]')).toContainText('Payment failed')
    
    // Cart should remain unchanged
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
  })
})