#!/usr/bin/env tsx
/**
 * Commission Engine Production Readiness Test Runner
 * 
 * This script executes comprehensive tests to verify the commission engine
 * is ready for production deployment with all operational safeguards in place.
 */

import { runCommissionEngineTests } from '../lib/commission-engine-tests';
import { initializePartnerTables } from '../lib/partner-management';

/**
 * Main test execution function
 */
async function main() {
  console.log('🏗️  Commission Engine Production Readiness Verification');
  console.log('======================================================');
  
  try {
    // Initialize database tables if needed
    console.log('📋 Initializing database tables...');
    await initializePartnerTables();
    console.log('✅ Database tables initialized');
    
    // Run comprehensive tests
    console.log('\n🧪 Running comprehensive production readiness tests...\n');
    const testSuites = await runCommissionEngineTests();
    
    // Determine overall status
    const totalTests = testSuites.reduce((sum, s) => sum + s.totalTests, 0);
    const totalPassed = testSuites.reduce((sum, s) => sum + s.passedTests, 0);
    const totalFailed = testSuites.reduce((sum, s) => sum + s.failedTests, 0);
    
    console.log('\n========================================');
    console.log('📊 FINAL PRODUCTION READINESS REPORT');
    console.log('========================================');
    
    if (totalFailed === 0) {
      console.log('🎉 STATUS: PRODUCTION READY ✅');
      console.log(`📈 All ${totalTests} tests passed successfully`);
      console.log('\n✅ OPERATIONAL SAFEGUARDS VERIFIED:');
      console.log('   ✓ Transactional processing with automatic rollback');
      console.log('   ✓ Idempotent commission creation prevents duplicates');
      console.log('   ✓ Cross-tenant security isolation enforced');
      console.log('   ✓ SECURITY VIOLATION exceptions properly raised');
      console.log('   ✓ Database constraints prevent data corruption');
      console.log('   ✓ Audit trails for regulatory compliance');
      console.log('   ✓ Comprehensive error handling and recovery');
      
      console.log('\\n🚀 The Commission Engine is READY for production deployment!');
      process.exit(0);
    } else {
      console.log('❌ STATUS: NOT PRODUCTION READY ⚠️');
      console.log(`📉 ${totalFailed}/${totalTests} tests failed`);
      console.log('\\n🔧 REQUIRED ACTIONS:');
      
      for (const suite of testSuites) {
        for (const result of suite.results.filter(r => !r.success)) {
          console.log(`   ❌ ${suite.suiteName}: ${result.testName}`);
          console.log(`      └─ ${result.message}`);
        }
      }
      
      console.log('\\n⚠️  Production deployment BLOCKED until all tests pass');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    console.log('\\n🔧 Fix the error above and re-run the tests');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n⚠️  Tests interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\\n⚠️  Tests terminated');
  process.exit(143);
});

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Execute main function
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { main as runCommissionEngineProductionTests };