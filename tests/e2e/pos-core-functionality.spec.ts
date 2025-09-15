import { test, expect } from '@playwright/test'

test.describe('POS Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to POS page
    await page.goto('/pos')
    
    // Wait for the page to load completely
    await page.waitForSelector('[data-testid="pos-main"]', { timeout: 10000 })
    
    // Wait for offline database to initialize
    await page.waitForTimeout(2000)
  })

  test('should display product catalog correctly', async ({ page }) => {
    // Check if products are displayed
    await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    
    // Check if category filters are working
    await page.click('[data-testid="category-beverages"]')
    await expect(page.locator('[data-testid="product-item"]')).toHaveCountGreaterThan(0)
    
    // Test search functionality
    await page.fill('[data-testid="product-search"]', 'Espresso')
    await expect(page.locator('[data-testid="product-item"]').first()).toContainText('Espresso')
  })

  test('should add items to cart successfully', async ({ page }) => {
    // Add first product to cart
    await page.click('[data-testid="product-item"]')
    
    // Check if cart counter updates
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
    
    // Add same product again
    await page.click('[data-testid="product-item"]')
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('2')
    
    // Check cart contents (desktop view)
    if (await page.locator('[data-testid="cart-desktop"]').isVisible()) {
      await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1)
      await expect(page.locator('[data-testid="cart-item-quantity"]')).toContainText('2')
    }
  })

  test('should handle stock validation correctly', async ({ page }) => {
    // Find a product with limited stock
    const productWithStock = page.locator('[data-testid="product-item"]').first()
    const stockText = await productWithStock.locator('[data-testid="stock-indicator"]').textContent()
    
    if (stockText && stockText.includes('Stock:')) {
      const stockAmount = parseInt(stockText.match(/Stock: (\d+)/)?.[1] || '0')
      
      // Add all available stock
      for (let i = 0; i < stockAmount; i++) {
        await productWithStock.click()
      }
      
      // Try to add one more - should show alert or be disabled
      await productWithStock.click()
      
      // Check if product is now out of stock
      await expect(productWithStock).toHaveClass(/opacity-50|cursor-not-allowed/)
    }
  })

  test('should calculate cart totals correctly', async ({ page }) => {
    // Add known products with known prices
    await page.click('[data-testid="product-item"]')
    
    // Get price from product
    const priceText = await page.locator('[data-testid="product-item"] [data-testid="product-price"]').first().textContent()
    const price = parseFloat(priceText?.replace('$', '') || '0')
    
    // Check cart subtotal
    const cartSubtotal = await page.locator('[data-testid="cart-subtotal"]').textContent()
    const subtotal = parseFloat(cartSubtotal?.replace('$', '') || '0')
    
    expect(subtotal).toBe(price)
    
    // Add second item and verify total updates
    await page.click('[data-testid="product-item"]')
    const newSubtotal = await page.locator('[data-testid="cart-subtotal"]').textContent()
    const newSubtotalValue = parseFloat(newSubtotal?.replace('$', '') || '0')
    
    expect(newSubtotalValue).toBe(price * 2)
  })

  test('should clear cart successfully', async ({ page }) => {
    // Add items to cart
    await page.click('[data-testid="product-item"]')
    await page.click('[data-testid="product-item"]')
    
    // Clear cart
    await page.click('[data-testid="clear-cart-button"]')
    
    // Verify cart is empty
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('0')
    await expect(page.locator('[data-testid="cart-empty-message"]')).toBeVisible()
  })

  test('should persist cart in localStorage', async ({ page }) => {
    // Add items to cart
    await page.click('[data-testid="product-item"]')
    
    // Reload page
    await page.reload()
    await page.waitForSelector('[data-testid="pos-main"]')
    
    // Check if cart persisted
    await expect(page.locator('[data-testid="cart-counter"]')).toContainText('1')
  })
})