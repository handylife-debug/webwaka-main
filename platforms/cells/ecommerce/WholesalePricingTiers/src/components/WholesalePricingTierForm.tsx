'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Package, Globe, Calendar, DollarSign, Users, Settings, AlertCircle, Edit, Save, Loader2 } from 'lucide-react';

interface Territory {
  id: string;
  territory: string;
  territoryDisplayName: string;
  priceMultiplier: number;
  shippingMultiplier: number;
  taxMultiplier: number;
  isActive: boolean;
}

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
  groupId?: string;
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

interface WholesalePricingTierFormProps {
  onSubmit: (tierData: WholesalePricingTierData) => Promise<{ success: boolean; error?: string }>;
  onUpdate?: (tierId: string, tierData: Partial<WholesalePricingTierData>) => Promise<{ success: boolean; error?: string }>;
  territories: Territory[];
  b2bGroups: { id: string; name: string; tier: string }[];
  tenantId: string;
  editingTier?: WholesalePricingTier | null;
  onEditingChange?: (tier: WholesalePricingTier | null) => void;
  children?: React.ReactNode;
}

// Nigerian territories with common states and cities
const NIGERIAN_TERRITORIES = [
  { value: 'Lagos', label: 'Lagos State' },
  { value: 'Abuja', label: 'Federal Capital Territory (Abuja)' },
  { value: 'Kano', label: 'Kano State' },
  { value: 'Rivers', label: 'Rivers State (Port Harcourt)' },
  { value: 'Oyo', label: 'Oyo State (Ibadan)' },
  { value: 'Kaduna', label: 'Kaduna State' },
  { value: 'Ogun', label: 'Ogun State' },
  { value: 'Plateau', label: 'Plateau State (Jos)' },
  { value: 'Delta', label: 'Delta State' },
  { value: 'Edo', label: 'Edo State (Benin City)' },
  { value: 'Anambra', label: 'Anambra State' },
  { value: 'Enugu', label: 'Enugu State' },
  { value: 'Abia', label: 'Abia State' },
  { value: 'Imo', label: 'Imo State' },
  { value: 'Cross_River', label: 'Cross River State' },
  { value: 'Akwa_Ibom', label: 'Akwa Ibom State' },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: 'immediate', label: 'Immediate Payment', description: 'Full payment required before delivery' },
  { value: 'net_7', label: 'Net 7 Days', description: '7 days payment terms' },
  { value: 'net_15', label: 'Net 15 Days', description: '15 days payment terms' },
  { value: 'net_30', label: 'Net 30 Days', description: '30 days payment terms (Standard)' },
  { value: 'net_45', label: 'Net 45 Days', description: '45 days payment terms' },
  { value: 'net_60', label: 'Net 60 Days', description: '60 days payment terms' },
];

const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage Discount', description: '% off the base price' },
  { value: 'fixed_amount', label: 'Fixed Amount Off', description: 'NGN amount off the base price' },
  { value: 'fixed_price', label: 'Fixed Price', description: 'Set a fixed price regardless of base price' },
];

export function WholesalePricingTierForm({ 
  onSubmit, 
  onUpdate, 
  territories, 
  b2bGroups, 
  tenantId,
  editingTier,
  onEditingChange,
  children
}: WholesalePricingTierFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    tierName: '',
    tierDescription: '',
    minQuantity: '1',
    maxQuantity: '',
    discountType: 'percentage' as 'percentage' | 'fixed_amount' | 'fixed_price',
    discountValue: '0',
    currency: 'NGN',
    territory: '',
    groupId: '',
    productId: '',
    categoryId: '',
    paymentTerms: 'net_30' as 'immediate' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60',
    paymentTermsDiscount: '0',
    effectiveDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
    isActive: true,
    minimumOrderValue: '',
    maximumOrderValue: '',
    stackable: false,
    priority: '100',
    vatApplicable: true,
    withholdingTaxApplicable: false,
    businessRegistrationRequired: true,
  });

  // Pre-populate form when editing
  useEffect(() => {
    if (editingTier) {
      setFormData({
        tierName: editingTier.tierName,
        tierDescription: editingTier.tierDescription || '',
        minQuantity: editingTier.minQuantity.toString(),
        maxQuantity: editingTier.maxQuantity?.toString() || '',
        discountType: editingTier.discountType,
        discountValue: editingTier.discountValue.toString(),
        currency: editingTier.currency,
        territory: editingTier.territory || '',
        groupId: editingTier.groupId || '',
        productId: editingTier.productId || '',
        categoryId: editingTier.categoryId || '',
        paymentTerms: editingTier.paymentTerms,
        paymentTermsDiscount: (editingTier.paymentTermsDiscount * 100).toString(), // Convert 0-0.5 to 0-50% for display
        effectiveDate: editingTier.effectiveDate.split('T')[0],
        expiryDate: editingTier.expiryDate?.split('T')[0] || '',
        isActive: editingTier.isActive,
        minimumOrderValue: editingTier.minimumOrderValue?.toString() || '',
        maximumOrderValue: editingTier.maximumOrderValue?.toString() || '',
        stackable: editingTier.stackable,
        priority: editingTier.priority.toString(),
        vatApplicable: editingTier.vatApplicable,
        withholdingTaxApplicable: editingTier.withholdingTaxApplicable,
        businessRegistrationRequired: editingTier.businessRegistrationRequired,
      });
      setIsOpen(true);
    }
  }, [editingTier]);

  const validateForm = (): string | null => {
    if (!formData.tierName.trim()) {
      return 'Tier name is required';
    }
    if (parseInt(formData.minQuantity) < 1) {
      return 'Minimum quantity must be at least 1';
    }
    if (formData.maxQuantity && parseInt(formData.maxQuantity) < parseInt(formData.minQuantity)) {
      return 'Maximum quantity must be greater than minimum quantity';
    }
    if (parseFloat(formData.discountValue) < 0) {
      return 'Discount value cannot be negative';
    }
    if (formData.discountType === 'percentage' && parseFloat(formData.discountValue) > 100) {
      return 'Percentage discount cannot exceed 100%';
    }
    const paymentTermsPercent = parseFloat(formData.paymentTermsDiscount);
    if (paymentTermsPercent < 0 || paymentTermsPercent > 50) {
      return 'Payment terms discount must be between 0% and 50%';
    }
    if (parseInt(formData.priority) < 1 || parseInt(formData.priority) > 1000) {
      return 'Priority must be between 1 and 1000';
    }
    if (formData.minimumOrderValue && formData.maximumOrderValue) {
      const minOrder = parseFloat(formData.minimumOrderValue);
      const maxOrder = parseFloat(formData.maximumOrderValue);
      if (maxOrder < minOrder) {
        return 'Maximum order value must be greater than minimum order value';
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tierData: WholesalePricingTierData = {
        tierName: formData.tierName.trim(),
        tierDescription: formData.tierDescription.trim() || undefined,
        minQuantity: parseInt(formData.minQuantity),
        maxQuantity: formData.maxQuantity ? parseInt(formData.maxQuantity) : undefined,
        discountType: formData.discountType,
        discountValue: parseFloat(formData.discountValue),
        currency: formData.currency,
        territory: formData.territory || undefined,
        groupId: formData.groupId || undefined,
        productId: formData.productId || undefined,
        categoryId: formData.categoryId || undefined,
        paymentTerms: formData.paymentTerms,
        paymentTermsDiscount: parseFloat(formData.paymentTermsDiscount) / 100, // Convert 0-50% to 0-0.5 decimal for server
        effectiveDate: formData.effectiveDate,
        expiryDate: formData.expiryDate || undefined,
        isActive: formData.isActive,
        minimumOrderValue: formData.minimumOrderValue ? parseFloat(formData.minimumOrderValue) : undefined,
        maximumOrderValue: formData.maximumOrderValue ? parseFloat(formData.maximumOrderValue) : undefined,
        stackable: formData.stackable,
        priority: parseInt(formData.priority),
        vatApplicable: formData.vatApplicable,
        withholdingTaxApplicable: formData.withholdingTaxApplicable,
        businessRegistrationRequired: formData.businessRegistrationRequired,
      };

      let result;
      if (editingTier && onUpdate) {
        result = await onUpdate(editingTier.id, tierData);
      } else {
        result = await onSubmit(tierData);
      }
      
      if (result.success) {
        setIsOpen(false);
        setError(null);
        if (onEditingChange) {
          onEditingChange(null);
        }
        // Reset form for create mode
        if (!editingTier) {
          setFormData({
            tierName: '',
            tierDescription: '',
            minQuantity: '1',
            maxQuantity: '',
            discountType: 'percentage',
            discountValue: '0',
            currency: 'NGN',
            territory: '',
            groupId: '',
            productId: '',
            categoryId: '',
            paymentTerms: 'net_30',
            paymentTermsDiscount: '0',
            effectiveDate: new Date().toISOString().split('T')[0],
            expiryDate: '',
            isActive: true,
            minimumOrderValue: '',
            maximumOrderValue: '',
            stackable: false,
            priority: '100',
            vatApplicable: true,
            withholdingTaxApplicable: false,
            businessRegistrationRequired: true,
          });
        }
      } else {
        setError(result.error || 'Failed to save pricing tier');
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null); // Clear error when user makes changes
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onEditingChange) {
      onEditingChange(null);
    }
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {children || (
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Pricing Tier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[900px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {editingTier ? 'Edit Wholesale Pricing Tier' : 'Create New Wholesale Pricing Tier'}
          </DialogTitle>
          <DialogDescription>
            {editingTier 
              ? 'Update the wholesale pricing tier configuration for B2B customers.'
              : 'Configure quantity-based pricing rules for wholesale and B2B customers with Nigerian market features.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tierName">Tier Name *</Label>
                  <Input
                    id="tierName"
                    placeholder="e.g., Volume Discount Tier 1, Bulk Purchase Tier"
                    value={formData.tierName}
                    onChange={(e) => updateFormData('tierName', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority *</Label>
                  <Input
                    id="priority"
                    type="number"
                    placeholder="100"
                    min="1"
                    max="1000"
                    value={formData.priority}
                    onChange={(e) => updateFormData('priority', e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-500">Lower number = higher priority (1-1000)</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tierDescription">Description</Label>
                <Textarea
                  id="tierDescription"
                  placeholder="Detailed description of this pricing tier and its benefits..."
                  value={formData.tierDescription}
                  onChange={(e) => updateFormData('tierDescription', e.target.value)}
                  rows={2}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => updateFormData('isActive', checked)}
                />
                <Label htmlFor="isActive">Active (tier can be applied to orders)</Label>
              </div>
            </CardContent>
          </Card>

          {/* Quantity Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Quantity & Order Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minQuantity">Minimum Quantity *</Label>
                  <Input
                    id="minQuantity"
                    type="number"
                    placeholder="1"
                    min="1"
                    value={formData.minQuantity}
                    onChange={(e) => updateFormData('minQuantity', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxQuantity">Maximum Quantity</Label>
                  <Input
                    id="maxQuantity"
                    type="number"
                    placeholder="Leave empty for unlimited"
                    min="1"
                    value={formData.maxQuantity}
                    onChange={(e) => updateFormData('maxQuantity', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minimumOrderValue">Minimum Order Value (NGN)</Label>
                  <Input
                    id="minimumOrderValue"
                    type="number"
                    placeholder="0"
                    min="0"
                    step="0.01"
                    value={formData.minimumOrderValue}
                    onChange={(e) => updateFormData('minimumOrderValue', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maximumOrderValue">Maximum Order Value (NGN)</Label>
                  <Input
                    id="maximumOrderValue"
                    type="number"
                    placeholder="Leave empty for unlimited"
                    min="0"
                    step="0.01"
                    value={formData.maximumOrderValue}
                    onChange={(e) => updateFormData('maximumOrderValue', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Discount Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Discount Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discountType">Discount Type *</Label>
                  <Select
                    value={formData.discountType}
                    onValueChange={(value) => updateFormData('discountType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCOUNT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex flex-col">
                            <span>{type.label}</span>
                            <span className="text-xs text-gray-500">{type.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    Discount Value * 
                    {formData.discountType === 'percentage' && ' (%)'}
                    {formData.discountType !== 'percentage' && ' (NGN)'}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    placeholder="0"
                    min="0"
                    step="0.01"
                    max={formData.discountType === 'percentage' ? '100' : undefined}
                    value={formData.discountValue}
                    onChange={(e) => updateFormData('discountValue', e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="stackable"
                  checked={formData.stackable}
                  onCheckedChange={(checked) => updateFormData('stackable', checked)}
                />
                <Label htmlFor="stackable">Stackable with other discounts</Label>
              </div>
            </CardContent>
          </Card>

          {/* Payment Terms & Territory */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Payment Terms & Territory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Payment Terms *</Label>
                  <Select
                    value={formData.paymentTerms}
                    onValueChange={(value) => updateFormData('paymentTerms', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS_OPTIONS.map((term) => (
                        <SelectItem key={term.value} value={term.value}>
                          <div className="flex flex-col">
                            <span>{term.label}</span>
                            <span className="text-xs text-gray-500">{term.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentTermsDiscount">Payment Terms Discount (%)</Label>
                  <Input
                    id="paymentTermsDiscount"
                    type="number"
                    placeholder="0"
                    min="0"
                    max="50"
                    step="0.01"
                    value={formData.paymentTermsDiscount}
                    onChange={(e) => updateFormData('paymentTermsDiscount', e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Additional discount for early payment (0-50%)</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="territory">Territory</Label>
                  <Select
                    value={formData.territory}
                    onValueChange={(value) => updateFormData('territory', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All territories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Territories</SelectItem>
                      {NIGERIAN_TERRITORIES.map((territory) => (
                        <SelectItem key={territory.value} value={territory.value}>
                          {territory.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="groupId">B2B Group</Label>
                  <Select
                    value={formData.groupId}
                    onValueChange={(value) => updateFormData('groupId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All B2B groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All B2B Groups</SelectItem>
                      {b2bGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name} ({group.tier})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Nigerian Business Compliance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Nigerian Business Compliance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="vatApplicable"
                    checked={formData.vatApplicable}
                    onCheckedChange={(checked) => updateFormData('vatApplicable', checked)}
                  />
                  <Label htmlFor="vatApplicable">VAT Applicable (7.5%)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="withholdingTaxApplicable"
                    checked={formData.withholdingTaxApplicable}
                    onCheckedChange={(checked) => updateFormData('withholdingTaxApplicable', checked)}
                  />
                  <Label htmlFor="withholdingTaxApplicable">Withholding Tax</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="businessRegistrationRequired"
                    checked={formData.businessRegistrationRequired}
                    onCheckedChange={(checked) => updateFormData('businessRegistrationRequired', checked)}
                  />
                  <Label htmlFor="businessRegistrationRequired">Business Registration Required</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Validity Period */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Validity Period
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="effectiveDate">Effective Date *</Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) => updateFormData('effectiveDate', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => updateFormData('expiryDate', e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Leave empty for no expiration</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {editingTier ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  {editingTier ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingTier ? 'Update Tier' : 'Create Tier'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}