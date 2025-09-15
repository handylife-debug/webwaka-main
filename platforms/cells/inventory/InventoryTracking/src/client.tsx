'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Package, 
  MapPin, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowUpDown, 
  Plus, 
  Minus, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  Upload, 
  BarChart3,
  PieChart,
  LineChart,
  Calendar,
  Users,
  Eye,
  Edit3,
  Trash2,
  Archive,
  ShoppingCart,
  Truck,
  AlertCircle,
  Info,
  CheckSquare,
  Square,
  ArrowRight,
  ArrowLeft,
  MoreHorizontal,
  Settings
} from 'lucide-react';

// Types for component props and state
interface StockLevel {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
  costPerUnit: number;
  totalValue: number;
  lastUpdated: string;
  lastMovementId?: string;
  productName?: string;
  sku?: string;
  variantName?: string;
  locationName?: string;
  reorderPoint?: number;
  minStockLevel?: number;
  isLowStock?: boolean;
}

interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  movementType: 'in' | 'out' | 'adjustment' | 'transfer' | 'return' | 'loss';
  movementReason: string;
  referenceType?: string;
  referenceId?: string;
  quantityBefore: number;
  quantityChanged: number;
  quantityAfter: number;
  costPerUnit: number;
  totalValue: number;
  notes?: string;
  performedBy: string;
  createdAt: string;
  productName?: string;
  locationName?: string;
  performedByName?: string;
}

interface StockTransfer {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  transferReason: string;
  status: 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled' | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expectedArrival?: string;
  actualArrival?: string;
  notes?: string;
  requestedBy: string;
  approvedBy?: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
  productName?: string;
  fromLocationName?: string;
  toLocationName?: string;
}

interface LowStockAlert {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  productName: string;
  variantName?: string;
  locationName: string;
  currentStock: number;
  minStockLevel: number;
  reorderPoint: number;
  recommendedReorderQuantity: number;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'acknowledged' | 'resolved';
  alertDate: string;
}

interface ReorderSuggestion {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  locationId: string;
  productName: string;
  currentStock: number;
  reorderPoint: number;
  recommendedQuantity: number;
  avgDailySales: number;
  leadTimeDays: number;
  seasonalFactor: number;
  priority: 'critical' | 'urgent' | 'normal';
  estimatedCost: number;
  lastOrderDate?: string;
  generatedAt: string;
}

interface InventoryTrackingProps {
  tenantId: string;
  currentUserId: string;
  locations: Array<{ id: string; name: string; }>;
  products: Array<{ id: string; name: string; sku?: string; categoryId?: string; }>;
  categories: Array<{ id: string; name: string; }>;
  onStockUpdate?: (productId: string, locationId: string, newQuantity: number) => void;
  onTransferRequest?: (transferId: string) => void;
  onAdjustmentCreated?: (adjustmentId: string) => void;
  apiEndpoint?: string;
}

// Nigerian currency formatter
const formatNGN = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2
  }).format(amount);
};

// Date formatter for Nigerian locale
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Main InventoryTracking component
export function InventoryTrackingCell({
  tenantId,
  currentUserId,
  locations = [],
  products = [],
  categories = [],
  onStockUpdate,
  onTransferRequest,
  onAdjustmentCreated,
  apiEndpoint = '/api/cells/inventory/InventoryTracking'
}: InventoryTrackingProps) {
  // State management
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data state
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([]);
  const [reorderSuggestions, setReorderSuggestions] = useState<ReorderSuggestion[]>([]);

  // Filter state
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Dialog state
  const [showStockUpdateDialog, setShowStockUpdateDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);

  // Form state
  const [stockUpdateForm, setStockUpdateForm] = useState({
    productId: '',
    variantId: '',
    locationId: '',
    quantity: 0,
    movementType: 'in' as const,
    movementReason: 'purchase' as const,
    costPerUnit: 0,
    notes: '',
    batchNumber: '',
    expiryDate: ''
  });

  const [transferForm, setTransferForm] = useState({
    productId: '',
    variantId: '',
    fromLocationId: '',
    toLocationId: '',
    quantity: 0,
    transferReason: 'restock' as const,
    priority: 'medium' as const,
    expectedArrival: '',
    notes: ''
  });

  const [adjustmentForm, setAdjustmentForm] = useState({
    productId: '',
    variantId: '',
    locationId: '',
    currentStock: 0,
    adjustedStock: 0,
    adjustmentReason: 'count_correction' as const,
    notes: '',
    evidence: ''
  });

  // API helper function
  const apiCall = useCallback(async (action: string, data?: any) => {
    try {
      const response = await fetch(`${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          tenantId,
          ...data
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call failed for ${action}:`, error);
      throw error;
    }
  }, [apiEndpoint, tenantId]);

  // Load data functions
  const loadStockLevels = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiCall('getStockLevels', {
        locationId: selectedLocation || undefined,
        categoryId: selectedCategory || undefined,
        lowStockOnly: showLowStockOnly,
        limit: 1000
      });

      if (result.success) {
        setStockLevels(result.stockLevels || []);
      } else {
        setError(result.error || 'Failed to load stock levels');
      }
    } catch (err) {
      setError('Failed to load stock levels');
      console.error('Error loading stock levels:', err);
    } finally {
      setLoading(false);
    }
  }, [apiCall, selectedLocation, selectedCategory, showLowStockOnly]);

  const loadStockMovements = useCallback(async () => {
    try {
      const result = await apiCall('stockMovementHistory', {
        locationId: selectedLocation || undefined,
        productId: selectedProduct || undefined,
        startDate: dateRange.start || undefined,
        endDate: dateRange.end || undefined,
        limit: 500
      });

      if (result.success) {
        setStockMovements(result.movements || []);
      } else {
        setError(result.error || 'Failed to load stock movements');
      }
    } catch (err) {
      setError('Failed to load stock movements');
      console.error('Error loading stock movements:', err);
    }
  }, [apiCall, selectedLocation, selectedProduct, dateRange]);

  const loadLowStockAlerts = useCallback(async () => {
    try {
      const result = await apiCall('getLowStockAlerts', {
        locationId: selectedLocation || undefined,
        categoryId: selectedCategory || undefined,
        limit: 100
      });

      if (result.success) {
        setLowStockAlerts(result.alerts || []);
      } else {
        setError(result.error || 'Failed to load alerts');
      }
    } catch (err) {
      setError('Failed to load alerts');
      console.error('Error loading alerts:', err);
    }
  }, [apiCall, selectedLocation, selectedCategory]);

  const loadReorderSuggestions = useCallback(async () => {
    try {
      const result = await apiCall('generateReorderSuggestions', {
        locationId: selectedLocation || undefined,
        categoryId: selectedCategory || undefined,
        includeSeasonalFactors: true,
        forecastDays: 30
      });

      if (result.success) {
        setReorderSuggestions(result.suggestions || []);
      } else {
        setError(result.error || 'Failed to load reorder suggestions');
      }
    } catch (err) {
      setError('Failed to load reorder suggestions');
      console.error('Error loading reorder suggestions:', err);
    }
  }, [apiCall, selectedLocation, selectedCategory]);

  // Stock update handler
  const handleStockUpdate = async () => {
    if (!stockUpdateForm.productId || !stockUpdateForm.locationId) {
      setError('Please select product and location');
      return;
    }

    try {
      setLoading(true);
      const result = await apiCall('updateStockLevel', {
        ...stockUpdateForm,
        performed_by: currentUserId
      });

      if (result.success) {
        setSuccess('Stock updated successfully');
        setShowStockUpdateDialog(false);
        setStockUpdateForm({
          productId: '',
          variantId: '',
          locationId: '',
          quantity: 0,
          movementType: 'in',
          movementReason: 'purchase',
          costPerUnit: 0,
          notes: '',
          batchNumber: '',
          expiryDate: ''
        });
        
        // Refresh data
        await Promise.all([loadStockLevels(), loadStockMovements()]);
        
        // Notify parent
        if (onStockUpdate) {
          onStockUpdate(stockUpdateForm.productId, stockUpdateForm.locationId, result.stockLevel?.availableQuantity || 0);
        }
      } else {
        setError(result.error || 'Failed to update stock');
      }
    } catch (err) {
      setError('Failed to update stock');
      console.error('Error updating stock:', err);
    } finally {
      setLoading(false);
    }
  };

  // Transfer request handler
  const handleTransferRequest = async () => {
    if (!transferForm.productId || !transferForm.fromLocationId || !transferForm.toLocationId) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const result = await apiCall('transferStock', {
        ...transferForm,
        requestedBy: currentUserId
      });

      if (result.success) {
        setSuccess('Transfer request created successfully');
        setShowTransferDialog(false);
        setTransferForm({
          productId: '',
          variantId: '',
          fromLocationId: '',
          toLocationId: '',
          quantity: 0,
          transferReason: 'restock',
          priority: 'medium',
          expectedArrival: '',
          notes: ''
        });

        // Notify parent
        if (onTransferRequest && result.transfer) {
          onTransferRequest(result.transfer.id);
        }
      } else {
        setError(result.error || 'Failed to create transfer request');
      }
    } catch (err) {
      setError('Failed to create transfer request');
      console.error('Error creating transfer request:', err);
    } finally {
      setLoading(false);
    }
  };

  // Stock adjustment handler
  const handleStockAdjustment = async () => {
    if (!adjustmentForm.productId || !adjustmentForm.locationId) {
      setError('Please select product and location');
      return;
    }

    try {
      setLoading(true);
      const result = await apiCall('stockAdjustment', {
        ...adjustmentForm,
        performedBy: currentUserId
      });

      if (result.success) {
        setSuccess('Stock adjustment created successfully');
        setShowAdjustmentDialog(false);
        setAdjustmentForm({
          productId: '',
          variantId: '',
          locationId: '',
          currentStock: 0,
          adjustedStock: 0,
          adjustmentReason: 'count_correction',
          notes: '',
          evidence: ''
        });
        
        // Refresh data
        await Promise.all([loadStockLevels(), loadStockMovements()]);

        // Notify parent
        if (onAdjustmentCreated && result.adjustment) {
          onAdjustmentCreated(result.adjustment.id);
        }
      } else {
        setError(result.error || 'Failed to create stock adjustment');
      }
    } catch (err) {
      setError('Failed to create stock adjustment');
      console.error('Error creating stock adjustment:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load initial data
  useEffect(() => {
    loadStockLevels();
    loadLowStockAlerts();
  }, [loadStockLevels, loadLowStockAlerts]);

  // Load movement history when tab is active
  useEffect(() => {
    if (activeTab === 'movements') {
      loadStockMovements();
    } else if (activeTab === 'reorder') {
      loadReorderSuggestions();
    }
  }, [activeTab, loadStockMovements, loadReorderSuggestions]);

  // Clear messages after delay
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Filter stock levels based on search
  const filteredStockLevels = stockLevels.filter(stock => {
    const matchesSearch = !searchQuery || 
      stock.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.locationName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLocation = !selectedLocation || stock.locationId === selectedLocation;
    const matchesProduct = !selectedProduct || stock.productId === selectedProduct;
    const matchesLowStock = !showLowStockOnly || stock.isLowStock;

    return matchesSearch && matchesLocation && matchesProduct && matchesLowStock;
  });

  // Calculate summary statistics
  const totalItems = filteredStockLevels.length;
  const totalValue = filteredStockLevels.reduce((sum, stock) => sum + stock.totalValue, 0);
  const lowStockCount = filteredStockLevels.filter(stock => stock.isLowStock).length;
  const criticalAlerts = lowStockAlerts.filter(alert => alert.severity === 'critical').length;

  return (
    <div className="w-full space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Tracking</h1>
          <p className="text-gray-600 mt-1">Manage stock levels, transfers, and inventory operations</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => {
              loadStockLevels();
              loadLowStockAlerts();
              if (activeTab === 'movements') loadStockMovements();
              if (activeTab === 'reorder') loadReorderSuggestions();
            }}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showStockUpdateDialog} onOpenChange={setShowStockUpdateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Update Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Update Stock Level</DialogTitle>
                <DialogDescription>
                  Add or remove stock with proper movement tracking
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product">Product *</Label>
                  <Select
                    value={stockUpdateForm.productId}
                    onValueChange={(value) => setStockUpdateForm({ ...stockUpdateForm, productId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} {product.sku && `(${product.sku})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="location">Location *</Label>
                  <Select
                    value={stockUpdateForm.locationId}
                    onValueChange={(value) => setStockUpdateForm({ ...stockUpdateForm, locationId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(location => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="movementType">Movement Type *</Label>
                  <Select
                    value={stockUpdateForm.movementType}
                    onValueChange={(value: any) => setStockUpdateForm({ ...stockUpdateForm, movementType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Stock In</SelectItem>
                      <SelectItem value="out">Stock Out</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="movementReason">Reason *</Label>
                  <Select
                    value={stockUpdateForm.movementReason}
                    onValueChange={(value: any) => setStockUpdateForm({ ...stockUpdateForm, movementReason: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Purchase</SelectItem>
                      <SelectItem value="sale">Sale</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={stockUpdateForm.quantity}
                    onChange={(e) => setStockUpdateForm({ ...stockUpdateForm, quantity: parseInt(e.target.value) || 0 })}
                    placeholder="Enter quantity"
                  />
                </div>
                <div>
                  <Label htmlFor="costPerUnit">Cost Per Unit (₦)</Label>
                  <Input
                    id="costPerUnit"
                    type="number"
                    step="0.01"
                    value={stockUpdateForm.costPerUnit}
                    onChange={(e) => setStockUpdateForm({ ...stockUpdateForm, costPerUnit: parseFloat(e.target.value) || 0 })}
                    placeholder="Enter cost"
                  />
                </div>
                <div>
                  <Label htmlFor="batchNumber">Batch Number</Label>
                  <Input
                    id="batchNumber"
                    value={stockUpdateForm.batchNumber}
                    onChange={(e) => setStockUpdateForm({ ...stockUpdateForm, batchNumber: e.target.value })}
                    placeholder="Optional batch number"
                  />
                </div>
                <div>
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={stockUpdateForm.expiryDate}
                    onChange={(e) => setStockUpdateForm({ ...stockUpdateForm, expiryDate: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={stockUpdateForm.notes}
                    onChange={(e) => setStockUpdateForm({ ...stockUpdateForm, notes: e.target.value })}
                    placeholder="Optional notes about this movement"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowStockUpdateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleStockUpdate} disabled={loading}>
                  {loading ? 'Updating...' : 'Update Stock'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across {locations.length} locations
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNGN(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Current inventory value
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground">
              Need attention
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalAlerts}</div>
            <p className="text-xs text-muted-foreground">
              Urgent action required
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="location-filter">Location</Label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All locations</SelectItem>
                  {locations.map(location => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="category-filter">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="product-filter">Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All products</SelectItem>
                  {products.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2 mt-6">
              <Switch
                id="low-stock-only"
                checked={showLowStockOnly}
                onCheckedChange={setShowLowStockOnly}
              />
              <Label htmlFor="low-stock-only">Low stock only</Label>
            </div>
            
            <div className="flex items-end">
              <Button variant="outline" onClick={() => {
                setSearchQuery('');
                setSelectedLocation('');
                setSelectedCategory('');
                setSelectedProduct('');
                setShowLowStockOnly(false);
              }}>
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Stock Overview</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="reorder">Reorder</TabsTrigger>
        </TabsList>

        {/* Stock Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Current Stock Levels</h3>
            <div className="flex items-center space-x-2">
              <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    Transfer Stock
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Stock Transfer Request</DialogTitle>
                    <DialogDescription>
                      Request to transfer stock between locations
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="transfer-product">Product *</Label>
                      <Select
                        value={transferForm.productId}
                        onValueChange={(value) => setTransferForm({ ...transferForm, productId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} {product.sku && `(${product.sku})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="transfer-quantity">Quantity *</Label>
                      <Input
                        type="number"
                        value={transferForm.quantity}
                        onChange={(e) => setTransferForm({ ...transferForm, quantity: parseInt(e.target.value) || 0 })}
                        placeholder="Enter quantity"
                      />
                    </div>
                    <div>
                      <Label htmlFor="from-location">From Location *</Label>
                      <Select
                        value={transferForm.fromLocationId}
                        onValueChange={(value) => setTransferForm({ ...transferForm, fromLocationId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map(location => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="to-location">To Location *</Label>
                      <Select
                        value={transferForm.toLocationId}
                        onValueChange={(value) => setTransferForm({ ...transferForm, toLocationId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.filter(loc => loc.id !== transferForm.fromLocationId).map(location => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="transfer-reason">Reason *</Label>
                      <Select
                        value={transferForm.transferReason}
                        onValueChange={(value: any) => setTransferForm({ ...transferForm, transferReason: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restock">Restock</SelectItem>
                          <SelectItem value="rebalance">Rebalance</SelectItem>
                          <SelectItem value="customer_request">Customer Request</SelectItem>
                          <SelectItem value="seasonal">Seasonal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="transfer-priority">Priority</Label>
                      <Select
                        value={transferForm.priority}
                        onValueChange={(value: any) => setTransferForm({ ...transferForm, priority: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="transfer-notes">Notes</Label>
                      <Textarea
                        value={transferForm.notes}
                        onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                        placeholder="Optional notes about this transfer"
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleTransferRequest} disabled={loading}>
                      {loading ? 'Creating...' : 'Create Transfer'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Edit3 className="h-4 w-4 mr-2" />
                    Adjust Stock
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Stock Adjustment</DialogTitle>
                    <DialogDescription>
                      Correct stock levels with proper audit trail
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="adj-product">Product *</Label>
                      <Select
                        value={adjustmentForm.productId}
                        onValueChange={(value) => setAdjustmentForm({ ...adjustmentForm, productId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} {product.sku && `(${product.sku})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="adj-location">Location *</Label>
                      <Select
                        value={adjustmentForm.locationId}
                        onValueChange={(value) => setAdjustmentForm({ ...adjustmentForm, locationId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map(location => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="current-stock">Current Stock *</Label>
                      <Input
                        type="number"
                        value={adjustmentForm.currentStock}
                        onChange={(e) => setAdjustmentForm({ ...adjustmentForm, currentStock: parseInt(e.target.value) || 0 })}
                        placeholder="System stock count"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adjusted-stock">Actual Stock *</Label>
                      <Input
                        type="number"
                        value={adjustmentForm.adjustedStock}
                        onChange={(e) => setAdjustmentForm({ ...adjustmentForm, adjustedStock: parseInt(e.target.value) || 0 })}
                        placeholder="Actual counted stock"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="adj-reason">Reason *</Label>
                      <Select
                        value={adjustmentForm.adjustmentReason}
                        onValueChange={(value: any) => setAdjustmentForm({ ...adjustmentForm, adjustmentReason: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="count_correction">Count Correction</SelectItem>
                          <SelectItem value="damaged">Damaged Goods</SelectItem>
                          <SelectItem value="expired">Expired Products</SelectItem>
                          <SelectItem value="theft">Theft/Loss</SelectItem>
                          <SelectItem value="found">Found Stock</SelectItem>
                          <SelectItem value="system_error">System Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="adj-notes">Notes</Label>
                      <Textarea
                        value={adjustmentForm.notes}
                        onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })}
                        placeholder="Explain the adjustment reason"
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAdjustmentDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleStockAdjustment} disabled={loading}>
                      {loading ? 'Creating...' : 'Create Adjustment'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Reserved</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading stock levels...
                      </TableCell>
                    </TableRow>
                  ) : filteredStockLevels.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        No stock levels found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStockLevels.map((stock) => (
                      <TableRow key={stock.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{stock.productName}</div>
                            {stock.sku && <div className="text-sm text-gray-500">{stock.sku}</div>}
                            {stock.variantName && <div className="text-sm text-gray-500">{stock.variantName}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                            {stock.locationName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{stock.availableQuantity.toLocaleString()}</div>
                        </TableCell>
                        <TableCell>
                          {stock.reservedQuantity > 0 && (
                            <Badge variant="secondary">{stock.reservedQuantity.toLocaleString()}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatNGN(stock.totalValue)}</TableCell>
                        <TableCell>
                          {stock.isLowStock ? (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="default">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Good
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(stock.lastUpdated)}</TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40">
                              <div className="grid gap-2">
                                <Button variant="ghost" size="sm" className="justify-start">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Button>
                                <Button variant="ghost" size="sm" className="justify-start">
                                  <Edit3 className="h-4 w-4 mr-2" />
                                  Quick Adjust
                                </Button>
                                <Button variant="ghost" size="sm" className="justify-start">
                                  <ArrowUpDown className="h-4 w-4 mr-2" />
                                  Transfer
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock Movements Tab */}
        <TabsContent value="movements" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Stock Movement History</h3>
            <div className="flex items-center space-x-2">
              <Input
                type="date"
                placeholder="Start date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
              <Input
                type="date"
                placeholder="End date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
              <Button variant="outline" onClick={loadStockMovements}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Load
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Before/After</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Performed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        No stock movements found
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{formatDate(movement.createdAt)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{movement.productName}</div>
                            <div className="text-sm text-gray-500">{movement.movementReason}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                            {movement.locationName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={movement.movementType === 'in' ? 'default' : movement.movementType === 'out' ? 'secondary' : 'outline'}>
                            {movement.movementType === 'in' && <TrendingUp className="h-3 w-3 mr-1" />}
                            {movement.movementType === 'out' && <TrendingDown className="h-3 w-3 mr-1" />}
                            {movement.movementType === 'adjustment' && <Edit3 className="h-3 w-3 mr-1" />}
                            {movement.movementType.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={movement.quantityChanged >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {movement.quantityChanged >= 0 ? '+' : ''}{movement.quantityChanged.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="text-gray-500">{movement.quantityBefore.toLocaleString()}</span>
                            <ArrowRight className="h-3 w-3 inline mx-1" />
                            <span className="font-medium">{movement.quantityAfter.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatNGN(movement.totalValue)}</TableCell>
                        <TableCell>{movement.performedByName || 'System'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock Transfers Tab */}
        <TabsContent value="transfers" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Stock Transfers</h3>
            <Button onClick={() => setShowTransferDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Transfer
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="text-center py-8 text-gray-500">
                <Truck className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h4 className="text-lg font-medium mb-2">Stock Transfer Management</h4>
                <p>Transfer tracking functionality will be implemented here.</p>
                <p className="text-sm mt-2">Create, approve, and track stock transfers between locations.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Low Stock Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Low Stock Alerts</h3>
            <Button variant="outline" onClick={loadLowStockAlerts}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Alerts
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lowStockAlerts.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h4 className="text-lg font-medium mb-2">All Good!</h4>
                <p>No low stock alerts at this time.</p>
              </div>
            ) : (
              lowStockAlerts.map((alert) => (
                <Card key={alert.id} className={`border-l-4 ${
                  alert.severity === 'critical' 
                    ? 'border-l-red-500 bg-red-50' 
                    : alert.severity === 'warning'
                    ? 'border-l-yellow-500 bg-yellow-50'
                    : 'border-l-blue-500 bg-blue-50'
                }`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{alert.productName}</CardTitle>
                      <Badge variant={
                        alert.severity === 'critical' 
                          ? 'destructive' 
                          : alert.severity === 'warning'
                          ? 'default'
                          : 'secondary'
                      }>
                        {alert.severity === 'critical' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {alert.severity === 'warning' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {alert.severity === 'info' && <Info className="h-3 w-3 mr-1" />}
                        {alert.severity.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-1" />
                        {alert.locationName}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Current:</span>
                          <span className="ml-1 font-medium">{alert.currentStock}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Min Level:</span>
                          <span className="ml-1 font-medium">{alert.minStockLevel}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-500">Reorder:</span>
                          <span className="ml-1 font-medium">{alert.recommendedReorderQuantity} units</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t">
                        <Button size="sm" className="w-full">
                          <ShoppingCart className="h-3 w-3 mr-1" />
                          Reorder Now
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Reorder Suggestions Tab */}
        <TabsContent value="reorder" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Reorder Suggestions</h3>
            <Button variant="outline" onClick={loadReorderSuggestions}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Suggestions
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Suggested Quantity</TableHead>
                    <TableHead>Est. Cost</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Avg Daily Sales</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderSuggestions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        No reorder suggestions at this time
                      </TableCell>
                    </TableRow>
                  ) : (
                    reorderSuggestions.map((suggestion) => (
                      <TableRow key={suggestion.id}>
                        <TableCell>
                          <div className="font-medium">{suggestion.productName}</div>
                        </TableCell>
                        <TableCell>{suggestion.locationId}</TableCell>
                        <TableCell>
                          <span className={suggestion.currentStock <= 0 ? 'text-red-600 font-medium' : ''}>
                            {suggestion.currentStock.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{suggestion.recommendedQuantity.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>{formatNGN(suggestion.estimatedCost)}</TableCell>
                        <TableCell>
                          <Badge variant={
                            suggestion.priority === 'critical' 
                              ? 'destructive' 
                              : suggestion.priority === 'urgent'
                              ? 'default'
                              : 'secondary'
                          }>
                            {suggestion.priority === 'critical' && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {suggestion.priority.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{suggestion.avgDailySales.toFixed(1)} /day</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button size="sm" variant="outline">
                              <ShoppingCart className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost">
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InventoryTrackingCell;