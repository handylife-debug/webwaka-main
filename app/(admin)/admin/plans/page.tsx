import { getAllPlans, getPlansStats, initializePlansTables } from '@/lib/plans-management';
import { getCurrentUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, DollarSign, TrendingUp, Users } from 'lucide-react';
import { PlansManagementClient } from './plans-management-client';

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:5000';

export const metadata: Metadata = {
  title: `Pricing & Plans | ${rootDomain}`,
  description: `Manage subscription plans and pricing for ${rootDomain}`
};

export default async function PlansPage() {
  // Check if user has SuperAdmin permissions
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'SuperAdmin') {
    redirect('/admin?error=insufficient_permissions');
  }

  let plans: Awaited<ReturnType<typeof getAllPlans>> = [];
  let stats: Awaited<ReturnType<typeof getPlansStats>> = { total: 0, active: 0, inactive: 0, totalRevenue: 0 };
  let error: string | null = null;

  try {
    // Initialize database tables first
    await initializePlansTables();
    
    // Fetch plans and stats
    [plans, stats] = await Promise.all([
      getAllPlans(),
      getPlansStats(),
    ]);
  } catch (err) {
    console.error('Error fetching plans data:', err);
    error = 'Failed to load plans data. Please check your database connection.';
    plans = [];
    stats = { total: 0, active: 0, inactive: 0, totalRevenue: 0 };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pricing & Plans</h2>
          <p className="text-gray-600 mt-1">
            Create and manage subscription plans with pricing in NGN and feature limits.
          </p>
        </div>
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
            <CardTitle className="text-sm font-medium">Total Plans</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All subscription plans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Plans</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Available to customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Plans</CardTitle>
            <Users className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground">Temporarily disabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Potential</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Monthly (all active plans)</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Plans Management</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <PlansManagementClient 
            plans={plans} 
            currentUser={currentUser}
          />
        </CardContent>
      </Card>
    </div>
  );
}