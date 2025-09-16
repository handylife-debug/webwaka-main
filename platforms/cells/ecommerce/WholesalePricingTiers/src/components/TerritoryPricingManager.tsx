'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, TrendingUp } from 'lucide-react';

interface Territory {
  id: string;
  territory: string;
  territoryDisplayName: string;
  priceMultiplier: number;
  shippingMultiplier: number;
  taxMultiplier: number;
  isActive: boolean;
}

interface TerritoryPricingManagerProps {
  territories: Territory[];
  tenantId: string;
}

export function TerritoryPricingManager({ territories, tenantId }: TerritoryPricingManagerProps) {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <Globe className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Territory Pricing Management</h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure pricing multipliers and rules for different Nigerian territories
        </p>
        <div className="text-xs text-orange-600 bg-orange-50 p-3 rounded-lg border border-orange-200">
          🚧 Component under development - Territory-specific pricing configuration coming soon
        </div>
      </div>

      {/* Territory Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {territories.map((territory) => (
          <Card key={territory.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>{territory.territoryDisplayName}</span>
                <Badge className={territory.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                  {territory.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Price Multiplier:</span>
                <span className="font-medium">{territory.priceMultiplier}x</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Shipping Multiplier:</span>
                <span className="font-medium">{territory.shippingMultiplier}x</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Tax Multiplier:</span>
                <span className="font-medium">{territory.taxMultiplier}x</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {territories.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No territories configured for tenant {tenantId}</p>
        </div>
      )}
    </div>
  );
}