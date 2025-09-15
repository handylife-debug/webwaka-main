# Commission Engine "Tissue" Documentation

## Overview

The Commission Engine "Tissue" is a production-ready multi-tier commission calculation system that automatically calculates and tracks commissions for partner referrals in real-time. The engine supports unlimited referral depths, multiple partner tiers, and provides comprehensive audit trails for regulatory compliance.

## Core Architecture

### 1. Commission Calculation Engine

The commission engine operates on transaction events and automatically:
- Identifies the referring partner from transaction data
- Traverses the partner hierarchy to find all upline partners
- Calculates commissions based on partner tier rates and levels
- Creates commission records with complete audit trails
- Ensures idempotent processing to prevent duplicate commissions

### 2. Key Components

#### Partner Hierarchy System
- **Partners**: Individual partners with tier assignments and referral codes
- **Partner Levels**: Bronze, Silver, Gold, etc. with different commission rates
- **Partner Relations**: Tracks sponsor/upline relationships for commission calculations
- **Referral Depth**: Configurable maximum depth for commission calculations per tier

#### Commission Processing Pipeline
```
Transaction Event → Partner Identification → Upline Traversal → Commission Calculation → Record Creation → Audit Logging
```

## Commission Calculation Process

### Step 1: Transaction Trigger
When a customer transaction occurs, the system receives:
```typescript
interface TransactionData {
  transaction_id: string;
  customer_partner_id: string;    // The referring partner
  customer_email: string;
  transaction_amount: number;
  transaction_type: 'payment' | 'signup' | 'recurring' | 'bonus';
  transaction_date: Date;
  metadata?: Record<string, any>;
}
```

### Step 2: Partner Identification
- Validates the referring partner exists and is active
- Retrieves partner's tier information and commission rates
- Confirms partner is eligible to earn commissions

### Step 3: Upline Commission Calculation
The engine traverses the partner hierarchy using the `getUplinePartners()` function:
- Finds all upline partners within the referral depth limit
- Calculates commission amounts based on transaction value and tier rates
- Applies level-specific commission percentages

### Step 4: Commission Record Creation
For each eligible upline partner, creates a commission record:
```typescript
interface Commission {
  transaction_id: string;
  transaction_amount: number;
  beneficiary_partner_id: string;
  source_partner_id: string;
  commission_level: number;        // 1 = direct, 2 = second level, etc.
  commission_percentage: number;
  commission_amount: number;
  payout_status: 'pending' | 'approved' | 'paid';
  calculation_status: 'calculated';
  // ... audit fields
}
```

## Partner Tier System

### Partner Levels Configuration
Each partner level defines:
- **Commission Rate**: Base percentage for commission calculations
- **Referral Depth**: Maximum levels deep for earning commissions
- **Minimum Requirements**: Volume, downline count, etc.

Example tier structure:
- **Bronze**: 5% commission, 3 levels deep
- **Silver**: 8% commission, 5 levels deep  
- **Gold**: 12% commission, 7 levels deep

### Commission Calculation Formula
```
Commission Amount = Transaction Amount × Partner Tier Rate × Level Multiplier
```

The level multiplier can decrease with depth to incentivize direct referrals while still rewarding upline partners.

## Security & Data Integrity

### Multi-Tenant Isolation
- All commission data is isolated by tenant ID
- Cross-tenant data access is prevented at the database level
- Secure partner identification and validation

### Idempotent Processing
- Duplicate transaction processing is prevented
- Uses composite unique constraints on (tenant_id, transaction_id, beneficiary_partner_id, levels_from_source)
- Graceful handling of retry scenarios

### Audit Trail
Complete audit logging includes:
- Transaction processing timestamps
- Partner hierarchy at calculation time
- Commission engine version
- Error logs and retry attempts
- Regulatory compliance data

## Database Schema

### Core Tables

#### `partner_commissions`
Primary commission records table with indexes for:
- Fast partner-specific queries
- Date range filtering
- Status-based reporting
- Multi-tenant isolation

#### `partners`
Partner information with tier assignments and referral relationships

#### `partner_levels`
Tier definitions with commission rates and requirements

#### `partner_relations`
Hierarchical relationships for upline commission calculations

## Performance Optimizations

### Database Indexes
- Optimized for partner-specific commission queries
- Date-based partitioning ready
- Multi-tenant performance optimization

### Caching Strategy
- Partner hierarchy caching for faster upline traversal
- Commission rate caching per partner tier
- Configurable cache invalidation

### Batch Processing
- Support for bulk transaction processing
- Efficient upline partner calculations
- Optimized database operations

## Error Handling

### Graceful Degradation
- Failed commission calculations don't block transactions
- Comprehensive error logging for debugging
- Automatic retry mechanisms for transient failures

### Validation
- Transaction amount validation
- Partner eligibility verification
- Commission rate boundary checking
- Referral depth limit enforcement

## Integration Guide

### Processing Commissions
```typescript
import { processCommissionCalculation } from '@/lib/partner-management';

const result = await processCommissionCalculation({
  transaction_id: 'unique-transaction-id',
  customer_partner_id: 'partner-uuid',
  customer_email: 'customer@example.com',
  transaction_amount: 100.00,
  transaction_type: 'payment',
  transaction_date: new Date(),
  metadata: { source: 'payment_processor' }
});

if (result.success) {
  console.log(`Calculated ${result.total_commissions_calculated} commissions`);
  console.log(`Total commission amount: $${result.total_commission_amount}`);
} else {
  console.error('Commission calculation failed:', result.errors);
}
```

### Retrieving Commission Data
```typescript
import { getPartnerCommissions, getPartnerCommissionStats } from '@/lib/partner-management';

// Get commission history
const commissions = await getPartnerCommissions(partnerId, {
  limit: 50,
  status: 'pending',
  transaction_type: 'payment'
});

// Get commission statistics
const stats = await getPartnerCommissionStats(partnerId);
console.log(`Total earnings: $${stats.total_earnings}`);
console.log(`Pending: $${stats.pending_earnings}`);
```

## Monitoring & Analytics

### Key Metrics
- Total commissions processed
- Partner-level performance metrics
- Commission calculation latency
- Error rates and retry statistics

### Reporting Capabilities
- Real-time commission tracking
- Partner performance analytics
- Trend analysis and forecasting
- Compliance reporting

## Compliance & Regulations

### Audit Requirements
- Complete transaction audit trails
- Partner activity logging
- Commission calculation transparency
- Data retention policies

### Financial Compliance
- Accurate commission calculations
- Proper financial record keeping
- Tax reporting support
- Dispute resolution trails

## Scalability Considerations

### Horizontal Scaling
- Database read replicas for reporting
- Commission calculation worker processes
- Multi-region deployment support

### Performance Monitoring
- Commission calculation performance metrics
- Database query optimization
- Cache hit rate monitoring
- Error rate tracking

## Future Enhancements

### Advanced Features
- Dynamic commission rates based on performance
- Time-based commission tiers
- Bonus commission structures
- Advanced analytics and ML insights

### Integration Possibilities
- Payment processor webhooks
- CRM system integration
- Marketing automation platforms
- Business intelligence tools