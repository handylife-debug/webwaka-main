import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Shield, UserPlus, Activity } from 'lucide-react';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `User Management | ${rootDomain}`,
  description: `Manage users and permissions for ${rootDomain}`
};

// Mock user data - replace with real data from your user management system
const mockUsers = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'SuperAdmin',
    status: 'Active',
    lastActive: new Date('2024-01-15'),
    tenant: 'Global',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@tenant1.example.com',
    role: 'Admin',
    status: 'Active',
    lastActive: new Date('2024-01-14'),
    tenant: 'tenant1',
  },
  {
    id: '3',
    name: 'Bob Wilson',
    email: 'bob@tenant2.example.com',
    role: 'User',
    status: 'Inactive',
    lastActive: new Date('2024-01-10'),
    tenant: 'tenant2',
  },
];

function getRoleColor(role: string) {
  switch (role) {
    case 'SuperAdmin':
      return 'bg-red-100 text-red-800';
    case 'Admin':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getStatusColor(status: string) {
  return status === 'Active' 
    ? 'bg-green-100 text-green-800'
    : 'bg-gray-100 text-gray-800';
}

export default function UsersPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-gray-600 mt-1">
            Manage user accounts, roles, and permissions across your platform.
          </p>
        </div>
        <Button className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Add New User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockUsers.length}</div>
            <p className="text-xs text-muted-foreground">Across all tenants</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockUsers.filter(u => u.status === 'Active').length}
            </div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockUsers.filter(u => u.role === 'SuperAdmin').length}
            </div>
            <p className="text-xs text-muted-foreground">System administrators</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockUsers.filter(u => u.role === 'Admin').length}
            </div>
            <p className="text-xs text-muted-foreground">Tenant administrators</p>
          </CardContent>
        </Card>
      </div>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">{user.name}</h3>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                        {user.role}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(user.status)}`}>
                        {user.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        Tenant: {user.tenant}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Last active</p>
                    <p className="text-xs text-gray-400">
                      {user.lastActive.toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}