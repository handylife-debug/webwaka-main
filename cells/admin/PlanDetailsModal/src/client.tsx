'use client';

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  CreditCard, 
  Users, 
  TrendingUp, 
  Settings, 
  Edit3,
  Save,
  X,
  Check,
  AlertCircle
} from 'lucide-react';
import { SubscriptionPlan, PlanFeature, PlanInterval } from '@/lib/plans-management';

interface PlanAnalytics {
  totalSubscribers: number;
  monthlyRevenue: number;
  churnRate: number;
  avgUpgradeTime: number;
  popularFeatures: string[];
}

interface PlanDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: SubscriptionPlan | null;
  onUpdate?: (planId: string, updates: any) => Promise<void>;
}

export function PlanDetailsModalCell({ 
  isOpen, 
  onClose, 
  plan, 
  onUpdate 
}: PlanDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<SubscriptionPlan>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<PlanAnalytics>({
    totalSubscribers: 0,
    monthlyRevenue: 0,
    churnRate: 0,
    avgUpgradeTime: 0,
    popularFeatures: []
  });

  useEffect(() => {
    if (plan && isOpen) {
      setEditData(plan);
      // Simulate loading plan analytics
      setAnalytics({
        totalSubscribers: Math.floor(Math.random() * 500) + 50,
        monthlyRevenue: Math.floor(Math.random() * 100000) + 10000,
        churnRate: Math.random() * 10,
        avgUpgradeTime: Math.floor(Math.random() * 30) + 7,
        popularFeatures: plan.features.slice(0, 3).map(f => f.name)
      });
    }
  }, [plan, isOpen]);

  const handleSave = async () => {
    if (!plan || !onUpdate) return;
    
    setIsLoading(true);
    try {
      await onUpdate(plan.id, editData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update plan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Draft': return 'bg-yellow-100 text-yellow-800';
      case 'Archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  if (!plan) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CreditCard className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="text-sm text-gray-500">
                {formatCurrency(plan.price)}/{plan.interval}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge className={getStatusColor(plan.status)}>
                {plan.status}
              </Badge>
              {plan.isPopular && (
                <Badge className="bg-blue-100 text-blue-800">
                  Popular
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                disabled={isLoading}
              >
                {isEditing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-gray-500">Subscribers</p>
                      <p className="text-lg font-semibold">{analytics.totalSubscribers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-xs text-gray-500">Monthly Revenue</p>
                      <p className="text-lg font-semibold">{formatCurrency(analytics.monthlyRevenue)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-xs text-gray-500">Churn Rate</p>
                      <p className="text-lg font-semibold">{analytics.churnRate.toFixed(1)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-xs text-gray-500">Avg Upgrade Time</p>
                      <p className="text-lg font-semibold">{analytics.avgUpgradeTime} days</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Plan Information */}
            <Card>
              <CardHeader>
                <CardTitle>Plan Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Plan Name</Label>
                      <Input
                        id="name"
                        value={editData.name || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="price">Price (NGN)</Label>
                      <Input
                        id="price"
                        type="number"
                        value={editData.price || 0}
                        onChange={(e) => setEditData(prev => ({ ...prev, price: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={editData.description || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="interval">Billing Interval</Label>
                      <select
                        id="interval"
                        value={editData.interval || plan.interval}
                        onChange={(e) => setEditData(prev => ({ ...prev, interval: e.target.value as PlanInterval }))}
                        className="w-full px-3 py-2 border rounded-md bg-white"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="trialDays">Trial Days</Label>
                      <Input
                        id="trialDays"
                        type="number"
                        value={editData.trialDays || 0}
                        onChange={(e) => setEditData(prev => ({ ...prev, trialDays: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="col-span-2 flex gap-2">
                      <Button onClick={handleSave} disabled={isLoading}>
                        <Save className="h-4 w-4 mr-2" />
                        {isLoading ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Plan Name</p>
                      <p className="font-medium">{plan.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Price</p>
                      <p className="font-medium">{formatCurrency(plan.price)}/{plan.interval}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">Description</p>
                      <p className="font-medium">{plan.description || 'No description'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Trial Period</p>
                      <p className="font-medium">
                        {plan.trialDays ? `${plan.trialDays} days` : 'No trial'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Created</p>
                      <p className="font-medium">
                        {new Date(plan.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plan Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          feature.included ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {feature.included ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{feature.name}</p>
                          {feature.limit && (
                            <p className="text-sm text-gray-500">Limit: {feature.limit}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant={feature.included ? 'default' : 'secondary'}>
                        {feature.included ? 'Included' : 'Not Included'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Plan Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Usage Limits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center p-3 border rounded-lg">
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <Badge variant="outline">{value}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plan Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Popular Features</h4>
                    <div className="flex flex-wrap gap-2">
                      {analytics.popularFeatures.map((feature, index) => (
                        <Badge key={index} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">Revenue Trend</h4>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(analytics.monthlyRevenue)}
                      </p>
                      <p className="text-xs text-gray-500">Monthly recurring revenue</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Customer Satisfaction</h4>
                      <p className="text-2xl font-bold text-blue-600">
                        {(100 - analytics.churnRate).toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">Retention rate</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plan Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Mark as Popular</p>
                      <p className="text-sm text-gray-500">Show this plan as popular choice</p>
                    </div>
                    <Switch checked={plan.isPopular} />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Allow New Subscriptions</p>
                      <p className="text-sm text-gray-500">Accept new customers for this plan</p>
                    </div>
                    <Switch checked={plan.status === 'active'} />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Automatic Upgrades</p>
                      <p className="text-sm text-gray-500">Allow automatic upgrades from lower plans</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}