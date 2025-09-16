'use client';

import { 
  Eye, 
  UserX, 
  Shield,
  Mail
} from 'lucide-react';
import { AdminUser, AdminRole, UserStatus } from '@/lib/types';
import { DataTableCell } from '@/cells/ui/DataTable/src/client';
import { StatusBadgeCell } from '@/cells/ui/StatusBadge/src/client';
import { InfoCardCell } from '@/cells/ui/InfoCard/src/client';
import type { TableColumn, TableAction } from '@/cells/ui/types';

interface AdminUsersTableProps {
  users: AdminUser[];
  onStatusChange?: (userId: string, status: UserStatus) => Promise<void>;
  onViewDetails?: (user: AdminUser) => void;
}

export function AdminUsersTable({ users, onStatusChange, onViewDetails }: AdminUsersTableProps) {
  // Define table columns using the new DataTable cell structure
  const columns: TableColumn[] = [
    {
      key: 'name',
      label: 'Name',
      render: (value, user) => (
        <div className="font-medium">{user.name}</div>
      )
    },
    {
      key: 'email',
      label: 'Email',
      render: (value, user) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-400" />
          {user.email}
        </div>
      ),
      mobileLabel: 'Email'
    },
    {
      key: 'role',
      label: 'Role',
      render: (value, user) => (
        <StatusBadgeCell type="role" value={user.role} />
      ),
      mobileLabel: 'Role'
    },
    {
      key: 'status',
      label: 'Status',
      render: (value, user) => (
        <StatusBadgeCell type="status" value={user.status} />
      ),
      mobileLabel: 'Status'
    },
    {
      key: 'invitedBy',
      label: 'Invited By',
      render: (value, user) => (
        <span className="text-sm text-gray-500">{user.invitedBy}</span>
      ),
      hiddenOnMobile: true
    },
    {
      key: 'lastActive',
      label: 'Last Active',
      render: (value, user) => (
        <span className="text-sm text-gray-500">
          {user.lastActive 
            ? new Date(user.lastActive).toLocaleDateString()
            : 'Never'
          }
        </span>
      ),
      hiddenOnMobile: true
    }
  ];

  // Define table actions
  const actions: TableAction[] = [
    {
      label: 'View Details',
      icon: <Eye className="h-4 w-4" />,
      onClick: (user) => {
        if (onViewDetails) {
          onViewDetails(user);
        } else {
          alert(`View details for ${user.name} (${user.email})`);
        }
      }
    },
    {
      label: 'Activate User',
      icon: <Shield className="h-4 w-4" />,
      variant: 'default',
      onClick: (user) => onStatusChange?.(user.id, 'Active'),
      hidden: (user) => user.status === 'Active' || user.status === 'Suspended'
    },
    {
      label: 'Suspend User',
      icon: <UserX className="h-4 w-4" />,
      variant: 'destructive',
      onClick: (user) => onStatusChange?.(user.id, 'Suspended'),
      hidden: (user) => user.status !== 'Active'
    }
  ];

  // Define empty state
  const emptyState = {
    icon: <Shield className="h-12 w-12 text-gray-400" />,
    title: 'No administrators found',
    description: 'Invite your first administrator to get started.'
  };

  return (
    <DataTableCell
      columns={columns}
      data={users}
      actions={actions}
      emptyState={emptyState}
      mobileCard={true}
    />
  );
}