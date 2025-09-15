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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { 
  Building2, 
  Warehouse, 
  Store, 
  Globe,
  TrendingUp, 
  TrendingDown, 
  Package,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Download,
  Search,
  Filter,
  MapPin,
  Users,
  DollarSign,
  BarChart3,
  Activity,
  Truck,
  ClipboardCheck,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
  Eye,
  Settings,
  Calendar,
  Target
} from 'lucide-react';

interface LocationOverview {
  locationId: string;
  locationCode: string;
  locationName: string;
  locationType: 'store' | 'warehouse' | 'outlet' | 'online';
  address: string;
  city: string;
  state: string;
  country: string;
  managerName: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  isDefault: boolean;
  totalProducts: number;
  totalStockValue: number;
  lowStockItems: number;
  averageStockTurnover: number;
  monthlyRevenue: number;
  monthlyTransactions: number;
  lastStockUpdate: string;
  lastAuditDate?: string;
  pendingTransfers: number;
  criticalAlerts: number;
  timezone: string;
  operatingHours: {
    open: string;
    close: string;
    isOpen: boolean;
  };
  staffCount: number;
  managerContact: string;
  lastManagerLogin?: string;
}

interface InventoryDistribution {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  totalStockAcrossLocations: number;
  averageCostPerUnit: number;
  totalValue: number;
  locationBreakdown: {
    locationId: string;
    locationName: string;
    currentStock: number;
    reservedStock: number;
    availableStock: number;
    costPerUnit: number;
    lastMovementDate: string;
    stockStatus: 'healthy' | 'low' | 'critical' | 'overstock';
    reorderPoint: number;
    maxStock: number;
  }[];
  demandPattern: 'high' | 'medium' | 'low';
  stockDistributionScore: number;
  rebalancingRecommendation?: {
    fromLocation: string;
    toLocation: string;
    quantity: number;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  };
}

interface TransferRequest {
  transferId: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  productId: string;
  productName: string;
  sku: string;
  requestedQuantity: number;
  approvedQuantity?: number;
  requestReason: 'stockout' | 'rebalancing' | 'seasonal' | 'promotion' | 'audit' | 'customer_request';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled' | 'rejected';
  requestedAt: string;
  approvedAt?: string;
  shippedAt?: string;
  completedAt?: string;
  estimatedArrival?: string;
  requestedBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  trackingNumber?: string;
  shippingCost?: number;
  notes?: string;
  impactAnalysis: {
    fromLocationStockAfter: number;
    toLocationStockAfter: number;
    criticalityScore: number;
    businessImpact: string;
  };
}

interface LocationPerformance {
  performancePeriod: string;
  locationComparison: {
    locationId: string;
    locationName: string;
    locationType: string;
    revenue: number;
    revenueGrowth: number;
    transactionCount: number;
    averageTransactionValue: number;
    customersServed: number;
    stockTurnoverRate: number;
    stockAccuracy: number;
    stockoutIncidents: number;
    overstockValue: number;
    transferRequestsSent: number;
    transferRequestsReceived: number;
    transferCompletionRate: number;
    auditComplianceScore: number;
    grossMargin: number;
    operatingCosts: number;
    profitMargin: number;
    overallRank: number;
    topPerformingCategories: string[];
    improvementAreas: string[];
  }[];
  totalRevenue: number;
  bestPerformingLocation: string;
  worstPerformingLocation: string;
  averagePerformanceScore: number;
  insights: {
    type: 'opportunity' | 'risk' | 'optimization';
    title: string;
    description: string;
    locations: string[];
    actionItems: string[];
    expectedImpact: string;
  }[];
}

interface MultiLocationManagementCellProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onLocationSelect?: (locationId: string) => void;
  onTransferCreate?: (transfer: Partial<TransferRequest>) => void;
  onAuditInitiate?: (auditParams: any) => void;
}

export function MultiLocationManagementCell({ 
  isOpen, 
  onClose, 
  tenantId,
  onLocationSelect,
  onTransferCreate,
  onAuditInitiate
}: MultiLocationManagementCellProps) {
  const [locationOverview, setLocationOverview] = useState<LocationOverview[]>([]);
  const [inventoryDistribution, setInventoryDistribution] = useState<InventoryDistribution[]>([]);
  const [transferRequests, setTransferRequests] = useState<TransferRequest[]>([]);
  const [locationPerformance, setLocationPerformance] = useState<LocationPerformance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Filters and controls
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');
  const [selectedTransferStatus, setSelectedTransferStatus] = useState('all');
  const [selectedLocationType, setSelectedLocationType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showCreateTransfer, setShowCreateTransfer] = useState(false);

  // Load multi-location data
  const loadLocationData = async () => {
    setIsLoading(true);
    try {
      const [overviewRes, inventoryRes, transfersRes, performanceRes] = await Promise.all([
        fetch(`/api/location/overview?tenantId=${tenantId}&locationId=${selectedLocationFilter !== 'all' ? selectedLocationFilter : ''}`),
        fetch(`/api/location/inventory-distribution?tenantId=${tenantId}`),
        fetch(`/api/location/transfer-requests?tenantId=${tenantId}&status=${selectedTransferStatus !== 'all' ? selectedTransferStatus : ''}`),
        fetch(`/api/location/performance-analysis?tenantId=${tenantId}&timeRange=30d`)
      ]);

      const [overview, inventory, transfers, performance] = await Promise.all([
        overviewRes.json(),
        inventoryRes.json(),
        transfersRes.json(),
        performanceRes.json()
      ]);

      setLocationOverview(overview);
      setInventoryDistribution(inventory);
      setTransferRequests(transfers);
      setLocationPerformance(performance);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load multi-location data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (isOpen && autoRefresh) {
      loadLocationData();
      const interval = setInterval(loadLocationData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, tenantId, selectedLocationFilter, selectedTransferStatus, autoRefresh]);

  // Filter data
  const filteredLocations = locationOverview.filter(location => {
    const matchesSearch = searchTerm === '' || 
      location.locationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.locationCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.city.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = selectedLocationType === 'all' || location.locationType === selectedLocationType;
    
    return matchesSearch && matchesType;
  });

  const getLocationTypeIcon = (type: string) => {
    switch (type) {
      case 'store': return <Store className="h-5 w-5" />;
      case 'warehouse': return <Warehouse className="h-5 w-5" />;
      case 'outlet': return <Building2 className="h-5 w-5" />;
      case 'online': return <Globe className="h-5 w-5" />;
      default: return <Building2 className="h-5 w-5" />;
    }
  };

  const getLocationTypeColor = (type: string) => {
    switch (type) {
      case 'store': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'warehouse': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'outlet': return 'bg-green-100 text-green-800 border-green-200';
      case 'online': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_transit': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100 text-green-800 border-green-200';
      case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'overstock': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTrendIcon = (value: number) => {
    if (value > 5) return <ArrowUp className="h-4 w-4 text-green-600" />;
    if (value < -5) return <ArrowDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const exportLocationData = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      tenantId,
      locationOverview: filteredLocations,
      inventoryDistribution,
      transferRequests,
      locationPerformance
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multi-location-report-${tenantId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTransferApproval = async (transferId: string, action: 'approve' | 'reject', reason?: string) => {
    try {
      await fetch('/api/location/transfer-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          transferId,
          action,
          approvedBy: 'current-user',
          rejectionReason: reason
        })
      });
      loadLocationData(); // Refresh data
    } catch (error) {
      console.error('Failed to process transfer approval:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-600" />
              <span>Multi-Location Management</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {autoRefresh && <Activity className="h-3 w-3 mr-1" />}
              Centralized Control
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Header Controls */}
        <div className="flex items-center justify-between py-4 border-b">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
              <Select value={selectedLocationType} onValueChange={setSelectedLocationType}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Location Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="store">Stores</SelectItem>
                  <SelectItem value="warehouse">Warehouses</SelectItem>
                  <SelectItem value="outlet">Outlets</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedTransferStatus} onValueChange={setSelectedTransferStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Transfer Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transfers</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {lastUpdated && (
              <div className="text-sm text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreateTransfer(true)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              New Transfer
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadLocationData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportLocationData}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <Tabs defaultValue="locations" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="locations" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Locations ({filteredLocations.length})
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Inventory ({inventoryDistribution.length})
            </TabsTrigger>
            <TabsTrigger value="transfers" className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Transfers ({transferRequests.length})
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Locations Overview Tab */}
          <TabsContent value="locations" className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2">Loading location data...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-blue-500" />
                        <div>
                          <div className="text-2xl font-bold">{filteredLocations.length}</div>
                          <div className="text-sm text-gray-600">Total Locations</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-500" />
                        <div>
                          <div className="text-2xl font-bold">
                            ${(filteredLocations.reduce((sum, l) => sum + l.totalStockValue, 0)).toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-600">Total Stock Value</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        <div>
                          <div className="text-2xl font-bold">
                            {filteredLocations.reduce((sum, l) => sum + l.lowStockItems, 0)}
                          </div>
                          <div className="text-sm text-gray-600">Low Stock Items</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5 text-purple-500" />
                        <div>
                          <div className="text-2xl font-bold">
                            {filteredLocations.reduce((sum, l) => sum + l.pendingTransfers, 0)}
                          </div>
                          <div className="text-sm text-gray-600">Pending Transfers</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Location Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredLocations.map((location) => (
                    <Card key={location.locationId} className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => onLocationSelect?.(location.locationId)}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            {getLocationTypeIcon(location.locationType)}
                            <div>
                              <CardTitle className="text-lg">{location.locationName}</CardTitle>
                              <div className="text-sm text-gray-500">{location.locationCode}</div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Badge className={getLocationTypeColor(location.locationType)}>
                              {location.locationType.toUpperCase()}
                            </Badge>
                            {location.isDefault && (
                              <Badge variant="outline" className="text-xs">DEFAULT</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="h-4 w-4" />
                            <span>{location.city}, {location.state}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-600">Stock Value</div>
                              <div className="font-semibold">${location.totalStockValue.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600">Products</div>
                              <div className="font-semibold">{location.totalProducts}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600">Monthly Revenue</div>
                              <div className="font-semibold">${location.monthlyRevenue.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600">Transactions</div>
                              <div className="font-semibold">{location.monthlyTransactions}</div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-500" />
                              <span className="text-sm">{location.managerName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${location.operatingHours.isOpen ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className="text-xs text-gray-500">
                                {location.operatingHours.isOpen ? 'Open' : 'Closed'}
                              </span>
                            </div>
                          </div>

                          {(location.lowStockItems > 0 || location.criticalAlerts > 0) && (
                            <div className="pt-2 border-t">
                              <div className="flex items-center gap-4 text-sm">
                                {location.lowStockItems > 0 && (
                                  <div className="flex items-center gap-1 text-yellow-600">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{location.lowStockItems} low stock</span>
                                  </div>
                                )}
                                {location.criticalAlerts > 0 && (
                                  <div className="flex items-center gap-1 text-red-600">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{location.criticalAlerts} alerts</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Inventory Distribution Tab */}
          <TabsContent value="inventory" className="space-y-4">
            <div className="space-y-4">
              {inventoryDistribution.slice(0, 20).map((item) => (
                <Card key={item.productId}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Package className="h-5 w-5" />
                        <div>
                          <span>{item.productName}</span>
                          <div className="text-sm text-gray-500 font-normal">{item.sku} • {item.category}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {item.totalStockAcrossLocations} units
                        </Badge>
                        <Badge className={
                          item.demandPattern === 'high' ? 'bg-red-100 text-red-800' :
                          item.demandPattern === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }>
                          {item.demandPattern.toUpperCase()} DEMAND
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-gray-600">Total Value</div>
                          <div className="text-lg font-semibold">${item.totalValue.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Avg Cost/Unit</div>
                          <div className="text-lg font-semibold">${item.averageCostPerUnit.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Distribution Score</div>
                          <div className="text-lg font-semibold">{item.stockDistributionScore}%</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm text-gray-600 mb-2">Stock by Location:</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {item.locationBreakdown.map((breakdown) => (
                            <div key={breakdown.locationId} className="p-3 border rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm">{breakdown.locationName}</span>
                                <Badge className={getStockStatusColor(breakdown.stockStatus)}>
                                  {breakdown.stockStatus.toUpperCase()}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Current:</span>
                                  <span className="ml-1 font-medium">{breakdown.currentStock}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Available:</span>
                                  <span className="ml-1 font-medium">{breakdown.availableStock}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Reserved:</span>
                                  <span className="ml-1 font-medium">{breakdown.reservedStock}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Cost:</span>
                                  <span className="ml-1 font-medium">${breakdown.costPerUnit}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {item.rebalancingRecommendation && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-blue-800">Rebalancing Recommendation</span>
                            <Badge className={getPriorityColor(item.rebalancingRecommendation.priority)}>
                              {item.rebalancingRecommendation.priority.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-sm text-blue-700">
                            Transfer {item.rebalancingRecommendation.quantity} units from{' '}
                            <span className="font-medium">{item.rebalancingRecommendation.fromLocation}</span> to{' '}
                            <span className="font-medium">{item.rebalancingRecommendation.toLocation}</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">
                            {item.rebalancingRecommendation.reason}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Transfer Requests Tab */}
          <TabsContent value="transfers" className="space-y-4">
            <div className="space-y-4">
              {transferRequests.slice(0, 15).map((transfer) => (
                <Card key={transfer.transferId}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold">{transfer.productName}</h4>
                          <Badge variant="outline">{transfer.sku}</Badge>
                          <Badge className={getStatusColor(transfer.status)}>
                            {transfer.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <Badge className={getPriorityColor(transfer.priority)}>
                            {transfer.priority.toUpperCase()}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <div className="text-sm text-gray-600">From</div>
                            <div className="font-medium">{transfer.fromLocationName}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">To</div>
                            <div className="font-medium">{transfer.toLocationName}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">Quantity</div>
                            <div className="font-medium">
                              {transfer.requestedQuantity} 
                              {transfer.approvedQuantity && transfer.approvedQuantity !== transfer.requestedQuantity && 
                                ` (${transfer.approvedQuantity} approved)`
                              }
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">Requested</div>
                            <div className="font-medium">{new Date(transfer.requestedAt).toLocaleDateString()}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mb-3">
                          <div className="text-sm">
                            <span className="text-gray-600">Reason:</span>
                            <span className="ml-1 font-medium capitalize">{transfer.requestReason.replace('_', ' ')}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">Requested by:</span>
                            <span className="ml-1 font-medium">{transfer.requestedBy}</span>
                          </div>
                          {transfer.trackingNumber && (
                            <div className="text-sm">
                              <span className="text-gray-600">Tracking:</span>
                              <span className="ml-1 font-medium">{transfer.trackingNumber}</span>
                            </div>
                          )}
                        </div>

                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-600 mb-1">Impact Analysis:</div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Criticality Score:</span>
                              <span className="ml-1 font-medium">{transfer.impactAnalysis.criticalityScore}%</span>
                            </div>
                            <div>
                              <span className="text-gray-500">From Stock After:</span>
                              <span className="ml-1 font-medium">{transfer.impactAnalysis.fromLocationStockAfter}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">To Stock After:</span>
                              <span className="ml-1 font-medium">{transfer.impactAnalysis.toLocationStockAfter}</span>
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 mt-2">{transfer.impactAnalysis.businessImpact}</div>
                        </div>

                        {transfer.rejectionReason && (
                          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            <span className="font-medium">Rejection Reason:</span> {transfer.rejectionReason}
                          </div>
                        )}
                      </div>
                      
                      {transfer.status === 'pending' && (
                        <div className="flex flex-col gap-2 ml-4">
                          <Button 
                            size="sm" 
                            onClick={() => handleTransferApproval(transfer.transferId, 'approve')}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleTransferApproval(transfer.transferId, 'reject', 'Not approved')}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-4">
            {locationPerformance && (
              <div className="space-y-6">
                {/* Performance Summary */}
                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        ${locationPerformance.totalRevenue.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Total Revenue</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {locationPerformance.averagePerformanceScore.toFixed(0)}%
                      </div>
                      <div className="text-sm text-gray-600">Avg Performance</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-lg font-bold text-purple-600">
                        {locationPerformance.bestPerformingLocation}
                      </div>
                      <div className="text-sm text-gray-600">Top Performer</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-lg font-bold text-orange-600">
                        {locationPerformance.worstPerformingLocation}
                      </div>
                      <div className="text-sm text-gray-600">Needs Attention</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Location Performance Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle>Location Performance Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {locationPerformance.locationComparison.map((location) => (
                        <div key={location.locationId} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold">{location.locationName}</span>
                              <Badge className={getLocationTypeColor(location.locationType)}>
                                {location.locationType.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">#{location.overallRank}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {getTrendIcon(location.revenueGrowth)}
                              <span className="text-sm font-medium">
                                {location.revenueGrowth > 0 ? '+' : ''}{location.revenueGrowth.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                            <div>
                              <div className="text-gray-500">Revenue</div>
                              <div className="font-medium">${location.revenue.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Transactions</div>
                              <div className="font-medium">{location.transactionCount.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Avg Transaction</div>
                              <div className="font-medium">${location.averageTransactionValue.toFixed(0)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Stock Turnover</div>
                              <div className="font-medium">{location.stockTurnoverRate.toFixed(1)}x</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Stock Accuracy</div>
                              <div className="font-medium">{location.stockAccuracy.toFixed(1)}%</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Profit Margin</div>
                              <div className="font-medium">{location.profitMargin.toFixed(1)}%</div>
                            </div>
                          </div>

                          {location.topPerformingCategories.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Top Categories:</span>
                                {location.topPerformingCategories.map((category, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {category}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Insights */}
                {locationPerformance.insights.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {locationPerformance.insights.map((insight, idx) => (
                          <div key={idx} className={`p-4 rounded-lg border ${
                            insight.type === 'opportunity' ? 'bg-green-50 border-green-200' :
                            insight.type === 'risk' ? 'bg-red-50 border-red-200' :
                            'bg-blue-50 border-blue-200'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={
                                insight.type === 'opportunity' ? 'bg-green-100 text-green-800' :
                                insight.type === 'risk' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }>
                                {insight.type.toUpperCase()}
                              </Badge>
                              <span className="font-semibold">{insight.title}</span>
                            </div>
                            <p className="text-sm text-gray-700 mb-3">{insight.description}</p>
                            <div className="mb-3">
                              <div className="text-sm font-medium mb-1">Affected Locations:</div>
                              <div className="flex flex-wrap gap-1">
                                {insight.locations.map((location, locIdx) => (
                                  <Badge key={locIdx} variant="outline" className="text-xs">
                                    {location}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="mb-3">
                              <div className="text-sm font-medium mb-1">Action Items:</div>
                              <ul className="text-sm space-y-1">
                                {insight.actionItems.map((item, itemIdx) => (
                                  <li key={itemIdx} className="flex items-start gap-2">
                                    <span className="text-gray-400 mt-1">•</span>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">Expected Impact:</span> {insight.expectedImpact}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="text-center py-8">
              <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Advanced Analytics</h3>
              <p className="text-gray-600 mb-4">
                Comprehensive cross-location analytics including optimization recommendations,
                demand forecasting, and operational efficiency metrics.
              </p>
              <Button variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Generate Analytics Report
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}