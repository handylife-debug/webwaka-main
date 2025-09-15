'use client';

import { useState } from 'react';
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
import { 
  MoreHorizontal, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Settings,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { EnhancedTenant, TenantStatus } from '@/lib/enhanced-subdomains';
import { protocol, rootDomain } from '@/lib/utils';

interface TenantDataTableProps {
  tenants: EnhancedTenant[];
  onStatusChange?: (subdomain: string, status: TenantStatus) => Promise<void>;
  onViewDetails?: (tenant: EnhancedTenant) => void;
  onConfigureFeatures?: (tenant: EnhancedTenant) => void;
}

function getStatusColor(status: TenantStatus): string {
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
}

function getPlanColor(plan: string): string {
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
}

export function TenantDataTable({ tenants, onStatusChange, onViewDetails, onConfigureFeatures }: TenantDataTableProps) {
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const handleStatusChange = async (subdomain: string, status: TenantStatus) => {
    if (!onStatusChange) return;
    
    setLoadingActions(prev => ({ ...prev, [subdomain]: true }));
    try {
      await onStatusChange(subdomain, status);
    } finally {
      setLoadingActions(prev => ({ ...prev, [subdomain]: false }));
    }
  };

  const handleViewDetails = (subdomain: string) => {
    const tenant = tenants.find(t => t.subdomain === subdomain);
    if (tenant && onViewDetails) {
      onViewDetails(tenant);
    }
  };

  const handleConfigureFeatures = (subdomain: string) => {
    const tenant = tenants.find(t => t.subdomain === subdomain);
    if (tenant && onConfigureFeatures) {
      onConfigureFeatures(tenant);
    }
  };

  if (tenants.length === 0) {
    return (
      <div className="rounded-md border">
        <div className="p-8 text-center">
          <div className="text-gray-500 text-sm">No tenants found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Icon</TableHead>
            <TableHead>Tenant Name</TableHead>
            <TableHead>Subdomain</TableHead>
            <TableHead>Subscription Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.subdomain}>
              <TableCell className="font-medium">
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
                      onClick={() => handleViewDetails(tenant.subdomain)}
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
                      onClick={() => handleConfigureFeatures(tenant.subdomain)}
                      className="flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Configure Features
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}