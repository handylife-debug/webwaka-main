'use client';

import { useState } from 'react';
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
import { Plus, X, Trash2, Edit, Package } from 'lucide-react';
import { PlanInterval, CreatePlanData, SubscriptionPlan, PlanFeature } from '@/lib/plans-management';

interface PlanFormProps {
  onSubmit: (data: CreatePlanData) => Promise<{ success: boolean; error?: string }>;
  editingPlan?: SubscriptionPlan | null;
  onEdit?: (planId: string, data: Partial<CreatePlanData>) => Promise<{ success: boolean; error?: string }>;
}

interface FeatureFormData {
  name: string;
  description: string;
  limit: string;
  included: boolean;
}

interface LimitFormData {
  key: string;
  value: string;
}

export function PlanForm({ onSubmit, editingPlan, onEdit }: PlanFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: editingPlan?.name || '',
    description: editingPlan?.description || '',
    price: editingPlan?.price?.toString() || '',
    interval: editingPlan?.interval || 'monthly' as PlanInterval,
    isPopular: editingPlan?.isPopular || false,
    trialDays: editingPlan?.trialDays?.toString() || '0',
  });
  
  const [features, setFeatures] = useState<FeatureFormData[]>(
    editingPlan?.features?.map(f => ({
      name: f.name,
      description: f.description || '',
      limit: f.limit?.toString() || '',
      included: f.included
    })) || [{ name: '', description: '', limit: '', included: true }]
  );
  
  const [limits, setLimits] = useState<LimitFormData[]>(
    editingPlan?.limits ? Object.entries(editingPlan.limits).map(([key, value]) => ({
      key,
      value: value.toString()
    })) : [{ key: 'users', value: '1' }]
  );
  
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.price) {
      setError('Please fill in all required fields');
      return;
    }

    if (isNaN(Number(formData.price)) || Number(formData.price) < 0) {
      setError('Please enter a valid price');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const planFeatures: Omit<PlanFeature, 'id'>[] = features
        .filter(f => f.name.trim())
        .map(f => ({
          name: f.name.trim(),
          description: f.description.trim() || undefined,
          limit: f.limit ? Number(f.limit) : undefined,
          included: f.included
        }));

      const planLimits: Record<string, number> = {};
      limits.forEach(limit => {
        if (limit.key.trim() && limit.value) {
          planLimits[limit.key.trim()] = Number(limit.value);
        }
      });

      const planData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price: Number(formData.price),
        interval: formData.interval,
        features: planFeatures,
        limits: planLimits,
        isPopular: formData.isPopular,
        trialDays: formData.trialDays ? Number(formData.trialDays) : 0,
        createdBy: 'current-user' // Will be replaced with actual user in server action
      };

      let result;
      if (editingPlan && onEdit) {
        result = await onEdit(editingPlan.id, planData);
      } else {
        result = await onSubmit(planData);
      }
      
      if (result.success) {
        setIsOpen(false);
        // Reset form
        setFormData({
          name: '',
          description: '',
          price: '',
          interval: 'monthly' as PlanInterval,
          isPopular: false,
          trialDays: '0',
        });
        setFeatures([{ name: '', description: '', limit: '', included: true }]);
        setLimits([{ key: 'users', value: '1' }]);
      } else {
        setError(result.error || 'Failed to save plan');
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const addFeature = () => {
    setFeatures([...features, { name: '', description: '', limit: '', included: true }]);
  };

  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const addLimit = () => {
    setLimits([...limits, { key: '', value: '' }]);
  };

  const removeLimit = (index: number) => {
    setLimits(limits.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          {editingPlan ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingPlan ? 'Edit Plan' : 'Create New Plan'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {editingPlan ? 'Edit Subscription Plan' : 'Create New Subscription Plan'}
          </DialogTitle>
          <DialogDescription>
            {editingPlan 
              ? 'Update the subscription plan details, pricing, and features.'
              : 'Define a new subscription plan with pricing in NGN and feature limits.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Plan Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plan Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Plan Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Free, Basic, Premium"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price (NGN) *</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="0"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of this plan..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="interval">Billing Interval</Label>
                  <Select
                    value={formData.interval}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, interval: value as PlanInterval }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="trialDays">Trial Days</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    placeholder="0"
                    min="0"
                    value={formData.trialDays}
                    onChange={(e) => setFormData(prev => ({ ...prev, trialDays: e.target.value }))}
                  />
                </div>
                
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="isPopular"
                    checked={formData.isPopular}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPopular: checked }))}
                  />
                  <Label htmlFor="isPopular">Popular Plan</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Features
                <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Feature
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {features.map((feature, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Feature {index + 1}</span>
                    {features.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFeature(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Feature Name</Label>
                      <Input
                        placeholder="e.g., API Access"
                        value={feature.name}
                        onChange={(e) => {
                          const newFeatures = [...features];
                          newFeatures[index].name = e.target.value;
                          setFeatures(newFeatures);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Limit (optional)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 1000"
                        value={feature.limit}
                        onChange={(e) => {
                          const newFeatures = [...features];
                          newFeatures[index].limit = e.target.value;
                          setFeatures(newFeatures);
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      placeholder="Brief description of this feature..."
                      value={feature.description}
                      onChange={(e) => {
                        const newFeatures = [...features];
                        newFeatures[index].description = e.target.value;
                        setFeatures(newFeatures);
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={feature.included}
                      onCheckedChange={(checked) => {
                        const newFeatures = [...features];
                        newFeatures[index].included = checked;
                        setFeatures(newFeatures);
                      }}
                    />
                    <Label>Included in plan</Label>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Usage Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Usage Limits
                <Button type="button" variant="outline" size="sm" onClick={addLimit}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Limit
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {limits.map((limit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="e.g., users, products, storage"
                      value={limit.key}
                      onChange={(e) => {
                        const newLimits = [...limits];
                        newLimits[index].key = e.target.value;
                        setLimits(newLimits);
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder="Limit value"
                      min="0"
                      value={limit.value}
                      onChange={(e) => {
                        const newLimits = [...limits];
                        newLimits[index].value = e.target.value;
                        setLimits(newLimits);
                      }}
                    />
                  </div>
                  {limits.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLimit(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}