'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { 
  MoreHorizontal, 
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye, 
  CheckCircle, 
  XCircle, 
  Settings,
  ExternalLink,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { EnhancedTenant, TenantStatus } from '@/lib/enhanced-subdomains';
import { protocol, rootDomain } from '@/lib/utils';

interface TenantTableEnhancedProps {
  tenants: EnhancedTenant[];
  onStatusChange?: (subdomain: string, status: TenantStatus) => Promise<void>;
  onViewDetails?: (tenant: EnhancedTenant) => void;
  onConfigureFeatures?: (tenant: EnhancedTenant) => void;
  onBulkAction?: (action: string, tenantIds: string[]) => Promise<void>;
}

type SortField = 'tenantName' | 'subdomain' | 'subscriptionPlan' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface FilterConfig {
  search: string;
  status: string;
  plan: string;
  dateRange: string;
}

export function TenantTableEnhancedCell({ 
  tenants, 
  onStatusChange, 
  onViewDetails,
  onConfigureFeatures,
  onBulkAction 
}: TenantTableEnhancedProps) {
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState<FilterConfig>({
    search: '',
    status: 'all',
    plan: 'all',
    dateRange: 'all'
  });

  // Get unique values for filters
  const uniqueStatuses = useMemo(() => 
    Array.from(new Set(tenants.map(t => t.status))), [tenants]
  );
  const uniquePlans = useMemo(() => 
    Array.from(new Set(tenants.map(t => t.subscriptionPlan))), [tenants]
  );

  // Filter and sort tenants
  const filteredAndSortedTenants = useMemo(() => {
    let filtered = tenants.filter(tenant => {
      const matchesSearch = 
        tenant.tenantName.toLowerCase().includes(filters.search.toLowerCase()) ||
        tenant.subdomain.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesStatus = filters.status === 'all' || tenant.status === filters.status;
      const matchesPlan = filters.plan === 'all' || tenant.subscriptionPlan === filters.plan;
      
      let matchesDate = true;
      if (filters.dateRange !== 'all') {
        const now = Date.now();
        const tenantDate = tenant.createdAt;
        switch (filters.dateRange) {
          case 'today':
            matchesDate = now - tenantDate < 24 * 60 * 60 * 1000;
            break;
          case 'week':
            matchesDate = now - tenantDate < 7 * 24 * 60 * 60 * 1000;
            break;
          case 'month':
            matchesDate = now - tenantDate < 30 * 24 * 60 * 60 * 1000;
            break;
        }
      }

      return matchesSearch && matchesStatus && matchesPlan && matchesDate;
    });

    // Sort filtered results
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'tenantName':
          aValue = a.tenantName.toLowerCase();
          bValue = b.tenantName.toLowerCase();
          break;
        case 'subdomain':
          aValue = a.subdomain.toLowerCase();
          bValue = b.subdomain.toLowerCase();
          break;
        case 'subscriptionPlan':
          aValue = a.subscriptionPlan;
          bValue = b.subscriptionPlan;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [tenants, filters, sortField, sortDirection]);

  // Paginate results
  const paginatedTenants = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedTenants.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedTenants, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSortedTenants.length / pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const handleStatusChange = async (subdomain: string, status: TenantStatus) => {
    if (!onStatusChange) return;
    
    setLoadingActions(prev => ({ ...prev, [subdomain]: true }));
    try {
      await onStatusChange(subdomain, status);
    } finally {
      setLoadingActions(prev => ({ ...prev, [subdomain]: false }));
    }
  };

  const handleBulkStatusChange = async (status: TenantStatus) => {
    if (!onBulkAction || selectedTenants.size === 0) return;
    
    const tenantIds = Array.from(selectedTenants);
    try {
      await onBulkAction('updateStatus', tenantIds);
      setSelectedTenants(new Set());
    } catch (error) {
      console.error('Bulk action failed:', error);
    }
  };

  const handleSelectAll = () => {
    if (selectedTenants.size === paginatedTenants.length) {
      setSelectedTenants(new Set());
    } else {
      setSelectedTenants(new Set(paginatedTenants.map(t => t.subdomain)));
    }
  };

  const handleExport = () => {
    const csvContent = [
      ['Tenant Name', 'Subdomain', 'Plan', 'Status', 'Created', 'Last Active'],
      ...filteredAndSortedTenants.map(tenant => [
        tenant.tenantName,
        tenant.subdomain,
        tenant.subscriptionPlan,
        tenant.status,
        new Date(tenant.createdAt).toLocaleDateString(),
        tenant.lastActive ? new Date(tenant.lastActive).toLocaleDateString() : 'Never'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: TenantStatus): string => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Suspended':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Inactive':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPlanColor = (plan: string): string => {
    switch (plan) {
      case 'Enterprise':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Pro':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Free':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search tenants..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10"
            />
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 border rounded-md bg-white"
          >
            <option value="all">All Status</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          
          <select
            value={filters.plan}
            onChange={(e) => setFilters(prev => ({ ...prev, plan: e.target.value }))}
            className="px-3 py-2 border rounded-md bg-white"
          >
            <option value="all">All Plans</option>
            {uniquePlans.map(plan => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedTenants.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-md border border-blue-200">
          <span className="text-sm text-blue-800">
            {selectedTenants.size} tenant(s) selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => handleBulkStatusChange('Active')}
            >
              Activate
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => handleBulkStatusChange('Suspended')}
            >
              Suspend
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelectedTenants(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={selectedTenants.size === paginatedTenants.length && paginatedTenants.length > 0}
                  onChange={handleSelectAll}
                  className="rounded"
                />
              </TableHead>
              <TableHead className="w-16">Icon</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('tenantName')} className="h-auto p-0 font-semibold">
                  Tenant Name {getSortIcon('tenantName')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('subdomain')} className="h-auto p-0 font-semibold">
                  Subdomain {getSortIcon('subdomain')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('subscriptionPlan')} className="h-auto p-0 font-semibold">
                  Plan {getSortIcon('subscriptionPlan')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('status')} className="h-auto p-0 font-semibold">
                  Status {getSortIcon('status')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('createdAt')} className="h-auto p-0 font-semibold">
                  Created {getSortIcon('createdAt')}
                </Button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="text-gray-500">
                    {filteredAndSortedTenants.length === 0 
                      ? "No tenants match your search criteria" 
                      : "No tenants to display"
                    }
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedTenants.map((tenant) => (
                <TableRow key={tenant.subdomain} className="hover:bg-gray-50">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedTenants.has(tenant.subdomain)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedTenants);
                        if (e.target.checked) {
                          newSelected.add(tenant.subdomain);
                        } else {
                          newSelected.delete(tenant.subdomain);
                        }
                        setSelectedTenants(newSelected);
                      }}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="text-2xl">{tenant.emoji}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{tenant.tenantName}</div>
                    <div className="text-sm text-gray-500">
                      {tenant.subdomain}.{rootDomain}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                        {tenant.subdomain}
                      </code>
                      <a
                        href={`${protocol}://${tenant.subdomain}.${rootDomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                        title="Visit site"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getPlanColor(tenant.subscriptionPlan)}>
                      {tenant.subscriptionPlan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(tenant.status)}>
                      {tenant.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          {loadingActions[tenant.subdomain] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px]">
                        <DropdownMenuItem
                          onClick={() => onViewDetails?.(tenant)}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        
                        {tenant.status !== 'Active' && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(tenant.subdomain, 'Active')}
                            className="flex items-center gap-2 text-green-600"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Activate Tenant
                          </DropdownMenuItem>
                        )}
                        
                        {tenant.status !== 'Suspended' && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(tenant.subdomain, 'Suspended')}
                            className="flex items-center gap-2 text-red-600"
                          >
                            <XCircle className="h-4 w-4" />
                            Suspend Tenant
                          </DropdownMenuItem>
                        )}
                        
                        <DropdownMenuItem
                          onClick={() => onConfigureFeatures?.(tenant)}
                          className="flex items-center gap-2"
                        >
                          <Settings className="h-4 w-4" />
                          Configure Features
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredAndSortedTenants.length)} of {filteredAndSortedTenants.length} results
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}