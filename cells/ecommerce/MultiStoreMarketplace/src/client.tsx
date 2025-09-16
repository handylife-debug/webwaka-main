'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Store, 
  TrendingUp, 
  Package, 
  DollarSign,
  Plus,
  Settings,
  Eye,
  BarChart3,
  ShoppingBag,
  Edit,
  Search,
  Filter,
  Grid,
  List,
  Star,
  Users,
  MapPin,
  Truck,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

// Reuse existing ProductForm component
import ProductForm from '@/components/inventory/product-form';
import { ProductDocument } from '@/lib/offline-database';

// API helpers for server actions
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }
  
  return response.json();
};

// Types
interface VendorStore {
  id: string;
  vendorId: string;
  storeName: string;
  storeSlug: string;
  description?: string;
  logo?: string;
  banner?: string;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    layout: 'grid' | 'list' | 'masonry';
  };
  settings: {
    isActive: boolean;
    allowReviews: boolean;
    autoApproveProducts: boolean;
    shippingZones: string[];
    paymentMethods: string[];
  };
  createdAt: string;
  updatedAt: string;
}

interface VendorDashboardProps {
  vendorId: string;
}

// Reused StatsCards component from partner dashboard but adapted for vendor store metrics
function VendorStatsCards({ metrics }: { metrics: any }) {
  const statsData = [
    {
      title: 'Monthly Revenue',
      value: `$${metrics.monthlyRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-green-600 bg-green-100',
      change: `${metrics.totalSales > 0 ? '+12%' : '0%'} from last month`,
      changeType: 'positive' as const,
    },
    {
      title: 'Total Products',
      value: `${metrics.totalProducts}`,
      icon: Package,
      color: 'text-blue-600 bg-blue-100',
      change: `${metrics.activeProducts} active`,
      changeType: 'neutral' as const,
    },
    {
      title: 'Pending Orders',
      value: `${metrics.pendingOrders}`,
      icon: ShoppingBag,
      color: 'text-yellow-600 bg-yellow-100',
      change: `${metrics.completedOrders} completed`,
      changeType: 'positive' as const,
    },
    {
      title: 'Store Rating',
      value: `${metrics.averageRating.toFixed(1)}`,
      icon: Star,
      color: 'text-purple-600 bg-purple-100',
      change: `${metrics.reviewCount} reviews`,
      changeType: 'positive' as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${stat.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs mt-1 ${
                stat.changeType === 'positive' ? 'text-green-600' : 'text-gray-600'
              }`}>
                {stat.change}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Store Setup Component
function StoreSetup({ vendorId, onStoreCreated }: { vendorId: string, onStoreCreated: (store: VendorStore) => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    storeName: '',
    storeSlug: '',
    description: '',
    logo: '',
    banner: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#1F2937',
    fontFamily: 'Inter',
    layout: 'grid' as 'grid' | 'list' | 'masonry',
    allowReviews: true,
    autoApproveProducts: false,
    shippingZones: ['local'],
    paymentMethods: ['stripe', 'paypal']
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 30);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await apiCall('/api/marketplace/store', {
        method: 'POST',
        body: JSON.stringify({
        vendorId,
        storeName: formData.storeName,
        storeSlug: formData.storeSlug || generateSlug(formData.storeName),
        description: formData.description,
        logo: formData.logo,
        banner: formData.banner,
        theme: {
          primaryColor: formData.primaryColor,
          secondaryColor: formData.secondaryColor,
          fontFamily: formData.fontFamily,
          layout: formData.layout
        },
        settings: {
          isActive: true,
          allowReviews: formData.allowReviews,
          autoApproveProducts: formData.autoApproveProducts,
          shippingZones: formData.shippingZones,
          paymentMethods: formData.paymentMethods
        }
        })
      });

      if (result.success && result.storeId) {
        // Trigger dashboard refresh
        const dashboardResult = await apiCall(`/api/marketplace/store?vendorId=${vendorId}`);
        if (dashboardResult.success && dashboardResult.dashboard) {
          onStoreCreated(dashboardResult.dashboard.store);
        }
      } else {
        alert(result.message || 'Failed to create store');
      }
    } catch (error) {
      console.error('Error creating store:', error);
      alert('Failed to create store. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Create Your Store
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="storeName">Store Name *</Label>
                <Input
                  id="storeName"
                  value={formData.storeName}
                  onChange={(e) => {
                    setFormData(prev => ({
                      ...prev,
                      storeName: e.target.value,
                      storeSlug: generateSlug(e.target.value)
                    }));
                  }}
                  placeholder="Enter your store name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="storeSlug">Store URL Slug *</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-300 rounded-l-md">
                    yoursite.com/store/
                  </span>
                  <Input
                    id="storeSlug"
                    value={formData.storeSlug}
                    onChange={(e) => setFormData(prev => ({ ...prev, storeSlug: e.target.value }))}
                    className="rounded-l-none"
                    placeholder="store-url"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Store Description</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Tell customers about your store..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="logo">Logo URL</Label>
                  <Input
                    id="logo"
                    value={formData.logo}
                    onChange={(e) => setFormData(prev => ({ ...prev, logo: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label htmlFor="banner">Banner URL</Label>
                  <Input
                    id="banner"
                    value={formData.banner}
                    onChange={(e) => setFormData(prev => ({ ...prev, banner: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <Input
                    id="primaryColor"
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="layout">Store Layout</Label>
                  <select
                    id="layout"
                    value={formData.layout}
                    onChange={(e) => setFormData(prev => ({ ...prev, layout: e.target.value as 'grid' | 'list' | 'masonry' }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="grid">Grid Layout</option>
                    <option value="list">List Layout</option>
                    <option value="masonry">Masonry Layout</option>
                  </select>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating Store...' : 'Create Store'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Store Products Management Component (reuses existing ProductForm)
function StoreProductsManager({ store, vendorId }: { store: VendorStore, vendorId: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProductForm, setShowProductForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDocument | null>(null);

  useEffect(() => {
    loadProducts();
  }, [store.id]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const result = await apiCall(`/api/marketplace/products?storeId=${store.id}&page=1&limit=50`);

      if (result.success && result.products) {
        setProducts(result.products);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSave = (product: ProductDocument) => {
    // This would typically map the product to the vendor store
    setShowProductForm(false);
    setSelectedProduct(null);
    loadProducts(); // Refresh the list
  };

  if (loading) {
    return <div className="p-8 text-center">Loading products...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Store Products</h3>
          <p className="text-sm text-gray-600">Manage products in your store</p>
        </div>
        <Button onClick={() => setShowProductForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">No products yet</h3>
            <p className="text-gray-600 mb-4">Start by adding your first product to the store</p>
            <Button onClick={() => setShowProductForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium truncate">{product.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={product.vendor_stock > 0 ? "default" : "secondary"}>
                    {product.vendor_stock > 0 ? 'In Stock' : 'Out of Stock'}
                  </Badge>
                  <span className="text-sm text-gray-500">Stock: {product.vendor_stock}</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-lg font-bold">${product.vendor_price}</span>
                  <span className="text-sm text-gray-500">SKU: {product.vendor_sku}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedProduct(product)}>
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm">
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reuse existing ProductForm component */}
      {showProductForm && (
        <ProductForm
          product={selectedProduct}
          onSave={handleProductSave}
          onCancel={() => {
            setShowProductForm(false);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}

// Main Vendor Dashboard (reuses structure from partner dashboard)
export function VendorDashboard({ vendorId }: VendorDashboardProps) {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [vendorId]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall(`/api/marketplace/store?vendorId=${vendorId}`);
      
      if (result.success && result.dashboard) {
        setDashboardData(result.dashboard);
      } else {
        setError(result.message || 'Failed to load dashboard');
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your store dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Welcome to Your Vendor Dashboard!
              </h3>
              <p className="text-gray-600 mt-1">
                Set up your store to start selling your products.
              </p>
            </div>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              Setup Required
            </Badge>
          </div>
        </div>
        <StoreSetup vendorId={vendorId} onStoreCreated={loadDashboard} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Store Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {dashboardData.store.logo ? (
              <img 
                src={dashboardData.store.logo} 
                alt="Store logo" 
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Store className="h-6 w-6 text-blue-600" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {dashboardData.store.storeName}
              </h3>
              <p className="text-gray-600">
                {dashboardData.store.description || 'Your online store'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge 
              variant={dashboardData.store.settings.isActive ? "default" : "secondary"}
              className={dashboardData.store.settings.isActive ? "bg-green-100 text-green-800" : ""}
            >
              {dashboardData.store.settings.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Store Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics - reusing StatsCards pattern */}
          <VendorStatsCards metrics={dashboardData.metrics} />

          {/* Quick Actions and Recent Activity */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardData.recentOrders.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingBag className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-gray-500">No recent orders</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dashboardData.recentOrders.map((order: any) => (
                        <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{order.customer}</p>
                            <p className="text-xs text-gray-500">Order #{order.id}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">${order.amount}</span>
                            <Badge 
                              variant="secondary"
                              className={order.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                            >
                              {order.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Eye className="h-4 w-4 mr-2" />
                    View Store
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    View Analytics
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <StoreProductsManager store={dashboardData.store} vendorId={vendorId} />
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Orders Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Orders management interface coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Store Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Analytics dashboard coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Marketplace Overview Component (for admin/platform view)
export function MarketplaceOverview({ tenantId }: { tenantId: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, [tenantId]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const result = await apiCall(`/api/marketplace/overview?tenantId=${tenantId}`);
      if (result.success && result.overview) {
        setOverview(result.overview);
      }
    } catch (error) {
      console.error('Error loading marketplace overview:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading marketplace overview...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Marketplace Overview</h2>
        <p className="text-gray-600">Platform-wide marketplace metrics and insights</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Stores</CardTitle>
            <Store className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalStores || 0}</div>
            <p className="text-xs text-green-600">{overview?.activeStores || 0} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Products</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalProducts || 0}</div>
            <p className="text-xs text-gray-600">across all stores</p>
          </CardContent>
        </Card>
      </div>

      {overview?.topVendors && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Vendors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.topVendors.map((vendor: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <span className="font-medium">{vendor.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">${vendor.sales.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{vendor.products} products</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Public Store Page Component
export function PublicStorePage({ storeSlug, tenantId }: { storeSlug: string; tenantId: string }) {
  const [store, setStore] = useState<VendorStore | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // This would be implemented to load store by slug
  // For now, this is a placeholder component structure

  if (loading) {
    return <div className="p-8 text-center">Loading store...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Store header, products grid, etc. */}
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{store?.storeName}</h1>
          <p className="text-gray-600 mt-2">{store?.description}</p>
        </div>
        
        {/* Products would be displayed here */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Product cards */}
        </div>
      </div>
    </div>
  );
}

// Export main components
export default {
  VendorDashboard,
  MarketplaceOverview,
  PublicStorePage
};