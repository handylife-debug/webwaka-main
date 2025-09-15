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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  User, 
  Mail, 
  Shield, 
  Activity, 
  Settings, 
  Calendar,
  Clock,
  UserCheck,
  Edit3,
  Save,
  X,
  AlertTriangle
} from 'lucide-react';
import { AdminUser, AdminRole, UserStatus } from '@/lib/types';

interface UserActivity {
  id: string;
  action: string;
  description: string;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
}

interface UserPermission {
  id: string;
  name: string;
  description: string;
  granted: boolean;
  category: string;
}

interface UserDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onUpdate?: (userId: string, updates: any) => Promise<void>;
  onStatusChange?: (userId: string, status: UserStatus) => Promise<void>;
}

export function UserDetailsCell({ 
  isOpen, 
  onClose, 
  user, 
  onUpdate,
  onStatusChange 
}: UserDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<AdminUser>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);

  useEffect(() => {
    if (user && isOpen) {
      setEditData(user);
      // Simulate loading user activities and permissions
      setActivities([
        {
          id: '1',
          action: 'LOGIN',
          description: 'Logged into admin dashboard',
          timestamp: Date.now() - 30 * 60 * 1000,
          ipAddress: '192.168.1.100'
        },
        {
          id: '2', 
          action: 'UPDATE_TENANT',
          description: 'Updated tenant configuration for acme-corp',
          timestamp: Date.now() - 2 * 60 * 60 * 1000,
          ipAddress: '192.168.1.100'
        },
        {
          id: '3',
          action: 'CREATE_USER',
          description: 'Invited new admin user',
          timestamp: Date.now() - 4 * 60 * 60 * 1000,
          ipAddress: '192.168.1.100'
        }
      ]);

      setPermissions([
        {
          id: 'view_tenants',
          name: 'View Tenants',
          description: 'Access to view tenant list and details',
          granted: true,
          category: 'Tenants'
        },
        {
          id: 'manage_tenants',
          name: 'Manage Tenants',
          description: 'Create, update, and delete tenants',
          granted: user.role === 'SuperAdmin',
          category: 'Tenants'
        },
        {
          id: 'view_users',
          name: 'View Users',
          description: 'Access to view user list and details',
          granted: true,
          category: 'Users'
        },
        {
          id: 'manage_users',
          name: 'Manage Users',
          description: 'Create, update, and delete users',
          granted: user.role === 'SuperAdmin',
          category: 'Users'
        },
        {
          id: 'view_analytics',
          name: 'View Analytics',
          description: 'Access to analytics and reports',
          granted: true,
          category: 'Analytics'
        },
        {
          id: 'manage_plans',
          name: 'Manage Plans',
          description: 'Create and modify subscription plans',
          granted: user.role === 'SuperAdmin',
          category: 'Billing'
        },
        {
          id: 'view_credentials',
          name: 'View Credentials',
          description: 'Access to view API credentials status',
          granted: user.role === 'SuperAdmin',
          category: 'Security'
        }
      ]);
    }
  }, [user, isOpen]);

  const handleSave = async () => {
    if (!user || !onUpdate) return;
    
    setIsLoading(true);
    try {
      await onUpdate(user.id, editData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (status: UserStatus) => {
    if (!user || !onStatusChange) return;
    
    setIsLoading(true);
    try {
      await onStatusChange(user.id, status);
    } catch (error) {
      console.error('Failed to update user status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-blue-100 text-blue-800';
      case 'Suspended': return 'bg-red-100 text-red-800';
      case 'Inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleColor = (role: AdminRole) => {
    switch (role) {
      case 'SuperAdmin': return 'bg-purple-100 text-purple-800';
      case 'Admin': return 'bg-blue-100 text-blue-800';
      case 'FinanceAdmin': return 'bg-green-100 text-green-800';
      case 'SupportStaff': return 'bg-yellow-100 text-yellow-800';
      case 'ContentModerator': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <User className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-semibold">{user.name}</h2>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge className={getStatusColor(user.status)}>
                {user.status}
              </Badge>
              <Badge className={getRoleColor(user.role)}>
                {user.role}
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                disabled={isLoading}
              >
                {isEditing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* User Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  User Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={editData.name || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={editData.email || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <select
                        id="role"
                        value={editData.role || user.role}
                        onChange={(e) => setEditData(prev => ({ ...prev, role: e.target.value as AdminRole }))}
                        className="w-full px-3 py-2 border rounded-md bg-white"
                      >
                        <option value="ContentModerator">Content Moderator</option>
                        <option value="SupportStaff">Support Staff</option>
                        <option value="FinanceAdmin">Finance Admin</option>
                        <option value="Admin">Admin</option>
                        <option value="SuperAdmin">SuperAdmin</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Button onClick={handleSave} disabled={isLoading}>
                        <Save className="h-4 w-4 mr-2" />
                        {isLoading ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Full Name</p>
                      <p className="font-medium">{user.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email Address</p>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <p className="font-medium">{user.email}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Role</p>
                      <Badge className={getRoleColor(user.role)}>
                        {user.role}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <Badge className={getStatusColor(user.status)}>
                        {user.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Member Since</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <p className="font-medium">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Invited By</p>
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-gray-400" />
                        <p className="font-medium">{user.invitedBy}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {user.status !== 'Active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange('Active')}
                      disabled={isLoading}
                    >
                      Activate User
                    </Button>
                  )}
                  {user.status !== 'Suspended' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange('Suspended')}
                      disabled={isLoading}
                      className="text-red-600 hover:text-red-700"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Suspend User
                    </Button>
                  )}
                  <Button variant="outline" size="sm">
                    Reset Password
                  </Button>
                  <Button variant="outline" size="sm">
                    Resend Invitation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-b-0">
                      <div className="mt-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{activity.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(activity.timestamp)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {activity.action}
                            </Badge>
                          </div>
                          {activity.ipAddress && (
                            <span>IP: {activity.ipAddress}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(
                    permissions.reduce((acc, permission) => {
                      if (!acc[permission.category]) acc[permission.category] = [];
                      acc[permission.category].push(permission);
                      return acc;
                    }, {} as Record<string, UserPermission[]>)
                  ).map(([category, categoryPermissions]) => (
                    <div key={category}>
                      <h4 className="font-medium text-sm text-gray-700 mb-2">{category}</h4>
                      <div className="space-y-2 ml-4">
                        {categoryPermissions.map((permission) => (
                          <div key={permission.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{permission.name}</p>
                              <p className="text-xs text-gray-500">{permission.description}</p>
                            </div>
                            <Switch
                              checked={permission.granted}
                              disabled={true}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  User Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-sm text-gray-500">Receive email notifications about system updates</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">SMS Notifications</p>
                      <p className="text-sm text-gray-500">Receive SMS alerts for critical issues</p>
                    </div>
                    <Switch />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-gray-500">Add extra security to your account</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}