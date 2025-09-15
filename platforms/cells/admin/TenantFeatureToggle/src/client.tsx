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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Settings, 
  Zap, 
  Shield, 
  Database, 
  Globe, 
  Users,
  CreditCard,
  Mail,
  Bell,
  Search,
  Save,
  RotateCcw
} from 'lucide-react';

interface Feature {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: any;
  enabled: boolean;
  config?: any;
  planRequired?: string;
  isCore?: boolean;
}

interface FeatureToggleProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  onFeatureToggle?: (featureId: string, enabled: boolean, config?: any) => Promise<void>;
}

const DEFAULT_FEATURES: Feature[] = [
  {
    id: 'analytics',
    name: 'Advanced Analytics',
    description: 'Detailed usage analytics and reporting dashboards',
    category: 'Analytics',
    icon: Database,
    enabled: false,
    planRequired: 'Pro'
  },
  {
    id: 'custom_domain',
    name: 'Custom Domain',
    description: 'Use your own domain instead of subdomain',
    category: 'Branding',
    icon: Globe,
    enabled: false,
    planRequired: 'Enterprise'
  },
  {
    id: 'sso',
    name: 'Single Sign-On',
    description: 'SSO integration with SAML, OAuth, and more',
    category: 'Security',
    icon: Shield,
    enabled: false,
    planRequired: 'Enterprise'
  },
  {
    id: 'api_access',
    name: 'API Access',
    description: 'Full REST API access for integrations',
    category: 'Integration',
    icon: Zap,
    enabled: true,
    isCore: true
  },
  {
    id: 'team_management',
    name: 'Team Management',
    description: 'Advanced user roles and permissions',
    category: 'Users',
    icon: Users,
    enabled: false,
    planRequired: 'Pro'
  },
  {
    id: 'payment_processing',
    name: 'Payment Processing',
    description: 'Accept payments via multiple gateways',
    category: 'Commerce',
    icon: CreditCard,
    enabled: false,
    config: {
      enabledGateways: ['paystack'],
      currency: 'NGN'
    }
  },
  {
    id: 'email_marketing',
    name: 'Email Marketing',
    description: 'Send newsletters and marketing campaigns',
    category: 'Marketing',
    icon: Mail,
    enabled: false,
    planRequired: 'Pro'
  },
  {
    id: 'push_notifications',
    name: 'Push Notifications',
    description: 'Send real-time notifications to users',
    category: 'Communication',
    icon: Bell,
    enabled: false
  }
];

export function TenantFeatureToggleCell({ 
  isOpen, 
  onClose, 
  tenantId, 
  tenantName,
  onFeatureToggle 
}: FeatureToggleProps) {
  const [features, setFeatures] = useState<Feature[]>(DEFAULT_FEATURES);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(false);
  const [changes, setChanges] = useState<Set<string>>(new Set());

  const categories = ['All', ...Array.from(new Set(features.map(f => f.category)))];
  
  const filteredFeatures = features.filter(feature => {
    const matchesSearch = feature.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         feature.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || feature.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleFeatureToggle = async (featureId: string, enabled: boolean) => {
    if (isLoading) return;

    setFeatures(prev => prev.map(feature => 
      feature.id === featureId 
        ? { ...feature, enabled }
        : feature
    ));

    setChanges(prev => new Set([...prev, featureId]));

    if (onFeatureToggle) {
      setIsLoading(true);
      try {
        const feature = features.find(f => f.id === featureId);
        await onFeatureToggle(featureId, enabled, feature?.config);
        setChanges(prev => {
          const newChanges = new Set(prev);
          newChanges.delete(featureId);
          return newChanges;
        });
      } catch (error) {
        // Revert on error
        setFeatures(prev => prev.map(feature => 
          feature.id === featureId 
            ? { ...feature, enabled: !enabled }
            : feature
        ));
        console.error('Failed to toggle feature:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleBulkToggle = async (enable: boolean) => {
    const toggleableFeatures = filteredFeatures.filter(f => !f.isCore);
    
    for (const feature of toggleableFeatures) {
      if (feature.enabled !== enable) {
        await handleFeatureToggle(feature.id, enable);
      }
    }
  };

  const getPlanBadgeColor = (plan?: string) => {
    switch (plan) {
      case 'Enterprise': return 'bg-purple-100 text-purple-800';
      case 'Pro': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const FeatureIcon = ({ icon: Icon }: { icon: any }) => (
    <Icon className="h-5 w-5" />
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Settings className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-semibold">Feature Management</h2>
              <p className="text-sm text-gray-500">{tenantName}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {changes.size > 0 && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  {changes.size} pending changes
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Search and Filters */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search features..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border rounded-md bg-white min-w-[120px]"
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Bulk Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkToggle(true)}
              disabled={isLoading}
            >
              Enable All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkToggle(false)}
              disabled={isLoading}
            >
              Disable All
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredFeatures.map((feature) => (
              <Card 
                key={feature.id} 
                className={`transition-all ${
                  changes.has(feature.id) ? 'ring-2 ring-orange-200 bg-orange-50' : ''
                } ${feature.isCore ? 'border-blue-200 bg-blue-50' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        <FeatureIcon icon={feature.icon} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{feature.name}</h4>
                          {feature.planRequired && (
                            <Badge 
                              className={getPlanBadgeColor(feature.planRequired)}
                            >
                              {feature.planRequired}
                            </Badge>
                          )}
                          {feature.isCore && (
                            <Badge className="bg-blue-100 text-blue-800">
                              Core
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{feature.description}</p>
                        <p className="text-xs text-gray-500 mt-1">{feature.category}</p>
                      </div>
                    </div>
                    <div className="ml-4">
                      <Switch
                        checked={feature.enabled}
                        onCheckedChange={(enabled) => handleFeatureToggle(feature.id, enabled)}
                        disabled={isLoading || feature.isCore}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredFeatures.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No features match your search criteria.</p>
            </div>
          )}

          {/* Feature Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Feature Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {features.filter(f => f.enabled).length}
                  </p>
                  <p className="text-xs text-gray-500">Enabled</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-600">
                    {features.filter(f => !f.enabled).length}
                  </p>
                  <p className="text-xs text-gray-500">Disabled</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">
                    {features.filter(f => f.isCore).length}
                  </p>
                  <p className="text-xs text-gray-500">Core Features</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}