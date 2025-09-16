'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart, 
  Users,
  Package,
  DollarSign,
  Percent,
  Globe
} from 'lucide-react';

import type { WholesalePricingTier, Territory } from '../types';

interface PricingAnalyticsDashboardProps {
  tiers: WholesalePricingTier[];
  territories: Territory[];
  tenantId: string;
}

export function PricingAnalyticsDashboard({ tiers, territories, tenantId }: PricingAnalyticsDashboardProps) {
  // Calculate comprehensive analytics with proper discount type handling
  const activeTiers = tiers.filter(tier => tier.isActive);
  const discountStats = {
    percentage: tiers.filter(t => t.discountType === 'percentage'),
    fixed_amount: tiers.filter(t => t.discountType === 'fixed_amount'),
    fixed_price: tiers.filter(t => t.discountType === 'fixed_price')
  };
  
  // Calculate meaningful averages by discount type
  const averagePercentageDiscount = discountStats.percentage.length > 0
    ? discountStats.percentage.reduce((sum, tier) => sum + tier.discountValue, 0) / discountStats.percentage.length
    : 0;
  
  const averageFixedAmount = discountStats.fixed_amount.length > 0
    ? discountStats.fixed_amount.reduce((sum, tier) => sum + tier.discountValue, 0) / discountStats.fixed_amount.length
    : 0;
  
  const averageFixedPrice = discountStats.fixed_price.length > 0
    ? discountStats.fixed_price.reduce((sum, tier) => sum + tier.discountValue, 0) / discountStats.fixed_price.length
    : 0;
  
  // Territory and compliance analytics
  const uniqueTerritories = new Set(tiers.map(tier => tier.territory).filter(Boolean)).size;
  const tiersWithTerritory = tiers.filter(t => t.territory).length;
  const territoryPenetration = tiers.length > 0 ? (tiersWithTerritory / tiers.length) * 100 : 0;
  
  // Compliance and business rules analytics
  const complianceStats = {
    vatApplicable: tiers.filter(t => t.vatApplicable).length,
    withholdingTax: tiers.filter(t => t.withholdingTaxApplicable).length,
    businessRegRequired: tiers.filter(t => t.businessRegistrationRequired).length,
    stackableTiers: tiers.filter(t => t.stackable).length
  };
  
  // Quantity and pricing insights
  const quantityAnalytics = {
    averageMinQuantity: tiers.length > 0 
      ? tiers.reduce((sum, tier) => sum + tier.minQuantity, 0) / tiers.length 
      : 0,
    highVolumeThreshold: 1000, // Define high-volume threshold
    highVolumeTiers: tiers.filter(t => t.minQuantity >= 1000).length,
    lowVolumeTiers: tiers.filter(t => t.minQuantity < 100).length
  };
  
  // Mock data for demonstration
  const mockAnalytics = {
    totalSavings: 125000,
    ordersWithTiers: 1250,
    topPerformingTier: activeTiers.length > 0 ? activeTiers[0].tierName : 'N/A',
    revenueImpact: 8.5
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Pricing Analytics Dashboard</h3>
        <p className="text-sm text-gray-500 mb-4">
          Analyze the performance and impact of your wholesale pricing tiers
        </p>
        <div className="text-xs text-orange-600 bg-orange-50 p-3 rounded-lg border border-orange-200">
          🚧 Full analytics functionality under development - Showing basic metrics and previews
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pricing Tiers</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{activeTiers.length}</div>
            <p className="text-xs text-gray-600">
              {tiers.length - activeTiers.length} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discount Distribution</CardTitle>
            <Percent className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {discountStats.percentage.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg % Discount:</span>
                  <span className="font-medium text-green-600">{averagePercentageDiscount.toFixed(1)}%</span>
                </div>
              )}
              {discountStats.fixed_amount.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Fixed Off:</span>
                  <span className="font-medium text-purple-600">₦{averageFixedAmount.toLocaleString()}</span>
                </div>
              )}
              {discountStats.fixed_price.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Fixed Price:</span>
                  <span className="font-medium text-orange-600">₦{averageFixedPrice.toLocaleString()}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {discountStats.percentage.length} percentage / {discountStats.fixed_amount.length} fixed-off / {discountStats.fixed_price.length} fixed-price
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Territory Coverage</CardTitle>
            <Globe className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {territoryPenetration.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-600">
              {uniqueTerritories} territories covered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {tiers.length > 0 ? Math.round((complianceStats.businessRegRequired / tiers.length) * 100) : 0}%
            </div>
            <p className="text-xs text-gray-600">
              Business registration required
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Business Intelligence Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
              Volume & Quantity Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium text-blue-700">Avg Min Quantity</div>
                <div className="text-lg font-bold text-blue-600">
                  {quantityAnalytics.averageMinQuantity.toFixed(0)} units
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-sm font-medium text-green-700">High Volume Tiers</div>
                <div className="text-lg font-bold text-green-600">
                  {quantityAnalytics.highVolumeTiers}
                </div>
                <div className="text-xs text-green-600">1000+ unit threshold</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Low Volume (&lt;100 units):</span>
                <span className="font-medium">{quantityAnalytics.lowVolumeTiers} tiers</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Mid Volume (100-999 units):</span>
                <span className="font-medium">
                  {tiers.length - quantityAnalytics.highVolumeTiers - quantityAnalytics.lowVolumeTiers} tiers
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">High Volume (1000+ units):</span>
                <span className="font-medium">{quantityAnalytics.highVolumeTiers} tiers</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center">
              <PieChart className="h-5 w-5 mr-2 text-purple-600" />
              Compliance & Business Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-sm font-medium text-green-700">VAT Applicable</div>
                <div className="text-lg font-bold text-green-600">
                  {complianceStats.vatApplicable}
                </div>
                <div className="text-xs text-green-600">
                  {tiers.length > 0 ? Math.round((complianceStats.vatApplicable / tiers.length) * 100) : 0}% of tiers
                </div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <div className="text-sm font-medium text-orange-700">Bus. Reg. Required</div>
                <div className="text-lg font-bold text-orange-600">
                  {complianceStats.businessRegRequired}
                </div>
                <div className="text-xs text-orange-600">
                  {tiers.length > 0 ? Math.round((complianceStats.businessRegRequired / tiers.length) * 100) : 0}% of tiers
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Withholding Tax:</span>
                <span className="font-medium">{complianceStats.withholdingTax} tiers</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Stackable Discounts:</span>
                <span className="font-medium">{complianceStats.stackableTiers} tiers</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Territory-Specific:</span>
                <span className="font-medium">{tiersWithTerritory} tiers</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Impact Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-green-600" />
            Revenue Impact Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600 mb-1">+{mockAnalytics.revenueImpact}%</div>
              <div className="text-sm text-green-700">Revenue Growth</div>
              <div className="text-xs text-green-600 mt-1">vs previous period</div>
            </div>
            
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600 mb-1">₦{mockAnalytics.totalSavings.toLocaleString()}</div>
              <div className="text-sm text-blue-700">Customer Savings</div>
              <div className="text-xs text-blue-600 mt-1">total this month</div>
            </div>
            
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600 mb-1">{mockAnalytics.ordersWithTiers}</div>
              <div className="text-sm text-purple-700">Tier Usage</div>
              <div className="text-xs text-purple-600 mt-1">orders with discounts</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}