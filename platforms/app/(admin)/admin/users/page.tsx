import { getAllAdminUsers, getActivityLog } from '@/lib/user-management';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, UserPlus, Activity, Clock } from 'lucide-react';
import { rootDomain } from '@/lib/utils';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { ActivityLogTable } from '@/components/admin/activity-log-table';
import { UserManagementClient } from './user-management-client';

export const metadata: Metadata = {
  title: `User Management | ${rootDomain}`,
  description: `Manage administrative users and view activity logs for ${rootDomain}`
};

export default async function UsersPage() {
  let users: Awaited<ReturnType<typeof getAllAdminUsers>> = [];
  let activities: Awaited<ReturnType<typeof getActivityLog>> = [];
  let error: string | null = null;

  try {
    // Fetch both users and activity logs
    [users, activities] = await Promise.all([
      getAllAdminUsers(),
      getActivityLog(100), // Get last 100 activities
    ]);
  } catch (err) {
    console.error('Error fetching user management data:', err);
    error = 'Failed to load user management data. Please check your database connection.';
    users = [];
    activities = [];
  }

  // Calculate stats
  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'Active').length,
    pending: users.filter(u => u.status === 'Pending').length,
    recentActivity: activities.filter(a => {
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      return a.timestamp > dayAgo;
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-gray-600 mt-1">
            Manage platform administrators, send invitations, and monitor administrative activity.
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
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All administrators</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Active users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <UserPlus className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending invitations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity (24h)</CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentActivity}</div>
            <p className="text-xs text-muted-foreground">Recent actions</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Administrative Users & Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="users" className="w-full">
            <div className="px-6 pt-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
                <TabsTrigger value="activity">Activity Log ({activities.length})</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="users" className="mt-0 p-6">
              <UserManagementClient 
                users={users} 
                activities={activities}
              />
            </TabsContent>
            
            <TabsContent value="activity" className="mt-0 p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  Showing last {activities.length} administrative actions
                </div>
                <ActivityLogTable activities={activities} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}