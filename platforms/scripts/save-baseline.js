#!/usr/bin/env node
/**
 * Contract Baseline Saver - Save current contracts as baseline
 * Usage: pnpm contracts:baseline
 */

async function saveContractBaseline() {
  // Dynamic imports to work with TypeScript source files
  const { ContractDriftDetector } = await import('../lib/cell-contracts/drift-detection.js');
  const { getGlobalContractRegistry } = await import('../lib/cell-contracts/validation.js');
  console.log('💾 Saving contract baseline...\n');
  
  try {
    const detector = new ContractDriftDetector();
    const currentRegistry = getGlobalContractRegistry();
    
    // Generate version string based on timestamp
    const version = `v1-${new Date().toISOString().split('T')[0]}`; // e.g., v1-2025-09-16
    
    // Save baseline
    detector.saveBaseline(currentRegistry, version);
    
    console.log(`\n✅ Baseline saved successfully!`);
    console.log(`📋 Version: ${version}`);
    console.log('🔍 Run `pnpm contracts:drift` to check for future drift');
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Baseline save failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  saveContractBaseline().catch((error) => {
    console.error('💥 Fatal error saving baseline:', error);
    process.exit(1);
  });
}