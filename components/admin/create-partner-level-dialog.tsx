'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus } from 'lucide-react';
import { createPartnerLevelAction } from '@/app/(admin)/admin/partners/actions';
import { CreatePartnerLevelData } from '@/lib/partner-management';

interface CreatePartnerLevelDialogProps {
  children: React.ReactNode;
}

export function CreatePartnerLevelDialog({ children }: CreatePartnerLevelDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    level_name: '',
    level_code: '',
    description: '',
    default_commission_rate: 0.10, // 10%
    min_commission_rate: 0.05, // 5%
    max_commission_rate: 0.25, // 25%
    min_downline_count: 0,
    min_volume_requirement: 0,
    level_order: 1,
    max_referral_depth: 3,
    status: 'active',
    benefits: '',
    requirements: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.level_name.trim()) {
      setError('Level name is required');
      return;
    }
    if (!formData.level_code.trim()) {
      setError('Level code is required');
      return;
    }
    if (formData.default_commission_rate < 0 || formData.default_commission_rate > 1) {
      setError('Commission rate must be between 0% and 100%');
      return;
    }
    if (formData.max_referral_depth < 1) {
      setError('Maximum referral depth must be at least 1');
      return;
    }
    if (formData.level_order < 1) {
      setError('Level order must be at least 1');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const benefits = formData.benefits 
        ? formData.benefits.split('\n').map(b => b.trim()).filter(b => b.length > 0)
        : [];
        
      const requirements = formData.requirements
        ? formData.requirements.split('\n').map(r => r.trim()).filter(r => r.length > 0)
        : [];

      const levelData: CreatePartnerLevelData = {
        level_name: formData.level_name.trim(),
        level_code: formData.level_code.trim().toUpperCase(),
        description: formData.description.trim() || undefined,
        default_commission_rate: formData.default_commission_rate,
        min_commission_rate: formData.min_commission_rate,
        max_commission_rate: formData.max_commission_rate,
        min_downline_count: formData.min_downline_count,
        min_volume_requirement: formData.min_volume_requirement,
        level_order: formData.level_order,
        max_referral_depth: formData.max_referral_depth,
        status: formData.status,
        benefits,
        requirements,
        createdBy: 'system' // Will be overridden by server action
      };

      const result = await createPartnerLevelAction(levelData);
      
      if (result.success) {
        setIsOpen(false);
        // Reset form
        setFormData({
          level_name: '',
          level_code: '',
          description: '',
          default_commission_rate: 0.10,
          min_commission_rate: 0.05,
          max_commission_rate: 0.25,
          min_downline_count: 0,
          min_volume_requirement: 0,
          level_order: 1,
          max_referral_depth: 3,
          status: 'active',
          benefits: '',
          requirements: '',
        });
      } else {
        setError(result.error || 'Failed to create partner level');
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Partner Level</DialogTitle>
          <DialogDescription>
            Define a new tier in your partnership program with commission rates and referral depth.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="level_name">Level Name *</Label>
                <Input
                  id="level_name"
                  placeholder="e.g., Affiliate, Reseller, Premium Partner"
                  value={formData.level_name}
                  onChange={(e) => updateFormData('level_name', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="level_code">Level Code *</Label>
                <Input
                  id="level_code"
                  placeholder="e.g., AFF, RES, PREM"
                  value={formData.level_code}
                  onChange={(e) => updateFormData('level_code', e.target.value.toUpperCase())}
                  maxLength={10}
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe this partner level and its purpose"
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <hr className="border-t border-gray-200" />

          {/* Commission Structure */}
          <div className="space-y-4">
            <h4 className="font-medium">Commission Structure</h4>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="default_commission_rate">Default Rate (%) *</Label>
                <Input
                  id="default_commission_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={(formData.default_commission_rate * 100).toFixed(2)}
                  onChange={(e) => updateFormData('default_commission_rate', parseFloat(e.target.value) / 100)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="min_commission_rate">Min Rate (%)</Label>
                <Input
                  id="min_commission_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={(formData.min_commission_rate * 100).toFixed(2)}
                  onChange={(e) => updateFormData('min_commission_rate', parseFloat(e.target.value) / 100)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="max_commission_rate">Max Rate (%)</Label>
                <Input
                  id="max_commission_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={(formData.max_commission_rate * 100).toFixed(2)}
                  onChange={(e) => updateFormData('max_commission_rate', parseFloat(e.target.value) / 100)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max_referral_depth">Max Referral Depth *</Label>
                <Input
                  id="max_referral_depth"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.max_referral_depth}
                  onChange={(e) => updateFormData('max_referral_depth', parseInt(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  How many levels deep commissions are paid (1-10)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="level_order">Level Order *</Label>
                <Input
                  id="level_order"
                  type="number"
                  min="1"
                  value={formData.level_order}
                  onChange={(e) => updateFormData('level_order', parseInt(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Hierarchy position (1 = lowest level)
                </p>
              </div>
            </div>
          </div>

          <hr className="border-t border-gray-200" />

          {/* Requirements */}
          <div className="space-y-4">
            <h4 className="font-medium">Level Requirements</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_downline_count">Min Downline Count</Label>
                <Input
                  id="min_downline_count"
                  type="number"
                  min="0"
                  value={formData.min_downline_count}
                  onChange={(e) => updateFormData('min_downline_count', parseInt(e.target.value))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="min_volume_requirement">Min Volume Requirement (₦)</Label>
                <Input
                  id="min_volume_requirement"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.min_volume_requirement}
                  onChange={(e) => updateFormData('min_volume_requirement', parseFloat(e.target.value))}
                />
              </div>
            </div>
          </div>

          <hr className="border-t border-gray-200" />

          {/* Settings */}
          <div className="space-y-4">
            <h4 className="font-medium">Level Settings</h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="status">Status</Label>
                <div className="text-sm text-muted-foreground">
                  This level is available for partner assignments
                </div>
              </div>
              <Switch
                id="status"
                checked={formData.status === 'active'}
                onCheckedChange={(checked) => updateFormData('status', checked ? 'active' : 'inactive')}
              />
            </div>
          </div>

          <hr className="border-t border-gray-200" />

          {/* Benefits and Permissions */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="benefits">Benefits (one per line)</Label>
                <Textarea
                  id="benefits"
                  placeholder="Higher commission rates&#10;Priority support&#10;Marketing materials access"
                  value={formData.benefits}
                  onChange={(e) => updateFormData('benefits', e.target.value)}
                  rows={4}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements (one per line)</Label>
                <Textarea
                  id="requirements"
                  placeholder="Must complete training&#10;Active for 3 months&#10;No violations"
                  value={formData.requirements}
                  onChange={(e) => updateFormData('requirements', e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
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
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Level
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}