'use client';

import React, { useState } from 'react';

// TaxAndFee Cell - Client Component
interface TaxAndFeeProps {
  amount: number;
  taxRate?: number;
  region?: string;
  itemType?: string;
  onCalculate?: (result: any) => void;
}

export default function TaxAndFeeCell({
  amount,
  taxRate = 0.08,
  region = 'default',
  itemType = 'general',
  onCalculate
}: TaxAndFeeProps) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const calculateTax = async () => {
    setLoading(true);
    
    // Simulate cell calculation logic
    const baseTax = amount * taxRate;
    const regionMultiplier = region === 'CA' ? 1.1 : region === 'NY' ? 1.15 : 1.0;
    const regionTax = baseTax * (regionMultiplier - 1);
    const processingFee = amount > 100 ? 2.50 : 1.25;
    
    const tax = baseTax + regionTax;
    const fees = processingFee;
    const total = amount + tax + fees;
    
    const calculationResult = {
      subtotal: amount,
      tax: parseFloat(tax.toFixed(2)),
      fees: parseFloat(fees.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      breakdown: {
        baseTax: parseFloat(baseTax.toFixed(2)),
        regionTax: parseFloat(regionTax.toFixed(2)),
        processingFee: parseFloat(processingFee.toFixed(2))
      }
    };
    
    setResult(calculationResult);
    onCalculate?.(calculationResult);
    setLoading(false);
  };

  return (
    <div className="webwaka-cell border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Tax & Fee Calculator</h3>
        <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          inventory/TaxAndFee v1.0.0
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Amount:</span>
            <span className="ml-2 font-medium">${amount.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600">Tax Rate:</span>
            <span className="ml-2 font-medium">{(taxRate * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-gray-600">Region:</span>
            <span className="ml-2 font-medium">{region}</span>
          </div>
          <div>
            <span className="text-gray-600">Item Type:</span>
            <span className="ml-2 font-medium">{itemType}</span>
          </div>
        </div>

        <button
          onClick={calculateTax}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Calculating...' : 'Calculate Tax & Fees'}
        </button>

        {result && (
          <div className="mt-4 p-3 bg-gray-50 rounded border">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-medium">${result.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax:</span>
                <span className="font-medium">${result.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Fees:</span>
                <span className="font-medium">${result.fees.toFixed(2)}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>Total:</span>
                <span>${result.total.toFixed(2)}</span>
              </div>
            </div>
            
            {result.breakdown && (
              <details className="mt-3">
                <summary className="text-xs text-gray-600 cursor-pointer">Breakdown</summary>
                <div className="mt-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Base Tax:</span>
                    <span>${result.breakdown.baseTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Region Tax:</span>
                    <span>${result.breakdown.regionTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processing Fee:</span>
                    <span>${result.breakdown.processingFee.toFixed(2)}</span>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}