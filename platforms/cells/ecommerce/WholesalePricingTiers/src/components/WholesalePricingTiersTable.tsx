'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Play,
  Pause,
  Trash2,
  Loader2,
  TrendingUp,
  Package,
  Globe,
  Calendar,
  Percent
} from 'lucide-react';
import type { WholesalePricingTier, Territory } from '../types';

interface WholesalePricingTiersTableProps {
  tiers: WholesalePricingTier[];
  territories: Territory[];
  b2bGroups: { id: string; name: string; tier: string }[];
  onEdit: (tier: WholesalePricingTier) => void;
  onStatusChange: (tierId: string, isActive: boolean) => Promise<void>;
  onDelete: (tierId: string) => Promise<void>;
  tenantId: string;
}

// Helper functions for formatting data
function getStatusColor(isActive: boolean): string {
  return isActive 
    ? 'bg-green-100 text-green-800 border-green-200'
    : 'bg-gray-100 text-gray-800 border-gray-200';
}

function getDiscountTypeColor(discountType: string): string {
  switch (discountType) {
    case 'percentage':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'fixed_amount':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'fixed_price':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getPaymentTermsColor(paymentTerms: string): string {
  switch (paymentTerms) {
    case 'immediate':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'net_7':
    case 'net_15':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'net_30':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'net_45':
    case 'net_60':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function formatDiscount(discountType: string, discountValue: number, currency: string): string {
  switch (discountType) {
    case 'percentage':
      return `${discountValue}%`;
    case 'fixed_amount':
      return `${currency} ${discountValue.toLocaleString()}`;
    case 'fixed_price':
      return `${currency} ${discountValue.toLocaleString()} (Fixed)`;
    default:
      return `${discountValue}`;
  }
}

function formatQuantityRange(minQuantity: number, maxQuantity?: number): string {
  if (!maxQuantity) {
    return `${minQuantity}+ units`;
  }
  return `${minQuantity}-${maxQuantity} units`;
}

function formatPaymentTerms(paymentTerms: string): string {
  switch (paymentTerms) {
    case 'immediate':
      return 'Immediate';
    case 'net_7':
      return 'Net 7 Days';
    case 'net_15':
      return 'Net 15 Days';
    case 'net_30':
      return 'Net 30 Days';
    case 'net_45':
      return 'Net 45 Days';
    case 'net_60':
      return 'Net 60 Days';
    default:
      return paymentTerms.replace('_', ' ').toUpperCase();
  }
}

function getTerritoryDisplayName(territories: Territory[], territory?: string): string {
  if (!territory) return 'All Territories';
  const territoryData = territories.find(t => t.territory === territory);
  return territoryData?.territoryDisplayName || territory;
}

function getB2BGroupName(b2bGroups: { id: string; name: string; tier: string }[], groupId?: string): string {
  if (!groupId) return 'All Groups';
  const group = b2bGroups.find(g => g.id === groupId);
  return group?.name || groupId;
}

export function WholesalePricingTiersTable({ 
  tiers, 
  territories, 
  b2bGroups,
  onEdit, 
  onStatusChange, 
  onDelete,
  tenantId 
}: WholesalePricingTiersTableProps) {
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const handleStatusChange = async (tierId: string, isActive: boolean) => {
    setLoadingActions(prev => ({ ...prev, [tierId]: true }));
    try {
      await onStatusChange(tierId, isActive);
    } finally {
      setLoadingActions(prev => ({ ...prev, [tierId]: false }));
    }
  };

  const handleDelete = async (tierId: string, tierName: string) => {
    if (!confirm(`Are you sure you want to delete the pricing tier "${tierName}"? This action cannot be undone.`)) {
      return;
    }
    
    setLoadingActions(prev => ({ ...prev, [tierId]: true }));
    try {
      await onDelete(tierId);
    } finally {
      setLoadingActions(prev => ({ ...prev, [tierId]: false }));
    }
  };

  const handleEdit = (tier: WholesalePricingTier) => {
    onEdit(tier);
  };

  const handleViewDetails = (tier: WholesalePricingTier) => {
    // Create a detailed view of the tier
    const details = [
      `Tier: ${tier.tierName}`,
      `Description: ${tier.tierDescription || 'N/A'}`,
      `Quantity Range: ${formatQuantityRange(tier.minQuantity, tier.maxQuantity)}`,
      `Discount: ${formatDiscount(tier.discountType, tier.discountValue, tier.currency)}`,
      `Territory: ${getTerritoryDisplayName(territories, tier.territory)}`,
      `B2B Group: ${getB2BGroupName(b2bGroups, tier.groupId)}`,
      `Payment Terms: ${formatPaymentTerms(tier.paymentTerms)}`,
      `Payment Terms Discount: ${(tier.paymentTermsDiscount * 100).toFixed(2)}%`, // Display 0-0.5 as 0-50%
      `VAT Applicable: ${tier.vatApplicable ? 'Yes' : 'No'}`,
      `Withholding Tax: ${tier.withholdingTaxApplicable ? 'Yes' : 'No'}`,
      `Business Registration Required: ${tier.businessRegistrationRequired ? 'Yes' : 'No'}`,
      `Stackable: ${tier.stackable ? 'Yes' : 'No'}`,
      `Priority: ${tier.priority}`,
      tier.minimumOrderValue && `Min Order Value: ${tier.currency} ${tier.minimumOrderValue.toLocaleString()}`,
      tier.maximumOrderValue && `Max Order Value: ${tier.currency} ${tier.maximumOrderValue.toLocaleString()}`,
      `Status: ${tier.isActive ? 'Active' : 'Inactive'}`,
      `Effective Date: ${new Date(tier.effectiveDate).toLocaleDateString()}`,
      tier.expiryDate && `Expiry Date: ${new Date(tier.expiryDate).toLocaleDateString()}`,
      `Created: ${new Date(tier.createdAt).toLocaleDateString()}`,
      `Updated: ${new Date(tier.updatedAt).toLocaleDateString()}`
    ].filter(Boolean).join('\n');

    alert(`Pricing Tier Details:\n\n${details}`);
  };

  if (tiers.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No pricing tiers configured</h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by creating your first wholesale pricing tier for B2B customers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <TrendingUp className="h-5 w-5 text-blue-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-blue-900">Active Tiers</p>
              <p className="text-lg font-bold text-blue-600">
                {tiers.filter(t => t.isActive).length} / {tiers.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center">
            <Percent className="h-5 w-5 text-green-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-green-900">Avg Discount</p>
              <p className="text-lg font-bold text-green-600">
                {(tiers.reduce((sum, t) => sum + t.discountValue, 0) / tiers.length).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center">
            <Globe className="h-5 w-5 text-purple-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-purple-900">Territories</p>
              <p className="text-lg font-bold text-purple-600">
                {new Set(tiers.map(t => t.territory).filter(Boolean)).size}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Tiers Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier Name</TableHead>
              <TableHead>Quantity Range</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Territory</TableHead>
              <TableHead>B2B Group</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((tier) => (
              <TableRow key={tier.id} className="hover:bg-gray-50">
                <TableCell className="font-medium">
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900">{tier.tierName}</div>
                    {tier.tierDescription && (
                      <div className="text-xs text-gray-500 line-clamp-2">{tier.tierDescription}</div>
                    )}
                    <div className="flex space-x-2">
                      {tier.vatApplicable && (
                        <Badge variant="outline" className="text-xs">VAT</Badge>
                      )}
                      {tier.withholdingTaxApplicable && (
                        <Badge variant="outline" className="text-xs">WHT</Badge>
                      )}
                      {tier.stackable && (
                        <Badge variant="outline" className="text-xs">Stackable</Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-gray-900">
                    {formatQuantityRange(tier.minQuantity, tier.maxQuantity)}
                  </div>
                  {(tier.minimumOrderValue || tier.maximumOrderValue) && (
                    <div className="text-xs text-gray-500">
                      Order: {tier.currency} {tier.minimumOrderValue?.toLocaleString() || 0}
                      {tier.maximumOrderValue && ` - ${tier.maximumOrderValue.toLocaleString()}`}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={getDiscountTypeColor(tier.discountType)}>
                    {formatDiscount(tier.discountType, tier.discountValue, tier.currency)}
                  </Badge>
                  {tier.paymentTermsDiscount > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      +{(tier.paymentTermsDiscount * 100).toFixed(1)}% payment terms // Display 0-0.5 as 0-50%
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <Globe className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{getTerritoryDisplayName(territories, tier.territory)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{getB2BGroupName(b2bGroups, tier.groupId)}</div>
                </TableCell>
                <TableCell>
                  <Badge className={getPaymentTermsColor(tier.paymentTerms)}>
                    {formatPaymentTerms(tier.paymentTerms)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(tier.isActive)}>
                    {tier.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {new Date(tier.effectiveDate).toLocaleDateString()}
                  </div>
                  {tier.expiryDate && (
                    <div className="text-xs text-gray-500">
                      Expires: {new Date(tier.expiryDate).toLocaleDateString()}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {loadingActions[tier.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleViewDetails(tier)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(tier)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Tier
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleStatusChange(tier.id, !tier.isActive)}
                        disabled={loadingActions[tier.id]}
                      >
                        {tier.isActive ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(tier.id, tier.tierName)}
                        disabled={loadingActions[tier.id]}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Table Footer with Summary */}
      <div className="flex justify-between items-center text-sm text-gray-500 pt-4 border-t">
        <div>
          Showing {tiers.length} pricing tiers across {new Set(tiers.map(t => t.territory).filter(Boolean)).size} territories
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
            <span>Active ({tiers.filter(t => t.isActive).length})</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div>
            <span>Inactive ({tiers.filter(t => !t.isActive).length})</span>
          </div>
        </div>
      </div>
    </div>
  );
}