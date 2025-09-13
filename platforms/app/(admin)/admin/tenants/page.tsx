import { getAllSubdomains } from '@/lib/subdomains';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe, Plus, Users, Calendar } from 'lucide-react';
import Link from 'next/link';
import { rootDomain, protocol } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Tenant Management | ${rootDomain}`,
  description: `Manage all tenants for ${rootDomain}`
};

export default async function TenantsPage() {
  const tenants = await getAllSubdomains();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
          <p className="text-gray-600 mt-1">
            Manage all tenants and their configurations across your platform.
          </p>
        </div>
        <Link href="/">
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Tenant
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Globe className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">Active subdomains</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,247</div>
            <p className="text-xs text-muted-foreground">Across all tenants</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created This Month</CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">New this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant List */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tenants found</h3>
              <p className="text-gray-500 mb-4">Create your first tenant to get started.</p>
              <Link href="/">
                <Button>Create First Tenant</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {tenants.map((tenant) => (
                <div
                  key={tenant.subdomain}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">{tenant.emoji}</div>
                    <div>
                      <h3 className="font-medium">{tenant.subdomain}</h3>
                      <p className="text-sm text-gray-500">
                        {tenant.subdomain}.{rootDomain}
                      </p>
                      <p className="text-xs text-gray-400">
                        Created: {new Date(tenant.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`${protocol}://${tenant.subdomain}.${rootDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Visit Site
                    </a>
                    <Button variant="outline" size="sm">
                      Manage
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}