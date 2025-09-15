'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Loader2, Users, Globe, BarChart3, Shield } from 'lucide-react';
import Link from 'next/link';
import { deleteSubdomainAction } from '@/app/actions';
import { rootDomain, protocol } from '@/lib/utils';

type Tenant = {
  subdomain: string;
  emoji: string;
  createdAt: number;
};

type DeleteState = {
  error?: string;
  success?: string;
};

function StatsCards({ tenantCount }: { tenantCount: number }) {
  const stats = [
    {
      title: 'Total Tenants',
      value: tenantCount.toString(),
      icon: Globe,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      title: 'Active Users',
      value: '1,247',
      icon: Users,
      color: 'text-green-600 bg-green-100',
    },
    {
      title: 'Monthly Revenue',
      value: '$12,847',
      icon: BarChart3,
      color: 'text-purple-600 bg-purple-100',
    },
    {
      title: 'Security Status',
      value: 'Secured',
      icon: Shield,
      color: 'text-emerald-600 bg-emerald-100',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TenantGrid({
  tenants,
  action,
  isPending
}: {
  tenants: Tenant[];
  action: (formData: FormData) => void;
  isPending: boolean;
}) {
  if (tenants.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenants yet</h3>
          <p className="text-gray-500 mb-4">Start building your multi-tenant empire by creating your first subdomain.</p>
          <Link href="/">
            <Button>Create First Tenant</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tenant Management</h3>
        <p className="text-sm text-gray-500">{tenants.length} total tenants</p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tenants.map((tenant) => (
          <Card key={tenant.subdomain} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{tenant.emoji}</div>
                  <div>
                    <CardTitle className="text-lg">{tenant.subdomain}</CardTitle>
                    <p className="text-sm text-gray-500">
                      {tenant.subdomain}.{rootDomain}
                    </p>
                  </div>
                </div>
                <form action={action}>
                  <input
                    type="hidden"
                    name="subdomain"
                    value={tenant.subdomain}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="submit"
                    disabled={isPending}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Created: {new Date(tenant.createdAt).toLocaleDateString()}
                </span>
                <a
                  href={`${protocol}://${tenant.subdomain}.${rootDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Visit →
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AdminDashboard({ tenants }: { tenants: Tenant[] }) {
  const [state, action, isPending] = useActionState<DeleteState, FormData>(
    deleteSubdomainAction,
    {}
  );

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <StatsCards tenantCount={tenants.length} />
      
      {/* Tenant Management */}
      <TenantGrid tenants={tenants} action={action} isPending={isPending} />

      {/* Notifications */}
      {state.error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg shadow-lg">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">Error</h3>
              <div className="text-sm mt-1">{state.error}</div>
            </div>
          </div>
        </div>
      )}

      {state.success && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg shadow-lg">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">Success</h3>
              <div className="text-sm mt-1">{state.success}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}