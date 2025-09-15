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
import { 
  Globe, 
  Users, 
  Database, 
  Activity, 
  Settings, 
  Calendar,
  TrendingUp,
  ExternalLink,
  Save,
  X
} from 'lucide-react';

interface TenantData {
  subdomain: string;
  tenantName: string;
  emoji: string;
  subscriptionPlan: string;
  status: string;
  createdAt: number;
  lastActive?: number;
  features: string[];
}

interface TenantStats {
  totalUsers: number;
  activeUsers: number;
  storageUsed: number;
  apiCalls: number;
  revenue: number;
  growth: number;
}

interface TenantDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantData | null;
  onUpdate?: (tenantId: string, updates: any) => Promise<void>;
}

export function TenantDetailsCell({ 
  isOpen, 
  onClose, 
  tenant, 
  onUpdate 
}: TenantDetailsProps) {
  const [stats, setStats] = useState<TenantStats>({
    totalUsers: 0,
    activeUsers: 0,
    storageUsed: 0,
    apiCalls: 0,
    revenue: 0,
    growth: 0
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<TenantData>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (tenant && isOpen) {
      // Simulate loading tenant stats - in real implementation, call server
      setStats({
        totalUsers: Math.floor(Math.random() * 100) + 10,
        activeUsers: Math.floor(Math.random() * 50) + 5,
        storageUsed: Math.floor(Math.random() * 1000) + 100,
        apiCalls: Math.floor(Math.random() * 10000) + 1000,
        revenue: Math.floor(Math.random() * 50000) + 5000,
        growth: Math.floor(Math.random() * 20) - 10
      });
      setEditData(tenant);
    }
  }, [tenant, isOpen]);

  const handleSave = async () => {
    if (!tenant || !onUpdate) return;
    
    setIsLoading(true);
    try {
      await onUpdate(tenant.subdomain, editData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update tenant:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Suspended': return 'bg-red-100 text-red-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!tenant) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl">{tenant.emoji}</span>
            <div>
              <h2 className="text-xl font-semibold">{tenant.tenantName}</h2>
              <p className="text-sm text-gray-500">
                {tenant.subdomain}.webwaka.bio
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge className={getStatusColor(tenant.status)}>
                {tenant.status}
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-gray-500">Total Users</p>
                      <p className="text-lg font-semibold">{stats.totalUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-xs text-gray-500">Active Users</p>
                      <p className="text-lg font-semibold">{stats.activeUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-xs text-gray-500">Storage</p>
                      <p className="text-lg font-semibold">{formatBytes(stats.storageUsed * 1024 * 1024)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-xs text-gray-500">API Calls</p>
                      <p className="text-lg font-semibold">{stats.apiCalls.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tenant Information */}
            <Card>
              <CardHeader>
                <CardTitle>Tenant Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="tenantName">Tenant Name</Label>
                      <Input
                        id="tenantName"
                        value={editData.tenantName || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, tenantName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="emoji">Emoji</Label>
                      <Input
                        id="emoji"
                        value={editData.emoji || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, emoji: e.target.value }))}
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
                      <p className="text-sm text-gray-500">Subdomain</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{tenant.subdomain}</p>
                        <a 
                          href={`https://${tenant.subdomain}.webwaka.bio`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Subscription Plan</p>
                      <p className="font-medium">{tenant.subscriptionPlan}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Created</p>
                      <p className="font-medium">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Last Active</p>
                      <p className="font-medium">
                        {tenant.lastActive 
                          ? new Date(tenant.lastActive).toLocaleDateString()
                          : 'Never'
                        }
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Features */}
            <Card>
              <CardHeader>
                <CardTitle>Active Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tenant.features.length > 0 ? (
                    tenant.features.map((feature, index) => (
                      <Badge key={index} variant="outline">
                        {feature}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-gray-500">No features enabled</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Usage Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Monthly Revenue</h4>
                    <p className="text-2xl font-bold text-green-600">
                      ₦{stats.revenue.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {stats.growth > 0 ? '+' : ''}{stats.growth}% from last month
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">User Engagement</h4>
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round((stats.activeUsers / stats.totalUsers) * 100)}%
                    </p>
                    <p className="text-xs text-gray-500">Active user rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tenant Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">Settings configuration panel coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity History</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">Activity timeline coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}