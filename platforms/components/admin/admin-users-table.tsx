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
  UserX, 
  Shield,
  Mail,
  Loader2
} from 'lucide-react';
import { AdminUser, AdminRole, UserStatus } from '@/lib/user-management';

interface AdminUsersTableProps {
  users: AdminUser[];
  onStatusChange?: (userId: string, status: UserStatus) => Promise<void>;
  onViewDetails?: (user: AdminUser) => void;
}

function getRoleColor(role: AdminRole): string {
  switch (role) {
    case 'SuperAdmin':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'Admin':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'FinanceAdmin':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'SupportStaff':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'ContentModerator':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getStatusColor(status: UserStatus): string {
  switch (status) {
    case 'Active':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'Suspended':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'Inactive':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function AdminUsersTable({ users, onStatusChange, onViewDetails }: AdminUsersTableProps) {
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const handleStatusChange = async (userId: string, status: UserStatus) => {
    if (!onStatusChange) return;
    
    setLoadingActions(prev => ({ ...prev, [userId]: true }));
    try {
      await onStatusChange(userId, status);
    } finally {
      setLoadingActions(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleViewDetails = (user: AdminUser) => {
    if (onViewDetails) {
      onViewDetails(user);
    } else {
      alert(`View details for ${user.name} (${user.email})`);
    }
  };

  if (users.length === 0) {
    return (
      <div className="rounded-md border">
        <div className="p-8 text-center">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No administrators found</h3>
          <p className="text-gray-500">Invite your first administrator to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Invited By</TableHead>
            <TableHead>Last Active</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="font-medium">{user.name}</div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  {user.email}
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getRoleColor(user.role)}>
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(user.status)}>
                  {user.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-gray-500">
                {user.invitedBy}
              </TableCell>
              <TableCell className="text-sm text-gray-500">
                {user.lastActive 
                  ? new Date(user.lastActive).toLocaleDateString()
                  : 'Never'
                }
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      {loadingActions[user.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuItem
                      onClick={() => handleViewDetails(user)}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    
                    {user.status !== 'Active' && user.status !== 'Suspended' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(user.id, 'Active')}
                        className="flex items-center gap-2 text-green-600"
                      >
                        <Shield className="h-4 w-4" />
                        Activate User
                      </DropdownMenuItem>
                    )}
                    
                    {user.status === 'Active' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(user.id, 'Suspended')}
                        className="flex items-center gap-2 text-red-600"
                      >
                        <UserX className="h-4 w-4" />
                        Suspend User
                      </DropdownMenuItem>
                    )}
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