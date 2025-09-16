#!/usr/bin/env node
/**
 * Contract Drift Detection Script - Check for breaking changes
 * Usage: pnpm contracts:drift
 */

async function checkContractDrift() {
  // Dynamic imports to work with TypeScript source files
  const { ContractDriftDetector } = await import('../lib/cell-contracts/drift-detection.js');
  const { getGlobalContractRegistry } = await import('../lib/cell-contracts/validation.js');
  console.log('🔍 Checking contract drift...\n');
  
  try {
    const detector = new ContractDriftDetector();
    const currentRegistry = getGlobalContractRegistry();
    
    // Check for drift against baseline
    const driftReport = detector.detectDrifts(currentRegistry);
    
    if (!driftReport) {
      console.log('⚠️  No baseline found. Run `pnpm contracts:baseline` to create one.');
      process.exit(0);
    }
    
    const { summary, drifts, ciRecommendations } = driftReport;
    const { criticalIssues, majorIssues, minorIssues, totalChanges, overallRisk } = summary;
    
    console.log(`📊 Contract Drift Analysis Results:`);
    console.log(`├─ Critical Changes: ${criticalIssues}`);
    console.log(`├─ Major Changes: ${majorIssues}`);
    console.log(`└─ Minor Changes: ${minorIssues}\n`);
    
    if (totalChanges === 0) {
      console.log('✅ No contract drift detected - all contracts are stable!');
      process.exit(0);
    }
    
    console.log(`📋 Overall Risk Level: ${overallRisk}`);
    console.log(`🔄 Total Contracts Changed: ${drifts.length}`);
    console.log(`📊 Total Changes: ${totalChanges}\n`);
    
    // Display drift details by contract
    for (const drift of drifts.slice(0, 5)) { // Show top 5 drifts
      console.log(`\n📋 Contract: ${drift.contractKey}`);
      console.log(`   Changes: ${drift.summary.totalChanges} (${drift.summary.breakingChanges} breaking)`);
      console.log(`   Risk: ${drift.summary.compatibilityRisk}`);
      
      // Show top changes for this contract
      for (const change of drift.changesSinceBaseline.slice(0, 3)) {
        console.log(`   🔸 ${change.description}`);
        console.log(`     Impact: ${change.impact}`);
      }
      
      if (drift.changesSinceBaseline.length > 3) {
        console.log(`     ... and ${drift.changesSinceBaseline.length - 3} more changes`);
      }
    }
    
    if (drifts.length > 5) {
      console.log(`\n   ... and ${drifts.length - 5} more contracts with changes`);
    }
    
    // Display CI recommendations
    console.log(`\n🤖 CI Recommendations:`);
    for (const action of ciRecommendations.suggestedActions) {
      console.log(`   ${action}`);
    }
    
    // Exit with appropriate code
    if (ciRecommendations.shouldBlock) {
      console.log('\n❌ DEPLOY BLOCKED - Critical breaking changes detected!');
      console.log('🚫 Resolve critical issues before deployment');
      process.exit(1);
    } else if (ciRecommendations.requiresManualReview) {
      console.log('\n⚠️  Manual review required before deployment');
      process.exit(0);
    } else {
      console.log('\n✅ Changes are safe - deployment approved');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('💥 Drift detection failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkContractDrift().catch((error) => {
    console.error('💥 Fatal error during drift detection:', error);
    process.exit(1);
  });
}