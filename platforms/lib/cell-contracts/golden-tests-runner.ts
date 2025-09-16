/**
 * Golden Tests Runner - Execute contract validation tests
 * Provides runtime test execution for golden test suites
 */

import { z } from 'zod';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface GoldenTestCase {
  name: string;
  description: string;
  request: any;
  expectedResponse: any;
  shouldPass: boolean;
  metadata?: {
    priority: 'low' | 'medium' | 'high' | 'critical';
    tags: string[];
  };
}

export interface GoldenTestSuite {
  contractKey: string;
  operation: string;
  version: string;
  description: string;
  testCases: GoldenTestCase[];
  metadata: {
    lastUpdated: string;
    totalCases: number;
  };
}

export interface TestResult {
  testCase: string;
  passed: boolean;
  error?: string;
  actualResponse?: any;
  validationErrors?: string[];
}

export interface SuiteResult {
  suite: string;
  operation: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

// =============================================================================
// GOLDEN TEST RUNNER CLASS
// =============================================================================

export class GoldenTestRunner {
  private suitesPath: string;

  constructor(suitesPath: string = 'platforms/lib/cell-contracts/golden-tests') {
    this.suitesPath = suitesPath;
  }

  /**
   * Load a golden test suite from disk
   */
  loadSuite(contractKey: string, operation: string): GoldenTestSuite | null {
    const fileName = `${contractKey.replace(/\//g, '-')}-${operation}.json`;
    const filePath = join(this.suitesPath, fileName);
    
    if (!existsSync(filePath)) {
      console.warn(`Golden test suite not found: ${filePath}`);
      return null;
    }

    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const suite = JSON.parse(fileContent) as GoldenTestSuite;
      
      // Validate suite structure
      if (!suite.contractKey || !suite.operation || !suite.testCases) {
        throw new Error('Invalid suite structure');
      }
      
      return suite;
    } catch (error) {
      console.error(`Failed to load golden test suite ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Run a golden test suite with schema validation
   */
  async runSuite(
    suite: GoldenTestSuite,
    requestSchema: z.ZodSchema,
    responseSchema: z.ZodSchema,
    apiCall?: (request: any) => Promise<any>
  ): Promise<SuiteResult> {
    const results: TestResult[] = [];
    
    console.log(`\n🧪 Running suite: ${suite.contractKey}/${suite.operation}`);
    console.log(`📋 Test cases: ${suite.testCases.length}`);

    for (const testCase of suite.testCases) {
      console.log(`\n  🔍 Running: ${testCase.name}`);
      
      const result: TestResult = {
        testCase: testCase.name,
        passed: false
      };

      try {
        // Validate request against schema
        const requestValidation = requestSchema.safeParse(testCase.request);
        if (!requestValidation.success) {
          result.error = `Request validation failed: ${requestValidation.error.message}`;
          result.validationErrors = requestValidation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          results.push(result);
          continue;
        }

        // If API call provided, execute it
        let actualResponse = testCase.expectedResponse;
        if (apiCall) {
          try {
            actualResponse = await apiCall(testCase.request);
          } catch (apiError: any) {
            result.error = `API call failed: ${apiError.message}`;
            results.push(result);
            continue;
          }
        }

        // Validate response against schema
        const responseValidation = responseSchema.safeParse(actualResponse);
        if (!responseValidation.success) {
          result.error = `Response validation failed: ${responseValidation.error.message}`;
          result.validationErrors = responseValidation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          result.actualResponse = actualResponse;
          results.push(result);
          continue;
        }

        // For golden tests without API calls, compare with expected response
        if (!apiCall) {
          const responseMatches = this.deepCompareResponses(actualResponse, testCase.expectedResponse);
          if (!responseMatches) {
            result.error = 'Response does not match expected golden response';
            result.actualResponse = actualResponse;
            results.push(result);
            continue;
          }
        }

        // Test passed
        result.passed = true;
        console.log(`    ✅ ${testCase.name} - PASSED`);

      } catch (error: any) {
        result.error = `Unexpected error: ${error.message}`;
        console.log(`    ❌ ${testCase.name} - FAILED: ${result.error}`);
      }

      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;

    return {
      suite: suite.contractKey,
      operation: suite.operation,
      results,
      summary: {
        total: results.length,
        passed,
        failed,
        passRate: results.length > 0 ? (passed / results.length) * 100 : 0
      }
    };
  }

  /**
   * Deep compare two responses for golden test validation
   */
  private deepCompareResponses(actual: any, expected: any): boolean {
    // For golden tests, we do a loose comparison focusing on structure
    // rather than exact values (like timestamps, request IDs)
    
    if (typeof actual !== typeof expected) {
      return false;
    }

    if (actual === null || expected === null) {
      return actual === expected;
    }

    if (typeof actual !== 'object') {
      return actual === expected;
    }

    if (Array.isArray(actual) !== Array.isArray(expected)) {
      return false;
    }

    if (Array.isArray(actual)) {
      if (actual.length !== expected.length) {
        return false;
      }
      
      for (let i = 0; i < actual.length; i++) {
        if (!this.deepCompareResponses(actual[i], expected[i])) {
          return false;
        }
      }
      
      return true;
    }

    // Object comparison
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    
    // Check structure (keys should match)
    if (actualKeys.length !== expectedKeys.length) {
      return false;
    }
    
    for (const key of actualKeys) {
      if (!expectedKeys.includes(key)) {
        return false;
      }
      
      // Skip dynamic fields that change between test runs
      if (this.isDynamicField(key)) {
        continue;
      }
      
      if (!this.deepCompareResponses(actual[key], expected[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a field is dynamic and should be skipped in golden comparisons
   */
  private isDynamicField(fieldName: string): boolean {
    const dynamicFields = [
      'requestId',
      'timestamp',
      'createdAt',
      'updatedAt',
      'processedAt',
      'id', // Generated IDs
      'transactionId'
    ];
    
    return dynamicFields.includes(fieldName);
  }

  /**
   * Get all available test suites
   */
  listAvailableSuites(): string[] {
    try {
      const files = readdirSync(this.suitesPath);
      return files.filter((file: string) => file.endsWith('.json'));
    } catch (error) {
      console.error('Failed to list test suites:', error);
      return [];
    }
  }
}

// Export for use in scripts
export default GoldenTestRunner;