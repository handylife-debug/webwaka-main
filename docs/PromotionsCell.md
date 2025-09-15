# Promotions Cell Documentation

## Purpose
The Promotions Cell is your marketing and customer incentive engine. It automatically applies discounts, manages coupons, handles gift cards, and tracks loyalty points to boost sales and keep customers coming back.

## How It Works

### Discount Management
- **Percentage Discounts**: Apply percentage-based reductions (e.g., 20% off)
- **Fixed Amount Discounts**: Apply specific dollar amounts off (e.g., $5 off)
- **Buy-One-Get-One**: Automatic BOGO promotions
- **Bulk Discounts**: Quantity-based pricing (buy 3, get 1 free)

### Coupon System
- **Digital Coupons**: Scan or enter coupon codes
- **Automatic Application**: System suggests applicable coupons
- **Expiration Tracking**: Prevents use of expired coupons
- **Usage Limits**: Controls how many times coupons can be used

### Gift Card Management
- **Issue Gift Cards**: Create new gift cards with custom amounts
- **Redeem Gift Cards**: Apply gift card balances to purchases
- **Balance Tracking**: Real-time gift card balance updates
- **Partial Redemption**: Use part of gift card balance, save the rest

### Loyalty Points System
- **Earn Points**: Customers earn points with every purchase
- **Redeem Rewards**: Convert points to discounts or free items
- **Tier Benefits**: Different rewards based on customer loyalty level
- **Point Expiration**: Manage point validity periods

## Key Features

**Smart Promotion Stacking**
- Automatically finds the best combination of promotions
- Prevents conflicting discounts from being applied together
- Maximizes customer savings while protecting profit margins

**Customer Segmentation**
- VIP customer exclusive discounts
- Birthday and anniversary special offers
- First-time customer welcome promotions

**Seasonal Campaigns**
- Holiday-specific promotions
- End-of-season clearance sales
- Flash sales and limited-time offers

## How to Use in the POS

### Accessing Promotions
1. **Add items to cart** first
2. **Click "Promotions" button** in the main POS interface
3. **Promotions Cell opens** as overlay modal

### Step-by-Step Usage
1. **View Available Promotions**: See all applicable discounts and offers
2. **Apply Discounts**:
   - Select percentage discount (e.g., 20% off)
   - Choose fixed amount discount (e.g., $5 off)
   - Enter coupon codes in the text field
3. **Use Gift Cards**: Enter gift card number and PIN
4. **Loyalty Points**: System automatically shows available points to redeem
5. **Confirm Selection**: Click "Apply Promotions" to update cart total

### Required Inputs
- **Items in Cart**: Must have products before applying promotions
- **Coupon Codes**: Valid promotional codes (if using coupons)
- **Gift Card Info**: Card number and PIN (if using gift cards)
- **Customer ID**: For loyalty point redemption

### Expected Outputs
- **Updated Cart Total**: Price reflects all applied promotions
- **Promotion Summary**: Shows which discounts were applied
- **Loyalty Points Used**: Updates customer point balance
- **Gift Card Balance**: Shows remaining balance after use

### Common Error States
- **Expired Coupon**: Shows expiration date and suggests alternatives
- **Invalid Gift Card**: Prompts to check number and PIN
- **Insufficient Points**: Shows available points vs required
- **Promotion Conflicts**: Explains which promotions cannot be combined

## When to Use
- Applying any type of discount or promotion to a sale
- Managing customer loyalty programs
- Processing gift card transactions
- Running special marketing campaigns

## Offline Functionality
- Applies all programmed promotions without internet
- Stores loyalty point transactions for later sync
- Validates gift card balances from local cache
- Queues promotional data updates for when online