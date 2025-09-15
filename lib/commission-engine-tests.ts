/**
 * Commission Engine Production Readiness Tests
 * 
 * Comprehensive testing framework for:
 * - Cross-tenant security verification
 * - Idempotency validation
 * - SECURITY VIOLATION exception handling
 * - Database constraint enforcement
 */

import { execute_sql, withTransaction } from '@/lib/database';
import { processCommissionCalculation, initializePartnerTables, TransactionData } from '@/lib/partner-management';

export interface TestResult {
  testName: string;
  success: boolean;
  message: string;
  details?: any;
  duration: number;
}

export interface TestSuite {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

/**
 * Run a single test with timing and error handling
 */
async function runTest(testName: string, testFunction: () => Promise<void>): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await testFunction();
    const duration = Date.now() - startTime;
    return {
      testName,
      success: true,
      message: 'Test passed',
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      success: false,
      message: `Test failed: ${error}`,
      duration
    };
  }
}

/**
 * Cross-tenant security verification tests
 */
export class CrossTenantSecurityTests {
  
  /**
   * Test that commission calculations respect tenant boundaries
   */
  static async testCommissionTenantIsolation(): Promise<TestResult> {
    return runTest('Commission Tenant Isolation', async () => {
      // Create test data for two different tenants
      const tenant1Id = 'test-tenant-1-' + Date.now();
      const tenant2Id = 'test-tenant-2-' + Date.now();
      
      try {
        // Setup test tenants and partners
        await execute_sql(`
          INSERT INTO tenants (id, subdomain, tenant_name) 
          VALUES ($1, $2, $3), ($4, $5, $6)
        `, [tenant1Id, 'test-tenant-1', 'Test Tenant 1', tenant2Id, 'test-tenant-2', 'Test Tenant 2']);

        // Create partner levels for each tenant
        const level1Result = await execute_sql(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, created_by)
          VALUES ($1, 'BASIC', 'Basic Partner', 1, 0.1, $1) RETURNING id
        `, [tenant1Id]);
        
        const level2Result = await execute_sql(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, created_by)
          VALUES ($1, 'BASIC', 'Basic Partner', 1, 0.1, $1) RETURNING id
        `, [tenant2Id]);

        // Create partners in each tenant
        const partner1Result = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'P001', 'partner1@test.com', 'John', 'Doe', $2, $1) RETURNING id
        `, [tenant1Id, level1Result.rows[0].id]);

        const partner2Result = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'P001', 'partner2@test.com', 'Jane', 'Smith', $2, $1) RETURNING id
        `, [tenant2Id, level2Result.rows[0].id]);

        // Attempt to create a commission record with cross-tenant references (should fail)
        try {
          await execute_sql(`
            INSERT INTO partner_commissions (
              tenant_id, transaction_id, transaction_amount, transaction_type,
              beneficiary_partner_id, beneficiary_partner_code,
              source_partner_id, source_partner_code,
              commission_level, levels_from_source,
              commission_percentage, commission_amount,
              beneficiary_partner_level_id, beneficiary_partner_level_name,
              transaction_date, commission_engine_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            tenant1Id,                    // tenant_id = tenant1
            'CROSS-TENANT-TEST',          // transaction_id
            100.00,                       // transaction_amount
            'payment',                    // transaction_type
            partner2Result.rows[0].id,    // beneficiary_partner_id = partner from tenant2 (SHOULD FAIL)
            'P001',                       // beneficiary_partner_code
            partner1Result.rows[0].id,    // source_partner_id = partner from tenant1
            'P001',                       // source_partner_code
            1,                            // commission_level
            1,                            // levels_from_source
            0.1,                          // commission_percentage
            10.00,                        // commission_amount
            level1Result.rows[0].id,      // beneficiary_partner_level_id
            'Basic Partner',              // beneficiary_partner_level_name
            new Date().toISOString(),     // transaction_date
            '1.0'                         // commission_engine_version
          ]);
          
          throw new Error('Expected SECURITY VIOLATION exception but insert succeeded');
        } catch (error: any) {
          if (error.message.includes('SECURITY VIOLATION')) {
            // This is expected - the security trigger should prevent cross-tenant references
            console.log('✓ Cross-tenant security violation properly detected');
          } else {
            throw new Error(`Unexpected error type: ${error.message}`);
          }
        }
        
      } finally {
        // Cleanup test data
        await execute_sql('DELETE FROM tenants WHERE id IN ($1, $2)', [tenant1Id, tenant2Id]);
      }
    });
  }

  /**
   * Test that partner lookup respects tenant boundaries
   */
  static async testPartnerLookupTenantIsolation(): Promise<TestResult> {
    return runTest('Partner Lookup Tenant Isolation', async () => {
      const tenant1Id = 'lookup-test-1-' + Date.now();
      const tenant2Id = 'lookup-test-2-' + Date.now();
      
      try {
        // Setup test data
        await execute_sql(`
          INSERT INTO tenants (id, subdomain, tenant_name) 
          VALUES ($1, $2, $3), ($4, $5, $6)
        `, [tenant1Id, 'lookup-test-1', 'Lookup Test 1', tenant2Id, 'lookup-test-2', 'Lookup Test 2']);

        const levelResult = await execute_sql(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, created_by)
          VALUES ($1, 'TEST', 'Test Level', 1, 0.1, $1) RETURNING id
        `, [tenant1Id]);

        const partnerResult = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'LOOKUP-TEST', 'lookup@test.com', 'Test', 'User', $2, $1) RETURNING id
        `, [tenant1Id, levelResult.rows[0].id]);

        // Verify partner is found when queried with correct tenant
        const correctResult = await execute_sql(`
          SELECT p.id, p.partner_code
          FROM partners p
          WHERE p.id = $1 AND p.tenant_id = $2
        `, [partnerResult.rows[0].id, tenant1Id]);

        if (correctResult.rows.length !== 1) {
          throw new Error('Partner not found with correct tenant ID');
        }

        // Verify partner is NOT found when queried with wrong tenant
        const wrongResult = await execute_sql(`
          SELECT p.id, p.partner_code
          FROM partners p
          WHERE p.id = $1 AND p.tenant_id = $2
        `, [partnerResult.rows[0].id, tenant2Id]);

        if (wrongResult.rows.length !== 0) {
          throw new Error('Partner found with incorrect tenant ID - security breach!');
        }
        
      } finally {
        await execute_sql('DELETE FROM tenants WHERE id IN ($1, $2)', [tenant1Id, tenant2Id]);
      }
    });
  }
}

/**
 * Idempotency verification tests
 */
export class IdempotencyTests {
  
  /**
   * Test that duplicate transaction processing creates no duplicate commissions
   */
  static async testDuplicateTransactionIdempotency(): Promise<TestResult> {
    return runTest('Duplicate Transaction Idempotency', async () => {
      const tenantId = 'idempotency-test-' + Date.now();
      const transactionId = 'IDEMPOT-TEST-' + Date.now();
      
      try {
        // Setup test tenant and data
        await execute_sql(`
          INSERT INTO tenants (id, subdomain, tenant_name) 
          VALUES ($1, $2, $3)
        `, [tenantId, 'idempotency-test', 'Idempotency Test']);

        const levelResult = await execute_sql(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, max_referral_depth, created_by)
          VALUES ($1, 'IDEM', 'Idempotency Level', 1, 0.15, 3, $1) RETURNING id
        `, [tenantId]);

        // Create source partner
        const sourceResult = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'SOURCE-01', 'source@test.com', 'Source', 'Partner', $2, $1) RETURNING id
        `, [tenantId, levelResult.rows[0].id]);

        // Create upline partner
        const uplineResult = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'UPLINE-01', 'upline@test.com', 'Upline', 'Partner', $2, $1) RETURNING id
        `, [tenantId, levelResult.rows[0].id]);

        // Create relationship between source and upline
        await execute_sql(`
          INSERT INTO partner_relations (tenant_id, parent_partner_id, child_partner_id, depth, path, relationship_type)
          VALUES ($1, $2, $3, 1, $4, 'sponsorship')
        `, [tenantId, uplineResult.rows[0].id, sourceResult.rows[0].id, `${uplineResult.rows[0].id}/${sourceResult.rows[0].id}`]);

        const transactionData: TransactionData = {
          transaction_id: transactionId,
          customer_partner_id: sourceResult.rows[0].id,
          transaction_amount: 500.00,
          transaction_type: 'payment',
          transaction_date: new Date(),
          metadata: { test: 'idempotency' }
        };

        // Mock getCurrentTenantId to return our test tenant
        const originalGetCurrentTenantId = (global as any).mockCurrentTenantId;
        (global as any).mockCurrentTenantId = tenantId;

        // Process the same transaction multiple times
        const result1 = await processCommissionCalculation(transactionData);
        const result2 = await processCommissionCalculation(transactionData);
        const result3 = await processCommissionCalculation(transactionData);

        // Restore original function
        (global as any).mockCurrentTenantId = originalGetCurrentTenantId;

        // All should succeed
        if (!result1.success || !result2.success || !result3.success) {
          throw new Error('One or more commission calculations failed');
        }

        // Check that only one set of commission records exists in database
        const commissionCount = await execute_sql(`
          SELECT COUNT(*) as count 
          FROM partner_commissions 
          WHERE tenant_id = $1 AND transaction_id = $2
        `, [tenantId, transactionId]);

        const expectedCount = result1.total_commissions_calculated;
        const actualCount = parseInt(commissionCount.rows[0].count);

        if (actualCount !== expectedCount) {
          throw new Error(`Expected ${expectedCount} commission records, but found ${actualCount}. Idempotency failed!`);
        }

        console.log(`✓ Idempotency verified: ${actualCount} commission records created once, not duplicated on retry`);
        
      } finally {
        await execute_sql('DELETE FROM tenants WHERE id = $1', [tenantId]);
      }
    });
  }

  /**
   * Test commission record ON CONFLICT behavior directly
   */
  static async testCommissionRecordConflictHandling(): Promise<TestResult> {
    return runTest('Commission Record Conflict Handling', async () => {
      return withTransaction(async (client) => {
        // Create test commission record twice with same unique constraint values
        const testData = {
          tenant_id: 'conflict-test-' + Date.now(),
          transaction_id: 'CONFLICT-TEST-' + Date.now(),
          beneficiary_partner_id: 'partner-conflict-test',
          levels_from_source: 1
        };

        // Setup minimal test data
        await client.query(`
          INSERT INTO tenants (id, subdomain, tenant_name) 
          VALUES ($1, $2, $3)
        `, [testData.tenant_id, 'conflict-test', 'Conflict Test']);

        const levelResult = await client.query(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, created_by)
          VALUES ($1, 'CONFLICT', 'Conflict Level', 1, 0.1, $1) RETURNING id
        `, [testData.tenant_id]);

        const partnerResult = await client.query(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'CONFLICT-P', 'conflict@test.com', 'Conflict', 'Test', $2, $1) RETURNING id
        `, [testData.tenant_id, levelResult.rows[0].id]);

        testData.beneficiary_partner_id = partnerResult.rows[0].id;

        // First insert should succeed and return ID
        const result1 = await client.query(`
          INSERT INTO partner_commissions (
            tenant_id, transaction_id, transaction_amount, transaction_type,
            beneficiary_partner_id, beneficiary_partner_code,
            source_partner_id, source_partner_code,
            commission_level, levels_from_source,
            commission_percentage, commission_amount,
            beneficiary_partner_level_id, beneficiary_partner_level_name,
            transaction_date, commission_engine_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (tenant_id, transaction_id, beneficiary_partner_id, levels_from_source) 
          DO NOTHING
          RETURNING id
        `, [
          testData.tenant_id, testData.transaction_id, 100.00, 'payment',
          testData.beneficiary_partner_id, 'CONFLICT-P',
          testData.beneficiary_partner_id, 'CONFLICT-P',
          1, testData.levels_from_source,
          0.1, 10.00,
          levelResult.rows[0].id, 'Conflict Level',
          new Date().toISOString(), '1.0'
        ]);

        if (result1.rows.length !== 1) {
          throw new Error('First insert should have returned an ID');
        }

        // Second insert should do nothing and return no ID
        const result2 = await client.query(`
          INSERT INTO partner_commissions (
            tenant_id, transaction_id, transaction_amount, transaction_type,
            beneficiary_partner_id, beneficiary_partner_code,
            source_partner_id, source_partner_code,
            commission_level, levels_from_source,
            commission_percentage, commission_amount,
            beneficiary_partner_level_id, beneficiary_partner_level_name,
            transaction_date, commission_engine_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (tenant_id, transaction_id, beneficiary_partner_id, levels_from_source) 
          DO NOTHING
          RETURNING id
        `, [
          testData.tenant_id, testData.transaction_id, 100.00, 'payment',
          testData.beneficiary_partner_id, 'CONFLICT-P',
          testData.beneficiary_partner_id, 'CONFLICT-P',
          1, testData.levels_from_source,
          0.1, 10.00,
          levelResult.rows[0].id, 'Conflict Level',
          new Date().toISOString(), '1.0'
        ]);

        if (result2.rows.length !== 0) {
          throw new Error('Second insert should have returned no ID due to conflict');
        }

        // Verify only one record exists
        const countResult = await client.query(`
          SELECT COUNT(*) as count 
          FROM partner_commissions 
          WHERE tenant_id = $1 AND transaction_id = $2
        `, [testData.tenant_id, testData.transaction_id]);

        if (parseInt(countResult.rows[0].count) !== 1) {
          throw new Error('Should have exactly one commission record after conflict handling');
        }

        console.log('✓ ON CONFLICT DO NOTHING behavior verified');
      });
    });
  }
}

/**
 * Security violation tests
 */
export class SecurityViolationTests {

  /**
   * Test SECURITY VIOLATION exceptions are properly raised for cross-tenant partner references
   */
  static async testSecurityViolationExceptions(): Promise<TestResult> {
    return runTest('Security Violation Exceptions', async () => {
      const tenant1Id = 'security-test-1-' + Date.now();
      const tenant2Id = 'security-test-2-' + Date.now();
      
      try {
        // Setup test tenants and partners
        await execute_sql(`
          INSERT INTO tenants (id, subdomain, tenant_name) 
          VALUES ($1, $2, $3), ($4, $5, $6)
        `, [tenant1Id, 'sec-test-1', 'Security Test 1', tenant2Id, 'sec-test-2', 'Security Test 2']);

        // Create partner levels
        const level1Result = await execute_sql(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, created_by)
          VALUES ($1, 'SEC', 'Security Level', 1, 0.1, $1) RETURNING id
        `, [tenant1Id]);
        
        const level2Result = await execute_sql(`
          INSERT INTO partner_levels (tenant_id, level_code, level_name, level_order, default_commission_rate, created_by)
          VALUES ($1, 'SEC', 'Security Level', 1, 0.1, $1) RETURNING id
        `, [tenant2Id]);

        // Create partners
        const partner1Result = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'SEC001', 'sec1@test.com', 'Security', 'Test1', $2, $1) RETURNING id
        `, [tenant1Id, level1Result.rows[0].id]);

        const partner2Result = await execute_sql(`
          INSERT INTO partners (tenant_id, partner_code, email, first_name, last_name, partner_level_id, created_by)
          VALUES ($1, 'SEC002', 'sec2@test.com', 'Security', 'Test2', $2, $1) RETURNING id
        `, [tenant2Id, level2Result.rows[0].id]);

        // Test 1: Cross-tenant beneficiary partner violation
        let violationCaught = false;
        try {
          await execute_sql(`
            INSERT INTO partner_commissions (
              tenant_id, transaction_id, transaction_amount, transaction_type,
              beneficiary_partner_id, beneficiary_partner_code,
              source_partner_id, source_partner_code,
              commission_level, levels_from_source,
              commission_percentage, commission_amount,
              beneficiary_partner_level_id, beneficiary_partner_level_name,
              transaction_date, commission_engine_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            tenant1Id,                    // tenant_id (tenant1)
            'SEC-VIOLATION-1',            // transaction_id
            100.00,                       // transaction_amount
            'payment',                    // transaction_type
            partner2Result.rows[0].id,    // beneficiary_partner_id (from tenant2 - VIOLATION)
            'SEC002',                     // beneficiary_partner_code
            partner1Result.rows[0].id,    // source_partner_id (from tenant1)
            'SEC001',                     // source_partner_code
            1, 1, 0.1, 10.00,            // commission details
            level1Result.rows[0].id,      // beneficiary_partner_level_id (from tenant1)
            'Security Level',             // beneficiary_partner_level_name
            new Date().toISOString(),     // transaction_date
            '1.0'                         // commission_engine_version
          ]);
        } catch (error: any) {
          if (error.message.includes('SECURITY VIOLATION') && error.message.includes('Beneficiary partner')) {
            violationCaught = true;
            console.log('✓ Cross-tenant beneficiary partner violation properly detected');
          } else {
            throw new Error(`Expected SECURITY VIOLATION for beneficiary partner, got: ${error.message}`);
          }
        }

        if (!violationCaught) {
          throw new Error('Expected SECURITY VIOLATION exception for cross-tenant beneficiary partner');
        }

        // Test 2: Cross-tenant source partner violation  
        violationCaught = false;
        try {
          await execute_sql(`
            INSERT INTO partner_commissions (
              tenant_id, transaction_id, transaction_amount, transaction_type,
              beneficiary_partner_id, beneficiary_partner_code,
              source_partner_id, source_partner_code,
              commission_level, levels_from_source,
              commission_percentage, commission_amount,
              beneficiary_partner_level_id, beneficiary_partner_level_name,
              transaction_date, commission_engine_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            tenant1Id,                    // tenant_id (tenant1)
            'SEC-VIOLATION-2',            // transaction_id
            100.00,                       // transaction_amount
            'payment',                    // transaction_type
            partner1Result.rows[0].id,    // beneficiary_partner_id (from tenant1)
            'SEC001',                     // beneficiary_partner_code
            partner2Result.rows[0].id,    // source_partner_id (from tenant2 - VIOLATION)
            'SEC002',                     // source_partner_code
            1, 1, 0.1, 10.00,            // commission details
            level1Result.rows[0].id,      // beneficiary_partner_level_id (from tenant1)
            'Security Level',             // beneficiary_partner_level_name
            new Date().toISOString(),     // transaction_date
            '1.0'                         // commission_engine_version
          ]);
        } catch (error: any) {
          if (error.message.includes('SECURITY VIOLATION') && error.message.includes('Source partner')) {
            violationCaught = true;
            console.log('✓ Cross-tenant source partner violation properly detected');
          } else {
            throw new Error(`Expected SECURITY VIOLATION for source partner, got: ${error.message}`);
          }
        }

        if (!violationCaught) {
          throw new Error('Expected SECURITY VIOLATION exception for cross-tenant source partner');
        }

        // Test 3: Cross-tenant partner level violation
        violationCaught = false;
        try {
          await execute_sql(`
            INSERT INTO partner_commissions (
              tenant_id, transaction_id, transaction_amount, transaction_type,
              beneficiary_partner_id, beneficiary_partner_code,
              source_partner_id, source_partner_code,
              commission_level, levels_from_source,
              commission_percentage, commission_amount,
              beneficiary_partner_level_id, beneficiary_partner_level_name,
              transaction_date, commission_engine_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            tenant1Id,                    // tenant_id (tenant1)
            'SEC-VIOLATION-3',            // transaction_id
            100.00,                       // transaction_amount
            'payment',                    // transaction_type
            partner1Result.rows[0].id,    // beneficiary_partner_id (from tenant1)
            'SEC001',                     // beneficiary_partner_code
            partner1Result.rows[0].id,    // source_partner_id (from tenant1)
            'SEC001',                     // source_partner_code
            1, 1, 0.1, 10.00,            // commission details
            level2Result.rows[0].id,      // beneficiary_partner_level_id (from tenant2 - VIOLATION)
            'Security Level',             // beneficiary_partner_level_name
            new Date().toISOString(),     // transaction_date
            '1.0'                         // commission_engine_version
          ]);
        } catch (error: any) {
          if (error.message.includes('SECURITY VIOLATION') && error.message.includes('Partner level')) {
            violationCaught = true;
            console.log('✓ Cross-tenant partner level violation properly detected');
          } else {
            throw new Error(`Expected SECURITY VIOLATION for partner level, got: ${error.message}`);
          }
        }

        if (!violationCaught) {
          throw new Error('Expected SECURITY VIOLATION exception for cross-tenant partner level');
        }
        
      } finally {
        await execute_sql('DELETE FROM tenants WHERE id IN ($1, $2)', [tenant1Id, tenant2Id]);
      }
    });
  }
}

/**
 * Run all commission engine production readiness tests
 */
export async function runCommissionEngineTests(): Promise<TestSuite[]> {
  console.log('🚀 Starting Commission Engine Production Readiness Tests');
  
  const suites: TestSuite[] = [];
  
  // Cross-tenant security tests
  const securityTests = await Promise.all([
    CrossTenantSecurityTests.testCommissionTenantIsolation(),
    CrossTenantSecurityTests.testPartnerLookupTenantIsolation()
  ]);
  
  suites.push({
    suiteName: 'Cross-Tenant Security Tests',
    results: securityTests,
    totalTests: securityTests.length,
    passedTests: securityTests.filter(r => r.success).length,
    failedTests: securityTests.filter(r => !r.success).length,
    totalDuration: securityTests.reduce((sum, r) => sum + r.duration, 0)
  });

  // Idempotency tests  
  const idempotencyTests = await Promise.all([
    IdempotencyTests.testDuplicateTransactionIdempotency(),
    IdempotencyTests.testCommissionRecordConflictHandling()
  ]);
  
  suites.push({
    suiteName: 'Idempotency Tests',
    results: idempotencyTests,
    totalTests: idempotencyTests.length,
    passedTests: idempotencyTests.filter(r => r.success).length,
    failedTests: idempotencyTests.filter(r => !r.success).length,
    totalDuration: idempotencyTests.reduce((sum, r) => sum + r.duration, 0)
  });

  // Security violation tests
  const violationTests = await Promise.all([
    SecurityViolationTests.testSecurityViolationExceptions()
  ]);
  
  suites.push({
    suiteName: 'Security Violation Tests',
    results: violationTests,
    totalTests: violationTests.length,
    passedTests: violationTests.filter(r => r.success).length,
    failedTests: violationTests.filter(r => !r.success).length,
    totalDuration: violationTests.reduce((sum, r) => sum + r.duration, 0)
  });

  // Print summary
  console.log('\n📊 Commission Engine Test Results Summary:');
  for (const suite of suites) {
    console.log(`\n${suite.suiteName}:`);
    console.log(`  ✅ Passed: ${suite.passedTests}/${suite.totalTests}`);
    console.log(`  ❌ Failed: ${suite.failedTests}/${suite.totalTests}`);
    console.log(`  ⏱️  Duration: ${suite.totalDuration}ms`);
    
    // Print failed test details
    for (const result of suite.results.filter(r => !r.success)) {
      console.log(`  🔴 ${result.testName}: ${result.message}`);
    }
  }

  const totalTests = suites.reduce((sum, s) => sum + s.totalTests, 0);
  const totalPassed = suites.reduce((sum, s) => sum + s.passedTests, 0);
  const totalFailed = suites.reduce((sum, s) => sum + s.failedTests, 0);
  
  console.log(`\n🎯 Overall Results: ${totalPassed}/${totalTests} passed (${Math.round(totalPassed/totalTests*100)}%)`);
  
  if (totalFailed === 0) {
    console.log('🎉 All Commission Engine production readiness tests PASSED!');
  } else {
    console.log(`⚠️  ${totalFailed} tests FAILED - production readiness requires all tests to pass`);
  }
  
  return suites;
}