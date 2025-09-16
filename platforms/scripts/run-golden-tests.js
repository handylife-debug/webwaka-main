#!/usr/bin/env node
/**
 * Golden Tests Runner - Execute contract validation tests
 * Usage: node platforms/scripts/run-golden-tests.js
 */

async function runAllGoldenTests() {
  // Dynamic imports to work with TypeScript source files
  const { GoldenTestRunner } = await import('../lib/cell-contracts/golden-tests-runner.js');
  const { getGlobalContractRegistry } = await import('../lib/cell-contracts/validation.js');
  console.log('🧪 Starting Golden Tests Execution...\n');
  
  const runner = new GoldenTestRunner();
  const registry = getGlobalContractRegistry();
  
  // Test suite files to execute
  const testSuites = [
    { contractKey: 'customer/profile/v1', operation: 'get-customer' },
    { contractKey: 'ecommerce/b2b-access-control/v1', operation: 'check-access' },
    { contractKey: 'inventory/tax-and-fee/v1', operation: 'calculate-tax' }
  ];
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSuites = 0;
  
  for (const { contractKey, operation } of testSuites) {
    console.log(`\n📋 Loading test suite: ${contractKey}/${operation}`);
    
    const suite = runner.loadSuite(contractKey, operation);
    if (!suite) {
      console.log(`❌ No test suite found for ${contractKey}/${operation}`);
      continue;
    }
    
    // Get schemas from registry
    const contractSchemas = registry.getOperationSchemas(
      contractKey.split('/')[0],
      contractKey.split('/')[1], 
      contractKey.split('/')[2],
      operation
    );
    
    if (!contractSchemas) {
      console.log(`❌ No contract schemas found for ${contractKey}/${operation}`);
      continue;
    }
    
    try {
      // Run the test suite (without mock API calls for now)
      const result = await runner.runSuite(
        suite,
        contractSchemas.requestSchema,
        contractSchemas.responseSchema
        // No mock API call - just schema validation
      );
      
      totalSuites++;
      totalPassed += result.summary.passed;
      totalFailed += result.summary.failed;
      
      // Print results
      if (result.summary.failed > 0) {
        console.log(`❌ FAILED: ${result.summary.failed}/${result.summary.total} tests failed`);
      } else {
        console.log(`✅ PASSED: All ${result.summary.total} tests passed`);
      }
      
    } catch (error) {
      console.error(`❌ Test suite execution failed:`, error.message);
      totalFailed++;
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🎯 GOLDEN TESTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`📊 Test Suites:  ${totalSuites}`);
  console.log(`✅ Tests Passed: ${totalPassed}`);
  console.log(`❌ Tests Failed: ${totalFailed}`);
  console.log(`📈 Success Rate: ${totalPassed + totalFailed > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) : 0}%`);
  
  if (totalFailed > 0) {
    console.log('\n⚠️  Some tests failed. Review contract implementations.');
    process.exit(1);
  } else {
    console.log('\n🎉 All golden tests passed! Contracts are stable.');
    process.exit(0);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllGoldenTests().catch((error) => {
    console.error('💥 Fatal error running golden tests:', error);
    process.exit(1);
  });
}