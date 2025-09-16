'use client';

import React from 'react';
import { Cell } from '../../cell-sdk/components/Cell';
import { DarkModeCell } from '../../cells/ui/DarkModeCell';

export default function CellTestPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-4">Cell SDK Test Page</h1>
        <p className="text-gray-600 mb-6">
          Testing the fixed Cell SDK implementation with the TaxAndFee Cell
        </p>
        
        <div className="border rounded-lg p-4 bg-gray-50">
          <h2 className="text-lg font-semibold mb-4">TaxAndFee Cell Test</h2>
          
          <Cell 
            name="inventory/TaxAndFee"
            channel="stable"
            props={{
              amount: 100.00,
              taxRate: 0.08,
              region: "CA",
              itemType: "general"
            }}
            fallback={
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Loading TaxAndFee Cell...</p>
              </div>
            }
            onError={(error) => console.error('Cell error:', error)}
          />
        </div>
        
        {/* Dark Mode Cell Test */}
        <div className="border rounded-lg p-4 bg-gray-50 mt-6">
          <h2 className="text-lg font-semibold mb-4">Dark Mode Cell Test</h2>
          <div className="max-w-2xl">
            <DarkModeCell 
              tenantId="test-tenant-123"
              className="w-full"
              showAdvanced={true}
            />
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-md font-semibold text-blue-900 mb-2">Implementation Status</h3>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>✅ Client-Server Architecture Fixed: Client only renders UI, server handles actions</li>
            <li>✅ Channel Parameter Fixed: Properly passed through all layers</li>
            <li>✅ Schema Validation Simplified: Consistent approach across components</li>
            <li>✅ CircuitBreaker Implemented: Proper error handling and resilience</li>
            <li>✅ Registry Mock Implementation: Development-ready artifact storage</li>
            <li>✅ Security Features Configured: Disabled in development, enabled in production</li>
            <li>✅ Dark Mode Cell Fixed: Self-contained with ThemeProvider integration</li>
          </ul>
        </div>
      </div>
    </div>
  );
}