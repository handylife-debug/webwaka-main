import { getAllEnhancedSubdomains } from '@/lib/enhanced-subdomains';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe, Plus, Users, Calendar, Activity } from 'lucide-react';
import Link from 'next/link';
import { rootDomain } from '@/lib/utils';
import { TenantDataTable } from '@/components/admin/tenant-data-table';
import { TenantManagementClient } from './tenant-management-client';

export const metadata: Metadata = {
  title: `Tenant Management | ${rootDomain}`,
  description: `Comprehensive tenant management for ${rootDomain}`
};

export default async function TenantsPage() {
  let tenants: Awaited<ReturnType<typeof getAllEnhancedSubdomains>> = [];
  let error: string | null = null;

  try {
    tenants = await getAllEnhancedSubdomains();
  } catch (err) {
    console.error('Error fetching tenants:', err);
    error = 'Failed to load tenant data. Please check your database connection.';
    tenants = [];
  }

  // Calculate stats
  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'Active').length,
    suspended: tenants.filter(t => t.status === 'Suspended').length,
    thisMonth: tenants.filter(t => {
      const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return t.createdAt > monthAgo;
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
          <p className="text-gray-600 mt-1">
            Comprehensive management of all tenants and their configurations across your platform.
          </p>
        </div>
        <Link href="/">
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Tenant
          </Button>
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">Database Error</h3>
              <div className="text-sm mt-1">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Globe className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All subdomains</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Active tenants</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <Users className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.suspended}</div>
            <p className="text-xs text-muted-foreground">Suspended tenants</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created This Month</CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisMonth}</div>
            <p className="text-xs text-muted-foreground">New this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TenantManagementClient tenants={tenants} />
        </CardContent>
      </Card>
    </div>
  );
}