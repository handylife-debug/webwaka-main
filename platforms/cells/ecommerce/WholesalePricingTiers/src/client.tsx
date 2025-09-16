'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Settings, TrendingUp, Package, Globe } from 'lucide-react';
import { 
  WholesalePricingTiersTable,
  WholesalePricingTierForm,
  TerritoryPricingManager,
  SeasonalPricingCalendar,
  PricingAnalyticsDashboard
} from './components';

// Types for wholesale pricing tiers (100% CELLULAR REUSABILITY)
interface WholesalePricingTierData {
  tierName: string;
  tierDescription?: string;
  minQuantity: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: number;
  currency: string;
  territory?: string;
  groupId?: string;
  productId?: string;
  categoryId?: string;
  paymentTerms: 'immediate' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
  paymentTermsDiscount: number;
  effectiveDate: string;
  expiryDate?: string;
  isActive: boolean;
  minimumOrderValue?: number;
  maximumOrderValue?: number;
  stackable: boolean;
  priority: number;
  vatApplicable: boolean;
  withholdingTaxApplicable: boolean;
  businessRegistrationRequired: boolean;
}

interface WholesalePricingTier {
  id: string;
  tenantId: string;
  productId?: string;
  categoryId?: string;
  groupId?: string; // B2B group from B2BAccessControl Cell
  tierName: string;
  tierDescription?: string;
  minQuantity: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: number;
  currency: string;
  territory?: string;
  paymentTerms: 'immediate' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
  paymentTermsDiscount: number;
  effectiveDate: string;
  expiryDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  minimumOrderValue?: number;
  maximumOrderValue?: number;
  stackable: boolean;
  priority: number;
  vatApplicable: boolean;
  withholdingTaxApplicable: boolean;
  businessRegistrationRequired: boolean;
}

interface Territory {
  id: string;
  territory: string;
  territoryDisplayName: string;
  priceMultiplier: number;
  shippingMultiplier: number;
  taxMultiplier: number;
  isActive: boolean;
}

interface WholesalePricingTiersClientProps {
  tenantId: string;
  currentUser: {
    id: string;
    email: string;
    role: string;
  };
  initialTiers: WholesalePricingTier[];
  territories: Territory[];
  b2bGroups: { id: string; name: string; tier: string }[];
}

export function WholesalePricingTiersClient({
  tenantId,
  currentUser,
  initialTiers,
  territories,
  b2bGroups
}: WholesalePricingTiersClientProps) {
  const [tiers, setTiers] = useState<WholesalePricingTier[]>(initialTiers);
  const [editingTier, setEditingTier] = useState<WholesalePricingTier | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Handle creating new pricing tier
  const handleCreateTier = async (tierData: WholesalePricingTierData) => {
    try {
      const formData = new FormData();
      Object.entries(tierData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      formData.append('tenantId', tenantId);

      // Call the createPricingTier server action (REUSES WholesalePricingTiers Cell)
      const { createPricingTier } = await import('./actions');
      const result = await createPricingTier(formData);

      if (result.success) {
        // Create a new tier object with generated ID for local state
        const newTier: WholesalePricingTier = {
          id: ('id' in result && result.id) ? result.id : Date.now().toString(),
          tenantId,
          ...tierData,
          currency: tierData.currency || 'NGN',
          paymentTerms: tierData.paymentTerms || 'net_30',
          paymentTermsDiscount: tierData.paymentTermsDiscount || 0,
          effectiveDate: tierData.effectiveDate || new Date().toISOString().split('T')[0],
          isActive: tierData.isActive ?? true,
          stackable: tierData.stackable ?? false,
          priority: tierData.priority || 1,
          vatApplicable: tierData.vatApplicable ?? false,
          withholdingTaxApplicable: tierData.withholdingTaxApplicable ?? false,
          businessRegistrationRequired: tierData.businessRegistrationRequired ?? false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setTiers(prev => [...prev, newTier]);
        showNotification('success', `Pricing tier "${tierData.tierName}" created successfully`);
        return { success: true };
      } else {
        showNotification('error', result.message || 'Failed to create pricing tier');
        return { success: false, error: result.message };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create pricing tier';
      showNotification('error', errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Handle updating pricing tier
  const handleUpdateTier = async (tierId: string, tierData: Partial<WholesalePricingTierData>) => {
    try {
      const formData = new FormData();
      Object.entries(tierData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      formData.append('tenantId', tenantId);
      formData.append('tierId', tierId);

      // Call the updatePricingTier server action (REUSES WholesalePricingTiers Cell)  
      const { updatePricingTier } = await import('./actions');
      const result = await updatePricingTier(formData);

      if (result.success) {
        // Update tier in local state with provided data
        setTiers(prev => prev.map(tier => 
          tier.id === tierId ? { ...tier, ...tierData, updatedAt: new Date().toISOString() } : tier
        ));
        setEditingTier(null);
        showNotification('success', `Pricing tier updated successfully`);
        return { success: true };
      } else {
        showNotification('error', result.message || 'Failed to update pricing tier');
        return { success: false, error: result.message };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update pricing tier';
      showNotification('error', errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Handle deleting pricing tier
  const handleDeleteTier = async (tierId: string) => {
    try {
      const formData = new FormData();
      formData.append('tenantId', tenantId);
      formData.append('tierId', tierId);

      // Call the deletePricingTier server action (REUSES WholesalePricingTiers Cell)
      const { deletePricingTier } = await import('./actions');
      const result = await deletePricingTier(formData);

      if (result.success) {
        // Remove tier from local state
        setTiers(prev => prev.filter(tier => tier.id !== tierId));
        showNotification('success', 'Pricing tier deleted successfully');
      } else {
        showNotification('error', result.message || 'Failed to delete pricing tier');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete pricing tier';
      showNotification('error', errorMessage);
    }
  };

  // Handle tier status change (active/inactive)
  const handleStatusChange = async (tierId: string, isActive: boolean) => {
    try {
      const formData = new FormData();
      formData.append('tenantId', tenantId);
      formData.append('tierId', tierId);
      formData.append('isActive', String(isActive));

      // Call the updatePricingTier server action (REUSES WholesalePricingTiers Cell)
      const { updatePricingTier } = await import('./actions');
      const result = await updatePricingTier(formData);

      if (result.success) {
        // Update tier status in local state
        setTiers(prev => prev.map(tier => 
          tier.id === tierId ? { ...tier, isActive } : tier
        ));
        showNotification('success', `Pricing tier ${isActive ? 'activated' : 'deactivated'} successfully`);
      } else {
        showNotification('error', result.message || 'Failed to update tier status');
      }
    } catch (error) {
      showNotification('error', 'Failed to update tier status');
    }
  };

  // Calculate dashboard stats
  const activeTiers = tiers.filter(tier => tier.isActive);
  const inactiveTiers = tiers.filter(tier => !tier.isActive);
  const uniqueTerritories = new Set(tiers.map(tier => tier.territory).filter(Boolean)).size;
  const averageDiscount = tiers.length > 0 
    ? tiers.reduce((sum, tier) => sum + tier.discountValue, 0) / tiers.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Wholesale Pricing Tiers</h1>
          <p className="text-gray-600 mt-2">
            Manage quantity-based pricing rules for B2B customers across Nigerian territories
          </p>
        </div>
        <WholesalePricingTierForm
          onSubmit={handleCreateTier}
          territories={territories}
          b2bGroups={b2bGroups}
          tenantId={tenantId}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tiers</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeTiers.length}</div>
            <p className="text-xs text-gray-600">
              {inactiveTiers.length} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Territories</CardTitle>
            <Globe className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{uniqueTerritories}</div>
            <p className="text-xs text-gray-600">
              {territories.length} configured
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Discount</CardTitle>
            <Package className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {averageDiscount.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-600">
              Across all tiers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">B2B Groups</CardTitle>
            <Settings className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{b2bGroups.length}</div>
            <p className="text-xs text-gray-600">
              Configured groups
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tiers">Pricing Tiers</TabsTrigger>
          <TabsTrigger value="territories">Territories</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal Pricing</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="tiers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wholesale Pricing Tiers</CardTitle>
              <CardDescription>
                Configure quantity-based pricing rules with Nigerian market features including payment terms, territories, and VAT compliance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WholesalePricingTiersTable
                tiers={tiers}
                territories={territories}
                b2bGroups={b2bGroups}
                onEdit={setEditingTier}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTier}
                tenantId={tenantId}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="territories" className="space-y-4">
          <TerritoryPricingManager
            territories={territories}
            tenantId={tenantId}
          />
        </TabsContent>

        <TabsContent value="seasonal" className="space-y-4">
          <SeasonalPricingCalendar
            tenantId={tenantId}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <PricingAnalyticsDashboard
            tiers={tiers}
            territories={territories}
            tenantId={tenantId}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Tier Dialog */}
      {editingTier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Edit Pricing Tier</h3>
            <p className="text-sm text-gray-600 mb-4">
              Editing: {editingTier.tierName}
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setEditingTier(null)}
                className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // For now, just close the dialog
                  setEditingTier(null);
                  showNotification('success', 'Edit functionality coming soon');
                }}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
          notification.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">
                {notification.type === 'success' ? 'Success' : 'Error'}
              </h3>
              <div className="text-sm mt-1">{notification.message}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export types for reuse in other components
export type { 
  WholesalePricingTier, 
  Territory, 
  WholesalePricingTiersClientProps 
};